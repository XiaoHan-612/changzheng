// TTS 缓存验收：逐条向服务端 POST /api/tts，确认「文本+音色」能命中缓存文件，
// 并体检每个 wav 的采样率/声道/时长。命中不了就说明文件名哈希对不上。
// 用法：node scripts/check-tts.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const CACHE = path.join(ROOT, 'public/audio/cache');

async function ensureServer() {
  try {
    const r = await fetch(`${BASE}/api/config`);
    if (r.ok) return;
  } catch { /* start */ }
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: 'ignore', detached: true });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try {
      const r = await fetch(`${BASE}/api/config`);
      if (r.ok) return;
    } catch { /* retry */ }
  }
  throw new Error('无法启动服务');
}

function wavInfo(buf) {
  if (buf.slice(0, 4).toString() !== 'RIFF' || buf.slice(8, 12).toString() !== 'WAVE') return null;
  let off = 12;
  let fmt = null;
  let dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.slice(off, off + 4).toString('latin1');
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    }
    if (id === 'data') dataLen = size;
    off += 8 + size + (size % 2);
  }
  if (!fmt) return null;
  return { ...fmt, dur: dataLen / (fmt.rate * fmt.channels * (fmt.bits / 8)) };
}

const hashName = (text, voiceId) => {
  const voice = String(voiceId || 'default').replace(/[^\w-]/g, '') || 'default';
  return crypto.createHash('sha1').update(`${voice}|${text}`).digest('hex').slice(0, 16) + `_${voice}.wav`;
};

async function main() {
  await ensureServer();
  const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tts-lines.json'), 'utf8')).lines || [];
  // 可达性：台词文本必须真的出现在前端代码或史实卡里，
  // 否则文件生成了也不会被请求（真调暴露过：清单与代码文本不一致 → 21/24 白做）
  const appSource = [
    'public/js/main.js', 'public/js/minigames.js', 'public/js/sandbox.js',
    'public/js/ui.js', 'public/js/audio.js', 'data/facts.json',
  ].map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');
  const problems = [];
  const rows = [];

  for (const l of lines) {
    const name = hashName(l.text, l.voiceId);
    const file = path.join(CACHE, name);
    const exists = fs.existsSync(file);
    const info = exists ? wavInfo(fs.readFileSync(file)) : null;
    // 通过服务端验证（算法以服务端为准）
    let serverHit = false;
    let serverUrl = '';
    try {
      const r = await fetch(`${BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: l.text, voiceId: l.voiceId, actorId: l.actor }),
      });
      const j = await r.json();
      serverHit = !!j.url;
      serverUrl = j.url || '';
    } catch (e) {
      problems.push(`${l.id} 调用 /api/tts 失败：${e.message}`);
    }

    const reachable = appSource.includes(l.text);
    let verdict = '✅';
    if (!reachable) { verdict = '✗ 代码里没有这句'; problems.push(`${l.id} 的文本在代码/史实卡里找不到，永远不会被请求：${JSON.stringify(l.text.slice(0, 30))}`); }
    else if (!exists) { verdict = '✗ 文件缺失'; problems.push(`${name} 缺失（${l.id}）`); }
    else if (!info) { verdict = '✗ 不是 WAV'; problems.push(`${name} 不是合法 WAV`); }
    else if (!serverHit) { verdict = '✗ 未被 /api/tts 命中'; problems.push(`${l.id} 服务端未命中缓存（期望 ${name}，返回 ${serverUrl || 'null'}）`); }
    else if (info.channels !== 1) { verdict = '⚠ 非单声道'; problems.push(`${name} 是 ${info.channels} 声道，规格要求单声道`); }
    else if (![16000, 22050, 24000, 44100, 48000].includes(info.rate)) { verdict = '⚠ 采样率异常'; problems.push(`${name} 采样率 ${info.rate}`); }
    else if (info.dur < 0.4) { verdict = '⚠ 过短'; problems.push(`${name} 只有 ${info.dur.toFixed(2)}s`); }
    else if (info.dur > 20) { verdict = '⚠ 过长'; problems.push(`${name} 有 ${info.dur.toFixed(1)}s（应 ≤80 字，通常几秒）`); }

    rows.push({ id: l.id, actor: l.actor, voice: l.voiceId, name, dur: info ? info.dur : 0, rate: info ? info.rate : 0, verdict });
  }

  console.log('\n■ TTS 缓存验收（' + lines.length + ' 条）');
  console.log('  ' + 'id'.padEnd(20) + '说话人'.padEnd(10) + '音色'.padEnd(10) + '时长'.padEnd(8) + '采样'.padEnd(8) + '结论');
  for (const r of rows) {
    console.log('  ' + r.id.padEnd(18) + r.actor.padEnd(10) + r.voice.padEnd(10)
      + (r.dur ? r.dur.toFixed(1) + 's' : '—').padEnd(8) + (r.rate ? String(r.rate) : '—').padEnd(8) + r.verdict);
  }
  const files = fs.readdirSync(CACHE).filter((f) => f.endsWith('.wav'));
  const extra = files.filter((f) => !rows.some((r) => r.name === f));
  if (extra.length) console.log('\n  目录里还有 ' + extra.length + ' 个清单外的 wav：' + extra.join(', '));
  const total = files.reduce((s, f) => s + fs.statSync(path.join(CACHE, f)).size, 0);
  console.log('\n  缓存文件 ' + files.length + ' 个，合计 ' + (total / 1024 / 1024).toFixed(2) + ' MB');

  console.log('');
  if (problems.length) {
    console.log('发现 ' + problems.length + ' 个问题：');
    for (const p of problems) console.log('  ✗ ' + p);
    process.exit(1);
  }
  console.log('✓ TTS 缓存验收通过：' + lines.length + ' 条全部可达、被 /api/tts 命中，格式与时长合规');
}

main().catch((e) => { console.error('TTS 检查失败', e.message); process.exit(1); });
