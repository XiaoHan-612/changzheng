// 验证「素材落盘即生效」：把新图放进 public/assets/scenes/ 后，
// 前端探测能得到它（HTTP 200 + 可解码），并且不会因为缺图而报错。
// 用法：node tests/e2e/asset-drop.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// 本轮新增素材（生图模型按 HANDOFF-ART.md 产出的就是这些名字）
const NEW_ASSETS = [
  '/assets/scenes/sentry_night.jpg',
  '/assets/scenes/sugar_close.jpg',
  '/assets/scenes/snow_climb.jpg',
];
// 未来补齐的素材：允许暂时不存在
const FUTURE = [
  '/assets/scenes/snow_camp.jpg', '/assets/scenes/snow_let_clothes.jpg', '/assets/scenes/luding_bridge.jpg',
  '/assets/scenes/jinsha_ferry.jpg', '/assets/scenes/map_desk.jpg', '/assets/scenes/depart_bridge.jpg',
  '/assets/scenes/huining_flag.jpg', '/assets/scenes/lazikou_cliff.jpg',
  '/assets/scenes/xiangjiang_bridge.jpg', '/assets/scenes/zunyi_street.jpg', '/assets/scenes/huining_crowd.jpg',
];
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
  for (const p of [...NEW_ASSETS, ...FUTURE]) {
    const r = await fetch(BASE + p, { method: 'HEAD' });
    report.image[p] = r.ok ? '已就位' : '待生成';
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
  }, [...NEW_ASSETS, ...FUTURE]);
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
  await browser.close();

  const readyImages = Object.entries(report.image).filter(([, v]) => v === '已就位').map(([k]) => k);
  const readyAmbient = Object.entries(report.ambient).filter(([, v]) => v.startsWith('已就位')).map(([k]) => k);
  console.log(JSON.stringify({
    已就位图片: readyImages,
    待生成图片: Object.entries(report.image).filter(([, v]) => v !== '已就位').map(([k]) => k),
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
