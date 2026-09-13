// 逐页截图 + 联系表：把一批页面截成统一尺寸，拼成一张对照图，用于"逐页打磨"时比对风格。
//
// 用法：node tests/manual/screen-sheet.mjs [批次号 1-6]
// 产物：tests/e2e/artifacts/screens/batch-<n>/<页名>.png 与 screen-sheet-<n>.png
import { chromium } from 'playwright';
import { ensureServer, BASE } from '../e2e/lib/server.mjs';
import { passOrigin } from '../e2e/lib/driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = path.join(ROOT, 'tests/e2e/artifacts');
const BATCH = Number(process.argv[2] || 1);
const OUT = path.join(ART, 'screens', `batch-${BATCH}`);
fs.mkdirSync(OUT, { recursive: true });

/** 在实机页面上量纸面占比：视口内网格采样，判断该点是否落在纸面元素上 */
async function measurePaper(page) {
  return page.evaluate(() => {
    const PAPER = [[196, 183, 156], [211, 199, 171], [179, 166, 140]];   // paper-veil / paper-0 / paper-2
    const parse = (s) => {
      const m = /rgba?\(([^)]+)\)/.exec(s);
      if (!m) return null;
      const [r, g, b, a = '1'] = m[1].split(',').map((x) => parseFloat(x));
      return Number(a) < 0.5 ? null : [r, g, b];
    };
    const isPaper = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const rgb = parse(getComputedStyle(n).backgroundColor);
        if (rgb && PAPER.some(([r, g, b]) => Math.abs(rgb[0] - r) <= 4 && Math.abs(rgb[1] - g) <= 4 && Math.abs(rgb[2] - b) <= 4)) return true;
      }
      return false;
    };
    const W = window.innerWidth; const H = window.innerHeight;
    let hit = 0; let total = 0;
    for (let y = 4; y < H - 4; y += 8) {
      for (let x = 4; x < W - 4; x += 8) {
        total += 1;
        const el = document.elementFromPoint(x, y);
        if (el && isPaper(el)) hit += 1;
      }
    }
    return total ? hit / total : 0;
  });
}

/** 每批要截的页面：{ name, 准备动作 } */
const BATCHES = {
  1: [
    { name: '01-title', shot: 'title' },
    { name: '02-how', shot: 'how' },
    { name: '03-settings', shot: 'settings' },
    { name: '04-cutscene', shot: 'cutscene' },
  ],
};

async function capture() {
  await ensureServer();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.goto(`${BASE}/?sheet=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  const shots = BATCHES[BATCH] || BATCHES[1];
  const tone = {};
  for (const s of shots) {
    if (s.shot === 'how') { await page.click('#btn-how'); await page.waitForTimeout(400); }
    if (s.shot === 'settings') {
      await page.click('#btn-settings-close').catch(() => {});
      await page.click('#screen-how .btn, #btn-how-back').catch(() => {});
      await page.waitForTimeout(200);
      await page.click('#btn-settings2').catch(async () => { await page.click('#btn-settings'); });
      await page.waitForTimeout(400);
    }
    if (s.shot === 'cutscene') {
      await page.click('#btn-settings-close').catch(() => {});
      await page.waitForTimeout(150);
      await page.click('#btn-mode-study');
      await page.waitForTimeout(400);
      await passOrigin(page);
      await page.waitForTimeout(1200);   // 停在过场第一帧
    }
    if (s.shot === 'title') { await page.waitForTimeout(300); }
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
    tone[s.name] = { paperRatio: await measurePaper(page) };
    console.log('shot', s.name, `纸面 ${(tone[s.name].paperRatio * 100).toFixed(1)}%`);
  }
  fs.writeFileSync(path.join(ART, 'tone-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), batch: BATCH, pages: tone }, null, 2), 'utf8');
  await browser.close();
}

/** 用 canvas 拼联系表（两列），带页名标签 */
async function sheet() {
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.png') && !f.startsWith('screen-sheet')).sort();
  const items = files.map((f) => ({ name: f.replace(/\.png$/, ''), src: 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64') }));
  const COLS = 2, CELL_W = 640, CELL_H = 400, PAD = 12, LABEL = 26;
  const rows = Math.ceil(items.length / COLS);
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#1a1611">
  <canvas id="c" width="${COLS * (CELL_W + PAD) + PAD}" height="${rows * (CELL_H + LABEL + PAD) + PAD}"></canvas>
  <script>
  const items = ${JSON.stringify(items)};
  const COLS=${COLS}, CW=${CELL_W}, CH=${CELL_H}, PAD=${PAD}, LABEL=${LABEL};
  const ctx = document.getElementById('c').getContext('2d');
  ctx.fillStyle = '#1a1611'; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  (async () => {
    for (const [n, it] of items.entries()) {
      const img = await load(it.src);
      const x = PAD + (n % COLS) * (CW + PAD), y = PAD + Math.floor(n / COLS) * (CH + LABEL + PAD);
      ctx.drawImage(img, x, y, CW, CH);
      ctx.strokeStyle = 'rgba(232,220,200,0.35)'; ctx.strokeRect(x + 0.5, y + 0.5, CW - 1, CH - 1);
      ctx.fillStyle = '#ece2cd'; ctx.font = '15px Consolas, monospace';
      ctx.fillText(it.name, x + 2, y + CH + 18);
    }
    window.__done = true;
  })();
  <\/script></body>`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: COLS * (CELL_W + PAD) + PAD, height: rows * (CELL_H + LABEL + PAD) + PAD } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__done === true);
  const out = path.join(ART, `screen-sheet-${BATCH}.png`);
  await page.locator('#c').screenshot({ path: out });
  await browser.close();
  console.log('联系表 →', out);
}

await capture();
await sheet();
