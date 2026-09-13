/**
 * 回归用例（真调）：
 * 1) 反复进出沙盘不会叠加 submit 监听（一次行动 = 一次 sim_turn 日志）
 * 2) 沙盘存档不会落在上一回合（日志与画面同回合）
 * 运行：npm run qa:regress
 */
import { ensureServer } from './lib/server.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
  await fetch(`${BASE}/api/logs/clear`, { method: 'POST' });

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  // 统计沙盘表单上挂了几个 submit 监听：进出多次也只应有 1 个
  await page.addInitScript(() => {
    window.__submitListeners = 0;
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      if (type === 'submit' && this && this.id === 'sb-form') window.__submitListeners += 1;
      return orig.call(this, type, fn, opts);
    };
  });

  await page.goto(`${BASE}/?reg=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('czjc_sandbox_world_v2'));
  await page.reload({ waitUntil: 'networkidle' });

  // 反复进出沙盘三次
  for (let i = 0; i < 3; i++) {
    await page.click('#btn-mode-sandbox');
    await page.waitForTimeout(200);
    await page.click('#btn-sb-reset');
    await page.waitForTimeout(200);
  }
  await page.click('#btn-mode-sandbox');
  await page.waitForTimeout(300);

  const action = '用绳子把队伍串起来走';
  await page.fill('#sb-input', action);
  await page.click('#sb-send');
  // 等这次 sim_turn 真正落盘（真调可能 5–20s）
  {
    const t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < 90000) {
      const res = await (await fetch(`${BASE}/api/logs`)).json();
      n = (res.logs || []).filter((l) => l.callType === 'sim_turn').length;
      if (n >= 1) break;
      await sleep(600);
    }
    if (!n) throw new Error('sim_turn 未在 90s 内落盘');
  }

  const res = await (await fetch(`${BASE}/api/logs`)).json();
  const simTurns = (res.logs || []).filter((l) => l.callType === 'sim_turn');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('czjc_sandbox_world_v2') || 'null'));
  const lastAction = stored?.log?.slice(-1)[0]?.action || '';
  const submitListeners = await page.evaluate(() => window.__submitListeners || 0);

  const feedTurns = await page.locator('#sb-feed .turn').count();
  console.log(JSON.stringify({ submitListeners, simTurns: simTurns.length, lastAction, feedTurns, errs }, null, 2));

  if (errs.length) throw new Error('PAGE_ERRORS: ' + errs.join(' | '));
  if (submitListeners !== 1) throw new Error(`submit 监听泄漏：进出 4 次后挂了 ${submitListeners} 个`);
  if (simTurns.length !== 1) throw new Error(`重复提交：一次行动触发了 ${simTurns.length} 次 sim_turn`);
  if (lastAction !== action) throw new Error(`存档落后一回合：${lastAction}`);

  console.log('REGRESS PASS');
  await browser.close();
}

main().catch((e) => {
  console.error('REGRESS FAIL', e.message);
  process.exit(1);
});
