// 隔离诊断：单独跑五子棋小游戏，模拟 E2E 的落子循环，看它能否正常收场。
// 用法：node tests/manual/diag-gomoku.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function ensureServer() {
  try {
    const r = await fetch(`${BASE}/api/config`);
    if (r.ok) return;
  } catch { /* start */ }
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: 'ignore', detached: true });
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

async function main() {
  await ensureServer();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });
  await page.goto(`${BASE}/?diag=${Date.now()}`, { waitUntil: 'networkidle' });

  // 注入五子棋界面并直接调用小游戏模块
  await page.evaluate(async () => {
    const host = document.createElement('div');
    host.id = 'game-host';   // 宿主统一容器（批 5）
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:#111;padding:8px';
    document.body.appendChild(host);
    const { runGomoku } = await import('/js/minigames.js');
    window.__gomokuResult = null;
    runGomoku(host).then((r) => { window.__gomokuResult = r; });
  });

  const t0 = Date.now();
  let clicks = 0;
  let stallMs = 0;
  const seen = [];
  while (Date.now() - t0 < 120000) {
    const state = await page.evaluate(() => {
      const host = document.querySelector('[data-mini="gomoku"]');
      if (!host) return { gone: true };
      const status = host.querySelector('.score-line')?.textContent || '';
      const enabled = host.querySelectorAll('.wzq-cell:not([disabled])').length;
      const total = host.querySelectorAll('.wzq-cell').length;
      const p1 = host.querySelectorAll('.wzq-cell.p1').length;
      const p2 = host.querySelectorAll('.wzq-cell.p2').length;
      return { status, enabled, total, p1, p2, done: window.__gomokuResult };
    });
    if (!seen.length || seen[seen.length - 1] !== state.status) {
      seen.push(state.status);
      console.log(`  ${String(Date.now() - t0).padStart(6)}ms  状态="${state.status}" 可点=${state.enabled}/${state.total} 你=${state.p1} 小鬼=${state.p2}`);
    }
    if (state.done) {
      console.log('  → 已结算:', JSON.stringify(state.done));
      break;
    }
    if (/你先手|轮到你了/.test(state.status) && state.enabled > 0) {
      await page.locator('#gomoku-host .wzq-cell:not([disabled])').first().click({ force: true, timeout: 250 }).catch(() => {});
      clicks += 1;
      stallMs = 0;
      await sleep(120);
    } else {
      stallMs += 200;
      if (stallMs > 20000) { console.log('  ⚠ 卡住 20s：没有可点的格子，也没有结算'); break; }
      await sleep(200);
    }
  }

  const final = await page.evaluate(() => ({
    result: window.__gomokuResult,
    status: document.querySelector('#gomoku-host .score-line')?.textContent || '',
    enabled: document.querySelectorAll('#gomoku-host .wzq-cell:not([disabled])').length,
  }));
  console.log(JSON.stringify({ clicks, 状态序列: seen, 最终: final }, null, 2));
  await browser.close();
  if (!final.result) throw new Error('五子棋未能结算（复现到卡住了）');
  console.log('DIAG GOMOKU OK');
}

main().catch((e) => {
  console.error('DIAG GOMOKU FAIL', e.message);
  process.exit(1);
});
