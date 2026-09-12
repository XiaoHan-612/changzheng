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
  GLM_MODEL: runtime.GLM_MODEL || process.env.GLM_MODEL || envFile.GLM_MODEL || 'glm-5.3-flash',
  // 设置界面点过「MOCK 模式」后，即使 .env 里有 Key 也保持 MOCK，直到显式关闭
  MOCK_FLAG: runtime.MOCK_AI === true,
  get MOCK_AI() {
    return this.MOCK_FLAG === true || process.env.MOCK_AI === '1' || !this.GLM_API_KEY;
  },
  PORT: Number(process.env.PORT || envFile.PORT || 3001),
  LOG_DIR: process.env.LOG_DIR || path.join(__dirname, '..', 'logs'),
  MAX_RETRIES: 2,
  TIMEOUT_MS: 45000,
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
  if ('MOCK_AI' in patch) CONFIG.MOCK_FLAG = patch.MOCK_AI === true;
  if (patch.GLM_API_KEY === '') CONFIG.GLM_API_KEY = '';
  if (patch.GLM_MODEL === '') CONFIG.GLM_MODEL = 'glm-5.3-flash';
  return {
    model: CONFIG.GLM_MODEL,
    hasKey: !!CONFIG.GLM_API_KEY,
    mockMode: CONFIG.MOCK_AI,
    apiUrl: CONFIG.GLM_API_URL.replace(/\/[^/]*$/, '/***'),
  };
}
