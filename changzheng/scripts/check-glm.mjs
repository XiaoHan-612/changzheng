// 真调自检：确认 Key 可用、各模型能否调用、单次往返耗时。
// 用法：
//   node scripts/check-glm.mjs                          # 测 .env 里的 GLM_MODEL 与 glm-5.1
//   node scripts/check-glm.mjs glm-5.1 --url <接口> --key <密钥> [--timeout 15000]
//   node scripts/check-glm.mjs glm-5.3-flash --max-tokens 512 --thinking disabled
//   node scripts/check-glm.mjs glm-5.3-flash --extra thinking.type=low
//   node scripts/check-glm.mjs glm-5.3-flash --extra thinking.type=enabled,thinking.level=low
// 注意：--key 只从命令行读取，不会写入任何文件。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv();
const argv = process.argv.slice(2);
const flag = (name, dflt = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const key = flag('key') || process.env.GLM_API_KEY || env.GLM_API_KEY || '';
const url = flag('url') || process.env.GLM_API_URL || env.GLM_API_URL
  || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const timeoutMs = Number(flag('timeout', '15000')) || 15000;
const maxTokens = Number(flag('max-tokens', '64')) || 64;
const thinking = flag('thinking', '');
const modelArgs = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const models = modelArgs.length
  ? modelArgs
  : [...new Set([env.GLM_MODEL || 'glm-5.3-flash', 'glm-5.1'])];

if (!key) {
  console.error('没有读到 GLM_API_KEY（检查 changzheng/.env）');
  process.exit(1);
}

console.log(`接口：${url}`);
console.log(`Key ：${key.slice(0, 6)}…${key.slice(-4)}  超时 ${timeoutMs}ms\n`);

async function tcpProbe() {
  const { hostname, port } = new URL(url);
  const net = await import('node:net');
  const t0 = Date.now();
  return await new Promise((resolve) => {
    const sock = net.connect({ host: hostname, port: Number(port || 80) });
    const done = (ok, msg) => { try { sock.destroy(); } catch { /* ignore */ } resolve({ ok, ms: Date.now() - t0, msg }); };
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => done(true, 'TCP 可达'));
    sock.on('timeout', () => done(false, 'TCP 连接超时'));
    sock.on('error', (e) => done(false, `TCP 失败：${e.code || e.message}`));
  });
}

const tcp = await tcpProbe();
console.log(`${tcp.ok ? '✓' : '✗'} 连通性 ${tcp.ms}ms  ${tcp.msg}\n`);
if (!tcp.ok) {
  console.log('→ 网关不可达：确认是否连了内网/企业 VPN，或换成公网大模型接口。');
  process.exit(2);
}

async function probe(model) {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const payload = {
    model,
    messages: [{ role: 'user', content: '只返回 JSON，不要其他文字：{"ok":true,"model":"' + model + '"}' }],
    max_tokens: maxTokens,
    temperature: 0,
    response_format: { type: 'json_object' },
  };
  if (thinking) payload.thinking = { type: thinking };
  const extra = flag('extra', '');
  if (extra) {
    // 形如 a.b=值，多个用逗号分隔；值按 JSON 解析，失败则当字符串
    for (const pair of extra.split(',')) {
      const i = pair.indexOf('=');
      if (i < 0) { console.error(`--extra 片段无效：${pair}`); process.exit(1); }
      const pathParts = pair.slice(0, i).trim().split('.');
      const raw = pair.slice(i + 1).trim();
      let val;
      try { val = JSON.parse(raw); } catch { val = raw; }
      let cur = payload;
      for (const k of pathParts.slice(0, -1)) {
        cur[k] = cur[k] || {};
        cur = cur[k];
      }
      cur[pathParts[pathParts.length - 1]] = val;
    }
    console.log(`注入字段：${JSON.stringify(extra)}`);
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    const text = await res.text();
    if (!res.ok) {
      console.log(`✗ ${model.padEnd(16)} HTTP ${res.status}  ${ms}ms  ${text.slice(0, 160)}`);
      return false;
    }
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    const choice = body?.choices?.[0] || {};
    const content = choice?.message?.content ?? '';
    const reasoning = choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? '';
    const usage = body?.usage ? `tokens in/out ${body.usage.prompt_tokens}/${body.usage.completion_tokens}` : '';
    const ok = content.trim().length > 0;
    console.log(`${ok ? '✓' : '✗'} ${model.padEnd(16)} HTTP 200  ${String(ms).padStart(5)}ms  ${usage}  finish=${choice.finish_reason}`);
    console.log(`   content=${JSON.stringify(String(content).slice(0, 80))}`);
    if (!ok) {
      console.log(`   reasoning_content 长度=${String(reasoning).length}  message 字段=[${Object.keys(choice?.message || {}).join(', ')}]`);
      console.log(`   原始片段：${text.slice(0, 320).replace(/\s+/g, ' ')}`);
    }
    return ok;
  } catch (err) {
    clearTimeout(timer);
    console.log(`✗ ${model.padEnd(16)} ${Date.now() - t0}ms  网络/请求失败：${err.message}`);
    return false;
  }
}

let allOk = true;
for (const m of models) {
  const ok = await probe(m);
  if (!ok) allOk = false;
}
process.exitCode = allOk ? 0 : 1;
