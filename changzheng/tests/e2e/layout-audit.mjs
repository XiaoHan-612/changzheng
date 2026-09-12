/**
 * 逐屏截图排查布局错位
 * 运行：node tests/e2e/layout-audit.mjs
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
const ART = path.join(ROOT, 'tests/e2e/artifacts/layout');
fs.mkdirSync(ART, { recursive: true });

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

async function shot(page, name) {
  await page.screenshot({ path: path.join(ART, name + '.png') });
  console.log('shot', name);
}

async function main() {
  await ensureServer();
  // 只做布局截图，不改运行模式

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));

  await page.goto(`${BASE}/?layout=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('czjc_sandbox_world_v2'));
  await page.reload({ waitUntil: 'networkidle' });

  // 标题
  await shot(page, '01-title');

  // 进入主线
  await page.click('#btn-mode-study');
  await page.waitForTimeout(200);
  try { await page.click('#btn-cut-skip'); } catch { /* ok */ }
  await page.waitForTimeout(500);
  await shot(page, '02-camp');

  // 事件卡（浮桥抉择）
  await page.locator('.hotspot').filter({ hasText: '浮桥' }).click({ force: true });
  await page.waitForTimeout(700);
  await shot(page, '03-stage-choice');

  // 选第一项 → 等 continue
  await page.locator('#ch-opts .btn.choice').first().click({ force: true });
  await page.waitForTimeout(1500);
  await shot(page, '04-stage-after-choice');

  // continue → echo
  if (await page.locator('#btn-continue').count()) {
    await page.locator('#btn-continue').click({ force: true });
  }
  await page.waitForTimeout(500);
  if (await page.locator('#screen-echo').isVisible().catch(() => false)) {
    await shot(page, '05-echo');
    await page.click('#btn-echo-ok');
    await page.waitForTimeout(300);
  }

  // 启程 → 强制链 → 对决
  for (let i = 0; i < 40; i++) {
    const vis = await page.evaluate(() =>
      [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).map((s) => s.id)
    );
    if (vis.includes('screen-quiz')) break;
    if (await page.locator('#btn-continue').count()) {
      await page.locator('#btn-continue').click({ force: true });
      await page.waitForTimeout(200);
      continue;
    }
    if (await page.locator('#btn-echo-ok').isVisible().catch(() => false)) {
      await page.click('#btn-echo-ok');
      await page.waitForTimeout(200);
      continue;
    }
    if (vis.includes('screen-camp')) {
      await page.locator('#btn-march-fixed').click({ force: true });
      await page.waitForTimeout(900);
      continue;
    }
    const ch = page.locator('#ch-opts .btn.choice:not([disabled])');
    if (await ch.count()) {
      await ch.first().click({ force: true });
      await page.waitForTimeout(1200);
      continue;
    }
    await page.waitForTimeout(150);
  }
  if (await page.locator('#screen-quiz').isVisible().catch(() => false)) {
    await shot(page, '06-quiz-before');
    // 点一个选项
    const opt = page.locator('.quiz-opt:not([disabled])');
    if (await opt.count()) {
      await opt.nth(1).click({ force: true });
      await page.waitForTimeout(2500);
      await shot(page, '07-quiz-result');
    }
  } else {
    console.log('WARN: 未进入 quiz');
  }

  // 路径选择屏（如可达）
  if (await page.locator('#screen-path').isVisible().catch(() => false)) {
    await shot(page, '08-path');
  }

  // 手记
  if (await page.locator('#screen-camp').isVisible().catch(() => false)) {
    await page.click('#btn-journal');
    await page.waitForTimeout(400);
    await shot(page, '09-journal');
    await page.click('#btn-journal-close');
  }

  // 答辩面板
  await page.click('#btn-defense');
  await page.waitForTimeout(400);
  await shot(page, '10-defense');
  await page.click('#btn-defense-close');

  // 沙盘
  await page.goto(`${BASE}/?layout2=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.click('#btn-mode-sandbox');
  await page.waitForTimeout(600);
  await page.fill('#sb-input', '派两个人去打探');
  await page.click('#sb-send');
  await page.waitForTimeout(1800);
  await shot(page, '11-sandbox');

  await browser.close();
  console.log('LAYOUT AUDIT DONE →', ART);
}

main().catch((e) => {
  console.error('AUDIT FAIL', e.message);
  process.exit(1);
});
