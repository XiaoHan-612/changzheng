/**
 * 《夜搭浮桥》（重做版）专项验收 —— 只跑这一支。
 *
 * 五段：
 *   A. 机制（模块常量 + 段位分区）：12 段 / 5 条船 / 断 2 次沉 / 加固 2 板 /
 *      稳流窗 / 浅滩与中流的分区。
 *   B. 三种打法分叉：正确（挂灯 + 船用在中流 + 掐窗下锚 + **攒够加固料再上桥** + 报警就加固）→ pass；
 *      不加固（让报警过期）→ 断 2 次 sunk；磨蹭（短夜表）→ 拂晓 exposed。
 *   C. 契约：id / 「部队上桥」的门槛（桥没搭完不可点）/ 状态序列
 *      （rig·anchor·cross·dismantle·done）/ 减动效下真点击「下船」「段位」/
 *      窗口外下锚真的变晃（决策有代价）/ 结算操作元素归零 / 整局 0 次 /api/decide。
 *   D. 像素：河水偏青 vs 天色、建好的桥段是暖木色（同屏与未建段对照）、
 *      夜色随时间真的变暗、挂马灯后船头出现暖灯点。
 *
 * 用法：node tests/manual/qa-pontoon.mjs   （~180 秒，后台跑）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const LAB = 'http://localhost:3001/dev/minigame-lab.html';
const OUT = path.join('tests', 'e2e', 'artifacts', 'pontoon-night');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let bad = 0;
/* ⚠️ 未捕获的页面异常必须算红（2026-09-16 踩到）：rAF 回调里抛一次错，
   requestAnimationFrame 就不会再排 —— 玩法静默冻在起点，dataset 上一点都看不出来，
   只表现为"永远不结算"。所以每个页面都挂错误收集，最后统一断言 0 条。*/
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
// 看门狗：页面一旦无响应，page.evaluate / page.click 会永久挂着 —— 到点强制收尾，别让用例吃到天亮
setTimeout(() => { console.log('\n【看门狗】用例超过 7 分钟，多半是页面已无响应，强制收尾'); process.exit(3); }, 420000);
const note = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? '✓' : '✗'} ${line}`); };
const info = (line) => console.log(`    · ${line}`);

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

async function boot(page, opts = {}) {
  alarmSeen = 0; lastAlarmSeg = -1;
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
    const m = await import('/js/minigames-pontoon.js');
    m.runPontoonNight(host, { stats: document.getElementById('board-stats'), ...o })
      .then((r) => { if (window.__gBoot === tok) window.__gRes = r; });
  }, opts);
  await page.waitForFunction(() => window.__gHost && window.__gHost.dataset.mini, null, { timeout: 10000 });
}
/** 状态序列靠 read() 自己收集 —— 别另起 setInterval 轮询：60ms 一次的 page.evaluate
 *  会和 driver 抢页面，时序一抖就会去点"已经消失的按钮"，裸 page.click 会一直重试到超时。*/
const seenStates = new Set();
const seenActs = new Set();      // 见过哪些 data-mini-action（用来证明「部队上桥」真的变成过可点）
let alarmSeen = 0;               // 这一局报过几次警（每段只会报一次：加固→R 或过窗→塌，都出局）
let lastAlarmSeg = -1;

async function read(page) {
  const out = await page.evaluate(() => {
    const h = window.__gHost;
    const o = {};
    if (h) for (const k of Object.keys(h.dataset)) o[k] = h.dataset[k];
    o.acts = h ? h.querySelectorAll('[data-mini-action]').length : -1;
    o.actNames = h ? [...h.querySelectorAll('[data-mini-action]')].map((e) => e.getAttribute('data-mini-action')) : [];
    o.res = window.__gRes;
    o.hits = window.__decideHits;
    return o;
  });
  if (out.miniState) seenStates.add(out.miniState);
  for (const a of out.actNames || []) seenActs.add(a);
  const ai = Number(out.miniAlarm);
  if (Number.isFinite(ai) && ai >= 0 && ai !== lastAlarmSeg) { alarmSeen += 1; lastAlarmSeg = ai; }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (st) => !!(st.res || st.miniState === 'done' || st.miniPhase === 'done');

/** 受保护的真点击：先确认这一帧真的有这个操作元素、且玩法还没结算 —— 否则直接返回 false，
 *  不让"按钮已经被清掉"变成一次 6 秒的等待或一个抛错。*/
async function clickSel(page, sel) {
  const st = await read(page);
  if (done(st)) return false;
  const el = await page.$(`#g-host ${sel}`);
  if (!el) return false;
  try { await page.click(`#g-host ${sel}`, { timeout: 3000 }); return true; }
  catch { return false; }
}
const clickAct = (page, act) => clickSel(page, `[data-mini-action="${act}"]`);
const clickSeg = (page, i) => clickSel(page, `[data-seg="${i}"][data-mini-action="seg"]`);

/** 正确打法：挂灯 → 浅滩铺板 → 中流 5 船 + 3 板排 → **等门板攒够** → 部队上桥
 *           → 渡河报警就加固 → 拆完。
 *
 *  ⚠️ 必须**自适应**（2026-09-16 重写）：门板是陆续送到的，某一步材料不够时那一次点击
 *     在游戏里就是空操作。原来那版"浅滩 → 船 → 中流排"一路点下去、某一环点空就 break，
 *     结果桥永远搭不满 → 连 cross 状态都进不去 → B1/B2/C7/C9 一起红，看着像玩法崩了，
 *     其实是驱动一次就放弃。现在每一轮都重新看"还缺哪段、手里几块板"：够就点，不够就等。
 *
 *  reserve = 上桥前要求手里留几块加固料。这是这一局真正的决策：留了就稳但费夜色，
 *  不留就抢时间但第一段报警必塌。 */
async function playProper(page, { reinforce = true, dismantle = true, reserve = 6 } = {}) {
  const deadline = Date.now() + 110000;
  await clickAct(page, 'lamp');
  const boatsSegs = [2, 3, 4, 5, 6];
  let crossed = false;
  for (; Date.now() < deadline; ) {
    const st = await read(page);
    if (st.res) return read(page);
    if (st.miniState === 'anchor') {                  // 下船之后要掐稳流窗下锚
      const [a, b] = st.miniLamp === '1' ? [32, 68] : [42, 58];
      const f = Number(st.miniFlow);
      if (f >= a && f <= b) await clickAct(page, 'anchor');
      await sleep(30);
      continue;
    }
    if (st.miniState === 'rig') {
      const empties = [];
      for (let i = 0; i < 12; i += 1) if (st.miniSegs[i] === '.') empties.push(i);
      const planks = Number(st.miniPlanks);
      if (empties.length) {
        const shallow = empties.filter((i) => i <= 1 || i >= 10);
        const mid = empties.filter((i) => i > 1 && i < 10);
        const boatSeg = mid.find((i) => boatsSegs.includes(i));
        if (shallow.length && planks >= 1) {
          await clickAct(page, 'mode-plank'); await clickSeg(page, shallow[0]);
        } else if (boatSeg !== undefined && Number(st.miniBoats) > 0 && planks >= 1) {
          await clickAct(page, 'mode-boat'); await clickSeg(page, boatSeg);
        } else if (mid.length && planks >= 2) {
          await clickAct(page, 'mode-plank'); await clickSeg(page, mid[0]);
        }
      } else if (!crossed && planks >= reserve) {
        await clickAct(page, 'cross');                  // 攒够加固料，放部队上桥
        crossed = true;
      }
      await sleep(50);
      continue;
    }
    if (st.miniState === 'cross') {
      if (reinforce && Number(st.miniAlarm) >= 0 && Number(st.miniPlanks) >= 2) await clickAct(page, 'reinforce');
      await sleep(45);
      continue;
    }
    if (st.miniState === 'dismantle') {
      if (!dismantle) return read(page);
      if (await page.$('#g-host [data-mini-action="seg"]')) await clickSel(page, '[data-mini-action="seg"]');
      await sleep(180);
      continue;
    }
    await sleep(60);
  }
  for (let i = 0; i < 120; i += 1) { const st = await read(page); if (st.res) return st; await sleep(90); }
  return read(page);
}

/** 「部队上桥」这个按钮当前的状态（存不存在 / 灰不灰 / 挂不挂 data-mini-action）。 */
const crossGate = (page) => page.evaluate(() => {
  const h = window.__gHost;
  const b = [...h.querySelectorAll('button')].find((x) => x.textContent.includes('部队上桥'));
  return b ? { disabled: b.disabled, act: b.getAttribute('data-mini-action') } : null;
});

/* ══════════════ A. 机制 ══════════════ */
{
  console.log('\n=== A. 机制（模块常量 + 分区）===');
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.addInitScript(blockDecide);
  await page.goto(LAB, { waitUntil: 'domcontentloaded' });
  // ⚠️ 等调试台**自己**装完 #mini-host（它的 select() 在顶层 await 之后才跑，会清空 board-body）
  await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 15000 });
  const A = await page.evaluate(async () => {
    const m = await import('/js/minigames-pontoon.js');
    const shallow = [];
    for (let i = 0; i < m.SEGS; i += 1) if (m.isShallow(i)) shallow.push(i);
    return {
      segs: m.SEGS, boats: m.BOATS, breaks: m.BREAK_MAX, cost: m.REINFORCE_COST,
      win: m.FLOW_WIN, winLamp: m.FLOW_WIN_LAMP, cap: m.PLANK_CAP, night: m.NIGHT_SEC,
      shallow, start: m.PLANK_START, every: m.PLANK_ARRIVE_EVERY, n: m.PLANK_ARRIVE_N,
    };
  });
  note(A.segs === 12 && A.boats === 5, `A1 桥 12 段、船只有 ${A.boats} 条（史实配给）`);
  note(A.shallow.length === 4 && A.shallow.join() === '0,1,10,11', `A2 两岸浅滩段 = ${A.shallow.join('/')}（其余是中流）`);
  note(A.breaks === 2 && A.cost === 2, `A3 断 ${A.breaks} 次沉、加固 ${A.cost} 板`);
  note(A.winLamp[0] < A.win[0] && A.winLamp[1] > A.win[1], `A4 马灯把稳流窗从 [${A.win}] 拉宽到 [${A.winLamp}]`);
  note(A.cap > A.start, `A5 门板起手 ${A.start}、每 ${A.every}s 到 ${A.n} 块、封顶 ${A.cap}`);
  await boot(page, { rndSeed: 5 });
  const st = await read(page);
  note(st.mini === 'pontoon-night' && st.miniState === 'rig' && st.miniSegs === '............',
    `A6 开局入夜·全部未搭（phase=${st.miniPhase}）`);
  // ⚠️ 不是 3 个：12 个桥段各自也是作用元素（还没搭 → 都带 data-mini-action="seg"），
  //    加上「下船 / 铺板排 / 挂马灯」= 15。段行只在变化时重建（见 minigames-pontoon.js 的 renderSegs）。
  //    「部队上桥」这一颗此时是灰的、**不挂** data-mini-action，所以不算在里面（桥搭满才 +1 → 16）。
  note(st.acts === 15, `A7 起手可点的作用元素 = 12 段 + 下船/铺板排 + 挂灯（${st.acts}）`);
  await page.close();
}

/* ══════════════ B. 三种打法 ══════════════ */
{
  console.log('\n=== B. 三种打法 ===');
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.addInitScript(blockDecide);
  await page.goto(LAB, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 15000 });
  // 状态序列由 read() 自己收集，不再另起轮询定时器

  // B1 正确
  await boot(page, { rndSeed: 5 });
  const b1 = await playProper(page);
  info(`B1 正确 → ${b1.res ? `${b1.res.score} / ${b1.res.detail.outcome} / 断${b1.res.detail.breaks} / 挂灯${b1.res.detail.lamp}` : '未结算'}`);
  note(b1.res && b1.res.detail.outcome === 'pass', `B1 挂灯 + 船在中流 + 掐窗下锚 + 报警加固 → 天亮前拆完（${b1.res ? b1.res.detail.outcome : '—'}）`);
  note(b1.res && b1.res.detail.unreturned === 0, `B1b 门板全还给乡亲了（未拆 ${b1.res ? b1.res.detail.unreturned : '—'} 段）`);
  const b1Alarms = alarmSeen;
  // ⚠️ 这条是拦"报警变成掷骰子"的（2026-09-16）：原来是 `rnd() < 0.42` 的随机报警，
  //    一次渡河只够掷 3 次骰 → "不加固"有六成概率照样过桥（失败线不可靠）。
  //    现在报警次数 = 晃段数（3 段中流板排）= 3。低于 3 就说明随机性又回来了。
  note(b1Alarms >= 3, `B1c 这一局真的报了 ${b1Alarms} 次警（3 段晃板排 = 3 次，不是撞运气）`);

  // B2 不加固
  await boot(page, { rndSeed: 5 });
  const b2 = await playProper(page, { reinforce: false, dismantle: false });
  info(`B2 不加固 → ${b2.res ? `${b2.res.score} / ${b2.res.detail.outcome} / 断${b2.res.detail.breaks}` : '未结算'}（报警 ${alarmSeen} 次）`);
  // 失败线必须**确定**：过窗不加固 → 断两次 → sunk。原因（报警 ≥2 次）与结果一起断言，
  // 免得"恰好只报了一次警 → 桥没断 → 跑到拆桥 → 未结算"这种状态被误读成玩法坏了。
  note(b2.res && b2.res.detail.outcome === 'sunk' && alarmSeen >= 2,
    `B2 让报警过期 = 断两次沉物资（${b2.res ? b2.res.detail.outcome : '未结算'}；本局报警 ${alarmSeen} 次）`);

  // B3 磨蹭（短夜表）
  await boot(page, { rndSeed: 5, nightSec: 20 });
  await sleep(21500);
  let b3 = await read(page);
  for (let i = 0; i < 60 && !b3.res; i += 1) { await sleep(100); b3 = await read(page); }
  info(`B3 磨蹭 → ${b3.res ? `${b3.res.score} / ${b3.res.detail.outcome}` : '未结算'}`);
  note(b3.res && b3.res.detail.outcome === 'exposed', 'B3 不搭不拆 = 拂晓暴露（第二条失败线）');

  note(b1.res && b2.res && b1.res.score - b2.res.score > 0.35,
    `B4 分数分叉：正确 ${b1.res ? b1.res.score : '—'} vs 沉物资 ${b2.res ? b2.res.score : '—'}`);
  await page.close();
}

/* ══════════════ C. 契约 ══════════════ */
{
  console.log('\n=== C. 契约 / 减动效真点击 / 0 次调用 ===');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.addInitScript(blockDecide);
  await page.goto(LAB, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 15000 });

  await boot(page, { rndSeed: 5 });
  const st0 = await read(page);
  note(st0.mini === 'pontoon-night', `C1 host[data-mini] = ${st0.mini}`);

  // 「部队上桥」的门槛（2026-09-16 新增动作）：桥没搭完 → 存在但不可点、也不挂 data-mini-action。
  // 这一条同时守住"搭满即自动渡河"不会偷偷回来：自动渡河的话，这个按钮永远用不上。
  const gate0 = await crossGate(page);
  note(gate0 && gate0.disabled === true && gate0.act === null,
    `C1b 桥没搭完时「部队上桥」不可点（disabled=${gate0 && gate0.disabled} · data-mini-action=${gate0 && gate0.act}）`);
  await clickAct(page, 'mode-plank');
  await clickSeg(page, 11);        // 用 11 段（C6 要用 0 段，别抢）
  await sleep(150);
  const gate1 = await crossGate(page);
  note(gate1 && gate1.disabled === true, 'C1c 搭了 1 段（还差 11 段）仍然不可点');

  // 减动效下真点击「下船」命中自己
  const loc = page.locator('#g-host [data-mini-action="mode-boat"]');
  const box = await loc.boundingBox();
  // ⚠️ page.evaluate 不能把 DOM 元素传回来（会被序列化成普通对象），在页内取完再返回字符串
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    const a = el && el.closest('[data-mini-action]');
    return a ? a.getAttribute('data-mini-action') : null;
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  note(hit === 'mode-boat', `C2 减动效下「下船」命中自己、没被背景层挡住（实得 ${hit}）`);

  // 挂灯 → 窗口变宽
  await clickAct(page, 'lamp');
  await sleep(120);
  const stL = await read(page);
  note(stL.miniLamp === '1', 'C3 点「挂马灯」真的挂上了（miniLamp=1）');

  // 窗口外下锚 → 变晃（决策有代价）
  await clickAct(page, 'mode-boat');
  await clickSeg(page, 5);
  const stA = await read(page);
  note(stA.miniState === 'anchor' && stA.miniAnchorSeg === '5', 'C4 下船后进入下锚状态（等稳流窗）');
  // 等到 flow 明确在窗口外再点
  for (let i = 0; i < 400; i += 1) {
    const st = await read(page);
    if (st.miniState !== 'anchor') break;
    const flow = Number(st.miniFlow);
    if (flow < 25 || flow > 75) { await clickAct(page, 'anchor'); break; }
    await sleep(25);
  }
  await sleep(200);
  const stW = await read(page);
  note(stW.miniSegs[5] === 'W' || stW.miniSegs[5] === 'S',
    `C5 窗口外下锚 → 船是晃的（第 6 段=${stW.miniSegs[5]}，晃就是有代价的决策）`);

  // 板排：浅滩 1 板
  const planksBefore = Number((await read(page)).miniPlanks);
  await clickAct(page, 'mode-plank');
  await clickSeg(page, 0);
  await sleep(150);
  const stP = await read(page);
  note(stP.miniSegs[0] === 'P' && Number(stP.miniPlanks) === planksBefore - 1,
    `C6 浅滩铺板排扣 1 板（${planksBefore} → ${stP.miniPlanks}）`);

  // 打完收结算（走一遍完整正确打法）
  // ⚠️ 必须**重开一局**：上面 C3~C6 已经占掉几段桥位（第 6 段下了船、第 1 段铺了板），
  //    接着跑会让 buildOrder 卡在"已建好的段点不动"，永远搭不满 → 白等到 deadline
  await boot(page, { rndSeed: 5 });
  const fin = await playProper(page);
  note(fin.res && fin.res.detail.outcome === 'pass', 'C7 减动效整局能打完');
  note(seenActs.has('cross'), 'C7b「部队上桥」真的变成过可点（桥搭满那一刻才挂上 data-mini-action）');
  note(fin.acts === 0, `C8 结算后 [data-mini-action] = ${fin.acts}（必须 0）`);
  note(['rig', 'anchor', 'cross', 'dismantle', 'done'].every((w) => seenStates.has(w)),
    `C9 状态序列齐全：${[...seenStates].join('/')}`);
  note(fin.hits === 0, `C10 整局 /api/decide = ${fin.hits} 次（必须 0）`);
  await ctx.close();
}

/* ══════════════ D. 像素 ══════════════ */
{
  console.log('\n=== D. 像素 ===');
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  await page.addInitScript(blockDecide);
  await page.goto(LAB, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 15000 });
  await boot(page, { rndSeed: 5 });
  await sleep(300);

  const box = async (fx, fy, w, hh) => page.evaluate(([fx2, fy2, w2, h2]) => {
    const c = document.querySelector('#g-host .smini11-cv');
    const g = c.getContext('2d');
    const dpr = c.width / 460;
    const x0 = Math.round(fx2 * 460 * dpr - (w2 * dpr) / 2);
    const y0 = Math.round(fy2 * 240 * dpr - (h2 * dpr) / 2);
    const d = g.getImageData(x0, y0, Math.max(2, Math.round(w2 * dpr)), Math.max(2, Math.round(h2 * dpr))).data;
    let L = 0; let C = 0; let WARM = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      L += (d[i] + d[i + 1] + d[i + 2]) / 3; C += d[i + 2] - d[i];
      if (d[i] - d[i + 2] > 25 && d[i] > 90) WARM += 1;
    }
    return { L: L / n, C: C / n, WARM: WARM / n };
  }, [fx, fy, w, hh]);

  const segX = (i) => (38 + i * ((460 - 76) / 12) + ((460 - 76) / 12) / 2) / 460;
  const river = await box(0.5, 0.85, 24, 20);
  const sky = await box(0.5, 0.2, 24, 20);
  info(`河 b−r=${river.C.toFixed(1)} · 天 b−r=${sky.C.toFixed(1)}`);
  note(river.C - sky.C > 15, `D1 河水偏青（b−r 差 ${(river.C - sky.C).toFixed(1)} > 15）`);

  // 建好的段（暖木色）vs 未建段（虚线）—— 同屏对照
  await clickAct(page, 'mode-plank');
  await clickSeg(page, 0);
  await clickSeg(page, 1);
  await sleep(250);
  const built = await box(segX(0), 106 / 240, 10, 8);
  const unbuilt = await box(segX(6), 106 / 240, 10, 8);
  info(`桥段暖色占比：已建 ${built.WARM.toFixed(3)} vs 未建 ${unbuilt.WARM.toFixed(3)}`);
  note(built.WARM > unbuilt.WARM + 0.1, `D2 建好的桥段是暖木色（${built.WARM.toFixed(2)} > ${unbuilt.WARM.toFixed(2)}）`);

  // 马灯：船头暖灯点（需要一条船）
  const beforeLamp = built.WARM;
  await clickAct(page, 'lamp');
  await clickAct(page, 'mode-boat');
  await clickSeg(page, 5);
  await sleep(200);
  for (let i = 0; i < 400; i += 1) {
    const st = await read(page);
    if (st.miniState !== 'anchor') break;
    const flow = Number(st.miniFlow);
    if (flow >= 32 && flow <= 68) { await clickAct(page, 'anchor'); break; }
    await sleep(25);
  }
  await sleep(250);
  const lampPx = await box(segX(5), 100 / 240, 12, 6);
  info(`第 6 段船头茶暖色占比 ${lampPx.WARM.toFixed(3)}`);
  note(lampPx.WARM > 0.02, `D3 挂马灯后船头出现暖灯点（暖色占比 ${lampPx.WARM.toFixed(3)} > 0.02）`);

  await page.screenshot({ path: path.join(OUT, '01-build.png') });
  await page.evaluate(() => { window.__gHost.remove(); });

  // 夜色随时间变暗（短夜表）
  await boot(page, { rndSeed: 5, nightSec: 8 });
  await sleep(200);
  const skyDusk = await box(0.5, 0.2, 24, 20);
  await sleep(4200);
  const skyDeep = await box(0.5, 0.2, 24, 20);
  info(`天色亮度：入夜 ${skyDusk.L.toFixed(1)} → 深夜 ${skyDeep.L.toFixed(1)}`);
  note(skyDusk.L - skyDeep.L > 25, `D4 夜色真的在变（L 降 ${(skyDusk.L - skyDeep.L).toFixed(1)}）`);
  await page.close();
}

/* ══════════════ 截图（真板壳全屏：走调试台自己的装载路径）══════════════ */
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  await page.addInitScript(blockDecide);
  await page.goto(LAB, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 15000 });
  await page.click('[data-mini-id="pontoon-night"]');
  await page.waitForFunction(() => {
    const h = document.querySelector('#mini-host');
    return h && h.dataset.mini === 'pontoon-night';
  }, null, { timeout: 10000 });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '00-board-shell.png') });
  await page.close();
}

const shots = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
console.log(`\n截图落盘：${shots.join(', ')}（${OUT}）`);
note(pageErrs.length === 0, `E 整轮 0 次未捕获的页面异常（实得 ${pageErrs.length} 条${pageErrs.length ? '：' + pageErrs[0] : ''}）`);
console.log(bad === 0 ? '\n【全绿】夜搭浮桥 专项验收通过' : `\n【有红】${bad} 项未通过`);
// ⚠️ 收尾顺序有坑（2026-09-16 最小复现）：`browser.close()` 之后**紧跟** `process.exit()`，
//    进程永远不会退出 —— 用例明明跑完了却卡到外层 timeout 才被杀，报 124，看着像"挂死"。
//    正确姿势：先把退出排到定时器上，再 close；关干净了立刻退，关不干净 4 秒后也退。
const finishExit = () => process.exit(bad ? 1 : 0);
setTimeout(finishExit, 4000);
browser.close().then(finishExit, finishExit);
