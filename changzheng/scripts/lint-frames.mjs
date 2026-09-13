// 框架守卫：保证"页面只选模板、样式只在框架里"这条架构规则不被写坏。
//
// 三条规则：
//  1) index.html 里每个 #screen-* 必须带一个 tpl-* 模板类（7 选 1）
//  2) 组件 CSS 里不得出现 #screen-* 页面专属选择器（应为 0——样式归框架与组件层）
//  3) blk-* 区块样式只允许在 framework.css 里定义
//
// 用法：npm run qa:frames
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_DIR = path.join(ROOT, 'public/css');
const HTML = path.join(ROOT, 'public/index.html');
const TEMPLATES = ['tpl-title', 'tpl-panel', 'tpl-stage', 'tpl-side', 'tpl-board', 'tpl-drawer', 'tpl-world'];
const FRAMEWORK = 'framework.css';

const problems = [];
const ok = [];

// 1) 每个屏必须有模板类
const html = fs.readFileSync(HTML, 'utf8');
const sections = [...html.matchAll(/<section id="(screen-[a-z-]+)"([^>]*)>/g)];
if (!sections.length) problems.push('index.html 里没有找到 #screen-* 结构');
for (const [, id, attrs] of sections) {
  const cls = 'class="' + (attrs.match(/class="([^"]*)"/)?.[1] || '') + '"';
  const hit = TEMPLATES.filter((t) => new RegExp(`\\b${t}\\b`).test(cls));
  if (hit.length === 0) problems.push(`${id} 没有模板类（应为 ${TEMPLATES.join(' / ')} 之一）`);
  else if (hit.length > 1) problems.push(`${id} 同时挂了多个模板类：${hit.join(', ')}`);
}
if (!problems.length) ok.push(`17 个屏幕都有且只有一个模板类`);

// 2) 页面专属选择器必须为 0
let pageSelectors = 0;
for (const f of fs.readdirSync(CSS_DIR).filter((x) => x.endsWith('.css'))) {
  const text = fs.readFileSync(path.join(CSS_DIR, f), 'utf8');
  const hits = [...text.matchAll(/#screen-[a-z-]+/g)];
  if (hits.length) {
    pageSelectors += hits.length;
    problems.push(`${f} 里出现 ${hits.length} 处 #screen-* 页面专属选择器（样式应归模板与区块）`);
  }
}
if (!pageSelectors) ok.push('页面专属选择器为 0（样式全在框架与组件层）');

// 3) blk-* 只在 framework.css 定义
for (const f of fs.readdirSync(CSS_DIR).filter((x) => x.endsWith('.css') && x !== FRAMEWORK)) {
  const text = fs.readFileSync(path.join(CSS_DIR, f), 'utf8');
  const hits = [...text.matchAll(/\.blk-[a-z-]+/g)];
  if (hits.length) problems.push(`${f} 里定义了 ${hits.length} 处 .blk-* 区块样式（只允许在 ${FRAMEWORK}）`);
}
if (!problems.length) ok.push('区块样式只在 framework.css 定义');

console.log('框架检查：');
for (const o of ok) console.log('  ✓ ' + o);
for (const p of problems) console.log('  ✗ ' + p);
console.log(problems.length ? `\n未通过：${problems.length} 项` : '\n可以：页面只用模板与区块，样式单源');
process.exit(problems.length ? 1 : 0);
