/**
 * 打不开排查：无 Playwright 时用 Node 做静态/HTTP 体检。
 * node tests/manual/check-open.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const publicDir = path.join(root, 'public');
const base = process.env.BASE || 'http://127.0.0.1:3001';

const issues = [];

function walkImports(file, seen = new Set()) {
  const abs = path.resolve(file);
  if (seen.has(abs)) return seen;
  if (!fs.existsSync(abs)) {
    issues.push(`文件不存在: ${abs}`);
    return seen;
  }
  seen.add(abs);
  const src = fs.readFileSync(abs, 'utf8');
  const re = /(?:import|export)\s+[^'";]*from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith('.')) continue;
    const next = path.resolve(path.dirname(abs), spec);
    walkImports(next, seen);
  }
  return seen;
}

// 1) index.html 里挂的入口脚本
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((x) => x[1]);
console.log('index scripts:', scripts.join(', ') || '(无，应走 module type=module)');
const mainTag = /type=["']module["'][^>]*src=["']([^"']+)["']/.exec(html) || /src=["']([^"']*main\.js)["']/.exec(html);
if (!mainTag) issues.push('index.html 里找不到 main.js 入口');
else console.log('entry:', mainTag[1]);

// 2) 从 main.js 扫 import 图
const mainPath = path.join(publicDir, 'js', 'main.js');
const files = [...walkImports(mainPath)];
console.log('import graph files:', files.length);
for (const f of files) {
  const rel = path.relative(publicDir, f).split(path.sep).join('/');
  if (!fs.existsSync(f)) issues.push(`import 目标缺失: ${rel}`);
}

// 3) HTTP 抽检
async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const buf = await res.arrayBuffer();
    return { status: res.status, bytes: buf.byteLength };
  } catch (err) {
    return { status: 0, error: String(err.message || err) };
  }
}

const urls = ['/', '/js/main.js', '/js/flow/act.js', '/js/flow/games-flow.js', '/js/ui.js', '/api/data/acts', '/api/config'];
console.log('\nHTTP', base);
for (const u of urls) {
  const r = await probe(base + u);
  console.log(u, r.status || r.error, r.bytes ?? '');
  if (r.status !== 200) issues.push(`HTTP ${u} => ${r.status || r.error}`);
}

// 4) 关键导出是否存在（源码层）
const checks = [
  ['public/js/ui.js', ['registerLiveTyping', 'skipTyping', 'typeText']],
  ['public/js/flow/echo.js', ['afterJudge', 'showEcho', 'closeEcho']],
  ['public/js/flow/games-flow.js', ['doSkim', 'doWeave', 'doAntiphony', 'doCipher', 'reviewOrFixed']],
  ['public/js/flow/act.js', ['startRun', 'enterCampDay', 'jumpToAct']],
  ['public/js/flow/end.js', ['runEnding', 'runFailure', 'bindEndActions']],
];
console.log('\nexports');
for (const [rel, names] of checks) {
  const src = fs.readFileSync(path.join(publicDir, rel.replace(/^public\//, '')), 'utf8');
  for (const n of names) {
    const ok = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${n}\\b`).test(src)
      || new RegExp(`export\\s*\\{[^}]*\\b${n}\\b`).test(src);
    console.log(ok ? 'OK' : 'MISSING', rel, n);
    if (!ok) issues.push(`缺少导出 ${rel} :: ${n}`);
  }
}

console.log('\n==== 结果 ====');
if (!issues.length) {
  console.log('未发现结构性问题。若浏览器仍打不开：用 http://127.0.0.1:3001/ 并 Ctrl+Shift+R 硬刷新。');
} else {
  for (const i of issues) console.log('!', i);
  process.exitCode = 1;
}
