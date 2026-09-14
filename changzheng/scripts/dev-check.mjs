/**
 * 开发快检 —— **批次与批次之间**跑的那一把尺子，目标 10 秒内出结果。
 *
 * 它和验收的关系（三层，别混用）：
 *   npm run dev:check     改一处就想知道"有没有把东西碰坏" —— 静态 3 项 + 一次浏览器，0 真调，~7s
 *   npm run verify:fast   提交前扫一遍（unit/守卫/总线/动效/玩法板/音频/素材），并行，~30s
 *   npm run verify:full   真调那一档（e2e/av/sandbox/…），分钟级，推送与交付前跑
 *
 * 为什么单独有一个"开发档"：验收那两档要么太慢、要么各自起浏览器；而日常真正的需求只有三件：
 *   ① 架构规矩有没有被破坏（跨模块 import、事件没登记、订阅写错地方）
 *   ② 纯逻辑有没有被改坏（state/契约/平衡）
 *   ③ 页面还起不起得来（脚本报错、内核没 boot、屏打不开、玩法板挂不上）
 * 前两件不用浏览器，第三件一个浏览器一次走完。**不真调**：本档只走到"营地 + 玩法板"，
 * 这条路径按设计不碰模型（玩法板体检也是这么验的）。
 *
 * 用法：
 *   npm run dev:check            快检（默认无头）
 *   npm run dev:check -- --headed   开个窗口看着跑
 *   npm run dev:check -- --mins=gomoku,grab   玩法板那一步换一批（默认抽查 needle / sentry）
 *   node scripts/dev-check.mjs --port=3399
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--headed');
// 专用端口：验收那两档用 3200+，这里固定 3399，免得两边互相踢。
// 必须在 import 测试库之前设好——server.mjs 是在模块加载时读 PORT 的。
const portArg = process.argv.find((a) => a.startsWith('--port='));
process.env.PORT = portArg ? portArg.split('=')[1] : (process.env.PORT || '3399');
const { ensureServer, BASE, PORT } = await import('../tests/e2e/lib/server.mjs');
const { passOrigin } = await import('../tests/e2e/lib/driver.mjs');

const t0 = Date.now();
const steps = [];
let bail = '';

/** 跑一步，单独计时；抛错即记为失败并把原因留在 err 上 */
async function step(name, fn) {
  const s = Date.now();
  try {
    const note = await fn();
    steps.push({ name, ms: Date.now() - s, ok: true, note: note || '' });
  } catch (e) {
    steps.push({ name, ms: Date.now() - s, ok: false, err: String(e?.message || e) });
    if (name.startsWith('内核启动')) bail = '页面都起不来，后面的检查没有意义，先修这个';
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/** 跑一条命令行子步骤（静态检查），失败就把它的输出尾部带出来 */
function runCli(name, args, { hint } = {}) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n');
    throw new Error(`${hint || name} 退出码 ${r.status}\n      ` + out.slice(-10).join('\n      '));
  }
  return (r.stdout || '').trim().split('\n').pop() || '';
}

// ─── 静态三项（不用浏览器，先后无所谓，但很快）─────────────────────────
await step('总线静态规则', () => {
  runCli('总线静态规则', ['scripts/lint-bus.mjs'], { hint: '跨模块 import / 事件未登记 / 订阅写错地方' });
  return '不动模块边界';
});

await step('单元测试', () => {
  const files = fs.readdirSync(path.join(ROOT, 'tests', 'unit'))
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.join('tests', 'unit', f));
  assert(files.length, 'tests/unit 下一个测试文件都没有？');
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status !== 0) {
    const bad = out.split('\n').filter((l) => /^(not ok|✖|✗)/.test(l.trim())).slice(0, 8);
    throw new Error(`${files.length} 个文件里有失败：\n      ` + (bad.join('\n      ') || out.split('\n').slice(-8).join('\n      ')));
  }
  // node --test 的报数两种写法都认：tap 是 "# pass 12"，spec 是 "ℹ pass 12"
  const pass = (out.match(/^[#ℹ]\s*pass (\d+)/m) || [])[1];
  return `${files.length} 个文件 · ${pass || '?'} 项通过`;
});

await step('文档与代码一致', () => {
  runCli('文档一致性', ['scripts/check-handoff.mjs'], { hint: '文档写的与实际不符（命令、路径、事件表）' });
  return '命令表/模块地图对得上';
});

// ─── 一次浏览器走完页面侧 ────────────────────────────────────────────
const browser = await (async () => {
  // 端口上如果蹲着一个上次留下的服务，先请走：它可能带着旧的 LOG_DIR / 旧环境，
  // 早先就吃过"复用旧进程 → 测出来的绿色是假绿"（见 tests/e2e/lib/server.mjs 的注释）。
  killListener(PORT);
  await ensureServer();
  return chromium.launch({ headless: !HEADED, channel: 'chrome' });
})();

/** 按端口杀掉监听进程（Windows 用 netstat，别处的 test 目录已有同款逻辑，这里只求稳） */
function killListener(port) {
  try {
    const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
    const pids = new Set(out.split('\n')
      .filter((l) => /LISTENING/i.test(l) && new RegExp(`:${port}\\s`).test(l))
      .map((l) => l.trim().split(/\s+/).pop())
      .filter((p) => /^\d+$/.test(p) && Number(p) !== process.pid));
    for (const p of pids) { try { process.kill(Number(p)); } catch { /* 已经没了 */ } }
    return pids.size;
  } catch {
    return 0;
  }
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('dialog', (d) => d.accept().catch(() => {}));

await step('内核启动', async () => {
  await page.goto(`${BASE}/?devcheck=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.setItem('czjc_devtools', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  if (errs.length) throw new Error(`页面报错 ${errs.length} 处：${errs.slice(0, 3).join(' | ')}`);

  const k = await page.evaluate(() => {
    const kk = window.__czKernel;
    if (!kk) return null;
    const st = kk.state();
    const problems = kk.diag.problems();
    const kind = (n) => problems.filter((p) => p.kind === n).length;
    return {
      booted: st.booted,
      ready: kk.diag.events({ name: 'boot:ready' }).length,
      events: kk.diag.count(),
      violations: kind('contract-violation'),
      badDescriptor: kind('bad-descriptor'),
      apiMiss: kind('api-miss'),
      loadErrors: problems.filter((p) => p.kind === 'module-load-error').map((p) => p.module),
      registered: st.modules.map((m) => m.name),
      expected: (window.__czModules || []).map((m) => m.name),
      snapshotFrozen: Object.isFrozen(kk.snapshot.get()),
      snapshotProvided: kk.snapshot.has(),
      heldLocks: Object.keys(kk.resources.held()).length,
    };
  });
  assert(k, '页面加载完了但 window.__czKernel 不在——多半是某个 js 报错让入口没跑起来（先硬刷新清缓存）');
  assert(k.booted, '内核没 boot（main.js 里 kernel.boot() 没跑到？）');
  assert(k.ready >= 1, '没发出 boot:ready —— 事件总线没起来');
  assert(k.violations === 0, `契约违规 ${k.violations} 条（事件没按 contracts.js 带字段）`);
  assert(k.badDescriptor === 0, `坏描述符 ${k.badDescriptor} 个`);
  assert(k.apiMiss === 0, `取接口失败 ${k.apiMiss} 次`);
  assert(k.loadErrors.length === 0, `模块加载失败：${k.loadErrors.join('、')}（wiring.js 里的路径写错了？）`);
  const missing = k.expected.filter((n) => !k.registered.includes(n));
  assert(missing.length === 0, `清单里的模块没注册上：${missing.join('、')}`);
  assert(k.snapshotProvided && k.snapshotFrozen, '只读快照没接上或没冻结');
  assert(k.heldLocks === 0, `启动后还占着锁：${k.heldLocks} 把`);
  return `${k.registered.length} 个模块 · 事件流 ${k.events} 笔 · 快照已冻结`;
});

await step('开局到营地', async () => {
  assert(!bail, '上一步没过');
  const before = errs.length;
  await page.click('#btn-mode-study');
  await page.waitForTimeout(150);
  await passOrigin(page);
  await page.click('#btn-cut-skip').catch(() => { /* 过场可能已经自己走完 */ });
  await page.waitForTimeout(300);

  const camp = await page.evaluate(() => ({
    visible: !document.getElementById('screen-camp').classList.contains('hidden'),
    step: document.body.dataset.step || '',
    hotspots: document.querySelectorAll('#hotspots .hotspot').length,
    journey: document.querySelectorAll('.j-node').length,
    locks: Object.keys(window.__czKernel.resources.held()).length,
  }));
  assert(camp.visible, '开局后没进营地屏');
  assert(camp.hotspots >= 3, `营地热点只有 ${camp.hotspots} 个（该有 3 个以上）`);
  assert(camp.journey >= 5, `行程节点只有 ${camp.journey} 个`);
  assert(camp.locks === 0, `进营地流程结束后还占着 ${camp.locks} 把锁（withLock 没释放）`);
  assert(errs.length === before, `这一步新增报错：${errs.slice(before).join(' | ')}`);
  return `热点 ${camp.hotspots} 个 · 行程 ${camp.journey} 节 · step=${camp.step || '?'}`;
});

await step('玩法板挂得上', async () => {
  assert(!bail, '上一步没过');
  // 抽查两个代表，不是全量八个：needle 有分步状态、sentry 有数值签与多处置键，
  // 这两条足以看出"宿主 + 契约标记 + 板屏壳"有没有被碰坏。全量（8 个 / 57 项）在 qa:board。
  const mins = (process.argv.find((a) => a.startsWith('--mins=')) || '').split('=')[1];
  const ids = mins ? mins.split(',').map((s) => s.trim()).filter(Boolean) : ['needle', 'sentry'];
  const results = [];
  for (const id of ids) {
    await page.evaluate((n) => window.__czScreens.mini(n), id);
    // 等状态，不等固定 sleep：mini() 是异步的（内部先 await 对话），睡 400ms 会读到上一个玩法的残留
    const s = Date.now();
    for (;;) {
      const ok = await page.evaluate(() => {
        const stats = document.getElementById('board-stats');
        return !document.getElementById('screen-board').classList.contains('hidden')
          && !!document.querySelector('#board-body [data-mini-action]')
          && !!stats && stats.textContent.trim().length > 0;
      });
      if (ok) break;
      if (Date.now() - s > 8000) throw new Error(`玩法 ${id} 8 秒内没摆上来（板屏没开 / 数值签没数 / 契约标记没有）`);
      await page.waitForTimeout(100);
    }
    const before = await page.locator('#board-body [data-mini-action]').count();
    await page.locator('#board-body [data-mini-action]').first().click({ force: true });
    await page.waitForTimeout(250);
    const stillThere = await page.locator('#board-body [data-mini-action]').count();
    assert(stillThere > 0, `玩法 ${id} 点第一步后契约标记全没了（玩法区被清空 / 报错挂掉）`);
    results.push(`${id}(契约 ${before}→${stillThere})`);
  }
  // 离开板屏必须清干净：残留容器会让"元素在即当前场景"的判断出错
  await page.evaluate(() => window.__czScreens.show('screen-camp'));
  await page.waitForTimeout(200);
  const left = await page.evaluate(() => ({
    body: document.getElementById('board-body').innerHTML.trim(),
    locks: Object.keys(window.__czKernel.resources.held()).length,
  }));
  assert(left.body === '', '离开板屏后玩法区还有残留节点');
  assert(left.locks === 0, `离开板屏后还占着 ${left.locks} 把锁`);
  return results.join(' · ');
});

await step('全程无报错', async () => {
  assert(!bail, '上一步没过');
  assert(errs.length === 0, `整轮共 ${errs.length} 处报错：${errs.slice(0, 3).join(' | ')}`);
  return '0 处';
});

await browser.close();

// ─── 报告 ───────────────────────────────────────────────────────────
const failed = steps.filter((s) => !s.ok);
const total = ((Date.now() - t0) / 1000).toFixed(1);
console.log('开发快检：');
for (const s of steps) {
  const mark = s.ok ? '✓' : '✗';
  const tail = s.ok ? (s.note ? `  ${s.note}` : '') : '';
  console.log(`  ${mark} ${s.name.padEnd(7, '　')} ${(s.ms / 1000).toFixed(1)}s${tail}`);
  if (!s.ok) console.log(`      ${s.err}`);
}
if (bail && failed.length) console.log(`\n提示：${bail}`);
console.log(failed.length
  ? `\n✗ 开发快检未通过（${failed.length}/${steps.length} 步，${total}s）`
  : `\n✓ 开发快检通过：${steps.length} 步／${total}s（0 次真调）`);
console.log('提交前再跑 `npm run verify:fast`，推送前跑 `npm run verify:full`（真调那档）');
process.exit(failed.length ? 1 : 0);
