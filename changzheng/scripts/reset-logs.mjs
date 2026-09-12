import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logs = path.join(root, 'logs');
fs.mkdirSync(logs, { recursive: true });
for (const f of fs.readdirSync(logs)) {
  if (f.endsWith('.jsonl')) fs.writeFileSync(path.join(logs, f), '');
}
console.log('logs cleared');
