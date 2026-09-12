import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';
import { callGlm51 } from './ai.js';
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

app.get('/api/logs', (_req, res) => {
  const logs = readSessionLogs();
  res.json({ ok: true, count: logs.length, logs });
});

app.post('/api/logs/clear', (_req, res) => {
  clearSessionLogs();
  res.json({ ok: true });
});

app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    model: CONFIG.GLM_MODEL,
    mockMode: CONFIG.MOCK_AI,
    port: CONFIG.PORT,
  });
});

app.get('/api/data/facts', (_req, res) => {
  const p = path.join(__dirname, '..', 'data', 'facts.json');
  if (fs.existsSync(p)) res.sendFile(p);
  else res.json({ ok: true, facts: {} });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(CONFIG.PORT, () => {
  console.log('══════════════════════════════════════════════');
  console.log('  《长征·抉择》草地章节 Demo');
  console.log(`  地址: http://localhost:${CONFIG.PORT}`);
  console.log(`  模型: ${CONFIG.GLM_MODEL}`);
  console.log(`  模式: ${CONFIG.MOCK_AI ? 'MOCK 演示（未配置 Key）' : 'GLM-5.1 真实调用'}`);
  console.log('══════════════════════════════════════════════');
});
