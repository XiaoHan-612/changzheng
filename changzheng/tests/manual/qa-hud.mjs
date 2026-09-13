// 顶栏特写与度量：把顶栏按 3 倍截下来，并逐元素打印"实际生效"的字体/字号/颜色/行高。
//
// 为什么单独一个脚本：顶栏的问题（字体族、字号层次、颜色、数字排版）在 1280 缩略图里
// 只差几个像素，靠肉眼看整屏截图看不出来；量一遍再放大看，问题就变成可核对的数字。
// 用法：node tests/manual/qa-hud.mjs
import { chromium } from 'playwright';
import { ensureServer, BASE } from '../e2e/lib/server.mjs';
import { passOrigin } from '../e2e/lib/driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = path.join(ROOT, 'tests/e2e/artifacts');
fs.mkdirSync(ART, { recursive: true });

await ensureServer();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 3 });
await page.goto(`${BASE}/?hud=${Date.now()}`, { waitUntil: 'networkidle' });
await page.evaluate(() => sessionStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.click('#btn-mode-study');
await page.waitForTimeout(300);
await passOrigin(page);
await page.click('#btn-cut-skip').catch(() => {});
await page.waitForTimeout(1200);

await page.locator('#topbar').screenshot({ path: path.join(ART, 'hud-3x.png') });
console.log('顶栏特写 →', path.join(ART, 'hud-3x.png'));

// 逐元素读出真正生效的样式：字体族取第一项（自托管字体族），数字另看 font-variant-numeric
const rows = await page.evaluate(() => {
  const SEL = '#topbar .brand, #topbar .j-label, #topbar .blk-stat, #topbar .blk-stat b, #topbar .btn, #topbar .pill, #topbar .mode-tag';
  const one = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      元素: (el.className || el.id || el.tagName).toString().slice(0, 22),
      文本: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 8),
      字体: cs.fontFamily.split(',')[0].trim(),
      字号: cs.fontSize,
      字重: cs.fontWeight,
      颜色: cs.color,
      底: cs.backgroundColor,
      行高: cs.lineHeight,
      等宽数字: cs.fontVariantNumeric,
      盒: `${Math.round(r.width)}×${Math.round(r.height)}`,
    };
  };
  return [...document.querySelectorAll(SEL)].map(one);
});
console.table(rows);

// 对比度：把"前景色 vs 顶栏墨纱底"算成数字（顶栏底色是半透明黑，取不透明近似值算上界）
const contrast = await page.evaluate(() => {
  const lum = (rgb) => {
    const s = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  };
  const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
  const DARK = [18, 14, 10];   // 顶栏最暗处（--ink-bg 近似）——对比度的下限
  const out = [];
  for (const el of document.querySelectorAll('#topbar .j-label, #topbar .blk-stat, #topbar .blk-stat b, #topbar .mode-tag, #topbar .pill')) {
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (fg.length < 3) continue;
    out.push({
      文本: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 8),
      字号: cs.fontSize,
      对墨底: +ratio(fg, DARK).toFixed(2),
    });
  }
  return out;
});
console.log('\n对比度（对顶栏最暗处；正文要 ≥4.5:1，小字要更高）：');
console.table(contrast);

await browser.close();
