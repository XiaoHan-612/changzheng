/**
 * 逐屏截图排查布局错位
 * 运行：node tests/e2e/layout-audit.mjs            # 1280 宽
 *       node tests/e2e/layout-audit.mjs --width 375 # 手机档（375 / 820 / 1280 三档逐屏验证）
 * 除了截图，还会自动报两类硬伤：① 页面横向溢出 ② 控件被挤出视口/点不到。
 */
import { ensureServer } from './lib/server.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { passOrigin, snap, applyMiniAction } from './lib/driver.mjs';

const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const widthArg = process.argv.indexOf('--width');
const WIDTH = Number(widthArg >= 0 ? process.argv[widthArg + 1] : (process.env.W || 1280)) || 1280;
const ART = path.join(ROOT, `tests/e2e/artifacts/layout-${WIDTH}`);
fs.mkdirSync(ART, { recursive: true });

const defects = [];

/**
 * 布局硬伤探测：只报"用户真的会碰到的"问题，避免噪音。
 * 1) 文档横向溢出（手机上会出现左右拖动/被裁掉右边）
 * 2) 可见的文字/控件横向出界（点不到、看不全）
 * 3) 可点控件在手机上小于 32px（手指点不准）
 */
async function probe(page, label) {
  const found = await page.evaluate(() => {
    const vw = window.innerWidth;
    const out = [];
    const visible = (el) => {
      if (el.closest('.hidden')) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return (r.width > 0 && r.height > 0) || (r.width > 0 && el.tagName === 'INPUT');
    };
    const describe = (el) => {
      const id = el.id ? '#' + el.id : '';
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? `「${text}」` : ''}`;
    };
    if (document.documentElement.scrollWidth > vw + 1) {
      out.push(`页面横向溢出：scrollWidth ${document.documentElement.scrollWidth} > 视口 ${vw}`);
    }
    const controls = 'button,a,input,select,textarea,[role="button"]';
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const isControl = el.matches(controls);
      const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!isControl && !hasOwnText) continue;
      if (r.right > vw + 2 || r.left < -2) {
        const where = r.left < -2 ? `左边越界 ${Math.round(-r.left)}px` : `右边越界 ${Math.round(r.right - vw)}px`;
        out.push(`${describe(el)} ${where}`);
      } else if (isControl && vw <= 820) {
        // 点按区规则只对窄屏/触屏生效：桌面鼠标场景下 30px 高的按钮完全够用，
        // 在 1280 宽也报会把真正的信号淹没（实测一次刷出 42 条噪音）。
        if (r.height < 32 || r.width < 32) {
          out.push(`${describe(el)} 点按区只有 ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
      }
    }
    // 同一屏最多 6 条，按描述去重
    return [...new Set(out)].slice(0, 6);
  });
  for (const f of found) defects.push({ 屏: label, 问题: f });
  if (found.length) console.log(`  ⚠ ${label}：${found.length} 处`);
  return found;
}


const shotNames = [];
async function shot(page, name) {
  await page.screenshot({ path: path.join(ART, name + '.png') });
  await probe(page, name);
  shotNames.push(name);
  console.log('shot', name);
}

/**
 * 必到的屏：这些屏**不依赖流程推进**（点一下就有、或走 dev 钩子摆出来）。
 * 为什么写死一张清单并断言：这个脚本曾经在一次机械重构里被切成半截（只剩标题一屏），
 * 却照样打印"✓ 逐屏无问题"——**报告成功但没干活**比报错更坏（见 HANDOFF-CODE 坑 52）。
 * 有了这张清单，"少跑了几屏"当场变成红。
 */
const REQUIRED = ['01-title', '01b-prologue-title', '01c-prologue-map', '01e-prologue-farewell', '02-camp', '12-board-bendhook'];

async function main() {
  await ensureServer();
  // 只做布局截图，不改运行模式

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: WIDTH <= 420 ? 812 : 1000 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));

  await page.goto(`${BASE}/?layout=${Date.now()}`, { waitUntil: 'networkidle' });

  // 标题
  await shot(page, '01-title');

  // ── 序章（电影化拍子）：题字 → 路线图（拍子自己会走，不点按）──
  await page.click('#btn-mode-study');
  await page.waitForTimeout(900);
  await shot(page, '01b-prologue-title');
  await page.waitForTimeout(3600);
  await shot(page, '01c-prologue-map');
  await page.click('#btn-cut-skip').catch(() => {});     // 序章上半场：一跳到底
  await page.waitForTimeout(300);

  // ── 出身三选一 + 出发前一问（逐屏体检）──
  if ((await page.evaluate(() => document.body.dataset.step || '')).startsWith('origin')) {
    await shot(page, '01d-origin');
    await page.locator('[data-choice-index]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('[data-choice-index]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
  // ── 告别（序章下半场）：点掉「继续」之后自动开演 ──
  for (let i = 0; i < 40; i++) {
    const kind = await page.evaluate(() => document.body.dataset.stepKind || '');
    if (kind === 'cutscene') break;
    const cont = page.locator('[data-action="continue"]');
    if (await cont.count()) await cont.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);
  await shot(page, '01e-prologue-farewell');
  await passOrigin(page);                                 // 清掉告别与幕间过场（同一条契约）
  await page.waitForTimeout(600);
  await shot(page, '02-camp');

  // 玩法板（真开局）：第一幕的「浮桥」现在是同事重做的 pontoon-night 玩法（原来是一张文字抉择卡），
  // 所以这里改成拍**真玩法板**——比拍一张抉择卡更值（板屏是玩家要盯几分钟的一屏）。
  // 抉择屏/回响屏的版式由联系表（qa:screens 的 03-choice / 05-echo）+ e2e 覆盖。
  await page.locator('.hotspot').filter({ hasText: '浮桥' }).click({ force: true });
  for (let i = 0; i < 40; i++) {                       // 等板屏挂起来（数值签与契约标记都到位）
    const ok = await page.evaluate(() => !document.getElementById('screen-board').classList.contains('hidden')
      && !!document.querySelector('#board-body [data-mini-action]'));
    if (ok) break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
  await shot(page, '03-board-pontoon');

  // 玩法进行中的版式：点一下板屏上的第一个动作（不依赖任何 dev 钩子——这一屏是默认状态拍的）
  await page.locator('#board-body [data-mini-action]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  await shot(page, '04-board-after-action');
  // 打完这一局（走到结算），免得后面的幕推进卡在板屏上
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => !document.getElementById('screen-board').classList.contains('hidden') === false)) break;
    const acts = await page.locator('#board-body [data-mini-action]').count();
    if (await page.locator('#btn-continue').count()) { await page.locator('#btn-continue').first().click({ force: true }).catch(() => {}); }
    if (!acts) { await page.waitForTimeout(300); }
    else { await page.locator('#board-body [data-mini-action]').last().click({ force: true }).catch(() => {}); }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(400);

  // 启程 → 强制链 → 对决
  for (let i = 0; i < 80; i++) {
    const s = await snap(page);
    const vis = s.screens;
    if (vis.includes('screen-quiz')) break;
    // 玩法板（强制链里可能有小游戏）：交给共用策略（唯一实现，见 lib/driver.mjs）
    if (s.mini) {
      await applyMiniAction(page, s);
      continue;
    }
    if (await page.locator('#btn-continue').count()) {
      await page.locator('#btn-continue').click({ force: true });
      await page.waitForTimeout(200);
      continue;
    }
    if (await page.locator('#btn-echo-ok').isVisible().catch(() => false)) {
      await page.click('#btn-echo-ok');
      await page.waitForTimeout(200);
      continue;
    }
    if (vis.includes('screen-camp')) {
      // 先把这一天的热点点掉：还有行动点时「启程」不会开（点也白点，循环会空转到超时）
      const hs = page.locator('[data-action="hotspot"]');
      if (await hs.count()) {
        await hs.first().click({ force: true });
        await page.waitForTimeout(800);
        continue;
      }
      await page.locator('#btn-march-fixed').click({ force: true });
      await page.waitForTimeout(900);
      continue;
    }
    // 交谈屏：快捷问句也带 data-choice-index，所以要先认它、再认通用选项（顺序见 lib/driver.mjs）
    if (s.talkEnd) {
      await page.locator('[data-action="talk-end"]').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
      continue;
    }
    const ch = page.locator('#ch-opts .blk-choice:not([disabled])');
    if (await ch.count()) {
      await ch.first().click({ force: true });
      await page.waitForTimeout(1200);
      continue;
    }
    await page.waitForTimeout(150);
  }
  if (await page.locator('#screen-quiz').isVisible().catch(() => false)) {
    await shot(page, '06-quiz-before');
    const opt = page.locator('.quiz-opt:not([disabled])');
    if (await opt.count()) {
      await opt.nth(1).click({ force: true });
      await page.waitForTimeout(2500);
      await shot(page, '07-quiz-result');
    }
  } else {
    // 不把"没走到"写成一句含糊的 WARN：带上现场，才知道是流程没到还是这一屏不存在。
    // 说明：走到对决屏要驱动整整一幕的热点链（会真调模型），本脚本不前推**整幕**；
    // 对决屏的布局由 `tests/manual/qa-quiz.mjs` 单独摆出来体检（那才是它的归口）。
    const s = await snap(page);
    console.log(`WARN: 本次没走到 quiz（正常：这里不驱动整幕热点链，对决屏见 qa-quiz）—— 现场`
      + ` screen=${s.screens.join(',')} step=${s.step} kind=${s.kind} state=${s.state}`
      + ` choices=${s.choices} cont=${s.cont} echo=${s.echoOk} mini=${s.mini}`
      + ` march=${s.march} hotspots=${s.hotspots.length} aiRetry=${s.aiRetry}`);
  }

  // 路径选择屏（如可达）
  if (await page.locator('#screen-path').isVisible().catch(() => false)) {
    await shot(page, '08-path');
  }

  // 手记
  if (await page.locator('#screen-camp').isVisible().catch(() => false)) {
    await page.click('#btn-journal');
    await page.waitForTimeout(400);
    await shot(page, '09-journal');
    await page.click('#btn-journal-close');
  }

  // 答辩面板属于调试工具，默认隐藏；只有展示开关打开时才截图（避免把隐藏按钮当可见）
  if (await page.locator('#btn-defense').isVisible().catch(() => false)) {
    await page.click('#btn-defense');
    await page.waitForTimeout(400);
    await shot(page, '10-defense');
    await page.click('#btn-defense-close');
  }

  // 玩法板全套（tpl-board）：走 __czScreens.mini 逐个摆出来体检——玩法都在幕深处，
  // 让它自己跑一整幕既慢又烧调用。展示开关关着时钩子不存在，跳过并说明。
  await page.evaluate(() => localStorage.setItem('czjc_devtools', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#btn-mode-study').catch(() => {});
  await page.waitForTimeout(200);
  await passOrigin(page);                                 // 序章 + 出身 + 幕间过场，一并清掉
  await page.waitForTimeout(500);
  const hasHook = await page.evaluate(() => !!window.__czScreens?.mini);
  if (hasHook) {
    for (const name of ['bendhook', 'goldenhook', 'nightschool', 'candy-share', 'sentry-watch', 'mud-gomoku', 'luding-chain', 'snow-grab', 'pontoon-night', 'rally-river']) {
      await page.evaluate((n) => window.__czScreens.mini(n), name);
      await page.waitForTimeout(700);
      await shot(page, `12-board-${name}`);
    }
  } else {
    console.log('WARN: 没有 __czScreens.mini 钩子，跳过玩法板');
  }
  await page.evaluate(() => localStorage.removeItem('czjc_devtools'));

  // 守卫自己也要有守卫：曾经它被切成半截还报绿（坑 52）。少跑必到的屏就红。
  const miss = REQUIRED.filter((n) => !shotNames.includes(n));
  if (miss.length) console.log(`  ✗ 少跑了几屏：${miss.join('、')}（清单见脚本里的 REQUIRED）`);
  console.log(`共 ${shotNames.length} 屏`);

  await browser.close();
  console.log('');
  console.log('LAYOUT AUDIT DONE →', ART);
  for (const m of miss) defects.push({ 屏: '(自检)', 问题: `必到的屏没跑到：${m}` });
  if (defects.length) {
    console.log('');
    console.log(`发现 ${defects.length} 处布局问题（${WIDTH}px）：`);
    for (const d of defects) console.log(`  ✗ [${d.屏}] ${d.问题}`);
    process.exitCode = 1;             // 有问题就带非零退出码：别让编排脚本把"有问题"当"跑过了"
  } else {
    console.log(`✓ ${WIDTH}px 宽逐屏无横向溢出/控件出界/点按区过小`);
  }
}

main().catch((e) => {
  console.error('AUDIT FAIL', e.message);
  process.exit(1);
});
