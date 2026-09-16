/**
 * 《陡坡 · 拽住他》v3 出图 —— 按阶段各截一张，供人眼验收画面。
 *
 * v3 的坐标是**画作像素**（viewBox = CROP，840×650）。所以映射是
 *   页面坐标 = svg.topLeft + (画作坐标 - CROP.origin) / CROP.size * svg.size
 * 别在这里写死 460/300（v2 的旧尺寸）—— 那会让"对准他的手"变成"对着别处点"，
 * 拍出来的图看着像玩法坏了，其实是出图脚本用错了尺子。
 *
 * 用法：先起服务（node server/index.js），然后
 *   node tests/manual/shot-grab.mjs      # ~40 秒
 * 产物：tests/e2e/artifacts/snow-grab/*.png
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const LAB = 'http://localhost:3001/dev/minigame-lab.html';
const OUT = path.join('tests', 'e2e', 'artifacts', 'snow-grab');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
// ⚠️ 视口必须够宽：板身宽度是 `min(--panel-w, 92vw)`（620），而调试台三栏会把中栏压窄；
//    中栏窄过 620 时纸面会溢出板壳、被裁掉两头 —— 提示语看着像"正在滑。…"缺了"他的手"。
//    真实游戏板屏是整屏，不存在这个问题，所以这是**出图环境**的事，不是玩法的事。
const page = await browser.newPage({ viewport: { width: 1600, height: 1060 }, deviceScaleFactor: 2 });
// 调试台一打开会自动跑列表第一个玩法（真调模型）→ 挡掉
await page.addInitScript(() => {
  const o = window.fetch.bind(window);
  window.fetch = (u, i) =>
    String(u).includes('/api/decide')
      ? Promise.resolve(new Response('{"ok":false,"source":"BLOCKED"}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : o(u, i);
});
await page.goto(LAB, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 20000 });

const CROP = await page.evaluate(async () => {
  const m = await import('/js/minigames-grab.js?v=' + Date.now());
  return m.CROP;
});

async function boot(seed) {
  await page.evaluate(async (s) => {
    for (const id of ['mini-host', 'g-host']) document.getElementById(id)?.remove();
    const host = document.createElement('div');
    host.id = 'g-host';
    (document.getElementById('board-body') || document.body).appendChild(host);
    window.__gHost = host;
    window.__gRes = null;
    const m = await import('/js/minigames-grab.js?v=' + Date.now());
    m.runSnowGrab(host, { rndSeed: s, stats: document.getElementById('board-stats') })
      .then((r) => { window.__gRes = r; });
  }, seed);
  await page.waitForFunction(() => window.__gHost?.dataset.miniState, null, { timeout: 10000 });
  await sleep(800); // 等入场动画落定，别拍到半透明
}

const st = () => page.evaluate(() => ({ ...window.__gHost.dataset, res: window.__gRes }));
async function shoot(name) {
  const el = await page.$('#g-host');
  await el.screenshot({ path: path.join(OUT, name) });
  console.log(`  · ${name}`);
}
const clickAct = (a) => page.click(`#g-host [data-mini-action="${a}"]`, { timeout: 3000 }).catch(() => false);
async function toPage(vx, vy) {
  return page.evaluate(([x, y, C]) => {
    const r = document.querySelector('#g-host svg').getBoundingClientRect();
    return { x: r.x + ((x - C.x) / C.w) * r.width, y: r.y + ((y - C.y) / C.h) * r.height };
  }, [vx, vy, CROP]);
}

/* ── 1. decide：开局那次抉择 ── */
await boot(7);
await shoot('1-decide.png');
console.log('✓ 1-decide  开局抉择（解绑腿 / 徒手）');

/* ── 2. aim：一次性抓取，准星压在他手上 ── */
await clickAct('leg');
await sleep(1750); // 解绑腿 1.4s + 余量
for (let i = 0; i < 20; i += 1) {
  const d = await st();
  if (!d.miniHand) break;
  const [hx, hy] = d.miniHand.split(',').map(Number);
  const p = await toPage(hx, hy);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await sleep(70);
  const d2 = await st();
  const [ax, ay] = (d2.miniAim || '0,0').split(',').map(Number);
  if (Math.hypot(ax - hx, ay - hy) <= Number(d2.miniCatchR) * 0.5) break;
}
await shoot('2-aim.png');
console.log('✓ 2-aim     一次性抓取（绳头已对准他的手）');

/* ── 3. hold：连续拉锯，按住拉把绳绷到最紧 ── */
await clickAct('throw');
await sleep(600);
let d = await st();
if (d.miniState === 'hold') {
  await page.keyboard.down('Space');
  for (let i = 0; i < 60; i += 1) {
    d = await st();
    if (Number(d.miniTension) > Number(d.miniCap) * 0.82) break;
    await sleep(80);
  }
  await shoot('3-hold.png');
  console.log(`✓ 3-hold    连续拉锯（张力 ${Number(d.miniTension).toFixed(0)}/${Number(d.miniCap).toFixed(0)}，绳绷直 · 他离你 ${d.miniMeters} 米）`);
} else {
  console.log(`✗ 3-hold 没进拉锯（state=${d.miniState}）`);
}

/* ── 4. 拉到顶（成功：雾散、交握处亮起）── */
for (let i = 0; i < 700; i += 1) {
  d = await st();
  if (d.miniState !== 'hold') break;
  const t = Number(d.miniTension); const c = Number(d.miniCap);
  if (t > c * 0.72) await page.keyboard.up('Space');
  else if (t < c * 0.28) await page.keyboard.down('Space');
  await sleep(70);
}
await page.keyboard.up('Space').catch(() => {});
await sleep(600);
d = await st();
await shoot('4-end.png');
console.log(`✓ 4-end     结算（state=${d.miniState} · ${d.res ? d.res.detail.outcome : '—'}）`);

/* ── 5. 失败线：雾合上（再开一局，发呆到底）── */
await boot(11);
for (let i = 0; i < 60; i += 1) {
  const x = await st();
  if (x.res) break;
  await sleep(300);
}
await shoot('5-lost.png');
console.log('✓ 5-lost    失败线（雾合上、坡下白茫茫）');

/* ── 补一张：**整屏**（含调试台左栏/板头/HUD/按钮）──
   ⚠️ 别只截玩法自己那一块：空白纸框、重复行、被挤出的版面这类问题只有整屏才看得见。 */
await page.screenshot({ path: path.join(OUT, '0-board.png') });
console.log('  · 0-board.png（整屏）');

console.log(`\n出图目录：${OUT}`);
// 本机 browser.close() 会挂住 → 放它自己去关 + 硬退
browser.close().catch(() => {});
setTimeout(() => process.exit(0), 500);
