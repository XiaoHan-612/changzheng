// 目视检查：把新素材在真实界面里的效果截出来（手记底图 / 回响底纹）。
// 用法：node tests/manual/asset-look.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = path.join(ROOT, 'tests/e2e/artifacts');
fs.mkdirSync(ART, { recursive: true });

async function ensureServer() {
  try {
    const r = await fetch(`${BASE}/api/config`);
    if (r.ok) return;
  } catch { /* start */ }
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: 'ignore', detached: true });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try {
      const r = await fetch(`${BASE}/api/config`);
      if (r.ok) return;
    } catch { /* retry */ }
  }
  throw new Error('无法启动服务');
}

async function main() {
  await ensureServer();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.goto(`${BASE}/?look=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.click('#btn-mode-march');
  await page.waitForTimeout(300);
  await page.click('#btn-cut-skip').catch(() => {});
  await page.waitForTimeout(1500);

  // 手记（回望）——底图应为 map_route
  await page.click('#btn-journal').catch(async () => { await page.keyboard.press('j'); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ART, 'look-journal.png') });
  console.log('已截图 look-journal.png');

  // 直接构造一次史实回响，看底纹（不必等真调）
  await page.evaluate(() => {
    document.getElementById('screen-journal')?.classList.add('hidden');
    const cinema = document.querySelector('#screen-echo .echo-cinema');
    if (cinema) {
      cinema.style.backgroundImage =
        "linear-gradient(160deg, rgba(40,34,24,0.6), rgba(22,20,18,0.78)), url('/assets/scenes/echo_paper.jpg')";
    }
    document.getElementById('echo-title').textContent = '过松潘草地';
    document.getElementById('echo-play').textContent = '你跟着队伍走进了沼泽，泥比想象中深。';
    document.getElementById('echo-real').textContent = '1935 年 8 月，红一、红四方面军走过松潘草地。';
    document.getElementById('echo-fic').textContent = '虚构边界：本关操作是互动重演。';
    document.getElementById('screen-echo').classList.remove('hidden');
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ART, 'look-echo.png') });
  console.log('已截图 look-echo.png');
  await browser.close();
  console.log('ASSET LOOK DONE');
}

main().catch((e) => { console.error('ASSET LOOK FAIL', e.message); process.exit(1); });
