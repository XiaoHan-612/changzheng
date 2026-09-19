/**
 * 行军模式失败线真调：覆盖 15 类 AI 契约里唯一从没跑过的 failure_review。
 *
 * 做法（不靠硬刷体力，稳定复现）：开一局行军模式 → 把存档改成「断粮 + 体力见底」
 * → 刷新页面点「继续上一局」→ 启程触发幕间结算（applyStarvation 扣到 0 → checkFailure 命中）。
 *
 * 断言：failure_review 真调 1 次且 source=GLM；失败屏渲染出标题与段落，不是「结算中…」。
 * 运行：npm run qa:failure
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
const KEY = 'czjc_demo_state_v1';   // 与 public/js/state.js 的 KEY 一致

// 用例会写 runtime-config.json；跑完原样还原
const RUNTIME = path.join(ROOT, 'runtime-config.json');
const snapshotRuntime = () => { try { return fs.readFileSync(RUNTIME, 'utf8'); } catch { return null; } };
function restoreRuntime(snap) {
  try {
    if (snap === null) fs.rmSync(RUNTIME, { force: true });
    else fs.writeFileSync(RUNTIME, snap, 'utf8');
  } catch { /* ignore */ }
}


// 与 full-run.mjs 同一套「交互契约」驱动：只认 data-* 标记，不认中文标签或屏内 id。
// 这样新增玩法/改文案都不会让本用例失效。
const snap = (page) => page.evaluate(() => {
  const live = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null && !e.disabled);
  const body = document.body;
  return {
    screens: [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).map((s) => s.id),
    step: body.dataset.step || '',
    state: body.dataset.stepState || '',
    choices: live('[data-choice-index]').length,
    cont: live('[data-action="continue"]').length,
    echoOk: live('[data-action="echo-ok"]').length,
    aiRetry: live('[data-action="ai-retry"]').length,
    march: live('[data-action="march"]').length,
  };
});

async function tap(page, sel) {
  const loc = page.locator(sel);
  const n = await loc.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    const ok = (await el.isVisible().catch(() => false)) && !(await el.isDisabled().catch(() => false));
    if (ok && (await el.getAttribute('aria-disabled').catch(() => null)) === 'true') continue;
    if (ok) {
      await el.click({ force: true, timeout: 400 }).catch(() => {});
      return true;
    }
  }
  return false;
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
  const cfg = await (await fetch(`${BASE}/api/config`)).json();
  if (!cfg.hasKey) throw new Error('本用例只走真调：请配置 GLM_API_KEY');
  await fetch(`${BASE}/api/logs/clear`, { method: 'POST' });

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));

  await page.goto(`${BASE}/?fail=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // 1) 开一局行军模式（startRun 会立刻存档）
  await page.click('#btn-mode-march');
  await page.waitForTimeout(400);

  // 2) 把存档改成"断粮 + 体力见底"：幕间 applyStarvation 扣 8 → 体力归零 → checkFailure 命中
  const patched = await page.evaluate((key) => {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw);
    s.mode = 'march';
    s.粮食 = 0;
    s.体力 = 5;
    sessionStorage.setItem(key, JSON.stringify(s));
    return { mode: s.mode, 体力: s.体力, 粮食: s.粮食, actIndex: s.actIndex };
  }, KEY);
  if (!patched) throw new Error('没读到存档：march 模式开局没有写 sessionStorage');
  console.log('已注入失败条件：', JSON.stringify(patched));

  // 3) 刷新 → 继续上一局 → 启程
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#btn-continue-run');
  await page.waitForSelector('.hotspot', { timeout: 20000 });
  await page.click('#btn-march-fixed');

  // 4) 按契约走完强制链（抉择 / 过场 / 回响 / 继续）直到失败屏
  let reached = false;
  const trace = [];
  const started = Date.now();
  let lastSig = '';
  let lastProgress = Date.now();
  while (Date.now() - started < 3 * 60 * 1000) {
    const s = await snap(page);
    if (s.screens.includes('screen-end')) { reached = true; break; }
    const sig = [s.screens.join(), s.step, s.state, s.choices, s.cont, s.echoOk].join('|');
    if (sig !== lastSig) { lastSig = sig; lastProgress = Date.now(); }
    if (Date.now() - lastProgress > 25000) {
      throw new Error(`卡住 25s：screen=${s.screens.join(',')} step=${s.step} state=${s.state}\n  轨迹：${trace.slice(-12).join(' → ')}`);
    }
    if (s.echoOk) { trace.push('echo-ok'); await tap(page, '[data-action="echo-ok"]'); continue; }
    if (s.cont) { trace.push('continue'); await tap(page, '[data-action="continue"]'); continue; }
    if (s.aiRetry) { trace.push('ai-retry'); await tap(page, '[data-action="ai-retry"]'); continue; }
    if (s.state === 'busy') { await page.waitForTimeout(400); continue; }
    if (s.screens.includes('screen-cutscene')) {
      await tap(page, '[data-action="skip"]');
      await page.waitForTimeout(300);
      continue;
    }
    if (s.choices) { trace.push('choice'); await tap(page, '[data-choice-index]'); await page.waitForTimeout(200); continue; }
    if (s.march) { trace.push('march'); await tap(page, '[data-action="march"]'); await page.waitForTimeout(250); continue; }
    await page.waitForTimeout(200);
  }
  if (!reached) throw new Error('没走到失败屏：断粮+体力见底没有触发 checkFailure');

  // 5) 等模型写完结算：标题先出，段落逐字打字，最后才写关系/个人寄语。
  //    所以要等到 #end-personal 有字才算渲染完成，否则会读到"半截"页面。
  let title = '';
  let personal = '';
  for (let i = 0; i < 120; i++) {
    title = await page.locator('#end-title').textContent().catch(() => '');
    personal = await page.locator('#end-personal').textContent().catch(() => '');
    if (title && title !== '结算中…' && String(personal).trim()) break;
    await page.waitForTimeout(500);
  }
  const eyebrow = await page.locator('#end-eyebrow').textContent().catch(() => '');
  const paras = await page.locator('#end-paras p').allTextContents().catch(() => []);
  const history = await page.locator('#end-history li').allTextContents().catch(() => []);
  await page.screenshot({ path: path.join(ROOT, 'tests/e2e/artifacts/march-failure.png') });
  await browser.close();

  const logs = (await (await fetch(`${BASE}/api/logs`)).json()).logs || [];
  const failures = logs.filter((l) => l.callType === 'failure_review');
  const report = {
    失败类型: (eyebrow || '').split('·').pop().trim(),
    标题: title,
    段落数: paras.filter((t) => t.trim()).length,
    史实要点数: history.length,
    failure_review调用数: failures.length,
    来源: [...new Set(failures.map((l) => l.source))],
    模型: [...new Set(failures.map((l) => l.model).filter(Boolean))],
    耗时毫秒: failures.map((l) => l.durationMs),
    errs,
  };
  console.log(JSON.stringify(report, null, 2));

  if (errs.length) throw new Error('PAGE_ERRORS: ' + errs.join(' | '));
  if (!eyebrow.includes('行军模式')) throw new Error(`失败屏不是行军模式：${eyebrow}`);
  if (title === '结算中…' || !title) throw new Error('失败屏标题没有生成，模型可能没返回');
  if (!paras.filter((t) => t.trim()).length) throw new Error('失败屏没有段落');
  if (failures.length !== 1) throw new Error(`failure_review 调用次数应为 1，实际 ${failures.length}`);
  if (failures[0].source !== 'GLM') throw new Error(`failure_review 不是真调成功：${failures[0].source} ${failures[0].error || ''}`);
  if (!(failures[0].response?.paragraphs || []).length) throw new Error('failure_review 响应缺少 paragraphs');
  // 失败屏有「史实要点」区块，空着就是内容缺陷（曾因读屏过早误报，实际模型有返回）
  if (!(failures[0].response?.history_points || []).length) throw new Error('failure_review 响应缺少 history_points（失败屏史实要点会空着）');
  console.log('MARCH FAILURE PASS');
}

main().catch((e) => {
  console.error('MARCH FAILURE FAIL', e.message);
  process.exit(1);
});
