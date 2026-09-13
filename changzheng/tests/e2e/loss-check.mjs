// 减员机制定点验证（行军模式）。
//
// 为什么不靠"跑三整局"：激进路线单局 15 分钟以上，三局就是大半小时，还不一定撞上减员点。
// 这里改成定点复现：注入"体力见底 + 断粮"的存档 → 走到第一个高风险抉择（湘江·护送伤员过封锁，
// 选项一「立刻冲过去」）→ 断言真的失去了一个人。3 分钟一跑，可反复回归。
//
// 规则见 public/js/state.js 的 resolveLoss：高风险在 体力<60 或 粮食≤1 时减员。
// 用法：npm run qa:loss
import { ensureServer, BASE } from './lib/server.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playThrough, passOrigin } from './lib/driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KEY = 'czjc_demo_state_v1';

const RUNTIME = path.join(ROOT, 'runtime-config.json');
const snapshotRuntime = () => { try { return fs.readFileSync(RUNTIME, 'utf8'); } catch { return null; } };
function restoreRuntime(snap) {
  try {
    if (snap === null) fs.rmSync(RUNTIME, { force: true });
    else fs.writeFileSync(RUNTIME, snap, 'utf8');
  } catch { /* ignore */ }
}

async function run() {
  await ensureServer();
  const cfg = await (await fetch(`${BASE}/api/config`)).json();
  if (!cfg.hasKey) throw new Error('本用例只走真调：请配置 GLM_API_KEY');

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));

  await page.goto(`${BASE}/?loss=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // 开一局行军模式并过开场
  await page.click('#btn-mode-march');
  await page.waitForTimeout(300);
  await passOrigin(page);
  await page.click('#btn-cut-skip').catch(() => {});
  await page.waitForTimeout(800);

  // 注入"断粮"：高风险抉择的减员条件是「体力<60 或 粮食≤1」，粮食见底即可触发；
  // 体力故意留高——否则会在幕间结算直接走「断粮掉队」失败线，根本到不了抉择。
  const patched = await page.evaluate((k) => {
    const s = JSON.parse(sessionStorage.getItem(k) || 'null');
    if (!s) return null;
    s.mode = 'march'; s.体力 = 70; s.粮食 = 0;
    sessionStorage.setItem(k, JSON.stringify(s));
    return { 体力: s.体力, 粮食: s.粮食, actIndex: s.actIndex };
  }, KEY);
  if (!patched) throw new Error('读不到存档');
  console.log('已注入：', JSON.stringify(patched));
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#btn-continue-run');
  await page.waitForSelector('.hotspot', { timeout: 20000 });

  // 从营地续跑：动作走共用驱动（唯一实现），不再自己写循环——
  // 上一版自己写循环时把"继续"判在"回响 OK"之前，点了 60 次覆盖层，原地打转。
  // balanced 策略按热点的自然顺序会先点 act1 的「担架队」，正是第一个高风险抉择。
  const seen = [];
  await playThrough(page, {
    mode: 'march',
    speed: 'fast',
    strategy: 'balanced',
    resume: true,
    maxMs: 10 * 60 * 1000,
    onSnapshot: (s) => { if (s.step) seen.push(s.step); },
  });
  const st = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) || 'null'), KEY);
  const losses = (st?.losses || []).map((l) => l.who);
  const toast = await page.locator('.loss-toast').count().catch(() => 0);
  await page.screenshot({ path: path.join(ROOT, 'tests/e2e/artifacts/loss-check.png') });
  await browser.close();

  const report = {
    体力: st?.体力, 粮食: st?.粮食, 减员: losses, 损失提示条: toast,
    走过的高风险抉择: seen.filter((x) => /escort|snow_help|ferry|lazikou/.test(x)),
    pageErrors: errs,
  };
  console.log(JSON.stringify(report, null, 2));
  if (errs.length) throw new Error('PAGE_ERRORS: ' + errs.join(' | '));
  if (!losses.length) throw new Error('高风险抉择在体力见底时没有减员（规则没生效）');
  if (!losses.includes('担架上的伤员')) throw new Error(`减员对象不对：${losses.join('、')}`);
  console.log('LOSS CHECK PASS');
}

async function main() {
  const snapRuntime = snapshotRuntime();
  try {
    await run();
  } finally {
    restoreRuntime(snapRuntime);
  }
}

main().catch((e) => {
  console.error('LOSS CHECK FAIL', e.message);
  process.exit(1);
});
