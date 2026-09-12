// 交接就绪检查：确认交接文档齐备，且文档里的清单与代码里的契约一致。
// 用法：node scripts/check-handoff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const pick = (text, re) => [...new Set([...text.matchAll(re)].map((m) => m[1]))].sort();

const problems = [];
const ok = [];

function checkFiles() {
  const need = [
    'docs/HANDOFF-ART.md', 'docs/HANDOFF-AUDIO.md', 'docs/ASSETS.md',
    'docs/TTS-MANIFEST.md', 'docs/HANDOFF-CODE.md', 'docs/LOG-AUDIT.md',
    '../design/asset-prompts.md',
  ];
  for (const f of need) {
    if (fs.existsSync(path.join(ROOT, f))) ok.push('交接文件存在：' + f);
    else problems.push('缺少交接文件：' + f);
  }
}

// 文档表格里的 xxx.jpg 清单 vs main.js 的 preloadScenes()
function checkSceneDropin() {
  const main = read('public/js/main.js');
  const body = main.slice(main.indexOf('function preloadScenes'));
  const code = pick(body.slice(0, body.indexOf('].forEach')), /\/assets\/scenes\/([a-z_]+\.jpg)/g);
  const doc = pick(read('docs/HANDOFF-ART.md'), /^\| `([a-z_]+\.jpg)`/gm);
  const onlyCode = code.filter((x) => !doc.includes(x));
  const onlyDoc = doc.filter((x) => !code.includes(x));
  if (onlyDoc.length) problems.push('HANDOFF-ART 承诺自动生效但代码没预热：' + onlyDoc.join(', '));
  if (onlyCode.length) problems.push('代码会预热但 HANDOFF-ART 没写：' + onlyCode.join(', '));
  if (!onlyDoc.length && !onlyCode.length) ok.push('图片落盘即生效清单一致（' + code.length + ' 张）');
}

// 音频环境床：audio.js 的 AMBIENT_FILE vs HANDOFF-AUDIO 表格
function checkAmbient() {
  const code = pick(read('public/js/audio.js'), /'\/audio\/ambient\/([a-z_]+\.ogg)'/g);
  const doc = pick(read('docs/HANDOFF-AUDIO.md'), /`public\/audio\/ambient\/([a-z_]+\.ogg)`/g);
  const onlyDoc = doc.filter((x) => !code.includes(x));
  const onlyCode = code.filter((x) => !doc.includes(x));
  if (onlyDoc.length) problems.push('HANDOFF-AUDIO 列了但代码不加载：' + onlyDoc.join(', '));
  if (onlyCode.length) problems.push('代码会加载但 HANDOFF-AUDIO 没写：' + onlyCode.join(', '));
  if (!onlyDoc.length && !onlyCode.length) ok.push('环境床清单一致（' + code.length + ' 条）');
}

// TTS：data/tts-lines.json 的条数 vs TTS-MANIFEST 表格行数
function checkTts() {
  const lines = JSON.parse(read('data/tts-lines.json')).lines || [];
  const rows = pick(read('docs/TTS-MANIFEST.md'), /^\| ([a-z_]+) \|/gm).filter((x) => x !== 'id');
  if (rows.length !== lines.length) {
    problems.push('TTS 清单不同步：tts-lines.json ' + lines.length + ' 条 vs TTS-MANIFEST '
      + rows.length + ' 行（改台词后跑 npm run tts:manifest）');
  } else {
    ok.push('TTS 清单同步（' + lines.length + ' 条，含哈希文件名）');
  }
}

checkFiles();
checkSceneDropin();
checkAmbient();
checkTts();

console.log('交接就绪检查：');
for (const o of ok) console.log('  ✓ ' + o);
for (const p of problems) console.log('  ✗ ' + p);
console.log(problems.length ? '\n未就绪：' + problems.length + ' 项' : '\n可以交接：文档齐备且与代码一致');
process.exit(problems.length ? 1 : 0);
