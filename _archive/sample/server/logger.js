import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';

const LOG_PATH = path.resolve(CONFIG.LOG_DIR);

if (!fs.existsSync(LOG_PATH)) {
  fs.mkdirSync(LOG_PATH, { recursive: true });
}

function todayFile() {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return path.join(LOG_PATH, `ai-calls-${stamp}.jsonl`);
}

/**
 * 记录一次完整的 glm-5.1 调用日志
 * @param {object} entry
 */
export function logAiCall(entry) {
  const record = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    model: CONFIG.GLM_MODEL,
    ...entry,
  };

  const file = todayFile();
  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');

  // 同时维护一份完整会话日志
  const sessionFile = path.join(LOG_PATH, 'session-full.jsonl');
  fs.appendFileSync(sessionFile, JSON.stringify(record) + '\n', 'utf8');

  return record.id;
}

/**
 * 读取全部日志（供回放页面）
 */
export function readAllLogs() {
  const results = [];
  if (!fs.existsSync(LOG_PATH)) return results;

  const files = fs.readdirSync(LOG_PATH).filter((f) => f.endsWith('.jsonl'));
  for (const f of files) {
    const content = fs.readFileSync(path.join(LOG_PATH, f), 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        results.push(JSON.parse(line));
      } catch {
        // skip malformed
      }
    }
  }
  results.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return results;
}

/**
 * 读取当前会话日志
 */
export function readSessionLogs() {
  const file = path.join(LOG_PATH, 'session-full.jsonl');
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf8');
  return content
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

/**
 * 清空会话日志（新一局开始时调用）
 */
export function clearSessionLogs() {
  const file = path.join(LOG_PATH, 'session-full.jsonl');
  if (fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8');
}
