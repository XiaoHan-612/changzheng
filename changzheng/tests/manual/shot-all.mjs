/**
 * 逐屏截图：视觉体检用。输出到 logs/shots/*.png
 * 用法：PORT=3011 node tests/manual/shot-all.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.PORT || '3011';
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, 'logs', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT, HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write(d));
server.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.error('PAGE', e.message));
// 打开调试摆屏入口（localStorage 优先于代码默认）
await page.addInitScript(() => { try { localStorage.setItem('czjc_devtools', '1'); } catch {} });

async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log('shot', name);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await shot('01-title');

// 开一局研学（不真调太多：出身后立刻用 dev 摆屏）
await page.click('#btn-start-study, [data-action="start-study"], text=研学模式').catch(() => {});
// 按钮可能在 title-card 里
const study = page.locator('button', { hasText: '研学' }).first();
if (await study.count()) await study.click();
await page.waitForTimeout(1500);
await shot('02-after-start');

// 出身
const origin = page.locator('.blk-choice').first();
if (await origin.count()) {
  await origin.click();
  await page.waitForTimeout(800);
  await shot('03-origin-quiz');
  const q = page.locator('.blk-choice').first();
  if (await q.count()) await q.click();
  await page.waitForTimeout(600);
}
// 跳过可能的过场
for (let i = 0; i < 8; i++) {
  const skip = page.locator('#btn-cut-skip');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(300);
  } else break;
}
await page.waitForTimeout(800);
await shot('04-camp-or-stage');

// 用 dev 门面摆屏
await page.evaluate(() => {
  const s = window.__czScreens;
  if (!s) return;
  // 确保有局
});
// 若在营地
const camp = page.locator('#screen-camp:not(.hidden)');
if (await camp.count()) await shot('05-camp');

// 摆各屏
const screens = [
  ['journal', () => window.__czScreens?.journal?.()],
  ['facts', () => window.__czScreens?.facts?.()],
  ['settings', () => window.__czScreens?.settings?.()],
  ['defense', () => window.__czScreens?.defense?.()],
  ['logs', () => window.__czScreens?.logs?.()],
];
for (const [name, fn] of screens) {
  await page.evaluate(fn);
  await page.waitForTimeout(400);
  await shot(`06-${name}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

// 过场：题字 / 地图 / 诗
await page.evaluate(async () => {
  const cinema = window.__czKernel?.api?.('cinema') || window.__czModules?.cinema;
  // 通过 screens 没有 cinema；直接 emit 或用内核
});
// 用已知 play 入口：kernel.api cinema
await page.evaluate(async () => {
  const k = window.__czKernel;
  const api = k?.api?.('cinema');
  if (api?.play) {
    // 不要 await 完整序章——只起一段再截
    api.play('prologue-open');
  }
});
await page.waitForTimeout(1200);
await shot('07-cutscene-title');
await page.waitForTimeout(2500);
await shot('08-cutscene-map');
const skip2 = page.locator('#btn-cut-skip');
if (await skip2.isVisible().catch(() => false)) await skip2.click();
await page.waitForTimeout(400);

// 玩法板
await page.evaluate(() => window.__czScreens?.mini?.('mud-gomoku'));
await page.waitForTimeout(800);
await shot('09-board-gomoku');
await page.evaluate(() => window.__czScreens?.stage?.());
await page.waitForTimeout(300);

// 夜间
await page.evaluate(() => window.__czScreens?.night?.());
await page.waitForTimeout(1500);
await shot('10-night');

// 终局屏壳
await page.evaluate(() => window.__czScreens?.end?.());
await page.waitForTimeout(1000);
await shot('11-end');

// 对比度采样：读几个关键元素的 computed style
const contrast = await page.evaluate(() => {
  function lum(rgb) {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function parse(c) {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  }
  function ratio(fg, bg) {
    const L1 = lum([fg.r, fg.g, fg.b]);
    const L2 = lum([bg.r, bg.g, bg.b]);
    const a = Math.max(L1, L2);
    const b = Math.min(L1, L2);
    return (a + 0.05) / (b + 0.05);
  }
  const samples = [];
  const pick = (sel, label) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    // 找一个不透明的背景
    let bgEl = el;
    let bg = null;
    while (bgEl && bgEl !== document.documentElement) {
      const c = parse(getComputedStyle(bgEl).backgroundColor);
      if (c && c.a > 0.85) { bg = c; break; }
      bgEl = bgEl.parentElement;
    }
    if (!bg) bg = { r: 20, g: 16, b: 12, a: 1 };
    if (!fg) return;
    samples.push({
      label, sel,
      color: cs.color, bg: `rgb(${bg.r},${bg.g},${bg.b})`,
      fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      ratio: Math.round(ratio(fg, bg) * 100) / 100,
    });
  };
  pick('#end-title', '终局标题');
  pick('#end-paras p', '终局正文');
  pick('#end-personal', '终局寄语');
  pick('.muted', 'muted 类');
  pick('.blk-lead', 'blk-lead');
  pick('.hint', 'hint');
  pick('#night-lead', '夜间 lead');
  pick('.cut-caption', '过场字幕');
  pick('.title-card h1', '题字大字');
  pick('.title-card .subtitle', '题字副题');
  pick('.title-card .foot-note', '题字落款');
  pick('.poem-line', '诗句');
  pick('.blk-choice b', '选项主文案');
  pick('.blk-choice .ch-sub', '选项副文案');
  pick('#camp-hint', '营地提示');
  pick('.hud-label', 'HUD 标签');
  pick('.comp-aff', '同伴好感数字');
  return samples;
});
fs.writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify(contrast, null, 2));
console.log('contrast samples', contrast.length);
console.log(contrast.map((c) => `${c.ratio}\t${c.fontSize}\t${c.label}`).join('\n'));

await browser.close();
server.kill();
process.exit(0);
