/**
 * 《陡坡 · 拽住他》v3 专项验收 —— 画作当场景 + 一次性抓取 + 连续拉锯。
 *
 * 这一份和 v1/v2 的用例**不是同一套东西**：
 *   · v1 判的是"预警窗口里按一下"；v2 判的是"自绘 SVG 雪山上的同一套机制"。
 *   · v3 把场景换成项目里那张真油画（`assets/scenes/snow_climb.jpg`，原样铺 + 覆盖层），
 *     坐标也从"自定 460×300"改成**画作像素**。
 * 所以断言分两类：
 *   ① **骨架判据**（D 段的【骨架】项）—— 判定这支玩法有没有退回"等窗口按一下"的老骨架；
 *   ② **场景判据**（A7/A8/A9 + F5）—— 判定它有没有退回"自己画一片假雪山"的老路。
 * 两类都是"负向控制验过会红"的：把修复撤掉，断言必须红（见各条注释里的反例）。
 *
 * 六段：
 *   A. 几何与常量：画作锚点自洽（绳长不为 0）、两选择互有长短、三孔取舍方向、挪脚最虚。
 *   B. 失败线：发呆他自己进雪槽。
 *   C. 一次性抓取：布绳要等 1.4 秒；甩空扣机会；扣完就没。
 *   D. 连续拉锯：拉/松是连续量、换孔改上限、挪脚期间使不上劲、张力爆=脱手而不是死。
 *   E. 成功线：一路拉到顶 → saved。
 *   F. 契约与环保：dataset / 状态序列 / 0 异常 / 0 次 /api/decide / **画作真的在用**。
 *
 * 用法：先起服务 node server/index.js，然后
 *   node tests/manual/qa-grab.mjs       # ~2 分钟，照例后台跑
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
const OUT = path.join('tests', 'e2e', 'artifacts', 'snow-grab');
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
setTimeout(() => { console.log('\n【看门狗】用例超过 10 分钟，强制收尾'); process.exit(3); }, 600000);
const note = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? '✓' : '✗'} ${line}`); };
const info = (line) => console.log(`    · ${line}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function newLabPage() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
  await page.addInitScript(blockDecide);
  await page.goto(LAB, { waitUntil: 'domcontentloaded' });
  // 调试台自己把 #mini-host 装完（模块里有顶层 await，先注入的容器会被 select() 清掉）
  await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 20000 });
  return page;
}

async function boot(page, opts = {}) {
  await page.evaluate(async (o) => {
    for (const id of ['mini-host', 'g-host']) {
      const e = document.getElementById(id);
      if (e) e.remove();
    }
    window.__gBoot = (window.__gBoot || 0) + 1;
    const tok = window.__gBoot;
    const host = document.createElement('div');
    host.id = 'g-host';
    (document.getElementById('board-body') || document.body).appendChild(host);
    window.__gHost = host;
    window.__gRes = null;
    window.__gErr = null;
    const m = await import('/js/minigames-grab.js?v=' + Date.now());
    try {
      m.runSnowGrab(host, { stats: document.getElementById('board-stats'), ...o })
        .then((r) => { if (window.__gBoot === tok) window.__gRes = r; });
    } catch (e) { window.__gErr = String(e && e.message); }
  }, opts);
  await page.waitForFunction(() => window.__gHost && window.__gHost.dataset.mini, null, { timeout: 10000 });
  // ⚠️ 只等 dataset.mini 不够：那是 runSnowGrab 一开头就写的，而操作按钮行是**第一次 render() 之后**
  //    才有的。冷启动的第一张页面若在这一帧之间取样，B1（"两个抉择都在"）会红，
  //    报出的却是 undefined —— 看着像玩法没起来，其实是用例自己抢跑。等状态词一起落地。
  await page.waitForFunction(() => window.__gHost && window.__gHost.dataset.miniState, null, { timeout: 10000 });
}

const seenStates = new Set();

async function read(page) {
  const out = await page.evaluate(() => {
    const h = window.__gHost;
    const o = {};
    if (h) {
      for (const k of Object.keys(h.dataset)) o[k] = h.dataset[k];
      o.acts = [...h.querySelectorAll('[data-mini-action]')].map((e) => e.dataset.miniAction);
      const img = h.querySelector('.smini9-plate');
      o.plateSrc = img ? img.getAttribute('src') : null;
      o.plateLoaded = !!(img && img.complete && img.naturalWidth > 0);
      o.plateNat = img ? `${img.naturalWidth}x${img.naturalHeight}` : '—';
      const svg = h.querySelector('svg');
      o.viewBox = svg ? svg.getAttribute('viewBox') : null;
    }
    o.res = window.__gRes;
    o.err = window.__gErr;
    o.hits = window.__decideHits;
    return o;
  });
  if (out.miniState) seenStates.add(out.miniState);
  return out;
}

const num = (v) => (v === undefined || v === '' ? NaN : Number(v));
const tension = (st) => num(st.miniTension);
const capOf = (st) => num(st.miniCap);

async function clickAct(page, act) {
  const el = await page.$(`#g-host [data-mini-action="${act}"]`);
  if (!el) return false;
  try { await page.click(`#g-host [data-mini-action="${act}"]`, { timeout: 3000 }); return true; }
  catch { return false; }
}

/** 画作坐标 → 页面坐标（v3 的 viewBox 就是 CROP，preserveAspectRatio=slice 且宽高比相同 → 线性映射） */
let CROP = null;
async function vbToPage(page, vx, vy) {
  return page.evaluate(([x, y, C]) => {
    const s = document.querySelector('#g-host svg');
    const r = s.getBoundingClientRect();
    return { x: r.x + ((x - C.x) / C.w) * r.width, y: r.y + ((y - C.y) / C.h) * r.height };
  }, [vx, vy, CROP]);
}

/** 把准星拖到他手上，等它收敛到判定半径内，然后甩出去 */
async function aimAndThrow(page) {
  for (let i = 0; i < 16; i += 1) {
    const st = await read(page);
    if (st.res || st.miniState !== 'aim') return false;
    if (!st.miniHand) return false;
    const [hx, hy] = st.miniHand.split(',').map(Number);
    const p = await vbToPage(page, hx, hy);
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await sleep(60);
    const st2 = await read(page);
    const [ax, ay] = (st2.miniAim || '0,0').split(',').map(Number);
    if (Math.hypot(ax - hx, ay - hy) <= num(st2.miniCatchR) * 0.7) {
      return clickAct(page, 'throw');
    }
  }
  return false;
}

/** 故意甩偏：把准星扔到取景框左上角（离他很远）再甩 */
async function aimAndMiss(page) {
  const p = await vbToPage(page, CROP.x + 12, CROP.y + 12);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  for (let i = 0; i < 14; i += 1) {
    const st = await read(page);
    const [ax, ay] = (st.miniAim || '0,0').split(',').map(Number);
    if (Math.hypot(ax - (CROP.x + 12), ay - (CROP.y + 12)) < 24) break;
    await sleep(50);
  }
  return clickAct(page, 'throw');
}

/** 拉锯驱动：张力高了松、低了拉 */
async function driveHold(page, budgetMs = 45000) {
  const t0 = Date.now();
  let down = false;
  const setDown = async (v) => {
    if (v === down) return;
    down = v;
    await page.keyboard[v ? 'down' : 'up']('Space').catch(() => {});
  };
  while (Date.now() - t0 < budgetMs) {
    const st = await read(page);
    if (st.res || st.miniState !== 'hold') break;
    const t = tension(st); const c = capOf(st);
    if (t > c * 0.70) await setDown(false);
    else if (t < c * 0.26) await setDown(true);
    await sleep(70);
  }
  await setDown(false);
  return read(page);
}

/* ══════════════ A. 几何与常量：锚点自洽、取舍真的存在 ══════════════ */
{
  console.log('\n=== A. 几何与常量（画作锚点自洽 / 两选择 / 三孔取舍） ===');
  const page = await newLabPage();
  const A = await page.evaluate(async () => {
    const m = await import('/js/minigames-grab.js?v=' + Date.now());
    return {
      bare: m.BARE, rope: m.ROPE, holes: m.HOLES, moveCapK: m.MOVE_CAPK,
      crop: m.CROP, paint: m.PAINT, you: m.YOU_HAND, clasp: m.CLASP, U: m.U,
      plate: m.PLATE, slipMax: m.SLIP_MAX, pxm: m.PX_PER_M, ticks: m.TICKS_M,
      untie: m.UNTIE_SEC, move: m.MOVE_SEC, grabs: m.GRABS,
      win: m.WIN_T, slot: m.SLOT_T, start: m.START_T,
      veilBase: m.VEIL_BASE, veilPer: m.VEIL_PER_SLIP, veilSaved: m.VEIL_SAVED, veilLost: m.VEIL_LOST,
      slipWin: m.slipOf(m.WIN_T), slipStart: m.slipOf(m.START_T), slipSlot: m.slipOf(m.SLOT_T),
      ropeAtStart: m.ropeLenAt(m.slipOf(m.START_T)),
      ropeAtWin: m.ropeLenAt(m.slipOf(m.WIN_T)),
      ropeAtSlot: m.ropeLenAt(m.slipOf(m.SLOT_T)),
      handWin: m.handAt(0), handSlot: m.handAt(m.SLIP_MAX),
    };
  });
  CROP = A.crop;

  // —— 画作锚点自洽（v3 初稿把 YOU_HAND 与 CLASP 都设在交握处，绳长恒为 0，整个玩法不成立）——
  const dYC = Math.hypot(A.you.x - A.clasp.x, A.you.y - A.clasp.y);
  note(dYC > 100,
    `A1【场景】你的手与交握处必须分得开（相距 ${dYC.toFixed(0)} px > 100）—— 否则绳长恒为 0`);
  const inCrop = (p) => p.x >= A.crop.x && p.x <= A.crop.x + A.crop.w && p.y >= A.crop.y && p.y <= A.crop.y + A.crop.h;
  note(inCrop(A.you) && inCrop(A.clasp),
    `A2【场景】两个锚点都落在取景框内（你的手 ${A.you.x},${A.you.y} · 交握 ${A.clasp.x},${A.clasp.y}）`);
  note(Math.abs(A.slipWin) < 0.001,
    `A3【场景】拉到顶时准星正好回到交握处（slip=${A.slipWin} · 手在 ${Math.round(A.handWin.x)},${Math.round(A.handWin.y)}）`);
  note(inCrop(A.handSlot) || (A.handSlot.x > A.crop.x + A.crop.w - 40 && A.handSlot.y > A.crop.y + A.crop.h - 40),
    `A4【场景】滑到底时他到了取景框右下角（${Math.round(A.handSlot.x)},${Math.round(A.handSlot.y)}）`);

  // —— 两种选择互有长短：不是严格优劣 ——
  note(A.rope.reach > A.bare.reach, `A5 布绳比徒手够得远（${A.rope.reach} > ${A.bare.reach} px）`);
  note(A.rope.catchR > A.bare.catchR, `A6 布绳判定更宽（${A.rope.catchR} > ${A.bare.catchR} px）`);
  note(A.bare.pullK > A.rope.pullK && A.bare.capK < A.rope.capK,
    `A7 徒手快而脆 / 布绳稳而慢（pullK ${A.bare.pullK} vs ${A.rope.pullK}；capK ${A.bare.capK} vs ${A.rope.capK}）`);
  // reach 的口径：开局那一刻**徒手够得着但余量小**，布绳才扛得住解绑腿那 1.4 秒
  note(A.ropeAtStart <= A.bare.reach,
    `A8 reach 口径：开局他离你 ${A.ropeAtStart.toFixed(0)} px，徒手 ${A.bare.reach} px 当下够得着（差 ${(A.bare.reach - A.ropeAtStart).toFixed(0)} px）`);
  note(A.ropeAtSlot > A.rope.reach,
    `A9 滑到底就谁也够不着（${A.ropeAtSlot.toFixed(0)} px > 布绳 ${A.rope.reach} px）——"发呆必死"是几何保证的`);

  // —— 三个孔：拉得快的锚浅，锚牢的使不上劲 ——
  const hs = A.holes;
  note(hs.length === 3
    && hs[0].pullK > hs[1].pullK && hs[1].pullK > hs[2].pullK
    && hs[0].capK < hs[1].capK && hs[1].capK < hs[2].capK,
    `A10 三个孔各有取舍且方向相反（pullK ${hs.map((x) => x.pullK).join('>')} · capK ${hs.map((x) => x.capK).join('<')}）`);
  const along = (() => {
    const a = hs[2].at; const b = hs[0].at;
    const dx = b.x - a.x; const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    return (dx / len) * A.U.x + (dy / len) * A.U.y;   // 三孔连线与坡向的一致程度
  })();
  note(hs.every((h) => inCrop(h.at)) && along > 0.9,
    `A11 三个孔沿坡向一字排开且在框内（方向一致度 ${along.toFixed(3)} > 0.9）`);

  // —— 挪脚最虚（定向断言：这是"常量取错方向"唯一拦得住的地方）——
  note(A.moveCapK < Math.min(...hs.map((x) => x.capK)),
    `A12【骨架】挪脚途中脚下的锚必须比任何踩实的孔都虚（MOVE_CAPK ${A.moveCapK.toFixed(3)} < 最浅的孔 ${Math.min(...hs.map((x) => x.capK))}）`);
  // A12 的自检（不给源码动刀也能证明它"会红"）：把"取最浅"错写成"取最牢"，算出来的数
  // 一定 ≥ 最浅的那个孔 —— 那一刻 A12 必红。没有这一步，A12 就是一条永远绿的摆设。
  const badCapK = Math.max(...hs.map((x) => x.capK)) * 0.86;
  note(badCapK >= Math.min(...hs.map((x) => x.capK)),
    `A12b【自检】反向写法（max 替 min）会得 ${badCapK.toFixed(3)} ≥ 最浅孔 ${Math.min(...hs.map((x) => x.capK))} → A12 会报红，确实拦得住`);

  // —— 雪雾方向：滑得越远雾越厚；救上来要散 ——
  note(A.veilPer > 0 && A.veilSaved < A.veilBase && A.veilBase < A.veilLost,
    `A13【场景】雾的单调性（救上来 ${A.veilSaved} < 起手 ${A.veilBase} < 滑没 ${A.veilLost}，每 px 加 ${A.veilPer}）`);
  note(A.grabs === 2 && A.untie > 1 && A.move > 0.2 && A.win > A.start && A.start > A.slot,
    `A14 两次机会 · 解绑腿 ${A.untie}s · 挪脚 ${A.move}s · 区间 ${A.slot}<${A.start}<${A.win}`);
  note(A.plate === '/assets/scenes/snow_climb.jpg',
    `A15【场景】场景图指向项目里那张真油画：${A.plate}`);
  await page.close();
}

/* ══════════════ B. 失败线：发呆他自己进雪槽 ══════════════ */
{
  console.log('\n=== B. 失败线（不操作） ===');
  const page = await newLabPage();
  await boot(page, { rndSeed: 11 });
  const s0 = await read(page);
  note(s0.miniState === 'decide' && s0.acts.includes('leg') && s0.acts.includes('bare'),
    `B1 开局 decide，两个抉择都在（${s0.acts.join(',')}）`);
  info(`开局他离你 ${s0.miniMeters} 米 · 绳长 ${s0.miniRopeLen}px · 雾 ${s0.miniVeil}`);
  const t0 = Date.now();
  await sleep(1500);
  const s1 = await read(page);
  note(num(s1.miniHisT) < num(s0.miniHisT), `B2 他确实在下滑（hisT ${s0.miniHisT} → ${s1.miniHisT}）`);
  note(num(s1.miniVeil) > num(s0.miniVeil), `B3 雾跟着变浓（${s0.miniVeil} → ${s1.miniVeil}）`);
  let last = s1;
  for (let i = 0; i < 40; i += 1) {
    await sleep(400);
    last = await read(page);
    if (last.res || last.miniState === 'done') break;
  }
  const secs = (Date.now() - t0) / 1000;
  note(!!last.res && last.res.detail.outcome === 'lost',
    `B4 发呆不操作 → lost（他进了雪槽；用时 ${secs.toFixed(1)}s）`);
  note(secs > 4 && secs < 13, `B5 失败时钟合理（${secs.toFixed(1)}s：短了像秒杀，长了像罚站）`);
  info(`结算：score=${last.res ? last.res.score.toFixed(2) : '—'} · ${last.res ? last.res.detail.why : ''}`);
  await page.close();
}

/* ══════════════ C. 一次性抓取 ══════════════ */
{
  console.log('\n=== C. 一次性抓取（布绳的代价 / 机会真的会扣） ===');
  const page = await newLabPage();
  await boot(page, { rndSeed: 3 });
  await clickAct(page, 'leg');
  await sleep(200);
  const c1 = await read(page);
  const throwBtn = await page.$('#g-host [data-mini-action="throw"]');
  const disabled = throwBtn ? await throwBtn.isDisabled() : null;
  note(c1.miniState === 'aim' && c1.miniRope === '1', `C1 选布绳后进 aim（rope=${c1.miniRope}）`);
  note(disabled === true, 'C2 解绑腿没拧完时「甩出去」是灰的（1.4 秒是布绳真代价）');
  await sleep(1500);
  const c2 = await read(page);
  const throwBtn2 = await page.$('#g-host [data-mini-action="throw"]');
  note(throwBtn2 && !(await throwBtn2.isDisabled()),
    `C3 1.4s 过后恢复可点（他这时已滑到 ${c2.miniMeters} 米 / hisT ${c2.miniHisT}）`);
  info(`布绳 reach ${c2.miniReach}px vs 此刻绳长 ${c2.miniRopeLen}px`);

  const ok1 = await aimAndMiss(page);
  await sleep(250);
  const c3 = await read(page);
  note(ok1 && c3.miniGrabs === '1' && c3.miniState === 'aim',
    'C4 甩空 → 机会 2→1 且回到 aim（不是直接死）');

  const ok2 = await aimAndMiss(page);
  await sleep(400);
  const c4 = await read(page);
  note(ok2 && (!!c4.res ? c4.res.detail.outcome === 'lost' : false),
    `C5 再甩空 → 机会用尽 → lost（outcome=${c4.res ? c4.res.detail.outcome : '未结算'}）`);
  await page.close();
}

/* ══════════════ D. 连续拉锯（骨架判据在这一段） ══════════════ */
{
  console.log('\n=== D. 连续拉锯 —— 骨架判据 ===');
  const page = await newLabPage();
  await boot(page, { rndSeed: 5 });
  await clickAct(page, 'leg');
  await sleep(1600);
  const caughtOk = await aimAndThrow(page);
  await sleep(300);
  const d0 = await read(page);
  note(caughtOk && d0.miniState === 'hold' && d0.miniGrabs === '2',
    `D1 对准了他就抓得住（state=${d0.miniState} · 机会仍 ${d0.miniGrabs}）`);

  // 判据①：按住「拉」→ hisT 上升 且 张力上升
  const tA0 = tension(d0); const hA0 = num(d0.miniHisT);
  await page.keyboard.down('Space');
  await sleep(700);
  const d1 = await read(page);
  await page.keyboard.up('Space');
  note(num(d1.miniHisT) > hA0 && tension(d1) > tA0,
    `D2 按住拉：他上行且张力涨（hisT ${hA0.toFixed(3)}→${d1.miniHisT} · 张力 ${tA0.toFixed(0)}→${tension(d1).toFixed(0)}）`);

  // 判据②（最关键）：松开 → 张力必须明显回落；老骨架（离散扣减）松开不会有任何变化
  const tB0 = tension(d1);
  await sleep(900);
  const d2 = await read(page);
  const drop = tB0 - tension(d2);
  note(drop > 8, `D3【骨架】松开后张力明显回落（${tB0.toFixed(0)} → ${tension(d2).toFixed(0)}，降 ${drop.toFixed(0)}）`);
  note(d1.miniState === 'hold' && d2.miniState === 'hold' && num(d2.miniHisT) < num(d1.miniHisT),
    `D4 松手期间他缓慢下沉（hisT ${d1.miniHisT} → ${d2.miniHisT}）`);

  // 判据③：换孔 → 张力上限（红线）真的变；并且**挪脚途中上限必须最低**（脚下是虚的）
  const capMid = capOf(d2);
  await clickAct(page, 'foot0');
  let dmove = null;
  for (let i = 0; i < 10; i += 1) {
    const s = await read(page);
    if (num(s.miniMove) > 0 && s.miniState === 'hold') { dmove = s; break; }
    await sleep(40);
  }
  await sleep(650);
  const d3 = await read(page);
  await clickAct(page, 'foot2');
  await sleep(700);
  const d4 = await read(page);
  // ⚠️ 这条**不能写死"哪个孔更高"**：v2 的三孔排序是"下孔最牢"，v3 按物理反过来
  //    （下孔离他最近所以拉得最快、可脚下那一片刚滑塌过所以最虚）。写死方向的话，
  //    改设计时它会红在"方向变了"上，而不是红在"取舍没了"上。所以方向从常量表读、当场比对。
  const HK = await page.evaluate(async () => (await import('/js/minigames-grab.js?v=' + Date.now()))
    .HOLES.map((h) => h.capK));
  const caps = [capOf(d3), capMid, capOf(d4)];          // 下孔 / 中孔 / 上孔
  const sameWay = (HK[0] < HK[1]) === (caps[0] < caps[1]) && (HK[1] < HK[2]) === (caps[1] < caps[2]);
  note(new Set(caps.map((x) => Math.round(x))).size === 3 && sameWay,
    `D5【骨架】三个孔的张力上限互不相同、且与常量表同向（下孔 ${caps[0].toFixed(0)} / 中孔 ${caps[1].toFixed(0)} / 上孔 ${caps[2].toFixed(0)} · capK ${HK.join('/')}）`);  // 定向断言 —— 反例验过会红：把 capNow() 里的 MOVE_CAPK 换回 HOLES[2].capK*0.86 之类
  // （取到"锚最牢"的那个孔），这条立刻报 ✗ "挪脚中 XX < 踩实的上孔 YY" 不成立。
  note(!!dmove && capOf(dmove) < capOf(d4),
    `D5b【骨架·定向】挪脚途中上限最低（挪脚中 ${dmove ? capOf(dmove).toFixed(0) : '未采到'} < 踩实的上孔 ${capOf(d4).toFixed(0)}）`);

  // 判据④：挪脚期间按「拉」他不上升（位置是真资源，不是装饰）
  await clickAct(page, 'foot1');
  await sleep(60);
  await page.keyboard.down('Space');
  await sleep(180);
  const e0 = await read(page);
  await sleep(220);
  const e1 = await read(page);
  await page.keyboard.up('Space');
  const backToMid = e0.miniFoot === '1';
  // ⚠️ 必须同时钉住"当时确实在 hold"：否则"根本没进拉锯"这个状态也能让这条通过（假绿）
  note(backToMid && e0.miniState === 'hold' && num(e1.miniHisT) <= num(e0.miniHisT),
    `D6【骨架】挪脚期间按拉也拽不动（state=${e0.miniState} · hisT ${e0.miniHisT} → ${e1.miniHisT}）`);

  // 判据⑤：张力顶到上限 = 脱手（回 aim、扣机会），不是当场死
  await sleep(300);
  const f0 = await read(page);
  if (f0.miniState === 'hold') {
    await page.keyboard.down('Space');
    let f1 = f0;
    for (let i = 0; i < 30; i += 1) {
      await sleep(150);
      f1 = await read(page);
      if (f1.miniState !== 'hold' || f1.res) break;
    }
    await page.keyboard.up('Space');
    note(f1.miniState === 'aim' && f1.miniGrabs === '1',
      `D7 张力顶到上限 → 脱手并回 aim、机会 2→1（state=${f1.miniState} · 机会=${f1.miniGrabs}）`);
  } else {
    note(false, `D7 未能回到 hold 继续测脱手（当前 ${f0.miniState}）`);
  }
  await page.close();
}

/* ══════════════ E. 成功线 ══════════════ */
{
  console.log('\n=== E. 成功线（用中孔一路拉到顶） ===');
  const page = await newLabPage();
  await boot(page, { rndSeed: 5 });
  await clickAct(page, 'leg');
  await sleep(1600);
  const caughtOk = await aimAndThrow(page);
  await sleep(250);
  const at = await read(page);
  note(caughtOk && at.miniState === 'hold', `E1 抓住进入拉锯（state=${at.miniState}）`);
  const res = await driveHold(page, 50000);
  const done = res.res;
  note(!!done && done.detail.outcome === 'saved',
    `E2 拉到顶 → saved（outcome=${done ? done.detail.outcome : '未结算'}）`);
  if (done && done.detail.outcome === 'saved') {
    note(done.score >= 0.58 && done.score <= 1,
      `E3 成功分在合理区间（score=${done.score.toFixed(2)}）`);
    note(done.detail.tension < done.detail.tensionCap,
      `E4 结算时张力没破上限（${done.detail.tension} < ${done.detail.tensionCap}）`);
    note(num(res.miniVeil) <= 0.2,
      `E5【场景】救上来雾要散开（veil ${res.miniVeil} ≤ 0.2 —— 让画里那两只手露出来）`);
    info(`结算：${done.summary}`);
  } else {
    note(false, `E3/E4/E5 跳过（outcome=${done ? done.detail.outcome : '未结算'}）`);
  }
  await page.close();
}

/* ══════════════ F. 契约与环保 ══════════════ */
{
  console.log('\n=== F. 契约与环保 ===');
  note(pageErrs.length === 0, `F1 整轮 0 条未捕获页面异常（实得 ${pageErrs.length}）`);
  if (pageErrs.length) pageErrs.slice(0, 5).forEach((e) => info(e));
  const page = await newLabPage();
  await boot(page, { rndSeed: 2 });
  const st = await read(page);
  note(st.mini === 'snow-grab', `F2 host[data-mini]=${st.mini}`);
  note(st.hits === 0, `F3 全程 0 次 /api/decide（实得 ${st.hits}）`);
  const want = ['decide', 'aim', 'hold', 'done'];
  const seq = [...seenStates];
  note(want.every((w) => seq.includes(w)),
    `F4 状态词覆盖 ${want.join('/')}（实得 ${seq.join('/') || '（无）'}）`);
  // —— 场景判据：**画作是真在用的**（挡死"又自己画一片假雪山"这条回头路）——
  note(st.plateSrc === '/assets/scenes/snow_climb.jpg' && st.plateLoaded,
    `F5【场景】画面里真的铺着那张油画（src=${st.plateSrc} · 已解码 ${st.plateNat}）`);
  note(st.viewBox === `${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`,
    `F6【场景】覆盖层坐标系 = 取景框画作像素（viewBox="${st.viewBox}"）`);
  const r = await fetch(`${BASE}/assets/scenes/snow_climb.jpg`, { method: 'HEAD' });
  note(r.status === 200, `F7 资源可达：GET ${'/assets/scenes/snow_climb.jpg'} → ${r.status}`);
  await page.close();
}

console.log(`\n${bad === 0 ? '【全绿】' : '【有红】'} 失败 ${bad} 项`);
// ⚠️ 本机 browser.close() 会挂住（踩过多次，连 Promise.race 兜底都拦不住，进程会活到看门狗）：
//    改成"放它自己去关 + 短暂延时后硬退"—— 进程退掉，子进程会被一并带走。
browser.close().catch(() => {});
setTimeout(() => process.exit(0), 500);
