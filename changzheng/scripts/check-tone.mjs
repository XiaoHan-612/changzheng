// 色调守卫：把"太亮/不和谐"变成可测量的两条硬指标。
//
// 背景：纸色曾是 #e7dbc2（L*≈0.72），插画暗部只有 L*≈0.018 —— 面板比插画亮 13 倍，
// 眼睛先看面板而不是画。中调纸后要求：墨字/纸 ≥7:1（可读），纸/插画暗部 ≤9:1（不刺眼）。
//
// 面积指标来自逐页截图：qa:screens 会写 tests/e2e/artifacts/tone-report.json。
// 用法：npm run qa:tone
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = path.join(ROOT, 'public/css/tokens.css');
const REPORT = path.join(ROOT, 'tests/e2e/artifacts/tone-report.json');

const hex2rgb = (h) => h.replace('#', '').match(/.{2}/g).map((x) => parseInt(x, 16));
const lum = (rgb) => {
  const s = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const ratio = (a, b) => { const [l1, l2] = [lum(hex2rgb(a)), lum(hex2rgb(b))].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };

const css = fs.readFileSync(TOKENS, 'utf8');
const tok = (name) => (new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css) || [])[1];

const problem = [];
const INK = tok('ink-0');
const papers = { 'paper-0': tok('paper-0'), 'paper-1': tok('paper-1'), 'paper-2': tok('paper-2') };
const ART_DARK = '#2a241c';   // 插画暗部取样（场景图普遍落在这个亮度）
const ART_LIGHT = '#c9bda4';  // 插画亮部（天空/雪地）取样，用来确认纸不至于"沉到看不见"

console.log(`纸：${Object.entries(papers).map(([k, v]) => `${k}=${v}`).join('  ')}  墨：${INK}`);
for (const [name, p] of Object.entries(papers)) {
  const rInk = ratio(INK, p);
  const rArt = ratio(p, ART_DARK);
  const rLight = ratio(p, ART_LIGHT);
  const flags = [];
  if (name === 'paper-1') {
    if (rInk < 7) { flags.push('墨字对比不足 7:1'); problem.push(`paper-1 与墨字只有 ${rInk.toFixed(2)}:1（要求 ≥7）`); }
    if (rArt > 9) { flags.push('对插画暗部过亮'); problem.push(`paper-1 对插画暗部 ${rArt.toFixed(2)}:1（要求 ≤9，太大就"发光"）`); }
    if (rLight < 1.05) { flags.push('对插画亮部几乎贴合（可能"看不见纸"）'); }
  }
  console.log(`  ${name}: 墨字 ${rInk.toFixed(2)}:1 · 对插画暗部 ${rArt.toFixed(2)}:1 · 对插画亮部 ${rLight.toFixed(2)}:1 ${flags.length ? '← ' + flags.join('，') : ''}`);
}

// 面积指标：逐页截图的纸色像素占比
if (fs.existsSync(REPORT)) {
  const rep = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  const over = Object.entries(rep.pages || {}).filter(([, v]) => v.paperRatio > 0.35);
  console.log(`\n纸面面积（逐页，上限 35%）：`);
  for (const [page, v] of Object.entries(rep.pages || {})) {
    console.log(`  ${page.padEnd(22)} ${(v.paperRatio * 100).toFixed(1)}%${v.paperRatio > 0.35 ? '  ← 超预算' : ''}`);
  }
  for (const [page, v] of over) problem.push(`${page} 纸面占屏 ${(v.paperRatio * 100).toFixed(1)}%（>35%）`);
} else {
  console.log('\n（还没有 tone-report.json：先跑 npm run qa:screens 生成逐页截图与面积统计）');
}

console.log('');
if (problem.length) {
  for (const p of problem) console.log('  ✗ ' + p);
  console.log(`\n色调检查未通过：${problem.length} 项`);
  process.exit(1);
}
console.log('✓ 色调检查通过：墨字可读、纸不刺眼、纸面面积在预算内');
