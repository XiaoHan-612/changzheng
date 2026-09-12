/**
 * E2E 鍐掔儫锛氭爣棰?鈫?钀ュ湴 鈫?涓€娆′簰鍔?鈫?鍥炶惀鍦? * 杩愯锛歯pm run qa:smoke
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

// 用例会写 runtime-config.json；跑完原样还原
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
    if (r.ok) return null;
  } catch { /* start */ }
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      const r = await fetch(`${BASE}/api/config`);
      if (r.ok) return child;
    } catch { /* retry */ }
  }
  throw new Error('server start failed');
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
  // 只走真调（本项目已移除 MOCK）
  const cfg = await (await fetch(`${BASE}/api/config`)).json();
  if (!cfg.hasKey) throw new Error('本用例只走真调：请配置 GLM_API_KEY');

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(`${BASE}/?smoke=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.click('#btn-mode-study');
  await page.waitForTimeout(200);
  try { await page.click('#btn-cut-skip'); } catch { /* optional */ }
  await page.waitForTimeout(500);

  assert(await page.locator('.hotspot').count() >= 3, 'hotspots >= 3');
  assert((await page.locator('.j-node').count()) >= 5, 'journey nodes');

  await page.locator('.hotspot:not(.march)').first().click({ force: true });
  // 真调一次要 1.5–6s，轮询等回到营地（最多 120s）
  const deadline = Date.now() + 120000;
  let talkAsked = false;
  let backToCamp = false;
  while (Date.now() < deadline) {
    if (await page.locator('#screen-camp').isVisible().catch(() => false)) { backToCamp = true; break; }
    if (await page.locator('#btn-echo-ok').isVisible().catch(() => false)) {
      await page.click('#btn-echo-ok').catch(() => {});
      continue;
    }
    if (await page.locator('#btn-continue').count()) {
      await page.locator('#btn-continue').click({ force: true }).catch(() => {});
      continue;
    }
    const ch = page.locator('#ch-opts .btn.choice:not([disabled])');
    if (await ch.count()) {
      await ch.first().click({ force: true }).catch(() => {});
      continue;
    }
    if (await page.locator('#talk-quick').isVisible().catch(() => false)) {
      if (!talkAsked) {
        await page.locator('#talk-quick .btn.choice').first().click({ force: true }).catch(() => {});
        talkAsked = true;
      } else {
        await page.locator('#talk-end').click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(300);
      continue;
    }
    await page.waitForTimeout(200);
  }
  if (!backToCamp) throw new Error('一次互动未在 120s 内回到营地（真调可能超时）');

  await page.screenshot({ path: 'tests/e2e/artifacts/smoke.png' });
  if (errs.length) throw new Error('page errors: ' + errs.join('; '));
  console.log('SMOKE PASS');
  await browser.close();
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT ' + msg);
}

main().catch((e) => {
  console.error('SMOKE FAIL', e.message);
  process.exit(1);
});
