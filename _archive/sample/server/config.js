// 天津移动 glm-5.1 配置
// 支持 .env 文件与环境变量
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) {
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

export const CONFIG = {
  // glm-5.1 接口地址（天津移动指定）
  GLM_API_URL: process.env.GLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  GLM_API_KEY: process.env.GLM_API_KEY || '',
  GLM_MODEL: process.env.GLM_MODEL || 'glm-5.1',
  // 无密钥时启用本地模拟决策（仅用于开发调试；正式演示必须接真实 glm-5.1）
  MOCK_AI: process.env.MOCK_AI === '1' || !process.env.GLM_API_KEY,
  PORT: process.env.PORT || 3000,
  LOG_DIR: process.env.LOG_DIR || './logs',
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000,
};
