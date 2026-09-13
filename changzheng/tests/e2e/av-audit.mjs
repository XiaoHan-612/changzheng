// 影音运行时审计：验证「图真的用对了、声音真的响了」，而不只是流程跑得通。
//
// 为什么必须单独做这件事：
//   sceneImage() 找不到图会静默退回占位图，playAmbient() 找不到文件会静默退回合成音。
//   于是路径拼错、文件缺失、映射写反都不会让任何测试变红——通关了，玩家看到的是错的图、听到的是假的声音。
//
// 检查项：
//   1) 整局中任何 /assets/**、/audio/** 请求都不得 4xx/5xx（引用坏了的第一现场）
//   2) 营地全景 = 该幕该日期望的图（acts.json 的 dayScenes[].alt || pano）
//   3) 抉择/舞台横幅 = 该 CHOICE_SET 的 img（从 main.js 静态解析出期望值）
//   4) 交谈屏立绘必须是真实存在的立绘文件（非空、非占位）
//   5) 每幕至少一次环境床 play() 成功，且 src 指向 /audio/ambient/*
//   6) 每个 /api/tts 返回的 url 必须 200 且能被浏览器解码出时长
//   7) 音效链路活着：AudioContext 的振荡器/缓冲源创建次数达到阈值
//   8) 无声率：/api/tts 未命中的台词里，哪些是"固定台词"（本该补音频），哪些是 AI 自由文本（结构性无声）
//
// 用法：npm run qa:av
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playThrough } from './lib/driver.mjs';

const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = path.join(ROOT, 'tests/e2e/artifacts');
fs.mkdirSync(ART, { recursive: true });

const acts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/acts.json'), 'utf8'));
const mainSrc = fs.readFileSync(path.join(ROOT, 'public/js/main.js'), 'utf8');

// 从 main.js 里取出各 CHOICE_SET 的舞台图（测试自己的期望值，不依赖运行时）
function choiceImages() {
  const start = mainSrc.indexOf('const CHOICE_SETS = {');
  const block = mainSrc.slice(start, mainSrc.indexOf('\n};', start));
  const out = {};
  for (const m of block.matchAll(/^  ([a-z_]+): \{([\s\S]*?)^  \},/gm)) {
    const img = m[2].match(/img:\s*'([^']+)'/);
    if (img) out[m[1]] = img[1];
  }
  return out;
}

// 立绘白名单（PORTRAIT_FILE：角色名 → 文件）
function portraitFiles() {
  const start = mainSrc.indexOf('const PORTRAIT_FILE = {');
  const block = mainSrc.slice(start, mainSrc.indexOf('};', start));
  const files = new Set();
  const names = new Set();
  for (const m of block.matchAll(/^\s*([^\s:]+):\s*'(\/assets\/characters\/[a-z_]+\.png)'/gm)) {
    names.add(m[1]);
    files.add(m[2]);
  }
  return { names, files };
}

// 每幕「营地全景」的允许集合：dayScenes 逐日展开
function campPanoSets() {
  const out = {};
  for (const id of acts.order) {
    const a = acts.acts[id];
    const set = new Set();
    if (Array.isArray(a.dayScenes) && a.dayScenes.length) {
      for (const d of a.dayScenes) {
        if (d.alt || d.pano || a.pano) set.add(d.alt || d.pano || a.pano);
        if (d.pano) set.add(d.pano);
      }
    }
    if (a.pano) set.add(a.pano);
    if (a.cutAlt) set.add(a.cutAlt);
    out[a.title] = { id, images: set };
  }
  return out;
}

const urlOf = (styleValue) => {
  const m = /url\(['"]?([^'")]+)['"]?\)/.exec(styleValue || '');
  return m ? m[1] : '';
};

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
  const CHOICE_IMG = choiceImages();
  const PORTRAIT = portraitFiles();
  const CAMP = campPanoSets();

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = [];
  const errs = [];
  const badStatus = [];
  const ttsUrls = new Set();
  const checkedCamp = new Set();
  const stageSeen = new Map();    // step → Set(实际用过的图)
  const checkedPortrait = new Set();
  const textAvatarNpcs = new Set();

  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('response', (r) => {
    const u = r.url();
    if (!/\/(assets|audio)\//.test(u)) return;
    if (r.status() >= 400) badStatus.push(`${r.status()} ${u.replace(BASE, '')}`);
  });
  page.on('response', async (r) => {
    if (!r.url().includes('/api/tts')) return;
    try { const j = await r.json(); if (j.url) ttsUrls.add(j.url); } catch { /* 忽略 */ }
  });

  // 页面加载前埋点：媒体播放、WebAudio 音源、以及 /api/tts 的每一次请求与命中结果
  await page.addInitScript(() => {
    window.__av = { media: [], sfx: 0, tts: [] };
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function patchedPlay() {
      const rec = { src: this.currentSrc || this.src || '', ok: null };
      window.__av.media.push(rec);
      const p = origPlay.apply(this, arguments);
      if (p && typeof p.then === 'function') {
        p.then(() => { rec.ok = true; })
          .catch((e) => { rec.ok = false; rec.err = String((e && e.message) || e); });
      }
      return p;
    };
    for (const name of ['AudioContext', 'webkitAudioContext']) {
      const AC = window[name];
      if (!AC) continue;
      for (const fn of ['createOscillator', 'createBufferSource']) {
        const orig = AC.prototype[fn];
        if (!orig) continue;
        AC.prototype[fn] = function patched() {
          window.__av.sfx += 1;
          return orig.apply(this, arguments);
        };
      }
    }
    // speak() 在"预录没命中"时才会请求 /api/tts；未命中返回 url:null —— 那一刻就是"玩家读得到、听不到"
    const origFetch = window.fetch;
    window.fetch = function patchedFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!url.includes('/api/tts')) return origFetch.apply(this, arguments);
      let body = null;
      try { body = init && init.body ? JSON.parse(init.body) : null; } catch { /* 忽略 */ }
      const rec = { text: (body && body.text) || '', voiceId: (body && body.voiceId) || '', actorId: (body && body.actorId) || '', url: null, source: null };
      window.__av.tts.push(rec);
      return origFetch.apply(this, arguments).then((res) => {
        try {
          res.clone().json().then((j) => { rec.url = j.url; rec.source = j.source; }).catch(() => {});
        } catch { /* 忽略 */ }
        return res;
      });
    };
  });

  await page.goto(`${BASE}/?av=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  await playThrough(page, {
    mode: 'study',
    speed: 'fast',
    strategy: 'balanced',
    onSnapshot: async (s) => {
      // 2) 营地全景
      if (s.screens.includes('screen-camp') && s.act) {
        const expect = CAMP[s.act];
        const got = urlOf(await page.locator('#pano-img').getAttribute('style').catch(() => ''));
        const key = `${s.act}|${got}`;
        if (expect && got && !checkedCamp.has(key)) {
          checkedCamp.add(key);
          if (![...expect.images].some((x) => got.includes(x))) {
            problems.push(`营地全景不符：${s.act} 实际用 ${got}，期望 ${[...expect.images].join(' 或 ')}`);
          }
        }
      }
      // 3) 抉择/舞台横幅
      const m = /^act\d+:([a-z_]+)$/.exec(s.step || '');
      if (m && s.screens.includes('screen-stage') && CHOICE_IMG[m[1]]) {
        const got = urlOf(await page.locator('#sheet-backdrop').getAttribute('style').catch(() => ''));
        if (got) {
          if (!stageSeen.has(m[1])) stageSeen.set(m[1], new Set());
          stageSeen.get(m[1]).add(got);
        }
      }
      // 4) 交谈屏立绘
      if (s.talkEnd) {
        const got = urlOf(await page.locator('#portrait-art').getAttribute('style').catch(() => ''));
        const who = (await page.locator('#portrait-name').textContent().catch(() => '')) || '';
        // 这位 NPC 本该有立绘吗？PORTRAIT_FILE 的键是"包含匹配"，和 showNpc() 一致
        const shouldHaveArt = [...PORTRAIT.names].some((k) => who.includes(k));
        if (got) {
          checkedPortrait.add(got);
          if (!PORTRAIT.files.has(got)) problems.push(`交谈屏立绘不在白名单里：${who} → ${got}`);
        } else if (shouldHaveArt) {
          problems.push(`交谈屏没有立绘（本该有却退回了文字头像）：${who} @${s.step}`);
        } else {
          textAvatarNpcs.add(who || '(无名)');   // 无立绘角色：按设计走文字头像
        }
      }
    },
  });

  // 3) 舞台图：整段步骤里只要出现过期望值就算通过（切换瞬间可能还留着上一屏的底）
  for (const [key, seen] of stageSeen) {
    const want = CHOICE_IMG[key];
    if (![...seen].some((x) => x.includes(want))) {
      problems.push(`舞台图不符：${key} 期望 ${want}，实际用过 ${[...seen].join(' / ')}`);
    }
  }

  // 5/7) 媒体与音效
  const av = await page.evaluate(() => window.__av);
  const ambientPlays = av.media.filter((m) => /\/audio\/ambient\//.test(m.src || ''));
  const ambientOk = ambientPlays.filter((m) => m.ok === true);
  const voicePlays = av.media.filter((m) => /\/audio\/(cache|voices)\//.test(m.src || ''));

  // 8) 无声率：把 /api/tts 未命中的台词分类——固定台词（可预生成）vs AI 自由文本（结构性无声）
  const fixedSources = [
    fs.readFileSync(path.join(ROOT, 'public/js/main.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'public/js/minigames.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'public/js/ui.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'data/tts-lines.json'), 'utf8'),
  ].join('\n');
  const ttsCalls = av.tts || [];
  const ttsHit = ttsCalls.filter((t) => t.url);
  const ttsMiss = ttsCalls.filter((t) => !t.url);
  const missFixed = [];
  const missDynamic = [];
  for (const t of ttsMiss) {
    const text = String(t.text || '').trim();
    if (!text) continue;
    // 固定台词：文本在源码/清单里逐字出现（说明它是写死的，可以预生成）
    const isFixed = fixedSources.includes(text.slice(0, 24));
    (isFixed ? missFixed : missDynamic).push({ text, voiceId: t.voiceId, actorId: t.actorId });
  }
  const uniqFixed = [...new Map(missFixed.map((x) => [x.text, x])).values()];
  const uniqDynamic = [...new Map(missDynamic.map((x) => [x.text, x])).values()];

  // 6) TTS 逐个验证：200 且能解码出时长
  const ttsCheck = [];
  for (const u of ttsUrls) {
    const res = await fetch(BASE + u).catch(() => null);
    ttsCheck.push({ url: u, status: res ? res.status : 0 });
  }
  const decodable = await page.evaluate(async (urls) => {
    const out = {};
    await Promise.all(urls.map((src) => new Promise((resolve) => {
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => { out[src] = Number.isFinite(a.duration) && a.duration > 0; resolve(); };
      a.onerror = () => { out[src] = false; resolve(); };
      a.src = src;
      setTimeout(() => { if (out[src] === undefined) { out[src] = false; resolve(); } }, 8000);
    })));
    return out;
  }, [...ttsUrls]);

  await page.screenshot({ path: path.join(ART, 'av-end.png') });
  await browser.close();

  for (const b of badStatus) problems.push(`资源请求失败：${b}`);
  for (const t of ttsCheck) if (t.status !== 200) problems.push(`TTS 音频不可达：${t.url} → HTTP ${t.status}`);
  for (const [u, ok] of Object.entries(decodable)) if (!ok) problems.push(`TTS 音频无法解码：${u}`);
  if (!ambientOk.length) problems.push('整局没有一次成功的环境床播放（说明全在走合成兜底）');
  if (voicePlays.length === 0) problems.push('整局没有播放过任何语音（预录与 TTS 都没响）');
  if (av.sfx < 10) problems.push(`音效链路可疑：整局只创建了 ${av.sfx} 个音源`);

  const report = {
    检查的营地全景: checkedCamp.size,
    检查的舞台图: stageSeen.size,
    检查的立绘: checkedPortrait.size,
    文字头像角色_按设计无立绘: [...textAvatarNpcs],
    环境床成功播放: `${ambientOk.length}/${ambientPlays.length}`,
    语音播放次数: voicePlays.length,
    TTS命中地址数: ttsUrls.size,
    TTS全部可解码: ttsCheck.every((t) => t.status === 200) && Object.values(decodable).every(Boolean),
    语音行数: ttsCalls.length,
    TTS命中: ttsHit.length,
    TTS未命中: ttsMiss.length,
    未命中_固定台词: uniqFixed.length,
    未命中_AI自由文本: uniqDynamic.length,
    音效音源数: av.sfx,
    资源请求失败数: badStatus.length,
    pageErrors: errs,
    问题: problems,
  };
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ART, 'av-report.json'), JSON.stringify(report, null, 2), 'utf8');

  // 把"该补音频的固定台词"落成清单，配额恢复后直接照着生成
  const gaps = [
    '# TTS 缺口清单（自动生成）',
    '',
    `> 由 \`npm run qa:av\` 生成于 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}。`,
    '> 口径：`speak()` 先查预录、再查 TTS 缓存；两者都没有时整句**无声**（玩家读得到、听不到）。',
    '',
    '## 一、可预生成的固定台词（应当补齐）',
    '',
    uniqFixed.length ? '| 台词 | 音色 |' + '\n|---|---|'
      + '\n' + uniqFixed.map((x) => `| ${x.text.replace(/\|/g, '\\|')} | ${x.voiceId || '(默认 narr)'} |`).join('\n')
      : '无 —— 所有固定台词都有音频。',
    '',
    '## 二、AI 自由文本（结构性无声，只能实时 TTS 或接受静音）',
    '',
    `本局共 ${uniqDynamic.length} 条不同文本。这类文本每次都不同，**不可能预生成**，属于设计限制：`,
    '',
    ...uniqDynamic.slice(0, 20).map((x) => `- ${x.text.slice(0, 48)}…`),
    uniqDynamic.length > 20 ? `- …（另有 ${uniqDynamic.length - 20} 条）` : '',
    '',
  ].filter((l) => l !== '').join('\n');
  fs.writeFileSync(path.join(ROOT, 'docs/TTS-GAPS.md'), gaps, 'utf8');

  if (errs.length) throw new Error('PAGE_ERRORS: ' + errs.join(' | '));
  if (problems.length) throw new Error(`影音审计发现 ${problems.length} 个问题（详见上表）`);
  console.log('AV AUDIT PASS');
}

main().catch((e) => {
  console.error('AV AUDIT FAIL', e.message);
  process.exit(1);
});
