import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';

const LOG_PATH = path.resolve(CONFIG.LOG_DIR);
if (!fs.existsSync(LOG_PATH)) fs.mkdirSync(LOG_PATH, { recursive: true });

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
  fs.appendFileSync(todayFile(), JSON.stringify(record) + '\n', 'utf8');
  fs.appendFileSync(path.join(LOG_PATH, 'session-full.jsonl'), JSON.stringify(record) + '\n', 'utf8');
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
