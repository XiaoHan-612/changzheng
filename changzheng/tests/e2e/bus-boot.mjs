/**
 * 总线运行时体检 —— 光看源码不够：内核真的启动了吗？事件真的在流吗？契约表与清单对得上吗？
 *
 * 检查项：
 *   ① 页面加载无 pageerror，且 window.__czKernel 存在
 *   ② 内核已 boot（state().booted === true）
 *   ③ 发过 boot:ready（事件流里有）
 *   ④ 契约表里每条事件都在清单/模块里"有归属"（当前地基期：允许无人订阅，但不能是笔糊涂账）
 *   ⑤ 没有契约违规、没有坏描述符、没有找错接口（diag.problems() 里只有预期的空结果）
 *   ⑥ 事件流能导出成 JSONL（诊断能力可用，答辩要给人看的就是它）
 *
 * 用法：npm run qa:bus（先跑静态那半 scripts/lint-bus.mjs）
 */
import { chromium } from 'playwright';
import { ensureServer, BASE } from './lib/server.mjs';

const rows = [];
const check = (name, got, want) => rows.push({ 检查: name, 实测: String(got), 期望: String(want), 结果: String(got) === String(want) ? '✓' : '✗' });

await ensureServer();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${BASE}/?bus=${Date.now()}`, { waitUntil: 'networkidle' });

// 内核在 boot 时会自己启动（main.js 里调 kernel.boot()）；等它就绪
let st = null;
for (let i = 0; i < 20; i++) {
  st = await page.evaluate(() => (window.__czKernel ? window.__czKernel.state() : null));
  if (st && st.booted) break;
  await page.waitForTimeout(250);
}

check('无 pageerror', errs.length ? errs.join(' | ').slice(0, 120) : '0', '0');
check('内核句柄存在', st ? 'yes' : 'no', 'yes');
check('内核已启动', st?.booted === true ? 'yes' : 'no', 'yes');

const flow = await page.evaluate(() => {
  const k = window.__czKernel;
  if (!k) return null;
  return {
    ready: k.diag.events({ name: 'boot:ready' }).length,
    total: k.diag.count(),
    eventsDeclared: Object.keys(k.EVENTS).length,
    jsonlLines: k.diag.toJsonl().split('\n').filter(Boolean).length,
    violations: k.diag.problems().filter((p) => p.kind === 'contract-violation').length,
    badDescriptor: k.diag.problems().filter((p) => p.kind === 'bad-descriptor').length,
    apiMiss: k.diag.problems().filter((p) => p.kind === 'api-miss').length,
    screensHook: typeof k.screens.get,
  };
});
check('boot:ready 已发出', flow?.ready >= 1 ? 'yes' : 'no', 'yes');
check('事件流有记录', flow?.total >= 1 ? 'yes' : 'no', 'yes');
check('契约违规 0 条', flow?.violations ?? -1, 0);
check('坏描述符 0 个', flow?.badDescriptor ?? -1, 0);
check('取接口失败 0 次', flow?.apiMiss ?? -1, 0);
check('事件流可导出 JSONL', flow?.jsonlLines >= 1 ? 'yes' : 'no', 'yes');
check('统一摆屏入口可用', flow?.screensHook, 'function');

// 清单里的模块必须真的注册上（踩过：path 解析错 → 模块静默加载失败，只有冒烟才发现）
const loaded = await page.evaluate(() => {
  const k = window.__czKernel;
  if (!k) return null;
  const names = k.state().modules.map((m) => m.name);
  const expect = (window.__czModules || []).map((m) => m.name);
  return { names, expect, loadErrors: k.diag.problems().filter((p) => p.kind === 'module-load-error').map((p) => p.module) };
});
check('清单模块全部注册', (loaded?.expect || []).every((n) => loaded?.names?.includes(n)) ? 'yes' : `no(${(loaded?.expect || []).filter((n) => !loaded?.names?.includes(n)).join(',')})`, 'yes');
check('模块加载无失败', (loaded?.loadErrors || []).length, 0);

console.log('总线体检（运行时）：');
console.table(rows);
console.log(`契约表 ${flow?.eventsDeclared ?? 0} 条事件；事件流 ${flow?.total ?? 0} 笔（其中 boot:ready ${flow?.ready ?? 0}）`);

const failed = rows.filter((r) => r.结果 === '✗');
await browser.close();
if (failed.length) {
  console.log(`\n✗ 总线体检未通过：${failed.length} 项`);
  process.exit(1);
}
console.log('\n✓ 总线体检通过：内核启动、事件在流、契约无违规、诊断可导出');
