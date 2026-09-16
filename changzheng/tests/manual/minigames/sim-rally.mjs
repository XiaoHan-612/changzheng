/**
 * 《收拢》难度模拟 —— **先跑这个钉死难度，再调常数，最后才写 QA 断言**。
 *
 * 驱动的是**浏览器里的真实现**（不是把回合逻辑抄一遍纯 JS）：
 * 读 `dataset` 上暴露出来的面（miniTruth / miniEnemy / miniKnown / miniTicks）决定点哪里，
 * 八套打法打同一份代码，只印数、不下判。
 *
 * 这份模拟已经**两次推翻过设计**，都是先跑数、再改常数：
 *   ① 初版有"小组"配额（每搜一处耗一个）—— 配额把"贪搜"的玩家**卡住**搜不动、
 *      反而**被迫**去渡，越浪费越安全。**失败的边必须由时间画，不能由配额画。**
 *   ② 改完只剩"刻"一本账、但取了 9 刻 —— 模拟一看：正常打法（clue）四局全 18/18 满分，
 *      多出来的那 1 刻等于**白送一次误判**，失败边被抹平。→ 收到 **8 刻**，
 *      与最优线（搜 5 刻 + 渡 3 趟）**等长、零余量**。
 * 现在只有一本账：8 个方向 / 8 刻。你**可以把每一刻都花在搜上**，然后天亮、
 * 一个人也没过去（greedy 那条线就是它）。
 *
 * 用法：先起服务（node server/index.js），然后
 *   node tests/manual/sim-rally.mjs
 * 约 1 分钟。照例后台跑；两道硬退已经写在文件头。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const LAB = 'http://localhost:3001/dev/minigame-lab.html';

/* ⚠️ 两道硬退：中途一抛错，Chromium 子进程会把 Node 的事件循环一直吊着 ——
   进程既不退出、也不打一行日志。 */
setTimeout(() => { console.log('【看门狗】模拟超过 8 分钟，强制收尾'); process.exit(3); }, 480000);
process.on('unhandledRejection', (e) => { console.log('【未处理的拒绝】', (e && e.stack) || e); process.exit(4); });
// 顶层 await 里抛出的错在默认 --unhandled-rejections=throw 下**不走** unhandledRejection，
// 而是走 uncaughtException —— 只挂前两个的话进程会一声不响地死掉（踩过：一次 ReferenceError
// 让整轮模拟只留下两行表头）。三道硬退都要有。
process.on('uncaughtException', (e) => { console.log('【未捕获异常】', (e && e.stack) || e); process.exit(5); });

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.addInitScript(blockDecide);
await page.goto(LAB, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 20000 });

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
      m.runRally(host, { seed: sd, stats: document.getElementById('board-stats') })
        .then((r) => { window.__rRes = r; })
        .catch((e) => { window.__rErr = String(e && e.message); });
    } catch (e) { window.__rErr = String(e && e.message); }
  }, seed);
  await page.waitForFunction(() => window.__rHost && window.__rHost.dataset.miniState, null, { timeout: 10000 });
}

const read = () => page.evaluate(() => {
  const hd = window.__rHost;
  const d = hd ? { ...hd.dataset } : {};
  d.res = window.__rRes;
  d.err = window.__rErr;
  d.hits = window.__decideHits;
  d.ferryOn = !!(hd && hd.querySelector('[data-mini-action="ferry"]'));
  d.nAct = hd ? hd.querySelectorAll('[data-mini-action]').length : 0;
  return d;
});

const arr = (s) => String(s || '').split(',').map((x) => Number(x));
const vof = (s) => ({
  ticks: Number(s.miniTicks),
  gathered: Number(s.miniGathered), crossed: Number(s.miniCrossed),
  out: Number(s.miniOut), total: Number(s.miniTotal), cap: Number(s.miniFerryCap),
  truth: arr(s.miniTruth),
  role: String(s.miniRole || '').split(','),
  enemy: String(s.miniEnemy || '').split(',').map(Number),
  known: String(s.miniKnown || '').split(','),
  state: s.miniState,
});

const tickCost = (v, i) => (v.enemy[i] ? 2 : 1);      // 有敌情的方向：派人进去要两刻
const needTrips = (v) => Math.ceil(v.gathered / v.cap);
/** 还没搜过（greedy 用：连"已知是空的"也照搜，模拟手勤到底的人） */
const unsearched = (v) => v.known.map((k, i) => i).filter((i) => v.known[i] !== 's');
/**
 * 还**值得**去搜的（smart 用）。
 * ⚠️ 原先 smart 直接拿 unsearched，会把旁证已经判过"是空的"的方向也当成备选去赌 ——
 *    那等于把玩家往白搜上推，量出来的难度是假的。已知为空必须排除。
 */
const candidates = (v) => unsearched(v).filter((i) => v.known[i] !== 'n');

/**
 * 一个"像样的玩家"策略骨架：**先搜标了"有人"的，留够渡的刻，有余量才去赌未知的**。
 * 三种变体只差在怎么处理"有敌情的那一处"。
 */
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
  // ⚠️ 两道兜底，缺一个策略就会僵住、整局永不结算（玩法里没有"干等"这个动作），
  //    表现是整支打法全种子 `ERR no-resolve`：
  //      ① 还有没搜过、江边却没人 → 去搜（noWarn / callout 就在这一步踩过）；
  //      ② 能搜的都搜完了、只剩"空渡到天亮" → 也得渡（拒绝冒险的打法会走到这里）。
  if (u.length && v.ticks > 0) return { kind: 'search', dir: u[0] };
  return v.ticks > 0 ? { kind: 'ferry' } : null;
}

/* ── 八套打法（只读 dataset 上暴露出来的东西）──────────────────── */
const POL = {
  // 上限：偷看真值（人类理论上能打到的最好结果）
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

  // 只搜不渡（贪搜）——搜到没得搜为止，宁可空着刻也不渡
  greedy: (v) => {
    const un = unsearched(v);
    return un.length ? { kind: 'search', dir: un[0] } : null;
  },

  // 只渡不搜
  ferryOnly: (v) => (v.ticks > 0 ? { kind: 'ferry' } : null),

  // 按可见线索走（不偷看真值）
  clue: (v) => smart(v),

  // 不碰有敌情的方向（省两刻，但那一处的人救不回来）
  noWarn: (v) => smart(v, { skipEnemy: true }),

  // 有敌情的那处在外面喊（省一刻，只回来一半）
  callout: (v) => smart(v, { calloutEnemy: true }),

  // 开局先误判两次（去搜两个"没人提过"的方向），再照 clue 打
  slip2: (v) => {
    const q = v.role.map((r, i) => i).filter((i) => v.role[i] === 'quiet' && v.known[i] !== 's');
    if (q.length) return { kind: 'search', dir: q[0] };
    return smart(v);
  },

  /**
   * 不看线索、顺着方向编号一路扫（只在没刻时才渡）—— 最朴素的"手勤"打法。
   * ⚠️ 初版让它先搜标「有人」的、之后跟着旁证走，结果与 clue **四局同数** ——
   *    那根本没测出"不推理"的代价。这一版**彻底不看 known**，就按编号往下点。
   */
  blind: (v) => {
    const list = candidates(v);
    if (list.length && v.ticks > needTrips(v)) return { kind: 'search', dir: list[0] };
    if (v.gathered > 0) return { kind: 'ferry' };
    if (list.length && v.ticks > 0) return { kind: 'search', dir: list[0] };
    return v.ticks > 0 ? { kind: 'ferry' } : null;
  },
};

async function clickSel(sel) {
  const el = await page.$(sel);
  if (!el) return false;
  try { await page.click(sel, { timeout: 2500 }); return true; } catch { return false; }
}

async function play(policy, seed) {
  await boot(seed);
  let guard = 0;
  while (guard++ < 30) {
    const s = await read();
    if (s.err) return { seed, err: s.err };
    if (s.miniState === 'done') break;
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
  if (s.err) return { seed, err: s.err };
  if (!s.res) return { seed, err: 'no-resolve', ticks: s.miniTicks, state: s.miniState, gathered: s.miniGathered, known: s.miniKnown };
  const d = s.res.detail;
  return {
    seed, crossed: d.crossed, total: d.totalEast, outcome: d.outcome,
    ticksLeft: d.ticksLeft, gatheredLeft: d.gatheredLeft,
    score: s.res.score, hits: s.hits,
  };
}

/* ── 跑 ─────────────────────────────────────────────────────── */
const SEEDS = [11, 23, 37, 51];
const ORDER = ['oracle', 'clue', 'blind', 'slip2', 'callout', 'noWarn', 'greedy', 'ferryOnly'];

console.log('《收拢》难度模拟 —— ' + ORDER.length + ' 套打法 × ' + SEEDS.length + ' 个种子（驱动浏览器里的真实现）\n');
const summary = [];
for (const name of ORDER) {
  console.log(`── ${name} ──`);
  const rows = [];
  for (const sd of SEEDS) {
    const r = await play(POL[name], sd);
    rows.push(r);
    if (r.err) {
      console.log(`   seed=${sd}  ERR ${r.err}`
        + (r.ticks !== undefined ? `  【残局 刻=${r.ticks} 江边=${r.gathered} state=${r.state} known=${r.known}】` : ''));
      continue;
    }
    console.log(`   seed=${sd}  过江 ${String(r.crossed).padStart(2)}/${r.total}`
      + `  分 ${r.score.toFixed(2)}  结局 ${r.outcome.padEnd(4)}`
      + `  余刻 ${r.ticksLeft}  江边剩 ${r.gatheredLeft}  decide=${r.hits}`);
  }
  const ok = rows.filter((r) => !r.err);
  if (ok.length) summary.push([name, Math.min(...ok.map((r) => r.crossed)), Math.max(...ok.map((r) => r.crossed)), ok.length]);
}

console.log('\n═══ 汇总（过江人数 min~max）═══');
for (const [n, lo, hi, k] of summary) console.log(`  ${n.padEnd(10)} ${String(lo).padStart(2)} ~ ${String(hi).padStart(2)}  (${k} 局)`);
console.log('\n判读要点：oracle 必须 18/18（满分可达）；greedy / ferryOnly 必须 0；');
console.log('          clue（做排除法）要能满分；blind（不推理、顺着名单扫）必须明显掉档；');
console.log('          slip2 / noWarn / callout 各自反映"误判 / 不敢冒险 / 喊而不进"的代价。');

try { browser.process()?.kill('SIGKILL'); } catch { /* 收尾别用 browser.close()：见 docs/HANDOFF-RALLY.md */ }
process.exit(0);
