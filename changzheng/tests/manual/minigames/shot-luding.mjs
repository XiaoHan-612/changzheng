/**
 * 《飞夺泸定桥 · 攀链》v2 出图 —— 按阶段各截一张，供人眼验收画面。
 *
 * 坐标全是**画作像素**（viewBox = CROP）。出图脚本只按 dataset 推进，不自己算几何，
 * 免得像陡坡 v2 那次一样"用错了尺子"、拍出来的图看着像玩法坏了。
 *
 * 用法：先起服务（node server/index.js），然后
 *   node tests/manual/shot-luding.mjs      # ~2 分钟
 * 产物：tests/e2e/artifacts/luding-chain/*.png
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const LAB = 'http://localhost:3001/dev/minigame-lab.html';
const OUT = path.join('tests', 'e2e', 'artifacts', 'luding-chain');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

setTimeout(() => { console.log('\n【看门狗】出图超时'); process.exit(3); }, 600000);
process.on('unhandledRejection', (e) => { console.log('\n【未处理的拒绝】', e); process.exit(4); });

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
// ⚠️ 视口必须够宽：板身宽度是 `min(--panel-w, 92vw)`（620），而调试台三栏会把中栏压窄；
//    中栏窄过 620 时纸面会溢出板壳、被裁掉两头。真实游戏板屏是整屏，不存在这个问题 ——
//    所以这是**出图环境**的事，不是玩法的事。
const page = await browser.newPage({ viewport: { width: 1600, height: 1060 }, deviceScaleFactor: 2 });
await page.addInitScript(() => {
  const o = window.fetch.bind(window);
  window.fetch = (u, i) => (String(u).includes('/api/decide')
    ? Promise.resolve(new Response('{"ok":false,"source":"BLOCKED"}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : o(u, i));
});
await page.goto(LAB, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!document.querySelector('#mini-host'), null, { timeout: 20000 });

async function boot(opts = {}) {
  await page.evaluate(async (o) => {
    for (const id of ['mini-host', 'l-host']) document.getElementById(id)?.remove();
    const host = document.createElement('div');
    host.id = 'l-host';
    (document.getElementById('board-body') || document.body).appendChild(host);
    window.__lHost = host;
    window.__lRes = null;
    // 板屏本身也是这张油画当底（主线 doLuding 就是这么设的）——出图时手动补上，整屏才像真游戏
    const bg = document.getElementById('board-bg');
    if (bg) bg.style.backgroundImage = "url('/assets/scenes/luding_bridge.jpg')";
    const t = document.getElementById('board-title');
    if (t) t.textContent = '飞夺泸定桥 · 攀链';
    const k = document.getElementById('board-kicker');
    if (k) k.textContent = '玩法';
    const m = await import('/js/minigames-luding.js?v=' + Date.now());
    m.runLudingChain(host, { stats: document.getElementById('board-stats'), ...o })
      .then((r) => { window.__lRes = r; });
  }, opts);
  await page.waitForFunction(() => window.__lHost?.dataset.miniState, null, { timeout: 10000 });
  await sleep(700);
}

const st = () => page.evaluate(() => ({ ...window.__lHost.dataset, res: window.__lRes }));
const N = (v) => (v === undefined || v === '' ? NaN : Number(v));
async function shoot(name) {
  // ⚠️ 别用 `#l-host` 的 `el.screenshot()`：板屏那幅油画是 `openBoard({bg})` 设在 `#board-bg` 上的，
  //    而 `#board-bg` 是 `#board-body` 的**兄弟层**、不落在 host 的框里 —— 元素截图会**把整幅画漏掉**，
  //    拍出来是一片浅色 UI，看着像"根本没铺画作"（实测：元素截图 L均 153，板屏矩形 L均 ~57）。
  //    改成按**板屏矩形**（bg ∪ host）截整片，画作与覆盖层才都在画面里。
  const box = await page.evaluate(() => {
    const rect = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const a = rect(document.getElementById('board-bg'));
    const b = rect(document.getElementById('l-host'));
    if (!a) return b; if (!b) return a;
    const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  });
  await page.screenshot({
    path: path.join(OUT, name),
    clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) },
  });
  console.log(`  · ${name}`);
}
const clickAct = (a) => page.click(`#l-host [data-mini-action="${a}"]`, { timeout: 3000 }).catch(() => false);
const waitRes = async (n = 60) => { for (let i = 0; i < n; i += 1) { const s = await st(); if (s.res) return s; await sleep(250); } return st(); };

/* ── 1. brief：说明屏（画作全貌 + 三笔账） ── */
await boot({});
await shoot('1-brief.png');
const b0 = await st();
console.log(`✓ 1-brief   开局说明（门板 ${b0.miniPlanks} · 掩护 ${b0.miniCovers} · 折损 ${b0.miniDead}）`);

/* ── 2. 西段贴链：火力弱、队列整齐 ── */
await clickAct('start');
await sleep(300);
await page.keyboard.down('Space');
for (let i = 0; i < 120; i += 1) { const s = await st(); if (N(s.miniM) > 22) break; await sleep(100); }
await shoot('2-west-cling.png');
const s2 = await st();
console.log(`✓ 2-west-cling  西段贴链（到 ${s2.miniM} 米 · 第 ${s2.miniSeg} 段 · 火力 ${s2.miniFire} · 折损 ${s2.miniDead}）`);

/* ── 3. 掩护：机枪口熄火 + 金色辉光 ── */
await clickAct('cover');
await sleep(400);
await shoot('3-cover.png');
const s3 = await st();
console.log(`✓ 3-cover     掩护（停火 ${s3.miniCover}s · 折人率 ${s3.miniHurt} · 掩护剩 ${s3.miniCovers}）`);

/* ── 4. 铺板：三连扛板 + 板从无到有 ── */
await page.keyboard.up('Space').catch(() => {});
await sleep(900);
await clickAct('lay');
await sleep(1100);
await shoot('4-lay.png');
const s4 = await st();
console.log(`✓ 4-lay       铺板中（第 ${s4.miniSeg} 段 · 还剩 ${s4.miniLay}s · 门板剩 ${s4.miniPlanks}）`);
await waitRes(20);

/* ── 5. 东段火网：火力最猛 + 已铺的板 + 队列短了 ── */
await page.keyboard.up('Space').catch(() => {});
for (let i = 0; i < 400; i += 1) {
  const s = await st();
  if (s.res || N(s.miniM) > 78) break;
  // 掩护能打就打，别死在半路（要拍到"还有人在桥上"）
  if (N(s.miniCovers) > 0 && N(s.miniCover) <= 0 && N(s.miniFire) > 0.5) await clickAct('cover');
  await sleep(120);
}
await shoot('5-east-firenet.png');
const s5 = await st();
console.log(`✓ 5-east-firenet 东段火网（到 ${s5.miniM} 米 · 第 ${s5.miniSeg} 段 · 火力 ${s5.miniFire} · 折损 ${s5.miniDead} · 已铺板 [${s5.miniPlanked}]）`);
await waitRes(120);

/* ── 6. 过桥结算：让编排跑完（掩护抢时间 + 逐段铺板） ── */
await boot({});
await clickAct('start');
let hold = false;
const setHold = async (v) => { if (v !== hold) { hold = v; await (v ? page.keyboard.down('Space') : page.keyboard.up('Space')).catch(() => {}); } };
for (let i = 0; i < 1200; i += 1) {
  const s = await st();
  if (s.res) break;
  const m = N(s.miniM); const seg = N(s.miniSeg); const planks = N(s.miniPlanks);
  const covers = N(s.miniCovers); const cover = N(s.miniCover); const lay = N(s.miniLay);
  const done = (s.miniPlanked || '').split(',').filter(Boolean).map(Number);
  if (m < 51) {
    await setHold(false);
    if (covers > 0 && cover <= 0) await clickAct('cover');
  } else if (lay > 0) await setHold(false);
  else if (planks > 0 && !done.includes(seg)) { await setHold(false); await clickAct('lay'); }
  else await setHold(false);
  await sleep(90);
}
await setHold(false);
const s6 = await waitRes(60);
await sleep(500);
await shoot('6-crossed.png');
console.log(`✓ 6-crossed   ${s6.res ? s6.res.detail.outcome : '未结算'}：${s6.res ? s6.res.summary : ''}`);

/* ── 7. 火封桥（短表 14 秒，直接贴到时限） ── */
await boot({ time: 14 });
await clickAct('start');
await page.keyboard.down('Space');
const s7 = await waitRes(120);
await page.keyboard.up('Space').catch(() => {});
await sleep(400);
await shoot('7-firedone.png');
console.log(`✓ 7-firedone  火封桥：${s7.res ? s7.res.summary : '未结算'}`);

/* ── 补一张整屏：空白纸框、重复行、被挤出的版面这类问题只有整屏才看得见 ── */
await page.screenshot({ path: path.join(OUT, '0-board.png') });
console.log('  · 0-board.png（整屏）');

console.log(`\n出图目录：${OUT}`);
// ⚠️ 本机 `browser.close()` 会挂住，且连 setTimeout 硬退都不发火 → 掐掉 chrome 再同步硬退。
try { browser.process()?.kill('SIGKILL'); } catch { /* 已经没了就算了 */ }
process.exit(0);
