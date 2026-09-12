// 素材体检：不只看文件在不在，还看格式/尺寸/时长/是否重复。
// 用法：node scripts/inspect-assets.mjs [scenes|ambient|all]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENES = path.join(ROOT, 'public/assets/scenes');
const AMBIENT = path.join(ROOT, 'public/audio/ambient');
const SHA = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

const problems = [];

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/** 读 WAV 头：{ codec:'wav', rate, channels, dur } */
function wavInfo(buf) {
  if (buf.slice(0, 4).toString() !== 'RIFF' || buf.slice(8, 12).toString() !== 'WAVE') return null;
  let off = 12;
  let fmt = null;
  let dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.slice(off, off + 4).toString('latin1');
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    }
    if (id === 'data') dataLen = size;
    off += 8 + size + (size % 2);
  }
  if (!fmt || !fmt.rate) return null;
  return { codec: 'wav', rate: fmt.rate, channels: fmt.channels, dur: dataLen / (fmt.rate * fmt.channels * (fmt.bits / 8)) };
}

function oggInfo(buf) {
  if (buf.slice(0, 4).toString() !== 'OggS') return null;
  const s = buf.toString('latin1');
  const isOpus = s.includes('OpusHead');
  const isVorbis = s.includes('\x01vorbis');
  if (!isOpus && !isVorbis) return null;
  let rate = 0;
  let channels = 0;
  let preskip = 0;
  if (isVorbis) {
    const i = s.indexOf('\x01vorbis');
    channels = buf[i + 11];
    rate = buf.readUInt32LE(i + 12);
  } else {
    const i = buf.indexOf('OpusHead');
    channels = buf[i + 9];
    preskip = buf.readUInt16LE(i + 10);
    rate = buf.readUInt32LE(i + 12) || 48000;
  }
  const last = buf.lastIndexOf('OggS');
  const granule = Number(buf.readBigInt64LE(last + 6));
  const sampleRate = isOpus ? 48000 : (rate || 44100);
  const samples = isOpus ? granule - preskip : granule;
  return { codec: isOpus ? 'opus' : 'vorbis', rate: sampleRate, channels, dur: samples / sampleRate };
}

function bytesLabel(n) {
  return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MB' : Math.round(n / 1024) + ' KB';
}

function inspectImages() {
  // 只对"契约内"的图做硬性判定（design/asset-prompts.md 里列出的）；其余历史素材只展示不判失败
  const contract = new Set(
    [...fs.readFileSync(path.join(ROOT, '..', 'design/asset-prompts.md'), 'utf8')
      .matchAll(/^\| `([a-z_]+\.jpg)`/gm)].map((m) => m[1])
  );
  const files = fs.existsSync(SCENES) ? fs.readdirSync(SCENES).filter((f) => /\.(jpe?g|png)$/i.test(f)) : [];
  console.log('\n■ 图片（public/assets/scenes/）');
  console.log('  文件'.padEnd(28) + '格式'.padEnd(8) + '尺寸'.padEnd(14) + '大小'.padEnd(10) + '指纹');
  const hashes = new Map();
  for (const f of files.sort()) {
    const buf = fs.readFileSync(path.join(SCENES, f));
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const size = isJpg ? jpegSize(buf) : (buf[0] === 0x89 ? 'PNG' : null);
    const dim = isJpg ? `${size.w}×${size.h}` : String(size);
    const h = SHA(buf);
    (hashes.get(h) || hashes.set(h, []).get(h)).push(f);
    console.log('  ' + f.padEnd(26) + (isJpg ? 'JPEG' : '?').padEnd(8) + dim.padEnd(14)
      + bytesLabel(buf.length).padEnd(10) + h);
    if (!contract.has(f)) continue;
    if (!isJpg) problems.push(`${f} 不是 JPEG`);
    else if (size.w !== 1280) problems.push(`${f} 宽度是 ${size.w}，规格要求 1280`);
    else if (size.h < 700 || size.h > 1100) problems.push(`${f} 高度 ${size.h} 看起来不是 1536×1024 等比导出`);
  }
  for (const [h, list] of hashes) {
    if (list.length > 1) problems.push(`图片内容完全相同（${h}）：${list.join(', ')}`);
  }
}

function inspectAmbient() {
  if (!fs.existsSync(AMBIENT)) { console.log('\n■ 环境床：目录不存在'); return; }
  const files = fs.readdirSync(AMBIENT).filter((f) => /\.(ogg|wav)$/i.test(f));
  const wavNote = [];
  console.log('\n■ 环境床（public/audio/ambient/）');
  console.log('  文件'.padEnd(28) + '编码'.padEnd(9) + '采样'.padEnd(10) + '声道'.padEnd(6) + '时长'.padEnd(9) + '大小'.padEnd(10) + '指纹');
  const hashes = new Map();
  const want = ['depart_river', 'xiangjiang_wind', 'zunyi_rain', 'jinsha_rapids',
    'luding_iron', 'snow_wind', 'grass_fire', 'huining_low'];
  for (const w of want) {
    if (!files.includes(w + '.ogg') && !files.includes(w + '.wav')) problems.push(`环境床缺少 ${w}.ogg（或 .wav）`);
  }
  for (const f of files.sort()) {
    const buf = fs.readFileSync(path.join(AMBIENT, f));
    const info = wavInfo(buf) || oggInfo(buf);
    const h = SHA(buf);
    (hashes.get(h) || hashes.set(h, []).get(h)).push(f);
    if (!info) {
      console.log('  ' + f.padEnd(26) + '无法识别' + ' '.repeat(30) + bytesLabel(buf.length));
      problems.push(`${f} 既不是 WAV 也不是 Ogg`);
      continue;
    }
    console.log('  ' + f.padEnd(26) + info.codec.padEnd(9) + String(info.rate).padEnd(10)
      + String(info.channels).padEnd(6) + (info.dur.toFixed(1) + 's').padEnd(9)
      + bytesLabel(buf.length).padEnd(10) + h);
    // 扩展名必须与容器一致，否则服务器会发出错误的 MIME（浏览器可能拒播）
    const ext = f.slice(f.lastIndexOf('.') + 1).toLowerCase();
    if (info.codec === 'wav' && ext !== 'wav') problems.push(`${f} 内容是 WAV 但扩展名是 .${ext}，MIME 会错`);
    if (info.codec !== 'wav' && ext !== 'ogg') problems.push(`${f} 内容是 ${info.codec} 但扩展名是 .${ext}`);
    if (info.codec === 'wav') wavNote.push(f);
    if (info.dur < 8) problems.push(`${f} 只有 ${info.dur.toFixed(1)}s，太短（要求 20–30s 可循环）`);
    if (info.dur > 90) problems.push(`${f} 有 ${info.dur.toFixed(1)}s，过长`);
    if (!want.includes(f.replace(/\.(ogg|wav)$/i, ''))) problems.push(`${f} 不在清单里（文件名拼错了？）`);
  }
  for (const [h, list] of hashes) {
    if (list.length > 1) problems.push(`音频内容完全相同（${h}）：${list.join(', ')} —— 大概率是同一份文件复制了多次`);
  }
  if (wavNote.length) {
    console.log(`\n  ⚠ 其中 ${wavNote.length} 条是 WAV（体积约为 Ogg 的 10 倍）。已能正常播放；`
      + '若要压体积，让模型按同名导出 Ogg Vorbis 即可（代码优先用 .ogg）。');
  }
}

const mode = process.argv[2] || 'all';
if (mode === 'scenes' || mode === 'all') inspectImages();
if (mode === 'ambient' || mode === 'all') inspectAmbient();

console.log('');
if (problems.length) {
  console.log('发现 ' + problems.length + ' 个问题：');
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
console.log('✓ 素材体检通过：格式、尺寸、时长、命名均符合规格，无重复内容');
