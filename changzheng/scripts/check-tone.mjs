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

// 次要文字：主字够了，次要字也会"发虚看不清"（研学报告里那种说明句就吃过这个亏）。
//
// 为什么在这里而不是另开脚本：qa:tone 本来就是"字可读"这一条的归属地，比值算法也在这。
// 这一组守两件事：
//   ① 纸面上**允许**的那一档（--ink-note）必须够读（≥4.5，正文级）；
//   ② --muted 只许用在暗底——它是为暗底定的，落在纸上只有 1.86:1；而"纸面里自动换墨"
//      这件事必须真的写在 CSS 里（framework.css 的覆盖被删掉，纸面上的 .muted 会静默退回发虚）。
//   其余墨档只报数不判红（.blk-note 那类小字 4:1 上下属已知取舍，改它要动更多视觉）。
{
  const notes = {
    'ink-note（纸面次要文字）': tok('ink-note'),
    'ink-1': tok('ink-1'),
    'ink-2': tok('ink-2'),
    'muted（暗底次要文字）': tok('muted'),
  };
  const PAPER = tok('paper-1');
  const DARK = tok('bg');            // 暗底基准（墨纱/顶栏坐在它上面）
  console.log('\n次要文字对比度（纸面 paper-1 / 暗底 bg，正文级要求 ≥4.5）：');
  for (const [name, hex] of Object.entries(notes)) {
    if (!hex) { problem.push(`tokens.css 里找不到 ${name.split('（')[0]} 的色值`); continue; }
    const rp = ratio(hex, PAPER);
    const rd = ratio(hex, DARK);
    const flags = [];
    if (name.startsWith('ink-note')) {
      if (rp < 4.5) { flags.push('纸面上不够读'); problem.push(`--ink-note 对纸面只有 ${rp.toFixed(2)}:1（要求 ≥4.5）`); }
    }
    if (name.startsWith('muted')) {
      if (rd < 4.5) { flags.push('暗底上不够读'); problem.push(`--muted 对暗底只有 ${rd.toFixed(2)}:1（要求 ≥4.5）`); }
      if (rp >= 4.5) flags.push('（它现在纸上也够读了，可以考虑合并回一档）');
      else flags.push(`纸上仅 ${rp.toFixed(2)}:1 —— 靠材料切换兜住`);
    }
    console.log(`  ${name.padEnd(24)} 纸面 ${rp.toFixed(2)}:1 · 暗底 ${rd.toFixed(2)}:1 ${flags.length ? '← ' + flags.join('，') : ''}`);
  }
  const fw = fs.readFileSync(path.join(ROOT, 'public/css/framework.css'), 'utf8');
  if (!/--muted:\s*var\(--ink-note\)/.test(fw)) {
    problem.push('纸面材料没有把 --muted 换成 --ink-note（framework.css 那条覆盖被删了？纸面上的 .muted 会退回 1.86:1）');
  }
  if (!/--muted:\s*var\(--paper-dim\)/.test(fw)) {
    problem.push('墨纱材料没有把 --muted 换成 --paper-dim（墨纱里的次要文字会发黑看不清）');
  }
}

// ── 面积指标：逐页截图的纸色像素占比 ──
//
// 两套上限，按"这一页是读字还是动手玩"分：
//   · 阅读面板（手记/回响/答题/终局…）守 35% —— 纸面不能压过插画，眼睛要先看画；
//   · 玩法板（批次 4/5：打铁、钓鱼、夜校、分糖、夜岗、五子棋、泸定桥、陡坡、浮桥、渡口）
//     走 72% —— 这些页是**要动手玩的东西**：棋盘、河道、门板都得看得清、点得准，
//     按 35% 做出来玩法区只有 592px 宽（浮桥画布 460×240、五子棋 330×330），
//     1366×768 的笔记本上 9 支玩法有 8 支要滚动才能玩完。口径与 tokens.css 的
//     --panel-w-board / --panel-h-board 一致（2026-09-17 起）。
// 判页靠**批次号**（batches 由 qa:screens 写入报告），不靠页名猜——加玩法时只改 screen-sheet。
const BOARDS = { cap: 0.72, batches: new Set(['4', '5']) };
const READING = { cap: 0.35 };
if (fs.existsSync(REPORT)) {
  const rep = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  const boardPages = new Set(Object.entries(rep.batches || {})
    .filter(([b]) => BOARDS.batches.has(String(b)))
    .flatMap(([, names]) => names));
  const ruleOf = (page) => (boardPages.has(page) ? BOARDS : READING);
  const over = Object.entries(rep.pages || {}).filter(([page, v]) => v.paperRatio > ruleOf(page).cap);
  console.log(`\n纸面面积（逐页；阅读面板上限 35%，玩法板上限 ${Math.round(BOARDS.cap * 100)}%）：`);
  for (const [page, v] of Object.entries(rep.pages || {})) {
    const rule = ruleOf(page);
    console.log(`  ${page.padEnd(22)} ${(v.paperRatio * 100).toFixed(1)}%`
      + `${v.paperRatio > rule.cap ? '  ← 超预算' : ''}${rule === BOARDS ? '  (玩法板)' : ''}`);
  }
  for (const [page, v] of over) {
    problem.push(`${page} 纸面占屏 ${(v.paperRatio * 100).toFixed(1)}%（>${Math.round(ruleOf(page).cap * 100)}%）`);
  }
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
