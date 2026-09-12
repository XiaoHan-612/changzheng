/**
 * E2E 全流程：五幕通关（MOCK）
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

// 用例会把服务切到 MOCK；跑完把 runtime-config.json 原样还原，别动用户本机设置
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

async function run() {
  await ensureServer();
  await fetch(`${BASE}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mock: true }),
  });
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

  await page.click('#btn-mode-study');
  await page.waitForTimeout(120);
  try { await page.click('#btn-cut-skip'); } catch { /* ok */ }

  const seenActs = [];
  let last = '';
  for (let i = 0; i < 480; i++) {
    const act = await page.locator('#act-title').innerText().catch(() => '');
    if (act && act !== last) {
      seenActs.push(act);
      last = act;
      console.log('act', act);
    }
    if (await page.locator('#screen-end').isVisible().catch(() => false)) break;

    if (await tryClick(page, '#btn-echo-ok')) { await page.waitForTimeout(40); continue; }
    if (await tryClick(page, '#btn-continue')) { await page.waitForTimeout(40); continue; }
    if (await tryClick(page, '#btn-cut-next')) { await page.waitForTimeout(30); continue; }
    if (await page.locator('#screen-camp').isVisible().catch(() => false)) {
      if (await tryClick(page, '#btn-march-fixed')) { await page.waitForTimeout(180); continue; }
    }
    if (await tryClick(page, '.quiz-opt:not([disabled])')) { await page.waitForTimeout(300); continue; }
    if (await tryClick(page, '#quiz-next')) { await page.waitForTimeout(40); continue; }
    if (await tryClick(page, '#ch-opts .btn.choice:not([disabled])')) { await page.waitForTimeout(120); continue; }
    if (await tryClick(page, '#pre-opts .btn.choice:not([disabled])')) { await page.waitForTimeout(120); continue; }
    if (await tryClick(page, '#soup-opts .btn.choice:not([disabled])')) { await page.waitForTimeout(120); continue; }
    if (await tryClick(page, '#school-opts .btn.choice:not([disabled])')) { await page.waitForTimeout(40); continue; }
    if (await tryClick(page, '#talk-who .btn.choice')) { await page.waitForTimeout(60); continue; }
    if (await tryClick(page, '#talk-quick .btn.choice')) { await page.waitForTimeout(200); continue; }
    if (await tryClick(page, '#talk-end')) { await page.waitForTimeout(40); continue; }
    if (await tryClick(page, '#stage-panel .btn.choice:not([disabled])')) { await page.waitForTimeout(120); continue; }
    if (await page.locator('#screen-path').isVisible().catch(() => false)) {
      if (await tryClick(page, '.path-zone')) { await page.waitForTimeout(120); continue; }
    }
    if (await tryClick(page, '#fish-cast')) {
      await page.waitForTimeout(1200);
      await tryClick(page, '#fish-hook');
      continue;
    }
    if (await tryClick(page, '#fire-opts .btn.choice:not([disabled])')) { await page.waitForTimeout(180); continue; }
    if (await tryClick(page, '.hotspot:not([disabled])')) { await page.waitForTimeout(100); continue; }
    await page.waitForTimeout(100);
  }

  const ended = await page.locator('#screen-end').isVisible().catch(() => false);
  const endTitle = await page.locator('#end-title').innerText().catch(() => '');
  await page.screenshot({ path: path.join(ART, 'e2e-end.png') });

  if (ended) await page.click('#btn-end-logs').catch(() => {});
  else await page.click('#btn-logs').catch(() => {});
  await page.waitForTimeout(250);
  const logCount = await page.locator('.log-item').count();

  // 回归断言：同一锅汤只能结算一次（曾经在钓鱼→分汤的强制链里跑两遍）
  const serverLogs = await (await fetch(`${BASE}/api/logs`)).json();
  const allLogs = serverLogs.logs || [];
  const sceneCount = (name) => allLogs.filter((l) => l.scene === name).length;
  const soupTimes = sceneCount('煮粥分汤');
  const fishTimes = sceneCount('钓鱼·咬钩起竿');
  const sources = [...new Set(allLogs.map((l) => l.source))];

  console.log(JSON.stringify({
    ended, endTitle, acts: seenActs, logCount, soupTimes, fishTimes, sources, errs: errs.slice(0, 5),
  }, null, 2));

  if (errs.length) throw new Error('PAGE_ERRORS: ' + errs.join(' | '));
  if (!ended) throw new Error('未到达终局');
  if (seenActs.length < 6) throw new Error('幕次不足: ' + seenActs.length);
  if (logCount < 20) throw new Error('日志过少: ' + logCount);
  if (soupTimes !== 1) throw new Error(`分汤重复结算: ${soupTimes} 次`);
  if (fishTimes !== 1) throw new Error(`钓鱼重复结算: ${fishTimes} 次`);
  if (sources.some((s) => /glm-5\.1/i.test(s))) throw new Error('source 被误标为 GLM-5.1: ' + sources.join(','));

  console.log('E2E FULL PASS');
  await browser.close();
}

main().catch((e) => {
  console.error('E2E FAIL', e.message);
  process.exit(1);
});
