/**
 * E2E 全流程：五幕真调通关（需要 GLM_API_KEY）
 * 运行：npm run test:e2e
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = path.join(ROOT, 'tests/e2e/artifacts');
fs.mkdirSync(ART, { recursive: true });

// 用例会写 runtime-config.json；跑完原样还原，别动用户本机设置
const RUNTIME = path.join(ROOT, 'runtime-config.json');
function snapshotRuntime() {
  try { return fs.readFileSync(RUNTIME, 'utf8'); } catch { return null; }
}
function restoreRuntime(snap) {
  try {
    if (snap === null) fs.rmSync(RUNTIME, { force: true });
    else fs.writeFileSync(RUNTIME, snap, 'utf8');
  } catch { /* ignore */ }
}

async function ensureServer() {
  try {
    const r = await fetch(`${BASE}/api/config`);
    if (r.ok) return;
  } catch { /* start */ }
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try {
      const r = await fetch(`${BASE}/api/config`);
      if (r.ok) return;
    } catch { /* retry */ }
  }
  throw new Error('无法启动服务');
}

async function tryClick(page, sel) {
  try {
    const loc = page.locator(sel).first();
    if (!(await loc.count())) return false;
    if (!(await loc.isVisible().catch(() => false))) return false;
    await loc.click({ force: true, timeout: 600 });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const runtimeSnap = snapshotRuntime();
  try {
    await run();
  } finally {
    restoreRuntime(runtimeSnap);
  }
}

/** 只走真调：没有 Key 直接失败（本项目已移除 MOCK）。每次 1.5–8s，所以等待全部是轮询。*/
async function setupMode() {
  const before = await (await fetch(`${BASE}/api/config`)).json();
  if (!before.hasKey) throw new Error('本用例只走真调：请在 changzheng/.env 或「设置」里配置 GLM_API_KEY');
  console.log(`真调：${before.model}（reasoning_effort=${before.reasoningEffort || '默认'}）`);
}

async function run() {
  await ensureServer();
  await setupMode();
  await fetch(`${BASE}/api/logs/clear`, { method: 'POST' });

  const browser = await chromium.launch({
    headless: !process.argv.includes('--headed'),
    channel: 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));

  await page.goto(`${BASE}/?e2e=${Date.now()}`, { waitUntil: 'networkidle' });
  const titleModel = await page.locator('#title-model').innerText();
  if (!titleModel) throw new Error('title model missing');

  const QUICK = process.argv.includes('--quick');
  await page.click(QUICK ? '#btn-mode-quick' : '#btn-mode-study');
  await page.waitForTimeout(120);
  try { await page.click('#btn-cut-skip'); } catch { /* ok */ }

  const seenActs = [];
  let last = '';
  let didGomoku = false;
  let talkAsked = false;
  const MAX_ITER = 4000; // 真调每次要等 1.5–8s，循环上限要放宽
  for (let i = 0; i < MAX_ITER; i++) {
    const act = await page.locator('#act-title').innerText().catch(() => '');
    if (act && act !== last) {
      seenActs.push(act);
      last = act;
      console.log('act', act);
    }
    if (await page.locator('#screen-end').isVisible().catch(() => false)) break;

    if (process.argv.includes('--debug') && i % 25 === 0) {
      const vis = await page.evaluate(() => [...document.querySelectorAll('.screen')]
        .filter((s) => !s.classList.contains('hidden')).map((s) => s.id).join(','));
      const btn = await page.evaluate(() => [...document.querySelectorAll('#stage-panel button, #sheet-actions button, #night-body button')]
        .filter((b) => b.offsetParent !== null).map((b) => b.id || b.className).slice(0, 4).join(' | '));
      console.log(`  [debug ${i}] screens=${vis} buttons=${btn}`);
    }

    if (await tryClick(page, '#btn-echo-ok')) { await page.waitForTimeout(40); continue; }
    if (await tryClick(page, '#btn-continue')) { await page.waitForTimeout(40); continue; }
    if (await tryClick(page, '#btn-cut-next')) { await page.waitForTimeout(30); continue; }

    // ── 新玩法：分糖 / 夜岗 / 五子棋 / 夜间抉择 ──
    if (await page.locator('#candy-host').isVisible().catch(() => false)) {
      for (let k = 0; k < 6; k++) {
        const candy = page.locator('#candy-host .candy:not(.used)').first();
        if (!(await candy.count().catch(() => 0))) break;
        await candy.click({ force: true }).catch(() => {});
        await page.waitForTimeout(30);
        await page.locator('#candy-host .target-card').first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(30);
      }
      if (await tryClick(page, '#candy-host .mg-row .btn.primary')) { await page.waitForTimeout(150); continue; }
    }
    if (await tryClick(page, '#sentry-host .choice-btn')) { await page.waitForTimeout(150); continue; }
    if (await tryClick(page, '#gomoku-host .wzq-cell:not([disabled])')) { await page.waitForTimeout(120); continue; }
    if (await tryClick(page, '#needle-host .btn.primary')) { await page.waitForTimeout(220); continue; }
    if (await page.locator('#luding-host').isVisible().catch(() => false)) {
      await page.keyboard.down('d');
      for (let k = 0; k < 14; k++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(380);
        if (!(await page.locator('#luding-host').isVisible().catch(() => false))) break;
      }
      await page.keyboard.up('d');
      await page.waitForTimeout(200);
      continue;
    }
    if (await tryClick(page, '#night-body .btn.choice:not([disabled])')) { await page.waitForTimeout(150); continue; }

    // --aivia：走 ai_vs_ai 分支（两个 AI 对答），覆盖双 AI 判分
    if (process.argv.includes('--aivia') && await tryClick(page, '#quiz-auto:not([disabled])')) {
      await page.waitForTimeout(400);
      continue;
    }

    if (await page.locator('#screen-camp').isVisible().catch(() => false)) {
      // 第四幕先把可选的「两个小鬼」点掉，保证五子棋也被覆盖
      if (act.includes('雪山') && !didGomoku) {
        const g = page.locator('.hotspot', { hasText: '两个小鬼' }).first();
        if ((await g.count().catch(() => 0)) && (await g.isVisible().catch(() => false))) {
          await g.click({ force: true }).catch(() => {});
          didGomoku = true;
          await page.waitForTimeout(150);
          continue;
        }
      }
      if (await tryClick(page, '#btn-march-fixed')) { await page.waitForTimeout(180); continue; }
    }
    if (await tryClick(page, '.quiz-opt:not([disabled])')) { await page.waitForTimeout(300); continue; }
    if (await tryClick(page, '#quiz-next')) { await page.waitForTimeout(40); continue; }
    if (await tryClick(page, '#ch-opts .btn.choice:not([disabled])')) { await page.waitForTimeout(120); continue; }
    if (await tryClick(page, '#pre-opts .btn.choice:not([disabled])')) { await page.waitForTimeout(120); continue; }
    if (await tryClick(page, '#soup-opts .btn.choice:not([disabled])')) { await page.waitForTimeout(120); continue; }
    if (await tryClick(page, '#school-opts .btn.choice:not([disabled])')) { await page.waitForTimeout(40); continue; }
    // 交谈：问一次就够了，然后结束（否则会一直重复提问）
    if (await page.locator('#talk-quick').isVisible().catch(() => false)) {
      if (!talkAsked) {
        if (await tryClick(page, '#talk-who .btn.choice')) { await page.waitForTimeout(60); continue; }
        if (await tryClick(page, '#talk-quick .btn.choice')) {
          talkAsked = true;
          await page.waitForTimeout(220);
          continue;
        }
      }
      if (await tryClick(page, '#talk-end')) {
        talkAsked = false;
        await page.waitForTimeout(60);
        continue;
      }
      await page.waitForTimeout(80);
      continue;
    }
    if (await tryClick(page, '#stage-panel .btn.choice:not([disabled])')) { await page.waitForTimeout(120); continue; }
    if (await page.locator('#screen-path').isVisible().catch(() => false)) {
      if (await tryClick(page, '.path-zone')) { await page.waitForTimeout(120); continue; }
    }
    if (await tryClick(page, '#fish-cast')) {
      // 漂相三档：等到「真口/黑漂」再起竿，最多等 3.5s
      const status = page.locator('#fish-status');
      for (let k = 0; k < 14; k++) {
        const t = await status.innerText().catch(() => '');
        if (/真口|黑漂/.test(t)) break;
        await page.waitForTimeout(250);
      }
      await tryClick(page, '#fish-hook');
      continue;
    }
    if (await tryClick(page, '#fire-opts .btn.choice:not([disabled])')) { await page.waitForTimeout(180); continue; }
    if (await tryClick(page, '.hotspot:not([disabled])')) { await page.waitForTimeout(100); continue; }
    if (process.argv.includes('--debug') && i % 20 === 0) {
      const vis = await page.evaluate(() => [...document.querySelectorAll('.screen')]
        .filter((s) => !s.classList.contains('hidden')).map((s) => s.id).join(','));
      console.log(`  [debug ${i}] screens=${vis} title=${await page.locator('#act-title').innerText().catch(() => '')}`);
    }
    await page.waitForTimeout(100);
  }

  const ended = await page.locator('#screen-end').isVisible().catch(() => false);
  let endTitle = await page.locator('#end-title').innerText().catch(() => '');
  // 真调时终局要等模型写完；轮询到标题不再是「结算中…」
  if (ended && /结算中/.test(endTitle)) {
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      await page.waitForTimeout(500);
      endTitle = await page.locator('#end-title').innerText().catch(() => '');
      if (endTitle && !/结算中/.test(endTitle)) break;
    }
  }
  await page.screenshot({ path: path.join(ART, 'e2e-end.png') });

  if (ended) await page.click('#btn-end-logs').catch(() => {});
  else await page.click('#btn-logs').catch(() => {});
  await page.waitForTimeout(250);
  const logCount = await page.locator('.log-item').count();

  // 终局之后还会异步生成「研学报告」（study_report），等它落盘再统计
  {
    const t0 = Date.now();
    for (;;) {
      const res = await (await fetch(`${BASE}/api/logs`)).json();
      if ((res.logs || []).some((l) => l.callType === 'study_report')) break;
      if (Date.now() - t0 > 90000) { console.warn('⚠ study_report 未在 90s 内落盘'); break; }
      await page.waitForTimeout(800);
    }
  }

  // 回归断言：同一锅汤只能结算一次（曾经在钓鱼→分汤的强制链里跑两遍）
  const serverLogs = await (await fetch(`${BASE}/api/logs`)).json();
  const allLogs = serverLogs.logs || [];
  const sceneCount = (name) => allLogs.filter((l) => l.scene === name).length;
  const soupTimes = sceneCount('煮粥分汤');
  const fishTimes = sceneCount('钓鱼·咬钩起竿');
  const candyTimes = allLogs.filter((l) => l.operation?.type === 'sugar' || l.callType === 'share_judge' && l.scene === '分糖·红小鬼').length;
  const sentryTimes = allLogs.filter((l) => l.operation?.type === 'sentry' || l.scene === '夜岗·哨位').length;
  const gomokuTimes = allLogs.filter((l) => l.operation?.type === 'gomoku' || l.scene === '泥地五子棋').length;
  const ludingTimes = allLogs.filter((l) => l.operation?.type === 'luding' || /泸定桥/.test(l.scene || '')).length;
  const nightTimes = allLogs.filter((l) => l.callType === 'night_options' || l.callType === 'night_resolve').length;
  const sources = [...new Set(allLogs.map((l) => l.source))];

  console.log(JSON.stringify({
    ended, endTitle, acts: seenActs, logCount,
    soupTimes, fishTimes, candyTimes, sentryTimes, gomokuTimes, ludingTimes, nightTimes,
    sources, errs: errs.slice(0, 5),
  }, null, 2));

  if (errs.length) throw new Error('PAGE_ERRORS: ' + errs.join(' | '));
  if (!ended) throw new Error('未到达终局');
  // 快速模式跳过营地，没有 #act-title，幕次无从统计
  if (!QUICK && seenActs.length < 6) throw new Error('幕次不足: ' + seenActs.length);
  if (logCount < 20) throw new Error('日志过少: ' + logCount);
  if (soupTimes !== 1) throw new Error(`分汤重复结算: ${soupTimes} 次`);
  if (fishTimes !== 1) throw new Error(`钓鱼重复结算: ${fishTimes} 次`);
  if (candyTimes !== 1) throw new Error(`分糖未按预期触发: ${candyTimes} 次`);
  if (sentryTimes !== 1) throw new Error(`夜岗未按预期触发: ${sentryTimes} 次`);
  // 快速模式跳过营地日，可选的五子棋不会触发
  if (!QUICK && gomokuTimes !== 1) throw new Error(`五子棋未按预期触发: ${gomokuTimes} 次`);
  if (ludingTimes !== 1) throw new Error(`泸定桥未按预期触发: ${ludingTimes} 次`);
  if (nightTimes !== 2) throw new Error(`夜间抉择应有 night_options + night_resolve 两条: ${nightTimes}`);
  if (sources.some((s) => s !== 'GLM')) throw new Error('出现非真调来源（已移除 MOCK）: ' + sources.join(','));

  console.log('E2E FULL PASS');
  await browser.close();
}

main().catch((e) => {
  console.error('E2E FAIL', e.message);
  process.exit(1);
});
