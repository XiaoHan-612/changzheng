/**
 * E2E：自由行军沙盘（真调）— 存档恢复 + 事件图卡
 * 运行：npm run qa:sandbox
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

  /**
   * 等一次回合真正结束：回合数增加 **且** 「模型在推演…」气泡已消失。
   * 注意思考气泡本身也是 .turn，只看数量会在真调时提前返回。
   */
  async function waitTurn(before, ms = 180000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const thinking = await page.locator('#sb-feed .turn.thinking').count().catch(() => 1);
      const n = await page.locator('#sb-feed .turn').count().catch(() => 0);
      if (!thinking && n > before) return n;
      await sleep(500);
    }
    const thinking = await page.locator('#sb-feed .turn.thinking').count().catch(() => -1);
    const n = await page.locator('#sb-feed .turn').count().catch(() => -1);
    const tail = (await page.locator('#sb-feed').innerText().catch(() => '')).slice(-200).replace(/\s+/g, ' ');
    throw new Error(`沙盘回合未在 ${ms}ms 内返回（before=${before} now=${n} thinking=${thinking} 末尾=${tail}）`);
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(`${BASE}/?sb=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('czjc_sandbox_world_v2'));
  await page.reload({ waitUntil: 'networkidle' });

  await page.click('#btn-mode-sandbox');
  await page.waitForTimeout(500);
  if (!(await page.locator('#screen-sandbox').isVisible())) throw new Error('沙盘未打开');
  const day0 = await page.locator('#sb-day').innerText();

  await page.fill('#sb-input', '用绳子把队伍串起来走');
  const t0 = await page.locator('#sb-feed .turn').count();
  await page.click('#sb-send');
  const feedTurns = await waitTurn(t0);
  if (feedTurns < 2) throw new Error('回合未写入 feed: ' + feedTurns);

  const sug = page.locator('.sb-suggest .sug').first();
  if (await sug.count()) {
    const label = await sug.innerText();
    const t1 = await page.locator('#sb-feed .turn').count();
    await sug.click();
    await waitTurn(t1);
    console.log('picked suggestion:', label);
  }

  const day1 = await page.locator('#sb-day').innerText();
  const people = await page.locator('#sb-people .sb-person').count();
  const sugCount = await page.locator('.sb-suggest .sug').count();
  const sceneTag = await page.locator('#sb-scene-tag').innerText();
  const hasGoal = await page.locator('.sb-goal').count();
  const evCards = await page.locator('.ev-card').count();
  await page.screenshot({ path: path.join(ART, 'sandbox.png') });

  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#btn-mode-sandbox');
  await page.waitForTimeout(1200);
  const restored = await page.locator('#sb-feed .turn').first().innerText().catch(() => '');
  const day2 = await page.locator('#sb-day').innerText();
  console.log('restored day', day2, 'feed starts:', restored.slice(0, 50).replace(/\n/g, ' '));
  if (day2 !== day1) throw new Error(`存档恢复失败: ${day2} != ${day1}`);
  await page.screenshot({ path: path.join(ART, 'sandbox-restore.png') });

  if (errs.length) throw new Error('PAGE_ERRORS: ' + errs.join(' | '));
  if (people < 3) throw new Error('世界面板人员缺失: ' + people);
  if (sugCount < 1) throw new Error('缺少建议行动');
  if (!sceneTag) throw new Error('缺少事件图标签');
  if (evCards < 1) throw new Error('缺少事件图卡');

  console.log(JSON.stringify({ day0, day1, feedTurns, people, sugCount, sceneTag, hasGoal, evCards }, null, 2));
  console.log('SANDBOX PASS');
  await browser.close();
}

main().catch((e) => {
  console.error('SANDBOX FAIL', e.message);
  process.exit(1);
});
