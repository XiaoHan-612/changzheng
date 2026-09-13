// 诊断：影音审计（qa:av）在营地卡死 —— 现场 dump。
// 现象：driver 连续点同一个热点（干粮）不产生任何状态变化，40s 后判定卡住。
// 这个脚本照 qa:av 的方式跑同一套驱动，卡住时把现场的 DOM 事实全打出来（toast / 热点状态 / 行动点 / 可见屏）。
// 用法：node tests/manual/diag-av-stall.mjs
import { chromium } from 'playwright';
import { ensureServer, BASE } from '../e2e/lib/server.mjs';
import { playThrough } from '../e2e/lib/driver.mjs';

await ensureServer();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('dialog', (d) => d.accept().catch(() => {}));
await page.goto(`${BASE}/?diag=${Date.now()}`, { waitUntil: 'networkidle' });
await page.evaluate(() => sessionStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

const log = [];
let stalled = '';
try {
  await playThrough(page, {
    mode: 'study',
    speed: 'fast',
    strategy: 'balanced',
    onSnapshot: (s) => {
      log.push({
        scr: s.screens.join(','),
        step: s.step,
        state: s.state,
        ch: s.choices,
        cont: s.cont,
        mini: s.mini,
        hs: s.hotspots.join('/'),
        ap: s.apOn,
        stats: JSON.stringify(s.stats),
      });
    },
  });
  console.log('跑完了，没有卡住');
} catch (e) {
  stalled = e.message;
  console.log('STALL >>', e.message);
}

console.log('\n最后 14 个快照：');
for (const s of log.slice(-14)) console.log(' ', JSON.stringify(s));

const dump = await page.evaluate(() => ({
  visibleScreens: [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).map((s) => s.id),
  step: document.body.dataset.step,
  stepKind: document.body.dataset.stepKind,
  stepState: document.body.dataset.stepState,
  toast: document.getElementById('toast')?.textContent,
  toastClass: document.getElementById('toast')?.className,
  apOn: document.querySelectorAll('#ap-dots .ap-dot.on').length,
  hotspots: [...document.querySelectorAll('#hotspots .hotspot')].map((b) => ({
    label: b.dataset.hotspotLabel, kind: b.dataset.hotspot, state: b.dataset.hotspotState, disabled: b.disabled,
  })),
  march: document.getElementById('btn-march-fixed')?.textContent?.trim(),
  fireOpen: !document.getElementById('screen-fire').classList.contains('hidden'),
  fireChoices: document.querySelectorAll('#fire-opts .blk-choice').length,
  stageChoices: document.querySelectorAll('#stage-panel .blk-choice').length,
  stagePanel: (document.getElementById('stage-panel')?.textContent || '').slice(0, 80),
}));
console.log('\n现场 DOM：');
console.log(JSON.stringify(dump, null, 1));

await page.screenshot({ path: 'tests/e2e/artifacts/diag-av-stall.png' });
console.log('\n截图 → tests/e2e/artifacts/diag-av-stall.png');
await browser.close();
if (stalled) process.exit(3);
