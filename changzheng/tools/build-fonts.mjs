// 字体构建：生成字符集 → 拉取字体 → 子集化 → 写出 public/fonts/ 与 public/css/fonts.css
//
// 为什么需要它：仓库原先没有任何字体文件，全靠系统字体栈，同一份代码在 Windows/macOS/Linux 上是三套字形。
// 这里把"用什么字、覆盖哪些字"固化成可复现的构建，产物提交进仓库（npm start 不需要构建步骤）。
//
// 取字体走 jsDelivr 与 Google Fonts 的按字子集接口（GitHub 与 fonts.google.com 直连不通，已实测）。
// 用法：node tools/build-fonts.mjs [--chars-only]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FONTS = path.join(ROOT, 'public/fonts');
const OUT_CSS = path.join(ROOT, 'public/css/fonts.css');
const CHARSET = path.join(ROOT, 'tools/font-charset.txt');
const MANIFEST = path.join(ROOT, 'tools/font-manifest.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const CHUNK = 600;              // 每次向 Google 请求的字数（URL 长度可控）

const FAMS = {
  serif: { css: 'Noto Serif SC', weights: [400, 600], kind: 'full' },
  kai: { css: 'LXGW WenKai', weights: [400], kind: 'slices' },
  display: { css: 'Ma Shan Zheng', weights: [400], kind: 'authored' },
  archive: { css: 'ZCOOL XiaoWei', weights: [400], kind: 'authored' },
  num: { css: 'EB Garamond', weights: [400, 600], kind: 'latin' },
};

const log = (...a) => console.log(...a);

// ── 一、字符集 ────────────────────────────────────────────────
function repoChars() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'fonts') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/logs|artifacts|_archive/.test(p)) walk(p); continue; }
      if (/\.(js|mjs|json|html|css|md)$/.test(e.name)) files.push(p);
    }
  };
  // 只扫"会被渲染"的文本：页面、脚本、数据。文档（docs/*.md）不参与——
  // 里面的西里尔字母、箭头、示意图符号永远不会画在界面上（踩过：把它们算进字符集，
  // 会让字体检查报出一堆与游戏无关的"缺字"）。
  walk(path.join(ROOT, 'public'));
  walk(path.join(ROOT, 'data'));
  const set = new Set();
  for (const f of files) {
    for (const ch of fs.readFileSync(f, 'utf8')) if (ch.codePointAt(0) > 127) set.add(ch);
  }
  return set;
}

async function commonChars(n = 3500) {
  const url = 'https://cdn.jsdelivr.net/gh/jaywcjlove/table-of-general-standard-chinese-characters@master/data/characters.json';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`常用字表取不到：HTTP ${r.status}`);
  const all = await r.json();               // 通用规范汉字表 8105 字，前 3500 为一级字表
  return all.slice(0, n);
}

function logChars() {
  const dir = path.join(ROOT, 'logs');
  const set = new Set();
  if (!fs.existsSync(dir)) return set;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    for (const ch of fs.readFileSync(path.join(dir, f), 'utf8')) if (ch.codePointAt(0) > 127) set.add(ch);
  }
  return set;
}

async function buildCharset() {
  const repo = repoChars();
  const common = await commonChars(3500);
  const ai = logChars();
  const full = new Set([...repo, ...common, ...ai]);
  // ASCII + 常用中文标点：界面里的数字、单位、括号、破折号都要能画出来
  for (let c = 0x20; c < 0x7f; c++) full.add(String.fromCharCode(c));
  for (const ch of '　、。〈〉《》「」『』【】〔〕・ー—…‘’“”！？：；，．（）％＋－×÷·￥') full.add(ch);
  const authored = new Set([...repo]);
  for (let c = 0x20; c < 0x7f; c++) authored.add(String.fromCharCode(c));
  for (const ch of '、。〈〉《》「」『』【】—…‘’“”！？：；，．（）') authored.add(ch);
  fs.writeFileSync(CHARSET, [...full].sort().join(''), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'tools/font-charset-authored.txt'), [...authored].sort().join(''), 'utf8');
  log(`字符集：全量 ${full.size} 字（仓库 ${repo.size} + 常用 3500 + AI ${ai.size}）· 自撰 ${authored.size} 字`);
  return { full: [...full], authored: [...authored] };
}

// ── 二、字体获取 ──────────────────────────────────────────────
const unicodeRange = (chars) => chars.map((c) => `U+${c.codePointAt(0).toString(16)}`).join(', ');

async function googleSubset(familyId, family, weight, chars, tag) {
  const rules = [];
  for (let i = 0; i < chars.length; i += CHUNK) {
    const chunk = chars.slice(i, i + CHUNK);
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`
      + `&text=${encodeURIComponent(chunk.join(''))}`;
    const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
    const m = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    if (!m) throw new Error(`${family} ${weight} 第 ${i / CHUNK} 段没有返回 woff2`);
    const name = `${familyId}-${weight}-${String(i / CHUNK).padStart(2, '0')}.woff2`;
    const dest = path.join(OUT_FONTS, name);
    let bytes = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    if (bytes < 100) {                     // 已下过就跳过，便于反复重跑
      const buf = Buffer.from(await (await fetch(m[1], { headers: { 'User-Agent': UA } })).arrayBuffer());
      fs.writeFileSync(dest, buf);
      bytes = buf.length;
    }
    rules.push({ file: name, range: unicodeRange(chunk), bytes });
    log(`  ${name}  ${(bytes / 1024).toFixed(0)}KB  ${chunk.length} 字`);
  }
  void tag;
  return rules;
}

async function lxgwSlices(chars, tag) {
  const base = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/';
  const css = await (await fetch(`${base}lxgwwenkai-regular.css`, { headers: { 'User-Agent': UA } })).text();
  const blocks = css.split('@font-face').slice(1);
  const wanted = new Set(chars.map((c) => c.codePointAt(0)));
  const rules = [];
  for (const b of blocks) {
    // 注意：该包的 unicode-range 末尾**没有分号**，正则不能强制要求 ';'；URL 也可能带引号
    const ur = b.match(/unicode-range:\s*([^;}]+)/);
    const url = b.match(/url\(['"]?([^'")]+\.woff2)['"]?\)/);
    if (!ur || !url) continue;
    // unicode-range 既有单码点（U+4e00）也有区间（U+4e00-4e7f），两种都要认
    const hitRange = ur[1].split(',').some((raw) => {
      const m = /^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/i.exec(raw.trim());
      if (!m) return false;
      const lo = parseInt(m[1], 16);
      const hi = m[2] ? parseInt(m[2], 16) : lo;
      for (const cp of wanted) if (cp >= lo && cp <= hi) return true;
      return false;
    });
    if (!hitRange) continue;                                   // 只下载与本作字符集有交集的切片
    const name = url[1].split('/').pop();
    const dest = path.join(OUT_FONTS, name);
    let bytes = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    if (bytes < 100) {
      const buf = Buffer.from(await (await fetch(base + 'files/' + name, { headers: { 'User-Agent': UA } })).arrayBuffer());
      if (buf.length < 100) throw new Error(`${name} 下载异常（${buf.length} 字节）`);
      fs.writeFileSync(dest, buf);
      bytes = buf.length;
    }
    rules.push({ file: name, range: ur[1].trim(), bytes });
  }
  log(`  ${tag}: 命中 ${rules.length} 个切片，合计 ${(rules.reduce((s, r) => s + r.bytes, 0) / 1024 / 1024).toFixed(2)}MB`);
  return rules;
}

async function main() {
  fs.mkdirSync(OUT_FONTS, { recursive: true });
  const { full, authored } = await buildCharset();
  if (process.argv.includes('--chars-only')) return;

  const manifest = { charset: { full: full.length, authored: authored.length }, families: {} };
  for (const [id, fam] of Object.entries(FAMS)) {
    log(`→ ${id} / ${fam.css}`);
    const chars = fam.kind === 'authored' ? authored : fam.kind === 'latin' ? full.filter((c) => c.codePointAt(0) < 128) : full;
    const rules = [];
    for (const w of fam.weights) {
      if (fam.kind === 'slices') rules.push(...await lxgwSlices(chars, `${id} ${w}`));
      else rules.push(...await googleSubset(id, fam.css, w, chars, id));
    }
    manifest.families[id] = { css: fam.css, kind: fam.kind, weights: fam.weights, rules };
  }

  const css = ['/* 自动生成：node tools/build-fonts.mjs —— 不要手改 */'];
  for (const [id, fam] of Object.entries(manifest.families)) {
    for (const w of fam.weights) {
      const rules = fam.rules.filter((r) => fam.kind === 'slices' ? true : r.file.startsWith(`${id}-${w}-`));
      if (!rules.length) continue;
      css.push(`/* ${id} ${w} · ${fam.css} · ${rules.length} 片 */`);
      css.push('@font-face {');
      css.push(`  font-family: '${id}';`);
      css.push('  font-style: normal;');
      css.push(`  font-weight: ${w};`);
      css.push('  font-display: swap;');
      css.push('  src: ' + rules.map((r) => `url('/fonts/${r.file}') format('woff2')`).join(', ') + ';');
      css.push('  unicode-range: ' + rules.map((r) => r.range).join(', ') + ';');
      css.push('}');
    }
  }
  fs.writeFileSync(OUT_CSS, css.join('\n') + '\n', 'utf8');
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
  const total = Object.values(manifest.families).flatMap((f) => f.rules).reduce((s, r) => s + r.bytes, 0);
  log(`写出 ${OUT_CSS}`);
  log(`字体合计 ${(total / 1024 / 1024).toFixed(2)}MB`);
}

main().catch((e) => { console.error('BUILD FONTS FAIL', e.message); process.exit(1); });
