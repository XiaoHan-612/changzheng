/**
 * 弯针成钩（bendhook）· 手感与结局对照体检
 *
 * 这个玩法要说清一件事：**它是游戏，还是"点三下按钮"**。
 * 所以这里不验"界面有没有坏"，而是把六种打法各跑一遍，看同一份代码会不会因为
 * 玩家的决策分成六个档：
 *
 *   S1 稳着弯    —— 分三次烧（每次 86°），钩门分两段弯到 236°、钩尖弯到 53° → 好钩
 *   S2 一路猛烧  —— 按住烧针不松手，看"钢烧白了"是不是真的会废掉这根针
 *   S3 冷了硬弯  —— 只烧到 60° 就一直弯，看它会不会断
 *   S4 不烧就弯  —— 从常温直接弯（针是硬的）
 *   S5 弯一半就交—— 钩门只到 120° 就收手
 *   S6 少了钩尖  —— 钩门弯对了、钩尖没弯
 *
 * 顺便验四点契约（runXxx 签名 / dataset.mini+miniState / [data-mini-action] / 自清），
 * 以及项目历史上的 P0：prefers-reduced-motion: reduce 下板屏整块点不动。
 *
 * 用法：先起服务 node server/index.js，然后
 *   node tests/manual/qa-needle.mjs
 * 截图落在 tests/e2e/artifacts/needle/（该目录已被 .gitignore 排除）。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'e2e', 'artifacts', 'needle');
fs.mkdirSync(OUT, { recursive: true });

/* 本机没有 Google Chrome，用 playwright 自带的 chromium；有 CHROME_PATH 就用它 */
const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

/* 与玩法里 NEEDLE 的数值一致 —— 脚本按"物理"推时间，不靠一遍遍轮询 */
const RATE = { heatGain: 74, bendBody: 58, bendTip: 78 };

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:3001/dev/minigame-lab.html', { waitUntil: 'networkidle' });
await page.click('#hook-list button[data-mini-id="bendhook"]');
await page.waitForTimeout(700);
const host = page.locator('#mini-host');

const snap = () => host.evaluate((el) => ({
  mini: el.dataset.mini,
  state: el.dataset.miniState,
  outcome: el.dataset.miniOutcome || '',
  heat: +el.dataset.miniHeat,
  body: +el.dataset.miniBody,
  tip: +el.dataset.miniTip,
  oxide: +el.dataset.miniOxide,
  strain: +el.dataset.miniStrain,
  actions: el.querySelectorAll('[data-mini-action]').length,
  status: (el.querySelector('#nd-status')?.textContent || '').trim(),
}));
const shot = (n) => host.screenshot({ path: path.join(OUT, n + '.png') });
const resultJson = () => page.locator('#c-result').textContent()
  .then((t) => { try { return JSON.parse(t); } catch { return {}; } });

/** 按住某个键一会儿（时间按物理反推，少误差） */
async function hold(key, sec) {
  if (sec <= 0) return;
  await page.keyboard.down(key);
  await page.waitForTimeout(Math.max(16, Math.round(sec * 1000)));
  await page.keyboard.up(key);
  await page.waitForTimeout(50);
}
/** 烧到目标温度 */
async function heatTo(target) {
  const s = await snap();
  if (s.heat >= target || s.state === 'done' || s.state === 'broken') return s;
  await hold('1', (target - s.heat) / RATE.heatGain + 0.02);
  return snap();
}
/** 把钩门/钩尖弯到目标角度（只在温度够的时候用） */
async function bendTo(which, target) {
  const s = await snap();
  const cur = which === 'body' ? s.body : s.tip;
  const rate = which === 'body' ? RATE.bendBody : RATE.bendTip;
  if (cur >= target || s.state === 'done' || s.state === 'broken') return s;
  await hold(which === 'body' ? '2' : '3', (target - cur) / rate + 0.01);
  return snap();
}
async function reset() {
  await page.click('#btn-reset');
  await page.waitForTimeout(400);
}
async function done(waitMs = 2600) {
  await page.click('#nd-done');
  await page.waitForTimeout(waitMs);
}

const rows = [];
async function record(name, note, slug) {
  const fin = await snap();
  const res = await resultJson();
  const d = res.detail || {};
  rows.push({
    name, note,
    outcome: fin.outcome || d.outcome || '(没拿到)',
    score: res.score, body: d.body, tip: d.tip, oxide: d.oxide, cycles: d.cycles,
    summary: res.summary || '(没拿到 resolve 结果)',
  });
  await shot('end-' + slug);
}

/** 客观画面断言：数一数"金色钩"的像素有多少、落在哪儿。
 *
 *  为什么要它：截图人眼看不了（模型读图会被过滤），"钩是金色的"这句话必须能被脚本证实。
 *
 *  ⚠️ 走过的弯路（别再踩）：一开始想只用**色比**把金和火分开 —— 不行。
 *  金色 #e3bd66 = (227,189,102) 本来就是炉火色，而火苗的 mid→core 渐变
 *  (255, 154+76t, 60+116t) 在某个 t 上会落进同一个色比窗口里；
 *  实测"满画面扫"在**什么都没做**的时候也能数出 1248 个"金"，包围盒 179,280 → 319,324
 *  —— 那全是炭盆的火苗。**这两样东西只能靠位置分开，不能靠颜色分开。**
 *
 *  所以判据是两条一起用：
 *    ① 色比窗口（保证"像金"）：g/r ∈ [0.78,0.90] ∧ b/g ∈ [0.47,0.60] ∧ 够亮
 *    ② 取样框（保证"在钩应该在的地方"）：钩门 236°+钩尖 53° 定妆时，钩身占 x 308–341、
 *       y 181–287；框取 **x 296–352 / y 176–258**，正好是钩身上半段，
 *       而火苗最高只到 y≈266（Brazier baseY 324 − 最大火舌高 ~58），框底 258 在它之上。
 *  对照组是同一时刻的"还没烧的冷直针"和"烧废之后"，都应该数不出金。
 *
 *  ⚠️ 第二条弯路：**原始像素个数会随后备缓冲分辨率变**。
 *  画布改成"后备缓冲 = 显示宽 × DPR"之后，同一枚钩在 DPR 2 下是 421 px、
 *  在 DPR 1 下只剩 100 出头 —— 阈值写死 200 的话，换个屏就会把一个**正确**的画面判成红的。
 *  所以判据用 **n / dpr²**（归一化回"设计单位面积"）：DPR 2 旧布局 693/4 = 173、
 *  新布局 421/2.49 = 169，两次几乎一样，跟设备无关。阈值取 > 60 / < 12。
 *
 *  返回值一并给出命中像素的包围盒（换算回 720×400 逻辑坐标）——
 *  万一以后布局变了，从包围盒能一眼看出它跑哪儿去了。 */
const GOLD_BOX = [296, 176, 352, 258];
const goldProbe = (box) => host.evaluate((el, bx) => {
  const c = el.querySelector('#nd-canvas');
  if (!c) return { n: 0, norm: 0, at: '找不到 canvas' };
  const g = c.getContext('2d');
  const dpr = c.width / 720;
  /* 像素个数会随**后备缓冲分辨率**变：同一枚钩，DPR 2 时约 420 个、DPR 1 时只剩 100 出头。
     所以判据不能直接用原始个数（换个屏就误判）—— 除以 dpr² 归一化回"设计单位面积"，
     这个数跟设备无关（实测两次都是 ~170）。 */
  const norm = (n2) => +(n2 / (dpr * dpr)).toFixed(1);
  const x0 = bx ? Math.round(bx[0] * dpr) : 0;
  const y0 = bx ? Math.round(bx[1] * dpr) : 0;
  const w = bx ? Math.round((bx[2] - bx[0]) * dpr) : c.width;
  const h = bx ? Math.round((bx[3] - bx[1]) * dpr) : c.height;
  const d = g.getImageData(x0, y0, w, h).data;
  let n = 0, ax0 = 1e9, ay0 = 1e9, ax1 = -1, ay1 = -1;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r < 150 || r + gg + b < 380) continue;
    const gr = gg / r, bg = b / gg;
    if (gr < 0.78 || gr > 0.90 || bg < 0.47 || bg > 0.60) continue;
    n++;
    const k = i >> 2;
    const px = k % w, py = (k / w) | 0;
    if (px < ax0) ax0 = px; if (px > ax1) ax1 = px;
    if (py < ay0) ay0 = py; if (py > ay1) ay1 = py;
  }
  if (!n) return { n: 0, norm: 0, at: '（一处都没有）' };
  const r4 = (v, off) => Math.round((v + off) / dpr);
  return { n, norm: norm(n), at: `${r4(ax0, x0)},${r4(ay0, y0)} → ${r4(ax1, x0)},${r4(ay1, y0)}` };
}, box);

/* ── 开工 ── */
await page.waitForTimeout(300);
await shot('01-open');
{
  const box = await page.locator('#nd-canvas').boundingBox();
  await page.screenshot({ path: path.join(OUT, '01b-closeup.png'), clip: box });
}

/** 一次取两档：取样框内（判据）＋ 满画面（诊断，会被火苗污染） */
const goldAt = async () => ({ box: await goldProbe(GOLD_BOX), all: await goldProbe(null) });

/* ── S1 稳着弯：三次火、两段弯 ── */
await reset();
const goldCold = await goldAt();        // 对照：还没烧的直针，框里不该有金
await heatTo(86);
await shot('02-heating');
await bendTo('body', 120);
await heatTo(86);
await bendTo('body', 236);
await shot('03-body-done');
await heatTo(86);
await bendTo('tip', 53);
await shot('04-tip-done');
await done();
await record('S1稳着弯', '分三次烧到 86°，钩门分两段到 236°、钩尖 53°', 's1-steady');
const goldHook = await goldAt();        // 主角：定妆之后，框里该有那枚金色的钩

/* ── S2 一路猛烧（按住不松手，看它会不会废掉针） ── */
await reset();
await hold('1', 6.0);
await page.waitForTimeout(1400);
await record('S2一路猛烧', '按住「烧针」6 秒不松手', 's2-overheat');
const goldBurnt = await goldAt();       // 对照：烧废了就不该有金

/* ── S3 冷了硬弯 ── */
await reset();
await heatTo(60);
await hold('2', 2.2);
await page.waitForTimeout(1400);
await record('S3冷了硬弯', '只烧到 60° 就一直弯，中途不再回火', 's3-cold-bend');

/* ── S4 不烧就弯 ── */
await reset();
await hold('2', 1.4);
await page.waitForTimeout(1400);
await record('S4不烧就弯', '从常温直接弯（针是硬的）', 's4-cold-start');

/* ── S5 弯一半就交 ── */
await reset();
await heatTo(86);
await bendTo('body', 120);
await done();
await record('S5弯一半就交', '钩门只到 120° 就收手', 's5-half');

/* ── S6 少了钩尖 ── */
await reset();
await heatTo(86);
await bendTo('body', 120);
await heatTo(86);
await bendTo('body', 236);
await done();
await record('S6少了钩尖', '钩门弯对了（236°），钩尖没弯', 's6-flat-tip');

/* ── S7 减动效下的可点性（项目历史上的 P0：板屏整块点不动） ──
   判据三条：① elementFromPoint 在按钮中心命中的必须是它自己；
             ② 一次**不带 force** 的真按住（mouse.down/up）能把火候推上去；
             ③ 按钮上必须真的有 [data-mini-action]。 */
const rmCtx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, reducedMotion: 'reduce' });
const rmPage = await rmCtx.newPage();
await rmPage.goto('http://localhost:3001/dev/minigame-lab.html', { waitUntil: 'networkidle' });
await rmPage.click('#hook-list button[data-mini-id="bendhook"]');
await rmPage.waitForTimeout(700);
const rmHost = rmPage.locator('#mini-host');
const probe = await rmPage.evaluate(() => {
  const b = document.querySelector('#nd-heat');
  if (!b) return { ok: false, why: '找不到「烧针」按钮' };
  const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    ok: b === el || b.contains(el),
    who: el ? String(el.className || el.tagName) : 'null',
    hasAction: b.dataset.miniAction === 'heat',
    box: { x: r.left, y: r.top, w: r.width, h: r.height },
  };
});
let rmHeat = 0;
if (probe.box) {
  const cx = probe.box.x + probe.box.w / 2;
  const cy = probe.box.y + probe.box.h / 2;
  await rmPage.mouse.move(cx, cy);
  await rmPage.mouse.down();
  await rmPage.waitForTimeout(700);
  await rmPage.mouse.up();
  await rmPage.waitForTimeout(120);
  rmHeat = await rmHost.evaluate((el) => +el.dataset.miniHeat);
}
const rmOk = probe.ok && probe.hasAction && rmHeat > 30;
await rmHost.screenshot({ path: path.join(OUT, '09-reduced-motion.png') });
await rmCtx.close();

/* ── 契约 ── */
const c = await snap();
const contract = {
  mini: c.mini === 'bendhook',
  state: !!c.state,
  actions: c.actions === 4,
};

/* ── 字号体检：画面上的字，落到屏幕上到底几个像素 ──
   缺陷版本：HUD 写死 `10px`，画布 720 的设计宽度实际只显示 570（缩放 0.79）
   → 屏幕上是 7.9px 的宋体汉字，糊成一团。
   修法：后备缓冲跟着显示宽度走，字按 1/scale 反向放大 → 屏幕字号恒定。
   这里把三项实测值打出来（其中 measureText 是**真的量了一个汉字**，不是算术）。 */
const type = await page.evaluate(() => {
  const cv = document.querySelector('#nd-canvas');
  const g = cv.getContext('2d');
  const cssW = cv.clientWidth, cssH = cv.clientHeight;
  const scale = cssW / 720;
  return {
    cssW, cssH,
    backing: cv.width + '×' + cv.height,
    dpr: +(cv.width / cssW).toFixed(3),
    scale: +scale.toFixed(3),
    font: g.font,
    glyphPx: +(g.measureText('火').width * scale).toFixed(2),   // 一个汉字在屏幕上的宽度
  };
});

/* ── 汇总 ── */
console.log('\n=== 弯针成钩 · 六种打法对照表 ===');
for (const r of rows) {
  console.log(`\n【${r.name}】 结局=${r.outcome}  分=${r.score}  钩门=${r.body}°  钩尖=${r.tip}°  针身=${r.oxide}  回火=${r.cycles} 次`);
  console.log(`  怎么打：${r.note}`);
  console.log(`  结算：${r.summary}`);
}
console.log('\n=== 画面断言：成品钩是不是金色的（数像素，不是靠眼看）===');
console.log(`色比窗口：g/r ∈ [0.78,0.90] ∧ b/g ∈ [0.47,0.60] ∧ 够亮`);
console.log(`取样框：x ${GOLD_BOX[0]}–${GOLD_BOX[2]} / y ${GOLD_BOX[1]}–${GOLD_BOX[3]}（定妆位钩身上半段，框底在火苗顶之上）`);
const line = (tag, r, pass, hint) =>
  console.log(`  ${tag.padEnd(24)} 归一 ${String(r.box.norm).padStart(6)}（原始 ${String(r.box.n).padStart(4)} px）  ${pass ? '✓ ' + hint : '✗ ' + hint}  ${r.box.at}　[满画面 ${r.all.n}=火苗污染]`);
line('reset 之后的冷直针（对照）', goldCold, goldCold.box.norm < 12, '没有金');
line('S1 走完成钩（主角）', goldHook, goldHook.box.norm > 60, '磨出金了');
line('S2 烧废之后（对照）', goldBurnt, goldBurnt.box.norm < 12, '没成钩、也没金');
console.log('\n=== 减动效可点性（prefers-reduced-motion: reduce）===');
console.log(`elementFromPoint 命中：${probe.ok ? '按钮自己' : '被别的东西盖住 → ' + probe.who}`);
console.log(`按钮上有 [data-mini-action="heat"]：${probe.hasAction ? '有' : '没有'}`);
console.log(`不带 force 的真按住 0.7s：火候 ${rmHeat.toFixed(1)}　${rmOk ? '通过' : '不通过'}`);
console.log('\n=== 四点契约 ===');
console.log(`host[data-mini]='bendhook'：${contract.mini ? '✓' : '✗ 实际 ' + c.mini}`);
console.log(`host[data-mini-state] 有值：${contract.state ? '✓ ' + c.state : '✗'}`);
console.log(`[data-mini-action] 数量 = 4：${contract.actions ? '✓' : '✗ 实际 ' + c.actions}`);
console.log('\n=== 画面上那些字，落到屏幕上是多大 ===');
console.log(`画布：CSS ${type.cssW}×${type.cssH}　后备缓冲 ${type.backing}（DPR ${type.dpr}）　设计缩放 ${type.scale}`);
console.log(`ctx.font 回读：${type.font}`);
console.log(`一个汉字实测宽度：${type.glyphPx} 屏幕 px　${type.glyphPx >= 12 ? '✓ 可读' : '✗ 太小（缺陷版是 7.9）'}`);
console.log(errs.length ? '页面报错：\n' + errs.join('\n') : '页面报错：无');
await browser.close();
