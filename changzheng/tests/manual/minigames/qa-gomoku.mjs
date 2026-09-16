/**
 * 《泥地五子棋》（重做版）专项快检 —— 只跑这一支，不碰全量套件。
 *
 * 五段：
 *   A. 引擎与判定（纯函数）：空盘开局不许落角上、必须堵成五、我成五优先、水洼封路、
 *      三档棋力**真的分层**（五条性质：最弱档对中/硬档一场不赢、硬档强过中档、
 *      硬档与最弱档自对自都要能分出胜负）、结算五档、预告带恒合法。
 *   B. 四种打法跑同一份代码，数字必须分叉：强驱动赢 / 认输 / 让子赢 / 乱点。
 *      **让子赢 0.72 vs 实打实赢 1.00** 是"让子这个抉择真的改分数"的唯一证据。
 *      ⚠️ 强驱动的对手用最弱档：中/硬档两个都会防，强驱动打中档 40 局只分 11:4、其余 25 局全平
 *      （A5c）—— 那是引擎特性（两个会防的引擎互堵到棋盘填满），不是分数模型该测的东西。
 *   C. 真点击（reducedMotion）+ 契约四项 + **整局 0 次 /api/decide** + 同种子完全可复现。
 *   D. 像素：把 81 个格心的小块颜色**分类**，与 `miniBoardText` 逐格对账 ——
 *      "看见的位置 = 判定的位置"最直接的证据；带一条"故意偏半格"的反证。
 *      + 渗水预告带可见（亮过对照格）+ 水洼比泥地明显发青 + 胜负圈只在赢的那五格上（对照组 = 0）。
 *      ⚠️ 分**两帧**采样：预告带只在渗水前那一手存在（第 7 手），水洼要下一手才落定 ——
 *      "有子 + 有水洼 + 有带"在同一帧里根本不可能同时成立（而且带子还会被"成五结算"顶掉）。
 *   E. AI 两个方向的假接口对照（默认窗口 10s）：延迟 12s 必须落到引擎、延迟 0.2s 必须用模型的 pick；
 *      再加一条「在飞的请求被作废」—— 催完之后等到 12s 仍然只有一颗小鬼的子。
 *      假接口**故意不实现 signal** —— 正好能把"只靠 AbortSignal 的假上限"照出来。
 *
 * 用法：先起服务 node server/index.js，然后
 *   node tests/manual/qa-gomoku.mjs            # 全跑（约 3 分钟）
 *   node tests/manual/qa-gomoku.mjs --no-model # 跳过 E 段（约 1 分钟）
 * **照例后台跑**（本机 bash 前台上限约 120 秒，超了会被 SIGTERM 而且日志是空的）。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const LAB = 'http://localhost:3001/dev/minigame-lab.html';
const OUT = path.join('tests', 'e2e', 'artifacts', 'mud-gomoku');
fs.mkdirSync(OUT, { recursive: true });
const NO_MODEL = process.argv.includes('--no-model');

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let bad = 0;
const note = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? '✓' : '✗'} ${line}`); };
const info = (line) => console.log(`    · ${line}`);

/* 调试台一打开就会**自动跑列表第一个玩法**（那一支会真调模型）。
   这里把 /api/decide 挡掉，同时数它被调了几次 —— 数出来就是 C 段"游戏内 0 次调用"的主证据。 */
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

/* ══════════ 装载与读数 ══════════ */

/** 把玩法直接装进调试台的板身里（不走调试台自己的列表，免得它的 auto-run 掺进来）。
 *  ⚠️ 每装一次发一个序号 `__gBoot`：被撤下来的旧实例（计时器还在跑）之后如果 resolve，
 *     序号对不上就丢掉 —— 不然 read() 会读到上一局的分数，看着像"这一局没结算"。 */
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
    const m = await import('/js/minigames-gomoku.js');
    m.runMudGomoku(host, {
      ...o,
      rnd: o.rndSeed == null ? undefined : m.mulberry32(o.rndSeed),
    }).then((r) => { if (window.__gBoot === tok) window.__gRes = r; });
  }, opts);
  await page.waitForFunction(() => window.__gHost && window.__gHost.dataset.mini, null, { timeout: 10000 });
}

async function read(page) {
  return page.evaluate(() => {
    const h = window.__gHost;
    const out = {};
    if (h) for (const k of Object.keys(h.dataset)) out[k] = h.dataset[k];
    out.acts = h ? h.querySelectorAll('[data-mini-action]').length : -1;
    out.places = h ? h.querySelectorAll('.smini8-cell[data-mini-action="place"]').length : -1;
    out.res = window.__gRes;
    out.hits = window.__decideHits;
    return out;
  });
}

/** 强驱动：按页面内引擎（hard、无噪声）算出的最佳点落子 —— 相当于"会用引擎的玩家"。 */
async function strongCell(page) {
  return page.evaluate(async () => {
    const m = await import('/js/minigames-gomoku.js');
    const rows = String(window.__gHost.dataset.miniBoardText || '').split('/').filter(Boolean);
    const b = m.makeBoard();
    const pud = [];
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x += 1) {
        if (r[x] === 'X') b[y][x] = 1;
        else if (r[x] === 'O') b[y][x] = 2;
        else if (r[x] === '~') pud.push([x, y]);
      }
    });
    const c = m.topCandidates(b, m.toBlocked(pud), 1, 'hard', 1)[0];
    return c ? { x: c.x, y: c.y, note: c.note } : null;
  });
}

const clickCell = (page, x, y) => page.click(
  `#g-host .smini8-cell[data-x="${x}"][data-y="${y}"]`, { timeout: 4000 },
);

/** 玩家先落一子（AI 模式下"小鬼思考"只会在玩家落子之后开始） */
async function playerOpen(page) {
  for (let i = 0; i < 60; i += 1) {
    const st = await read(page);
    if (st.miniTurn === 'you' && Number(st.miniLegal) > 0) {
      const c = await strongCell(page);
      if (c) await clickCell(page, c.x, c.y);
      return true;
    }
    await page.waitForTimeout(120);
  }
  return false;
}

/** 强驱动：一直落子到结算 */
async function playStrong(page, maxPlies = 80) {
  for (let i = 0; i < maxPlies; i += 1) {
    const st = await read(page);
    if (st.res) return st.res;
    if (st.miniTurn !== 'you' || Number(st.miniLegal) === 0) { await page.waitForTimeout(140); continue; }
    const c = await strongCell(page);
    if (!c) break;
    if (Number(st.miniLegal) !== st.places) {
      return { __contractFail: `place 元素数与 miniLegal 不符：${st.places} vs ${st.miniLegal}` };
    }
    await clickCell(page, c.x, c.y);
    await page.waitForTimeout(110);
  }
  for (let i = 0; i < 60; i += 1) {
    const st = await read(page);
    if (st.res) return st.res;
    await page.waitForTimeout(150);
  }
  return (await read(page)).res;
}

/** 乱点：永远点"最左上那个可落子格" —— 一个明确的烂打法 */
async function playDumb(page, maxPlies = 80) {
  for (let i = 0; i < maxPlies; i += 1) {
    const st = await read(page);
    if (st.res) return st.res;
    if (st.miniTurn !== 'you' || Number(st.miniLegal) === 0) { await page.waitForTimeout(140); continue; }
    await page.locator('#g-host .smini8-cell[data-mini-action="place"]').first().click({ timeout: 4000 });
    await page.waitForTimeout(110);
  }
  for (let i = 0; i < 60; i += 1) {
    const st = await read(page);
    if (st.res) return st.res;
    await page.waitForTimeout(150);
  }
  return (await read(page)).res;
}

/* ══════════ A：引擎与判定（纯函数）══════════ */
console.log('\n=== A. 引擎与判定（纯函数）===');
const A = await (async () => {
  const p = await browser.newPage();
  await p.addInitScript(blockDecide);
  await p.goto(LAB, { waitUntil: 'load' });
  const out = await p.evaluate(async () => {
    const m = await import('/js/minigames-gomoku.js');
    const R = {};
    const bl = m.toBlocked([]);

    // A1 空盘开局：前三候选必须都在中心一带。
    // 空盘上 pointScore 处处为 0，所以差别**只能**来自中心项 —— 没有它就退化成扫描序，落 (0,0)。
    R.open = m.topCandidates(m.makeBoard(), bl, 2, 'mid', 3, m.mulberry32(1)).map((c) => [c.x, c.y]);
    R.openFar = R.open.filter(([x, y]) => Math.abs(x - 4) + Math.abs(y - 4) > 2).length;

    // A2 对手活四 → 必须堵在成五端点上
    const b3 = m.makeBoard();
    for (let i = 2; i < 6; i += 1) b3[4][i] = 2;
    const mv = m.chooseMove(b3, bl, 1, 'mid', m.mulberry32(7));
    R.block = mv && { x: mv.x, y: mv.y, five: m.pointScore(b3, bl, mv.x, mv.y, 2) >= m.WIN5[5] };

    // A3 我成五 vs 对手也成五 → 必须先赢
    const b5 = m.makeBoard();
    for (let i = 1; i < 5; i += 1) b5[2][i] = 1;
    for (let i = 2; i < 6; i += 1) b5[6][i] = 2;
    const mv5 = m.chooseMove(b5, bl, 1, 'mid', m.mulberry32(11));
    R.winFirst = mv5 && { x: mv5.x, y: mv5.y, five: m.pointScore(b5, bl, mv5.x, mv5.y, 1) >= m.WIN5[5] };

    // A4 水洼封路 + 反证：不封那两端时同一行上**有**成五点
    const b6 = m.makeBoard();
    for (let i = 1; i < 5; i += 1) b6[2][i] = 1;
    const fiveSpots = (blk) => m.legalMoves(b6, blk)
      .filter(([x, y]) => m.pointScore(b6, blk, x, y, 1) >= m.WIN5[5]).length;
    R.sealed = fiveSpots(m.toBlocked([[0, 2], [5, 2]]));
    R.unsealed = fiveSpots(m.toBlocked([]));

    // A5 三档棋力真的分层：固定种子交替先后手，**四条性质**一起看。
    //    ⚠️ 判据取性质、不取某个具体胜场数 —— 引擎一改数字就漂，性质不会。
    //    平局偏高是这套引擎的固有特性（两个都会防的引擎在小盘上容易互堵到填满），
    //    所以"分层"的硬证据是：**最弱档对最强档一场不赢** + 硬档自对自能分出胜负。
    const duel = (la, lb, seed) => {
      const rnd = m.mulberry32(seed);
      const b = m.makeBoard();
      const blk = m.toBlocked([]);
      for (let p = 0; p < 81; p += 1) {
        const who = p % 2 === 0 ? 1 : 2;
        const c = m.chooseMove(b, blk, who, who === 1 ? la : lb, rnd);
        if (!c) return 0;
        b[c.y][c.x] = who;
        if (m.findFive(b, who)) return who;
      }
      return 0;
    };
    const match = (la, lb, n = 40, seedBase = 900) => {
      let a = 0;
      let b = 0;
      let d = 0;
      for (let k = 0; k < n; k += 1) {
        const aIsP1 = k % 2 === 1;
        const r = aIsP1 ? duel(la, lb, seedBase + k) : duel(lb, la, seedBase + k);
        if (r === 0) d += 1;
        else if ((r === 1) === aIsP1) a += 1;
        else b += 1;
      }
      return { a, b, d };
    };
    R.me = match('mid', 'easy');
    R.he = match('hard', 'easy');
    R.hm = match('hard', 'mid');
    R.hh = match('hard', 'hard');
    R.ee = match('easy', 'easy');

    // A6 结算五档 + 让子改上限 + 观棋三档
    R.grade = ['win', 'lose', 'draw', 'resign']
      .map((r) => m.gradeGame({ result: r, handicap: false, moves: 20, puddles: 2 }).score);
    R.gradeH = m.gradeGame({ result: 'win', handicap: true, moves: 20, puddles: 2 }).score;
    R.spectate = [1, 2, 0].map((w) => m.gradeSpectate(w).outcome);

    // A7 预告带：恒为三格、且至少两格能落子（40 次抽样）
    const b7 = m.makeBoard();
    for (let i = 1; i < 5; i += 1) b7[4][i] = 1;
    const bands = [];
    for (let k = 0; k < 40; k += 1) {
      const band = m.planBand(b7, m.toBlocked([]), { x: 4, y: 4 }, m.mulberry32(k));
      bands.push({ len: band ? band.length : 0, empt: band ? band.filter(([x, y]) => b7[y][x] === 0).length : -1 });
    }
    R.band = { allThree: bands.every((b) => b.len === 3), allEnough: bands.every((b) => b.empt >= 2) };

    // A8 五连 / 最长连
    const b8 = m.makeBoard();
    for (let i = 0; i < 5; i += 1) b8[3][i] = 1;
    const five = m.findFive(b8, 1);
    R.five = { cells: five ? five.length : 0, run: m.longestRun(b8, 1), noneFor2: m.findFive(b8, 2) === null };
    return R;
  });
  await p.close();
  return out;
})();

note(A.open.length === 3 && A.openFar === 0, `A1 空盘开局不出角：前三 = ${JSON.stringify(A.open)}`);
note(!!A.block && A.block.five, `A2 对手活四必堵成五端点：${JSON.stringify(A.block)}`);
note(!!A.winFirst && A.winFirst.five, `A3 自己能成五时优先赢、不先去挡：${JSON.stringify(A.winFirst)}`);
note(A.sealed === 0 && A.unsealed > 0, `A4 水洼封路：两端封住后成五点 ${A.sealed} 个（未封时 ${A.unsealed} 个）`);
note(A.me.b === 0 && A.me.a >= 20,
  `A5a 最弱档打不过中档：mid 对 easy 40 局 ${A.me.a} 胜 / ${A.me.b} 负 / ${A.me.d} 平`);
note(A.he.b === 0, `A5b 最弱档打不过硬档：hard 对 easy ${A.he.a} 胜 / ${A.he.b} 负 / ${A.he.d} 平`);
note(A.hm.a > A.hm.b && A.hm.b <= 6,
  `A5c 硬档强过中档且不落下风：hard 对 mid ${A.hm.a} 胜 / ${A.hm.b} 负 / ${A.hm.d} 平`);
note(A.hh.d <= 10, `A5d 硬档自对自能分出胜负（平局 ${A.hh.d}/40 —— 旧版是 40/40 全平）`);
note(A.ee.d <= 10, `A5e 最弱档自对自也能分出胜负（平局 ${A.ee.d}/40）`);
note(A.grade[0] === 1 && A.gradeH === 0.72 && A.grade[1] === 0.2 && A.grade[2] === 0.45 && A.grade[3] === 0.12,
  `A6 结算五档：赢 ${A.grade[0]} / 让子赢 ${A.gradeH} / 输 ${A.grade[1]} / 平 ${A.grade[2]} / 认输 ${A.grade[3]}`);
note(A.spectate.join('|') === 'spectate-dark|spectate-light|spectate-draw', `A6b 观棋三档：${A.spectate.join(' / ')}`);
note(A.band.allThree && A.band.allEnough, 'A7 预告带恒为三格且至少两格能落子（40 次抽样）');
note(A.five.cells === 5 && A.five.run === 5 && A.five.noneFor2,
  `A8 五连判定：cells=${A.five.cells} run=${A.five.run} 对手无五=${A.five.noneFor2}`);

/* ══════════ B：四种打法，数字必须分叉 ══════════ */
console.log('\n=== B. 四种打法（真点击，同一份代码）===');
const ctx = await browser.newContext({
  reducedMotion: 'reduce', deviceScaleFactor: 2, viewport: { width: 1440, height: 940 },
});
const page = await ctx.newPage();
await page.addInitScript(blockDecide);
await page.goto(LAB, { waitUntil: 'load' });
await page.waitForFunction(() => !!document.getElementById('mini-host'), null, { timeout: 20000 }).catch(() => {});

/* 玩家一侧固定是 hard（"会下的人"）。对手必须挑**最弱档**：中/硬档两个都会防，
   强驱动打中档 40 局只赢 7 局、平 25 局 —— 那是引擎特性，不是我们要测的分数模型。
   最弱档也不能保证每个种子都赢（也会平），所以这里最多试 3 个种子，取一局真赢下来的。 */
async function playUntilWin(page, opts, seeds) {
  for (const rndSeed of seeds) {
    await boot(page, { ...opts, rndSeed });
    const r = await playStrong(page);
    if (r && r.detail && r.detail.result === 'win') return { r, rndSeed };
    info(`    种子 ${rndSeed} 没赢（${r && r.detail ? r.detail.result : '?'}），换一个`);
  }
  return { r: null, rndSeed: seeds[seeds.length - 1] };
}

const B = {};
const brief = (r) => (r && r.detail ? `${r.score} / ${r.detail.result || r.detail.outcome} / ${r.detail.moves}手 / 水洼${r.detail.puddles}` : JSON.stringify(r));

const fair = await playUntilWin(page, { autoStart: true, handicap: false, level: 'easy' }, [4242, 4243, 4245]);
B.fair = fair.r;
info(`B1 实打实 · 强驱动（对手 easy，种子 ${fair.rndSeed}）→ ${brief(B.fair)}`);

await boot(page, { autoStart: true, handicap: false, level: 'mid', rndSeed: 4243 });
await page.click('#g-host [data-mini-action="resign"]', { timeout: 4000 });
B.resign = (await read(page)).res;
info(`B2 认输 → ${brief(B.resign)}`);

const handi = await playUntilWin(page, { autoStart: true, handicap: true, level: 'easy' }, [4244, 4246, 4247]);
B.handicap = handi.r;
info(`B3 让子 · 强驱动（对手 easy，种子 ${handi.rndSeed}）→ ${brief(B.handicap)}`);

await boot(page, { autoStart: true, handicap: false, level: 'hard', rndSeed: 4246 });
B.dumb = await playDumb(page);
info(`B4 乱点（对手 hard）→ ${brief(B.dumb)}`);

const sc = (r) => (r && typeof r.score === 'number' ? r.score : NaN);
note(!!B.fair && B.fair.detail.result === 'win' && sc(B.fair) === 1, `B1 实打实赢 = 1.00（实际 ${sc(B.fair)}）`);
note(!!B.resign && B.resign.detail.outcome === 'resign' && sc(B.resign) === 0.12, `B2 认输 = 0.12（实际 ${sc(B.resign)}）`);
note(!!B.handicap && B.handicap.detail.result === 'win' && sc(B.handicap) === 0.72,
  `B3 让子赢被压到 0.72（实际 ${sc(B.handicap)}）—— 让子这个抉择真的改分数`);
note(!!B.dumb && sc(B.dumb) <= 0.45, `B4 乱点 ≤ 0.45（实际 ${sc(B.dumb)}）`);
note(sc(B.fair) > sc(B.handicap) && sc(B.handicap) > sc(B.resign) && sc(B.fair) > sc(B.dumb),
  'B5 四个分数真的分叉（实打实 > 让子 > 认输，且实打实 > 乱点）');

/* ══════════ C：契约 + 减动效可点 + 0 次调用 ══════════ */
console.log('\n=== C. 契约 / 减动效可点 / 0 次模型调用 ===');
await boot(page, { autoStart: true, handicap: false, level: 'mid', rndSeed: 777 });
const c0 = await read(page);
note(c0.mini === 'mud-gomoku', `C1 host[data-mini] = ${c0.mini}`);
note(['setup', 'play', 'think', 'spectate', 'spectate-think', 'done'].includes(c0.miniState),
  `C2 host[data-mini-state] = ${c0.miniState}`);
note(c0.places === Number(c0.miniLegal), `C3 [data-mini-action="place"] 数 = miniLegal（${c0.places} / ${c0.miniLegal}）`);

const hit = await page.evaluate(() => {
  const h = window.__gHost;
  const c = h.querySelector('.smini8-cell[data-mini-action="place"]');
  if (!c) return { ok: false, why: '没有可落子格' };
  const r = c.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { ok: el === c, tag: (el && el.className) || '(null)' };
});
note(hit.ok, `C4 reduced-motion 下 elementFromPoint 命中格子自己（拿到的是 ${hit.tag}）`);
await page.click('#g-host .smini8-cell[data-mini-action="place"]', { timeout: 4000 });
const c1 = await read(page);
note(Number(c1.miniMoves) === 1, `C5 不带 force 的真点击落子成功（手数 ${c1.miniMoves}）`);

// 水洼格不可点
for (let i = 0; i < 120; i += 1) {
  const st = await read(page);
  if (st.res || Number(st.miniPuddles) >= 1) break;
  if (st.miniTurn === 'you' && Number(st.miniLegal) > 0) {
    const c = await strongCell(page);
    if (c) await clickCell(page, c.x, c.y);
  }
  await page.waitForTimeout(110);
}
const pHit = await page.evaluate(() => {
  const h = window.__gHost;
  if (Number(h.dataset.miniPuddles) === 0) return { skipped: true };
  const cells = [...h.querySelectorAll('.smini8-cell[data-stone="puddle"]')];
  return { n: cells.length, withAction: cells.filter((c) => c.hasAttribute('data-mini-action')).length };
});
if (pHit.skipped) note(false, 'C6 这一局没渗出水来（不该发生）');
else note(pHit.n > 0 && pHit.withAction === 0, `C6 水洼格 ${pHit.n} 个，带 data-mini-action 的 ${pHit.withAction} 个（必须 0）`);

// 结算后交互元素归零 + 同种子完全可复现（对手用 easy：强驱动赢面大，但平/负一样要能结算）
await boot(page, { autoStart: true, handicap: false, level: 'easy', rndSeed: 4242 });
const done = await playStrong(page);
await page.waitForTimeout(250);
const c3 = await read(page);
note(!!done && !!done.detail, `C7 这一局走到了结算（${sc(done)} / ${done && done.detail ? done.detail.result : '?'}）`);
note(c3.acts === 0, `C8 结算后 [data-mini-action] 总数 = ${c3.acts}（必须 0）`);
note(c3.miniState === 'done' && c3.miniTurn === 'done', `C9 结算后状态词 = ${c3.miniState} / ${c3.miniTurn}`);

await boot(page, { autoStart: true, handicap: false, level: 'easy', rndSeed: 4242 });
const again = await playStrong(page);
note(!!again && !!done && !!again.detail && again.detail.moves === done.detail.moves
  && again.detail.result === done.detail.result && again.score === done.score,
  `C9b 同种子复跑完全一致（${done && done.detail ? done.detail.moves : '?'} 手 → ${again && again.detail ? again.detail.moves : '?'} 手，` 
  + `${done && done.detail ? done.detail.result : '?'} → ${again && again.detail ? again.detail.result : '?'}）`);

const hits = (await read(page)).hits;
note(hits === 0, `C10 全程 /api/decide 调用 ${hits} 次（默认路径必须 0）`);

await boot(page, { spectate: true, level: 'mid', rndSeed: 909 });
await page.waitForTimeout(250);
const c4 = await read(page);
note(c4.miniMode === 'spectate' && c4.places === 0, `C11 观棋模式 place 标记 = ${c4.places}（看客不能落子）`);
note((await page.locator('#g-host [data-mini-action="next"]').count()) === 1, 'C12 观棋模式有一个「下一手」');

/* ══════════ D：像素（客观视觉断言）══════════ */

/** 采样格心 26×26 小块的均值 → 分类。阈值见 minigames-gomoku.js 文件头那张表。 */
const classify = (p, shiftCss = 0) => p.evaluate((shift) => {
  const h = window.__gHost;
  const cv = h.querySelector('canvas.smini8-cv');
  const geo = JSON.parse(h.dataset.miniBoard);
  const { n, pad, cell, dpr } = geo;
  const g = cv.getContext('2d');
  const R = Math.round(13 * dpr);
  const out = [];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const cx = (pad + x * cell + cell / 2 + shift) * dpr;
      const cy = (pad + y * cell + cell / 2) * dpr;
      const im = g.getImageData(Math.round(cx - R), Math.round(cy - R), 2 * R, 2 * R).data;
      let L = 0;
      let C = 0;
      let cnt = 0;
      for (let i = 0; i < im.length; i += 4) {
        L += (im[i] + im[i + 1] + im[i + 2]) / 3;
        C += (im[i + 2] - im[i]);
        cnt += 1;
      }
      L /= cnt;
      C /= cnt;
      let cls = 'mud';
      if (L > 120) cls = 'light';
      else if (C > 28) cls = 'puddle';
      else if (C > 8) cls = 'dark';
      else if (L > 49) cls = 'wetband';
      out.push({ x, y, cls, L: Math.round(L * 10) / 10, C: Math.round(C * 10) / 10 });
    }
  }
  return out;
}, shiftCss);

const expectedCls = (ch) => (ch === 'X' ? 'dark' : ch === 'O' ? 'light' : ch === '~' ? 'puddle' : 'mud|wetband');

async function pixelReport(p, tag) {
  const st = await read(p);
  const px = await classify(p);
  const rows = String(st.miniBoardText || '').split('/').filter(Boolean);
  const counts = { dark: 0, light: 0, puddle: 0, wetband: 0, mud: 0 };
  px.forEach((q) => { counts[q.cls] += 1; });
  const wrong = [];
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y].length; x += 1) {
      const ch = rows[y][x];
      if (!expectedCls(ch).split('|').includes(px[y * 9 + x].cls)) {
        wrong.push(`${String.fromCharCode(65 + x)}${y + 1}:${ch}→${px[y * 9 + x].cls}`);
      }
    }
  }
  const shifted = await classify(p, 17);
  let shiftedWrong = 0;
  let informative = 0;
  const n = rows.length;
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y].length; x += 1) {
      const ch = rows[y][x];
      if (expectedCls(ch) === 'mud|wetband') continue;   // 空地对偏格不敏感，只看有子的格
      informative += 1;
      if (!expectedCls(ch).split('|').includes(shifted[y * n + x].cls)) shiftedWrong += 1;
    }
  }
  info(`${tag} 分类计数 ${JSON.stringify(counts)}；错格 ${wrong.length}${wrong.length ? ' → ' + wrong.slice(0, 6).join(' ') : ''}`);
  return { wrong: wrong.length, shiftedWrong, informative, px, rows };
}

console.log('\n=== D. 像素：格心分类 vs miniBoardText ===');
// 这一局用 easy 当对手：D4 要验证"赢的那五格上有亮圈"，强驱动对 easy 才赢得下来
//（对 mid 会大量平局 —— 见 A5c）。
await boot(page, { autoStart: true, handicap: false, level: 'easy', rndSeed: 4242 });

/** 一直下到满足 `until`（或结算）为止 */
async function drive(until, maxIter = 200) {
  for (let i = 0; i < maxIter; i += 1) {
    const st = await read(page);
    if (st.res) return st;
    if (until(st)) return st;
    if (st.miniTurn === 'you' && Number(st.miniLegal) > 0) {
      const c = await strongCell(page);
      if (c) await clickCell(page, c.x, c.y);
    }
    await page.waitForTimeout(110);
  }
  return read(page);
}

// ⚠️ 采样时机只能这么挑：**预告带只在"渗水前那一手"存在**（第 7/11/15… 手），
//    水洼要到下一手才落定 —— 所以"有子 + 有水洼 + 有预告带"在**同一帧**里根本不可能同时成立。
//    而且带子还会跟"成五结算"抢位置：`afterMove` 先判胜负，赢了就直接 return，
//    `schedulePuddle()` 压根不跑（这一局第 11 手就成五了，所以第 11 手没有带子）。
//    上一版把条件写成了三者同时 → 永远不成立 → 采样落到成五那一帧，
//    盘上 11 颗子、1 处水洼、没有带，D3 报"没抓到可比的预告带"。
//    现在拆成两次采样：先在**第 7 手**（带子 + 7 颗子）验分类/半格反证/带子可见，
//    再往下走到**水洼落定**验"水洼格真的是那一片淤青"。
await drive((st) => st.miniBand && Number(st.miniMoves) >= 7);
const mid = await pixelReport(page, 'D1 中局（7 颗子 + 渗水预告带，还没落水洼）');
note(mid.wrong === 0, `D1 每个格心的类别都与 miniBoardText 一致（错格 ${mid.wrong}，涉及 ${mid.informative} 个有子格）`);
note(mid.shiftedWrong >= 3, `D2 反证：采样整体偏半格后错格升到 ${mid.shiftedWrong} —— 这个度量确实在定位`);

// 特写图：canvas 光栅化（不用 locator.screenshot —— 它会等稳定、30 秒超时）
const shot1 = await page.evaluate(() => window.__gHost.querySelector('canvas.smini8-cv').toDataURL('image/png'));
fs.writeFileSync(path.join(OUT, '01-midgame.png'), Buffer.from(shot1.split(',')[1], 'base64'));

// 预告带可见：带内的**空地**格比远处空地亮（带内若有子就跳过那一格 —— 石子本来就亮）
const band = await page.evaluate(() => String(window.__gHost.dataset.miniBand || '')
  .split(';').filter(Boolean).map((s) => s.split(',').map(Number)));
const dN = mid.rows.length;
const bandEmpty = band.filter(([x, y]) => mid.rows[y] && mid.rows[y][x] === '.');
const far = [[0, 0], [dN - 1, 0], [0, dN - 1], [dN - 1, dN - 1]]
  .map(([x, y]) => mid.px[y * dN + x]).filter((q) => q.cls === 'mud');
if (band.length === 3 && bandEmpty.length && far.length) {
  const bL = bandEmpty.reduce((s, [x, y]) => s + mid.px[y * dN + x].L, 0) / bandEmpty.length;
  const fL = far.reduce((s, q) => s + q.L, 0) / far.length;
  note(bL > fL + 8, `D3 渗水预告带看得见：带内空地 L=${bL.toFixed(1)} vs 远处空地 L=${fL.toFixed(1)}（差 ${(bL - fL).toFixed(1)}）`);
} else {
  note(false, `D3 没抓到可比的预告带（band=${JSON.stringify(band)} 其中空地 ${bandEmpty.length} 格，远处对照 ${far.length} 格）`);
}

// 水洼落定：这一帧专门验"水洼格 = 那一片淤青"（C 是蓝红差，只有水洼会大幅偏正）
await drive((st) => Number(st.miniPuddles) >= 1 && Number(st.miniMoves) >= 8);
const wet = await pixelReport(page, 'D1b 水洼落定后');
note(wet.wrong === 0, `D1b 水洼落定后分类仍然全对（错格 ${wet.wrong}）`);
const wetRows = wet.rows;
const wetPts = [];
for (let y = 0; y < wetRows.length; y += 1) {
  for (let x = 0; x < wetRows[y].length; x += 1) if (wetRows[y][x] === '~') wetPts.push([x, y]);
}
const mudPts = [];
for (let y = 0; y < wetRows.length; y += 1) {
  for (let x = 0; x < wetRows[y].length; x += 1) if (wetRows[y][x] === '.') mudPts.push([x, y]);
}
if (wetPts.length && mudPts.length) {
  const wC = wetPts.reduce((s, [x, y]) => s + wet.px[y * dN + x].C, 0) / wetPts.length;
  const mC = mudPts.reduce((s, [x, y]) => s + wet.px[y * dN + x].C, 0) / mudPts.length;
  note(wC > 28 && mC < 8 && wC - mC > 30,
    `D1c 水洼是"淤黑发青"：水洼格 C=${wC.toFixed(1)} vs 泥地 C=${mC.toFixed(1)}（差 ${(wC - mC).toFixed(1)}，`
    + '两边的阈值分别 28 / 8）');
} else {
  note(false, `D1c 这一帧没有水洼格（${wetPts.length} 个）`);
}

const finished = await playStrong(page);
await page.waitForTimeout(250);
const shot2 = await page.evaluate(() => window.__gHost.querySelector('canvas.smini8-cv').toDataURL('image/png'));
fs.writeFileSync(path.join(OUT, '02-win.png'), Buffer.from(shot2.split(',')[1], 'base64'));

const ring = await page.evaluate((line) => {
  const h = window.__gHost;
  const cv = h.querySelector('canvas.smini8-cv');
  const { pad, cell, dpr } = JSON.parse(h.dataset.miniBoard);
  const g = cv.getContext('2d');
  const count = (cells, r0, r1) => {
    let n = 0;
    for (const [x, y] of cells) {
      const cx = (pad + x * cell + cell / 2) * dpr;
      const cy = (pad + y * cell + cell / 2) * dpr;
      const R = Math.round((r1 + 2) * dpr);
      const im = g.getImageData(Math.round(cx - R), Math.round(cy - R), 2 * R, 2 * R).data;
      for (let j = 0; j < 2 * R; j += 1) {
        for (let i = 0; i < 2 * R; i += 1) {
          const d = Math.hypot((i - R) / dpr, (j - R) / dpr);
          if (d < r0 || d > r1) continue;
          const o = (j * 2 * R + i) * 4;
          if (im[o] > 228 && im[o + 1] > 222 && im[o + 2] > 205 && im[o] - im[o + 2] < 44) n += 1;
        }
      }
    }
    return n;
  };
  const win = String(line || '').split('-').filter(Boolean)
    .map((s) => [s.charCodeAt(0) - 65, Number(s.slice(1)) - 1]);
  const txt = String(h.dataset.miniBoardText || '').split('/').filter(Boolean);
  const others = [];
  for (let y = 0; y < txt.length && others.length < 5; y += 1) {
    for (let x = 0; x < txt[y].length && others.length < 5; x += 1) {
      if (txt[y][x] !== 'O') continue;
      if (win.some(([wx, wy]) => wx === x && wy === y)) continue;
      // ⚠️ 必须离赢线 **≥2 格**：亮圈画在半径 16.2、线宽 5，也就是最多撑到 18.7px；
      //    而相邻格（34px）的采样环是距自己 15–18px —— 正好落在邻格亮圈的外沿上。
      //    上一版没排邻格，对照组吃到 30 个圈像素，看着像"没赢的浅色石子也发光"。
      if (win.some(([wx, wy]) => Math.max(Math.abs(wx - x), Math.abs(wy - y)) <= 1)) continue;
      others.push([x, y]);
    }
  }
  return {
    line: line || '',
    onWin: win.length ? count(win, 15, 18) : -1,
    ctrlRing: others.length ? count(others, 15, 18) : -1,
    offRadius: win.length ? count(win, 22, 25) : -1,
    nOthers: others.length,
  };
}, finished && finished.detail ? finished.detail.line : '');

note(!!finished && finished.detail.result === 'win', `D4 这一局赢下来了（line=${ring.line}）`);
note(ring.onWin > 150, `D5 赢的那五格上、半径 15–18 的亮圈像素 = ${ring.onWin}（>150）`);
note(ring.ctrlRing === 0, `D6 对照组：同样半径量**没赢的浅色石子**（${ring.nOthers} 格）= ${ring.ctrlRing}（必须 0）`);
note(ring.offRadius < Math.max(20, ring.onWin * 0.25),
  `D7 反证：同一批格子换个半径（22–25）量 = ${ring.offRadius} —— 证明量的是那一圈，不是"这块本来就亮"`);

/* ══════════ E：AI 两个方向的假接口对照 ══════════ */
if (NO_MODEL) {
  console.log('\n=== E. 跳过（--no-model）===');
} else {
  console.log('\n=== E. AI：假接口两个方向对照（默认窗口 10s）===');
  const ctx2 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 940 } });
  const p2 = await ctx2.newPage();
  const installFake = (delay) => p2.addInitScript((d) => {
    window.__decideHits = 0;
    window.__origFetch = window.fetch.bind(window);
    window.fetch = (url, init) => {
      if (String(url).includes('/api/decide')) {
        window.__decideHits += 1;
        // ⚠️ 故意**不实现** signal：真 fetch 会听话、假的不听话，
        //    正好把"只靠 AbortSignal 的假上限"照出来（分糖那轮就是这么抓到那个洞的）。
        return new Promise((res) => setTimeout(() => res(new Response(
          JSON.stringify({ ok: true, result: { pick: 1, say: '我下这儿。' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )), d));
      }
      return window.__origFetch(url, init);
    };
  }, delay);

  await installFake(12000);
  await p2.goto(LAB, { waitUntil: 'load' });
  await p2.waitForFunction(() => !!document.getElementById('mini-host'), null, { timeout: 20000 }).catch(() => {});

  // E1/E2/E3 延迟 12s（> 窗口）→ 10 秒内必须已经用引擎落了
  await boot(p2, { autoStart: true, handicap: false, level: 'mid', rndSeed: 31, ai: true });
  await playerOpen(p2);
  await p2.waitForFunction(() => window.__gHost.dataset.miniState === 'think', null, { timeout: 5000 });
  const t0 = Date.now();
  let fell = 0;
  for (let i = 0; i < 80; i += 1) {
    const st = await read(p2);
    if (st.miniTurn === 'you' && Number(st.miniMoves) >= 2) { fell = Date.now() - t0; break; }
    await p2.waitForTimeout(150);
  }
  const e1 = await read(p2);
  note(fell > 0 && fell < 11500, `E1 假接口 12s（>窗口）：${(fell / 1000).toFixed(1)}s 就轮到我了 —— 窗口真的在掐`);
  note(e1.miniMoveFrom === 'engine', `E2 超窗落到引擎：miniMoveFrom = ${e1.miniMoveFrom}（不能是 model）`);
  note(e1.hits >= 1, `E3 假接口确实被调到了（${e1.hits} 次）—— 证明不是"压根没发请求"`);

  // E4/E5/E6「催他一手」：不等，立刻用引擎落；**在飞的那次请求必须被作废**
  await boot(p2, { autoStart: true, handicap: false, level: 'mid', rndSeed: 32, ai: true });
  await playerOpen(p2);
  await p2.waitForFunction(() => window.__gHost.dataset.miniState === 'think', null, { timeout: 5000 });
  const tb = Date.now();
  await p2.click('#g-host [data-mini-action="urge"]', { timeout: 4000 });
  let urged = 0;
  for (let i = 0; i < 40; i += 1) {
    const st = await read(p2);
    if (st.miniTurn === 'you' && Number(st.miniMoves) >= 2) { urged = Date.now() - tb; break; }
    await p2.waitForTimeout(100);
  }
  const e4 = await read(p2);
  note(urged > 0 && urged < 2500, `E4 「催他一手」${urged}ms 就落了（不用等窗口）`);
  note(Number(e4.miniKid) === 1 && e4.miniMoveFrom === 'engine',
    `E5 催完立刻只有 1 颗小鬼的子（kid=${e4.miniKid}，moveFrom=${e4.miniMoveFrom}）`);
  await p2.waitForTimeout(13000);   // 等到在飞的那次 12s 假接口真的回来
  const e6 = await read(p2);
  note(Number(e6.miniKid) === 1, `E6 在飞请求 12s 后回来，小鬼仍然只有 ${e6.miniKid} 颗 —— 作废生效，没有双落子`);

  // E7/E8 延迟 0.2s（< 窗口）→ 必须用模型给的 pick + 模型写的嘴
  await p2.evaluate(() => {
    const orig = window.__origFetch;
    window.fetch = (url, init) => {
      if (String(url).includes('/api/decide')) {
        window.__decideHits += 1;
        return new Promise((res) => setTimeout(() => res(new Response(
          JSON.stringify({ ok: true, result: { pick: 2, say: '这格是我的。' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )), 200));
      }
      return orig(url, init);
    };
  });
  await boot(p2, { autoStart: true, handicap: false, level: 'mid', rndSeed: 33, ai: true });
  await playerOpen(p2);
  await p2.waitForFunction(() => window.__gHost.dataset.miniState === 'think', null, { timeout: 5000 });
  let from = '';
  for (let i = 0; i < 60; i += 1) {
    const st = await read(p2);
    if (st.miniTurn === 'you' && Number(st.miniMoves) >= 2) { from = st.miniMoveFrom; break; }
    await p2.waitForTimeout(150);
  }
  const e8 = await p2.evaluate(() => ({
    say: document.querySelector('#g-host .smini8-say')?.textContent || '',
    miniSay: window.__gHost.dataset.miniSay || '',
  }));
  note(from === 'model', `E7 假接口 0.2s（<窗口）：miniMoveFrom = ${from}（必须是 model）`);
  // ⚠️ 这一条曾经红过：`afterMove` 换手时会把状态栏刷成固定嘲讽，模型写的那句只活几个毫秒。
  //    修法是让这一手的话经 `lastSay` 过渡过去（见 minigames-gomoku.js 的 afterMove）。
  note(e8.miniSay.includes('这格是我的') && e8.say.includes('这格是我的'),
    `E8 小鬼的嘴用的是模型写的那句（DOM/数据集两侧都对得上）：${e8.say.slice(0, 34)}`);
  await ctx2.close();
}

/* ══════════ 收尾 ══════════ */
const shots = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
console.log(`\n截图落盘：${shots.join(', ')}（${OUT}）`);
console.log(bad === 0 ? '\n【全绿】泥地五子棋专项快检通过' : `\n【有红】${bad} 项未通过`);
// ⚠️ 收尾顺序有坑（2026-09-16 最小复现）：`browser.close()` 之后**紧跟** `process.exit()`，
//    进程永远不会退出 —— 用例跑完了却卡到外层 timeout 才被杀，报 124，看着像"挂死"。
//    正确姿势：先把退出排到定时器上，再 close；关干净了立刻退，关不干净 4 秒后也退。
const finishExit = () => process.exit(bad ? 1 : 0);
setTimeout(finishExit, 4000);
browser.close().then(finishExit, finishExit);
