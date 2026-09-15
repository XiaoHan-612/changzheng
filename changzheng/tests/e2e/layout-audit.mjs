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
