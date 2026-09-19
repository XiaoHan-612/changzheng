/**
 * 图标生成：项目里没有现成的 logo 素材，就用代码画一颗红星，
 * 直接产出 PNG 与多尺寸 ICO，不引任何第三方图像库。
 *
 * 用到的地方：
 *   - 窗口 / 任务栏图标（main.js 读 resources/app/icon.png）
 *   - 打包时放在成品目录里的 长征-抉择.ico
 */
import zlib from 'node:zlib';

export const SIZES = [256, 128, 64, 48, 32, 16];

// ── PNG 编码（最小实现：8bit RGBA + 无滤波 + deflate）──
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 形状 ──

const ROUND = 0.17;                 // 圆角半径（占边长比例）
const STAR_R_OUT = 0.305;
const STAR_R_IN = STAR_R_OUT * 0.382;
const RIM = 0.016;                  // 星徽金边宽度

const STAR = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? STAR_R_OUT : STAR_R_IN;
    pts.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
  }
  return pts;
})();

function inRounded(x, y) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - ROUND), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - ROUND), 0);
  if (dx === 0 && dy === 0) return true;
  return Math.hypot(dx, dy) <= ROUND;
}

function inStar(x, y) {
  let inside = false;
  for (let i = 0, j = STAR.length - 1; i < STAR.length; j = i++) {
    const [xi, yi] = STAR[i];
    const [xj, yj] = STAR[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToStarEdge(x, y) {
  let best = Infinity;
  for (let i = 0; i < STAR.length; i++) {
    const [x1, y1] = STAR[i];
    const [x2, y2] = STAR[(i + 1) % STAR.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((x - x1) * dx + (y - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
    if (d < best) best = d;
  }
  return best;
}

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const BG_TOP = [30, 36, 52];
const BG_BOT = [9, 11, 16];
const STAR_TOP = [232, 72, 58];
const STAR_BOT = [172, 28, 34];
const GOLD = [240, 180, 41];

/** 画一张 size×size 的图标（RGBA） */
export function renderIcon(size) {
  const SS = 4;                       // 4×4 超采样抗锯齿
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let pr = 0; let pg = 0; let pb = 0; let pa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (!inRounded(x, y)) continue;          // 圆角外：透明
          let c;
          if (inStar(x, y)) c = mix(STAR_TOP, STAR_BOT, y);
          else if (distToStarEdge(x, y) <= RIM) c = GOLD;
          else c = mix(BG_TOP, BG_BOT, y);
          pr += c[0]; pg += c[1]; pb += c[2]; pa += 255;
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      if (pa === 0) continue;
      const a = pa / n;
      // 非预乘通道：用覆盖数还原（背景不透明，直接平均即可）
      out[i] = Math.round(pr / (pa / 255));
      out[i + 1] = Math.round(pg / (pa / 255));
      out[i + 2] = Math.round(pb / (pa / 255));
      out[i + 3] = Math.round(a);
    }
  }
  return out;
}

/** 多尺寸 ICO（PNG 压缩条目，Vista 及以上均支持）—— 给窗口/任务栏用 */
export function makeIco(sizes = SIZES) {
  const images = sizes.map((s) => ({ size: s, png: encodePng(s, s, renderIcon(s)) }));
  return packIco(images.map((i) => ({ size: i.size, data: i.png })));
}

/**
 * 多尺寸 ICO（**BMP/DIB** 条目）—— 给 exe 的文件图标注册用。
 *
 * 为什么要多加这一版：压缩成 PNG 的图标条目是 Vista+ 才认的特性，
 * 而 csc 的 `/win32icon`（以及一部分老 shell 代码）对 PNG 条目支持不稳，
 * 会报 “不是有效的图标文件”。exe 的资源图标一律用未压缩的 DIB，
 * 是二十年没变过的稳妥做法。
 */
export function makeIcoBmp(sizes = [16, 32, 48, 256]) {
  return packIco(sizes.map((size) => ({ size, data: dibEntry(size) })));
}

function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);              // type: icon
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach((img, i) => {
    const o = i * 16;
    dir[o] = img.size >= 256 ? 0 : img.size;      // 0 表示 256
    dir[o + 1] = img.size >= 256 ? 0 : img.size;
    dir[o + 2] = 0;                                // 调色板数
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);                   // planes
    dir.writeUInt16LE(32, o + 6);                  // bpp
    dir.writeUInt32LE(img.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += img.data.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

/** 一张 BMP(DIB) 图标条目：BITMAPINFOHEADER(40) + BGRA 倒序像素 + AND 掩码 */
function dibEntry(size) {
  const rgba = renderIcon(size);
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);      // 高度写成两倍（XOR 图 + AND 掩码）
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);           // BI_RGB

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const srcRow = size - 1 - y;         // DIB 是自下而上
    for (let x = 0; x < size; x++) {
      const s = (srcRow * size + x) * 4;
      const d = (y * size + x) * 4;
      pixels[d] = rgba[s + 2];           // B
      pixels[d + 1] = rgba[s + 1];       // G
      pixels[d + 2] = rgba[s];           // R
      pixels[d + 3] = rgba[s + 3];       // A
    }
  }

  const maskRow = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRow * size);
  for (let y = 0; y < size; y++) {
    const srcRow = size - 1 - y;
    for (let x = 0; x < size; x++) {
      if (rgba[(srcRow * size + x) * 4 + 3] < 128) {
        mask[y * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return Buffer.concat([header, pixels, mask]);
}


// 命令行直接跑：node make-icon.mjs  → 落一份预览图，方便肉眼确认
if (process.argv[1] && process.argv[1].endsWith('make-icon.mjs')) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  fs.writeFileSync(path.join(here, 'icon.ico'), makeIco());
  fs.writeFileSync(path.join(here, 'icon.png'), encodePng(256, 256, renderIcon(256)));
  console.log('icon.ico / icon.png 已生成');
}
