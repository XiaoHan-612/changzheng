// 验证「素材落盘即生效」：把新图放进 public/assets/scenes/ 后，
// 前端探测能得到它（HTTP 200 + 可解码），并且不会因为缺图而报错。
// 用法：node tests/e2e/asset-drop.mjs
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
  await page.click('#btn-mode-study');
  await passOrigin(page);              // 开场出身设定：本用例只关心立绘接线，直接过
  const skipBtn = page.locator('#btn-cut-skip');
  await skipBtn.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if (await skipBtn.isVisible()) await skipBtn.click();
  const mother = page.locator('.hotspot[data-hotspot-label="母亲"]');
  await mother.waitFor({ state: 'visible', timeout: 20000 });
  await mother.click();
  await page.waitForTimeout(400);
  const shownPortrait = await page.evaluate(() => ({
    name: document.getElementById('portrait-name')?.textContent || '',
    bg: document.getElementById('portrait-art')?.style.backgroundImage || '',
  }));
  if (shownPortrait.name !== '母亲') throw new Error(`母亲交谈位显示的角色名不对：${shownPortrait.name}`);
  if (!shownPortrait.bg.includes('mother.png')) {
    throw new Error(`母亲交谈位没有立 mother.png，实际：${shownPortrait.bg || '(空，退回文字头像)'}`);
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
