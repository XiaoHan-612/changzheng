import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 本脚本在 tests/manual/ 下，ROOT 指回工程根
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = path.join(ROOT, 'tests', 'e2e', 'artifacts');

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:3001/?endchk=' + Date.now(), { waitUntil: 'networkidle' });

const r = await page.evaluate(() => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  document.getElementById('topbar').classList.remove('hidden');
  const end = document.getElementById('screen-end');
  end.classList.remove('hidden');
  document.getElementById('end-eyebrow').textContent = '终局 · 同行';
  document.getElementById('end-title').textContent = '同行';
  document.getElementById('end-paras').innerHTML = '<p>路还长，但脚步声叠在了一起。</p><p>老班长把空鱼钩塞进你手心。</p>';
  document.getElementById('end-history').innerHTML = '<li>1935年过草地</li><li>战友互相让粮</li>';
  document.getElementById('end-stats').innerHTML = '<span class="blk-stat">体力<b>61</b></span><span class="blk-stat">粮食<b>8</b></span><span class="blk-stat">士气<b>68</b></span>';
  document.getElementById('end-rel').innerHTML = '老班长：43<br/>指导员：42<br/>红小鬼：38';
  document.getElementById('end-personal').textContent = '你曾路过他们的长征。';
  const vis = [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).map((s) => s.id);
  const p = document.querySelector('.end-panel');
  const pr = p.getBoundingClientRect();
  return { vis, panel: [Math.round(pr.x), Math.round(pr.y), Math.round(pr.width), Math.round(pr.height)] };
});
console.log(JSON.stringify(r, null, 2));
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(ART, 'chk-end.png') });
await browser.close();
