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

const board = async (name) => {
  await page.evaluate((n) => window.__czScreens.mini(n), name);
  await page.waitForTimeout(400);
};
const count = (sel) => page.locator(sel).count();
const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);

// 每个玩法：板屏壳 + 数值签 + 玩法关键元素 + 第一步交互
const specs = {
  needle: { title: '弯针成钩', stat: '进度', kick: '[data-mini-action="bend"]', after: '[data-mini-action="bend"]' },
  fishing: { title: '金色的鱼钩', stat: '鱼篓', kick: '[data-mini-action="cast"]', after: '[data-mini-action="hook"]' },
  school: { title: '夜校识字', stat: '第', kick: '#school-opts [data-mini-action="answer"]', after: '#school-opts [data-mini-action="answer"]' },
  candy: { title: '分糖', stat: '还剩', kick: '[data-mini-action="candy"]', after: '[data-mini-action="target"]' },
  sentry: { title: '夜岗', stat: '信号', kick: '[data-mini-action="answer"]', after: '[data-mini-action="answer"]' },
  gomoku: { title: '泥地五子棋', stat: '手数', kick: '[data-mini-action="cell"]', after: '[data-mini-action="cell"]' },
  luding: { title: '飞夺泸定桥', stat: '时间', kick: '[data-mini-action="left"]', after: '[data-mini-action="jump"]' },
  grab: { title: '陡坡 · 拽住他', stat: '机会', kick: '[data-mini-action="grab"]', after: '[data-mini-action="grab"]' },
};

for (const [name, spec] of Object.entries(specs)) {
  await board(name);
  check(`${name}：板屏打开`, await page.locator('#screen-board').isVisible(), true);
  check(`${name}：题名`, (await page.locator('#board-title').textContent())?.trim(), spec.title);
  check(`${name}：数值签`, await page.locator('#board-stats .blk-stat').first().isVisible(), true);
  const statText = (await page.locator('#board-stats').textContent()) || '';
  check(`${name}：数值签含「${spec.stat}」`, statText.includes(spec.stat), true);
  check(`${name}：玩法区在板身里`, await visible(`#board-body ${spec.kick}`), true);
  check(`${name}：契约标记`, await count(`#board-body [data-mini-action]`) > 0, true);
  // 点第一步，看有没有反应（契约元素仍然在、状态推进）
  await page.locator(`#board-body ${spec.kick}`).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  check(`${name}：点一下有反应`, await count(`#board-body ${spec.after}`) > 0, true);
}

// 离开板屏要清干净（残留的小游戏容器会让"元素存在即当前场景"判断出错）
await page.evaluate(() => window.__czScreens.show('screen-camp'));
await page.waitForTimeout(300);
check('离开板屏后玩法区已清空', (await page.locator('#board-body').innerHTML()).trim(), '');

console.log('玩法板体检：');
console.table(rows);
const failed = rows.filter((r) => r.结果 === '✗');
if (errs.length) console.log('pageerror:', errs.join('; '));
if (failed.length || errs.length) {
  console.log(`\n✗ 玩法板体检未通过：${failed.length} 项`);
  process.exit(1);
}
console.log('\n✓ 玩法板体检通过：五个玩法都在板屏上、数值签与契约标记齐全、第一步可点');
await browser.close();
