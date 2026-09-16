/**
 * 《陡坡 · 拽住他》手感仿真 —— 用**真实现**跑几套打法，看常数值不值得。
 *
 * 为什么不写纯函数仿真：那样等于把 step() 抄一遍，抄错了还会得出"手感很好"。
 * 这里驱动的是浏览器里那份真代码（读 dataset 反馈 → 决定按不按空格），
 * 所以它顺带还能抓到"实现与常量表对不上"这类问题。
 *
 * 五套打法：
 *   S1 发呆       —— 站在 decide 屏上不动，看他自己几秒进雪槽（失败钟）
 *   S2 稳住（布绳）—— 解绑腿 → 对准 → 松紧交替，看能不能过、用时多久
 *   S3 贪拉       —— 抓住后一直按住不放，看是不是必然脱手
 *   S4 徒手       —— 立刻扑上去，看"够得近"到底够不够
 *   S5 挪脚不松手 —— 拉着的时候直接换孔，看上限掉下来会不会脱手
 *
 * 用法：先起服务，然后  node tests/manual/sim-grab.mjs     （约 2 分钟，后台跑）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const LAB = 'http://localhost:3001/dev/minigame-lab.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ⚠️ 看门狗：中途若抛错，Chromium 子进程会把 Node 的事件循环一直吊着，
//    进程不退出、也不打一行日志 —— 上一版就因此白等了 12 分钟。
setTimeout(() => { console.log('\n【看门狗】仿真超时，强制收尾'); process.exit(3); }, 300000);
// 抛错时 Chromium 会把事件循环吊住 → 进程既不退出也不报错。宁可在这里硬退，把错误打出来。
process.on('unhandledRejection', (e) => { console.log('\n【未处理的拒绝】', e); process.exit(4); });
process.on('uncaughtException', (e) => { console.log('\n【未捕获异常】', e); process.exit(5); });
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
/** 页面里的未捕获异常必须打出来：rAF 回调抛一次就不再排队，玩法会静默冻在起点，
 *  dataset 上什么都看不出来，只有一个 waitForFunction 超时 —— 看不出病因。 */
const pageErrs = [];
page.on('pageerror', (e) => pageErrs.push(String(e.message).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') pageErrs.push('console: ' + m.text()); });
await page.addInitScript(() => {
  const o = window.fetch.bind(window);
  window.fetch = (u, i) => (String(u).includes('/api/decide')
    ? Promise.resolve(new Response('{"ok":false,"source":"BLOCKED"}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : o(u, i));
});
await page.goto(LAB, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 20000 });

/** 取画作坐标锚点（从模块里读，别在这儿抄一份） */
const GEO = await page.evaluate(async () => {
  const m = await import('/js/minigames-grab.js?v=' + Date.now());
  return { CROP: m.CROP, YOU: m.YOU_HAND, CLASP: m.CLASP, U: m.U, slipMax: m.SLIP_MAX };
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
  try {
    await page.waitForFunction(() => window.__gHost?.dataset.miniState, null, { timeout: 10000 });
  } catch (e) {
    console.log(`    ✗ 玩法没起来。页面异常 ${pageErrs.length} 条：`);
    pageErrs.slice(0, 6).forEach((x) => console.log(`        ${x}`));
    throw e;
  }
}

const st = () => page.evaluate(() => {
  const h = window.__gHost;
  const o = { ...h.dataset, res: window.__gRes };
  o.acts = [...h.querySelectorAll('[data-mini-action]')].map((e) => e.dataset.miniAction);
  return o;
});
const N = (v) => (v === undefined || v === '' ? NaN : Number(v));
async function clickAct(a) {
  const el = await page.$(`#g-host [data-mini-action="${a}"]`);
  if (!el) return false;
  const [box, wrap] = [await el.boundingBox(), await el.evaluate((e) => e.disabled)];
  if (wrap) return false;
  await el.click({ timeout: 3000 }).catch(() => {});
  return true;
}
/** 画作坐标 → 页面坐标 */
async function toPage(vx, vy) {
  return page.evaluate(([x, y, C]) => {
    const r = document.querySelector('#g-host svg').getBoundingClientRect();
    return { x: r.x + ((x - C.x) / C.w) * r.width, y: r.y + ((y - C.y) / C.h) * r.height };
  }, [vx, vy, GEO.CROP]);
}

/** 把准星压到他手上再甩（反复朝当前手位追，模拟"人跟着瞄"） */
async function aimAndThrow() {
  for (let i = 0; i < 22; i += 1) {
    const s = await st();
    if (s.res || s.miniState !== 'aim') return { ok: false, why: `state=${s.miniState}` };
    const [hx, hy] = (s.miniHand || '').split(',').map(Number);
    if (!hx) return { ok: false, why: 'no miniHand' };
    const p = await toPage(hx, hy);
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await sleep(55);
    const s2 = await st();
    const [ax, ay] = (s2.miniAim || '0,0').split(',').map(Number);
    if (Math.hypot(ax - hx, ay - hy) <= N(s2.miniCatchR) * 0.65) {
      await clickAct('throw');
      await sleep(180);
      return { ok: true };
    }
  }
  return { ok: false, why: '准星没追上' };
}

const log = (t) => console.log(`    · ${t}`);

/* ── S1 发呆 ── */
async function S1() {
  console.log('\nS1 发呆（decide 屏不动）');
  await boot(11);
  const t0 = Date.now(); let s = await st();
  const m0 = N(s.miniMeters); const r0 = N(s.miniRopeLen);
  log(`开局：他离你 ${m0.toFixed(1)} 米（绳长 ${r0.toFixed(0)} px）· 够得着=${r0 <= N(s.miniReach)}`);
  for (let i = 0; i < 60; i += 1) { await sleep(400); s = await st(); if (s.res) break; }
  const secs = (Date.now() - t0) / 1000;
  console.log(`    → ${s.res ? s.res.detail.outcome : '未结束'} · ${secs.toFixed(1)}s · ${s.res ? s.res.summary : ''}`);
  return { secs, outcome: s.res?.detail.outcome };
}

/* ── S2/S3：布绳路线。greedy=true 表示"一直按住不松" ── */
async function ropeRun(seed, greedy) {
  await boot(seed);
  await clickAct('leg');
  await sleep(1600);
  const s = await st();
  log(`解绑腿后他离你 ${N(s.miniMeters).toFixed(1)} 米（还要 ≤ 布绳 reach ${s.miniReach} px 才够得着）`);
  const a = await aimAndThrow();
  log(`抓取：${a.ok ? '抓住了' : '没抓住（' + a.why + '）'}`);
  await sleep(200);
  let s2 = await st();
  if (s2.miniState !== 'hold') { console.log(`    → ${s2.res ? s2.res.detail.outcome : s2.miniState}`); return { outcome: s2.res?.detail.outcome }; }
  const t0 = Date.now(); let down = false;
  const hold = async (v) => { if (v !== down) { down = v; await page.keyboard[v ? 'down' : 'up']('Space').catch(() => {}); } };
  let peak = 0; let broke = 0;
  for (let i = 0; i < 700; i += 1) {
    s2 = await st();
    if (s2.res || s2.miniState !== 'hold') break;
    const t = N(s2.miniTension); const c = N(s2.miniCap);
    peak = Math.max(peak, t / c);
    if (greedy) await hold(true);
    else if (t > c * 0.70) await hold(false);
    else if (t < c * 0.26) await hold(true);
    if (s2.miniGrabs !== undefined && N(s2.miniGrabs) < 2 && broke === 0) broke = 1;
    await sleep(55);
  }
  await hold(false);
  for (let i = 0; i < 30 && !(await st()).res; i += 1) await sleep(150);
  const fin = await st();
  const secs = (Date.now() - t0) / 1000;
  console.log(`    → ${fin.res ? fin.res.detail.outcome : fin.miniState} · 拉锯 ${secs.toFixed(1)}s · 张力峰值 ${(peak * 100).toFixed(0)}% of cap · ${fin.res ? fin.res.summary : ''}`);
  return { secs, outcome: fin.res?.detail.outcome, peak };
}

/* ── S4 徒手 ── */
async function S4() {
  console.log('\nS4 徒手（立刻扑上去）');
  await boot(7);
  await clickAct('bare');
  await sleep(120);
  const s = await st();
  const r = N(s.miniRopeLen); const reach = N(s.miniReach);
  log(`出手瞬间：他离你 ${N(s.miniMeters).toFixed(1)} 米（绳长 ${r.toFixed(0)} px vs 徒手 reach ${reach} px）→ ${r <= reach ? '够得着' : '够不着'}`);
  const a = await aimAndThrow();
  log(`抓取：${a.ok ? '抓住了' : '没抓住（' + a.why + '）'}`);
  await sleep(200);
  const s2 = await st();
  if (s2.miniState !== 'hold') { console.log(`    → ${s2.res ? s2.res.detail.outcome + '：' + s2.res.summary : s2.miniState}`); return { outcome: s2.res?.detail.outcome }; }
  const cap = N(s2.miniCap);
  log(`抓住时张力 ${N(s2.miniTension).toFixed(0)}，徒手+${s2.miniFoot === '1' ? '中孔' : '孔'} 上限只有 ${cap.toFixed(0)} —— 余量 ${((1 - N(s2.miniTension) / cap) * 100).toFixed(0)}%`);
  let down = false; const hold = async (v) => { if (v !== down) { down = v; await page.keyboard[v ? 'down' : 'up']('Space').catch(() => {}); } };
  for (let i = 0; i < 700; i += 1) {
    const x = await st();
    if (x.res || x.miniState !== 'hold') break;
    const t = N(x.miniTension); const c = N(x.miniCap);
    if (t > c * 0.62) await hold(false); else if (t < c * 0.24) await hold(true);
    await sleep(55);
  }
  await hold(false);
  for (let i = 0; i < 30 && !(await st()).res; i += 1) await sleep(150);
  const fin = await st();
  console.log(`    → ${fin.res ? fin.res.detail.outcome : fin.miniState} · ${fin.res ? fin.res.summary : ''}`);
  return { outcome: fin.res?.detail.outcome };
}

/* ── S5 挪脚不松手 ── */
async function S5() {
  console.log('\nS5 拉着的时候换孔（不松手）');
  await boot(5);
  await clickAct('leg');
  await sleep(1600);
  await aimAndThrow();
  await sleep(150);
  let s = await st();
  if (s.miniState !== 'hold') { console.log(`    → ${s.miniState}，跳过`); return {}; }
  const cap0 = N(s.miniCap);
  await page.keyboard.down('Space').catch(() => {});
  for (let i = 0; i < 60; i += 1) { s = await st(); if (N(s.miniTension) > N(s.miniCap) * 0.80 || s.res) break; await sleep(60); }
  const before = N(s.miniTension);
  const okClick = await clickAct('foot0');
  await sleep(90);
  const mid = await st();
  log(`换孔前张力 ${before.toFixed(0)}/${cap0.toFixed(0)}；点「下孔」=${okClick} → 挪脚中上限跌到 ${mid.miniMove > 0 ? N(mid.miniCap).toFixed(0) : '（没采到挪脚帧 · cap ' + N(mid.miniCap).toFixed(0) + '）'}`);
  await page.keyboard.up('Space').catch(() => {});
  for (let i = 0; i < 30; i += 1) { const x = await st(); if (x.miniState !== 'hold' || x.res) break; await sleep(100); }
  const fin = await st();
  console.log(`    → 换孔后 state=${fin.miniState} · 机会=${fin.miniGrabs} · ${fin.res ? fin.res.detail.outcome + '：' + fin.res.summary : ''}`);
  return { outcome: fin.res?.detail.outcome, broke: fin.miniState === 'aim' };
}

const r1 = await S1();
const r2 = await ropeRun(5, false);
const r3 = await ropeRun(5, true);
const r4 = await S4();
const r5 = await S5();

console.log('\n══════ 小结 ══════');
console.log(`S1 发呆        → ${r1.outcome} @ ${r1.secs.toFixed(1)}s   （要 6~10s：短了像秒杀，长了像罚站）`);
console.log(`S2 稳住·布绳    → ${r2.outcome}${r2.secs ? ` @ ${r2.secs.toFixed(1)}s` : ''}   （要 saved，10~25s）`);
console.log(`S3 贪拉        → ${r3.outcome}${r3.peak ? ` · 峰值 ${(r3.peak * 100).toFixed(0)}%` : ''}   （要 lost/脱手：按住不放必须出事）`);
console.log(`S4 徒手        → ${r4.outcome}   （够得近但余量小：允许过，但比布绳险）`);
console.log(`S5 挪脚不松手   → ${r5.outcome}${r5.broke ? '（脱手了）' : ''}   （要脱手：换孔前必须先卸张力）`);

browser.close().catch(() => {});
setTimeout(() => process.exit(0), 500);
