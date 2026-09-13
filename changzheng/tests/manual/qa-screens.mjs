import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 本脚本在 tests/manual/ 下，ROOT 指回工程根
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = path.join(ROOT, 'tests', 'e2e', 'artifacts');
fs.mkdirSync(ART, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:3001/?audit2=' + Date.now(), { waitUntil: 'networkidle' });

async function show(id) {
  await page.evaluate((id) => {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    document.getElementById('topbar').classList.remove('hidden');
    document.getElementById(id).classList.remove('hidden');
  }, id);
}

async function measure(label, id) {
  const info = await page.evaluate((id) => {
    const screen = document.getElementById(id);
    if (!screen) return { err: 'no screen ' + id };
    const sr = screen.getBoundingClientRect();
    const cs = getComputedStyle(screen);
    const kids = [...screen.children].map((c) => {
      const r = c.getBoundingClientRect();
      return {
        cls: c.className || c.tagName,
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        offR: Math.round(r.right - window.innerWidth),
        offB: Math.round(r.bottom - window.innerHeight),
      };
    });
    return { display: cs.display, align: cs.alignItems, kids };
  }, id);
  const bad = (info.kids || []).filter((k) => k.offR > 2 || k.offB > 2 || k.rect[2] < 40);
  console.log(label, 'badKids=', JSON.stringify(bad), 'display=', info.display);
  await page.screenshot({ path: path.join(ART, `audit-${id}.png`) });
  return info;
}

// END
await show('screen-end');
await page.evaluate(() => {
  document.getElementById('end-eyebrow').textContent = '终局 · 同行';
  document.getElementById('end-title').textContent = '同行';
  document.getElementById('end-paras').innerHTML = '<p>路还长，但脚步声叠在了一起。</p><p>老班长把空鱼钩塞进你手心。</p>';
  document.getElementById('end-history').innerHTML = '<li>1935年过草地</li><li>战友互相让粮</li>';
  document.getElementById('end-stats').innerHTML = '<span class="blk-stat">体力<b>61</b></span><span class="blk-stat">粮食<b>8</b></span>';
  document.getElementById('end-rel').innerHTML = '老班长：43<br/>指导员：42';
  document.getElementById('end-personal').textContent = '你曾路过他们的长征。';
});
await page.waitForTimeout(150);
await measure('END', 'screen-end');

// SETTINGS
await show('screen-settings');
await page.evaluate(() => {
  document.getElementById('set-model').innerHTML = '<option>glm-5.3-flash</option>';
  document.getElementById('set-key-mask').textContent = '当前 Key：a917a8…YKRm';
  document.getElementById('set-status').textContent = '连通成功 4174ms';
});
await page.waitForTimeout(150);
await measure('SETTINGS', 'screen-settings');

// LOGS
await show('screen-logs');
await page.evaluate(() => {
  document.getElementById('logs-meta').textContent = '共 3 条调用 · source 可辨 GLM-5.1 / MOCK_AI / FALLBACK';
  document.getElementById('logs-list').innerHTML = `
    <div class="log-item"><div class="head"><span class="type">npc_chat</span><span class="src glm">GLM-5.1</span><span class="muted">1200ms</span></div><div class="narr">鱼钩是缝衣针弯的。</div><pre>{"reply":"鱼钩是缝衣针弯的。"}</pre></div>
    <div class="log-item"><div class="head"><span class="type">sim_turn</span><span class="src mock">MOCK_AI</span><span class="muted">0ms</span></div><div class="narr">你按自己的判断往前走了一段。</div></div>
  `;
});
await page.waitForTimeout(150);
await measure('LOGS', 'screen-logs');

// FACTS
await show('screen-facts');
await page.evaluate(() => {
  document.getElementById('facts-list').innerHTML = `
    <div class="fact-card"><h3>金色的鱼钩</h3><div class="date">1935年 · 松潘草地</div>
      <div class="row"><span class="label real">真实史实</span>长征过草地期间，粮食极度匮乏。许多老班长把食物让给伤员。</div>
      <div class="row"><span class="label fic">虚构互动</span>弯针、咬钩、分汤为互动重演。</div></div>
    <div class="fact-card"><h3>过松潘草地</h3><div class="date">1935年8月</div>
      <div class="row"><span class="label real">真实史实</span>沼泽遍布、补给断绝。</div>
      <div class="row"><span class="label fic">虚构互动</span>路线选择为玩法设计。</div></div>
  `;
});
await page.waitForTimeout(150);
await measure('FACTS', 'screen-facts');

// ECHO
await show('screen-echo');
await page.evaluate(() => {
  document.getElementById('echo-title').textContent = '金色的鱼钩';
  document.getElementById('echo-play').textContent = '起竿稍慢，一条小鱼脱了钩。你又下了竿，风把水面吹碎。';
  document.getElementById('echo-real').textContent = '长征过草地期间，粮食极度匮乏。许多老班长、炊事员把仅有的食物让给伤员和年轻战士，自己挖草根、嚼皮带。教材《金色的鱼钩》记述了一位老班长用缝衣针弯成鱼钩钓鱼，把鱼汤全让给伤员的故事。';
  document.getElementById('echo-fic').textContent = '虚构边界：本章中的弯针、咬钩、分汤为互动重演，不是对某一具体历史人物的复原。';
});
await page.waitForTimeout(150);
await measure('ECHO', 'screen-echo');

// JOURNAL
await show('screen-journal');
await page.evaluate(() => {
  document.getElementById('journal-route').innerHTML = '<span class="jr-chip done">✓ 于都河</span><span class="jr-chip now">▸ 湘江</span><span class="jr-chip">遵义</span>';
  document.getElementById('journal-choices').innerHTML = '<li><b>于都河</b> · 跟着队伍快走</li>';
  document.getElementById('journal-facts').innerHTML = '<li><b>于都出发</b></li>';
  document.getElementById('journal-foot').textContent = '体力 72 · 粮食 5 · 士气 62 · 信念 70 · 民心 48　｜　对决 0:0　｜　模型 glm-5.3-flash（MOCK）';
});
await page.waitForTimeout(150);
await measure('JOURNAL', 'screen-journal');

// PATH
await show('screen-path');
await page.evaluate(() => {
  document.getElementById('path-zones').innerHTML = `
    <button class="path-zone" style="left:18%;top:48%;width:28%;height:40%"><b>抄近路</b><span>贴着亮水洼，快但险</span></button>
    <button class="path-zone" style="left:40%;top:42%;width:24%;height:42%"><b>绕远走硬地</b><span>慢七里，稳</span></button>
  `;
});
await page.waitForTimeout(150);
await measure('PATH', 'screen-path');

// SANDBOX
await show('screen-sandbox');
await page.evaluate(() => {
  document.getElementById('sb-day').textContent = '2';
  document.getElementById('sb-place').textContent = '草地边缘';
  document.getElementById('sb-people').innerHTML = '<div class="sb-person"><span>老班长</span><span class="st">正常</span></div><div class="sb-goal">目标 · 把队伍完整带出去</div>';
  document.getElementById('sb-feed').innerHTML = '<div class="turn"><div class="ev-card" style="background-image:url(/assets/events/ev_night_march.jpg)"><span class="ev-tag">夜行</span></div><div class="act-line">▸ 用绳子把队伍串起来走<span class="verdict">可行</span></div><div class="narr">你按自己的判断往前走了一段。</div></div>';
});
await page.waitForTimeout(150);
await measure('SANDBOX', 'screen-sandbox');

await browser.close();
console.log('AUDIT DONE');
