// 动效体检：逐个量"动画到底有没有挂上"。
//
// 为什么需要它：动效是随时间发生的，截图拍不到——上一轮就吃过"关键帧定义齐了、类一个没挂"
// 的亏（五个标准效果里只有 ember / seal-stamp / fade-in 真在跑）。这里量的是**计算样式**：
// animation-name 是不是预期值、逐条入场的延迟是不是 0/60/120ms、减动效偏好下是不是全关。
//
// 用法：npm run qa:motion
import { chromium } from 'playwright';
import { ensureServer, BASE } from '../e2e/lib/server.mjs';
import { passOrigin } from '../e2e/lib/driver.mjs';

await ensureServer();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('dialog', (d) => d.accept().catch(() => {}));
await page.goto(`${BASE}/?motion=${Date.now()}`, { waitUntil: 'networkidle' });
await page.evaluate(() => sessionStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

const rows = [];
const check = (name, got, want) => rows.push({ 检查: name, 实测: got, 期望: want, 结果: String(got) === String(want) ? '✓' : '✗' });

/** 读某元素的计算动画信息 */
const animOf = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return '(缺元素)';
  const cs = getComputedStyle(el);
  return `${cs.animationName} ${cs.animationDelay}`;
}, sel);

// ① 封面入场（tpl-title → anim-fade）
check('封面入场', await animOf('#screen-title .title-card'), 'fade-in 0s');

// ② 进行中：过场那一刻的"换幕抹擦"
await page.click('#btn-mode-study');
await page.waitForTimeout(250);
await passOrigin(page);
let wipeSeen = '否';
for (let i = 0; i < 20; i++) {                       // 抹擦层只存活 ~0.6s，边等边看
  if (await page.locator('.scene-wipe').count()) { wipeSeen = '是'; break; }
  await page.waitForTimeout(60);
}
check('换幕抹擦出现', wipeSeen, '是');
await page.click('#btn-cut-skip').catch(() => {});
await page.waitForTimeout(1200);

// ③ 营地：热点余烬 + 侧栏入场（tpl-side → anim-fade）
check('营地余烬', await animOf('#hotspots .hotspot .ember'), 'ember 0s');
check('营地侧栏入场', await animOf('#screen-camp .hud-left'), 'fade-in 0s');
check('微视差已绑定', await page.evaluate(() => {
  const el = document.querySelector('#screen-camp .pano-img');
  if (!el) return '(缺元素)';
  const before = el.style.transform;
  el.dispatchEvent(new Event('pointermove', { bubbles: true }));
  return before !== el.style.transform || getComputedStyle(el).transitionProperty.includes('transform') ? '是' : '否';
}), '是');

// ④ 舞台：点"浮桥"热点（走到真正的抉择屏，交谈屏的快捷问句不算）→ 正文墨显 + 选项逐条入场
await page.locator('.hotspot').filter({ hasText: '浮桥' }).click({ force: true });
for (let i = 0; i < 30; i++) {
  if (await page.locator('#ch-opts .blk-choice').count()) break;
  await page.waitForTimeout(400);
}
check('舞台入场（纸卷上滑）', await animOf('#screen-stage .sheet'), 'sheet-rise 0s');
check('正文墨显', await animOf('#stage-panel'), 'ink-in 0s');
check('选项第 1 条延迟', await page.evaluate(() => {
  const c = document.querySelector('#ch-opts > *');
  return c ? getComputedStyle(c).animationDelay : '(缺选项)';
}), '0s');
check('选项第 2 条延迟', await page.evaluate(() => {
  const c = document.querySelector('#ch-opts > *:nth-child(2)');
  return c ? getComputedStyle(c).animationDelay : '(缺选项)';
}), '0.06s');

// ⑤ 回响：印章钤印 + 两栏逐条入场
await page.locator('#ch-opts .blk-choice').first().click({ force: true });
for (let i = 0; i < 40; i++) {
  if (await page.locator('#btn-continue').count()) break;
  await page.waitForTimeout(400);
}
await page.locator('#btn-continue').click({ force: true }).catch(() => {});
for (let i = 0; i < 40; i++) {                        // 回响层打开前可能还有一次裁决
  if (await page.locator('#screen-echo').isVisible().catch(() => false)) break;
  await page.waitForTimeout(300);
}
await page.waitForTimeout(400);
check('回响印章钤印', await animOf('#screen-echo .echo-seal'), 'seal-stamp 0.12s');
check('回响两栏逐条', await animOf('#screen-echo .echo-grid > *:nth-child(2)'), 'ink-in 0.06s');

// ⑥ 减动效偏好：位移类全部关掉，只留淡入（这是文档写明的降级口径）
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const calm = await page.evaluate(() => {
  const scale = getComputedStyle(document.documentElement).getPropertyValue('--motion-scale').trim();
  const card = document.querySelector('#screen-title .title-card');
  const fadeName = getComputedStyle(card).animationName;
  card.classList.add('anim-rise');                 // 临时挂上"上滑"，看媒体查询有没有把它关掉
  const riseName = getComputedStyle(card).animationName;
  card.classList.remove('anim-rise');
  return { scale, fadeName, riseName };
});
check('减动效：位移类被关掉', calm.riseName, 'none');
check('减动效：淡入仍保留', calm.fadeName, 'fade-in');

// 循环/装饰动画（余烬、钤印）必须在**组件层**关掉：写在 framework.css 里会被后加载的组件层盖掉，
// 曾因此"写了不生效"（2026-09-13 修）。这里造两个临时节点量计算样式——比翻样式表可靠。
const calmLoop = await page.evaluate(() => {
  const hotspot = document.createElement('div');
  hotspot.className = 'hotspot';
  const ember = document.createElement('span');
  ember.className = 'ember';
  hotspot.appendChild(ember);
  const seal = document.createElement('div');
  seal.className = 'blk-seal echo-seal';
  document.body.append(hotspot, seal);
  const out = { ember: getComputedStyle(ember).animationName, seal: getComputedStyle(seal).animationName };
  hotspot.remove();
  seal.remove();
  return out;
});
check('减动效：余烬停摆', calmLoop.ember, 'none');
check('减动效：钤印停摆', calmLoop.seal, 'none');

console.log('动效体检（量的是计算样式）：');
console.table(rows);
console.log(`减动效偏好：--motion-scale=${calm.scale}　（位移关、只留淡入，符合文档口径）`);

const failed = rows.filter((r) => r.结果 === '✗');
if (failed.length) {
  console.log(`\n✗ 动效体检未通过：${failed.length} 项`);
  for (const f of failed) console.log(`  ✗ ${f.检查}：实测 ${f.实测}，期望 ${f.期望}`);
  process.exit(1);
}
console.log('\n✓ 动效体检通过：五个标准效果都挂在实际页面上');
await browser.close();
