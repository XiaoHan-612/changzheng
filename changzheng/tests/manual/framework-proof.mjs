// 框架样板图：把区块四态 + 7 个整页模板 + 亮度对照渲染成一张图，作为"改框架"的评审对象。
// 同时量出每个模板的纸面占比，写进 tone-report.json 供 `npm run qa:tone` 校验面积预算。
//
// 用法：npm run qa:proof
import { chromium } from 'playwright';
import { ensureServer, BASE } from '../e2e/lib/server.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = path.join(ROOT, 'tests/e2e/artifacts');
fs.mkdirSync(ART, { recursive: true });
const OUT = path.join(ART, 'framework-proof.png');
// 模板缩略图的占比单独一份文件：缩略只有 400×250，纸面比例必然被放大，
// 与"逐页面积预算"（screen-sheet.mjs 在 1280 真机上量、写 tone-report.json）不是同一把尺子。
// 早先两者写同一个文件的同名键，后跑的覆盖前一个，qa:tone 于是成了"最后跑谁看谁"。
const REPORT = path.join(ART, 'tone-report-templates.json');

await ensureServer();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${BASE}/dev/framework.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT, fullPage: true });

// 纸面占比：在每个模板缩略图上打网格采样，按"该点是否落在纸面元素上"统计。
// 口径：只用于模板之间横向比较（谁更"纸重"），不参与逐页 35% 预算判定。
// 为什么不用包围盒相加：嵌套元素的盒子会重复计算，纸面比例会被显著高估（踩过）。
const pages = await page.evaluate(async () => {
  // 三个纸色：paper-veil / paper-0 / paper-2（计算值可能带 alpha，所以按数值比较而不是字符串）
  const PAPER = [[196, 183, 156], [211, 199, 171], [179, 166, 140]];
  const parse = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(',').map((x) => parseFloat(x));
    return Number(a) < 0.5 ? null : [r, g, b];
  };
  const isPaper = (el, thumb) => {
    for (let n = el; n && n !== thumb.parentElement; n = n.parentElement) {
      const rgb = parse(getComputedStyle(n).backgroundColor);
      if (rgb && PAPER.some(([r, g, b]) => Math.abs(rgb[0] - r) <= 4 && Math.abs(rgb[1] - g) <= 4 && Math.abs(rgb[2] - b) <= 4)) return true;
    }
    return false;
  };
  const out = {};
  for (const [i, thumb] of [...document.querySelectorAll('.thumb')].entries()) {
    const label = (thumb.querySelector('.lbl')?.textContent || `tpl-${i}`).trim();
    // 必须先滚进视口：elementFromPoint 对视口外的坐标一律返回 null（踩过，量出来全是 0%）
    thumb.scrollIntoView({ block: 'center' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = thumb.getBoundingClientRect();
    const STEP = 4;
    let hit = 0;
    let total = 0;
    for (let y = r.top + 2; y < r.bottom - 2; y += STEP) {
      for (let x = r.left + 2; x < r.right - 2; x += STEP) {
        total += 1;
        const el = document.elementFromPoint(x, y);
        if (el && isPaper(el, thumb)) hit += 1;
      }
    }
    out[label] = { paperRatio: total ? hit / total : 0, note: '网格采样 4px' };
  }
  return out;
});

fs.writeFileSync(REPORT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: '模板缩略图估算占比——只用于模板间横向比较；逐页面积预算见 tone-report.json（qa:screens 产出）',
  templates: pages,
}, null, 2), 'utf8');
console.log('样板图 →', OUT);
console.log('纸面占比（估算）：');
for (const [k, v] of Object.entries(pages)) console.log(`  ${k.padEnd(12)} ${(v.paperRatio * 100).toFixed(1)}%`);
await browser.close();
