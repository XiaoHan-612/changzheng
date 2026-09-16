/**
 * 开发快检 —— **批次与批次之间**跑的那一把尺子，目标 10 秒内出结果。
 *
 * 它和验收的关系（三层，别混用）：
 *   npm run dev:check     改一处就想知道"有没有把东西碰坏" —— 静态 3 项 + 一次浏览器，0 真调，~7s
 *   npm run verify:fast   提交前扫一遍（unit/守卫/总线/动效/玩法板/音频/素材），并行，~30s
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
      appReady: kk.diag.events({ name: 'app:ready' }).length,
      events: kk.diag.count(),
      violations: kind('contract-violation'),
      badDescriptor: kind('bad-descriptor'),
      apiMiss: kind('api-miss'),
      loadErrors: problems.filter((p) => p.kind === 'module-load-error').map((p) => p.module),
      // 内核会"捕获并跳过"模块 init/ready 抛的错——不报错、不崩，功能却静默少一块。
      // 批 A 就踩过：audio 的 ready 抛了一句 TypeError，声音照响，但开播/进度/收尾事件全没了。
      softErrors: problems
        .filter((p) => ['init-error', 'ready-error', 'subscriber-error'].includes(p.kind))
        .map((p) => `${p.kind} ${p.module || p.event || ''} ${p.message || ''}`.trim()),
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
  // 组合根也要报"整页就绪"：脚本与将来的启动期演出都靠它，缺了会让"谁先谁后"变成竞态（坑 54）
  assert(k.appReady >= 1, '没发出 app:ready —— 组合根没跑到收尾（脚本会早于首屏动手）');
  assert(k.violations === 0, `契约违规 ${k.violations} 条（事件没按 contracts.js 带字段）`);
  assert(k.badDescriptor === 0, `坏描述符 ${k.badDescriptor} 个`);
  assert(k.apiMiss === 0, `取接口失败 ${k.apiMiss} 次`);
  assert(k.loadErrors.length === 0, `模块加载失败：${k.loadErrors.join('、')}（wiring.js 里的路径写错了？）`);
  assert(k.softErrors.length === 0, `模块 init/ready/订阅者抛错（内核已跳过，功能会静默少一块）：${k.softErrors.join('；')}`);
  const missing = k.expected.filter((n) => !k.registered.includes(n));
  assert(missing.length === 0, `清单里的模块没注册上：${missing.join('、')}`);
  assert(k.snapshotProvided && k.snapshotFrozen, '只读快照没接上或没冻结');
  assert(k.heldLocks === 0, `启动后还占着锁：${k.heldLocks} 把`);

  // 「临时插一行」（模型失败时的重试/跳过）会插到哪儿？落到 <section class="screen"> 就会被
  // 背景层（position:absolute; inset:0）盖住 = 看得见点不到——终局的重试键就这么废过。
  // 这里用真实现 __czScreens.face() 逐屏核对，不在脚本里抄一份选择器。
  const faces = await page.evaluate(() => {
    const api = window.__czScreens;
    if (!api?.face) return [{ 屏: '(没有 __czScreens.face)', 落到: '(缺)', 危险: true }];
    return [...document.querySelectorAll('.screen')].map((sec) => {
      const face = api.face(sec);
      const bg = [...sec.children].some((c) => {
        const cs = getComputedStyle(c);
        return cs.position === 'absolute' && (cs.inset === '0px' || cs.zIndex !== 'auto');
      });
      return { 屏: sec.id, 落到: face === sec ? '(退回 section)' : (face.id || face.className.split(' ')[0]), 危险: face === sec && bg };
    });
  });
  const risky = faces.filter((f) => f.危险).map((f) => f.屏);
  assert(!risky.length, `这些屏插行会落到 section、被背景层盖住：${risky.join('、')}`);

  // 批 5 新挂的"调用流"链路：发一条事件，ai 模块要收到（事件名/接线写错在这里就露头，0 真调）
  const fed = await page.evaluate(() => {
    const k = window.__czKernel;
    k.emit('ai:feed', { entry: { callType: 'devcheck', model: 'probe', ms: 0, snippet: '冒烟' } });
    return k.api('ai')?.recent(1)?.[0]?.callType || '';
  });
  assert(fed === 'devcheck', `ai:feed 没有被 ai 模块收到（实测「${fed || '空'}」）——事件名或接线写错了？`);

  return `${k.registered.length} 个模块 · 事件流 ${k.events} 笔 · 全屏可插行 · 调用流链通`;
});

await step('开局到营地', async () => {
  assert(!bail, '上一步没过');
  const before = errs.length;
  await page.click('#btn-mode-study');
  await page.waitForTimeout(150);
  // passOrigin 现在连过场一起清（序章/幕间都是过场屏，见 tests/e2e/lib/driver.mjs）——
  // 这里**不要**再补一次 `click('#btn-cut-skip')`：按钮此时已经不可见，
  // Playwright 会按默认 30s 死等超时才抛错，白白把 8 秒的快检拖成 38 秒（2026-09-15 实测）。
  await passOrigin(page);
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

  // HUD 读数必须等于存档：出身/开场问答改的是五维资源，写路一旦绕过状态模块就不会广播，
  // HUD 会停在旧数字上（实测选完出身：存档体力 72→77，界面还写着 72）。这条断言守的就是那一类。
  const drift = await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem('czjc_demo_state_v1') || 'null');
    const hud = (document.getElementById('stats') || {}).textContent || '';
    if (!s) return ['读不到存档'];
    return ['体力', '粮食', '士气', '信念', '民心']
      .filter((k) => !hud.includes(`${k}${s[k]}`))
      .map((k) => `${k}: 存档 ${s[k]}，HUD 里没有`);
  });
  assert(!drift.length, `HUD 与存档对不上（说明有写入没广播）——${drift.join('；')}`);
  assert(errs.length === before, `这一步新增报错：${errs.slice(before).join(' | ')}`);
  return `热点 ${camp.hotspots} 个 · 行程 ${camp.journey} 节 · HUD 与存档一致`;
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

await step('输入框不吃快捷键', async () => {
  assert(!bail, '上一步没过');
  // 全局顺手键（1–9 选项、J 手记）必须让开输入框：设置里的地址含 j 是常态，
  // 沙盘里写行动也常带数字——抢键的后果是"打个字弹出浮层、顺手点掉底下的选项"。
  await page.evaluate(() => document.getElementById('btn-settings').click());
  await page.waitForTimeout(150);
  await page.click('#set-url');
  const valBefore = await page.inputValue('#set-url');
  await page.keyboard.type('j8', { delay: 30 });
  const typed = await page.evaluate(() => ({
    val: document.getElementById('set-url').value,
    journal: !document.getElementById('screen-journal').classList.contains('hidden'),
  }));
  assert(typed.val.includes('j8') && typed.val.length === valBefore.length + 2,
    `在输入框里打的字没有原样进去（前 "${valBefore}" → 后 "${typed.val}"）`);
  assert(!typed.journal, '在输入框里打 j 弹出了「手记」浮层（快捷键没让开输入框）');
  // Esc 是浏览器惯例：在输入框里也要能关浮层
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const closed = await page.evaluate(() => document.getElementById('screen-settings').classList.contains('hidden'));
  assert(closed, 'Esc 在输入框里关不掉浮层（这条是浏览器惯例，不该被输入判定连坐）');
  return '打字不进浮层 · Esc 仍可关';
});

await step('终局失败也不空屏', async () => {
  assert(!bail, '上一步没过');
  // 把 /api/decide 打回失败，逼出「模型没返回终局总评」这条路：界面该明说 + 给重试，而不是空壳结算。
  await page.route('**/api/decide', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"dev-check 故意失败"}' }));
  await page.evaluate(() => window.__czScreens.end());
  await page.waitForSelector('[data-action="ai-skip"]', { timeout: 15000 });
  // 关键：这个键必须**真的点得到**。屏的背景层是 position:absolute; inset:0，
  // 交互行一旦插错地方就会被它盖住——看得见、点不到，玩家永远卡在"结算中…"（真踩过）。
  const reachable = await page.evaluate(() => {
    const b = document.querySelector('[data-action="ai-skip"]');
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return { ok: top === b || b.contains(top), top: top ? (top.id || top.className) : '(null)' };
  });
  assert(reachable.ok, `「跳过」键被盖住了（该点最上层是 ${reachable.top}）——玩家点不动`);
  await page.click('[data-action="ai-skip"]');
  await page.waitForTimeout(400);
  const end = await page.evaluate(() => ({
    title: (document.getElementById('end-title').textContent || '').trim(),
    paras: (document.getElementById('end-paras').textContent || '').trim(),
    retry: !!document.querySelector('[data-action="end-retry"]'),
    rel: (document.getElementById('end-rel').textContent || '').trim().length,
  }));
  await page.unroute('**/api/decide');
  assert(end.title === '结算未完成', `终局失败时标题是「${end.title}」，应该是「结算未完成」`);
  assert(end.paras.length >= 20, '终局失败时没有给出任何说明（玩家只看到空屏）');
  assert(end.retry, '终局失败时没有「重新结算」的入口');
  assert(end.rel > 0, '终局失败时连本局关系都没渲染（这部分不依赖模型）');
  return '键点得到 · 明说 + 可重试 · 关系照旧';
});

await step('升华可跳过且不阻塞', async () => {
  assert(!bail, '上一步没过');
  // 终章升华是**整屏自动播**（会宁空镜 → 诗八句逐字 → 钤印）：它最长、最像"会卡住流程"的一段，
  // 所以这里单独验三件事：① 诗真的挂上来了（题字 + 八句 + 语速键）；
  // ② 「跳过」一跳到底、Promise 很快落地；③ 收尾干净（按钮上的契约标记摘掉，不会让后面的自动化点错东西）。
  const played = page.evaluate(() => window.__czKernel.api('cinema').play('ending-poem'));
  const up = Date.now();
  for (;;) {
    const ok = await page.evaluate(() => document.querySelectorAll('.poem-line .poem-ch').length >= 56);
    if (ok) break;
    if (Date.now() - up > 10000) throw new Error('升华 10 秒内没把诗挂上来（题字/八句/逐字 span 都不在）');
    await page.waitForTimeout(100);
  }
  const form = await page.evaluate(() => ({
    title: (document.querySelector('.poem-title')?.textContent || '').trim(),
    lines: document.querySelectorAll('.poem-line').length,
    chars: document.querySelectorAll('.poem-ch').length,
    speed: !document.getElementById('btn-cut-speed').classList.contains('hidden'),
  }));
  assert(form.lines === 8, `诗应该有 8 句，实际 ${form.lines}`);
  assert(form.chars >= 56, `八字句的逐字 span 只有 ${form.chars} 个`);
  assert(form.title.includes('七律'), `诗题不对：${form.title}`);
  assert(form.speed, '诗那一拍没有露出语速键');

  const t = Date.now();
  await page.click('#btn-cut-skip');
  const r = await played;
  const ms = Date.now() - t;
  assert(r && r.skipped === true, `跳过之后 play() 没有如实返回：${JSON.stringify(r)}`);
  assert(ms < 4000, `跳过用了 ${ms}ms——一跳到底必须是"立刻"，不能等它演完`);
  const clean = await page.evaluate(() => ['btn-cut-next', 'btn-cut-skip', 'btn-cut-speed']
    .every((id) => !document.getElementById(id).dataset.action));
  assert(clean, '过场结束后按钮上的 data-action 契约标记没摘干净（会让后面的自动化点错）');
  return `八句 ${form.chars} 字挂得上 · 跳过 ${ms}ms · 收尾干净`;
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
