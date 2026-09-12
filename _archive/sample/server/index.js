import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';
import { callGlm51 } from './ai.js';
import { readAllLogs, readSessionLogs, clearSessionLogs } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── AI 决策接口 ───
app.post('/api/decide', async (req, res) => {
  try {
    const { scene, situation, state, options, systemPrompt, extraContext, operation } = req.body || {};
    if (!scene) {
      return res.status(400).json({ error: '缺少 scene 参数' });
    }
    const result = await callGlm51({
      scene,
      situation: situation || '',
      state: state || {},
      options: options || [],
      systemPrompt,
      extraContext,
      operation: operation || null,
    });
    res.json({ ok: true, result });
  } catch (err) {
    console.error('AI 决策失败:', err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// ─── 日志接口 ───
app.get('/api/logs', (req, res) => {
  const scope = req.query.scope || 'session';
  const logs = scope === 'all' ? readAllLogs() : readSessionLogs();
  res.json({ ok: true, count: logs.length, logs });
});

app.post('/api/logs/clear', (_req, res) => {
  clearSessionLogs();
  res.json({ ok: true });
});

// ─── 配置信息（前端展示用，不含密钥） ───
app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    model: CONFIG.GLM_MODEL,
    mockMode: CONFIG.MOCK_AI,
    apiUrl: CONFIG.GLM_API_URL.replace(/\/[^/]*$/, '/***'),
  });
});

// ─── 游戏数据 ───
app.get('/api/data/chapter', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'data', 'chapter.json'));
});

app.get('/api/data/facts', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'data', 'facts.json'));
});

// ─── SPA 回退 ───
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(CONFIG.PORT, () => {
  console.log('══════════════════════════════════════════════');
  console.log('  《星火微光 · 我路过他们的长征》服务已启动');
  console.log(`  地址: http://localhost:${CONFIG.PORT}`);
  console.log(`  模型: ${CONFIG.GLM_MODEL}`);
  console.log(`  模式: ${CONFIG.MOCK_AI ? '本地模拟（请配置 GLM_API_KEY）' : 'glm-5.1 真实调用'}`);
  console.log('══════════════════════════════════════════════');
});
