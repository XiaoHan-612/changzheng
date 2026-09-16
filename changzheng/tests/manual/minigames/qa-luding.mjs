/**
 * 《飞夺泸定桥 · 攀链》v2 专项验收 —— 画作当场景 + 排程取舍骨架。
 *
 * 这一份和 v1 的用例**不是同一套东西**：
 *   · v1 判的是"0.85 秒预警 → 按住 S 贴链 → 中弹 +1 → 满 3 次坠江"（被否掉的四支同质骨架）。
 *   · v2 的骨架是**排程取舍**：姿态是连续量（贴链慢而安全 ⇄ 直起身快而折人，换姿势要站住），
 *     6 块门板只够铺 6 段、3 发掩护只够 15 秒，两条失败线（折完 22 人 / 时限到火封桥）。
 * 所以断言分三类：
 *   ① **骨架判据**（D 段）—— 判定它有没有退回"等窗口按一下"的老骨架。
 *      最硬的一条是 D2：老骨架里根本不存在"每秒折人率"这个连续量，读不到 `miniHurt`。
 *   ② **场景判据**（A1–A4 + F5/F6）—— 判定它有没有退回"自己画一座索桥"的老路。
 *   ③ **两个失败线的算术证明**（A8）—— 不跑也能证明"贴链必超时、直冲必折光"，所以最不会被时序糊弄。
 *
 * 六段：
 *   A. 几何与常量：桥面轴线自洽 / 火力递增 / 姿态取舍方向 / 板与掩护的稀缺性 / 两个极端都不成立。
 *   B. 失败线一：一路贴链 → 时限到（`fire`）。
 *   C. 失败线二：一路直冲 → 折满 22 人（`wiped`）。
 *   D. 骨架判据：姿态是连续量（miniHurt 比值正确）· 换挡要站住 · 板铺在脚下且真的更安全 · 掩护真的停火且不可叠加。
 *   E. 成功线：掩护抢时间 + 西段贴身 + 第 7 段起逐段铺板 → `crossed`。
 *   F. 契约与画面：dataset / 状态序列 / 0 异常 / 0 次 /api/decide / 减动效真点击 / **像素判据**（火力亮起与熄灭）。
 *
 * 用法：先起服务 node server/index.js，然后
 *   node tests/manual/qa-luding.mjs       # 约 4 分钟，照例后台跑
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const LAB = 'http://localhost:3001/dev/minigame-lab.html';
const BASE = 'http://localhost:3001';
const OUT = path.join('tests', 'e2e', 'artifacts', 'luding-chain');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let bad = 0;
/** 未捕获页面异常必须算红：rAF 回调抛一次错就不再排 → 玩法静默冻在起点，dataset 上完全看不出来 */
const pageErrs = [];
const watchPage = (p) => { p.on('pageerror', (e) => pageErrs.push(String(e.message).split('\n')[0])); return p; };
{
  const oNewPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => watchPage(await oNewPage(...a));
  const oCtx = browser.newContext.bind(browser);
  browser.newContext = async (...a) => {
    const c = await oCtx(...a);
    const oCNp = c.newPage.bind(c);
    c.newPage = async (...b) => watchPage(await oCNp(...b));
    return c;
  };
}
setTimeout(() => { console.log('\n【看门狗】用例超过 12 分钟，强制收尾'); process.exit(3); }, 720000);
const note = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? '✓' : '✗'} ${line}`); };
const info = (line) => console.log(`    · ${line}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 常量口径：从模块读一次（C/D 段断言要用），**别在用例里写死第二份** */
const K0 = await (async () => {
  const p = await browser.newPage();
  await p.goto(LAB, { waitUntil: 'domcontentloaded' });
  const k = await p.evaluate(async () => {
    const m = await import('/js/minigames-luding.js?v=' + Date.now());
    return { cling: m.CLING.hurt, rush: m.RUSH.hurt, plank: m.PLANK_HURT };
  });
  await p.close();
  return k;
})();
const A_CLING_HURT = K0.cling;
const A_RUSH_HURT = K0.rush;
const A_PLANK_HURT = K0.plank;

/* 调试台一打开会自动跑列表第一个玩法（那支真调模型）→ 挡掉并计数 */
const blockDecide = () => {
  window.__decideHits = 0;
  window.__origFetch = window.fetch.bind(window);
  window.fetch = (url, init) => {
    if (String(url).includes('/api/decide')) {
      window.__decideHits += 1;
      return Promise.resolve(new Response('{"ok":false,"source":"BLOCKED"}',
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return window.__origFetch(url, init);
  };
};

async function newLabPage(extra = {}) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1060 }, ...extra });
  await page.addInitScript(blockDecide);
  await page.goto(LAB, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 20000 });
  return page;
}

async function boot(page, opts = {}) {
  await page.evaluate(async (o) => {
    for (const id of ['mini-host', 'l-host']) {
      const e = document.getElementById(id);
      if (e) e.remove();
    }
    const host = document.createElement('div');
    host.id = 'l-host';
    (document.getElementById('board-body') || document.body).appendChild(host);
    window.__lHost = host;
    window.__lRes = null;
    window.__lErr = null;
    const m = await import('/js/minigames-luding.js?v=' + Date.now());
    try {
      m.runLudingChain(host, { stats: document.getElementById('board-stats'), ...o })
        .then((r) => { window.__lRes = r; });
    } catch (e) { window.__lErr = String(e && e.message); }
  }, opts);
  await page.waitForFunction(() => window.__lHost && window.__lHost.dataset.mini, null, { timeout: 10000 });
  // ⚠️ 只等 dataset.mini 不够：那是 runLudingChain 一开头就写的，而操作按钮行是**第一次 render() 之后**
  //    才有的。冷启动第一张页面若在这一帧之间取样，B1 会红，报出 undefined —— 看着像玩法没起来，
  //    其实是用例自己抢跑。等状态词一起落地。
  await page.waitForFunction(() => window.__lHost && window.__lHost.dataset.miniState, null, { timeout: 10000 });
}

const seenStates = new Set();

async function read(page) {
  const out = await page.evaluate(() => {
    const h = window.__lHost;
    const o = {};
    if (h) {
      for (const k of Object.keys(h.dataset)) o[k] = h.dataset[k];
      o.acts = [...h.querySelectorAll('[data-mini-action]')].map((e) => e.dataset.miniAction);
      o.disabled = Object.fromEntries([...h.querySelectorAll('[data-mini-action]')]
        .map((e) => [e.dataset.miniAction, e.disabled]));
      const img = h.querySelector('.smini10-plate');
      o.plateSrc = img ? img.getAttribute('src') : null;
      o.plateLoaded = !!(img && img.complete && img.naturalWidth > 0);
      o.plateNat = img ? `${img.naturalWidth}x${img.naturalHeight}` : '—';
      const svg = h.querySelector('svg');
      o.viewBox = svg ? svg.getAttribute('viewBox') : null;
      o.rankDots = h.querySelectorAll('[data-layer="rank"] > circle').length;
      o.plankBand = h.querySelectorAll('[data-plank]').length;
    }
    o.res = window.__lRes;
    o.err = window.__lErr;
    o.hits = window.__decideHits;
    return o;
  });
  if (out.miniState) seenStates.add(out.miniState);
  return out;
}

const N = (v) => (v === undefined || v === '' ? NaN : Number(v));

/** 真点击（**不加 force** —— force 会把"元素被遮挡"这一整类缺陷屏蔽掉） */
async function clickAct(page, act) {
  const sel = `#l-host [data-mini-action="${act}"]`;
  const el = await page.$(sel);
  if (!el) return false;
  try { await page.click(sel, { timeout: 3000 }); return true; } catch { return false; }
}

/** 真键盘按住/松开「贴链」 */
const holdCling = (page, down) => page.keyboard[down ? 'down' : 'up']('Space').catch(() => {});

/** 开始这一局（brief → cross） */
async function start(page) {
  const ok = await clickAct(page, 'start');
  await sleep(160);
  return ok;
}

/* ══════════════ 像素判据用的光栅化 ══════════════
 * 只读 DOM 属性证明不了"画面上真的有那些像素"（斜针那支就踩过：钩子的金色在结算后被抹掉，
 * 属性全对、页面不报错）。所以这里把"画作 + 覆盖层"合成到一张 canvas 上再数像素。
 * 合成办法：drawImage(画作) → 把覆盖层 SVG 序列化成 blob URL 当图片再 drawImage 一次。 */
const RASTER = async ({ rects, pred }) => {
  const host = window.__lHost;
  const img = host.querySelector('.smini10-plate');
  const svg = host.querySelector('svg');
  if (!img || !svg) return { err: 'no plate/svg' };
  const m = await import('/js/minigames-luding.js?v=' + Date.now());
  const C = m.CROP;
  const c = document.createElement('canvas');
  c.width = m.PAINT.w; c.height = m.PAINT.h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, m.PAINT.w, m.PAINT.h);
  const str = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml' }));
  try {
    const oi = new Image();
    await new Promise((res, rej) => {
      oi.onload = res;
      oi.onerror = () => rej(new Error('覆盖层 SVG 光栅化失败'));
      oi.src = url;
    });
    // svg 的 viewBox 就是 CROP 且 intrinsic size = viewBox 尺寸 → 按 CROP 落到画作坐标上
    g.drawImage(oi, C.x, C.y, C.w, C.h);
  } finally {
    URL.revokeObjectURL(url);
  }
  const fn = new Function('r', 'g', 'b', `return ${pred};`);
  const out = {};
  for (const [name, rc] of Object.entries(rects)) {
    const d = g.getImageData(rc[0], rc[1], rc[2] - rc[0], rc[3] - rc[1]).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (fn(d[i], d[i + 1], d[i + 2])) n += 1;
    out[name] = n;
  }
  return out;
};

/**
 * 取样框 = 东桥头机枪口那一带（画作像素 1100,440 → 1270,600）。
 * 基线（纯画作，用 PIL 量过）：橙红 47 个像素 / 27200 —— 非常干净，所以"曳光有没有亮、有没有熄"能直接数出来。
 * 判据两式：橙红 = `r>150 && (r-b)>60 && (r-g)>40`（曳光与火）；金 = `g>170 && (r-b)>60`（掩护辉光）。
 */
const RECTS = { fire: [1100, 440, 1270, 600] };
const P_HOT = 'r>150 && (r-b)>60 && (r-g)>40';
const raster = (page) => page.evaluate(RASTER, { rects: RECTS, pred: P_HOT });

/* ══════════════ A. 几何与常量 ══════════════ */
{
  console.log('\n=== A. 几何与常量（桥面轴线自洽 / 火力递增 / 姿态取舍 / 两个极端都不成立） ===');
  const page = await newLabPage();
  const A = await page.evaluate(async () => {
    const m = await import('/js/minigames-luding.js?v=' + Date.now());
    const deckLen = m.DECK_LEN;
    const fireSum = m.FIRE.reduce((a, b) => a + b, 0);
    return {
      deck: m.DECK, crop: m.CROP, paint: m.PAINT, plate: m.PLATE, len: deckLen,
      pxm: m.PX_PER_M, bridge: m.BRIDGE_M, segs: m.SEGMENTS, segM: m.SEG_M,
      fire: m.FIRE, men: m.MEN, time: m.TIME,
      cling: m.CLING, rush: m.RUSH, swapSec: m.SWAP_SEC, swapHurt: m.SWAP_HURT,
      plankHurt: m.PLANK_HURT, planks: m.PLANKS, laySec: m.LAY_SEC, layHurt: m.LAY_HURT,
      covers: m.COVERS, coverSec: m.COVER_SEC,
      // 「两个极端都不成立」的算术证明
      clingSec: m.BRIDGE_M / m.CLING.spd,
      rushDead: (m.RUSH.hurt / m.RUSH.spd) * (m.BRIDGE_M / m.SEGMENTS) * fireSum,
      deck0: m.deckAt(0), deck1: m.deckAt(1), deckHalf: m.deckAt(0.5),
      scorePerfect: m.scoreOf('crossed', m.BRIDGE_M, 0, m.TIME, m.TIME),
      scoreWiped: m.scoreOf('wiped', m.BRIDGE_M * 0.9, m.MEN, m.TIME, m.TIME),
    };
  });

  const inside = (p, pad) => p.x >= A.crop.x + pad && p.x <= A.crop.x + A.crop.w - pad
    && p.y >= A.crop.y + pad && p.y <= A.crop.y + A.crop.h - pad;

  // —— 桥面轴线自洽 ——
  const span = Math.hypot(A.deck[0].x - A.deck[A.deck.length - 1].x, A.deck[0].y - A.deck[A.deck.length - 1].y);
  note(span > 1000,
    `A1【场景】桥面轴线首末相距 ${span.toFixed(0)} px > 1000 —— 否则"桥"实际上只剩一小截`);
  note(A.deck.every((p, i) => i === 0 || p.x > A.deck[i - 1].x),
    `A2【场景】轴线 x 单调递增（两端 ${A.deck[0].x} → ${A.deck[A.deck.length - 1].x}），桥面不是来回折的`);
  const ys = A.deck.map((p) => p.y);
  note(Math.max(...ys) - Math.min(...ys) < 90,
    `A3【场景】轴线落在同一条水平带里（y ${Math.min(...ys)}~${Math.max(...ys)}，跨度 ${Math.max(...ys) - Math.min(...ys)} < 90）—— 不是一头扎进水里`);
  note(A.deck.every((p) => inside(p, 8)),
    `A4【场景】9 个轴线点全在取景框内（框 ${A.crop.x},${A.crop.y},${A.crop.w}×${A.crop.h}）`);
  note(Math.abs(A.pxm - A.len / A.bridge) < 0.01,
    `A5【场景】px/米 由轴线长度推出：${A.pxm.toFixed(2)} px/m（轴线 ${A.len.toFixed(0)} px ÷ ${A.bridge} 米）`);

  // —— 火力曲线 ——
  note(A.fire.length === A.segs && A.fire.every((f, i) => i === 0 || f > A.fire[i - 1]),
    `A6 火力从西到东严格递增（${A.fire[0]} → ${A.fire[A.fire.length - 1]} 人/秒）`);
  note(A.fire[A.fire.length - 1] > A.fire[0] * 5,
    `A7 东段火力是西段的 ${(A.fire[A.fire.length - 1] / A.fire[0]).toFixed(1)} 倍 —— "板该留给哪一段"才有唯一答案`);

  // —— 姿态取舍方向 ——
  note(A.rush.spd > A.cling.spd * 2 && A.rush.hurt > A.cling.hurt * 5,
    `A8 姿态取舍方向正确：直起身 ${A.rush.spd} m/s·折人 ×${A.rush.hurt} vs 贴链 ${A.cling.spd} m/s·折人 ×${A.cling.hurt}`);
  note(A.swapSec > 0.3 && A.swapHurt > A.cling.hurt,
    `A9 换姿势有税：站住 ${A.swapSec}s 且这半秒按 ×${A.swapHurt} 算（站着换最容易挨枪）`);

  // —— 板与掩护的价值与稀缺 ——
  note(A.plankHurt < A.cling.hurt && A.plankHurt < A.rush.hurt,
    `A10【骨架】板面折人 ×${A.plankHurt} 低于两种姿态（贴 ×${A.cling.hurt} / 冲 ×${A.rush.hurt}）—— 板上"又快又安全"，这才是它值得用掉的理由`);
  note(A.planks * 2 <= A.segs,
    `A11【骨架】门板只够铺 ${A.planks} 段 / 共 ${A.segs} 段（最多半桥）—— 铺不满，必须挑`);
  note(A.covers * A.coverSec < A.time,
    `A12【骨架】掩护总量 ${A.covers}×${A.coverSec}=${A.covers * A.coverSec}s < 时限 ${A.time}s —— 掩护买不了整局`);

  // —— 两个极端都不成立（**算术证明**，不跑也算得出）——
  note(A.clingSec > A.time,
    `A13【骨架】一路贴链要 ${A.clingSec.toFixed(1)}s > 时限 ${A.time}s → "只求稳"这条线必输在时限`);
  note(A.rushDead > A.men,
    `A14【骨架】一路直冲要折 ${A.rushDead.toFixed(1)} 人 > 全队 ${A.men} 人 → "只求快"这条线必输在折人`);
  note(A.scorePerfect <= 1 && A.scoreWiped < 0.35,
    `A15 分数分叉留得开：完美 ${A.scorePerfect.toFixed(3)} / 打光 ${A.scoreWiped.toFixed(3)}`);
  note(A.plate === '/assets/scenes/luding_bridge.jpg',
    `A16【场景】场景图指向项目里那张真油画：${A.plate}`);
  await page.close();
}

/* ══════════════ B. 失败线一：一路贴链 → 时限 ══════════════ */
{
  console.log('\n=== B. 失败线一：一路贴链（短表 22 秒，省掉真等 78 秒） ===');
  const page = await newLabPage();
  await boot(page, { time: 22 });
  const b0 = await read(page);
  note(b0.miniState === 'brief' && b0.acts.includes('start'),
    `B1 开局 brief，只有一个「上桥」（${b0.acts.join(',')}）`);
  await start(page);
  const b1 = await read(page);
  note(b1.miniState === 'cross' && b1.acts.includes('cling') && b1.acts.includes('lay') && b1.acts.includes('cover'),
    `B2 上桥后 cross，三个操作都在（${b1.acts.join(',')}）`);
  note(N(b1.miniPlanks) === 6 && N(b1.miniCovers) === 3 && N(b1.miniDead) === 0,
    `B3 起手资源：门板 ${b1.miniPlanks} · 掩护 ${b1.miniCovers} · 折损 ${b1.miniDead}`);
  await holdCling(page, true);
  let last = b1;
  const t0 = Date.now();
  for (let i = 0; i < 700; i += 1) {
    await sleep(80);
    last = await read(page);
    if (last.res || last.miniState === 'done') break;
  }
  await holdCling(page, false);
  const secs = (Date.now() - t0) / 1000;
  note(!!last.res && last.res.detail.outcome === 'fire',
    `B4 一路贴链 → fire（时限到火封桥；用时 ${secs.toFixed(1)}s）`);
  note(N(last.miniM) < 30,
    `B5 而且真的没走远（到 ${last.res ? last.res.detail.meters : last.miniM} 米 / 102）—— 贴链速度就是买不起时间`);
  info(`结算：score=${last.res ? last.res.score.toFixed(2) : '—'} · ${last.res ? last.res.summary : ''}`);
  await page.close();
}

/* ══════════════ C. 失败线二：一路直冲 → 折满 ══════════════ */
{
  console.log('\n=== C. 失败线二：一路直冲（真参数，约 30 秒） ===');
  const page = await newLabPage();
  await boot(page, {});
  await start(page);
  const c0 = await read(page);
  note(c0.miniStance === 'rush', `C1 起手姿态是「直起身冲」（${c0.miniStance}）—— 松开键才是默认状态`);
  const fire0 = N(c0.miniFire);
  await sleep(700);
  const c1 = await read(page);
  // ⚠️ 这里只能看**连续折人率**，不能等 miniDead 攒成整数：第一段火力 0.13 人/秒，
  //    0.7 秒的窗口连一个人都攒不满（要 7.7 秒才折 1 个）。"真的在折人"由 C5 折满 22 人来证。
  note(N(c1.miniHurt) > 0 && N(c1.miniM) > N(c0.miniM),
    `C2 直冲时折人率 >0 且真的在前进（×${c1.miniHurt} 人/秒 · 到 ${c1.miniM} 米）`);
  note(Math.abs(N(c1.miniHurt) / fire0 - A_RUSH_HURT) < A_RUSH_HURT * 0.2,
    `C3【骨架】折人率是连续量且口径正确：miniHurt ${c1.miniHurt} ≈ 火力 ${fire0} × ${A_RUSH_HURT}（直起身）`);
  let last = c1;
  const t0 = Date.now();
  for (let i = 0; i < 900; i += 1) {
    await sleep(80);
    last = await read(page);
    if (last.res || last.miniState === 'done') break;
  }
  const secs = (Date.now() - t0) / 1000;
  note(!!last.res && last.res.detail.outcome === 'wiped',
    `C4 一路直冲 → wiped（折满 22 人；用时约 ${secs.toFixed(1)}s）`);
  note(N(last.miniDead) === 22 && last.rankDots === 0,
    `C5 折满 22 人且画面上的队列点归零（点 ${last.rankDots} 个）—— "少人"是画出来的，不只是数字`);
  note(N(last.miniM) > 60,
    `C6 而且他确实冲得很远（到 ${last.res ? last.res.detail.meters : last.miniM} 米）—— 不是被卡住，是被打光`);
  info(`结算：score=${last.res ? last.res.score.toFixed(2) : '—'} · ${last.res ? last.res.summary : ''}`);
  await page.close();
}

/* ══════════════ D. 骨架判据 ══════════════ */
{
  console.log('\n=== D. 骨架判据（连续姿态 / 换挡税 / 板铺在脚下 / 掩护停火） ===');
  const page = await newLabPage();
  await boot(page, { time: 200 });      // 时间放宽，专门测机制，不怕时限来打断
  await start(page);
  const d0 = await read(page);
  await holdCling(page, true);
  await sleep(300);
  const d1 = await read(page);
  note(d1.miniStance === 'cling', `D1 按住「贴链」→ miniStance=cling（${d1.miniStance}）`);

  // 判据①：姿态真的改变前进速度（不是只换个字）
  const m1 = N(d1.miniM);
  await sleep(1200);
  const d2 = await read(page);
  const slow = (N(d2.miniM) - m1) / 1.2;
  await holdCling(page, false);
  await sleep(1100);                    // 含 0.75s 换姿势
  const d3 = await read(page);
  const m3 = N(d3.miniM);
  await sleep(1200);
  const d4 = await read(page);
  const fast = (N(d4.miniM) - m3) / 1.2;
  note(d2.miniStance === 'cling' && d4.miniStance === 'rush' && fast > slow * 1.8,
    `D2【骨架】姿态是连续量、真的改速度：贴链 ${slow.toFixed(2)} m/s → 直起身 ${fast.toFixed(2)} m/s（×${(fast / Math.max(0.01, slow)).toFixed(1)}）`);

  // 判据②（最关键）：折人率口径。老骨架（预警→按一下→扣 1）在 dataset 里**没有这个量**
  await holdCling(page, true);
  await sleep(900);      // ⚠️ 必须等换挡走完（SWAP_SEC=0.75）：换挡那半秒记的是 SWAP_HURT(×1.2)，
  const d5 = await read(page);   //    抢在换挡里取样会读到 ×1.2，看着像"两种姿态口径都不对"
  const hurtC = N(d5.miniHurt); const fireC = N(d5.miniFire);
  await holdCling(page, false);
  await sleep(900);
  const d6 = await read(page);
  const hurtR = N(d6.miniHurt); const fireR = N(d6.miniFire);
  note(d5.miniStance === 'cling' && d6.miniStance === 'rush'
    && N(d5.miniSwap) === 0 && N(d6.miniSwap) === 0        // 换挡已结束，采到的是稳态口径
    && Math.abs(hurtC / fireC - A_CLING_HURT) < A_CLING_HURT * 0.25
    && Math.abs(hurtR / fireR - A_RUSH_HURT) < A_RUSH_HURT * 0.25
    && hurtR > hurtC * 4,
    `D3【骨架】每秒折人率是连续量、且两种姿态口径都对：贴链 ${hurtC.toFixed(3)}=火力×${(hurtC / fireC).toFixed(2)}`
    + ` / 冲 ${hurtR.toFixed(3)}=火力×${(hurtR / fireR).toFixed(2)}（警示：老骨架读不出这个字段）`);

  // 判据③：换姿势要站住（0.75s 速度归零）
  await holdCling(page, true);
  let sawSwap = null;
  for (let i = 0; i < 40; i += 1) {
    const s = await read(page);
    if (N(s.miniSwap) > 0) { sawSwap = s; break; }
    if (N(s.miniM) > 0) { /* 继续等 */ }
    await sleep(30);
  }
  note(!!sawSwap && N(sawSwap.miniStance) !== undefined,
    `D4【骨架】换姿势有硬直：捕获到 miniSwap=${sawSwap ? sawSwap.miniSwap : '未采到'}s（站住，不前进）`);
  if (sawSwap) {
    const mS = N(sawSwap.miniM);
    await sleep(220);
    const s2 = await read(page);
    const moved = N(s2.miniM) - mS;
    note(moved < 0.35,
      `D4b【骨架】换姿势这半秒真的不前进（0.22s 里只走了 ${moved.toFixed(2)} 米）`);
  } else {
    note(false, 'D4b 跳过（没采到换姿势帧）');
  }
  await holdCling(page, false);
  await sleep(900);

  // 判据④：门板 —— 作用在脚下这一段、要停下、铺完真的更安全
  // ⚠️ 先走到**段中间**再铺板。走路速度是连续的、停不下来，所以只能挑"什么时候点"：
  //    D 段走过来时脚下离 8.5m 那条段界只剩零点几米（实测 8.4 米处），而铺完必须再等一帧
  //    才落到"站在板上"的稳态 —— 一帧就迈过段界，脚下换了段、`miniPlanked` 对不上，
  //    比值立刻变回 ×1.85。那是**假红**（板其实生效了，只是人走了）。
  //    走到第 2 段中段（10 米出头）再铺，段界在 17 米，后面几秒怎么走都还在这一段。
  await holdCling(page, false);
  for (let i = 0; i < 60; i += 1) {
    const s = await read(page);
    if (N(s.miniM) > 10.2 || s.res || s.miniState === 'done') break;
    await sleep(70);
  }
  await holdCling(page, true);   // 贴链慢挪，给点击留出余量（也顺带把换挡结清）
  await sleep(140);
  const e0 = await read(page);
  const segNow = N(e0.miniSeg);
  const before = N(e0.miniPlanks);
  const okLay = await clickAct(page, 'lay');
  await sleep(200);
  const e1 = await read(page);
  note(okLay && N(e1.miniLay) > 0 && N(e1.miniPlanks) === before - 1,
    `D5 点「铺门板」→ 正在铺（miniLay=${e1.miniLay}s）且门板 ${before}→${e1.miniPlanks}`);
  const mLay = N(e1.miniM);
  await sleep(600);
  const e2 = await read(page);
  note(N(e2.miniLay) > 0 && Math.abs(N(e2.miniM) - mLay) < 0.4,
    `D6【骨架】铺板期间你必须停下（0.6s 里走了 ${(N(e2.miniM) - mLay).toFixed(2)} 米）—— 三连在火力下扛板，你走不了`);
  for (let i = 0; i < 40 && N((await read(page)).miniLay) > 0; i += 1) await sleep(120);
  await sleep(100);   // 铺完那一帧仍按 LAY_HURT 记；先放过一帧，再采"站在板上"的稳态
  // 采样条件同时要求：铺板结束 · 没有换挡在途 · **脚下还是那一段**（否则采到的不是这块板的效果）
  let e3 = null;
  for (let i = 0; i < 20; i += 1) {
    const s = await read(page);
    if (N(s.miniLay) === 0 && N(s.miniSwap) === 0 && N(s.miniSeg) === segNow) { e3 = s; break; }
    await sleep(60);
  }
  e3 = e3 || await read(page);
  const doneList = (e3.miniPlanked || '').split(',').filter(Boolean).map(Number);
  note(doneList.includes(segNow) && e3.plankBand >= 1,
    `D7 铺好的段进了 miniPlanked=${e3.miniPlanked}（且画面上有 ${e3.plankBand} 段板带）`);
  // 板上折人率必须**低于**同段直冲
  const onPlank = N(e3.miniHurt);
  const fireHere = N(e3.miniFire);
  note(N(e3.miniSwap) === 0 && N(e3.miniSeg) === segNow
    && Math.abs(onPlank / fireHere - A_PLANK_HURT) < A_PLANK_HURT * 0.3,
    `D8【骨架】板铺在第 ${segNow} 段、取样时脚下也在第 ${e3.miniSeg} 段：折人率 火力×${(onPlank / fireHere).toFixed(3)}`
    + `（板 ×${A_PLANK_HURT} vs 冲 ×${A_RUSH_HURT}，差 ${(A_RUSH_HURT / A_PLANK_HURT).toFixed(0)} 倍）`);
  await holdCling(page, false);   // 后面的掩护判据回到"直起身"，和上一轮验过的路径一致
  await sleep(900);               // 让换挡走完，别把 ×1.20 带进 D9

  // 判据⑤：掩护停火 + 不可叠加
  const f0 = await read(page);
  const cov0 = N(f0.miniCovers);
  const okCov = await clickAct(page, 'cover');
  await sleep(200);
  const f1 = await read(page);
  note(okCov && N(f1.miniCover) > 0 && N(f1.miniCovers) === cov0 - 1 && N(f1.miniHurt) === 0,
    `D9【骨架】打掩护 → 停火 ${f1.miniCover}s、折人归零（${f1.miniHurt}）、掩护 ${cov0}→${f1.miniCovers}`);
  const covBtn = await page.$('#l-host [data-mini-action="cover"]');
  const covDisabled = covBtn ? await covBtn.isDisabled() : null;
  note(covDisabled === true,
    'D10 掩护生效期间「打掩护」是灰的（三发不能叠加同时生效）');
  const mC = N(f1.miniM);
  await sleep(700);
  const f2 = await read(page);
  note(N(f2.miniM) > mC,
    `D11 掩护期间照样前进（${mC.toFixed(1)} → ${f2.miniM} 米）—— 停火是"能放心冲"，不是"暂停"`);

  // 掩护用满 3 发后按钮必须灰
  const left = N((await read(page)).miniCovers);
  for (let i = 0; i < left; i += 1) {
    for (let k = 0; k < 80 && N((await read(page)).miniCover) > 0; k += 1) await sleep(120);
    await clickAct(page, 'cover');
    await sleep(150);
  }
  const f3 = await read(page);
  const covBtn2 = await page.$('#l-host [data-mini-action="cover"]');
  const covDisabled2 = covBtn2 ? await covBtn2.isDisabled() : null;
  note(N(f3.miniCovers) === 0 && covDisabled2 === true,
    `D12 三发用尽后按钮变灰（掩护剩 ${f3.miniCovers}）—— 家底有限，用早了后面没牌`);
  await page.close();
}

/* ══════════════ E. 成功线（编排） ══════════════ */
{
  console.log('\n=== E. 成功线：掩护抢时间 + 西段贴身过 + 第 7 段起逐段铺板 ===');
  const page = await newLabPage();
  await boot(page, {});
  await start(page);
  let holding = false;
  const setHold = async (v) => { if (v !== holding) { holding = v; await holdCling(page, v); } };
  let last = await read(page);
  const t0 = Date.now();
  for (let i = 0; i < 1800; i += 1) {
    last = await read(page);
    if (last.res || last.miniState === 'done') break;
    const m = N(last.miniM); const seg = N(last.miniSeg);
    const planks = N(last.miniPlanks); const covers = N(last.miniCovers); const cover = N(last.miniCover);
    const lay = N(last.miniLay);
    const done = (last.miniPlanked || '').split(',').filter(Boolean).map(Number);
    if (m < 51) {
      // 西段：用掩护换时间（掩护期间直起身冲，掩护之间贴住）
      await setHold(false);
      if (covers > 0 && cover <= 0) await clickAct(page, 'cover');
    } else if (lay > 0) {
      await setHold(false);                       // 铺板中，什么都别按
    } else if (planks > 0 && !done.includes(seg)) {
      await setHold(false);
      await clickAct(page, 'lay');
    } else {
      await setHold(false);
    }
    await sleep(90);
  }
  await setHold(false);
  for (let i = 0; i < 40 && !(await read(page)).res; i += 1) await sleep(150);
  const fin = await read(page);
  const secs = (Date.now() - t0) / 1000;
  const done = fin.res;
  note(!!done && done.detail.outcome === 'crossed',
    `E1 编排打法 → crossed（outcome=${done ? done.detail.outcome : '未结算'}；实跑 ${secs.toFixed(1)}s）`);
  if (done && done.detail.outcome === 'crossed') {
    note(done.score >= 0.60,
      `E2 过桥分 ≥ 0.60（score=${done.score.toFixed(3)} · 折 ${done.detail.dead} 活 ${done.detail.alive} · 用时 ${done.detail.usedSec}s）`);
    note(done.detail.planked.length > 0 && done.detail.planked.every((i) => i >= 6),
      `E3 板全铺在火力强的后半场（段 ${done.detail.planked.join(',')}）—— 铺在西段等于白扔`);
    note(done.detail.coversLeft === 0,
      'E4 三发掩护都用掉了（它买时间，不用就白给）');
    info(`结算：${done.summary}`);
  } else {
    note(false, `E2/E3/E4 跳过（outcome=${done ? done.detail.outcome : '未结算'}）`);
    info(`收尾状态：到 ${fin.miniM} 米 · 折 ${fin.miniDead} 人 · 板剩 ${fin.miniPlanks} · 掩护剩 ${fin.miniCovers}`);
  }
  await page.close();
}

/* ══════════════ F. 契约与画面 ══════════════ */
{
  console.log('\n=== F. 契约与画面（含像素判据：火力亮起 / 被掩护压灭） ===');
  note(pageErrs.length === 0, `F1 整轮 0 条未捕获页面异常（实得 ${pageErrs.length}）`);
  if (pageErrs.length) pageErrs.slice(0, 6).forEach((e) => info(e));

  // —— 减动效 + 真点击命中（板屏遮挡这一整类缺陷只在 reduced-motion 下暴露）——
  const rm = await newLabPage({ reducedMotion: 'reduce' });
  await rm.emulateMedia({ reducedMotion: 'reduce' });
  await boot(rm, { time: 200 });
  const r0 = await read(rm);
  const okStart = await clickAct(rm, 'start');
  await sleep(200);
  const r1 = await read(rm);
  note(okStart && r1.miniState === 'cross', 'F2【减动效】「上桥」点得动（真点击、不加 force）');
  const okCling = await rm.$('#l-host [data-mini-action="cling"]');
  let clicked = false;
  if (okCling) {
    const box = await okCling.boundingBox();
    await rm.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await rm.mouse.down();
    clicked = true;
    await sleep(220);
    const r2 = await read(rm);
    note(clicked && r2.miniStance === 'cling', `F3【减动效】「按住贴链」按得下且真的切姿态（${r2.miniStance}）`);
    await rm.mouse.up();
  } else {
    note(false, 'F3【减动效】找不到「按住贴链」按钮');
  }
  const planksBefore = N((await read(rm)).miniPlanks);
  const okLay2 = await clickAct(rm, 'lay');
  await sleep(200);
  const r3 = await read(rm);
  note(okLay2 && N(r3.miniPlanks) === planksBefore - 1 && N(r3.miniLay) > 0,
    `F4【减动效】「铺门板」点得动（门板 ${planksBefore}→${r3.miniPlanks}，铺板中 ${r3.miniLay}s）`);
  await rm.close();

  // —— 契约 ——
  const page = await newLabPage();
  await boot(page, {});
  const st = await read(page);
  note(st.mini === 'luding-chain', `F5 host[data-mini]=${st.mini}`);
  note(st.hits === 0, `F6 全程 0 次 /api/decide（实得 ${st.hits}）`);
  const want = ['brief', 'cross', 'done'];
  const seq = [...seenStates];
  note(want.every((w) => seq.includes(w)),
    `F7 状态词覆盖 ${want.join('/')}（实得 ${seq.join('/') || '（无）'}）`);
  note(st.plateSrc === '/assets/scenes/luding_bridge.jpg' && st.plateLoaded,
    `F8【场景】画面里真的铺着那张油画（src=${st.plateSrc} · 已解码 ${st.plateNat}）`);
  const C = await page.evaluate(async () => (await import('/js/minigames-luding.js?v=' + Date.now())).CROP);
  note(st.viewBox === `${C.x} ${C.y} ${C.w} ${C.h}`,
    `F9【场景】覆盖层坐标系 = 取景框画作像素（viewBox="${st.viewBox}"）`);
  const hres = await fetch(`${BASE}/assets/scenes/luding_bridge.jpg`, { method: 'HEAD' });
  note(hres.status === 200, `F10 资源可达：HEAD /assets/scenes/luding_bridge.jpg → ${hres.status}`);

  // —— 像素判据 ——
  const base = await raster(page);
  if (base.err) {
    note(false, `F11 覆盖层光栅化失败：${base.err}（像素判据没法做，按红处理）`);
  } else {
    info(`光栅化基线：东桥头取样框内橙红 ${base.fire} 个像素 / 27200（纯画作基线是 47）`);
    // ① 火力随段数上升。取样点选在**第 9 段（70 米出头，火力 0.77）**，不是 95 米：
    //    一路直冲、不铺板不掩护，实测在 88 米就折满 22 人（见 C 段）——真等到 m>95 的话板屏已经
    //    done、掩护按钮按不动，F12 会以"掩护 0 秒"的样子假红。70 米取样时还活着，火力已是起点 6 倍。
    await start(page);
    await sleep(400);
    const lowFire = await raster(page);
    for (let i = 0; i < 400; i += 1) {
      const s = await read(page);
      if (N(s.miniM) > 70 || s.res) break;
      await sleep(120);
    }
    const sHi = await read(page);
    note(N(sHi.miniM) > 70 && !sHi.res,
      `F11a 取样时还活着、且已到高火力段（${sHi.miniM} 米 · 第 ${sHi.miniSeg} 段 · 火力 ${sHi.miniFire}）`);
    const hiFire = await raster(page);
    note(hiFire.fire > lowFire.fire * 1.5 + 500,
      `F11【画面】火力曳光真的跟着火力亮起来：低火力段 ${lowFire.fire} → 高火力段 ${hiFire.fire} 个橙红像素`);
    // ② 掩护把它压灭
    await clickAct(page, 'cover');
    await sleep(300);
    const sCover = await read(page);
    const covShot = await raster(page);
    note(N(sCover.miniCover) > 0 && covShot.fire < hiFire.fire * 0.35,
      `F12【画面】打掩护后东桥头枪口真的熄了：${hiFire.fire} → ${covShot.fire} 个橙红像素`
      + `（掩护 ${sCover.miniCover}s · 折人 ${sCover.miniHurt}）`);
    await page.screenshot({ path: path.join(OUT, 'pixel-fire.png') });
  }
  await page.close();
}

console.log(`\n（口径参照：贴链 ×${A_CLING_HURT} · 直冲 ×${A_RUSH_HURT} · 板面 ×${A_PLANK_HURT}）`);

console.log(`\n${bad === 0 ? '【全绿】' : '【有红】'} 失败 ${bad} 项`);
// ⚠️ 本机 `browser.close()` 会挂住 —— 而且不是"慢"，是**连 setTimeout 硬退都不发火**：
//    实测脚本已经打完所有输出，进程仍能挂 40 分钟不走。所以别走 close()：直接掐 chrome 再硬退。
try { browser.process()?.kill('SIGKILL'); } catch { /* 已经没了就算了 */ }
process.exit(0);
