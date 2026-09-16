/**
 * 《飞夺泸定桥 · 攀链》v2 手感仿真 —— 用**真实现**跑几套打法，看常数值不值得。
 *
 * 为什么不写纯函数仿真：那样等于把 step() 抄一遍，抄错了还会得出"手感很好"。
 * 这里驱动的是浏览器里那份真代码（读 dataset 反馈 → 决定按住/铺板/掩护），
 * 所以它顺带还能抓到"实现与常量表对不上"这类问题。
 *
 * 八套打法（前两套是"两个极端"，必须都输；中间几套看代价排序）：
 *   S1 一路贴链   —— 省人但慢：应该**时限到、火封桥**
 *   S2 一路直冲   —— 够快但折人：应该**折满 22 人**
 *   S3 贴链+掩护   —— 掩护不换姿态，等于白打（掩护的价值全在"允许你直起身"）
 *   S4 直冲+掩护   —— 掩护全在开局用掉：**要死**，不然门板就不是硬需求了
 *   S5 编排（正解）—— 掩护抢时间、西段直起身、第 7 段起逐段铺板
 *   S6 只铺板不用掩护（西段贴链爬）
 *   S7 把板铺在西段（火力弱的半场）—— 应该被时间打死
 *   S8 掩护换姿态 —— 只在掩护窗口里直起身、且趁掩护铺板
 *
 * 用法：先起服务 node server/index.js，然后  node tests/manual/sim-luding.mjs   （约 9 分钟，后台跑）
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
//    进程不退出、也不打一行日志 —— 陡坡仿真就因此白等过 12 分钟。
setTimeout(() => { console.log('\n【看门狗】仿真超时，强制收尾'); process.exit(3); }, 900000);
process.on('unhandledRejection', (e) => { console.log('\n【未处理的拒绝】', e); process.exit(4); });
process.on('uncaughtException', (e) => { console.log('\n【未捕获异常】', e); process.exit(5); });

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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

/* ── 真实现驱动：整段策略跑在页面里（少一次往返就少一份时序抖动） ──
   ⚠️ 这里用 `el.click()` 是为了快，**代价是绕过命中测试**（元素被遮挡也点得着）。
   仿真只用来调手感，所以可以；验收脚本（qa-luding.mjs）必须走真 page.click。 */
const DRIVER = async ({ src, time }) => {
  const host = document.createElement('div');
  for (const id of ['mini-host', 'l-host']) document.getElementById(id)?.remove();
  host.id = 'l-host';
  (document.getElementById('board-body') || document.body).appendChild(host);
  window.__lHost = host;
  window.__lRes = null;
  window.__lErr = null;
  const mod = await import('/js/minigames-luding.js?v=' + Date.now());
  mod.runLudingChain(host, { stats: document.getElementById('board-stats'), ...(time ? { time } : {}) })
    .then((r) => { window.__lRes = r; });
  // 等玩法起来
  for (let i = 0; i < 100 && !host.dataset.miniState; i += 1) await new Promise((r) => setTimeout(r, 50));
  if (!host.dataset.miniState) throw new Error('玩法没起来（dataset.miniState 空）');

  const D = () => ({ ...host.dataset });
  const acts = () => Object.fromEntries([...host.querySelectorAll('[data-mini-action]')]
    .map((e) => [e.dataset.miniAction, e]));
  const N = (v) => (v === undefined || v === '' ? NaN : Number(v));
  const click = (a) => { const e = acts()[a]; if (e && !e.disabled) { e.click(); return true; } return false; };
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  const policy = (0, eval)(`(${src})`);
  let holding = false;
  const setHold = (v) => { if (v !== holding) { holding = v; key('Space', v); } };
  click('start');
  const t0 = performance.now();
  const marks = [];
  let lastSeg = -1;
  while (!window.__lRes && performance.now() - t0 < 240000) {
    const s = D();
    if (s.miniState === 'done') break;
    const seg = N(s.miniSeg);
    if (seg !== lastSeg) { lastSeg = seg; marks.push(`第${seg}段@${N(s.miniM).toFixed(0)}m/${((performance.now() - t0) / 1000).toFixed(0)}s`); }
    // ⚠️ 第二个参数直接给 `N`（取数函数），不是给个对象 —— 给对象的话策略里的 `N(...)` 会报
    //    "N is not a function"，而且只在用到 N 的那几套策略上炸，看着像"某几套打法有问题"。
    const cmd = policy(s, N) || {};
    if (cmd.cover) click('cover');
    if (cmd.lay) click('lay');
    if (cmd.cling !== undefined) setHold(cmd.cling);
    await new Promise((r) => setTimeout(r, 25));
  }
  setHold(false);
  for (let i = 0; i < 40 && !window.__lRes; i += 1) await new Promise((r) => setTimeout(r, 50));
  const s = D();
  return {
    marks, res: window.__lRes, state: s.miniState,
    dead: N(s.miniDead), m: N(s.miniM), planks: N(s.miniPlanks), covers: N(s.miniCovers),
    planked: s.miniPlanked || '',
  };
};

const POLICIES = [
  ['S1 一路贴链', '() => ({ cling: true })'],
  ['S2 一路直冲', '() => ({ cling: false })'],
  ['S3 贴链+掩护立用', '(s,N) => ({ cling: true, cover: N(s.miniCovers) > 0 && N(s.miniCover) <= 0 })'],  ['S4 直冲+掩护立用', '(s,N) => ({ cling: false, cover: N(s.miniCovers) > 0 && N(s.miniCover) <= 0 })'],
  ['S5 编排（正解）', `(s,N) => {
    const m = N(s.miniM), seg = N(s.miniSeg), planks = N(s.miniPlanks);
    const covers = N(s.miniCovers), cover = N(s.miniCover), lay = N(s.miniLay);
    const done = (s.miniPlanked || '').split(',').filter(Boolean).map(Number);
    if (m < 51) return { cling: false, cover: covers > 0 && cover <= 0 };
    if (lay > 0) return { cling: false };
    if (planks > 0 && !done.includes(seg)) return { cling: false, lay: true };
    return { cling: false };
  }`],
  ['S6 只铺板不用掩护', `(s,N) => {
    const m = N(s.miniM), seg = N(s.miniSeg), planks = N(s.miniPlanks), lay = N(s.miniLay);
    const done = (s.miniPlanked || '').split(',').filter(Boolean).map(Number);
    if (m < 51) return { cling: true };
    if (lay > 0) return { cling: false };
    if (planks > 0 && !done.includes(seg)) return { cling: false, lay: true };
    return { cling: false };
  }`],
  ['S7 板铺在西段', `(s,N) => {
    const m = N(s.miniM), seg = N(s.miniSeg), planks = N(s.miniPlanks), lay = N(s.miniLay);
    const done = (s.miniPlanked || '').split(',').filter(Boolean).map(Number);
    if (lay > 0) return { cling: false };
    if (m < 25.5 && planks > 0 && !done.includes(seg)) return { cling: false, lay: true };
    return { cling: true };
  }`],
  ['S8 掩护换姿态', `(s,N) => {
    // 只在掩护窗口里直起身冲，其余时间贴住 —— "把掩护当运动员用"
    const seg = N(s.miniSeg), planks = N(s.miniPlanks), lay = N(s.miniLay);
    const covers = N(s.miniCovers), cover = N(s.miniCover);
    const done = (s.miniPlanked || '').split(',').filter(Boolean).map(Number);
    const cmd = { cling: cover <= 0 };
    if (covers > 0 && cover <= 0) cmd.cover = true;
    if (lay <= 0 && planks > 0 && !done.includes(seg) && cover > 0) cmd.lay = true;  // 掩护里铺板最省人
    return cmd;
  }`],
];

const out = [];
for (const [name, src] of POLICIES) {
  console.log(`\n▶ ${name}`);
  try {
    const r = await page.evaluate(DRIVER, { src });
    const res = r.res;
    const line = res
      ? `${res.detail.outcome} · 折 ${res.detail.dead}/${22} 人 · 到 ${res.detail.meters}m · 用时 ${res.detail.usedSec}s · 板剩 ${res.detail.planksLeft} 掩护剩 ${res.detail.coversLeft} · 分 ${res.score}`
      : `未结算（state=${r.state} 折 ${r.dead} 到 ${r.m}m）`;
    console.log(`    → ${line}`);
    console.log(`    ${res ? res.summary : ''}`);
    console.log(`    进度点：${r.marks.join(' | ')}`);
    out.push({ name, outcome: res?.detail.outcome || 'none', dead: res?.detail.dead, m: res?.detail.meters, sec: res?.detail.usedSec, score: res?.score });
  } catch (e) {
    console.log(`    ✗ 抛错：${String(e.message).split('\n')[0]}`);
    pageErrs.slice(0, 5).forEach((x) => console.log(`        ${x}`));
    out.push({ name, outcome: 'ERR', err: String(e.message).split('\n')[0] });
  }
}

console.log('\n══════ 小结 ══════');
for (const o of out) {
  console.log(`${o.name.padEnd(20)} → ${String(o.outcome).padEnd(8)} 折 ${o.dead ?? '—'}/22  到 ${o.m ?? '—'}m  用时 ${o.sec ?? '—'}s  分 ${o.score ?? '—'}`);
}
console.log('\n两个极端必须都输：S1 要 fire（时限）、S2 要 wiped（折满）；');
console.log('S5 编排必须是 crossed 且分最高；S7（板铺西段）要被时间打死。');
console.log(`页面异常 ${pageErrs.length} 条`);
pageErrs.slice(0, 6).forEach((x) => console.log(`  ${x}`));

// ⚠️ 本机 `browser.close()` 会挂住 —— 而且不是"慢"，是**连 setTimeout 硬退都不发火**：
//    实测脚本已经打完所有输出，进程仍能挂 40 分钟不走（`sim && qa && shot` 这种串联会被整条卡死）。
//    所以别走 close()：直接掐掉 chrome 子进程再 process.exit —— 两步都是同步的，不会挂。
try { browser.process()?.kill('SIGKILL'); } catch { /* 已经没了就算了 */ }
process.exit(0);
