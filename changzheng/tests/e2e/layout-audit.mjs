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
import { passOrigin } from './lib/driver.mjs';

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


async function shot(page, name) {
  await page.screenshot({ path: path.join(ART, name + '.png') });
  await probe(page, name);
  console.log('shot', name);
}

async function main() {
  await ensureServer();
  // 只做布局截图，不改运行模式

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: WIDTH <= 420 ? 812 : 1000 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));

  await page.goto(`${BASE}/?layout=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('czjc_sandbox_world_v2'));
  await page.reload({ waitUntil: 'networkidle' });

  // 标题
  await shot(page, '01-title');

  // 进入主线
  await page.click('#btn-mode-study');
  await page.waitForTimeout(200);
  // 开场出身设定也要逐屏体检（本轮新增屏）
  if ((await page.evaluate(() => document.body.dataset.step || '')).startsWith('origin')) {
    await shot(page, '01b-origin');
    await passOrigin(page);
  }
  try { await page.click('#btn-cut-skip'); } catch { /* ok */ }
  await page.waitForTimeout(500);
  await shot(page, '02-camp');

  // 事件卡（浮桥抉择）
  await page.locator('.hotspot').filter({ hasText: '浮桥' }).click({ force: true });
  await page.waitForTimeout(700);
  await shot(page, '03-stage-choice');

  // 选第一项 → 等 continue
  await page.locator('#ch-opts .btn.choice').first().click({ force: true });
  await page.waitForTimeout(1500);
  await shot(page, '04-stage-after-choice');

  // continue → echo
  if (await page.locator('#btn-continue').count()) {
    await page.locator('#btn-continue').click({ force: true });
  }
  await page.waitForTimeout(500);
  if (await page.locator('#screen-echo').isVisible().catch(() => false)) {
    await shot(page, '05-echo');
    await page.click('#btn-echo-ok');
    await page.waitForTimeout(300);
  }

  // 启程 → 强制链 → 对决
  for (let i = 0; i < 40; i++) {
    const vis = await page.evaluate(() =>
      [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).map((s) => s.id)
    );
    if (vis.includes('screen-quiz')) break;
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
      await page.locator('#btn-march-fixed').click({ force: true });
      await page.waitForTimeout(900);
      continue;
    }
    const ch = page.locator('#ch-opts .btn.choice:not([disabled])');
    if (await ch.count()) {
      await ch.first().click({ force: true });
      await page.waitForTimeout(1200);
      continue;
    }
    await page.waitForTimeout(150);
  }
  if (await page.locator('#screen-quiz').isVisible().catch(() => false)) {
    await shot(page, '06-quiz-before');
    // 点一个选项
    const opt = page.locator('.quiz-opt:not([disabled])');
    if (await opt.count()) {
      await opt.nth(1).click({ force: true });
      await page.waitForTimeout(2500);
      await shot(page, '07-quiz-result');
    }
  } else {
    console.log('WARN: 未进入 quiz');
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

  // 沙盘
  await page.goto(`${BASE}/?layout2=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.click('#btn-mode-sandbox');
  await page.waitForTimeout(600);
  await page.fill('#sb-input', '派两个人去打探');
  await page.click('#sb-send');
  await page.waitForTimeout(1800);
  await shot(page, '11-sandbox');

  await browser.close();
  console.log('\nLAYOUT AUDIT DONE →', ART);
  if (defects.length) {
    console.log(`\n发现 ${defects.length} 处布局问题（${WIDTH}px）：`);
    for (const d of defects) console.log(`  ✗ [${d.屏}] ${d.问题}`);
  } else {
    console.log(`✓ ${WIDTH}px 宽逐屏无横向溢出/控件出界/点按区过小`);
  }
}

main().catch((e) => {
  console.error('AUDIT FAIL', e.message);
  process.exit(1);
});
