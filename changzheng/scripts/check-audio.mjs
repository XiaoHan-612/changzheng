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
  for (const dir of ['ambient', 'cache', 'voices', 'reactions']) {
    const abs = path.join(AUDIO, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter((x) => /\.(wav|ogg|mp3)$/i.test(x)).sort()) {
      out.push({ dir, file: f, abs: path.join(abs, f), url: `/audio/${dir}/${f}` });
    }
  }
  return out;
}

/** 引用集合：哪些文件真的会被代码请求到 */
function references() {
  const ambient = new Set([...read('public/js/audio.js').matchAll(/'(?:'|\/audio\/ambient\/)([a-z_]+\.ogg)'/g)].map((m) => m[1]));
  const ambientAlt = new Set([...read('public/js/audio.js').matchAll(/\/audio\/ambient\/([a-z_]+\.ogg)/g)].map((m) => m[1]));
  const voices = new Set();
  const voiceLines = JSON.parse(read('public/audio/voice-lines.json')).lines || [];
  for (const l of voiceLines) voices.add(path.basename(l.file));
  const reactions = new Set();
  const visuals = JSON.parse(read('data/sim-visuals.json'));
  for (const v of Object.values(visuals.reactions || {})) reactions.add(path.basename(v));
  const cache = new Set();
  const ttsLines = JSON.parse(read('data/tts-lines.json')).lines || [];
  for (const l of ttsLines) cache.add(`${TTS_HASH(l.voiceId || 'narr', l.text)}_${l.voiceId || 'narr'}.wav`);
  return { ambient: new Set([...ambient, ...ambientAlt]), voices, reactions, cache, voiceLines, ttsLines };
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

  // 报告
  const lines = [
    '# 音频体检报告',
    '',
    `> 由 \`npm run qa:audio\` 生成 · 共 ${rows.length} 个文件（ambient ${byDir('ambient').length} · cache ${byDir('cache').length} · voices ${byDir('voices').length} · reactions ${byDir('reactions').length}）`,
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
