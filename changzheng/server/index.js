import express from 'express';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { CONFIG, saveRuntimeConfig, assertSafeApiUrl } from './config.js';
import { callGlm51, probeGlm } from './ai.js';
import { readSessionLogs, clearSessionLogs } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 代码指纹：server/*.js 的最新修改时间。测试用它判断"端口上跑的是不是当前代码"——
// 早先复用旧进程导致服务端改动在测试里不生效，测出来的绿色是假绿。
const CODE_STAMP = Math.max(...fs.readdirSync(__dirname).filter((f) => f.endsWith('.js'))
  .map((f) => fs.statSync(path.join(__dirname, f)).mtimeMs));
const app = express();
app.use(express.json({ limit: '1mb' }));

/**
 * 「只允许本机」的守门人：给设置、日志这类**本机运维接口**用。
 *
 * 为什么需要：演示机常常开在会场/办公室的局域网里，而 `/api/config` 能读到掩码后的 Key 与接口、
 * `/api/logs` 能读到整局的行为日志、`/api/logs/clear` 还能把证据清掉——这些只该由坐在机器前面的人碰。
 * 判据是 TCP 层的 remoteAddress（`::ffff:127.0.0.1` 是 IPv4 映射写法，一并认）。
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function localOnly(req, res, next) {
  const addr = req.socket?.remoteAddress || '';
  if (LOOPBACK.has(addr)) return next();
  res.status(403).json({ ok: false, error: '该接口只允许本机访问（127.0.0.1 / ::1）' });
}

// 文本响应 gzip（无第三方依赖）：只压缩 >1KB 的 text/json/js/css/svg
app.use((req, res, next) => {
  if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return next();
  const end = res.end.bind(res);
  res.end = (chunk, enc, cb) => {
    try {
      const type = String(res.getHeader('Content-Type') || '');
      if (chunk && !res.getHeader('Content-Encoding') && /(text|javascript|json|css|svg)/.test(type)) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8');
        if (buf.length > 1024) {
          const gz = zlib.gzipSync(buf);
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Content-Length', String(gz.length));
          return end(gz, undefined, cb);
        }
      }
    } catch { /* 压缩失败就原样发送 */ }
    return end(chunk, enc, cb);
  };
  next();
});

// 静态资源缓存：**默认每次都回源校验（304），只有字体给长缓存**。
//
// 为什么不给 max-age：这个项目没有构建步骤，承诺是"改文件/换素材，刷新即生效"。
// 一旦给了 1h / 7d，浏览器就会拿着旧脚本旧图跑——实测踩过：改了 audio.js 刷新页面，
// 跑的还是缓存里的旧代码，排查半天以为修复没生效。ETag/Last-Modified 本来就会发 304，
// 本地演示的开销可以忽略；要提速再按内容哈希改名（那时才可以放心长缓存）。
const PUB = path.join(__dirname, '..', 'public');
app.use('/assets', express.static(path.join(PUB, 'assets')));
app.use('/audio', express.static(path.join(PUB, 'audio')));
// 自托管字体：改动极少（只有重跑 fonts:build 才会变），7 天缓存是有意为之，文档里也这么写
app.use('/fonts', express.static(path.join(PUB, 'fonts'), { maxAge: '7d' }));
app.use(express.static(PUB));

app.post('/api/decide', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.scene) return res.status(400).json({ ok: false, error: '缺少 scene' });
    const result = await callGlm51(body);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('AI 决策失败:', err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/api/logs', localOnly, (_req, res) => {
  const logs = readSessionLogs();
  res.json({ ok: true, count: logs.length, logs });
});

app.post('/api/logs/clear', localOnly, (_req, res) => {
  clearSessionLogs();
  res.json({ ok: true, count: 0 });
});

app.get('/api/config', localOnly, (_req, res) => {
  const models = ['glm-5.1', 'glm-5.3-flash', 'glm-4-plus', 'glm-4-air', 'glm-4-flash'];
  if (!models.includes(CONFIG.GLM_MODEL)) models.unshift(CONFIG.GLM_MODEL);
  res.json({
    ok: true,
    model: CONFIG.GLM_MODEL,
    reasoningEffort: CONFIG.GLM_REASONING_EFFORT,
    hasKey: !!CONFIG.GLM_API_KEY,
    pid: process.pid,
    codeStamp: CODE_STAMP,
    port: CONFIG.PORT,
    apiUrl: CONFIG.GLM_API_URL.replace(/\/[^/]*$/, '/***'),
    // 只回传掩码，不回传完整 key
    keyMask: CONFIG.GLM_API_KEY
      ? CONFIG.GLM_API_KEY.slice(0, 6) + '…' + CONFIG.GLM_API_KEY.slice(-4)
      : '',
    availableModels: models,
    availableReasoningEfforts: ['low', 'high', 'max'],
  });
});

// ─── 语音合成（表现层，不是「AI 决策」）───
// 只服务 public/audio/cache/ 里已存在的音色文件（由音频模型离线生成，文件名 = hash_voice.wav）；
// 没有缓存就静默降级，绝不阻塞流程（策划案 §2.6.2）。
app.post('/api/tts', (req, res) => {
  const { text = '', voiceId = 'default', actorId = '' } = req.body || {};
  const t = String(text).trim();
  if (!t) return res.status(400).json({ ok: false, error: '缺少 text' });
  const voice = String(voiceId || 'default').replace(/[^\w-]/g, '') || 'default';
  const hash = crypto.createHash('sha1').update(`${voice}|${t}`).digest('hex').slice(0, 16);
  const name = `${hash}_${voice}.wav`;
  const file = path.join(PUB, 'audio', 'cache', name);
  if (fs.existsSync(file)) {
    return res.json({ ok: true, url: `/audio/cache/${name}`, source: 'CACHE', voiceId: voice, actorId });
  }
  res.json({ ok: true, url: null, source: 'NONE', reason: 'no-cached-voice', voiceId: voice, actorId });
});

// 设置：切换模型 / API Key / 接口
app.post('/api/config', localOnly, (req, res) => {
  try {
    const { model, apiKey, apiUrl, reasoningEffort } = req.body || {};
    const patch = {};
    if (typeof model === 'string') patch.GLM_MODEL = model.trim();
    // 改接口地址要过安全闸（https + host 白名单）：这是"本机已保存过的那个"唯一的改动入口，
    // 不加的话上面那些限制都能被"先存一个自己的地址"绕过去
    if (typeof apiUrl === 'string' && apiUrl.trim()) patch.GLM_API_URL = assertSafeApiUrl(apiUrl.trim());
    if (typeof apiKey === 'string') patch.GLM_API_KEY = apiKey.trim();
    if (typeof reasoningEffort === 'string') patch.GLM_REASONING_EFFORT = reasoningEffort.trim();
    const info = saveRuntimeConfig(patch);
    res.json({ ok: true, ...info });
  } catch (err) {
    res.status(400).json({ ok: false, error: String(err.message || err) });
  }
});

// 连通性测试
app.post('/api/config/test', async (req, res) => {
  try {
    // 用表单里的值直接测，不必先保存；只读探测，不写日志
    const { model, apiKey, apiUrl, reasoningEffort } = req.body || {};
    const probe = await probeGlm({ model, apiKey, apiUrl, reasoningEffort });
    res.json({ ok: true, probe });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// 数据文件服务：**白名单**，加新表就在这一行加名字。
// 不要写成"任意文件名"——那是目录穿越（`..%2f` 这类），而且漏了白名单就等于把 data/ 全暴露。
const DATA_FILES = ['facts', 'acts', 'poem'];
app.get('/api/data/:name', (req, res) => {
  const name = String(req.params.name || '').replace(/\.json$/i, '');
  if (!DATA_FILES.includes(name)) return res.status(404).json({ ok: false, error: 'no such data file' });
  const p = path.join(__dirname, '..', 'data', `${name}.json`);
  if (fs.existsSync(p)) return res.sendFile(p);
  res.json(name === 'acts' ? { ok: false, error: 'no acts' } : {});
});

// SPA 兜底：只对"页面路由"回 index.html。
// 静态资源/接口找不到必须 404 —— 否则缺图会伪装成 200，前端探测与素材核对全部失效。
app.get('*', (req, res, next) => {
  if (/^\/(assets|audio|css|js|favicon\.svg)/.test(req.path)) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `not found: ${req.method} ${req.path}` });
});

// 本机默认只绑 127.0.0.1：演示机常常在会场/公司局域网里，默认不该让整个网段都能打开它。
// 需要对外（例如手机看效果）就 `HOST=0.0.0.0 npm start`，自己清楚在做什么。
const HOST = process.env.HOST || '127.0.0.1';
app.listen(CONFIG.PORT, HOST, () => {
  console.log('══════════════════════════════════════════════');
  console.log('  《长征·抉择》正式工程 v0.1');
  console.log(`  地址: http://localhost:${CONFIG.PORT}　（只监听 ${HOST}）`);
  console.log(`  模型: ${CONFIG.GLM_MODEL}`);
  console.log(`  模式: ${CONFIG.GLM_API_KEY ? '真实调用 ' + CONFIG.GLM_MODEL : '⚠ 未配置 GLM_API_KEY（调用会报错并写日志）'}`);
  console.log('══════════════════════════════════════════════');
});
