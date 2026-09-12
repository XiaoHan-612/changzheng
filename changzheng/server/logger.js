import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';

const LOG_PATH = path.resolve(CONFIG.LOG_DIR);
if (!fs.existsSync(LOG_PATH)) fs.mkdirSync(LOG_PATH, { recursive: true });

const MAX_BYTES = 8 * 1024 * 1024; // 单文件上限，超了保留最后 2000 行

/** 防止日志无限增长：超过上限就截断为尾部若干行 */
function rotateIfNeeded(file) {
  try {
    if (!fs.existsSync(file)) return;
    if (fs.statSync(file).size <= MAX_BYTES) return;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(file, lines.slice(-2000).join('\n') + '\n', 'utf8');
  } catch { /* 轮转失败不影响主流程 */ }
}

function todayFile() {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return path.join(LOG_PATH, `ai-calls-${stamp}.jsonl`);
}

export function logAiCall(entry) {
  const record = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    model: CONFIG.GLM_MODEL,
    ...entry,
  };
  const day = todayFile();
  const session = path.join(LOG_PATH, 'session-full.jsonl');
  rotateIfNeeded(day);
  rotateIfNeeded(session);
  fs.appendFileSync(day, JSON.stringify(record) + '\n', 'utf8');
  fs.appendFileSync(session, JSON.stringify(record) + '\n', 'utf8');
  return record.id;
}

export function readSessionLogs() {
  const file = path.join(LOG_PATH, 'session-full.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function clearSessionLogs() {
  const file = path.join(LOG_PATH, 'session-full.jsonl');
  if (fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8');
}
