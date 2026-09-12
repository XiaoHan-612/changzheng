import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
const runtimePath = process.env.RUNTIME_CONFIG || path.join(__dirname, '..', 'runtime-config.json');

function readJsonFile(p) {
  try {
    if (!fs.existsSync(p)) return {};
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn(`[config] ${path.basename(p)} 解析失败，已按空配置继续：${err.message}`);
    return {};
  }
}

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) {
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      out[k] = v;
    }
  }
  return out;
}

const envFile = loadEnvFile(envPath);
const runtime = readJsonFile(runtimePath);

// runtime-config.json 可覆盖 .env（设置界面写入）
export const CONFIG = {
  GLM_API_URL:
    runtime.GLM_API_URL ||
    process.env.GLM_API_URL ||
    envFile.GLM_API_URL ||
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  GLM_API_KEY: runtime.GLM_API_KEY || process.env.GLM_API_KEY || envFile.GLM_API_KEY || '',
  // 赛制指定 glm-5.1；本机网络受限时用 .env 覆盖成 glm-5.3-flash 便于测试
  GLM_MODEL: runtime.GLM_MODEL || process.env.GLM_MODEL || envFile.GLM_MODEL || 'glm-5.1',
  // glm-5.3-flash 等模型「始终思考」：不设此值时 token 会被推理吃光、content 返回空。
  // low 实测 1.4s / 51 tokens 出 JSON；high|max 更慢更贵，按需在 .env 调。
  GLM_REASONING_EFFORT:
    runtime.GLM_REASONING_EFFORT || process.env.GLM_REASONING_EFFORT
    || envFile.GLM_REASONING_EFFORT || 'low',
  PORT: Number(process.env.PORT || envFile.PORT || 3001),
  LOG_DIR: process.env.LOG_DIR || path.join(__dirname, '..', 'logs'),
  // 没有兜底文案了，重试与超时要克制：最坏 25s + 0.6s + 25s ≈ 51s 就报错给用户重试
  MAX_RETRIES: 2,
  TIMEOUT_MS: 25000,
  runtimePath,
};

export function saveRuntimeConfig(patch) {
  const next = { ...runtime, ...patch };
  // 不把空字符串当成清除——允许显式清空 key 时传 null
  for (const k of Object.keys(next)) {
    if (next[k] === null || next[k] === undefined) delete next[k];
  }
  fs.writeFileSync(runtimePath, JSON.stringify(next, null, 2), 'utf8');
  Object.assign(runtime, next);
  if ('GLM_API_KEY' in patch) CONFIG.GLM_API_KEY = patch.GLM_API_KEY ?? CONFIG.GLM_API_KEY;
  if ('GLM_MODEL' in patch) CONFIG.GLM_MODEL = patch.GLM_MODEL ?? CONFIG.GLM_MODEL;
  if ('GLM_API_URL' in patch) CONFIG.GLM_API_URL = patch.GLM_API_URL ?? CONFIG.GLM_API_URL;
  if ('GLM_REASONING_EFFORT' in patch) CONFIG.GLM_REASONING_EFFORT = patch.GLM_REASONING_EFFORT ?? CONFIG.GLM_REASONING_EFFORT;
  if (patch.GLM_API_KEY === '') CONFIG.GLM_API_KEY = '';
  if (patch.GLM_MODEL === '') CONFIG.GLM_MODEL = 'glm-5.3-flash';
  return {
    model: CONFIG.GLM_MODEL,
    reasoningEffort: CONFIG.GLM_REASONING_EFFORT,
    hasKey: !!CONFIG.GLM_API_KEY,
    apiUrl: CONFIG.GLM_API_URL.replace(/\/[^/]*$/, '/***'),
    keyMask: CONFIG.GLM_API_KEY ? `${CONFIG.GLM_API_KEY.slice(0, 6)}…${CONFIG.GLM_API_KEY.slice(-4)}` : '',
  };
}
