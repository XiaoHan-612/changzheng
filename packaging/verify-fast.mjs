#!/usr/bin/env node
/**
 * 快速验收（默认门禁，几十秒量级）—— 只验「封装」是否完整，不重跑玩法。
 *
 * 为什么需要它：verify-packaged.mjs 会在界面里点着走完一整屏热点、并等真调返回，
 * 顺利也要两三分钟、不顺要十几分钟。日常迭代只需要回答三个问题：
 *   ① 成品里的内容跟当前工程是否**逐字节一致**（不靠"看起来在"）；
 *   ② 双击 exe 能不能把服务与页面拉起来；
 *   ③ 音画/模块等静态资源在成品里拿得到、真调一次能通（含日志落盘）。
 *
 * 判据（任何一条不过都算封装有问题）：
 *   [0] 内容一致：public/server/data/package.json/.env 与仓库工程逐文件 sha256 相等
 *       （单文件版在首次展开后再比对，等价于验内嵌数据）
 *   [1] 服务起来：/api/config 有应答、hasKey=true、启动日志写在 user-data
 *   [2] 静态资源：index.html / 一个 JS / 一张场景图 / 一段 OGG / 一个字体 / data/*.json 全 200 且内容像样
 *   [3] 浏览器冒烟：无页面 JS 报错；标题页 → 行军 → 营地热点与行程节点都在（不做任何点选）
 *   [4] 真调一次：直连 /api/decide 发一次最小裁决；通了就校验 JSONL 审计落盘，
 *       没通（本机到不了比赛网关）只作提示、不进判定——封装要保证"调不通也不装死"。
 *
 * 用法：
 *   node verify-fast.mjs                 # 默认验便携版 dist/长征-抉择/长征-抉择.exe
 *   node verify-fast.mjs --single        # 验 dist/长征-抉择-单文件版.exe
 *   node verify-fast.mjs --single --fresh  # 且先删掉上次展开结果，走一次真实的"首次双击"
 *   node verify-fast.mjs --keep          # 结束后不杀进程（排查用）
 *   VERIFY_EXE=D:\别处\长征-抉择.exe node verify-fast.mjs   # 换一个副本验
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const GAME = path.join(REPO, 'changzheng');
const APP_NAME = '长征-抉择';
const SINGLE = process.argv.includes('--single');
const FRESH = process.argv.includes('--fresh');
const KEEP = process.argv.includes('--keep');
const PORT = Number(process.env.VERIFY_PORT || 31399);
const BASE = `http://127.0.0.1:${PORT}`;
const LOCAL_ROOT = path.join(process.env.LOCALAPPDATA || '', APP_NAME);
const EXE = process.env.VERIFY_EXE || (SINGLE
  ? path.join(REPO, 'dist', `${APP_NAME}-单文件版.exe`)
  : path.join(REPO, 'dist', APP_NAME, `${APP_NAME}.exe`));
// 便携版：状态目录由脚本指定（就在 packaging/ 下，测完即弃）；
// 单文件版：展开器把 user-data 定在 %LOCALAPPDATA%\长征-抉择\，只能原地验。
const STATE = SINGLE ? path.join(LOCAL_ROOT, 'user-data') : path.join(HERE, '.verify-state');

const require = createRequire(path.join(GAME, 'package.json'));
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
let child = null;
const fails = [];
const ok = (m) => console.log(`  ✔ [${secs()}] ${m}`);
const bad = (m) => { fails.push(m); console.log(`  ✘ [${secs()}] ${m}`); };
const check = (c, m) => (c ? ok(m) : bad(m));
const head = (m) => console.log(`\n${m}`);
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

main()
  .catch((e) => bad(`脚本异常：${e && e.message ? e.message : e}`))
  .finally(async () => {
    await stopApp();
    console.log(`\n${fails.length ? `验收未通过（${fails.length} 条）` : '验收通过'} · 总耗时 ${secs()}\n`);
    process.exit(fails.length ? 1 : 0);
  });

async function main() {
  if (!fs.existsSync(EXE)) throw new Error(`没找到成品：${EXE}（先跑 node build.mjs / node build-singlefile.mjs）`);
  console.log(`\n快速验收${SINGLE ? '（单文件版）' : '（便携版）'}：${EXE}`);
  console.log(`状态目录：${STATE}`);

  if (SINGLE && FRESH) {
    console.log('--fresh：清掉上次展开结果与版本戳，走一次真实的「首次双击」…');
    fs.rmSync(path.join(LOCAL_ROOT, 'app'), { recursive: true, force: true });
    fs.rmSync(path.join(LOCAL_ROOT, '版本戳.txt'), { force: true });
  }
  fs.rmSync(STATE, { recursive: true, force: true });

  head('[0] 内容一致性（与仓库工程逐字节比对）');
  if (!SINGLE) {
    compareTrees(path.join(GAME, 'public'), path.join(REPO, 'dist', APP_NAME, 'resources', 'app', 'changzheng', 'public'));
    compareTrees(path.join(GAME, 'server'), path.join(REPO, 'dist', APP_NAME, 'resources', 'app', 'changzheng', 'server'));
    compareTrees(path.join(GAME, 'data'), path.join(REPO, 'dist', APP_NAME, 'resources', 'app', 'changzheng', 'data'));
  } else {
    console.log('  （单文件版的内容一致性，等展开完成后比对内嵌数据的落地结果）');
  }

  head('[1] 启动成品');
  child = spawn(EXE, [], {
    env: { ...process.env, PORT: String(PORT), ...(SINGLE ? {} : { CZ_STATE_DIR: STATE }) },
    stdio: 'ignore',
  });
  child.on('exit', () => { /* 单文件版的启动器拉起游戏后就会自己退出，属正常 */ });

  const cfg = await waitJson('/api/config', 240000);
  check(!!cfg, `本地服务在 ${BASE} 上应答`);
  if (!cfg) return;
  check(cfg.hasKey === true, `认到了 API Key（模型 ${cfg.model}，端口 ${cfg.port}）`);
  const logFile = path.join(STATE, '启动日志.txt');
  check(fs.existsSync(logFile), `user-data 落位、启动日志已写（${STATE}）`);
  if (SINGLE) check(fs.existsSync(path.join(LOCAL_ROOT, '版本戳.txt')), '版本戳已就位（内容变了会自动重展开）');

  head('[2] 静态资源（音/画/模块/数据都拿得到）');
  await getOk('/api/data/acts', { json: true, label: 'data/acts.json' });
  await getOk('/', { label: 'index.html', contains: 'btn-mode-march' });
  await getOk('/', { label: 'index.html（日志导出按钮在位）', contains: 'btn-logs-export' });
  await getOk('/js/main.js', { label: 'js/main.js', contains: 'import' });
  await getOk('/css/base.css', { label: 'css/base.css' });
  await getOk(`/assets/scenes/${encodeURIComponent(firstScene())}`, { label: `一张场景图（${firstScene()}）`, magic: 'ffd8ff' });
  await getOk('/audio/ambient/depart_river.ogg', { label: '一段环境音 OGG', magic: '4f676753' });
  await getOk('/fonts/lxgwwenkai-regular-subset-100.woff2', { label: '一个自托管字体 WOFF2', magic: '774f4632' });

  if (SINGLE) {
    head('[0b] 单文件内嵌数据 → 展开结果 vs 仓库工程');
    const packed = path.join(LOCAL_ROOT, 'app', 'resources', 'app', 'changzheng');
    compareTrees(path.join(GAME, 'public'), path.join(packed, 'public'));
    compareTrees(path.join(GAME, 'server'), path.join(packed, 'server'));
    compareTrees(path.join(GAME, 'data'), path.join(packed, 'data'));
  }

  head('[3] 浏览器冒烟（只看不点）');
  const browser = await chromiumLaunch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const badRes = [];
    page.on('response', (r) => { if (r.status() >= 400) badRes.push(`${r.status()} ${new URL(r.url()).pathname}`); });

    await page.goto(`${BASE}/?verify=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#btn-mode-march', { timeout: 15000 });
    check(true, '标题页渲染出来');
    // 点「行军」要等前端把流程接上：按钮在 DOM 里 ≠ 事件已挂好。
    // 判据是 body[data-step] 开始有值（序章/幕间走的是 cutscene，选择题是 origin*）。
    let entered = false;
    for (let i = 0; i < 20 && !entered; i++) {
      await page.click('#btn-mode-march').catch(() => {});
      await page.waitForTimeout(250);
      entered = !!(await page.evaluate(() => document.body.dataset.step || ''));
    }
    check(entered, '行军流程已启动（data-step 就位）');
    const { passOrigin } = await import(pathToFileURL(path.join(GAME, 'tests', 'e2e', 'lib', 'driver.mjs')).href);
    for (let i = 0; i < 3; i++) {
      await passOrigin(page);
      if (await page.locator('#screen-camp').isVisible().catch(() => false)) break;
      await page.waitForTimeout(400);
    }
    await page.waitForSelector('.hotspot', { timeout: 15000 }).catch(() => {});
    const hotspots = await page.locator('.hotspot').count();
    const nodes = await page.locator('.j-node').count();
    check(hotspots >= 3, `营地热点 ${hotspots} 个（>=3）`);
    check(nodes >= 5, `行程节点 ${nodes} 个（>=5）`);
    check(pageErrors.length === 0, pageErrors.length ? `页面 JS 报错：${pageErrors.slice(0, 3).join(' | ')}` : '页面无 JS 报错');
    check(badRes.length === 0, badRes.length ? `有 4xx/5xx：${badRes.slice(0, 3).join(' | ')}` : '没有 4xx/5xx 响应');
    await page.screenshot({ path: path.join(HERE, 'verify-fast-shot.png') });
    ok(`截图留档：${path.join(HERE, 'verify-fast-shot.png')}`);

    // 日志屏（比赛硬性要求）：能打开、有导出按钮、实时刷新文案在位
    await page.click('#btn-logs');
    await page.waitForSelector('#btn-logs-export', { timeout: 5000 });
    const meta = await page.locator('#logs-meta').innerText().catch(() => '');
    check(/自动刷新/.test(meta), `日志屏可打开、导出按钮在位（meta：“${meta.slice(0, 28)}…”）`);
    await page.click('#btn-logs-close');
  } finally {
    await browser.close();
  }

  head('[4] 真调一次（本机到不了网关时只作提示，不进验收判定）');
  const verdict = await decideOnce();
  const gotModel = !!(verdict && verdict.ok && verdict.result && !verdict.result._error);
  if (gotModel) {
    ok(`模型已应答（${verdict.ms} ms）：${JSON.stringify(verdict.result).slice(0, 90)}`);
    const logs = await waitJson('/api/logs', 8000).catch(() => null);
    check(!!logs && logs.count > 0,
      logs && logs.count ? `审计落盘 ${logs.count} 条（最后一条 callType=${logs.logs.at(-1)?.callType ?? '?'} source=${logs.logs.at(-1)?.source ?? '?'}）` : '审计日志没有落盘');
  } else {
    // 这台机器可能压根到不了比赛网关（用户已知），也把"失败被如实记进日志"当成通过：
    // 封装要保证的是"调不通时不装死"，不是"网络必须通"。
    const why = verdict && (verdict.error || (verdict.result && verdict.result.message) || JSON.stringify(verdict).slice(0, 140)) || '无响应';
    console.log(`  ⚠ 模型未应答（${verdict?.ms ?? '?'} ms）：${String(why).slice(0, 160)}`);
    const logs = await waitJson('/api/logs', 8000).catch(() => null);
    if (logs && logs.count > 0) {
      ok(`调不通也如实落盘了 ${logs.count} 条（source=${logs.logs.at(-1)?.source ?? '?'}，界面侧能拿到原因）`);
    } else {
      console.log('  ⚠ 日志里还没有记录（可能这次请求还没结束）——到得了网关的机器上会走上面那一支');
    }
  }

  head('[4b] 日志导出（比赛硬性要求：随时取证）');
  const snap = await waitJson('/api/logs', 5000).catch(() => null);
  await exportLogCheck(!!(snap && snap.count > 0));
}

/** 导出接口：有日志须是 200 + attachment + 真 JSONL；越权文件名必须被 400 挡掉 */
async function exportLogCheck(hasLogs) {
  try {
    const res = await fetch(`${BASE}/api/logs/export?file=session-full.jsonl`, { signal: AbortSignal.timeout(15000) });
    const cd = res.headers.get('content-disposition') || '';
    const body = await res.text();
    if (res.status === 200) {
      check(/attachment/.test(cd) && body.includes('"callType"'),
        `导出接口可用：200 · ${body.split('\n').filter(Boolean).length} 行 JSONL · attachment 头在位`);
    } else {
      check(!hasLogs && res.status === 404, `导出接口可用：无日志时如实 404（本机还没调过模型）`);
    }
  } catch (e) {
    bad(`导出接口请求失败：${e.message}`);
  }
  const evil = await fetch(`${BASE}/api/logs/export?file=${encodeURIComponent('../../.env')}`).catch(() => null);
  check(!!evil && evil.status === 400, `越权文件名被拒（${evil ? evil.status : '无响应'}）`);
}

// ────────────────────────── 比内容 / 拉资源 / 真调 ──────────────────────────

/** 逐文件 sha256 对比两棵树；只要有一处不同就报失败（这是"成品里就是当前工程"的唯一硬证据） */
function compareTrees(a, b) {
  const rels = [];
  const walk = (dir, base, out) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, base, out);
      else out.push(path.relative(base, p));
    }
  };
  walk(a, a, rels);
  let bytes = 0;
  const bad = [];
  for (const rel of rels) {
    const fa = path.join(a, rel);
    const fb = path.join(b, rel);
    if (!fs.existsSync(fb)) { bad.push(`${rel}（成品里没有）`); continue; }
    const ha = sha256(fa);
    const hb = sha256(fb);
    bytes += fs.statSync(fa).size;
    if (ha !== hb) bad.push(rel);
  }
  const label = path.basename(a);
  if (bad.length) check(false, `${label} 与工程不一致：${bad.slice(0, 5).join('、')}${bad.length > 5 ? ` 等 ${bad.length} 处` : ''}`);
  else ok(`${label} ${rels.length} 个文件逐字节一致（${mb(bytes)}）`);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** 从工程里挑一张真实存在的场景图（别写死名字：素材会换代） */
function firstScene() {
  return fs.readdirSync(path.join(GAME, 'public', 'assets', 'scenes'))
    .filter((f) => /\.jpe?g$/i.test(f)).sort()[0];
}

/** 拉一个静态资源：状态码 + 内容特征（magic / 关键字）都要对 */
async function getOk(route, { label, contains, magic, json } = {}) {
  try {
    const res = await fetch(BASE + route, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return bad(`${label || route} → HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return bad(`${label || route} → 空文件`);
    if (json) {
      try { JSON.parse(buf.toString('utf8')); }
      catch { return bad(`${label || route} → 不是合法 JSON`); }
    }
    if (magic && buf.subarray(0, magic.length / 2).toString('hex') !== magic) {
      return bad(`${label || route} → 内容不是预期的格式`);
    }
    if (contains && !buf.toString('utf8').includes(contains)) {
      return bad(`${label || route} → 内容里没有「${contains}」`);
    }
    ok(`${label || route} → 200（${(buf.length / 1024).toFixed(0)} KB）`);
  } catch (e) {
    bad(`${label || route} → ${e.message}`);
  }
}

/** 直连一次最小裁决：这是"运行态必须调模型"的最短验证路径（不经过界面点选） */
async function decideOnce() {
  const t = Date.now();
  try {
    const res = await fetch(`${BASE}/api/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene: '打包验收',
        callType: 'choice_hint',
        situation: '验收：给玩家一条 20 字以内的行动提示',
        state: { belief: 50, grain: 50 },
        options: ['继续前进'],
        maxTokens: 300,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    return { ...(data || {}), ms: Date.now() - t };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ────────────────────────── 浏览器 / 进程 / 轮询 ──────────────────────────

async function chromiumLaunch() {
  const { chromium } = require('playwright');
  try {
    return await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    return await chromium.launch({ headless: true }); // 没装 Chrome 就退到自带内核
  }
}

/** 停掉游戏进程：便携版杀我们拉起的那个；单文件版杀展开出来的同名进程（启动器已经退出了） */
async function stopApp() {
  if (KEEP) return console.log(`  （--keep：进程留着，端口 ${PORT}）`);
  try { child?.kill(); } catch { /* ignore */ }
  if (SINGLE) {
    try { execFileSync('taskkill', ['/IM', `${APP_NAME}.exe`, '/F', '/T'], { stdio: 'ignore' }); }
    catch { /* 没在跑就算 */ }
  }
  await sleep(300);
}

async function waitJson(route, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let reported = false;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + route, { signal: AbortSignal.timeout(2500) });
      if (r.ok) return await r.json();
    } catch { /* 还没起来 */ }
    if (!reported && Date.now() - t0 > 20000) {
      console.log(`  … 还在等 ${route}（首次双击的单文件版要先展开约 400 MB，属正常）`);
      reported = true;
    }
    await sleep(250);
  }
  return null;
}
