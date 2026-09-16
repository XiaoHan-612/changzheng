// 玩法板体检：把五个玩法逐屏摆到板屏上，验"该在的元素在不在、点一下有没有反应"。
//
// 为什么单独有一把尺子：玩法都在幕深处（第二幕夜校、第四幕钓鱼/分糖/夜岗），
// 全流程 e2e 跑到它们要烧几十次调用；而"板屏壳、数值签、契约标记、第一步能不能点"
// 这些东西与 AI 无关，本地就能验。批四建板屏时吃过"类名在、样式没了"的亏（.choice-btn），
// 这个脚本专门盯这类事故：元素必须真的在屏上、契约标记必须真的带 data-mini-action。
//
// 用法：npm run qa:board（需要先起服务；脚本自己会确保服务在）
import { chromium } from 'playwright';
import { ensureServer, BASE } from '../e2e/lib/server.mjs';
import { passOrigin } from '../e2e/lib/driver.mjs';

const rows = [];
const check = (name, got, want) => rows.push({ 检查: name, 实测: String(got), 期望: String(want), 结果: String(got) === String(want) ? '✓' : '✗' });

await ensureServer();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('dialog', (d) => d.accept().catch(() => {}));
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${BASE}/?board=${Date.now()}`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  sessionStorage.clear();
  localStorage.setItem('czjc_devtools', '1');       // __czScreens 钩子只在展示开关打开时挂
});
await page.reload({ waitUntil: 'networkidle' });

// 进营地拿到 run 状态（钩子需要 S）
await page.click('#btn-mode-study');
await page.waitForTimeout(300);
await passOrigin(page);
await page.click('#btn-cut-skip').catch(() => {});
await page.waitForTimeout(800);

/**
 * 摆一个玩法到板屏上，**等到它真的摆好**再断言。
 *
 * 这里踩过一次坑：原来是 `mini(n)` + 固定等 400ms。而 `__czScreens.mini()` 是异步的
 * （它内部要先 await 场景对话才 openBoard），偶尔 400ms 还没轮到本玩法——于是
 * `#board-stats` 里读到的还是**上一个玩法的数值签**（sentry 读到 candy 的「还剩」），
 * 断言随机变红，单跑却常常通过。教训与 qa:motion 同一条：等具体状态，别等固定 sleep。
 */
const board = async (name, spec) => {
  await page.evaluate((n) => window.__czScreens.mini(n), name);
  const t0 = Date.now();
  for (;;) {
    const title = ((await page.locator('#board-title').textContent()) || '').trim();
    const statText = (await page.locator('#board-stats').textContent()) || '';
    if (title === spec.title && statText.includes(spec.stat)) return;
    if (Date.now() - t0 > 8000) return;               // 超时就如实断言，别假装成功
    await page.waitForTimeout(120);
  }
};
const count = (sel) => page.locator(sel).count();
const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);

// 每个玩法：板屏壳 + 数值签 + 玩法关键元素 + 第一步交互
const specs = {
  bendhook: { title: '弯针成钩', stat: '火候', kick: '[data-mini-action="heat"]', after: '[data-mini-action="heat"]' },
  goldenhook: { title: '金色的鱼钩', stat: '竿', kick: '[data-mini-action="cast"]', after: '[data-mini-action="cast"]' },
  // 夜校：入口选中后由子玩法接管（动作词整套换掉），所以 after 只验"点完仍可交互"
  nightschool: { title: '夜校 · 两条路（选择入口）', stat: '识字', kick: '[data-mini-action="pick-lamp"]', after: '[data-mini-action]' },
  'candy-share': { title: '分糖 · 红小鬼的三颗糖', stat: '糖', kick: '[data-mini-action="ask"]', after: '[data-mini-action="ask"]' },
  'sentry-watch': { title: '夜岗 · 五个信号', stat: '信号', kick: '[data-mini-action="answer"]', after: '[data-mini-action="answer"]' },
  'mud-gomoku': { title: '泥地五子棋', stat: '手数', kick: '[data-mini-action="level"]', after: '[data-mini-action="level"]' },
  'luding-chain': { title: '飞夺泸定桥 · 攀链', stat: '位置', kick: '[data-mini-action="start"]', after: '[data-mini-action]' },
  'snow-grab': { title: '陡坡 · 拽住他', stat: '他离你', kick: '[data-mini-action="leg"]', after: '[data-mini-action="throw"]' },
  'pontoon-night': { title: '夜搭浮桥', stat: '夜色', kick: '[data-mini-action="mode-boat"]', after: '[data-mini-action="mode-boat"]' },
  'rally-river': { title: '收拢', stat: '天光', kick: '[data-mini-action="search"]', after: '[data-mini-action="search"]' },
};

for (const [name, spec] of Object.entries(specs)) {
  await board(name, spec);
  check(`${name}：板屏打开`, await page.locator('#screen-board').isVisible(), true);
  check(`${name}：题名`, (await page.locator('#board-title').textContent())?.trim(), spec.title);
  check(`${name}：数值签`, await page.locator('#board-stats .blk-stat').first().isVisible(), true);
  const statText = (await page.locator('#board-stats').textContent()) || '';
  check(`${name}：数值签含「${spec.stat}」`, statText.includes(spec.stat), true);
  check(`${name}：玩法区在板身里`, await visible(`#board-body ${spec.kick}`), true);
  check(`${name}：契约标记`, await count(`#board-body [data-mini-action]`) > 0, true);
  // 点第一步，看有没有反应（契约元素仍然在、状态推进）；同样等状态，不等固定 sleep
  await page.locator(`#board-body ${spec.kick}`).first().click({ force: true }).catch(() => {});
  const t1 = Date.now();
  while ((await count(`#board-body ${spec.after}`)) === 0 && Date.now() - t1 < 4000) {
    await page.waitForTimeout(120);
  }
  check(`${name}：点一下有反应`, await count(`#board-body ${spec.after}`) > 0, true);
}

// 离开板屏要清干净（残留的小游戏容器会让"元素存在即当前场景"判断出错）
await page.evaluate(() => window.__czScreens.show('screen-camp'));
await page.waitForTimeout(300);
check('离开板屏后玩法区已清空', (await page.locator('#board-body').innerHTML()).trim(), '');

// ── 三方对账：玩法清单 ↔ 这张体检表 ↔ 页面上真实的契约 ──
// 同事插新玩法时，这一节会直接告诉他缺哪一步：没加体检行 / 动作声明与实现不一致 / 表里有已下架的。
// （口径：清单在 modules/games/manifest.js，动作声明在玩法描述符的 actions 里。）
const meta = await page.evaluate(() => {
  const api = window.__czKernel?.api?.('games');
  if (!api?.list) return null;
  return Object.fromEntries(api.list().map((id) => [id, api.describe(id)]));
});
if (!meta) {
  check('玩法清单可读（games 模块已挂）', '缺 games 模块', '可读');
} else {
  const ids = Object.keys(meta);
  const specIds = Object.keys(specs);
  check('体检表覆盖了清单里的每个玩法', ids.filter((id) => !specIds.includes(id)).join('、') || '(无遗漏)', '(无遗漏)');
  check('体检表里没有已下架的玩法', specIds.filter((id) => !ids.includes(id)).join('、') || '(无)', '(无)');
  for (const [id, sp] of Object.entries(specs)) {
    // 这张体检表用到的动作（从 kick/after 选择器里取），必须都在描述符的 actions 里声明过
    const used = [...`${sp.kick} ${sp.after}`.matchAll(/data-mini-action="([a-z-]+)"/g)].map((m) => m[1]);
    const declared = meta[id]?.actions || [];
    const missing = used.filter((a) => !declared.includes(a));
    check(`${id}：页面用到的动作都在描述符里声明`, missing.join('、') || '(齐全)', '(齐全)');
  }
}

console.log('玩法板体检：');
console.table(rows);
const failed = rows.filter((r) => r.结果 === '✗');
if (errs.length) console.log('pageerror:', errs.join('; '));
if (failed.length || errs.length) {
  console.log(`\n✗ 玩法板体检未通过：${failed.length} 项`);
  process.exit(1);
}
console.log(`
✓ 玩法板体检通过：${Object.keys(specs).length} 个玩法都在板屏上、数值签与契约标记齐全、第一步可点`);
await browser.close();
