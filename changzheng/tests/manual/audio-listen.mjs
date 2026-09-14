/**
 * 音频试听驱动：开一个**可见的 Chrome 窗口**，按固定节奏把各层声音依次放一遍，
 * 让"有耳朵的人"逐个确认——环境床 / 音效 / 台词语音 / 静音恢复。
 *
 * 为什么要有它：无头浏览器没有音频输出，自动化只能量"元素在播"（那不等于"你听得见"）；
 * 真机听感必须靠人。用法：
 *
 *   node tests/manual/audio-listen.mjs              # 完整试听（约 90 秒，会花 5–8 次模型调用）
 *   node tests/manual/audio-listen.mjs --keep-open  # 放完不关窗，留给你自己接着玩
 *   node tests/manual/audio-listen.mjs --measure    # 额外量能量：静音前/中/后各测一次实际输出（RMS）
 *
 * 节奏（每一步都有约 3–6 秒的停留，方便分辨）：
 *   ① 标题页（静音）→ ② 进营地：环境床 → ③ 点热点：click 音效
 *   → ④ 交谈：预置台词语音 → ⑤ 静音 3 秒（应完全静下来）→ ⑥ 取消静音：环境床立刻回来
 */
import { chromium } from 'playwright';
import { ensureServer, BASE } from '../e2e/lib/server.mjs';
import { passOrigin } from '../e2e/lib/driver.mjs';

const KEEP_OPEN = process.argv.includes('--keep-open');
const MEASURE = process.argv.includes('--measure');
const say = (s) => console.log(`[试听] ${s}`);
const wait = (p, ms) => p.waitForTimeout(ms);

await ensureServer();
const browser = await chromium.launch({
  headless: false,                     // 必须有头：无头浏览器没有音频输出
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('dialog', (d) => d.accept().catch(() => {}));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`${BASE}/?listen=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => sessionStorage.clear());
await page.reload({ waitUntil: 'load' });

say('① 标题页 —— 这一段应该没有背景声（3 秒）');
await wait(page, 3000);

say('② 进营地 —— 应该听到「于都河夜」的环境床（风声 + 水声）');
await page.click('#btn-mode-study');
await wait(page, 400);
await passOrigin(page);
await page.click('#btn-cut-skip').catch(() => {});
for (let i = 0; i < 30; i++) {                      // 等模型写营地氛围
  if (await page.evaluate(() => !!document.getElementById('screen-camp')?.offsetParent)) break;
  await wait(page, 500);
}
await wait(page, 6000);

if (MEASURE) {
  // 把环境床（含之后重建的）接进分析器：既能量真实输出，也照样播给耳朵
  await page.evaluate(() => {
    const a = window.__czAudio;
    const ctx = a.core.ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.connect(ctx.destination);
    const buf = new Float32Array(an.fftSize);
    window.__peak = async (ms) => {
      let p = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        an.getFloatTimeDomainData(buf);
        let s = 0;
        for (const v of buf) s += v * v;
        p = Math.max(p, Math.sqrt(s / buf.length));
        await new Promise((r) => setTimeout(r, 25));
      }
      return +p.toFixed(5);
    };
    setInterval(() => {                      // 每次静音恢复会重建元素，自动挂上
      const el = a.ambient.el;
      if (el && !el.__attached) {
        try { ctx.createMediaElementSource(el).connect(an); el.__attached = true; } catch { /* 已挂过 */ }
      }
    }, 200);
  });
  const m0 = await page.evaluate(() => window.__peak(1200));
  say(`【量】静音前环境床输出峰值 RMS = ${m0}`);
}

say('③ 点一个光点 —— 应该有一声短促的 click 音效');
await page.locator('[data-action="hotspot"]').first().click({ force: true }).catch(() => {});
await wait(page, 2500);

say('④ 交谈屏 —— 应该有同伴的台词语音（预置录音）');
for (let i = 0; i < 20; i++) {                      // 交谈屏的"快捷问句"出现后点一句
  if (await page.locator('[data-action="talk-quick"]').count()) break;
  await wait(page, 500);
}
if (await page.locator('[data-action="talk-quick"]').count()) {
  await page.locator('[data-action="talk-quick"]').first().click({ force: true }).catch(() => {});
  await wait(page, 6000);
}

say('⑤ 静音 3 秒 —— 应该完全静下来（背景声 + 人声都停）');
await page.evaluate(() => document.getElementById('btn-mute').dispatchEvent(new MouseEvent('click', { bubbles: true, view: window })));
if (MEASURE) say(`【量】静音中输出峰值 RMS = ${await page.evaluate(() => window.__peak(900))}`);
await wait(page, 3000);

say('⑥ 取消静音 —— 环境床应该当场回来（不用等切场景）');
await page.evaluate(() => document.getElementById('btn-mute').dispatchEvent(new MouseEvent('click', { bubbles: true, view: window })));
if (MEASURE) {
  const m2 = await page.evaluate(() => window.__peak(1500));
  const after = await page.evaluate(() => {
    const a = window.__czAudio;
    return { 在播: a.isPlaying('ambient'), 元素: a.ambient.describe(), 音量: a.ambient.el?.volume, muted: a.muted };
  });
  say(`【量】取消静音后输出峰值 RMS = ${m2}　状态=${JSON.stringify(after)}`);
}
await wait(page, 5000);

const st = await page.evaluate(() => window.__czAudio?.state());
say(`音频状态：${JSON.stringify(st)}`);
say('试听结束。窗口留给你，随便玩；关掉窗口即可结束（静音键在顶栏 🔊）。');

if (KEEP_OPEN) {
  say('（--keep-open：窗口保持 30 分钟；你自己关掉窗口即可结束）');
  try {
    await wait(page, 30 * 60 * 1000);
  } catch { /* 窗口被手动关掉了，正常收场 */ }
} else {
  await wait(page, 8000);
}
await browser.close().catch(() => {});
