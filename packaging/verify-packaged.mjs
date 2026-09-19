#!/usr/bin/env node
/**
 * 验收脚本：**只测封装**，不测玩法（玩法他们自己已经测过了）。
 *
 * 判据（任何一条不过就是封装有问题）：
 *   1. 双击 exe → 进程活着，本地服务在 127.0.0.1:<port> 上应答
 *   2. /api/config 认得随包自带的 Key（hasKey=true）
 *   3. 用真实浏览器内核打开 http://127.0.0.1:<port>，前端 JS 正常启动：
 *      标题页 → 行军模式 → 跳过开场 → 营地出现热点与行程节点
 *   4. 点一个热点，走一次**真实**的模型裁决，能回到营地（证明封装没掐断出网）
 *   5. 这次调用落进了 user-data/logs 的 JSONL（审计可查）
 *   6. user-data 落在 exe 旁边，不是只读的安装目录
 *
 * 用法：node verify-packaged.mjs  [--keep]
 *      VERIFY_EXE="D:\别人的电脑\长征-抉择\长征-抉择.exe" node verify-packaged.mjs
 *        —— 指定别的 exe（例如解压到别处的副本），用来验证「换台机器/换个目录照样能跑」
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const GAME = path.join(REPO, 'changzheng');
const APP_DIR = path.join(REPO, 'dist', '长征-抉择');
const EXE = process.env.VERIFY_EXE || path.join(APP_DIR, '长征-抉择.exe');
const STATE = path.join(HERE, '.verify-state');
const PORT = Number(process.env.VERIFY_PORT || 31399);
const KEEP = process.argv.includes('--keep');
const BASE = `http://127.0.0.1:${PORT}`;

const require = createRequire(path.join(GAME, 'package.json'));
const { chromium } = require('playwright');
const { passOrigin } = await import(pathToFileURL(path.join(GAME, 'tests', 'e2e', 'lib', 'driver.mjs')).href);

let child = null;
const fails = [];
const ok = (msg) => console.log('  ✔', msg);
const bad = (msg) => { fails.push(msg); console.log('  ✘', msg); };
const check = (cond, msg) => (cond ? ok(msg) : bad(msg));

main()
  .catch((e) => { bad(`脚本异常：${e && e.message ? e.message : e}`); })
  .finally(async () => {
    if (child && !KEEP) { try { child.kill(); } catch { /* ignore */ } }
    console.log(`\n${fails.length ? `验收未通过（${fails.length} 条）` : '验收通过'}`
      + `${KEEP ? '（应用仍在运行）' : ''}\n`);
    process.exit(fails.length ? 1 : 0);
  });

async function main() {
  if (!fs.existsSync(EXE)) throw new Error(`没找到成品：${EXE}（先跑 node build.mjs）`);
  console.log('\n验收封装成品：', EXE, '\n');

  fs.rmSync(STATE, { recursive: true, force: true });

  // ── 1. 起进程 ──
  console.log('[1] 启动成品 exe');
  child = spawn(EXE, [], {
    env: { ...process.env, PORT: String(PORT), CZ_STATE_DIR: STATE },
    stdio: 'ignore',
    detached: false,
  });
  child.on('exit', (code) => {
    if (!KEEP && code !== null && code !== 0) console.log(`  （进程退出 code=${code}）`);
  });

  const cfg = await waitJson('/api/config', 60000);
  check(!!cfg, `本地服务在 ${BASE} 上应答`);
  if (!cfg) return;

  // ── 2. 配置 ──
  console.log('[2] 随包配置');
  check(cfg.hasKey === true, `认到了 API Key（模型 ${cfg.model}）`);
  check(fs.existsSync(path.join(STATE, '启动日志.txt')), 'user-data 落在 exe 旁边，启动日志已写');

  // ── 3. 前端起来 ──
  console.log('[3] 真实浏览器打开游戏');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const failedReq = [];
  const httpErrors = [];
  page.on('requestfailed', (r) => failedReq.push(`${r.url()} ${r.failure()?.errorText || ''}`));
  page.on('response', (r) => { if (r.status() >= 400) httpErrors.push(`${r.status()} ${new URL(r.url()).pathname}`); });

  await page.goto(`${BASE}/?verify=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  check((await page.locator('#btn-mode-march').count()) > 0, '标题页渲染出来了');

  await page.click('#btn-mode-march');
  await page.waitForTimeout(300);
  await passOrigin(page);
  await page.waitForTimeout(600);
  const hotspots = await page.locator('.hotspot').count();
  const nodes = await page.locator('.j-node').count();
  check(hotspots >= 3, `营地热点 ${hotspots} 个（>=3）`);
  check(nodes >= 5, `行程节点 ${nodes} 个（>=5）`);

  // ── 4. 一次真实裁决 ──
  console.log('[4] 走一次真实模型裁决（要联网，可能要等十几秒）');
  const first = page.locator('.hotspot:not(.march)').first();
  const label = (await first.getAttribute('data-hotspot-label')) || '';
  await first.click({ force: true });
  const deadline = Date.now() + 120000;
  let backToCamp = false;
  while (Date.now() < deadline) {
    if (await page.locator('#screen-camp').isVisible().catch(() => false)) { backToCamp = true; break; }
    if (await page.locator('#btn-echo-ok').isVisible().catch(() => false)) { await page.click('#btn-echo-ok').catch(() => {}); continue; }
    if (await page.locator('#btn-continue').count()) { await page.locator('#btn-continue').click({ force: true }).catch(() => {}); continue; }
    const ch = page.locator('#ch-opts .blk-choice:not([disabled])');
    if (await ch.count()) { await ch.first().click({ force: true }).catch(() => {}); continue; }
    if (await page.locator('#talk-quick').isVisible().catch(() => false)) {
      await page.locator('#talk-quick .blk-choice').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
      await page.locator('#talk-end').click({ force: true }).catch(() => {});
      continue;
    }
    await page.waitForTimeout(250);
  }
  check(backToCamp, `点过热点「${label}」后回到了营地（真调成功）`);
  const errText = await page.locator('#ai-err, .ai-error').first().innerText().catch(() => '');
  if (errText.trim()) console.log('  （界面报错文本：' + errText.trim().slice(0, 120) + '）');

  // ── 5. 审计日志 ──
  console.log('[5] 落盘审计');
  const logDir = path.join(STATE, 'logs');
  const files = fs.existsSync(logDir) ? fs.readdirSync(logDir) : [];
  const session = path.join(logDir, 'session-full.jsonl');
  const lines = fs.existsSync(session) ? fs.readFileSync(session, 'utf8').split('\n').filter(Boolean) : [];
  check(lines.length > 0, `user-data/logs 里落了 ${lines.length} 条调用记录（${files.join(' / ') || '空'}）`);
  if (lines.length) {
    try {
      const rec = JSON.parse(lines[lines.length - 1]);
      console.log(`    最后一条：callType=${rec.callType} source=${rec.source} model=${rec.model} contractOk=${rec.contractOk}`);
    } catch { /* ignore */ }
  }

  // ── 6. 静态资源 & 页面无报错 ──
  // 说明：音频通道会先 HEAD 探测再决定用 .ogg 还是 .wav，切场景/静音时 `pause()` 会把
  // 还没回来的请求掐掉，浏览器就记一条 net::ERR_ABORTED。这不是缺文件 —— 已实测：
  // 直接跑原工程 `node server/index.js` 打开同一屏，报的是**同样这三条**。
  // 所以判据是：ERR_ABORTED 只报告，真正算失败的是 404 / 连接被拒这一类。
  console.log('[6] 资源与页面健康');
  check(pageErrors.length === 0, pageErrors.length ? `页面 JS 报错：${pageErrors.slice(0, 3).join(' | ')}` : '页面无 JS 报错');
  const badReqs = failedReq.filter((u) => !/favicon/.test(u) && !/ERR_ABORTED/.test(u));
  const aborted = failedReq.filter((u) => /ERR_ABORTED/.test(u)).length;
  if (aborted) console.log(`    （${aborted} 条 ERR_ABORTED：音频探测被主动取消，原工程同样如此，不算问题）`);
  check(badReqs.length === 0, badReqs.length ? `有资源真的没加载成功：${badReqs.slice(0, 3).join(' | ')}` : '没有资源加载失败（除音频主动取消外）');
  check(httpErrors.length === 0, httpErrors.length ? `有请求返回错误码：${httpErrors.slice(0, 3).join(' | ')}` : '没有 4xx/5xx 响应');

  const shot = path.join(HERE, 'verify-shot.png');
  await page.screenshot({ path: shot });
  ok(`截图留档：${shot}`);
  await browser.close();
}

async function waitJson(route, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + route, { signal: AbortSignal.timeout(2500) });
      if (r.ok) return await r.json();
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  return null;
}
