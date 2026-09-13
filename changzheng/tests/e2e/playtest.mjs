/**
 * 自动试玩：测量「单局时长」与「资源曲线」，为数值调参提供唯一口径。
 *
 * 与 full-run 的区别：
 *   - full-run 只要「能不能通关」，点击是零延迟的；
 *   - playtest 按人类节奏等待（见 lib/driver.mjs 的 readingDelay），因此 elapsed 近似真人耗时。
 *
 * 用法：
 *   npm run qa:playtest                                   # 研学模式 · 均衡策略 · 1 局
 *   node tests/e2e/playtest.mjs --mode=march --runs=3     # 行军模式跑 3 局，看失败率
 *   node tests/e2e/playtest.mjs --strategy=thrifty --speed=fast
 *   node tests/e2e/playtest.mjs --runs=3 --doc            # 把结果表写进 docs/PLAYTEST.md
 *
 * 产物：tests/e2e/artifacts/playtest-<mode>-<strategy>.json（每次覆盖同名），控制台打印汇总表。
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snap, tap, applyMiniAction, readingDelay, pickHotspot } from './lib/driver.mjs';

const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = path.join(ROOT, 'tests/e2e/artifacts');
const DOC = path.join(ROOT, 'docs/PLAYTEST.md');
const KEY = 'czjc_demo_state_v1';
fs.mkdirSync(ART, { recursive: true });

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const MODE = arg('mode', 'study');
const STRATEGY = arg('strategy', 'balanced');
const RUNS = Math.max(1, Number(arg('runs', '1')) || 1);
const SPEED = arg('speed', 'human');
const WRITE_DOC = process.argv.includes('--doc');

/**
 * 策略 = 「选第几个选项」+「优先点哪个热点」。
 * 三个策略对应三种玩家画像：稳扎稳打 / 保守求存 / 抢进度。
 * 热点优先靠标签关键词打分，是在没有语义标签的情况下能落地的最简办法。
 */
const STRATEGIES = {
  balanced: { pick: () => 0, score: () => 0 },
  thrifty: {
    pick: (n) => Math.min(1, n - 1),
    score: (label) => (/背囊|休息|分|塘/.test(label) ? 3 : /说话|问|交谈/.test(label) ? 1 : 0),
  },
  greedy: {
    pick: () => 0,
    score: (label) => (/陡坡|隘口|红旗|桥/.test(label) ? 3 : /说话|问|交谈/.test(label) ? 1 : 0),
  },
};
const policy = STRATEGIES[STRATEGY] || STRATEGIES.balanced;

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

const readState = (page) => page.evaluate((k) => {
  try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; }
}, KEY);

async function clickChoice(page, index) {
  const opts = page.locator('[data-choice-index]');
  const n = await opts.count().catch(() => 0);
  if (!n) return '';
  // 先按策略选目标下标，若它被判定为不可见（残留节点/零尺寸）则退到最近的可见项。
  // 不能直接 return —— 那样循环会原地打转直到假死检测触发。
  const order = [...Array(n).keys()].sort((a, b) => Math.abs(a - index) - Math.abs(b - index));
  for (const i of order) {
    const el = opts.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if (await el.isDisabled().catch(() => false)) continue;
    const label = (await el.innerText().catch(() => '')).split('\n')[0].trim();
    await el.click({ force: true, timeout: 400 }).catch(() => {});
    return label || `#${i}`;
  }
  return '';
}

async function clickHotspot(page, labels, scoreOf) {
  if (!labels.length) return '';
  let best = labels[0];
  let bestScore = -1;
  for (const l of labels) {
    const sc = scoreOf(l);
    if (sc > bestScore) { best = l; bestScore = sc; }
  }
  const el = page.locator('[data-action="hotspot"]', { hasText: best }).first();
  if (!(await el.count().catch(() => 0))) return '';
  await el.click({ force: true, timeout: 400 }).catch(() => {});
  return best;
}

/** 跑一局，返回测量结果 */
async function playOne(browser, runIndex) {
  // 每局独立计量：先清空服务端日志，否则 aiCalls 会把历史累计进来
  await fetch(`${BASE}/api/logs/clear`, { method: 'POST' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  const ttsHits = [];
  page.on('response', async (r) => {
    if (!r.url().includes('/api/tts')) return;
    try { const j = await r.json(); if (j.url) ttsHits.push(j.url); } catch { /* 忽略 */ }
  });

  await page.goto(`${BASE}/?play=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.click(MODE === 'march' ? '#btn-mode-march' : '#btn-mode-study');

  const t0 = Date.now();
  const perAct = [];
  let currentAct = '';
  let actStart = t0;
  let lastSig = '';
  let lastProgress = Date.now();
  let pacedFor = '';
  const trace = [];
  const visitedHotspots = new Set();
  const askedTalk = new Set();     // 同一场交谈最多问一句（真人也会试一句就走）

  for (;;) {
    const s = await snap(page);
    if (s.screens.includes('screen-end')) break;
    if (Date.now() - t0 > 45 * 60 * 1000) throw new Error('试玩超时 45 分钟');

    // 换幕计时（快速模式没有 #act-title，用 step 前缀兜底）
    const actKey = s.act || s.step.split(':')[0];
    if (actKey && actKey !== currentAct) {
      if (currentAct) perAct.push({ act: currentAct, seconds: Math.round((Date.now() - actStart) / 1000) });
      currentAct = actKey;
      actStart = Date.now();
      trace.push(`act ${actKey}`);
      // 每局要十几分钟，必须持续报进度，否则看起来像卡死
      console.log(`    [run ${runIndex}] ${((Date.now() - t0) / 1000).toFixed(0)}s → ${actKey}`);
    }

    const sig = [s.screens.join(), s.step, s.state, s.choices, s.cont, s.echoOk, s.mini, s.miniState].join('|');
    if (sig !== lastSig) { lastSig = sig; lastProgress = Date.now(); }
    if (Date.now() - lastProgress > 40000) {
      throw new Error(`卡住 40s：screen=${s.screens.join(',')} step=${s.step} state=${s.state}；最近动作：${trace.slice(-8).join(' → ')}`);
    }

    // 人类节奏：每个"新的待操作画面"只等一次，等过的不重复等。
    // 注意不能要求 state === 'awaiting'：askChoice 点完会把步骤置为 busy，
    // 而结果面板的「继续」此时已经出现，若先判 busy 就会永远跳过它。
    if (sig !== pacedFor && (s.choices || s.cont || s.echoOk || s.mini || s.talkEnd || s.march)) {
      pacedFor = sig;
      const wait = readingDelay(s.chars, SPEED);
      if (wait) await page.waitForTimeout(wait);
      continue;
    }

    if (s.echoOk) { trace.push('echo-ok'); await tap(page, '[data-action="echo-ok"]'); continue; }
    if (s.cont) { trace.push('continue'); await tap(page, '[data-action="continue"]'); continue; }
    if (s.aiRetry) { trace.push('ai-retry'); await tap(page, '[data-action="ai-retry"]'); continue; }
    if (s.state === 'busy') { await page.waitForTimeout(300); continue; }
    if (s.mini) {
      const label = await applyMiniAction(page, s);
      if (label) trace.push(label);
      continue;
    }
    // 交谈：先问一句（贴近真人），再结束。必须排在通用选项之前：
    // 快捷问句同样带 data-choice-index，先走通用分支会在这里无限提问。
    if (s.talkEnd) {
      if (s.talkQuick && !askedTalk.has(s.step) && STRATEGY !== 'thrifty') {
        askedTalk.add(s.step);
        trace.push('talk-ask');
        await tap(page, '[data-action="talk-quick"]');
        continue;
      }
      trace.push('talk-end');
      await tap(page, '[data-action="talk-end"]');
      continue;
    }
    if (s.choices) {
      const label = await clickChoice(page, policy.pick(s.choices));
      trace.push(`choice ${label}`);
      continue;
    }
    if (s.screens.includes('screen-camp')) {
      if (s.apOn > 0 && s.hotspots.length) {
        const keyOf = (l) => `${s.act}|${l}`;
        const label = pickHotspot(s.hotspots, { visited: visitedHotspots, keyOf, scoreOf: policy.score });
        const clicked = await clickHotspot(page, [label], policy.score);
        if (clicked) {
          visitedHotspots.add(keyOf(clicked));
          trace.push(`hotspot ${clicked}`);
          continue;
        }
      }
      if (s.march) { trace.push('march'); await tap(page, '[data-action="march"]'); continue; }
    }
    await page.waitForTimeout(200);
  }

  // 等结算写完（标题先出、段落逐字、personal 最后）
  for (let i = 0; i < 120; i++) {
    const title = await page.locator('#end-title').textContent().catch(() => '');
    const personal = await page.locator('#end-personal').textContent().catch(() => '');
    if (title && !/结算中/.test(title) && String(personal).trim()) break;
    await page.waitForTimeout(500);
  }
  const seconds = Math.round((Date.now() - t0) / 1000);
  const endTitle = (await page.locator('#end-title').textContent().catch(() => '')) || '';
  const eyebrow = (await page.locator('#end-eyebrow').textContent().catch(() => '')) || '';
  const st = await readState(page);
  const logs = (await (await fetch(`${BASE}/api/logs`)).json()).logs || [];
  await page.close();

  return {
    run: runIndex,
    mode: MODE, strategy: STRATEGY, speed: SPEED,
    seconds,
    perAct,
    endTitle,
    failure: /行军模式/.test(eyebrow),
    resources: st ? {
      体力: st.体力, 粮食: st.粮食, 士气: st.士气, 信念: st.信念, 民心: st.民心,
      origin: st.origin || null, actIndex: st.actIndex,
    } : null,
    aiCalls: logs.length,
    ttsHits: ttsHits.length,
    errs,
  };
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};
const mmss = (sec) => `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`;

function toMarkdown(runs) {
  const head = '| # | 模式 | 策略 | 时长 | 终局 | 体力 | 粮食 | 士气 | 信念 | 民心 | AI 调用 | TTS 命中 |\n|---|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = runs.map((r) => `| ${r.run} | ${r.mode} | ${r.strategy} | ${mmss(r.seconds)} | ${r.endTitle}`
    + ` | ${r.resources?.体力 ?? '—'} | ${r.resources?.粮食 ?? '—'} | ${r.resources?.士气 ?? '—'}`
    + ` | ${r.resources?.信念 ?? '—'} | ${r.resources?.民心 ?? '—'} | ${r.aiCalls} | ${r.ttsHits} |`);
  const perAct = runs[0]?.perAct?.map((p) => `${p.act} ${p.seconds}s`).join(' · ') || '';
  return `${head}\n${rows.join('\n')}\n\n- 时长中位数：**${mmss(median(runs.map((r) => r.seconds)))}**（n=${runs.length}，${runs[0]?.mode} / ${runs[0]?.strategy} / ${runs[0]?.speed}）\n- 首局分幕：${perAct}`;
}

function writeDoc(section) {
  const BEGIN = '<!-- PLAYTEST:BEGIN -->';
  const END = '<!-- PLAYTEST:END -->';
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const block = `${BEGIN}\n> 最近更新：${now}（\`npm run qa:playtest\` 自动生成，勿手改这一段）\n\n${section}\n${END}`;
  let doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';
  if (doc.includes(BEGIN) && doc.includes(END)) {
    doc = doc.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), block);
  } else {
    doc = `# 试玩测量（PLAYTEST）\n\n${block}\n`;
  }
  fs.writeFileSync(DOC, doc, 'utf8');
  console.log('已写入 docs/PLAYTEST.md');
}

async function main() {
  await ensureServer();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const runs = [];
  try {
    for (let i = 1; i <= RUNS; i++) {
      const r = await playOne(browser, i);
      runs.push(r);
      console.log(`[${i}/${RUNS}] ${mmss(r.seconds)} · ${r.endTitle} · AI ${r.aiCalls} 次`);
    }
  } finally {
    await browser.close();
  }
  const out = path.join(ART, `playtest-${MODE}-${STRATEGY}.json`);
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), runs }, null, 2), 'utf8');
  const md = toMarkdown(runs);
  console.log('\n' + md + '\n');
  if (WRITE_DOC) writeDoc(md);
  console.log(`PLAYTEST DONE → ${path.relative(ROOT, out)}`);
}

main().catch((e) => {
  console.error('PLAYTEST FAIL', e.message);
  process.exit(1);
});
