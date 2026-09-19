// 验证「素材落盘即生效」：把新图放进 public/assets/scenes/ 后，
// 前端探测能得到它（HTTP 200 + 可解码），并且不会因为缺图而报错。
// 用法：node tests/e2e/asset-drop.mjs
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

// 素材清单直接读契约表（design/asset-prompts.md），避免测试清单与文档漂移
const CONTRACT = (() => {
  const md = fs.readFileSync(path.resolve(ROOT, '..', 'design/asset-prompts.md'), 'utf8');
  const scenes = [...new Set([...md.matchAll(/^\| `([a-z_]+\.jpg)`/gm)].map((m) => m[1]))];
  return scenes.map((f) => `/assets/scenes/${f}`);
})();
// 立绘同样按契约表校验（png，圆形头像框用）
const PORTRAITS = (() => {
  const md = fs.readFileSync(path.resolve(ROOT, '..', 'design/asset-prompts.md'), 'utf8');
  return [...new Set([...md.matchAll(/^\| `([a-z_]+\.png)`/gm)].map((m) => m[1]))]
    .map((f) => `/assets/characters/${f}`);
})();
const NEW_ASSETS = CONTRACT;   // 全部按契约校验；已就位 vs 待生成由 HEAD 决定
// 环境床 ogg
const AMBIENT = [
  '/audio/ambient/depart_river.ogg', '/audio/ambient/xiangjiang_wind.ogg', '/audio/ambient/zunyi_rain.ogg',
  '/audio/ambient/jinsha_rapids.ogg', '/audio/ambient/luding_iron.ogg', '/audio/ambient/snow_wind.ogg',
  '/audio/ambient/grass_fire.ogg', '/audio/ambient/huining_low.ogg',
];
// 代码支持 ogg → wav → 合成 三级回退；这里按实际存在的那个判定
const AMBIENT_WAV = AMBIENT.map((p) => p.replace(/\.ogg$/, '.wav'));


async function main() {
  await ensureServer();

  // 服务端可达性
  const report = { image: {}, ambient: {} };
  for (const p of NEW_ASSETS) {
    const r = await fetch(BASE + p, { method: 'HEAD' });
    report.image[p] = r.ok ? '已就位' : '待生成';
  }
  const reportPortrait = {};
  for (const p of PORTRAITS) {
    reportPortrait[p] = (await fetch(BASE + p, { method: 'HEAD' })).ok ? '已就位' : '待生成';
  }
  const ambientReady = [];
  for (const [i, p] of AMBIENT.entries()) {
    if ((await fetch(BASE + p, { method: 'HEAD' })).ok) { report.ambient[p] = '已就位（ogg）'; ambientReady.push(p); continue; }
    if ((await fetch(BASE + AMBIENT_WAV[i], { method: 'HEAD' })).ok) { report.ambient[p] = '已就位（wav）'; ambientReady.push(AMBIENT_WAV[i]); continue; }
    report.ambient[p] = '合成兜底';
  }

  // 浏览器侧：确认已就位的图能被解码（前端探测就是靠 Image.onload）
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/?drop=${Date.now()}`, { waitUntil: 'networkidle' });
  const decoded = await page.evaluate(async (list) => {
    const out = {};
    await Promise.all(list.map((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { out[src] = true; resolve(); };
      img.onerror = () => { out[src] = false; resolve(); };
      img.src = src;
    })));
    return out;
  }, [...NEW_ASSETS, ...PORTRAITS]);
  // 环境床：用 Audio 真解码一次（能拿到 duration 才说明 MIME 与容器没问题）
  const audioOk = await page.evaluate(async (list) => {
    const out = {};
    await Promise.all(list.map((src) => new Promise((resolve) => {
      const a = new Audio();
      const done = (v) => { out[src] = v; resolve(); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => done(Number.isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration) : false);
      a.onerror = () => done(false);
      a.src = src;
      setTimeout(() => done(false), 8000);
    })));
    return out;
  }, ambientReady);

  // ── 立绘接线回归：非同伴 NPC 必须立自己的立绘，不能一律显示老班长的脸
  //    （2026-09-13 修复：同伴兜底写在专属立绘之前，导致母亲/船工/宣传员等全显示老班长）
  // 换到**老船工**（第三幕）来验这条接线：
  //   · 母亲那一格现在是 `acts.json` 的 `preDone`（序章已经演过"与母亲告别"，进幕即显示"已看过"），
  //     点不动了 —— 拿它做用例会永远红，而且红的不是接线。
  //   · 船工正是当年那条 bug 的当事人之一（非同伴 NPC 一律显示老班长的脸）。
  // 用「择点穿行」直接跳到第三幕的交谈任务，不用为了验一张立绘跑两幕真调。
  await page.click('#btn-mode-select');
  const boatTask = page.locator('#select-list .select-tasks button', { hasText: '老船工' }).first();
  await boatTask.waitFor({ state: 'visible', timeout: 15000 });
  await boatTask.click();
  // 进幕 → 幕间过场 → 自动点开那个热点。**等状态，不等固定 sleep**：
  // 这条链上有一段真调，机器一忙固定等待就会读到"立绘还没挂上"的空值（本用例踩过）。
  const shownPortrait = { name: '', bg: '' };
  const t0 = Date.now();
  for (;;) {
    const now = await page.evaluate(() => ({
      name: document.getElementById('portrait-name')?.textContent || '',
      bg: document.getElementById('portrait-art')?.style.backgroundImage || '',
    }));
    if (now.name && now.name !== '—') { Object.assign(shownPortrait, now); break; }
    if (Date.now() - t0 > 20000) { Object.assign(shownPortrait, now); break; }
    await page.click('#btn-cut-skip').catch(() => {});
    await page.waitForTimeout(300);
  }
  if (shownPortrait.name !== '船工') throw new Error(`船工交谈位显示的角色名不对：${shownPortrait.name}`);
  if (!shownPortrait.bg.includes('boatman.png')) {
    throw new Error(`船工交谈位没有立 boatman.png，实际：${shownPortrait.bg || '(空，退回文字头像)'}`);
  }
  await browser.close();

  const readyImages = Object.entries(report.image).filter(([, v]) => v === '已就位').map(([k]) => k);
  const readyPortraits = Object.entries(reportPortrait).filter(([, v]) => v === '已就位').map(([k]) => k);
  const readyAmbient = Object.entries(report.ambient).filter(([, v]) => v.startsWith('已就位')).map(([k]) => k);
  console.log(JSON.stringify({
    已就位图片: readyImages,
    待生成图片: Object.entries(report.image).filter(([, v]) => v !== '已就位').map(([k]) => k),
    已就位立绘: readyPortraits,
    待生成立绘: Object.entries(reportPortrait).filter(([, v]) => v !== '已就位').map(([k]) => k),
    已就位环境床: readyAmbient,
    合成兜底环境床: Object.entries(report.ambient).filter(([, v]) => !v.startsWith('已就位')).map(([k]) => k),
    环境床解码时长秒: audioOk,
    浏览器解码结果: decoded,
    errs,
  }, null, 2));

  // 已就位的图必须能被浏览器解码，否则前端探测会退回占位图
  for (const p of readyImages) {
    if (decoded[p] !== true) throw new Error(`已就位但浏览器无法解码：${p}`);
  }
  for (const p of readyPortraits) {
    if (decoded[p] !== true) throw new Error(`已就位但浏览器无法解码的立绘：${p}`);
  }
  for (const p of readyAmbient) {
    // readyAmbient 里放的是清单键（.ogg），实际可播路径可能是同名 .wav
    const served = audioOk[p] ? p : p.replace(/\.ogg$/, '.wav');
    if (!audioOk[served]) throw new Error(`环境床无法在浏览器解码（MIME 或容器有问题）：${p}`);
  }
  if (errs.length) throw new Error('PAGE_ERRORS: ' + errs.join(' | '));
  console.log('ASSET DROP PASS');
}

main().catch((e) => {
  console.error('ASSET DROP FAIL', e.message);
  process.exit(1);
});
