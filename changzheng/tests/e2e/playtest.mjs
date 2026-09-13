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
import { ensureServer } from './lib/server.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playThrough } from './lib/driver.mjs';

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


const readState = (page) => page.evaluate((k) => {
  try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; }
}, KEY);

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
  // 跑局逻辑走共用件（与影音审计同一实现），这里只挂"分幕计时"与进度打印
  const perAct = [];
  const actMarks = [];
  const { seconds } = await playThrough(page, {
    mode: MODE, speed: SPEED, strategy: STRATEGY,
    onAct: (act, at) => {
      actMarks.push({ act, at });
      console.log(`    [run ${runIndex}] ${at}s → ${act}`);
    },
  });
  for (let i = 0; i < actMarks.length; i++) {
    const end = i + 1 < actMarks.length ? actMarks[i + 1].at : seconds;
    perAct.push({ act: actMarks[i].act, seconds: Math.max(0, end - actMarks[i].at) });
  }

  // 等结算写完（标题先出、段落逐字、personal 最后）
  for (let i = 0; i < 120; i++) {
    const title = await page.locator('#end-title').textContent().catch(() => '');
    const personal = await page.locator('#end-personal').textContent().catch(() => '');
    if (title && !/结算中/.test(title) && String(personal).trim()) break;
    await page.waitForTimeout(500);
  }
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
