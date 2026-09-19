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
await page.evaluate(() => {
  sessionStorage.clear();
  // 展示开关打开：玩法板那一屏要走 __czScreens.mini（玩法都在幕深处，跑一整幕太贵）。
  // 它只多挂一个截图入口、多露几个 dev-only 按钮，不改变任何屏的样式与动效。
  localStorage.setItem('czjc_devtools', '1');
});
await page.reload({ waitUntil: 'networkidle' });

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const rows = [];
const check = (name, got, want) => rows.push({ 检查: name, 实测: got, 期望: want, 结果: String(got) === String(want) ? '✓' : '✗' });

/** 读某元素的计算动画信息 */
const animOf = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return '(缺元素)';
  const cs = getComputedStyle(el);
  return `${cs.animationName} ${cs.animationDelay}`;
}, sel);

/**
 * 等到某元素的动画**真的挂上**（而不是固定等 400ms）。
 * 并行验收时几个浏览器抢 CPU，固定 sleep 会不够——"等具体状态"是这个项目已经学过的教训。
 * 超时就把最后一次读到的东西返回，让断言如实报出来。
 */
const waitForAnim = async (sel, want, timeout = 8000) => {
  const t0 = Date.now();
  for (;;) {
    const got = await animOf(sel);
    if (got === want) return got;
    if (Date.now() - t0 > timeout) return got;
    await page.waitForTimeout(120);
  }
};

// ① 封面入场（tpl-title → anim-fade）
check('封面入场', await animOf('#screen-title .title-card'), 'fade-in 0s');

// ② 序章（电影化的拍子）：黑场题字入场 → 路线图逐节点亮 + 换幕抹擦
await page.click('#btn-mode-march');
check('序章题字卡入场', await waitForAnim('#screen-cutscene .title-card', 'fade-in 0s'), 'fade-in 0s');
let wipeSeen = '否';
for (let i = 0; i < 20; i++) {                       // 抹擦层只存活 ~0.6s，边等边看
  if (await page.locator('.scene-wipe').count()) { wipeSeen = '是'; break; }
  await page.waitForTimeout(60);
}
check('换幕抹擦出现', wipeSeen, '是');
// 第二拍是路线图：等拍子自己走过去（题字停 3.8s），然后核对"节点数"与"全程点亮"
let nodes = 0;
let lit = 0;
for (let i = 0; i < 80; i++) {
  const r = await page.evaluate(() => ({
    n: document.querySelectorAll('#cut-journey .j-node').length,
    lit: document.querySelectorAll('#cut-journey .j-node.done, #cut-journey .j-node.now').length,
  }));
  nodes = r.n; lit = r.lit;
  if (nodes >= 5 && lit === nodes) break;
  await page.waitForTimeout(150);
}
check('序章路线图节点数', nodes >= 5 ? '≥5' : String(nodes), '≥5');
check('路线图全程点亮', lit === nodes && nodes > 0 ? '是' : `否（${lit}/${nodes}）`, '是');
// 序章、告别与幕间过场都由同一条契约驱动：passOrigin 会一并清掉（见 tests/e2e/lib/driver.mjs）
await passOrigin(page);
for (let i = 0; i < 40; i++) {                       // 等进营地（别用固定 sleep：并行验收会抢 CPU）
  if (await page.locator('#hotspots .hotspot').count()) break;
  await page.waitForTimeout(200);
}

// ③ 营地：热点余烬 + 侧栏入场（tpl-side → anim-fade）
// 注意挑**还能点**的那一格：序章已经演过"与母亲告别"（acts.json 的 preDone），
// 那一格进幕就是 disabled，而 `.hotspot:disabled .ember{animation:none}` 是设计如此。
check('营地余烬', await animOf('#hotspots .hotspot:not(:disabled) .ember'), 'ember 0s');
check('营地侧栏入场', await animOf('#screen-camp .hud-left'), 'fade-in 0s');
check('微视差已绑定', await page.evaluate(() => {
  const el = document.querySelector('#screen-camp .pano-img');
  if (!el) return '(缺元素)';
  const before = el.style.transform;
  el.dispatchEvent(new Event('pointermove', { bubbles: true }));
  return before !== el.style.transform || getComputedStyle(el).transitionProperty.includes('transform') ? '是' : '否';
}), '是');

// ④ 舞台与选项：**第一幕的「浮桥」现在是玩法了**（同事重做的 pontoon-night，接在 forced 链上），
//    所以原来"点浮桥 → 抉择屏"这条路径没了。这几条改走**可达且等价**的入口：
//    · 板屏入场（tpl-board → sheet-rise）+ 数值签 + 契约标记：走 pontoon-night（真开局）
//    · 面板墨显（tpl-panel → ink-in）+ 选项逐条入场（askChoice 的 anim-stagger）：走篝火夜屏
//    （抉择屏那两屏的动效由 screen-sheet 的实拍 + e2e 真调一局覆盖——它们现在只在深幕可达）
await page.evaluate(() => window.__czScreens?.mini?.('pontoon-night'));
check('玩法板入场（纸卷上滑）', await waitForAnim('#screen-board .tpl-body', 'sheet-rise 0s'), 'sheet-rise 0s');
await page.evaluate(() => window.__czScreens.show('screen-camp'));
await page.waitForTimeout(200);
await page.evaluate(() => window.__czScreens.night());
for (let i = 0; i < 40; i++) {
  if (await page.locator('#night-body .blk-choice').count()) break;
  await page.waitForTimeout(300);
}
check('面板墨显（夜间）', await waitForAnim('#screen-night .panel', 'ink-in 0s'), 'ink-in 0s');
await waitForAnim('#night-body .blk-choice', 'ink-in 0s');
check('选项第 1 条延迟', await page.evaluate(() => {
  const c = document.querySelector('#night-body .blk-choice');
  return c ? getComputedStyle(c).animationDelay : '(缺选项)';
}), '0s');
check('选项第 2 条延迟', await page.evaluate(() => {
  const c = document.querySelector('#night-body .blk-choice:nth-child(2)');
  return c ? getComputedStyle(c).animationDelay : '(缺选项)';
}), '0.06s');
await page.evaluate(() => window.__czScreens.show('screen-camp'));
await page.waitForTimeout(200);

// ⑤b（原玩法板入场检查）已并入 ④：那时它借 needle 的板屏，现在 ④ 直接用真玩法开局，重复了。

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

// ⑥b 减动效下的**拍子**：判得出自己在减动效、题字卡不上动画、字幕整段直显（音频照播，听感另有人耳那关）
await page.click('#btn-mode-march');
await page.waitForTimeout(500);
const calmBeat = await page.evaluate(() => {
  const card = document.querySelector('#screen-cutscene .title-card');
  return {
    reduced: document.getElementById('screen-cutscene')?.dataset.reduced || '',
    cardAnim: card ? getComputedStyle(card).animationName : '(缺题字卡)',
  };
});
check('减动效：播放器知道自己在减动效', calmBeat.reduced, '1');
check('减动效：题字卡不上动画', calmBeat.cardAnim, 'none');
let calmCap = '';
for (let i = 0; i < 80; i++) {                       // 等第二拍（有字幕的那一拍）
  calmCap = await page.evaluate(() => {
    const c = document.getElementById('cut-caption');
    return c && c.textContent ? `${c.textContent}|${c.classList.contains('typing')}` : '';
  });
  if (calmCap) break;
  await page.waitForTimeout(150);
}
check('减动效：字幕整段直显', calmCap.split('|')[1] || '(没等到字幕)', 'false');

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

/**
 * 失败时把现场打出来：只报一个"实测 none"是查不出问题的——
 * 要看清是哪一屏、走到哪一步、元素在不在、是不是弹了模型重试。
 * （并行验收时出现"稳定失败、单跑却通过"，就是靠这个 dump 定的性。）
 */
const dumpScene = async (why) => {
  const facts = await page.evaluate(() => {
    const grid = document.querySelector('#screen-echo .echo-grid');
    return {
      screens: [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).map((s) => s.id),
      step: document.body.dataset.step,
      stepState: document.body.dataset.stepState,
      echoGrid: grid ? { cls: grid.className, kids: grid.children.length } : null,
      echoKid1: grid?.children?.[1] ? grid.children[1].className : null,
      aiRetry: !!document.querySelector('[data-action="ai-retry"]'),
      continueBtn: !!document.getElementById('btn-continue'),
    };
  });
  console.log('[现场] ' + why);
  console.log('  ' + JSON.stringify(facts));
  if (pageErrors.length) console.log('  pageErrors: ' + pageErrors.slice(-3).join(' | '));
};

const failed = rows.filter((r) => r.结果 === '✗');
if (failed.length) {
  console.log(`\n✗ 动效体检未通过：${failed.length} 项`);
  for (const f of failed) console.log(`  ✗ ${f.检查}：实测 ${f.实测}，期望 ${f.期望}`);
  await dumpScene('未通过 ' + failed.length + ' 项');
  await browser.close();
  process.exit(1);
}
console.log('\n✓ 动效体检通过：五个标准效果都挂在实际页面上');
await browser.close();
