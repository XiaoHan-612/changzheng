/**
 * 夜校识字 · 一灯油（nightschool）· 对照验收体检
 *
 * 这支玩法要回答两件事：
 *   ① **模型到底参没参与**：课本（三个字 + 口令）必须是模型按"今天做过的事"定的，
 *      而且要过内容闸（来源词在候选池里、字真出现在来源词里）。
 *   ② **它是不是游戏**：同一份代码，不同打法必须分出档 —— 而且档位的差别
 *      必须来自"你把那点油分给了谁"，不是来自运气。
 *
 * 所以这里跑两组：
 *   A. 真·模型路径（1 次调用）：点开调试台那一栏，等模型把课本写出来，
 *      再从 DOM 反读模型的产出，逐字核对闸。
 *   B. 固定课本对照（0 次调用）：用同一本固定教材跑 6 种打法，
 *      数字必须稳定、能复现 —— 这是"决策有没有分叉"的证据。
 *      （不固定课本的话，每次模型给的字不同、学费不同，数字会漂，
 *        后人复跑看到不同数字会以为写错了。这条是弯针成钩那轮学到的。）
 *
 * 另外含：四点契约自检、prefers-reduced-motion: reduce 下的真点击、
 * **客观视觉断言**（像素计数 + 位置采样框 + 对照组）—— 证明"光圈之外的字真的是黑的"。
 *
 * 用法：先起服务 node server/index.js，然后
 *   node tests/manual/qa-school.mjs
 * 截图落在 tests/e2e/artifacts/school/（该目录已被 .gitignore 排除）。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'e2e', 'artifacts', 'school');
fs.mkdirSync(OUT, { recursive: true });

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

/* ─────────── 极简 PNG 解码：只吃 Chromium 截图会产出的 8bit RGB/RGBA、非隔行 ───────────
   为什么不用 canvas.getImageData：这支玩法是 **DOM + CSS** 画的（汉字必须走真字体，
   走 canvas 会重踩"文字发糊"那个坑），页面上没有可读的 canvas。所以只能截图像素级验。
   自己解 PNG 而不是装依赖：zlib 是 Node 内置的，几十行就够。 */
function decodePng(buf) {
  let p = 8, w = 0, h = 0, depth = 0, color = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; color = data[9];
      if (depth !== 8 || (color !== 6 && color !== 2)) throw new Error(`PNG 格式没料到：depth=${depth} color=${color}`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = color === 6 ? 4 : 3;
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const filt = raw[q++];
    const line = raw.subarray(q, q + stride); q += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (filt === 1) v += a;
      else if (filt === 2) v += b;
      else if (filt === 3) v += (a + b) >> 1;
      else if (filt === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, ch, data: out };
}

/** 一张图里三类像素各多少 + 平均亮度。口径写在注释里，改口径要一起改这里的名字。 */
function stats(png) {
  const { w, h, ch, data } = png;
  let n = 0, lum = 0, wood = 0, ink = 0, gold = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    n++;
    lum += 0.299 * r + 0.587 * g + 0.114 * b;
    // 被灯照亮的木牌：暖、亮、红明显高于蓝
    if (r > 140 && g > 100 && r - b > 42 && r >= g) wood++;
    // 木牌上的墨字：**暖色**的暗像素（r 明显高于 b）。
    // 只写 `r >= b` 会把暗层下的中性灰（约 25,24,23）也算进来 ——
    // 实测曾在"完全没照到"的那一格误报 2295 个"墨字"，是个假的检出。
    if (r < 115 && g < 105 && r - b > 10) ink++;
    // 进度条的暖金：比木牌更黄更亮（木牌 b/r≈0.59，金条 b/r≈0.47）
    if (r > 190 && g > 150 && b < 130 && b / r < 0.50 && r - b > 80) gold++;
  }
  return { n, mean: lum / n, wood, ink, gold, w, h };
}

/** 取一块矩形里的**最暗 / 最亮**像素 → 反推"字色对底色"的实际对比度。
    为什么不用 getComputedStyle 算：入口屏的字是压在**照片底**上的，
    底色是图片、不是 CSS 背景色，只有采样像素才量得准。
    min 取到的是字的实心像素，max 取到的是未被字盖住的底色 —— 正好是我们要的比。 */
function regionContrast(png, box, cssW = 1280) {
  const s = png.w / cssW;
  const x0 = Math.max(0, Math.floor(box.x * s)), x1 = Math.min(png.w, Math.ceil((box.x + box.w) * s));
  const y0 = Math.max(0, Math.floor(box.y * s)), y1 = Math.min(png.h, Math.ceil((box.y + box.h) * s));
  const L = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let minL = 1, maxL = 0, sum = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * png.w + x) * png.ch;
    const v = L(png.data[i], png.data[i + 1], png.data[i + 2]);
    if (v < minL) minL = v; if (v > maxL) maxL = v; sum += v; n++;
  }
  return { minL, maxL, meanL: n ? sum / n : 0, contrast: (maxL + 0.05) / (minL + 0.05) };
}

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1320 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

const host = '#mini-host';
const snap = () => page.locator(host).evaluate((el) => ({
  mini: el.dataset.mini,
  state: el.dataset.miniState,
  outcome: el.dataset.miniOutcome || '',
  oil: el.dataset.miniOil ?? '',
  focus: el.dataset.miniFocus ?? '',
  taught: el.dataset.miniTaught ?? '',
  needs: el.dataset.miniNeeds ?? '',
  actions: el.querySelectorAll('[data-mini-action]').length,
  glyphs: [...el.querySelectorAll('.smini3-glyph')].map((n) => n.textContent),
  froms: [...el.querySelectorAll('.smini3-from')].map((n) => n.textContent.replace(/出自「|」/g, '')),
  kinds: [...el.querySelectorAll('.smini3-bar .smini3-hint:first-child')].map((n) => n.textContent),
  status: (el.querySelector('.smini3-status')?.textContent || '').trim(),
}));

/**
 * **每次量坐标/截图之前，先把页面滚回顶部。**
 *
 * 踩过的坑：`getBoundingClientRect()` / `mouse.move()` 用**视口坐标**，
 * 而 `page.screenshot({clip})` 的坐标系在 Playwright 里不一定是同一个 ——
 * 我先前按"页坐标 = 视口 + scroll"去补偿，结果取样框整体偏了约 (60, 50) CSS px，
 * 断言就变成了"在空木头上找字"，读数是 0，看着像画面缺字。
 * 与其猜 Playwright 的口径，不如把 scroll 固定成 0，两套坐标就重合了。
 */
const calm = async () => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(50);
};

/** 舞台（.smini3-stage）在视口里的位置 —— 截图与鼠标坐标都要用它 */
const stageBox = async () => { await calm(); return page.locator(`${host} .smini3-stage`).boundingBox(); };
const glyphCenters = async () => {
  await calm();
  return page.locator(host).evaluate((el) =>
    [...el.querySelectorAll('.smini3-glyph')].map((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }));
};

/** 在某个视口矩形上截图并数像素 */
async function probe(cx, cy, half) {
  await calm();
  const clip = {
    x: Math.round(cx - half), y: Math.round(cy - half),
    width: Math.round(half * 2), height: Math.round(half * 2),
  };
  const buf = await page.screenshot({ clip });
  return stats(decodePng(buf));
}

const saveShot = async (name, viewportRect) => {
  await calm();
  const clip = viewportRect && {
    x: Math.round(viewportRect.x), y: Math.round(viewportRect.y),
    width: Math.round(viewportRect.width), height: Math.round(viewportRect.height),
  };
  await page.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) });
};
const resultJson = async () => {
  const t = await page.locator('#c-result').textContent();
  try { return JSON.parse(t); } catch { return {}; }
};

const FIXED = {
  teacher_line: '（验收固定课本）今晚照木牌认三个字。',
  password: '瑞金',
  chars: [
    { ch: '瑞', kind: '口令', from: '瑞金', gloss: '我们从那儿走出来的地方。今晚哨位上先问这两个字。', level: '半熟字' },
    { ch: '松', kind: '地名', from: '松潘', gloss: '脚下这片水草地叫松潘，往北都是这样的水。', level: '生字' },
    { ch: '班', kind: '人名', from: '老班长', gloss: '班长是夜里给人掖被子的那个人。', level: '生字' },
  ],
};
const POOL_GRASS = ['松潘', '毛儿盖', '班佑', '若尔盖', '巴西', '草地', '夹金山', '雪山', '泸定桥',
  '金沙江', '皎平渡', '腊子口', '瑞金', '于都', '遵义', '赤水', '湘江',
  '老班长', '小号手', '指导员', '卫生员', '红小鬼', '同志', '战友', '司务长'];

/* ══════════════ A. 真·模型路径 ══════════════ */
console.log('=== A. 模型路径：课本是不是模型按今天的经历定的 ===');
await page.goto('http://localhost:3001/dev/minigame-lab.html?mini=nightschool', { waitUntil: 'networkidle' });
const t0 = Date.now();
let introOk = true;
try {
  await page.waitForFunction(
    (s) => document.querySelector(s)?.dataset?.miniState === 'intro', host, { timeout: 90000 });
} catch { introOk = false; }
const msA = Date.now() - t0;
const A = await snap();
await saveShot('A-01-intro');

const A2 = await resultJson();
let modelLesson = null;
try {
  const r = await page.evaluate(async () => {
    const el = document.querySelector('#mini-host');
    return el ? { verdict: el.dataset.miniState } : null;
  });
  modelLesson = r;
} catch { /* 忽略 */ }

console.log(`  等待模型出课本：${msA} ms，到达 intro：${introOk ? '✓' : '✗（超时）'}`);
console.log(`  三个字：${A.glyphs.join(' / ')}`);
console.log(`  各自出自：${A.froms.join(' / ')}`);
console.log(`  三类：${A.kinds.join(' | ')}`);
console.log(`  学费(秒)：${A.needs}（油只有 22.00）`);
console.log(`  教员的话：${A.status.slice(0, 70)}`);

// 闸：每个字必须真的出现在它自己的来源词里，来源词必须在候选池里
const gateChecks = A.glyphs.map((ch, i) => {
  const from = A.froms[i] || '';
  return {
    ch, from,
    inPool: POOL_GRASS.includes(from),
    contains: from.includes(ch),
    single: /^[\u4e00-\u9fff]$/.test(ch),
  };
});
console.log('  闸（逐字核对）：');
for (const g of gateChecks) {
  console.log(`    ${g.ch} ← ${g.from}　在候选池:${g.inPool ? '✓' : '✗'}　字真出现在来源词里:${g.contains ? '✓' : '✗'}　单字:${g.single ? '✓' : '✗'}`);
}
const gateOk = introOk && gateChecks.every((g) => g.inPool && g.contains && g.single);
console.log(`  课本三字全部来自本次候选池：${gateOk ? '✓（模型真的读了今天可选的词）' : '✗'}`);
console.log(`  契约：host[data-mini]=${A.mini}　state=${A.state}　[data-mini-action]=${A.actions}`);

/* ── 视觉断言 1：光圈内外的字，是不是真的一亮一黑 ── */
const centers = await glyphCenters();
const box0 = await probe(centers[0].x, centers[0].y, 16);
await page.waitForTimeout(60);
const litNow = await page.evaluate((s) => {
  const st = document.querySelector(s + ' .smini3-stage');
  return { ax: st.dataset.miniAction, oil: document.querySelector(s).dataset.miniOil };
}, host);
await page.mouse.move(centers[0].x, centers[0].y);   // 把灯挪到第一个字上
await page.waitForTimeout(120);
const box0Lit = await probe(centers[0].x, centers[0].y, 16);
const box2Dark = await probe(centers[2].x, centers[2].y, 16);
const corner = await probe((await stageBox()).x + 34, (await stageBox()).y + 26, 12);
await saveShot('A-02-closeup', {
  x: Math.round(centers[0].x - 90), y: Math.round(centers[0].y - 40), width: 320, height: 200,
});

console.log('\n=== 客观视觉断言（像素计数，DPR=2）===');
const row = (tag, s, hint) => console.log(
  `  ${tag.padEnd(26)} 亮木牌 ${String(s.wood).padStart(5)}　墨字 ${String(s.ink).padStart(4)}　暖金 ${String(s.gold).padStart(4)}　均亮 ${s.mean.toFixed(1).padStart(5)}　${hint}`);
row('灯照在字①上 · 字①处', box0Lit, box0Lit.wood > 200 ? '✓ 照到了' : '✗ 没照到');
row('同一刻 · 字③处（对照）', box2Dark, box2Dark.wood < box0Lit.wood * 0.15 ? '✓ 仍是黑的' : '✗ 不该亮');
row('同时刻 · 舞台左上角（对照）', corner, corner.wood < 30 ? '✓ 夜是黑的' : '✗');
console.log(`  墨字像素（字①处）：${box0Lit.ink} 个 —— >20 说明"亮木头上有字"，不是一块空板`);
void litNow; void box0; void A2; void modelLesson;

/* ══════════════ B. 固定课本 · 六种打法 ══════════════ */
console.log('\n=== B. 同一条代码、不同打法（固定课本，零模型调用）===');

const STRATS = [
  { key: 'S1', name: '精瞄，三个字都教', plan: [0, 1, 2], douse: false },
  { key: 'S2', name: '精瞄口令+地名，然后收灯', plan: [0, 1], douse: true },
  { key: 'S3', name: '只精瞄口令，收灯', plan: [0], douse: true },
  { key: 'S4', name: '砍掉口令：只教地名+人名', plan: [1, 2], douse: true },
  { key: 'S5', name: '灯停在①与②的交界（两个字各半速）', plan: ['edge'], douse: false },
  { key: 'S6', name: '灯照在夜空上（一个字都不教）', plan: ['off'], douse: false },
];

async function startFixed() {
  // 每局换一个**新的 host 元素**：复用同一个的话，上一局的 rAF 循环还活着
  // （container.isConnected 仍为 true），两个实例会同时往同一份 dataset 上写，
  // 分数就不可信了。换元素之后旧实例的兜底定时器会在 500ms 内自清。
  await page.evaluate(async (lesson) => {
    const old = document.querySelector('#mini-host');
    const el = document.createElement('div');
    el.id = 'mini-host';
    if (old) old.replaceWith(el);
    const slot = { op: null };          // 闭包抓住这一局自己的槽，别写成共享的 window.__qa
    window.__qa = slot;
    const m = await import('/js/minigames-school.js?v=' + Date.now());
    m.runNightSchoolOil(el, { lesson, noReview: true }).then((op) => { slot.op = op; });
  }, FIXED);
  await page.waitForTimeout(650);       // 给上一局的自清留出时间
  await page.waitForFunction(
    () => document.querySelector('#mini-host')?.dataset?.miniState === 'intro', null, { timeout: 8000 });
}
/** 点"点上灯"开始烧油（注意：click 会把指针挪到按钮上，所以调用方要重新瞄一次） */
async function lightUp() {
  await page.locator(`${host} [data-mini-action="begin"]`).click();
  await page.waitForFunction(
    () => document.querySelector('#mini-host')?.dataset?.miniState === 'play', null, { timeout: 4000 });
}
/** 把光圈精确停在某个字上，等它被教成（或等到这一局结束）。
 *  轮询走 rAF（在页面里等），不要每 60ms 往返一次 —— 那点往返时间就够把 1.1 秒余量吃掉。 */
async function teach(i, budgetMs = 26000) {
  const cs = await glyphCenters();
  await page.mouse.move(cs[i].x, cs[i].y);
  await page.waitForFunction((idx) => {
    const el = document.querySelector('#mini-host');
    if (!el) return true;
    const t = Number((el.dataset.miniTaught || '').split(',')[idx]) || 0;
    return t >= 0.999 || el.dataset.miniState !== 'play';
  }, i, { timeout: budgetMs, polling: 'raf' });
  return true;
}
/** 等这一局收场 */
const awaitEnd = () => page.waitForFunction(
  () => document.querySelector('#mini-host')?.dataset?.miniState !== 'play', null,
  { timeout: 34000, polling: 'raf' });

const rows = [];
for (const st of STRATS) {
  await startFixed();
  await lightUp();
  if (st.plan[0] === 'off') {
    const sb = await stageBox();
    await page.mouse.move(sb.x + 30, sb.y + 24);              // 夜空中，离木牌很远
    await awaitEnd();
  } else if (st.plan[0] === 'edge') {
    const cs = await glyphCenters();
    await page.mouse.move(cs[0].x, (cs[0].y + cs[1].y) / 2);  // 两个字正中间：一份光劈两半
    await awaitEnd();
  } else {
    for (const i of st.plan) await teach(i);
    if (st.douse) {
      const b = page.locator(`${host} [data-mini-action="douse"]`);
      if (await b.count()) await b.click();
    }
    await awaitEnd();
  }
  const op = await page.evaluate(() => window.__qa.op);
  const s = await snap();
  if (st.key === 'S1') await saveShot('B-S1-三个字都教成');
  if (st.key === 'S5') await saveShot('B-S5-不瞄-停在交界');
  if (st.key === 'S6') await saveShot('B-S6-什么都没教');
  rows.push({ st, op, s });
  console.log(`  ${st.key} ${st.name.padEnd(30)} 分 ${String(op?.score?.toFixed(3))}`
    + `　结局 ${String(op?.detail?.outcome).padEnd(11)}`
    + `　三字 ${String(op?.detail?.chars?.map((c) => c.state).join('/'))}`
    + `　剩油 ${op?.detail?.oilLeft}%　口令可用 ${op?.detail?.passwordOk ? '✓' : '✗'}`);
}
await saveShot('B-01-final');

const scores = rows.map((r) => r.op?.score ?? -1);
const uniq = [...new Set(scores.map((v) => v.toFixed(3)))];
console.log(`  得分档：${uniq.join(' / ')}（共 ${uniq.length} 档 / ${rows.length} 种打法）`);
console.log('  读法：S5 与 S2 同分不是 bug —— 吞吐做了归一化（prog += dt·raw/Σraw），');
console.log('        "劈成两半"合起来正好等于一次专攻的速度，所以停在交界是一种**保守打法**：');
console.log('        两个字各半速、第三个别想、油全烧光。要拿 0.980 必须精确到 1.1 秒以内。');

/* ── 口令与下游的对接 ── */
const pwRow = rows.find((r) => r.st.key === 'S4');
console.log('\n=== 与下游《夜岗》的接口 ===');
console.log(`  教成口令时 detail.password = ${rows.find((r) => r.st.key === 'S1').op?.detail?.password}`);
console.log(`  砍掉口令时 detail.password = "${pwRow?.op?.detail?.password}"（空串 → 夜岗走"没学过口令只能硬扛"分支）`);
console.log(`    passwordOk=${pwRow?.op?.detail?.passwordOk}　passwordRemembered=${pwRow?.op?.detail?.passwordRemembered}`);

/* ══════════════ C. 契约 + 减动效真点击 ══════════════ */
console.log('\n=== C. 契约与可点性 ===');
await startFixed();
const c = await snap();
console.log(`  host[data-mini] = '${c.mini}'　${c.mini === 'nightschool' ? '✓' : '✗'}`);
console.log(`  host[data-mini-state] = '${c.state}'　${c.state ? '✓' : '✗'}`);
console.log(`  [data-mini-action] = ${c.actions} 个（aim + begin）　${c.actions === 2 ? '✓' : '✗'}`);

/* ══════════════ D. 一灯油 · 排版体检 + 那条 P0 的回归 ══════════════ */
/* 为什么要单独有这一段：
   ① 先前"字"和"判定中心"差了 118px —— 玩家把光打在**看得见的字**上，一个字也教不动
      （六种打法全 0.000 就是这个）。肉眼看不出来，所以必须有断言钉住它。
   ② 先前"出自"那行和类名行重叠 25.5px、夜场里的提示文字用了浅色主题的深墨（等于没写）。
      这两条也是肉眼扫一眼容易放过的，一起钉住。 */
console.log('\n=== D. 一灯油 · 排版体检 + 可见字=可教字的回归 ===');
await startFixed();
await lightUp();
const dCs = await glyphCenters();
await page.mouse.move(dCs[0].x, dCs[0].y);
await page.waitForTimeout(2600);
const dSnap = await snap();
const dGeo = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#mini-host .smini3-row')];
  const out = rows.map((r, i) => {
    const from = r.querySelector('.smini3-from').getBoundingClientRect();
    const bar = document.querySelectorAll('#mini-host .smini3-bar')[i].getBoundingClientRect();
    const g = r.querySelector('.smini3-glyph');
    const gr = g.getBoundingClientRect();
    return {
      gap: bar.top - from.bottom,
      ink: getComputedStyle(g).color,
      fs: parseFloat(getComputedStyle(g).fontSize),
      gcx: gr.left + gr.width / 2, gcy: gr.top + gr.height / 2,
    };
  });
  const read = document.querySelector('#mini-host .smini3-read');
  const stage = document.querySelector('#mini-host .smini3-stage').getBoundingClientRect();
  return { cells: out, read: getComputedStyle(read).color, stage: { l: stage.left, t: stage.top, w: stage.width } };
});
// ① 可见字中心 → 换回设计坐标 → 必须就是判定中心（190.6 / 30+i*110+55）
const dDesign = {
  x: (dCs[0].x - dGeo.stage.l) / dGeo.stage.w * 720,
  y: (dGeo.cells[0].gcy - dGeo.stage.t) / (dGeo.stage.w / 720) / 1,   // 用同一比例换
};
console.log(`  光照在**看得见的字①**上 2.6s：miniFocus=${dSnap.focus}　三字完成度=${dSnap.taught}`);
console.log(`  字①可见中心 → 设计坐标 x=${dDesign.x.toFixed(1)}（判定中心 190.6）　差 ${Math.abs(dDesign.x - 190.6).toFixed(1)}px`);
const teachOk = Number(dSnap.focus) === 0 && Number(String(dSnap.taught || '0').split(',')[0]) > 0.3;
// 注意：dataset 读出来是**字符串**，"0" === 0 是 false —— 这里踩过一次，断言假红。
console.log(`  ${teachOk ? '✓' : '✗'} 光打在看得见的字上就教得动（这条就是先前 118px 偏移的回归）`);
const gaps = dGeo.cells.map((x) => x.gap);
console.log(`  三格的"出自 / 类名行"缝隙：${gaps.map((v) => v.toFixed(1)).join(' / ')} px　`
  + `${gaps.every((v) => v > 1) ? '✓ 不重叠' : '✗ 重叠'}`);
const inkL = (() => { const [r, g, b] = (dGeo.cells[0].ink.match(/[\d.]+/g) || []).map(Number);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); })();
const woodL = (() => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(194) + 0.7152 * f(161) + 0.0722 * f(115); })();
const contrast = (woodL + 0.05) / (inkL + 0.05);
console.log(`  墨字 ${dGeo.cells[0].ink}　字号 ${dGeo.cells[0].fs.toFixed(0)}px　对木牌对比度 ${contrast.toFixed(2)}:1　`
  + `${contrast >= 7 ? '✓' : '✗ 偏浅'}`);
const readLum = (() => { const [r, g, b] = (dGeo.read.match(/[\d.]+/g) || []).map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255; })();
console.log(`  读字条字色 ${dGeo.read} 相对亮度 ${readLum.toFixed(3)}　`
  + `${readLum > 0.5 ? '✓ 夜场里是浅字（不能用 --ink-*）' : '✗ 深字压黑底，等于没写'}`);

/* ══════════════ E. 夜校入口 + 知识竞答（真模型，2 次调用）══════════════ */
console.log('\n=== E. 夜校入口 → 知识竞答（题目由模型当场出）===');
await page.goto('http://localhost:3001/dev/minigame-lab.html?mini=nightschool-entry', { waitUntil: 'networkidle' });
await page.waitForSelector('#mini-host [data-mini-action="pick-quiz"]', { timeout: 20000 });
const eGeo = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const cards = [...document.querySelectorAll('#mini-host .smini5-card')];
  const lead = q('#mini-host .smini5-lead').getBoundingClientRect();
  const hit = cards.map((c) => { const r = c.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!(el && (c.contains(el) || el === c)); });
  return {
    mini: q('#mini-host').dataset.mini, state: q('#mini-host').dataset.miniState,
    acts: [...document.querySelectorAll('#mini-host [data-mini-action]')].map((n) => n.dataset.miniAction),
    titles: cards.map((c) => c.querySelector('.t').textContent),
    gap: cards[0].getBoundingClientRect().top - lead.bottom,
    horiz: cards[1].getBoundingClientRect().left - cards[0].getBoundingClientRect().right,
    hit,
  };
});
console.log(`  host[data-mini]=${eGeo.mini}　state=${eGeo.state}　操作=${eGeo.acts.join('/')}`);
console.log(`  两条路：${eGeo.titles.join(' ｜ ')}`);
console.log(`  卡片不与上文重叠：${eGeo.gap > 0 && eGeo.horiz > 0 ? '✓' : '✗'}`
  + `　两张卡都能真点：${eGeo.hit.every(Boolean) ? '✓' : '✗'}`);

/* 入口屏的可读性：字压在**照片**上，底色不是 CSS 颜色 → 只能采样像素。
   两处踩过：① `--ink-2`（#6a5a42）压在照片暗部只有 2.71:1，连 3:1 都够不上；
   ② 卡上的金色资源签（#a8863f）压纸面只有 2.04:1。现在是纸胎 + 深墨 + 金签配色。 */
const eBoxes = await page.evaluate(() => {
  const g = (s) => { const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(); return { k: s.split(' ').pop(), x: r.left, y: r.top, w: r.width, h: r.height,
      color: getComputedStyle(e).color, fs: getComputedStyle(e).fontSize }; };
  return [g('#mini-host .smini5-lead'), g('#mini-host .smini5-foot'), g('#mini-host .smini5-card .t'),
    g('#mini-host .smini5-card .why'), g('#mini-host .smini5-card .cost'), g('#mini-host .smini5-card .go'),
    g('#mini-host .smini5-card .n')].filter(Boolean);
});
const ePng = decodePng(await page.screenshot());
let legWorst = 99;
for (const b of eBoxes) {
  const c = regionContrast(ePng, b);
  legWorst = Math.min(legWorst, c.contrast);
  console.log(`  ${b.k.padEnd(5)} ${b.color} ${b.fs.padStart(5)}　底 ${b.w.toFixed(0)}×${b.h.toFixed(0)}`
    + `　对比 ${c.contrast.toFixed(2)}:1　${c.contrast >= 4.5 ? '✓' : (c.contrast >= 3 ? '△ 小字不达标' : '✗')}`);
}
console.log(`  ${legWorst >= 4.5 ? '✓' : '✗'} 入口屏最差一处 ${legWorst.toFixed(2)}:1（小字须 ≥4.5:1）`);
await saveShot('E-01-entry');

const tE = Date.now();
await page.locator('#mini-host [data-mini-action="pick-quiz"]').click();     // 不给 force
let quizOk = true;
try {
  await page.waitForFunction(() => document.querySelector('#mini-host')?.dataset?.miniState === 'ask',
    null, { timeout: 90000 });
} catch { quizOk = false; }
console.log(`  选"竞答" → host[data-mini]=${await page.evaluate(() => document.querySelector('#mini-host').dataset.mini)}`
  + `  miniPick=${await page.evaluate(() => document.querySelector('#mini-host').dataset.miniPick)}`
  + `　等模型出题 ${Date.now() - tE} ms　${quizOk ? '✓' : '✗ 超时'}`);

const answers = [];
if (quizOk) {
  for (let k = 0; k < 3; k++) {
    await page.waitForFunction((want) => {
      const el = document.querySelector('#mini-host');
      return el?.dataset?.miniState === 'ask' && Number(el.dataset.miniQ) === want;
    }, k, { timeout: 30000, polling: 'raf' });
    const a = await page.evaluate(() => Number(document.querySelector('#mini-host').dataset.miniAnswer));
    answers.push(a);
    await page.locator(`#mini-host .smini4-opt[data-mini-index="${a}"]`).click();   // 读内部答案是为了验分档
    await page.waitForFunction(() => document.querySelector('#mini-host')?.dataset?.miniState !== 'ask',
      null, { timeout: 8000, polling: 'raf' });
  }
}
console.log(`  三道题正确项下标：${answers.join(', ')}　distinct=${new Set(answers).size}　`
  + `${new Set(answers).size >= 2 ? '✓ 位置打散了（旧版三道全在 A，一路点 A 就满分）' : '✗ 仍挤在同一字母'}`);
await saveShot('E-02-quiz');
// 等 done：review 阶段结果还没写进 #c-result，"不是 ask/reveal"会读空
await page.waitForFunction(() => document.querySelector('#mini-host')?.dataset?.miniState === 'done',
  null, { timeout: 90000, polling: 'raf' });
const qRes = await resultJson();
console.log(`  结果：分 ${qRes.score}　结局 ${qRes.detail?.outcome}　答对 ${qRes.detail?.correct}/${qRes.detail?.total}`
  + `　口令 "${qRes.detail?.password}" ok=${qRes.detail?.passwordOk}　dir=${qRes.detail?.dir}`);
const quizScoreOk = qRes.score >= 0.97 && qRes.detail?.outcome === 'all' && !!qRes.detail?.password;
console.log(`  ${quizScoreOk ? '✓' : '✗'} 三道全对 → 0.98 / all / 口令可用（格式与《一灯油》对齐）`);

/* ══════════════ F. 知识竞答 · 固定题三档（零模型调用）══════════════ */
console.log('\n=== F. 竞答固定题三档（0 次调用，数字必须可复现）===');
const QF = {
  password: '瑞金',
  questions: [
    { q: '「瑞」字出自哪个地方？', options: ['遵义', '于都', '瑞金', '赤水'], answer: 2, explain: '瑞金在江西。' },
    { q: '「松潘」在哪儿？', options: ['遵义', '松潘', '泸定桥', '湘江'], answer: 1, explain: '松潘在四川。' },
    { q: '今晚的口令是哪一个？', options: ['遵义', '于都', '瑞金', '赤水'], answer: 2, explain: '口令就是今晚的暗号：瑞金。' },
  ],
};
async function runFixedQuiz(secPerQ, mode) {
  await page.evaluate(async ({ quiz, secPerQ }) => {
    const old = document.querySelector('#mini-host');
    const el = document.createElement('div');
    el.id = 'mini-host';
    if (old) old.replaceWith(el);
    const slot = { op: null };
    window.__qa = slot;
    const m = await import('/js/minigames-school-quiz.js?v=' + Date.now());
    m.runNightSchoolQuiz(el, { quiz, place: '草地', noReview: true, secPerQ }).then((op) => { slot.op = op; });
  }, { quiz: QF, secPerQ });
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.querySelector('#mini-host')?.dataset?.miniState === 'ask', null, { timeout: 12000 });
  if (mode !== 'timeout') {
    for (let k = 0; k < 3; k++) {
      // **每轮都要重新等一次 ask 且对齐 miniQ** —— 不等就会拿上一题的 miniAnswer 去点下一题
      // （踩过：那样"全答对"只有 1/3，会误判成分档坏了。这是测试的竞态，不是玩法的错。）
      await page.waitForFunction((want) => {
        const el = document.querySelector('#mini-host');
        return el?.dataset?.miniState === 'ask' && Number(el.dataset.miniQ) === want;
      }, k, { timeout: 30000, polling: 'raf' });
      const a = await page.evaluate(() => Number(document.querySelector('#mini-host').dataset.miniAnswer));
      const i = mode === 'right' ? a : (a + 1) % 4;
      await page.locator(`#mini-host .smini4-opt[data-mini-index="${i}"]`).click();
      // 点完要能观测到"就是点了这一项"，否则分档数字不可信
      await page.waitForFunction((want) => Number(document.querySelector('#mini-host')?.dataset?.miniPicked) === want,
        i, { timeout: 4000, polling: 'raf' });
      await page.waitForFunction(() => document.querySelector('#mini-host')?.dataset?.miniState !== 'ask',
        null, { timeout: 8000, polling: 'raf' });
    }
  }
  await page.waitForFunction(() => document.querySelector('#mini-host')?.dataset?.miniState === 'done',
    null, { timeout: 40000, polling: 'raf' });
  return page.evaluate(() => window.__qa.op);
}
const qfRight = await runFixedQuiz(30, 'right');
const qfWrong = await runFixedQuiz(30, 'wrong');
const qfLate = await runFixedQuiz(1.2, 'timeout');
const line = (tag, o, extra = '') => console.log(`  ${tag}　分 ${String(o?.score).padEnd(6)}　结局 ${String(o?.detail?.outcome).padEnd(5)}`
  + `　口令 "${o?.detail?.password}"${extra}`);
line('全答对  ', qfRight, `　ok=${qfRight?.detail?.passwordOk}`);
line('全答错  ', qfWrong, `　ok=${qfWrong?.detail?.passwordOk}　remembered=${qfWrong?.detail?.passwordRemembered}`);
line('全超时  ', qfLate, `　每题 timeout=${qfLate?.detail?.answers?.map((a) => (a.timeout ? '1' : '0')).join('')}`
  + `　picked 全 -1=${qfLate?.detail?.answers?.every((a) => a.picked === -1) ? '✓' : '✗'}`);
const qTiers = new Set([qfRight, qfWrong, qfLate].map((o) => Number(o?.score).toFixed(3)));
console.log(`  三档：${[...qTiers].join(' / ')}（共 ${qTiers.size} 档 / 3 种打法）`);
console.log(`  答错的会被当成对的记住（remembered=true 而 ok=false）：`
  + `${qfWrong?.detail?.passwordRemembered && !qfWrong?.detail?.passwordOk ? '✓' : '✗'}`);

await ctx.close();

/* 减动效：项目历史上的 P0 —— 板屏整块点不动。
   必须**不带 force** 真点，且先确认 elementFromPoint 命中的就是那个按钮。 */
const ctx2 = await browser.newContext({
  viewport: { width: 1600, height: 1320 }, deviceScaleFactor: 1, reducedMotion: 'reduce',
});
const p2 = await ctx2.newPage();
const errs2 = [];
p2.on('pageerror', (e) => errs2.push('PAGEERROR: ' + e.message));
await p2.goto('http://localhost:3001/dev/minigame-lab.html?mini=nightschool', { waitUntil: 'networkidle' });
await p2.waitForFunction(
  () => document.querySelector('#mini-host')?.dataset?.miniState === 'intro', null, { timeout: 90000 });
const hit = await p2.evaluate(() => {
  const b = document.querySelector('#mini-host [data-mini-action="begin"]');
  if (!b) return { ok: false, why: '找不到"点上灯"按钮' };
  const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { ok: b.contains(el), why: el ? el.className || el.tagName : '命中空白', rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
});
console.log(`  reduced-motion 下"点上灯"可命中：${hit.ok ? '✓' : '✗ ' + hit.why}`);
let clickOk = false;
try {
  await p2.locator('#mini-host [data-mini-action="begin"]').click({ timeout: 4000 });   // 不给 force
  await p2.waitForFunction(
    () => document.querySelector('#mini-host')?.dataset?.miniState === 'play', null, { timeout: 4000 });
  clickOk = true;
} catch (e) { clickOk = false; }
console.log(`  reduced-motion 下真点击（无 force）能开局：${clickOk ? '✓ 状态转到 play' : '✗ 点不动'}`);
await p2.screenshot({ path: path.join(OUT, 'C-01-reduced-motion-play.png') });
await ctx2.close();

console.log('\n=== 页面报错 ===');
const allErrs = [...errs, ...errs2];
console.log(allErrs.length ? allErrs.join('\n') : '无');
await browser.close();

/* ── 汇总 ── */
const contractOk = c.mini === 'nightschool' && !!c.state && c.actions === 2;
console.log('\n=== 汇总 ===');
console.log(`  模型路径可用（出得了课本且过闸）：${gateOk ? '✓' : '✗'}`);
console.log(`  六种打法分档数：${uniq.length}（含一次"什么都没教"）`);
console.log(`  契约 4/4：${contractOk ? '✓' : '✗'}　减动效真点击：${clickOk ? '✓' : '✗'}　页面报错：${allErrs.length}`);
console.log(`  一灯油排版：三格缝隙 ${gaps.every((v) => v > 1) ? '✓' : '✗'}`
  + `　墨字对比度 ${contrast.toFixed(2)}:1 ${contrast >= 7 ? '✓' : '✗'}`
  + `　读字条浅字 ${readLum > 0.5 ? '✓' : '✗'}`);
console.log(`  可见字=可教字（118px 偏移的回归）：${teachOk ? '✓' : '✗'}　`
  + `光打在看得见的字上 2.6s → 完成度 ${(dSnap.taught || '').split(',')[0]}`);
console.log(`  夜校入口：两条路都在、都能点、都能走到底：`
  + `${eGeo.titles.length === 2 && eGeo.hit.every(Boolean) && quizOk ? '✓' : '✗'}`);
console.log(`  竞答（真模型）：答案位置打散 ${new Set(answers).size >= 2 ? '✓' : '✗'}`
  + `　全对 0.98/口令可用 ${quizScoreOk ? '✓' : '✗'}`);
console.log(`  竞答（固定题三档）：${[...qTiers].join(' / ')}　`
  + `错答被当成对的记住 ${qfWrong?.detail?.passwordRemembered && !qfWrong?.detail?.passwordOk ? '✓' : '✗'}`);
