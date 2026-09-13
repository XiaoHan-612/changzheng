// 目视检查：把 public/assets/characters/ 下所有立绘拼成一张对照图。
// 用途：新一批立绘落盘后，一次性看"风格是否同一套 / 圆形裁切有没有切到头 / 小尺寸还认不认得出"。
// 用法：node tests/manual/portrait-sheet.mjs   → tests/e2e/artifacts/portrait-sheet.png
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'public/assets/characters');
const ART = path.join(ROOT, 'tests/e2e/artifacts');
fs.mkdirSync(ART, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => /\.png$/i.test(f)).sort();
if (!files.length) {
  console.error('没有立绘可看：public/assets/characters/ 里没有 png');
  process.exit(1);
}

// 用 data URL 传图，避免依赖本地文件系统路径在浏览器里的可访问性
const items = files.map((f) => ({
  name: f,
  src: 'data:image/png;base64,' + fs.readFileSync(path.join(SRC, f)).toString('base64'),
  bytes: fs.statSync(path.join(SRC, f)).size,
}));

const COLS = 5;
const CELL = 300;
const rows = Math.ceil(items.length / COLS);
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#26201a">
<canvas id="c" width="${COLS * CELL}" height="${rows * CELL}"></canvas>
<script>
const items = ${JSON.stringify(items)};
const COLS = ${COLS}, CELL = ${CELL};
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
ctx.fillStyle = '#26201a';
ctx.fillRect(0, 0, cv.width, cv.height);
const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
(async () => {
  for (const [n, it] of items.entries()) {
    const img = await load(it.src);
    const x = (n % COLS) * CELL, y = Math.floor(n / COLS) * CELL;
    // 大图：圆形裁切，检查有没有切到头
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + CELL / 2, y + 124, 120, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x + 30, y + 4, 240, 240);
    ctx.restore();
    // 小图：真实头像框尺寸，检查小尺寸可读性
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 272, y + 292, 20, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x + 252, y + 272, 40, 40);
    ctx.restore();
    ctx.fillStyle = '#e8dcc8';
    ctx.font = '16px Consolas, monospace';
    ctx.fillText(it.name, x + 30, y + 274);
    ctx.fillStyle = '#9a8e7e';
    ctx.fillText(Math.round(it.bytes / 1024) + ' KB', x + 30, y + 296);
  }
  window.__done = true;
})();
<\/script></body>`;

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: COLS * CELL, height: rows * CELL } });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForFunction(() => window.__done === true);
const out = path.join(ART, 'portrait-sheet.png');
await page.locator('#c').screenshot({ path: out });
await browser.close();
console.log(`已生成 ${out}（${items.length} 张：${files.join('、')}）`);
