/**
 * 择点穿行点击排查：node tests/manual/check-select.mjs
 */
import { chromium } from 'playwright';

const base = process.env.BASE || 'http://127.0.0.1:3001';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console:' + m.text());
});
await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const btn = document.getElementById('btn-mode-select');
  return {
    titleVisible: !document.getElementById('screen-title')?.classList.contains('hidden'),
    btnExists: !!btn,
    btnVisible: !!(btn && btn.offsetParent),
    hasOnclick: !!(btn && btn.onclick),
    selectScreen: !!document.getElementById('screen-select'),
    selectHidden: document.getElementById('screen-select')?.classList.contains('hidden'),
    selectList: !!document.getElementById('select-list'),
  };
});
console.log('before', info, 'errors', errors);

if (info.btnExists) {
  await page.click('#btn-mode-select', { force: true }).catch((e) => console.log('click fail', e.message));
  await page.waitForTimeout(800);
}
const after = await page.evaluate(() => {
  const scr = document.getElementById('screen-select');
  const list = document.getElementById('select-list');
  return {
    selectHidden: scr?.classList.contains('hidden'),
    selectDisplay: scr ? getComputedStyle(scr).display : null,
    listHtmlLen: list ? list.innerHTML.length : -1,
    listPreview: list ? list.innerText.slice(0, 200) : '',
    tasks: document.querySelectorAll('#select-list [data-select-task]').length,
    toasts: [...document.querySelectorAll('.toast, #toast, .fx-flash')].map((e) => e.textContent).slice(0, 3),
  };
});
console.log('after', after);
console.log('errors-final', errors);

// 若失败，直接在页面里调用内核/模块诊断
const diag = await page.evaluate(async () => {
  try {
    const m = await import('/js/flow/modes.js');
    try {
      await m.openSelectMode();
      return { importOk: true, openOk: true, keys: Object.keys(m) };
    } catch (e) {
      return { importOk: true, openOk: false, err: String(e), stack: String(e.stack || '').slice(0, 400) };
    }
  } catch (e) {
    return { importOk: false, err: String(e) };
  }
});
console.log('direct-open', diag);
const after2 = await page.evaluate(() => {
  const scr = document.getElementById('screen-select');
  const list = document.getElementById('select-list');
  return {
    selectHidden: scr?.classList.contains('hidden'),
    tasks: document.querySelectorAll('#select-list [data-select-task]').length,
    preview: list ? list.innerText.slice(0, 160) : '',
  };
});
console.log('after-direct', after2);

await browser.close();
