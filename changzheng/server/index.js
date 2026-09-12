import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG, saveRuntimeConfig } from './config.js';
import { callGlm51 } from './ai.js';
import { callSim } from './sim.js';
import { readSessionLogs, clearSessionLogs } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

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

// ─── 自由行军沙盘 ───
app.post('/api/sim', async (req, res) => {
  try {
    const { world, action, intent } = req.body || {};
    if (!action || !String(action).trim()) {
      return res.status(400).json({ ok: false, error: '缺少 action' });
    }
    const result = await callSim({ world, action: String(action).slice(0, 200), intent });
    res.json({ ok: true, result });
  } catch (err) {
    console.error('沙盘失败:', err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/api/logs', (_req, res) => {
  const logs = readSessionLogs();
  res.json({ ok: true, count: logs.length, logs });
});

app.post('/api/logs/clear', (_req, res) => {
  clearSessionLogs();
  res.json({ ok: true, count: 0 });
});

app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    model: CONFIG.GLM_MODEL,
    mockMode: CONFIG.MOCK_AI,
    hasKey: !!CONFIG.GLM_API_KEY,
    port: CONFIG.PORT,
    apiUrl: CONFIG.GLM_API_URL.replace(/\/[^/]*$/, '/***'),
    // 只回传掩码，不回传完整 key
    keyMask: CONFIG.GLM_API_KEY
      ? CONFIG.GLM_API_KEY.slice(0, 6) + '…' + CONFIG.GLM_API_KEY.slice(-4)
      : '',
    availableModels: ['glm-5.3-flash', 'glm-5.1', 'glm-4-flash', 'glm-4-air', 'glm-4-plus'],
  });
});

// 设置：切换模型 / API Key / 接口
app.post('/api/config', (req, res) => {
  try {
    const { model, apiKey, apiUrl, mock } = req.body || {};
    const patch = {};
    if (typeof model === 'string') patch.GLM_MODEL = model.trim();
    if (typeof apiUrl === 'string' && apiUrl.trim()) patch.GLM_API_URL = apiUrl.trim();
    if (typeof apiKey === 'string') patch.GLM_API_KEY = apiKey.trim();
    if (mock === true) {
      patch.MOCK_AI = true;
      patch.GLM_API_KEY = '';
    } else if (mock === false) {
      patch.MOCK_AI = false;
    }
    // 填了新 Key 就认为要真调，自动解除 MOCK 锁定
    if (patch.GLM_API_KEY) patch.MOCK_AI = false;
    const info = saveRuntimeConfig(patch);
    res.json({ ok: true, ...info });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// 连通性测试
app.post('/api/config/test', async (_req, res) => {
  try {
    if (!CONFIG.GLM_API_KEY) {
      return res.json({ ok: true, mock: true, message: '未配置 Key，当前为 MOCK 模式' });
    }
    const t0 = Date.now();
    const r = await callGlm51({
      scene: '设置·连通性测试',
      callType: 'npc_chat',
      situation: '请只回复两个字：正常',
      state: { 体力: 70, 粮食: 5, 士气: 60, 信念: 70, 民心: 50 },
    });
    res.json({
      ok: true,
      mock: false,
      latencyMs: Date.now() - t0,
      source: r._fallback ? 'FALLBACK' : 'GLM',
      reply: (r.reply || r.narrative || '').slice(0, 40),
      model: CONFIG.GLM_MODEL,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/api/data/facts', (_req, res) => {
  const p = path.join(__dirname, '..', 'data', 'facts.json');
  if (fs.existsSync(p)) res.sendFile(p);
  else res.json({});
});

app.get('/api/data/acts', (_req, res) => {
  const p = path.join(__dirname, '..', 'data', 'acts.json');
  if (fs.existsSync(p)) res.sendFile(p);
  else res.json({ ok: false, error: 'no acts' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(CONFIG.PORT, () => {
  console.log('══════════════════════════════════════════════');
  console.log('  《长征·抉择》正式工程 v0.1');
  console.log(`  地址: http://localhost:${CONFIG.PORT}`);
  console.log(`  模型: ${CONFIG.GLM_MODEL}`);
  console.log(`  模式: ${CONFIG.MOCK_AI ? 'MOCK（未配置 Key）' : '真实调用 ' + CONFIG.GLM_MODEL}`);
  console.log('══════════════════════════════════════════════');
});
