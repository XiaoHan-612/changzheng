// 清空运行日志：只清「运行产物」，入库的样本（logs/sample-*.jsonl）留着——
// 它是仓库的一部分，被这个脚本洗掉就等于把审计样本删了（2026-09-13 起）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logs = path.join(root, 'logs');
fs.mkdirSync(logs, { recursive: true });
let cleared = 0;
for (const f of fs.readdirSync(logs)) {
  if (!f.endsWith('.jsonl')) continue;
  if (f.startsWith('sample-')) continue;
  fs.writeFileSync(path.join(logs, f), '');
  cleared += 1;
}
console.log(`logs cleared（${cleared} 个运行文件；sample-*.jsonl 保留）`);
