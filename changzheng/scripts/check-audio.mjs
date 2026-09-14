// 音频体检：确认**每一个已经生成的音频文件都能被播出去**，而不只是"文件存在"。
//
// 为什么要有它：素材体检只覆盖了环境床与 TTS 缓存的一部分；voices/ 与 reactions/ 从没验过，
// 也没人核对"文件能不能被某条代码路径真的请求到"。音频最容易出的三种事故：
//   ① 扩展名与容器不一致（.wav 里装的是 Ogg）→ 服务器发的 MIME 错，浏览器拒播；
//   ② 文件在，但没有任何映射指向它 → 永远播不到（曾出现 24 条 TTS 里 21 条不可达）；
//   ③ 文件损坏/截断 → decode 失败，代码静默降级，谁也不知道。
//
// 用法：node scripts/check-audio.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { audioInfo, bytesLabel } from './lib/audio-info.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(ROOT, 'public/audio');
const BASE = `http://localhost:${process.env.PORT || 3001}`;
const OUT = path.join(ROOT, 'docs/AUDIO-REPORT.md');

const problems = [];
const notes = [];

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const TTS_HASH = (voice, text) => crypto.createHash('sha1').update(`${voice}|${text}`).digest('hex').slice(0, 16);

/** 收集所有音频文件（按目录分类） */
function listAudio() {
  const out = [];
  for (const dir of ['ambient', 'bgm', 'cache', 'voices', 'reactions']) {
    const abs = path.join(AUDIO, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter((x) => /\.(wav|ogg|mp3)$/i.test(x)).sort()) {
      out.push({ dir, file: f, abs: path.join(abs, f), url: `/audio/${dir}/${f}` });
    }
  }
  return out;
}

/** 引用集合：哪些文件真的会被代码请求到 */
/** 音频框架的全部源码拼一起（环境床映射现在在 public/js/audio/channels/ambient.js 里） */
function audioSources() {
  const dir = path.join(ROOT, 'public/js/audio');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory() ? walk(path.join(d, e.name)) : (e.name.endsWith('.js') ? [path.join(d, e.name)] : [])
  ));
  return walk(dir).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

function references() {
  const src = audioSources();
  const ambient = new Set([...src.matchAll(/'(?:'|\/audio\/ambient\/)([a-z_]+\.ogg)'/g)].map((m) => m[1]));
  const ambientAlt = new Set([...src.matchAll(/\/audio\/ambient\/([a-z_]+\.ogg)/g)].map((m) => m[1]));
  const bgm = new Set([...src.matchAll(/\/audio\/bgm\/([a-z_]+)_bgm\.ogg/g)].map((m) => m[1]));
  const voices = new Set();
  const voiceLines = JSON.parse(read('public/audio/voice-lines.json')).lines || [];
  for (const l of voiceLines) voices.add(path.basename(l.file));
  const reactions = new Set();
  const visuals = JSON.parse(read('data/sim-visuals.json'));
  for (const v of Object.values(visuals.reactions || {})) reactions.add(path.basename(v));
  const cache = new Set();
  const ttsLines = JSON.parse(read('data/tts-lines.json')).lines || [];
  for (const l of ttsLines) cache.add(`${TTS_HASH(l.voiceId || 'narr', l.text)}_${l.voiceId || 'narr'}.wav`);
  return { ambient: new Set([...ambient, ...ambientAlt]), bgm, voices, reactions, cache, voiceLines, ttsLines };
}

async function main() {
  const files = listAudio();
  const refs = references();

  // 服务端可达性 + MIME
  let serverUp = false;
  try { serverUp = (await fetch(`${BASE}/api/config`)).ok; } catch { /* 未启动 */ }
  if (!serverUp) {
    console.error(`服务未启动：先 npm start（或让本脚本自己起，见 README）`);
    process.exit(1);
  }

  const rows = [];
  for (const f of files) {
    const buf = fs.readFileSync(f.abs);
    const info = audioInfo(buf);
    const ext = f.file.slice(f.file.lastIndexOf('.') + 1).toLowerCase();
    const row = {
      ...f, ...(info || {}), bytes: buf.length,
      ext, mime: '', http: 0, decoded: false,
    };
    if (!info) {
      problems.push(`${f.url} 无法识别容器（既不是 WAV 也不是 Ogg）`);
      rows.push(row);
      continue;
    }
    if (info.codec === 'wav' && ext !== 'wav') problems.push(`${f.url} 内容是 WAV 但扩展名是 .${ext}（MIME 会错）`);
    if (info.codec !== 'wav' && ext !== 'ogg') problems.push(`${f.url} 内容是 ${info.codec} 但扩展名是 .${ext}`);
    if (!(info.dur > 0)) problems.push(`${f.url} 时长为 0，文件可能是截断的`);

    const res = await fetch(BASE + f.url).catch(() => null);
    row.http = res ? res.status : 0;
    row.mime = res ? (res.headers.get('content-type') || '') : '';
    if (!res || !res.ok) problems.push(`${f.url} 请求失败：HTTP ${row.http}`);
    else if (info.codec === 'wav' && !/audio\/(x-)?wav|application\/octet-stream/.test(row.mime)) {
      problems.push(`${f.url} MIME 可疑：${row.mime}（WAV 内容）`);
    } else if (info.codec !== 'wav' && !/audio\/(ogg|opus)|application\/ogg/.test(row.mime)) {
      problems.push(`${f.url} MIME 可疑：${row.mime}（${info.codec} 内容）`);
    }
    rows.push(row);
  }

  // 浏览器逐个解码：这是"能不能播"的最终判据
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(`${BASE}/?audio=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  const decoded = await page.evaluate(async (urls) => {
    const out = {};
    for (const u of urls) {
      out[u] = await new Promise((resolve) => {
        const a = new Audio();
        a.preload = 'metadata';
        a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) && a.duration > 0);
        a.onerror = () => resolve(false);
        a.src = u;
        setTimeout(() => resolve(false), 8000);
      });
    }
    return out;
  }, files.map((f) => f.url));
  await browser.close();
  for (const r of rows) {
    r.decoded = decoded[r.url] === true;
    if (!r.decoded) problems.push(`${r.url} 浏览器无法解码（播放会静默失败）`);
  }

  // 引用交叉核对：文件在，但能不能被播到？
  const byDir = (d) => rows.filter((r) => r.dir === d);
  const referenced = (name, set) => set.has(name);
  for (const r of byDir('ambient')) {
    // AMBIENT_FILE 里只登记 .ogg；同名 .wav 属于"回退链"允许的存在
    const ok = referenced(r.file, refs.ambient) || referenced(r.file.replace(/\.wav$/, '.ogg'), refs.ambient);
    if (!ok) notes.push(`${r.url} 未被 AMBIENT_FILE 引用（回退链也可能用到，仅提示）`);
  }
  for (const r of byDir('voices')) {
    if (!referenced(r.file, refs.voices)) problems.push(`${r.url} 没有任何 voice-lines 指向它 → 永远播不到`);
  }
  for (const r of byDir('reactions')) {
    if (!referenced(r.file, refs.reactions)) problems.push(`${r.url} 没有被沙盘 REACTION_FILE 引用 → 永远播不到`);
  }
  for (const r of byDir('cache')) {
    if (!referenced(r.file, refs.cache)) problems.push(`${r.url} 的哈希与 data/tts-lines.json 对不上 → /api/tts 永远取不到它`);
  }
  // 反向：清单里写了但文件不在
  const have = new Set(rows.map((r) => r.file));
  for (const l of refs.voiceLines) {
    const b = path.basename(l.file);
    if (!have.has(b)) problems.push(`voice-lines.json 指向不存在的文件：${b}`);
  }
  for (const name of refs.reactions) if (!have.has(name)) problems.push(`sim-visuals.json 指向不存在的反应音：${name}`);
  for (const name of refs.cache) if (!have.has(name)) problems.push(`data/tts-lines.json 对应的缓存缺失：${name}（重跑 npm run tts:manifest 对照）`);
  for (const r of byDir('bgm')) {
    if (!Object.values(mapOf(read('public/js/audio/channels/bgm.js'), BGM_ENTRY)).some((u) => path.basename(u) === r.file)) {
      problems.push(`${r.url} 没有任何 BGM_FILE 映射指向它 → 永远播不到`);
    }
  }

  // 报告
  const lines = [
    '# 音频体检报告',
    '',
    `> 由 \`npm run qa:audio\` 生成 · 共 ${rows.length} 个文件（ambient ${byDir('ambient').length} · bgm ${byDir('bgm').length} · cache ${byDir('cache').length} · voices ${byDir('voices').length} · reactions ${byDir('reactions').length}）`,
    '',
    '| 文件 | 容器 | 采样 | 声道 | 时长 | 体积 | HTTP | MIME | 可解码 |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| \`public/audio/${r.dir}/${r.file}\` | ${r.codec || '?'} | ${r.rate || '—'} | ${r.channels || '—'}`
      + ` | ${r.dur ? r.dur.toFixed(1) + 's' : '—'} | ${bytesLabel(r.bytes)} | ${r.http} | ${r.mime || '—'} | ${r.decoded ? '✅' : '❌'} |`),
    '',
    '## 结论',
    '',
    problems.length ? `发现 **${problems.length}** 个问题：\n\n${problems.map((p) => `- ✗ ${p}`).join('\n')}` : '全部通过：容器/扩展名一致、HTTP 200、MIME 正确、浏览器可解码、且都能被代码路径引用到。',
    '',
    notes.length ? `## 提示\n\n${notes.map((n) => `- ${n}`).join('\n')}\n` : '',
  ].filter((l) => l !== '').join('\n');
  fs.writeFileSync(OUT, lines, 'utf8');

  // ───────── 声明表 ↔ 磁盘文件（scene-table.js 是唯一场景真相；缺文件必须看得见）─────────
  // 全部用正则**字面量**：模板字符串里的 `\s` 会被 JS 当成字符 s，正则静默失效（这里踩过一次）。
  const AMBIENT_ENTRY = /^\s*([a-z_]+):\s*'(\/audio\/ambient\/[^']+)'/gm;
  const BGM_ENTRY = /^\s*([a-z_]+):\s*'(\/audio\/bgm\/[^']+)'/gm;
  const AMBIENT_KIND = /ambient:\s*'([a-z_]+)'/g;
  const BGM_KIND = /bgm:\s*'([a-z_]+)'/g;
  const mapOf = (src, re) => Object.fromEntries([...src.matchAll(re)].map((m) => [m[1], m[2]]));
  const tableSrc = read('public/js/audio/scene-table.js');
  const ambientMap = mapOf(read('public/js/audio/channels/ambient.js'), AMBIENT_ENTRY);
  const bgmMap = mapOf(read('public/js/audio/channels/bgm.js'), BGM_ENTRY);
  const declaredAmbient = [...new Set([...tableSrc.matchAll(AMBIENT_KIND)].map((m) => m[1]))];
  const declaredBgm = [...new Set([...tableSrc.matchAll(BGM_KIND)].map((m) => m[1]))];
  const onDisk = (url) => fs.existsSync(path.join(ROOT, 'public', url.replace(/^\//, '')));
  if (!declaredAmbient.length || !declaredBgm.length) {
    problems.push('场景表解析不出 kind —— check-audio 的正则与 scene-table.js 的写法对不上了（守卫不能静默失效）');
  }
  if (!Object.keys(ambientMap).length || !Object.keys(bgmMap).length) {
    problems.push('文件映射解析不出条目 —— check-audio 的正则与 channels/*.js 的写法对不上了');
  }
  // ① 场景表写的 kind，映射表里必须有（写错 kind = 该场景静默无声）
  for (const k of declaredAmbient) {
    if (!ambientMap[k]) problems.push(`场景表声明了环境床「${k}」，但 channels/ambient.js 的 AMBIENT_FILE 里没有它（写错会静默无声）`);
  }
  for (const k of declaredBgm) {
    if (!bgmMap[k]) problems.push(`场景表声明了 BGM「${k}」，但 channels/bgm.js 的 BGM_FILE 里没有它`);
  }
  // ② 映射表指向的文件，磁盘上有没有：缺 BGM 不算错（"有文件就放，落盘即生效"）；缺环境床会走合成兜底
  const noAmbientFile = declaredAmbient.filter((k) => ambientMap[k] && !onDisk(ambientMap[k]));
  const noBgmFile = declaredBgm.filter((k) => bgmMap[k] && !onDisk(bgmMap[k]));
  notes.push(`场景表：环境床 ${declaredAmbient.length} 种 / BGM ${declaredBgm.length} 种，kind 与文件映射一致`);
  notes.push(noBgmFile.length
    ? `还没有 BGM 文件（${noBgmFile.length} 首）：${noBgmFile.map((k) => `${k}_bgm.ogg`).join('、')} —— 放进 public/audio/bgm/ 即生效，代码无需改动`
    : `BGM 文件齐全（${declaredBgm.length} 首）`);
  if (noAmbientFile.length) {
    notes.push(`环境床缺文件、正在走合成兜底：${noAmbientFile.join('、')}`);
  }

  // ───────── 框架一致性（docs/AUDIO-SYSTEM.md）：音频只能从门面走 ─────────
  const JS_DIR = path.join(ROOT, 'public/js');
  const walkJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (
    d.isDirectory() ? walkJs(path.join(dir, d.name)) : (d.name.endsWith('.js') ? [path.join(dir, d.name)] : [])
  ));
  const AUDIO_DIR = path.join(JS_DIR, 'audio');
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  for (const f of walkJs(JS_DIR)) {
    const src = fs.readFileSync(f, 'utf8');
    const isAudioModule = f.startsWith(AUDIO_DIR + path.sep);
    const where = rel(f);
    if (!isAudioModule) {
      // ① 绕开框架直接碰音频 API
      for (const [re, what] of [
        [/new\s+Audio\s*\(/, '`new Audio(`'],
        [/new\s+(window\.)?(webkit)?AudioContext/, '`new AudioContext`'],
        [/\.volume\s*=/, '`.volume =`'],
        [/\.gain\.value\s*=/, '`.gain.value =`'],
      ]) {
        if (re.test(src)) problems.push(`${where} 绕开音频框架直接用了 ${what} —— 改走 audio/index.js 门面（见 docs/AUDIO-SYSTEM.md）`);
      }
      // ②b 切场景不许绕过声明表（换场景 = scene-table.js 加一行 + audio.scene(...)）
      const direct = src.match(/audio\.(ambient|bgm)\.(play|stop)\(/);
      if (direct) problems.push(`${where} 直接调了 ${direct[0]}… —— 切场景请走 audio.scene(...)（场景写进 scene-table.js）`);
      // ② 旧 API 名残留
      for (const name of ['playAmbient', 'stopAmbient', 'playSfx', 'setEnabled']) {
        if (new RegExp(`audio\\.${name}\\b`).test(src)) problems.push(`${where} 还在用旧音频 API \`audio.${name}\` —— 现已收进门面（ambient.play / ambient.stop / sfx / setMuted）`);
      }
      // ③ 不许绕过门面直接 import 深模块
      const deep = src.match(/from\s+'(\.\/)?audio\/(?!index\.js)[^']+'/);
      if (deep) problems.push(`${where} 直接 import 了音频深模块 ${deep[0]} —— 一律从 './audio/index.js' 进`);
    }
  }
  for (const [name, f] of [['环境床', 'AMBIENT_FILE'], ['BGM', 'BGM_FILE'], ['音效', 'SFX_NAMES'], ['音色', 'ACTOR_VOICE']]) {
    if (!read('public/js/audio/index.js').includes(f)) problems.push(`音频门面没有再导出 ${name} 表（${f}）—— 别的模块要用它时不该各自抄一份`);
  }
  notes.push('框架一致性：门面唯一、无旧 API 残留、场景切换只走声明表');

  console.log(`音频文件 ${rows.length} 个 · 可解码 ${rows.filter((r) => r.decoded).length} · 问题 ${problems.length}`);
  for (const p of problems) console.log('  ✗ ' + p);
  for (const n of notes) console.log('  · ' + n);
  console.log(`报告：docs/AUDIO-REPORT.md`);
  if (problems.length) process.exit(1);
  console.log('AUDIO PASS');
}

main().catch((e) => {
  console.error('AUDIO FAIL', e.message);
  process.exit(1);
});
