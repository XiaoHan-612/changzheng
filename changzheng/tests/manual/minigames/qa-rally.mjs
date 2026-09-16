/**
 * 《收拢》专项验收 —— 画作当场景 + 回合制判断骨架。
 *
 * 这一支最容易被"看走眼"的地方是：它看起来很朴素（一行行文字 + 一张画），
 * 于是**功能全绿也可能是错的**。所以断言分四类：
 *   ① **骨架判据**（C 段）—— 判定它有没有退回"等预警窗口 → 按一下"的老骨架。
 *      最硬的三条：C1 线索可信度必须与真值**相关**（有向比较，不是"有个数就行"）、
 *      C2 搜一次必须换回一条旁证（否则"存疑"永远排不掉，判断就退化成瞎猜）、
 *      C3 收拢 ≠ 过江（老骨架里根本没有这两个量）。
 *   ② **对照打法**（B 段）—— 五套打法打同一份代码，数字必须真的分叉，**含一次 0 分的失败**。
 *   ③ **场景判据**（A3/A4 + F 段）—— 判定它有没有退回"自己画一条江"的老路：
 *      画作必须是 `xiangjiang_night.jpg`，且取样带上真的是"夜 + 左侧那堆火"。
 *   ④ **契约与可点性**（A5/E/G）—— 0 条页面异常、0 次 /api/decide、
 *      减动效下的**真点击**（不带 force）必须点得动。
 *
 * 用法：先起服务（node server/index.js），然后
 *   node tests/manual/qa-rally.mjs
 * 照例后台跑，输出重定向到文件再读。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const LAB = 'http://localhost:3001/dev/minigame-lab.html';
const OUT = path.join('tests', 'e2e', 'artifacts', 'rally-river');
fs.mkdirSync(OUT, { recursive: true });

setTimeout(() => { console.log('\n【看门狗】用例超过 10 分钟，强制收尾'); process.exit(3); }, 600000);
process.on('unhandledRejection', (e) => { console.log('【未处理的拒绝】', (e && e.stack) || e); process.exit(4); });
// 顶层 await 抛错走的是 uncaughtException，不是 unhandledRejection（默认 --unhandled-rejections=throw）。
// 只挂两道的话，用例里一个笔误就会让整个 QA 静默死掉、最后只留几行输出 —— 三道都要挂。
process.on('uncaughtException', (e) => { console.log('【未捕获异常】', (e && e.stack) || e); process.exit(5); });

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let bad = 0;
/** 未捕获页面异常必须算红：渲染路径抛一次错，玩法就可能静默冻住，而 dataset 上完全看不出来 */
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

async function newLabPage(extra = {}) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1060 }, ...extra });
  await page.addInitScript(blockDecide);
  await page.goto(LAB, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 20000 });
  return page;
}

const page = await newLabPage();

/* ── 常量口径：从模块读一次，**别在用例里写死第二份** ───────────── */
const K = await page.evaluate(async () => {
  const m = await import('/js/minigames-rally.js?v=' + Date.now());
  return {
    RALLY: m.RALLY, NAMES: m.NAMES, PINS: m.PINS, DOCK: m.DOCK, CROP: m.CROP,
    PLATE: m.PLATE, PAINT: m.PAINT, SHIFT: m.CROP_SHIFT_PCT,
    cards: m.RALLY_MINIGAMES, hasCards: Array.isArray(m.CARDS),
    b1: m.genBoard(4242), b2: m.genBoard(4242), b3: m.genBoard(99),
  };
});
const R = K.RALLY;

async function boot(seed) {
  await page.evaluate(async (sd) => {
    for (const id of ['mini-host', 'r-host']) {
      const e = document.getElementById(id);
      if (e) e.remove();
    }
    const host = document.createElement('div');
    host.id = 'r-host';
    (document.getElementById('board-body') || document.body).appendChild(host);
    window.__rHost = host;
    window.__rRes = null;
    window.__rErr = null;
    const m = await import('/js/minigames-rally.js?v=' + Date.now());
    try {
      m.runRally(host, { id: 'rally-river', seed: sd, stats: document.getElementById('board-stats') })
        .then((r) => { window.__rRes = r; })
        .catch((e) => { window.__rErr = String(e && e.message); });
    } catch (e) { window.__rErr = String(e && e.message); }
  }, seed);
  await page.waitForFunction(() => window.__rHost && window.__rHost.dataset.mini
    && window.__rHost.dataset.miniState, null, { timeout: 10000 });
}

const read = () => page.evaluate(() => {
  const hd = window.__rHost;
  const d = hd ? { ...hd.dataset } : {};
  d.res = window.__rRes;
  d.err = window.__rErr;
  d.hits = window.__decideHits;
  d.nAct = hd ? hd.querySelectorAll('[data-mini-action]').length : 0;
  d.nSearch = hd ? hd.querySelectorAll('[data-mini-action="search"]').length : 0;
  d.nCallout = hd ? hd.querySelectorAll('[data-mini-action="callout"]').length : 0;
  d.nFerry = hd ? hd.querySelectorAll('[data-mini-action="ferry"]').length : 0;
  d.dirs = hd ? [...hd.querySelectorAll('[data-mini-action="search"]')].map((e) => e.dataset.dir) : [];
  return d;
});

const sleep_ = sleep;
async function clickSel(sel) {
  const el = await page.$(sel);
  if (!el) return false;
  try { await page.click(sel, { timeout: 2500 }); return true; } catch { return false; }
}

const ar = (s) => String(s || '').split(',').map((x) => Number(x));
const vof = (s) => ({
  ticks: Number(s.miniTicks), gathered: Number(s.miniGathered), crossed: Number(s.miniCrossed),
  out: Number(s.miniOut), total: Number(s.miniTotal), cap: Number(s.miniFerryCap),
  truth: ar(s.miniTruth), role: String(s.miniRole || '').split(','),
  enemy: String(s.miniEnemy || '').split(',').map(Number),
  known: String(s.miniKnown || '').split(','), state: s.miniState,
});
const needTrips = (v) => Math.ceil(v.gathered / v.cap);
const unsearched = (v) => v.known.map((k, i) => i).filter((i) => v.known[i] !== 's');
/** 还**值得**搜的（已知为空的不算 —— 否则等于把玩家往白搜上推，量出来的难度是假的） */
const candidates = (v) => unsearched(v).filter((i) => v.known[i] !== 'n');
const tickCost = (v, i) => (v.enemy[i] ? R.WARN_RUSH : 1);

/* ── 与 sim-rally.mjs 同一套"像样的玩家"骨架（B 段对照要用）──────── */
function smart(v, opt = {}) {
  const need = needTrips(v);
  const y = v.known.map((k, i) => i).filter((i) => v.known[i] === 'y');
  if (y.length && v.ticks > need) {
    const w = y.find((i) => v.enemy[i]);
    if (w !== undefined && opt.calloutEnemy) return { kind: 'callout', dir: w };
    const pool = y.filter((i) => !(opt.skipEnemy && v.enemy[i]));
    if (pool.length) {
      pool.sort((a, b) => tickCost(v, a) - tickCost(v, b));
      return { kind: 'search', dir: pool[0] };
    }
  }
  if (v.ticks <= need && v.gathered > 0) return { kind: 'ferry' };
  const u = candidates(v).filter((i) => !(opt.skipEnemy && v.enemy[i]));
  if (u.length && v.ticks > need + 1) return { kind: 'search', dir: u[0] };
  if (v.gathered > 0) return { kind: 'ferry' };
  // 两道兜底（缺一个策略就僵住、整局不结算）：① 还有没搜的就去搜；② 只剩空渡也得渡
  if (u.length && v.ticks > 0) return { kind: 'search', dir: u[0] };
  return v.ticks > 0 ? { kind: 'ferry' } : null;
}

const POL = {
  oracle: (v) => {
    const un = v.truth.map((x, i) => i).filter((i) => v.truth[i] > 0 && v.known[i] !== 's');
    if (un.length && v.ticks > needTrips(v)) return { kind: 'search', dir: un[0] };
    if (v.gathered > 0) return { kind: 'ferry' };
    if (v.ticks > 0) {
      const i = v.truth.findIndex((n, k) => n > 0 && v.known[k] !== 's');
      if (i >= 0) return { kind: 'search', dir: i };
    }
    return null;
  },
  greedy: (v) => {
    const un = unsearched(v);
    return un.length ? { kind: 'search', dir: un[0] } : null;
  },
  ferryOnly: (v) => (v.ticks > 0 ? { kind: 'ferry' } : null),
  clue: (v) => smart(v),
  blind: (v) => {
    const list = candidates(v);
    if (list.length && v.ticks > needTrips(v)) return { kind: 'search', dir: list[0] };
    if (v.gathered > 0) return { kind: 'ferry' };
    if (list.length && v.ticks > 0) return { kind: 'search', dir: list[0] };
    return v.ticks > 0 ? { kind: 'ferry' } : null;
  },
  slip2: (v) => {
    const q = v.role.map((r, i) => i).filter((i) => v.role[i] === 'quiet' && v.known[i] !== 's');
    if (q.length) return { kind: 'search', dir: q[0] };
    return smart(v);
  },
};

/** 跑完一局，返回 resolve 出来的那包 */
async function play(policy, seed) {
  await boot(seed);
  let guard = 0;
  while (guard++ < 30) {
    const s = await read();
    if (s.err) return { err: s.err };
    if (s.state === 'done' || s.miniState === 'done') break;
    const v = vof(s);
    const a = policy(v);
    if (!a) break;
    const ok = a.kind === 'ferry'
      ? await clickSel('#r-host [data-mini-action="ferry"]')
      : await clickSel(`#r-host [data-mini-action="${a.kind}"][data-dir="${a.dir}"]`);
    if (!ok) break;
    await sleep(30);
  }
  await page.waitForFunction(() => window.__rRes || window.__rErr, null, { timeout: 6000 }).catch(() => {});
  const s = await read();
  if (s.err) return { err: s.err };
  if (!s.res) return { err: '未结算', ticks: s.miniTicks };
  // detail 里的字段名是 totalEast；补一个 total 别名，免得报告里到处印 undefined
  return { ...s.res.detail, total: s.res.detail.totalEast, score: s.res.score, summary: s.res.summary, hits: s.hits };
}

/* ══════════════ A. 契约 / 常量 / 几何（静态）══════════════ */
console.log('\nA. 契约 / 常量 / 几何');
const card = K.cards[0];
note(K.cards.length === 1 && card.id === 'rally-river', `A1 登记一条：id=${card.id}`);
note(card.family === '搜索' && card.actions.join(',') === 'search,callout,ferry' && card.noAi === true,
  `A2 族/操作/无模型调用：${card.family} · ${card.actions.join('|')} · noAi=${card.noAi}`);
note(K.NAMES.length === R.SPOTS && K.PINS.length === K.NAMES.length,
  `A3 方向数自洽：NAMES ${K.NAMES.length} = PINS ${K.PINS.length} = SPOTS ${R.SPOTS}`);
const dmin = Math.min(...K.PINS.map((p) => Math.hypot(p.x - K.DOCK.x, p.y - K.DOCK.y)));
note(dmin > 12, `A4 渡口与最近的方向灯不重合（实得 ${dmin.toFixed(1)}% > 12%）`);
note(K.PLATE.includes('xiangjiang_night.jpg') && K.PAINT.w === 1280 && K.PAINT.h === 872,
  `A5 画作是湘江夜图原图（${K.PLATE} · ${K.PAINT.w}x${K.PAINT.h}）`);
info(`CROP y0=${K.CROP.y0} aspect=${K.CROP.aspect} 上移 ${K.SHIFT.toFixed(2)}%`);

// genBoard 是纯函数且结构写死
const b1 = K.b1, b2 = K.b2, b3 = K.b3;
const sum = (b) => b.spots.reduce((a, s) => a + s.people, 0);
const withP = (b) => b.spots.filter((s) => s.people > 0).length;
const roles = (b) => b.spots.map((s) => s.role).join('');
note(JSON.stringify(b1.spots.map((s) => s.people)) === JSON.stringify(b2.spots.map((s) => s.people))
  && roles(b1) === roles(b2), 'A6 genBoard 纯函数：同 seed 两次完全一致');
note(sum(b1) === 18 && sum(b3) === 18, `A7 东岸总人数恒为 18（实得 ${sum(b1)} / ${sum(b3)}）`);
note(withP(b1) === 4 && withP(b3) === 4, `A8 恒有 4 个"有人"方向（实得 ${withP(b1)} / ${withP(b3)}）`);
note([b1, b2, b3].every((b) => b.spots.every((s) => !s.enemy || s.people > 0)),
  'A9 敌情只落在"有人"的方向上（冒险换得到人，不是纯惩罚）');
note(JSON.stringify(b1.spots.map((s) => s.name)) !== JSON.stringify(b3.spots.map((s) => s.name))
  || roles(b1) !== roles(b3), 'A10 不同 seed 局面会分叉');

// 起手契约
await boot(11);
let s0 = await read();
const v0 = vof(s0);
note(s0.mini === 'rally-river' && s0.miniState === 'play', `A11 host[data-mini]=${s0.mini}, state=${s0.miniState}`);
note(s0.nSearch === R.SPOTS && s0.nFerry === 1 && s0.nCallout === 1,
  `A12 起手操作元素：搜 ${s0.nSearch} + 渡 ${s0.nFerry} + 喊 ${s0.nCallout}（= 8+1+1，敌情那一处多一个"喊"）`);
note(s0.nFerry === 1 && s0.dirs.length === R.SPOTS,
  `A13 渡口一直可点、八个方向都挂着操作标记（dirs=${s0.dirs.length}）`);

/* ══════════════ C. 骨架判据（判定有没有退回老骨架）══════════════ */
console.log('\nC. 骨架判据：线索判断 · 旁证排除 · 搜≠渡');

// C1 线索可信度必须与真值相关（跨种子，有向比较）
let trustHit = 0, trustAll = 0, vagueHit = 0, vagueAll = 0, quietHit = 0, quietAll = 0, trustKnownY = 0;
for (const sd of [1, 2, 3, 5, 7, 11, 13, 17, 23, 29, 37, 51]) {
  await boot(sd);
  const s = await read();
  const v = vof(s);
  for (let i = 0; i < v.role.length; i++) {
    const hit = v.truth[i] > 0;
    if (v.role[i] === 'trust') { trustAll++; if (hit) trustHit++; if (v.known[i] === 'y') trustKnownY++; } else if (v.role[i] === 'vague') { vagueAll++; if (hit) vagueHit++; } else { quietAll++; if (hit) quietHit++; }
  }
}
const rt = trustHit / trustAll, rv = vagueHit / vagueAll, rq = quietHit / quietAll;
note(rt === 1, `C1a 标「可信」的方向必然有人：${trustHit}/${trustAll} = ${rt.toFixed(2)}`);
note(trustKnownY === trustAll, `C1b 标「可信」的开局就按"有人"显示：${trustKnownY}/${trustAll}`);
note(rq === 0, `C1c 标「没人提过」的方向必然无人：${quietHit}/${quietAll}`);
note(rt > rv && rv > rq, `C1d 【有向】线索可信度必须与真值同序：可信 ${rt.toFixed(2)} > 存疑 ${rv.toFixed(2)} > 没人提过 ${rq.toFixed(2)}`);

// C2 搜一次必须换回一条旁证（否则"存疑"永远排不掉）
await boot(11);
const k0 = (await read()).miniKnown;
await clickSel('#r-host [data-mini-action="search"]');
const sC2 = await read();
const k1 = sC2.miniKnown;
const gained = [...k1].filter((c, i) => c !== k0[i] && c !== 's').length;
note(k1.includes('s') && gained >= 1,
  `C2 搜一次带回一条旁证：known ${k0} → ${k1}（新增判定 ${gained} 处）`);
info(`   反馈行：${(await page.textContent('#r-host .smini13-fb')).replace(/\s+/g, ' ').slice(0, 80)}`);

// C3 收拢 ≠ 过江
const vC3 = vof(sC2);
note(vC3.gathered > 0 && vC3.crossed === 0,
  `C3 搜到的人只在江边、还没过江：gathered=${vC3.gathered} / crossed=${vC3.crossed} / 东岸还剩=${vC3.out}`);

// C4 渡量有硬上限：江边人比一趟运力多时，一趟渡不完
{
  await boot(11);
  let v = vof(await read());
  // 搜够两处（普通 + 普通），把江边堆到 > cap
  while (v.gathered <= R.FERRY_CAP) {
    const i = v.truth.findIndex((n, k) => n > 0 && v.known[k] !== 's');
    if (i < 0) break;
    await clickSel(`#r-host [data-mini-action="search"][data-dir="${i}"]`);
    v = vof(await read());
  }
  const before = v.gathered;
  await clickSel('#r-host [data-mini-action="ferry"]');
  v = vof(await read());
  note(before > R.FERRY_CAP && v.crossed === R.FERRY_CAP && v.gathered === before - R.FERRY_CAP,
    `C4 一趟只能送 ${R.FERRY_CAP} 人：江边 ${before} → 过江 ${v.crossed} + 江边剩 ${v.gathered}`);
}

// C5 有敌情的方向：派人进去两刻 / 在外面喊一刻（差一刻）
{
  const seed = 11;
  await boot(seed);
  const v = vof(await read());
  const j = v.enemy.indexOf(1);
  await clickSel(`#r-host [data-mini-action="search"][data-dir="${j}"]`);
  const vRush = vof(await read());
  await boot(seed);
  await clickSel(`#r-host [data-mini-action="callout"][data-dir="${j}"]`);
  const sCall = await read();
  const vCall = vof(sCall);
  note(j >= 0 && vRush.ticks === R.DAWN - R.WARN_RUSH && vCall.ticks === R.DAWN - R.WARN_CALL,
    `C5 敌情方向：派人进去耗 ${R.DAWN - vRush.ticks} 刻 / 在外面喊耗 ${R.DAWN - vCall.ticks} 刻`);
  const n = v.truth[j];
  note(vCall.gathered === Math.max(1, Math.ceil(n / 2)) && vRush.gathered === n,
    `C6 在外面喊只回来一半：${n} 人 → 喊回 ${vCall.gathered} / 派人进去 ${vRush.gathered}`);
}

// C7 刻用完就天亮（只渡不搜 → 一个人也过不去）
{
  const r = await play(POL.ferryOnly, 11);
  note(r.outcome === 'none' && r.crossed === 0 && r.ticksLeft === 0,
    `C7 只渡不搜：${R.DAWN} 刻耗完 → 天亮，过江 ${r.crossed}/${r.total}，结局 ${r.outcome}`);
}

/* ══════════════ B. 对照打法（数字必须真的分叉，含一次失败）══════════════ */
console.log('\nB. 对照打法');
const bOracle = await play(POL.oracle, 11);
note(bOracle.crossed === 18 && bOracle.outcome === 'full',
  `B1 满分可达（按真值打）：过江 ${bOracle.crossed}/${bOracle.total} · 分 ${bOracle.score.toFixed(2)} · 余刻 ${bOracle.ticksLeft}`);
const bClue = await play(POL.clue, 11);
note(bClue.crossed >= 15,
  `B2 按线索打：过江 ${bClue.crossed}/${bClue.total} · 分 ${bClue.score.toFixed(2)} · 结局 ${bClue.outcome}`);
const bSlip = await play(POL.slip2, 11);
note(bSlip.crossed < bClue.crossed,
  `B3 先误判两次：过江 ${bSlip.crossed}/${bSlip.total} · 分 ${bSlip.score.toFixed(2)} · 结局 ${bSlip.outcome}`);
const bGreedy = await play(POL.greedy, 11);
note(bGreedy.crossed === 0 && bGreedy.outcome === 'none',
  `B4 贪搜不渡：过江 ${bGreedy.crossed}/${bGreedy.total} · 分 ${bGreedy.score.toFixed(2)} · 结局 ${bGreedy.outcome}`);
const bBlind = await play(POL.blind, 11);
note(bBlind.crossed < bClue.crossed,
  `B5 不看线索、顺着编号一路扫（手勤）：过江 ${bBlind.crossed}/${bBlind.total} · 分 ${bBlind.score.toFixed(2)} · 结局 ${bBlind.outcome}`);
info(`   B 段分叉：oracle ${bOracle.crossed} · clue ${bClue.crossed} · slip2 ${bSlip.crossed} · blind ${bBlind.crossed} · greedy ${bGreedy.crossed}`);
note(bOracle.crossed > bSlip.crossed && bSlip.crossed > bGreedy.crossed,
  'B6 【有向】打法优劣必须同序：满分 > 误判 > 贪搜');
note(bClue.crossed > bBlind.crossed && bBlind.crossed > bGreedy.crossed,
  'B7 【有向】做排除法 > 盲扫 > 贪搜不渡 —— 判断本身必须值分');

/* ══════════════ F. 像素判据：画作当场景（不是自己画一条江）══════════════ */
console.log('\nF. 像素判据');
await boot(11);
// ⚠️ 必须先等画作解码完：naturalWidth 还是 0 时 drawImage 画不出东西、
//    getImageData(0,0,0,0) 直接抛 IndexSizeError —— 整轮 QA 会被这个竞态带走。
await page.waitForFunction(() => {
  const i = document.querySelector('#r-host .smini13-plate');
  return !!i && i.complete && i.naturalWidth > 0;
}, null, { timeout: 15000 });
const px = await page.evaluate(async (cfg) => {
  const host = window.__rHost;
  const img = host.querySelector('.smini13-plate');
  const scene = host.querySelector('.smini13-scene');
  if (!img || !scene) return { err: 'no plate/scene' };
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  const L = (x, y) => {
    const i = (y * c.width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  const band = cfg.paint.h - cfg.crop.y0;                       // 取景带高（画作像素）
  // ① 方向灯那一带（取景带 68%~82%）的亮度：判"取景带真的是夜"
  let sum = 0, n = 0, dark = 0;
  const y0 = Math.round(cfg.crop.y0 + band * 0.68);
  const y1 = Math.round(cfg.crop.y0 + band * 0.82);
  for (let y = y0; y < y1; y += 2) {
    for (let x = 0; x < c.width; x += 3) {
      const l = L(x, y); sum += l; n++;
      if (l < 60) dark++;
    }
  }
  // ② 画里那堆火：窗口 x∈[40%,56%] × y∈[42%,95%] 的暖亮像素数（画作像素量出来的）
  //    ⚠️ 别图省事写成"左边那一列" —— 画作左侧 x<6% 是**撕纸边**（米黄/棕褐），
  //       它同样满足"暖 + 亮"，会让你以为断言在验火、其实在验纸边（这里真踩过：
  //       旧版取 x<60，量出来的 3742 个像素全是纸边，画里的火一个没碰到）。
  let fire = 0;
  for (let y = Math.round(c.height * 0.42); y < Math.round(c.height * 0.95); y += 2) {
    for (let x = Math.round(c.width * 0.40); x < Math.round(c.width * 0.56); x += 2) {
      const i = (y * c.width + x) * 4;
      const l = L(x, y);
      if (data[i] - data[i + 2] > 45 && l > 90) fire++;
    }
  }
  // ③ 画作铺满舞台、不留空白纸框
  const sb = scene.getBoundingClientRect();
  const ib = img.getBoundingClientRect();
  const cover = Math.abs(ib.width - sb.width) < 2 && ib.height >= sb.height - 2;
  // ④ 每盏灯的标签：拿标签框底下的画作像素算对比度（字色 #efe6d2 写死浅色 —— 夜场上不能用 --ink-*）
  const rl = (l) => { const v = l / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lt = rl(0.299 * 239 + 0.587 * 230 + 0.114 * 210);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const sc = img.naturalWidth / ib.width;
  const rows = [...host.querySelectorAll('.smini13-pin:not(.is-dock)')].map((p) => {
    const nm = p.querySelector('.nm');
    const r = nm.getBoundingClientRect();
    const x0 = Math.max(0, Math.round((r.left - ib.left) * sc));
    const x1 = Math.min(c.width, Math.round((r.right - ib.left) * sc));
    const yy0 = Math.max(0, Math.round((r.top - ib.top) * sc));
    const yy1 = Math.min(c.height, Math.round((r.bottom - ib.top) * sc));
    let mx = 0, s2 = 0, k2 = 0;
    for (let y = yy0; y < yy1; y++) {
      for (let x = x0; x < x1; x++) { const l = L(x, y); if (l > mx) mx = l; s2 += l; k2++; }
    }
    const mean = k2 ? s2 / k2 : 0;
    // 标签自带的暗底：F5 断言的就是它（画作上有一处水面高光 236，光靠描边阴影压不住浅色字）
    const cs = getComputedStyle(nm).backgroundColor;
    const m2 = cs.match(/rgba?\(([^)]+)\)/);
    const ch = m2 ? m2[1].split(',').map((x) => parseFloat(x)) : [255, 255, 255, 1];
    const bgA = ch.length > 3 ? ch[3] : 1;
    const bgLum = Math.round(0.299 * ch[0] + 0.587 * ch[1] + 0.114 * ch[2]);
    return {
      name: nm.textContent, mx: Math.round(mx), mean: Math.round(mean),
      rMean: Number(ratio(lt, rl(mean)).toFixed(2)),
      rMax: Number(ratio(lt, rl(mx)).toFixed(2)),
      bgLum, bgA: Number(bgA.toFixed(2)),
    };
  });
  return {
    mean: sum / n, darkPct: (dark / n) * 100, fire, cover,
    nat: `${img.naturalWidth}x${img.naturalHeight}`, sceneH: Math.round(sb.height), rows,
  };
}, { crop: K.CROP, paint: K.PAINT });
info(`   取样带亮度均 ${px.mean.toFixed(1)} · 暗像素 ${px.darkPct.toFixed(1)}% · 火堆窗口暖亮像素 ${px.fire}`);
note(!px.err && px.mean < 105, `F1 取景带真的是夜：方向灯那一带亮度均 ${px.mean.toFixed(1)} < 105（暗像素 ${px.darkPct.toFixed(0)}%）`);
note(px.fire > 1500, `F2 取景带里留着画里那堆火（火堆窗口暖亮像素 ${px.fire} > 1500）`);
note(px.cover, `F3 画作铺满舞台、不留空白纸框（${px.nat}，舞台高 ${px.sceneH}）`);
const worst = px.rows.reduce((a, b) => (a.rMean < b.rMean ? a : b), { rMean: 99 });
note(px.rows.length === R.SPOTS && worst.rMean >= 4.2,
  `F4 ${R.SPOTS} 盏灯的标签压在画作上最差一处对比度 ${worst.rMean}:1 ≥ 4.2（${worst.name}，底色均 ${worst.mean}）`);
// F5：画作上有一处水面高光（实测最亮 236），浅色字光靠 text-shadow 压不住 ——
//     所以标签必须自带**暗底**。断言直接钉 computed style：不透明度过半、底够暗。
//     去掉 .smini13-pin .nm 的 background 这一行，F5 立刻变红。
const noBg = px.rows.filter((r) => !(r.bgA >= 0.5 && r.bgLum < 60));
note(px.rows.length === R.SPOTS && noBg.length === 0,
  `F5 ${R.SPOTS} 盏灯的标签都自带暗底（${px.rows[0].bgA}α · 亮度 ${px.rows[0].bgLum}）`
  + `${noBg.length ? ' —— 缺底：' + noBg.map((r) => `${r.name}(${r.bgA}α/${r.bgLum})`).join(' ') : ''}`);
info(`   标签底色最亮处：${px.rows.map((r) => `${r.name} ${r.mx}`).join(' / ')}`
  + `（最亮 236 那处是水面高光，靠暗底压住）`);
info(`   每盏灯：${px.rows.map((r) => `${r.name} ${r.rMean}`).join(' / ')}`);

// F6 证伪自检：**断言有没有检出能力，比断言通过更重要**。
// 把暗底摘掉，F5 用的那条判据必须立刻翻成"红"。
{
  const f = await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '.smini13-pin .nm{background:transparent !important}';
    document.head.appendChild(st);
    const nm = document.querySelector('#r-host .smini13-pin .nm');
    const cs = getComputedStyle(nm).backgroundColor;
    const m = cs.match(/rgba?\(([^)]+)\)/);
    const ch = m ? m[1].split(',').map(Number) : [255, 255, 255, 1];
    const a = ch.length > 3 ? ch[3] : 1;
    const lum = Math.round(0.299 * ch[0] + 0.587 * ch[1] + 0.114 * ch[2]);
    st.remove();
    return { a, lum, wouldFail: !(a >= 0.5 && lum < 60) };
  });
  note(f.wouldFail, `F6 【证伪自检】摘掉暗底后 F5 的判据立刻变红（α=${f.a} · 亮度 ${f.lum}）`);
}

/* ── 截图（② 特写 + ① 整屏）────────────────────────────────── */
async function shoot(name, full) {
  const p2 = await newLabPage();
  await p2.evaluate(async (sd) => {
    for (const id of ['mini-host', 'r-host']) document.getElementById(id)?.remove();
    const host = document.createElement('div');
    host.id = 'r-host';
    (document.getElementById('board-body') || document.body).appendChild(host);
    window.__rHost = host;
    const m = await import('/js/minigames-rally.js?v=' + Date.now());
    m.runRally(host, { id: 'rally-river', seed: sd, stats: document.getElementById('board-stats') });
  }, 11);
  await p2.waitForFunction(() => window.__rHost && window.__rHost.dataset.miniState, null, { timeout: 10000 });
  await sleep(500);                                   // 等画作解码完
  // ⚠️ boundingBox() 是 async —— 漏掉 await 会把一个 Promise 当 clip 传进去，
  //    报错是 `clip.x: expected float, got undefined`，整条 QA 会在这里断掉。
  const el = await p2.$(full ? '#board-shell' : '#r-host .smini13-scene');
  const box = el && (await el.boundingBox());
  if (!box) throw new Error(`截图取不到元素框：${full ? '#board-shell' : '#r-host .smini13-scene'}`);
  await p2.screenshot({ path: path.join(OUT, name), clip: box });
  await p2.close();
}
await shoot('rally-scene.png', false);
await shoot('rally-board.png', true);
info(`   截图：${OUT}\\rally-scene.png（特写） · rally-board.png（整屏）`);

/* ══════════════ G. 减动效下的真点击（不带 force）══════════════ */
console.log('\nG. prefers-reduced-motion: reduce 下的真点击');
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1060 }, reducedMotion: 'reduce' });
  const p3 = await ctx.newPage();
  await p3.addInitScript(blockDecide);
  await p3.goto(LAB, { waitUntil: 'domcontentloaded' });
  await p3.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 20000 });
  await p3.evaluate(async (sd) => {
    for (const id of ['mini-host', 'r-host']) document.getElementById(id)?.remove();
    const host = document.createElement('div');
    host.id = 'r-host';
    (document.getElementById('board-body') || document.body).appendChild(host);
    window.__rHost = host;
    const m = await import('/js/minigames-rally.js?v=' + Date.now());
    m.runRally(host, { id: 'rally-river', seed: sd, stats: document.getElementById('board-stats') });
  }, 11);
  await p3.waitForFunction(() => window.__rHost && window.__rHost.dataset.miniState, null, { timeout: 10000 });
  // elementFromPoint 命中判定必须在页内取完字符串再返回（不能把 DOM 元素传回来）
  const hit = await p3.evaluate(() => {
    const el = document.querySelector('#r-host [data-mini-action="search"]');
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const a = t && t.closest('[data-mini-action]');
    return a ? a.getAttribute('data-mini-action') : (t ? t.className : null);
  });
  note(hit === 'search', `G1 减动效下方向行没被盖住：elementFromPoint 命中 ${hit}`);
  await p3.click('#r-host [data-mini-action="search"]', { timeout: 3000 }).catch(() => {});
  const t1 = Number((await p3.evaluate(() => window.__rHost.dataset.miniTicks)));
  note(t1 < R.DAWN, `G2 减动效下真点击真的落到玩法上（天光 ${R.DAWN} → ${t1}）`);
  await p3.click('#r-host [data-mini-action="ferry"]', { timeout: 3000 }).catch(() => {});
  const t2 = Number((await p3.evaluate(() => window.__rHost.dataset.miniTicks)));
  note(t2 < t1, `G3 渡口按钮同样点得动（天光 ${t1} → ${t2}）`);
  await ctx.close();
}

/* ══════════════ E. 全轮：0 异常 · 0 次模型调用 ══════════════ */
console.log('\nE. 整轮卫生');
const fin = await read();
note(pageErrs.length === 0, `E1 整轮 0 条未捕获的页面异常（实得 ${pageErrs.length} 条）`);
if (pageErrs.length) pageErrs.slice(0, 4).forEach((e) => info(`   pageerror: ${e}`));
note(fin.hits === 0, `E2 整轮 0 次 /api/decide（实得 ${fin.hits} 次）`);
note(fin.err === undefined || fin.err === null, `E3 没有玩法抛错（${fin.err || '无'}）`);

console.log(`\n═══ ${bad ? `【有红】失败 ${bad} 项` : '【全绿】'} ═══`);
console.log(`产物：${OUT}`);
try { browser.process()?.kill('SIGKILL'); } catch { /* 收尾别用 browser.close()：会挂住不退出 */ }
process.exit(bad ? 1 : 0);
