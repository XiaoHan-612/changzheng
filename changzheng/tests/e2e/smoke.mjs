/**
 * E2E 冒烟：标题 → 营地 → 一次互动 → 回营地
 * 运行：npm run qa:smoke
 */
import { ensureServer } from './lib/server.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { passOrigin } from './lib/driver.mjs';

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
  await passOrigin(page);              // 开场出身设定：冒烟只关心主流程
  try { await page.click('#btn-cut-skip'); } catch { /* optional */ }
  await page.waitForTimeout(500);

  assert(await page.locator('.hotspot').count() >= 3, 'hotspots >= 3');
  assert((await page.locator('.j-node').count()) >= 5, 'journey nodes');

  const firstHotspot = page.locator('.hotspot:not(.march)').first();
  const hotspotLabel = (await firstHotspot.getAttribute('data-hotspot-label')) || '';
  await firstHotspot.click({ force: true });
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
    const ch = page.locator('#ch-opts .blk-choice:not([disabled])');
    if (await ch.count()) {
      await ch.first().click({ force: true }).catch(() => {});
      continue;
    }
    if (await page.locator('#talk-quick').isVisible().catch(() => false)) {
      if (!talkAsked) {
        await page.locator('#talk-quick .blk-choice').first().click({ force: true }).catch(() => {});
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

  // 用过一次的热点必须**当场**变成"已看过"：热点用一次就作废，但 DOM 若不跟着状态重画，
  // 界面就在撒谎——看着还能点，点下去只弹「这里已经看过了」。玩家只是困惑，
  // 自动化会卡在这颗热点上反复点、一直到 40s 超时（2026-09-13 影音审计实锤）。
  const used = page.locator(`.hotspot[data-hotspot-label="${hotspotLabel}"]`);
  assert(await used.isDisabled(), `用过的热点「${hotspotLabel}」应立刻置为已看过`);
  assert((await used.getAttribute('data-hotspot-state')) === 'done', `用过的热点「${hotspotLabel}」状态应为 done`);

  // 静音开关：点回去必须把环境床接回来
  // （2026-09-14 修的 bug：取消静音只置了标志位，背景声再也不恢复，只有切场景才回来）
  const muteCycle = await page.evaluate(async () => {
    const a = window.__czAudio;
    if (!a) return { ok: false, why: '没有 __czAudio 调试句柄' };
    const wait = (ms) => new Promise((s) => setTimeout(s, ms));
    const clickMute = () => document.getElementById('btn-mute').dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
    const playing = () => a.isPlaying('ambient');   // 公共查询：不摸实现细节
    const wasPlaying = playing();
    clickMute(); await wait(300);
    const afterMute = playing();
    clickMute(); await wait(900);
    return { ok: true, wasPlaying, afterMute, afterUnmute: playing(), wanted: a.state().desired.ambient };
  });
  assert(muteCycle.ok, `静音体检：${muteCycle.why || ''}`);
  assert(muteCycle.wasPlaying, '进营地后环境床应在播（拼错了素材名或回退链断了）');
  assert(!muteCycle.afterMute, '点静音后环境床应停播');
  assert(muteCycle.afterUnmute, '取消静音后环境床应自动恢复（静音恢复回归）');

  // 设置面板 = 模型控制台：模型（下拉+自定义）/ 推理档位 / Key / 接口 / 测试键
  await page.click('#btn-settings').catch(async () => { await page.click('#btn-settings2').catch(() => {}); });
  await page.waitForTimeout(400);
  assert(await page.locator('#screen-settings').isVisible(), '设置面板可打开');
  assert((await page.locator('#set-model option').count()) >= 2, '模型下拉有选项');
  assert((await page.locator('#set-model-custom').count()) === 1, '可自定义模型名');
  assert((await page.locator('#set-effort option').count()) >= 3, '推理档位有 low/high/max');
  assert((await page.locator('#set-key').count()) === 1, 'Key 输入');
  assert((await page.locator('#set-url').count()) === 1, '接口地址输入');
  assert((await page.locator('#btn-set-test').count()) === 1, '测试连通键');
  assert((await page.locator('#btn-set-save').count()) === 1, '保存键');
  assert((await page.locator('#set-devtools').count()) === 1, '展示开关（评委/调试工具）');
  // 顶栏模型标签属于调试工具、默认隐藏，所以模型口径直接读配置接口
  console.log('设置面板 OK · 模型 =', cfg.model, '· 展示开关默认',
    (await page.locator('#set-devtools').isChecked()) ? '开' : '关');
  assert(!(await page.locator('#ai-mode').isVisible().catch(() => false)), '默认应隐藏模型标签（纯游戏界面）');
  assert(!(await page.locator('#btn-judge').isVisible().catch(() => false)), '默认应隐藏评委演示');
  assert(!(await page.locator('#btn-defense').isVisible().catch(() => false)), '默认应隐藏答辩');
  await page.click('#btn-settings-close');
  await page.waitForTimeout(200);

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
