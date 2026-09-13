/**
 * E2E 全流程：五幕真调通关（需要 GLM_API_KEY）
 * 运行：npm run test:e2e
 */
import { ensureServer } from './lib/server.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snap as snapOf, tap as tapOf, applyMiniAction, pickHotspot } from './lib/driver.mjs';

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
  const consoleErrs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });
  // 统计语音缓存命中：证明「台词 → /api/tts → 命中缓存」这条链在真实流程里跑通
  const ttsHits = [];
  page.on('response', async (r) => {
    if (!r.url().includes('/api/tts')) return;
    try {
      const j = await r.json();
      if (j.url) ttsHits.push(j.url);
    } catch { /* 忽略 */ }
  });
  page.on('dialog', (d) => d.accept().catch(() => {}));

  await page.goto(`${BASE}/?e2e=${Date.now()}`, { waitUntil: 'networkidle' });
  const titleModel = await page.locator('#title-model').innerText();
  if (!titleModel) throw new Error('title model missing');

  const QUICK = process.argv.includes('--quick');
  await page.click(QUICK ? '#btn-mode-quick' : '#btn-mode-study');
  await page.waitForTimeout(120);
  try { await page.click('#btn-cut-skip'); } catch { /* ok */ }

  // ─── 状态驱动循环 ───
  // 真调每次 1.5–8s，又慢又不能靠固定选择器顺序硬试：每轮先读一次「当前屏幕快照」，
  // 再按屏幕决定点哪里；40s 没有进展就 dump 现场并失败，避免再次静默卡死。
  // 快照与点击走共用件（tests/e2e/lib/driver.mjs），与 playtest 保持同一套契约口径
  const snap = () => snapOf(page);
  const tap = (sel) => tapOf(page, sel);

  const seenActs = [];
  const seenSteps = new Set();
  let lastAct = '';
  let didGomoku = false;
  let didOillamp = false;
  const visitedHotspots = new Set();
  // 营地每次都出现了哪些热点（供覆盖类断言失败时定位：是"没出现"还是"没点到"）
  const campSeen = [];
  let lastSig = '';
  let lastProgress = Date.now();
  const trace = [];
  const MAX_MS = 20 * 60 * 1000;
  const started = Date.now();

  while (Date.now() - started < MAX_MS) {
    const s = await snap();
    if (s.act && s.act !== lastAct) { lastAct = s.act; seenActs.push(s.act); console.log('act', s.act); }
    if (s.step) seenSteps.add(s.step.split(':')[0]);
    // 进入五子棋步骤就记下来（比"点了热点后 300ms 内看元素"可靠）
    if (s.step === 'gomoku') didGomoku = true;
    if (s.step === 'act2:oillamp') didOillamp = true;
    if (s.screens.includes('screen-end')) break;
    if (s.screens.includes('screen-camp') && s.hotspots.length) {
      const row = `ap${s.apOn}:[${s.hotspots.join('|')}]`;
      if (campSeen[campSeen.length - 1] !== row) campSeen.push(row);
    }

    const sig = [s.screens.join(), s.act, s.step, s.state, s.choices, s.cont, s.mini, s.miniState].join('|');
    if (sig !== lastSig) { lastSig = sig; lastProgress = Date.now(); }
    if (Date.now() - lastProgress > 30000) {
      const logsRes = await (await fetch(BASE + '/api/logs')).json();
      const dump = {
        snapshot: s,
        trace: trace.slice(-40),
        logCount: logsRes.count,
        pageErrors: errs.slice(-10),
        consoleErrors: consoleErrs.slice(-10),
      };
      fs.writeFileSync(path.join(ART, 'stall-dump.json'), JSON.stringify(dump, null, 2), 'utf8');
      throw new Error('卡住 30s：screen=' + s.screens.join(',') + ' act=' + s.act
        + '，现场已写入 tests/e2e/artifacts/stall-dump.json');
    }

    const log = (what) => {
      trace.push(new Date().toISOString().slice(11, 19) + ' ' + what + ' @' + s.screens.join(','));
    };

    // 0) 回响 / 继续：契约里最简单的两类
    if (s.echoOk) { log('echo-ok'); await tap('[data-action="echo-ok"]'); continue; }
    if (s.cont) { log('continue'); await tap('[data-action="continue"]'); continue; }
    // 模型调用失败时界面会给「重试 / 跳过」，驱动也按契约处理
    if (s.aiRetry) { log('ai-retry'); await tap('[data-action="ai-retry"]'); continue; }
    // 步骤状态为 busy = 正在等模型，什么都别点
    if (s.state === 'busy') { await page.waitForTimeout(400); continue; }

    // 1) 小游戏：策略在共用件里（新增玩法只需在那张 switch 加一条）
    if (s.mini) {
      const label = await applyMiniAction(page, s);
      if (label) log(label);
      continue;
    }

    // 2) 交谈：直接结束。必须排在通用选项之前 —— 交谈屏的快捷问句也带 data-choice-index，
    //    它们只是可选话题；先走通用分支会在同一屏反复提问，把额度烧光并永远走不出去。
    if (s.talkEnd) { log('talk-end'); await tap('[data-action="talk-end"]'); await page.waitForTimeout(150); continue; }

    // 3) 通用选项（抉择 / 预热 / 分汤 / 分享 / 夜校 / 篝火菜单 / 答题 / 岔路）
    if (s.choices) { log('choice:' + s.kind); await tap('[data-choice-index]'); await page.waitForTimeout(120); continue; }

    // 4) 营地：先把行动点花在热点上（真实玩法），花完再启程
    if (s.screens.includes('screen-camp')) {
      // 二幕的可选热点：只点一次，保证「油灯下的地图」有真调覆盖
      if (!didOillamp && s.hotspots.includes('油灯下的地图')) {
        const o = page.locator('[data-action="hotspot"]', { hasText: '油灯下的地图' }).first();
        if ((await o.count().catch(() => 0)) && (await o.isVisible().catch(() => false))) {
          log('oillamp-open');
          await o.click({ force: true, timeout: 400 }).catch(() => {});
          await page.waitForTimeout(250);
          continue;
        }
      }
      if (!didGomoku && s.hotspots.includes('两个小鬼')) {
        const g = page.locator('[data-action="hotspot"]', { hasText: '两个小鬼' }).first();
        if ((await g.count().catch(() => 0)) && (await g.isVisible().catch(() => false))) {
          log('gomoku-open');
          await g.click({ force: true, timeout: 400 }).catch(() => {});
          await page.waitForTimeout(250);
          continue;
        }
      }
      if (s.apOn > 0 && s.hotspots.length) {
        const keyOf = (l) => `${s.act}|${l}`;
        const label = pickHotspot(s.hotspots, { visited: visitedHotspots, keyOf });
        const el = page.locator('[data-action="hotspot"]', { hasText: label }).first();
        if ((await el.count().catch(() => 0)) && (await el.isVisible().catch(() => false))) {
          visitedHotspots.add(keyOf(label));
          log('camp:' + label);
          await el.click({ force: true, timeout: 400 }).catch(() => {});
          await page.waitForTimeout(200);
          continue;
        }
      }
      if (s.march) { log('march'); await tap('[data-action="march"]'); await page.waitForTimeout(250); continue; }
    }
    if (s.hotspots.length) {
      const label = pickHotspot(s.hotspots);
      log('hotspot:' + label);
      await page.locator('[data-action="hotspot"]', { hasText: label }).first()
        .click({ force: true, timeout: 400 }).catch(() => {});
      await page.waitForTimeout(150);
      continue;
    }
    await page.waitForTimeout(200);
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

  // 「记录」面板属于调试工具（设置里默认关闭），所以直接读服务端计数，不依赖界面入口
  const logCount = (await (await fetch(`${BASE}/api/logs`)).json()).count ?? 0;

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
  // 本轮新增内容：二幕「油灯下的地图」（取 branch_judge 那一次，choice_hint 同场景不计）
  const oillampTimes = allLogs.filter((l) => l.scene === '遵义·油灯下的地图' && l.callType === 'branch_judge').length;
  const sources = [...new Set(allLogs.map((l) => l.source))];

  console.log(JSON.stringify({
    ended, endTitle, acts: seenActs, logCount, ttsHits: ttsHits.length,
    soupTimes, fishTimes, candyTimes, sentryTimes, gomokuTimes, ludingTimes, nightTimes, oillampTimes,
    seenSteps: [...seenSteps],
    sources, errs: errs.slice(0, 5),
  }, null, 2));

  if (errs.length) throw new Error('PAGE_ERRORS: ' + errs.join(' | '));
  if (!ended) throw new Error('未到达终局');
  // 快速模式跳过营地，没有 #act-title，幕次无从统计
  if (!QUICK && seenActs.length < 6) throw new Error('幕次不足: ' + seenActs.length);
  if (logCount < 20) throw new Error('日志过少: ' + logCount);
  if (soupTimes !== 1) throw new Error(`分汤重复结算: ${soupTimes} 次`);
  if (fishTimes !== 1) throw new Error(`钓鱼重复结算: ${fishTimes} 次`);
  if (candyTimes !== 1) throw new Error(`分糖未按预期触发: ${candyTimes} 次；营地历次热点 apN:[…]：${campSeen.slice(-8).join(' → ')}`);
  if (sentryTimes !== 1) throw new Error(`夜岗未按预期触发: ${sentryTimes} 次；营地历次热点 apN:[…]：${campSeen.slice(-8).join(' → ')}`);
  // 快速模式跳过营地日，可选的五子棋不会触发
  if (!QUICK && gomokuTimes !== 1) throw new Error(`五子棋未按预期触发: ${gomokuTimes} 次；营地历次热点 apN:[…]：${campSeen.slice(-8).join(' → ')}`);
  if (ludingTimes !== 1) throw new Error(`泸定桥未按预期触发: ${ludingTimes} 次；营地历次热点 apN:[…]：${campSeen.slice(-8).join(' → ')}`);
  if (nightTimes !== 2) throw new Error(`夜间抉择应有 night_options + night_resolve 两条: ${nightTimes}`);
  // 快速模式跳过开场设定与营地日
  if (!QUICK && !seenSteps.has('origin')) throw new Error('开场出身设定（step=origin）未出现');
  if (!QUICK && oillampTimes !== 1) throw new Error(`二幕「油灯下的地图」未按预期触发: ${oillampTimes} 次；营地历次热点 apN:[…]：${campSeen.slice(-8).join(' → ')}`);
  if (sources.some((s) => s !== 'GLM')) throw new Error('出现非真调来源（已移除 MOCK）: ' + sources.join(','));
  if (ttsHits.length < 5) throw new Error(`语音缓存命中过少（${ttsHits.length}），检查 say() 的文本与 voiceId 是否与 TTS 清单一致`);

  console.log('E2E FULL PASS');
  await browser.close();
}

main().catch((e) => {
  console.error('E2E FAIL', e.message);
  process.exit(1);
});
