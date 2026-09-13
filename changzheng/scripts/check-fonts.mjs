// 字体覆盖检查（零回退守卫）：确认"该由自带字体渲染的字，真的都被自带字体覆盖"。
//
// 为什么必须有：仓库原先没有字体文件，全靠系统字体栈，同一份代码在 Windows/macOS/Linux 上是三套字形。
// 现在五族自托管字体（tools/build-fonts.mjs 生成）必须覆盖：
//   · 全字符集（仓库自撰 + 通用规范汉字表一级 3500 + 日志里 AI 实际用字）→ 正文族 serif 与对白族 kai
//   · 自撰字符集（界面固定文案）→ 标题族 display 与档案族 archive
// 覆盖之外的字才允许回退系统字体，并会在这里被列出来（集合外不算失败）。
//
// 用法：npm run qa:fonts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
const SERVER = `http://localhost:${PORT}`;

const problems = [];
const readChars = (p) => [...fs.readFileSync(path.join(ROOT, p), 'utf8')];

/** 解析 fonts.css 里每个族的 unicode-range 覆盖 */
function parseFontCss() {
  const css = fs.readFileSync(path.join(ROOT, 'public/css/fonts.css'), 'utf8');
  const fams = {};
  const re = /@font-face\s*\{([\s\S]*?)\}/g;
  for (const m of css.matchAll(re)) {
    const body = m[1];
    const fam = /font-family:\s*'([^']+)'/.exec(body)?.[1];
    const ranges = /unicode-range:\s*([^;]+)/.exec(body)?.[1] || '';
    const files = [...body.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((x) => x[1]);
    if (!fam) continue;
    fams[fam] = fams[fam] || { ranges: [], files: [] };
    fams[fam].ranges.push(...ranges.split(',').map((s) => s.trim()).filter(Boolean));
    fams[fam].files.push(...files);
  }
  const toCov = (ranges) => ranges.map((raw) => {
    const m = /^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/i.exec(raw);
    if (!m) return null;
    const lo = parseInt(m[1], 16);
    return { lo, hi: m[2] ? parseInt(m[2], 16) : lo };
  }).filter(Boolean);
  for (const f of Object.values(fams)) f.cov = toCov(f.ranges);
  return fams;
}

const covered = (fams, fam, cp) => (fams[fam]?.cov || []).some((r) => cp >= r.lo && cp <= r.hi);

async function ensureServer() {
  try { const r = await fetch(`${BASE}/api/config`); if (r.ok) return; } catch { /* start */ }
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: 'ignore', detached: true });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try { const r = await fetch(`${BASE}/api/config`); if (r.ok) return; } catch { /* retry */ }
  }
  throw new Error('无法启动服务');
}

async function main() {
  await ensureServer();
  const fams = parseFontCss();
  const full = readChars('tools/font-charset.txt');
  const authored = readChars('tools/font-charset-authored.txt');

  // 1) CSS 结构
  for (const need of ['serif', 'kai', 'display', 'archive', 'num']) {
    if (!fams[need]) problems.push(`fonts.css 缺少字体族：${need}`);
  }
  if (!problems.length) {
    console.log(`字体族 ${Object.keys(fams).join(' / ')}`);
    for (const [name, f] of Object.entries(fams)) {
      console.log(`  ${name.padEnd(8)} ${String(f.files.length).padStart(3)} 片  ${f.ranges.length} 段 unicode-range`);
    }
  }

  /**
   * 覆盖判定按"字体栈"而不是单个字体族：CSS 里每族的回退链也是我们自己的字体，
   * 所以只要**栈内任一族**覆盖该字，就不会落到系统字体。
   * 例外：emoji 与装饰性符号（↕ 🎙 🔇 🔊 等）本来就该由系统彩色 emoji 字体渲染，
   * 明确列为豁免并单独报告，不算失败。
   */
  const STACKS = {
    正文: ['serif'],
    对白: ['kai', 'serif'],
    标题: ['display', 'kai', 'serif'],
    档案: ['archive', 'serif'],
    数字: ['num', 'serif'],
  };
  const EXEMPT = [
    [0x1f000, 0x1faff],   // emoji
    [0x2600, 0x27bf],     // 杂项符号与装饰符
    [0x2190, 0x21ff],     // 箭头
    [0x2b00, 0x2bff],
    [0xfe0f, 0xfe0f],     // 变体选择符
  ];
  const exempt = (cp) => EXEMPT.some(([lo, hi]) => cp >= lo && cp <= hi);
  const checkSet = (label, chars, stacks) => {
    for (const [role, stack] of Object.entries(stacks)) {
      const miss = [];
      for (const ch of chars) {
        const cp = ch.codePointAt(0);
        if (cp < 0x20 || exempt(cp)) continue;
        if (!stack.some((fam) => covered(fams, fam, cp))) miss.push(ch);
      }
      if (miss.length) problems.push(`${label}·${role} 未覆盖 ${miss.length} 个字符（前 20：${miss.slice(0, 20).join('')}）`);
    }
  };
  checkSet('全字符集', full, { 正文: STACKS.正文, 对白: STACKS.对白 });
  checkSet('自撰字符集', authored, STACKS);
  if (!problems.length) {
    console.log(`覆盖判定通过：正文/对白覆盖全字符集 ${full.length} 字；标题/档案/数字覆盖自撰 ${authored.length} 字`);
    const ex = full.filter((c) => exempt(c.codePointAt(0)));
    if (ex.length) console.log(`  豁免（由系统 emoji/符号字体渲染）${ex.length} 个：${ex.slice(0, 12).join(' ')}`);
  }

  // 3) 文件可达性 + MIME
  const allFiles = [...new Set(Object.values(fams).flatMap((f) => f.files))];
  let bad = 0;
  for (const f of allFiles) {
    const r = await fetch(`${SERVER}/fonts/${f}`).catch(() => null);
    const type = r ? (r.headers.get('content-type') || '') : '';
    if (!r || !r.ok || !/font\/woff2|application\/font-woff2|application\/octet-stream/.test(type)) {
      problems.push(`字体文件异常：/fonts/${f} HTTP ${r ? r.status : 0} ${type}`);
      bad += 1;
      if (bad > 5) break;
    }
  }
  if (!bad) console.log(`字体文件全部可达：${allFiles.length} 个 woff2`);

  // 4) 浏览器端抽样：document.fonts 是否真能渲染（端到端证明，不只看 unicode-range）
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const fontRequests = [];
  page.on('response', (r) => { if (r.url().includes('/fonts/')) fontRequests.push(r.status()); });
  await page.goto(`${BASE}/?fonts=${Date.now()}`, { waitUntil: 'networkidle' });
  const sample = [...full.filter((_, i) => i % Math.ceil(full.length / 60) === 0)].slice(0, 60).join('');
  const sanity = await page.evaluate(async ({ text }) => {
    await document.fonts.ready;
    const out = {};
    for (const fam of ['serif', 'kai']) {
      try { await document.fonts.load(`16px ${fam}`, text); } catch { /* 忽略 */ }
      out[fam] = document.fonts.check(`16px ${fam}`, text);
    }
    return out;
  }, { text: sample });
  await browser.close();
  for (const [fam, ok] of Object.entries(sanity)) {
    if (!ok) problems.push(`浏览器端抽样失败：${fam} 无法渲染样例文本（会回退系统字体）`);
  }
  const failedReq = fontRequests.filter((s) => s >= 400).length;
  if (failedReq) problems.push(`浏览器加载字体时出现 ${failedReq} 次失败请求`);
  console.log(`浏览器抽样：serif=${sanity.serif} kai=${sanity.kai} · 字体请求 ${fontRequests.length} 次（失败 ${failedReq}）`);

  console.log('');
  if (problems.length) {
    for (const p of problems) console.log('  ✗ ' + p);
    console.log(`\n字体检查未通过：${problems.length} 项`);
    process.exit(1);
  }
  console.log('✓ 字体检查通过：五族自托管、覆盖达标、文件可达、浏览器可渲染');
}

main().catch((e) => { console.error('FONT CHECK FAIL', e.message); process.exit(1); });
