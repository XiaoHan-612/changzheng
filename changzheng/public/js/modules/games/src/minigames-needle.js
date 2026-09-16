/**
 * 《弯针成钩》· 火与铁（**精修版 · 单独开发，未接入主线**）
 *
 * ── 它取代的是什么 ──
 *   旧版（minigames.js 的 runBendNeedle，35 行）：一个按钮点三下，每次 i += 1，
 *   必然 score 1。"玩家"没有任何决策，也没有输的可能 —— 那是动画，不是游戏。
 *
 * ── 这一版是什么 ──
 *   老班长的炭盆边，就一根缝衣针。要做成一枚能用的钩，得同时管住三件事：
 *     ① 火候   低于 50 针身发青、发硬，硬弯就断；高于 90 钢开始"酥"（过烧），
 *              酥到 100 针就废了。**要弯，就得让它待在 50–90 这条带里。**
 *     ② 两段弯 钩门（222–250°）和钩尖（42–64°）各有各的甜区。
 *              钩门不够 = 挂不住鱼；钩门过头 = 崩口断针。
 *     ③ 时机   针离火就凉，弯折本身也在散热。一只眼睛盯火候、一只手管弯折 ——
 *              跟钓鱼那支"按住收线、盯张力甜区"是同一个手上的活。
 *
 * ── 三种死法（都会让你手里只剩半截针）──
 *   · 冷了还硬弯（`snapped`）—— 温度低于 50 时继续用力，0.5 秒内"咯"一声断
 *   · 弯过了头（`snapped` / `tipbreak`）—— 钩门 > 292° 或钩尖 > 92°
 *   · 烧白了（`burnt`）  —— 针身"酥"积到 100
 *
 * ── 与《金色的鱼钩》的关系（用户点名要的）──
 *   理想钩 = 钩门 236° + 钩尖 53° = **289°**，与钓鱼那支钩的弧
 *   `arc(cx, cy-r, r, π*0.12, π*1.72)`（= 1.6π = 288°）同量。
 *   成品用的是同一支金色 `#e3bd66`、同一档辉光 —— 弯出来的就是那枚钩。
 *   定妆镜头把它冷却、擦亮、立起来，跟钓鱼特写里那枚一模一样。
 *
 * ── 独立到什么程度 ──
 *   不 import minigames.js；不进 minigames-registry.js；不写 acts.json。
 *   自带 stats / cssVar / palette / sfx；样式运行时注入（前缀 nmini-）。
 *   唯一外部依赖是 audio.js，且调用处全包了 try。
 *
 * ── 契约（与主线玩法完全一致，见 public/js/step.js 顶部）──
 *   1. 签名  runXxx(container, opts) -> Promise<{ score: 0..1, detail, summary? }>
 *   2. 容器  container.dataset.mini / container.dataset.miniState
 *   3. 操作  所有可交互元素带 [data-mini-action]
 *   4. 自清  离开板屏后动画 / 定时器 / 监听自行停止
 *
 * ── 额外可观测状态（自动化靠它们判"什么时候该松手"）──
 *   miniHeat / miniBody / miniTip / miniOxide / miniStrain / miniInFire
 *   结局另有 miniState='done' + miniOutcome='perfect|ok|straight|flat-tip|narrow|wide|snapped|tipbreak|burnt'
 *
 * 玩法 id：`bendhook`（接线时注册表那条 `needle` 要改成这个 id + 指到本文件的 run）
 */

/* ── 宿主注入（我们的架构：玩法不碰音频门面、数值签归宿主）────────────────
 * 这一段由 tools/intake-minigames.mjs 插入；要改缝合方式请改工具，别手改这里。
 * 宿主（modules/games/adapter.js）在装配这一支时调 bindHost({sfx, stats, decide})：
 *   sfx(name)     音效：宿主转成总线事件 sfx:play（玩法不认识音频框架）
 *   stats(items)  数值签：宿主唯一实现，返回句柄（{标签: <b>元素}）
 *   decide(payload) 需要模型时由流程层注入（玩法自己不发请求，见 docs/MINIGAMES-INTAKE.md）
 */
let SFX = () => {};
let STATS = (items) => items;
let DECIDE = null;
export function bindHost(h = {}) {
  if (h.sfx) SFX = h.sfx;
  if (h.stats) STATS = h.stats;
  if (h.decide) DECIDE = h.decide;
}

/* ── 小工具（与 minigames.js / minigames-fishing.js 同名同义，故意不共享） ── */

function stats(_host, items) { return STATS(items); }

function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function sfx(name) {
  try { SFX(name); } catch { /* 单独搬走没有音频模块也不该炸 */ }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;
const rnd = (a, b) => a + Math.random() * (b - a);
const PI = Math.PI;

/** 确定性随机：炭块摆位、雨丝、针身灰斑每局一样，画面才稳 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 界面语义色走 tokens；火光、铁色这些是这幅画自己的色，写死在这里。 */
function palette() {
  return {
    alert: '#d9694f',
    gold: cssVar('--gold', '#b8963e'),
    seal: cssVar('--seal', '#a8322a'),
    num: cssVar('--font-num', 'ui-monospace, monospace'),
    /* 画面上的小字专用栈。数字仍吃 EB Garamond（`num`），
       汉字**落到无衬线**——`--font-num` 的下一顺位是 serif（Noto Serif SC），
       而宋体在 8px 上下笔画会糊成一片。这就是画面上那几行字发虚的主因之一。 */
    ui: '"num", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", system-ui, -apple-system, sans-serif',
  };
}

/* 画面上的字按**物理像素**定死：不管画布被压到多窄，字在屏幕上一样大。
   —— 就是这次"文字发糊"的根因：原来写死 10 设计 px，而画布 720 的设计宽度
   实际只显示 570，缩放 0.79 → 屏幕上是 7.9px 的宋体，笔画糊成一团。
   `HUD_PX` 是目标屏幕字号；另两个是"设计坐标"下的上下限，
   免得画布极窄时字撑破仪表盘的排布。 */
const HUD_PX = 13;        // 目标屏幕字号（CSS px）
const HUD_FP_MIN = 11.5;  // 设计坐标下限
const HUD_FP_MAX = 21;    // 设计坐标上限

/* 松潘草地 · 1935 年 8 月 · 夜里的冷雨
   一顶帐篷、一堆快烧尽的炭、一根缝衣针。整幅画压成湿冷的蓝黑，
   只有炭火是暖的、只有那枚弯到最后的钩是金的。 */
const SC = {
  skyTop: '#0d1316', skyMid: '#161e21', skyLow: '#232a28',
  tent: '#101617',                            // 雾里宿营的帐篷
  hillFar: '#1a2220', hillNear: '#141a17',
  ground: '#1b1d16',
  rain: 'rgba(206,222,220,0.13)',
  panB: '#22211d', panC: '#4d4940',           // 铁皮盆
  coalBlack: '#1a1a18', coalAsh: '#4a4740', coalHot: '#8a3418',
  flameCore: '#ffe6b0', flameMid: '#ff9a3c', flameEdge: '#c8451c',
  plier: '#5d6165', plierDark: '#33373a',
  steel: '#c9ced2',                            // 常温的针
  gold: '#e3bd66',                             // 磨亮之后的钩 —— 与钓鱼那支同一支金色
};

function ensureStyle() {
  if (document.getElementById('needle-mini-style')) return;
  const s = document.createElement('style');
  s.id = 'needle-mini-style';
  s.textContent = `
.nmini-wrap { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.nmini-canvas { display: block; width: 100%; max-width: 720px; height: auto; margin: 0 auto;
  border-radius: 6px; border: 1px solid var(--rule-strong); background: #10161a; }
.nmini-status { min-height: 24px; margin: 0; text-align: center; font-size: 15px;
  color: var(--ink-0); font-family: var(--font-kai, var(--font)); letter-spacing: .02em; }
.nmini-status.warn { color: var(--seal); }
.nmini-status.good { color: var(--gold); }
/* 提示文字：原来是 11px + --ink-2（纸上的浅褐），挤在这块板上根本读不动。
   提到 13px、换成深一档的 --ink-1，行距也放开。 */
.nmini-hint { margin: 0; text-align: center; font-size: var(--fs-label, 13px); color: var(--ink-1); line-height: 1.75; }
.nmini-hint b { color: var(--ink-0); font-weight: 400; }
.nmini-btn[aria-pressed="true"] { border-color: var(--seal); background-color: rgba(168,50,42,0.14); }
.nmini-btn:disabled { opacity: .45; }
`;
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════════════════
   工序参数 —— 一局游戏的全部规则
   ══════════════════════════════════════════════════════════════════ */
const NEEDLE = {
  heatGain: 74,          // 按住「烧针」：升温 /s
  heatLoss: 12,          // 离火降温 /s
  bendHeatCost: 5,       // 弯折时额外掉温 /s（弯折本身也在散热）
  band: [50, 90],        // 火候甜区：低于 50 发硬、高于 90 要酥（与钓鱼的 45–82 同一个意思）
  overheat: 92,          // 开始积"酥"的温度
  oxideRate: 26,         // 过烧时积酥 /s（按超出量加权）
  tapOxide: 3.5,         // 每次把针重新伸进火里，针身多一分酥（反复加热让钢变脆）
  oxideFail: 100,        // 酥到这个数，针就废了
  coldRate: 0.16,        // 温度不够时弯得几乎不动
  strainLimit: 0.5,      // 冷着硬弯撑多久会断（秒）
  bodyGain: 58,          // 钩门弯折速度 °/s
  tipGain: 78,           // 钩尖弯折速度 °/s
  tipBreak: 92,          // 钩尖弯过这个数，尖崩
};

/** 理想钩：钩门 236° + 钩尖 53° = 289° ≈ 1.6π —— 与钓鱼那支钩的弧度同量 */
const GOAL = {
  body: [222, 250], bodyMax: 292,
  tip: [42, 64], tipMax: NEEDLE.tipBreak,
  ideal: { body: 236, tip: 53 },
};

/* ══════════════════════════════════════════════════════════════════
   画面常量
   ══════════════════════════════════════════════════════════════════ */
const W = 720;
const H = 400;
const HORIZON = 236;        // 天地线
const TAIL_X = 132;         // 针眼端固定在画面这个 x
const WORK_Y = 200;         // 待弯位：针悬在盆口上方
const FIRE_Y = 306;         // 伸进火里：针没入火苗
const NEEDLE_LEN = 188;
const SEC_A = 0.45;         // 直段（针眼端 → 弯折点）占比
const SEC_B = 0.45;         // 钩门弧占比
const PAN = { x: 250, y: 330, rx: 152, ry: 40 };   // 炭盆盆口椭圆
const SHOWCASE = { x: 320, y: 234 };               // 定妆时钩的中心

const IDX_A = 6;            // 直段采样点数
const IDX_B = 12;           // 钩门弧采样点数
const IDX_C = 6;            // 钩尖弧采样点数

/** 把针按「直段 + 钩门弧 + 钩尖弧」积分成一条中线（起点针眼端、初始朝向 +x、角度向下卷） */
function needlePath(bodyDeg, tipDeg, len = NEEDLE_LEN) {
  const lA = len * SEC_A, lB = len * SEC_B, lC = len * (1 - SEC_A - SEC_B);
  const pts = [];
  let x = 0, y = 0, a = 0;
  const push = () => pts.push({ x, y, a });
  push();
  for (let i = 1; i <= IDX_A; i++) { x += lA / IDX_A; push(); }
  const dAB = (bodyDeg * PI / 180) / IDX_B;
  for (let i = 0; i < IDX_B; i++) { a += dAB; x += Math.cos(a) * (lB / IDX_B); y += Math.sin(a) * (lB / IDX_B); push(); }
  const dAC = (tipDeg * PI / 180) / IDX_C;
  for (let i = 0; i < IDX_C; i++) { a += dAC; x += Math.cos(a) * (lC / IDX_C); y += Math.sin(a) * (lC / IDX_C); push(); }
  return pts;
}
function bboxOf(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
}

/* ── 铁的颜色随温度走：常温冷灰 → 暗红 → 樱红 → 橙黄 → 白热 ── */
const TEMP_STOPS = [
  [0, [201, 206, 210]],
  [38, [176, 152, 132]],
  [56, [150, 62, 40]],
  [72, [206, 74, 40]],
  [86, [240, 116, 52]],
  [100, [255, 232, 180]],
];
function steel(heat) {
  const v = clamp(heat, 0, 100);
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [h1, c1] = TEMP_STOPS[i];
    if (v <= h1) {
      const [h0, c0] = TEMP_STOPS[i - 1];
      const p = (v - h0) / (h1 - h0 || 1);
      return `rgb(${Math.round(lerp(c0[0], c1[0], p))},${Math.round(lerp(c0[1], c1[1], p))},${Math.round(lerp(c0[2], c1[2], p))})`;
    }
  }
  const c = TEMP_STOPS[TEMP_STOPS.length - 1][1];
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const heatGlow = (heat) => clamp((heat - 36) / 64, 0, 1);

function hex2rgb(hh) {
  const s = hh.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function blendHex(a, b, p) {
  const pa = hex2rgb(a), pb = hex2rgb(b);
  return `rgb(${Math.round(lerp(pa[0], pb[0], p))},${Math.round(lerp(pa[1], pb[1], p))},${Math.round(lerp(pa[2], pb[2], p))})`;
}

/* ══════════════════════════════════════════════════════════════════
   场景
   ══════════════════════════════════════════════════════════════════ */
function drawSky(g, t) {
  const sky = g.createLinearGradient(0, 0, 0, HORIZON + 20);
  sky.addColorStop(0, SC.skyTop);
  sky.addColorStop(0.62, SC.skyMid);
  sky.addColorStop(1, SC.skyLow);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, HORIZON + 20);

  // 雨：斜着从左上飘到右下，很长、很淡 —— 这一夜没停过
  g.strokeStyle = SC.rain;
  g.lineWidth = 1;
  for (let i = 0; i < 54; i++) {
    const rx = ((i * 137.5) % W) - 40;
    const ry = (i * 61.7) % 300;
    const yy = (ry + t * 190) % 300;
    const xx = rx + yy * 0.34 + t * 12;
    g.beginPath();
    g.moveTo(xx, yy + 120);
    g.lineTo(xx + 5, yy + 128);
    g.stroke();
  }

  // 远处：两道草丘脊线，再远是雾里宿营的帐篷（只看得见最亮的一点余火）
  g.fillStyle = SC.hillFar;
  g.beginPath();
  g.moveTo(-20, HORIZON);
  for (let x = -20; x <= W + 20; x += 40) g.lineTo(x, HORIZON - 16 - Math.sin(x * 0.011) * 9 - Math.sin(x * 0.031 + 1.2) * 4);
  g.lineTo(W + 20, HORIZON + 8);
  g.lineTo(-20, HORIZON + 8);
  g.fill();
  g.fillStyle = SC.hillNear;
  g.beginPath();
  g.moveTo(-20, HORIZON + 4);
  for (let x = -20; x <= W + 20; x += 30) g.lineTo(x, HORIZON - 5 - Math.sin(x * 0.021 + 2.4) * 5);
  g.lineTo(W + 20, HORIZON + 14);
  g.lineTo(-20, HORIZON + 14);
  g.fill();

  const glow = g.createRadialGradient(96, HORIZON - 6, 2, 96, HORIZON - 6, 70);
  glow.addColorStop(0, 'rgba(196,110,46,0.30)');
  glow.addColorStop(1, 'rgba(196,110,46,0)');
  g.fillStyle = glow;
  g.fillRect(20, HORIZON - 76, 160, 90);
  for (const [tx, tw, th] of [[78, 34, 26], [116, 28, 21], [148, 22, 17]]) {
    g.fillStyle = SC.tent;
    g.beginPath();
    g.moveTo(tx, HORIZON - 4);
    g.lineTo(tx + tw * 0.5, HORIZON - 4 - th);
    g.lineTo(tx + tw, HORIZON - 4);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(214,128,54,0.16)';
    g.beginPath();
    g.moveTo(tx + tw * 0.5, HORIZON - 4 - th);
    g.lineTo(tx + tw, HORIZON - 4);
    g.lineTo(tx + tw * 0.72, HORIZON - 4);
    g.closePath();
    g.fill();
  }
}

function drawGround(g, warmK) {
  const gr = g.createLinearGradient(0, HORIZON, 0, H);
  gr.addColorStop(0, SC.hillNear);
  gr.addColorStop(0.35, SC.ground);
  gr.addColorStop(1, '#0f110c');
  g.fillStyle = gr;
  g.fillRect(0, HORIZON, W, H - HORIZON);

  // 火落在地上的一圈暖光（随火苗一起呼吸）
  g.save();
  g.globalCompositeOperation = 'lighter';
  const warm = g.createRadialGradient(PAN.x, PAN.y - 10, 8, PAN.x, PAN.y - 10, 268 * warmK);
  warm.addColorStop(0, 'rgba(226,132,52,0.34)');
  warm.addColorStop(0.45, 'rgba(176,94,40,0.13)');
  warm.addColorStop(1, 'rgba(176,94,40,0)');
  g.fillStyle = warm;
  g.fillRect(0, HORIZON - 30, W, H - HORIZON + 30);
  g.restore();

  // 湿地上的草：短、倒、被雨压着
  g.strokeStyle = 'rgba(120,130,96,0.20)';
  g.lineWidth = 1;
  const r = mulberry32(7);
  for (let i = 0; i < 130; i++) {
    const bx = r() * (W + 40) - 20;
    const by = HORIZON + 6 + r() * (H - HORIZON - 10);
    const len = 3 + r() * 6;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + 1.6 + r() * 2, by - len);
    g.stroke();
  }
}

/** 铁皮盆 + 炭 + 火苗 + 火星；返回火焰根部 y */
function drawBrazier(g, t, firePulse, sparks) {
  const { x, y, rx, ry } = PAN;

  const bowl = g.createLinearGradient(x, y, x, y + 62);
  bowl.addColorStop(0, SC.panB);
  bowl.addColorStop(1, '#141310');
  g.fillStyle = bowl;
  g.beginPath();
  g.moveTo(x - rx, y);
  g.bezierCurveTo(x - rx + 6, y + 52, x + rx - 6, y + 52, x + rx, y);
  g.closePath();
  g.fill();

  g.fillStyle = '#14120e';
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, PI * 2); g.fill();
  g.strokeStyle = SC.panC;
  g.lineWidth = 3.4;
  g.beginPath(); g.ellipse(x, y, rx - 1, ry - 1, 0, 0, PI * 2); g.stroke();
  g.strokeStyle = 'rgba(226,150,70,0.30)';
  g.lineWidth = 1.4;
  g.beginPath(); g.ellipse(x, y + 1.6, rx - 3, ry - 2, 0, PI * 0.05, PI * 0.95); g.stroke();

  // 炭：一圈黑炭，中间几块烧红的
  const r = mulberry32(21);
  for (let i = 0; i < 15; i++) {
    const a = r() * PI * 2;
    const rr = 0.30 + r() * 0.62;
    const cx = x + Math.cos(a) * rx * rr * 0.86;
    const cy = y + Math.sin(a) * ry * rr * 0.86;
    const w2 = 7 + r() * 15;
    const h2 = 5 + r() * 8;
    const hot = r();
    g.save();
    g.translate(cx, cy);
    g.rotate(r() * PI);
    const path = () => {
      g.beginPath();
      g.moveTo(-w2 / 2, 0);
      g.lineTo(-w2 * 0.22, -h2 / 2);
      g.lineTo(w2 * 0.42, -h2 * 0.4);
      g.lineTo(w2 / 2, h2 * 0.18);
      g.lineTo(w2 * 0.06, h2 / 2);
      g.closePath();
    };
    g.fillStyle = hot > 0.62 ? SC.coalHot : hot > 0.34 ? SC.coalAsh : SC.coalBlack;
    path();
    g.fill();
    if (hot > 0.62) {
      g.shadowColor = 'rgba(255,150,60,0.85)';
      g.shadowBlur = 10;
      g.fillStyle = 'rgba(255,170,80,0.55)';
      path();
      g.fill();
    }
    g.restore();
  }

  // 火焰：七条舌，各自抖 —— 叠加混合，才像光不像贴纸
  const baseY = y - 6;
  g.save();
  g.globalCompositeOperation = 'lighter';
  drawFlames(g, t, firePulse, baseY, 1);
  const core = g.createRadialGradient(x, baseY - 6, 2, x, baseY - 6, 66);
  core.addColorStop(0, 'rgba(255,232,178,0.55)');
  core.addColorStop(0.5, 'rgba(255,150,60,0.20)');
  core.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = core;
  g.fillRect(x - 90, baseY - 80, 180, 110);
  for (const s of sparks) {
    g.fillStyle = `rgba(255,196,106,${clamp(s.life, 0, 1) * 0.9})`;
    g.beginPath();
    g.arc(s.x, s.y, s.r, 0, PI * 2);
    g.fill();
  }
  g.restore();
  return baseY;
}

/** 七条火舌。k 用于"针伸进去"时把火拉高一点 */
function drawFlames(g, t, firePulse, baseY, k) {
  for (let i = 0; i < 7; i++) {
    const fx = PAN.x - 62 + i * 21 + Math.sin(t * (1.3 + i * 0.21) + i) * 4;
    const hgt = ((34 + (i % 3) * 12) * (1 + firePulse * 0.10) + Math.sin(t * (2.4 + i * 0.33) + i * 1.7) * 5) * k;
    const wid = 13 + (i % 2) * 5;
    const sway = Math.sin(t * (1.7 + i * 0.27) + i * 2.1) * 5;
    const fg = g.createLinearGradient(0, baseY, 0, baseY - hgt);
    fg.addColorStop(0, SC.flameEdge);
    fg.addColorStop(0.42, SC.flameMid);
    fg.addColorStop(0.86, SC.flameCore);
    fg.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(fx - wid / 2, baseY);
    g.bezierCurveTo(fx - wid * 0.52, baseY - hgt * 0.46, fx + sway - wid * 0.16, baseY - hgt * 0.78, fx + sway, baseY - hgt);
    g.bezierCurveTo(fx + sway + wid * 0.16, baseY - hgt * 0.78, fx + wid * 0.52, baseY - hgt * 0.46, fx + wid / 2, baseY);
    g.closePath();
    g.fill();
  }
}

/* ── 钳子：钳口咬在局部原点，钳身朝 ang 方向伸出去 ── */
function drawPliers(g, ang, len = 96) {
  g.save();
  g.rotate(ang);
  for (const spread of [-0.055, 0.055]) {
    g.save();
    g.rotate(spread);
    const grad = g.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, SC.plier);
    grad.addColorStop(0.55, SC.plierDark);
    grad.addColorStop(1, '#1d2022');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, -3.2);
    g.lineTo(len, -5.4);
    g.lineTo(len, 5.4);
    g.lineTo(0, 3.2);
    g.closePath();
    g.fill();
    // 钳口内侧的一道亮边：夹住东西的地方才亮
    g.strokeStyle = 'rgba(228,236,238,0.34)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(2, -2.4);
    g.lineTo(26, -2.9);
    g.stroke();
    g.restore();
  }
  g.fillStyle = '#2a2e30';
  g.beginPath(); g.arc(17, 0, 5.4, 0, PI * 2); g.fill();
  g.strokeStyle = 'rgba(210,216,218,0.30)';
  g.lineWidth = 1.2;
  g.beginPath(); g.arc(17, 0, 5.4, 0, PI * 2); g.stroke();
  g.restore();
}

function strokeSeg(g, pts, i0, i1, w, color) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(pts[i0].x, pts[i0].y);
  for (let i = i0 + 1; i <= i1; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke();
}

/** 针：三段不同粗细 + 上缘高光 + 针眼 + 温度色 + 灰斑
 *  注意：断成两截时传进来的是一条**残段**，所以三个分段点都要夹到实际长度里。 */
function drawNeedle(g, pts, heat, oxide, opt = {}) {
  const n = pts.length - 1;
  const iB = Math.min(IDX_A, n);
  const iC = Math.min(IDX_A + IDX_B, n);
  const iEnd = n;
  const goldT = opt.goldT || 0;
  const col = goldT > 0
    ? (goldT >= 1 ? SC.gold : blendHex(SC.steel, SC.gold, goldT))
    : steel(heat);
  const heatA = heatGlow(heat);

  g.save();
  if (heatA > 0.02 || goldT > 0) {
    g.shadowColor = goldT > 0
      ? `rgba(226,186,96,${0.42 + 0.5 * goldT})`
      : `rgba(255,124,52,${0.25 + heatA * 0.5})`;
    g.shadowBlur = goldT > 0 ? 8 + 5 * goldT : 4 + heatA * 12;
  }
  strokeSeg(g, pts, 0, iB, 3.0, col);
  if (iC > iB) strokeSeg(g, pts, iB, iC, 2.6, col);
  if (iEnd > iC) strokeSeg(g, pts, iC, iEnd, 1.7, col);
  g.restore();

  // 上缘高光：一条细白线贴着针走 —— 金属味就靠它（法线朝上 = 航向转 -90°）
  g.strokeStyle = goldT > 0 ? 'rgba(255,244,206,0.55)' : `rgba(246,250,252,${0.24 + heatA * 0.3})`;
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i <= iEnd; i++) {
    const p = pts[i];
    const px = p.x + Math.sin(p.a) * 1.1;
    const py = p.y - Math.cos(p.a) * 1.1;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke();

  // 针眼：靠针眼端那一段是个长槽 —— 绑线就从这儿过
  if (pts.length > IDX_A) {
    const e0 = pts[1], e1 = pts[Math.max(2, Math.round(IDX_A * 0.42))];
    g.strokeStyle = 'rgba(12,16,18,0.85)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(e0.x + 2, e0.y);
    g.lineTo(e1.x - 2, e1.y);
    g.stroke();
  }

  // 过烧的灰斑 / 起皮：白灰色的一层酥
  if (oxide > 4) {
    const r = mulberry32(1337);
    const n = Math.min(22, Math.floor(oxide / 4.4));
    for (let i = 0; i < n; i++) {
      const p = pts[Math.min(iEnd, 1 + Math.floor(r() * iEnd))];
      const jx = (r() - 0.5) * 2.4, jy = (r() - 0.5) * 2.4;
      g.save();
      g.translate(p.x + jx, p.y + jy);
      g.rotate(p.a);
      g.fillStyle = `rgba(226,224,214,${clamp(oxide / 150, 0.05, 0.5)})`;
      g.beginPath();
      g.ellipse(0, 0, 1.6 + r() * 2.4, 0.9 + r() * 1.1, 0, 0, PI * 2);
      g.fill();
      g.restore();
    }
  }
}

/** 冷着硬弯时弯折点上那道"要断了"的亮缝 */
function drawStrain(g, at, ang, amount) {
  if (amount <= 0.02) return;
  const aa = clamp(amount, 0, 1);
  g.save();
  g.translate(at.x, at.y);
  g.rotate(ang);
  g.strokeStyle = `rgba(255,${Math.round(240 - aa * 60)},220,${0.5 + aa * 0.5})`;
  g.lineWidth = 1.2 + aa * 1.4;
  g.beginPath();
  g.moveTo(0, -4.2);
  g.lineTo(Math.sin(aa * 9) * 1.4, 4.2);
  g.stroke();
  g.restore();
}

/* ══════════════════════════════════════════════════════════════════
   HUD
   ══════════════════════════════════════════════════════════════════ */
function meter(g, P, x, y, w, hh, v, color, band) {
  g.fillStyle = 'rgba(8,10,12,0.66)';
  g.fillRect(x, y, w, hh);
  if (band) {
    g.fillStyle = 'rgba(184,150,62,0.40)';
    g.fillRect(x + band[0] * w, y, (band[1] - band[0]) * w, hh);
  }
  g.fillStyle = color;
  g.fillRect(x, y, w * clamp(v, 0, 1), hh);
  g.strokeStyle = 'rgba(238,232,212,0.26)';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
  if (band) {
    g.strokeStyle = 'rgba(246,241,229,0.55)';
    g.beginPath();
    for (const b of band) { g.moveTo(x + b * w + 0.5, y - 1.5); g.lineTo(x + b * w + 0.5, y + hh + 1.5); }
    g.stroke();
  }
  const px = x + clamp(v, 0, 1) * w;
  g.fillStyle = '#f6f2e4';
  g.fillRect(px - 1, y - 2.5, 2, hh + 5);
}

/** 画面上的字。fpx 是**设计坐标**下的字高 —— 调用方用 `HUD_PX / viewScale` 反算出来，
 *  这样无论画布被压到多窄，字在屏幕上永远是同一个大小（下面 render 里有详注）。
 *  原来这里是写死的 `10px`：画布实际只显示 570 宽（viewScale 0.79），10 设计 px 落到屏幕上
 *  只剩 7.9px，宋体汉字直接糊掉。 */
function label(g, P, text, x, y, fpx, color = 'rgba(240,235,218,0.94)', align = 'left') {
  g.fillStyle = color;
  g.font = `${fpx}px ${P.ui}`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(text, x, y);
}

/** 右上角的"样板"：虚线的理想钩 vs 你手上的针。fpx = 设计坐标下的字高。 */
function drawSample(g, P, cur, ideal, fpx) {
  const bw = 136, bh = Math.max(118, fpx * 7.6), bx = W - bw - 6, by = 6;
  g.fillStyle = 'rgba(10,13,14,0.66)';
  g.fillRect(bx, by, bw, bh);
  g.strokeStyle = 'rgba(238,232,212,0.28)';
  g.lineWidth = 1;
  g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  label(g, P, '样板', bx + 7, by + fpx * 1.02, fpx, 'rgba(242,237,220,0.95)');
  label(g, P, '按这个样子弯', bx + 7, by + bh - fpx * 0.34, fpx, 'rgba(242,237,220,0.95)');

  // 坐标系按"整根直针 ∪ 理想钩"定死，弯折过程中画面才不跳、直针也不会溢出框
  const bi = bboxOf(ideal);
  const bs = bboxOf(needlePath(0, 0));
  const ux0 = Math.min(bi.x0, bs.x0), ux1 = Math.max(bi.x1, bs.x1);
  const uy0 = Math.min(bi.y0, bs.y0), uy1 = Math.max(bi.y1, bs.y1);
  const pad = 9, head = fpx * 1.42, foot = fpx * 1.42;   // 上下各留一行字的位置
  const sc = Math.min((bw - pad * 2) / Math.max(1, ux1 - ux0), (bh - head - foot - 4) / Math.max(1, uy1 - uy0));
  const ox = bx + bw / 2 - ((ux0 + ux1) / 2) * sc;
  const oy = by + head + (bh - head - foot) / 2 - ((uy0 + uy1) / 2) * sc;

  g.save();
  g.beginPath();
  g.rect(bx + 1, by + 1, bw - 2, bh - 2);
  g.clip();
  const poly = (pts, color, w2, dash) => {
    g.save();
    g.setLineDash(dash || []);
    g.strokeStyle = color;
    g.lineWidth = w2;
    g.lineCap = 'round';
    g.beginPath();
    pts.forEach((p, i) => {
      const qx = ox + p.x * sc, qy = oy + p.y * sc;
      if (i === 0) g.moveTo(qx, qy); else g.lineTo(qx, qy);
    });
    g.stroke();
    g.restore();
  };
  poly(ideal, 'rgba(227,189,102,0.55)', 2, [3, 3]);
  poly(cur, 'rgba(240,244,246,0.92)', 1.8);
  g.restore();
}

/* ══════════════════════════════════════════════════════════════════
   玩法主体
   ══════════════════════════════════════════════════════════════════ */
export function runBendHook(container, opts = {}) {
  return new Promise((resolve) => {
    ensureStyle();
    const P = palette();

    container.innerHTML = `
      <div class="nmini-wrap">
        <canvas class="nmini-canvas" id="nd-canvas" width="${W}" height="${H}"
                aria-label="弯针成钩：按住烧针控制火候，趁热弯出钩门与钩尖，别烧白也别冷着硬弯"></canvas>
        <p class="nmini-status" id="nd-status"></p>
        <div class="blk-actions center">
          <button type="button" class="btn primary nmini-btn" id="nd-heat" data-mini-action="heat">按住烧针</button>
          <button type="button" class="btn nmini-btn" id="nd-body" data-mini-action="bend-body">按住弯钩门</button>
          <button type="button" class="btn nmini-btn" id="nd-tip" data-mini-action="bend-tip">按住弯钩尖</button>
          <button type="button" class="btn nmini-btn" id="nd-done" data-mini-action="done">就这个了</button>
        </div>
        <p class="nmini-hint">
          松潘草地，八月。雨没停过，干粮袋早就空了 —— 伤员还等着一口热的。<br>
          缝衣针就一根：得把它烧软了弯成钩，才有得钓。<br>
          <b>按住「烧针」</b>把它烤到<b>暗红到樱红（火候 50–90）</b>；<b>烧到发白，钢就酥了</b>。<br>
          趁热<b>弯钩门</b>再<b>弯钩尖</b> —— 冷了还硬弯，针会断。<b>右上角虚线那枚是样板。</b>
        </p>
      </div>
    `;
    const canvas = container.querySelector('#nd-canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = container.querySelector('#nd-status');
    const btnHeat = container.querySelector('#nd-heat');
    const btnBody = container.querySelector('#nd-body');
    const btnTip = container.querySelector('#nd-tip');
    const btnDone = container.querySelector('#nd-done');

    /* ── 画布随容器定尺 ──
       设计坐标仍是 720×400，但**后备缓冲跟着实际显示宽度走**。
       原来写死 `canvas.width = 720*DPR`，而元素被 CSS 压到 570 宽显示 →
       1440 宽的后备缓冲缩到 570 显示：白丢一半采样，更要命的是
       "设计 px"失去物理意义（10 设计 px 只有 7.9 屏幕 px）。
       现在 1 设计单位 = viewScale 个 CSS px，HUD 的字再按 1/viewScale 反向放大，
       屏幕字号因此恒定 —— 这是"文字发糊"的正面修法。 */
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let viewScale = 1;                 // 设计坐标 → CSS 像素
    let lastCssW = -1;
    function applySize() {
      const cssW = Math.max(280, Math.round(canvas.clientWidth || W));
      if (cssW === lastCssW) return;
      lastCssW = cssW;
      viewScale = cssW / W;
      const cssH = Math.round(H * viewScale);
      canvas.width = Math.round(cssW * DPR);
      canvas.height = Math.round(cssH * DPR);
      canvas.style.height = cssH + 'px';
    }
    canvas.style.width = '100%';
    applySize();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(applySize) : null;
    if (ro) ro.observe(canvas.parentElement || canvas);
    window.addEventListener('resize', applySize);

    /* ── 局内状态 ── */
    const h = { heat: 0, body: 0, tip: 0, oxide: 0, cycle: 0 };
    let phase = 'idle';                     // idle | heat | bend | broken | showcase | done
    let outcome = '';
    let strain = 0;
    let needleY = WORK_Y;
    const holding = { heat: false, body: false, tip: false };
    let seenHeat = false;
    let broken = null;
    let showcase = 0;
    let shake = 0;
    let fireBoost = 0;
    let finishTimer = false;
    let alive = true;

    const IDEAL = needlePath(GOAL.ideal.body, GOAL.ideal.tip);
    const sparks = [];
    for (let i = 0; i < 26; i++) {
      sparks.push({ x: PAN.x + rnd(-70, 70), y: PAN.y - rnd(0, 40), r: rnd(0.6, 1.7), life: rnd(0.2, 1), vy: rnd(28, 78), vx: rnd(-12, 12) });
    }

    /* ── 文案 ── */
    function setStatus(text, cls = '') {
      statusEl.textContent = text;
      statusEl.className = 'nmini-status' + (cls ? ' ' + cls : '');
    }
    const oxideWord = () => (h.oxide < 8 ? '完好' : h.oxide < 30 ? '发白' : h.oxide < 62 ? '起皮' : '发酥');
    function refreshStats() {
      if (!opts.stats) return;
      const word = phase === 'heat' ? '在烧' : phase === 'bend' ? '在弯'
        : phase === 'showcase' ? '定形' : phase === 'broken' ? '断了' : phase === 'done' ? '完了' : '待弯';
      stats(opts.stats, [
        ['工序', word],
        ['火候', String(Math.round(h.heat))],
        ['钩门', `${Math.round(h.body)}°`],
        ['钩尖', `${Math.round(h.tip)}°`],
        ['针身', oxideWord()],
      ]);
    }

    /* ── 收束 ── */
    function finish() {
      if (phase === 'showcase' || phase === 'done' || phase === 'broken') return;
      releaseAll();
      phase = 'showcase';
      showcase = 0;
      sfx('correct');
      refreshStats();
    }
    function fail(kind) {
      if (phase === 'broken' || phase === 'showcase' || phase === 'done') return;
      releaseAll();
      phase = 'broken';
      outcome = kind;
      shake = 1;
      const at = kind === 'tipbreak' ? IDX_A + IDX_B : IDX_A;
      const pts = needlePath(h.body, h.tip);
      broken = { a: pts.slice(0, at + 1), b: pts.slice(at), t: 0 };
      for (let i = 0; i < 22; i++) {
        sparks.push({ x: TAIL_X + rnd(40, 150), y: needleY + rnd(-8, 8), r: rnd(0.5, 1.5), life: rnd(0.4, 1), vy: rnd(-40, 60), vx: rnd(-60, 60) });
      }
      sfx('wrong');
      setStatus(kind === 'burnt'
        ? '烧白了 —— 钢已经酥了，手上一使劲，针就断了。'
        : kind === 'tipbreak'
          ? '钩尖弯过了头，尖上崩掉一截。'
          : h.heat < NEEDLE.band[0]
            ? '冷了。手上没收住 —— "咯"一声，针断成两截。'
            : '钩门弯过了头，崩口了。', 'warn');
      refreshStats();
    }

    /* ── 评分 ── */
    function grade() {
      const bOk = h.body >= GOAL.body[0] && h.body <= GOAL.body[1];
      const tOk = h.tip >= GOAL.tip[0] && h.tip <= GOAL.tip[1];
      const dB = bOk ? 0 : (h.body < GOAL.body[0] ? GOAL.body[0] - h.body : h.body - GOAL.body[1]);
      const dT = tOk ? 0 : (h.tip < GOAL.tip[0] ? GOAL.tip[0] - h.tip : h.tip - GOAL.tip[1]);
      let s = (bOk ? 0.44 : Math.max(0, 0.44 * (1 - dB / 78)))
        + (tOk ? 0.32 : Math.max(0, 0.32 * (1 - dT / 46)))
        + 0.24 * (1 - clamp(h.oxide, 0, 100) / 100);

      if (h.body < 60) {
        outcome = 'straight';
        return { score: Math.min(s, 0.2), good: false, line: '交上去的还是一根针。', summary: '没弯成钩 —— 交上去的还是一根针。' };
      }
      s = clamp(s, 0, 1);
      if (bOk && tOk && h.oxide < 14 && h.cycle <= 3) {
        outcome = 'perfect';
        return { score: Math.max(s, 0.94), good: true, line: '钩弯好了。很硬，能用。', summary: '钩弯好了。很硬，能用。' };
      }
      if (bOk && tOk) {
        outcome = 'ok';
        return { score: Math.max(s, 0.78), good: true, line: '钩形对了 —— 火候上毛糙些。', summary: '弯成了钩，只是钢被反复烧得酥了一点。' };
      }
      if (bOk && !tOk) {
        outcome = 'flat-tip';
        return { score: s, good: false, line: '钩门有了，钩尖是直的 —— 挂不住。', summary: '钩门够了，钩尖没弯起来，挂不住鱼。' };
      }
      if (h.body < GOAL.body[0]) {
        outcome = 'narrow';
        return { score: s, good: false, line: '钩门还开着，鱼一挣就脱。', summary: '钩门太开，鱼一挣就脱。' };
      }
      outcome = 'wide';
      return { score: s, good: false, line: '钩门窄了 —— 勉强能挂住。', summary: '钩门弯得太窄，勉强能挂住。' };
    }

    /* ── 物理 ── */
    function step(dt) {
      const now = performance.now();
      const firePulse = Math.sin(now / 260) * 0.5 + Math.sin(now / 87) * 0.5 + fireBoost * 0.6;

      for (const s of sparks) {
        s.y -= s.vy * dt;
        s.x += s.vx * dt;
        s.life -= dt * 0.85;
        s.vy *= 1 - dt * 0.35;
        if (s.life <= 0 || s.y < PAN.y - 150) {
          s.x = PAN.x + rnd(-70, 70); s.y = PAN.y - rnd(0, 24);
          s.life = rnd(0.35, 1); s.vy = rnd(28, 78); s.vx = rnd(-12, 12); s.r = rnd(0.6, 1.7);
        }
      }
      fireBoost = lerp(fireBoost, holding.heat ? 1 : 0, Math.min(1, dt * 4));
      _firePulse = firePulse;

      /* 已经了结：火还在烧、雨还在下，但规则不再推进 */
      if (phase === 'done') return;

      /* 断针后续 */
      if (phase === 'broken') {
        broken.t = Math.min(1.2, broken.t + dt);
        if (broken.t >= 1.2 && !finishTimer) {
          finishTimer = true;
          window.setTimeout(() => {
            if (!alive) return;
            phase = 'done';
            container.dataset.miniState = 'done';
            container.dataset.miniOutcome = outcome;
            resolve({
              score: outcome === 'burnt' ? 0.09 : 0.1,
              detail: { outcome, body: Math.round(h.body), tip: Math.round(h.tip), oxide: Math.round(h.oxide), cycles: h.cycle, hook: 0 },
              summary: outcome === 'burnt'
                ? '烧白了 —— 钢已经酥了，一碰就掉渣。'
                : '冷了还硬弯，针断成两截。就这一根。',
            });
          }, 320);
        }
        return;
      }

      /* 定妆后续 */
      if (phase === 'showcase') {
        showcase = Math.min(1, showcase + dt / 1.6);
        if (showcase >= 1 && !finishTimer) {
          finishTimer = true;
          const ops = grade();
          window.setTimeout(() => {
            if (!alive) return;
            phase = 'done';
            container.dataset.miniState = 'done';
            container.dataset.miniOutcome = outcome;
            setStatus(ops.line, ops.good ? 'good' : '');
            resolve({
              score: ops.score,
              detail: { outcome, body: Math.round(h.body), tip: Math.round(h.tip), oxide: Math.round(h.oxide), cycles: h.cycle, hook: ops.score },
              summary: ops.summary,
            });
          }, 280);
        }
        return;
      }

      /* 温度：火里升、外面降，弯折时掉得更快 */
      const inFire = holding.heat;
      const bending = holding.body || holding.tip;
      if (inFire) h.heat += NEEDLE.heatGain * dt;
      else h.heat -= NEEDLE.heatLoss * dt;
      if (bending) h.heat -= NEEDLE.bendHeatCost * dt;
      h.heat = clamp(h.heat, 0, 100);

      // 过烧：92° 往上开始积酥，越白积得越快
      if (h.heat >= NEEDLE.overheat) {
        h.oxide += NEEDLE.oxideRate * dt * (0.4 + (h.heat - NEEDLE.overheat) / (100 - NEEDLE.overheat) * 0.6);
      }
      h.oxide = clamp(h.oxide, 0, NEEDLE.oxideFail);
      if (h.oxide >= NEEDLE.oxideFail) return fail('burnt');

      /* 弯折 */
      const hot = h.heat >= NEEDLE.band[0];
      const rate = hot ? 1 : NEEDLE.coldRate;
      if (holding.body) h.body = Math.min(GOAL.bodyMax + 40, h.body + NEEDLE.bodyGain * rate * dt);
      if (holding.tip) h.tip = Math.min(GOAL.tipMax + 40, h.tip + NEEDLE.tipGain * rate * dt);

      // 冷了还硬弯 → 攒应变，攒满就断
      if (!hot && bending) strain += dt;
      else strain = Math.max(0, strain - dt * 2.4);
      container.dataset.miniStrain = strain.toFixed(2);

      if (strain >= NEEDLE.strainLimit) return fail('snapped');
      if (h.body >= GOAL.bodyMax) return fail('snapped');
      if (h.tip >= GOAL.tipMax) return fail('tipbreak');

      needleY = lerp(needleY, inFire ? FIRE_Y : WORK_Y, Math.min(1, dt * 6.5));

      phase = inFire ? 'heat' : bending ? 'bend' : 'idle';
      container.dataset.miniState = phase;

      // 状态行：只说当下最要紧的一句
      if (inFire) setStatus(h.heat >= NEEDLE.overheat ? '发白了 —— 快离火！' : '在火里。', h.heat >= NEEDLE.overheat ? 'warn' : '');
      else if (!hot && bending) setStatus('针身发青，弯不动 —— 它在响。', 'warn');
      else if (h.tip > 0 && h.tip < GOAL.tip[0]) setStatus('钩尖还差一点。');
      else if (h.body >= GOAL.body[0] && h.body <= GOAL.body[1]) setStatus('钩门这角度，挂得住鱼。', 'good');
      else if (h.body > GOAL.body[1]) setStatus('钩门窄了 —— 再弯就崩口。', 'warn');
      else if (h.body > 0) setStatus('钩门还开着。');
      else setStatus(hot ? '趁热。' : '烧红它。');
    }

    /* ── 输入 ── */
    const KEYMAP = { '1': 'heat', '2': 'body', '3': 'tip' };
    function setPressed(which, on) {
      const btn = which === 'heat' ? btnHeat : which === 'body' ? btnBody : btnTip;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    function releaseAll() {
      holding.heat = holding.body = holding.tip = false;
      setPressed('heat', false); setPressed('body', false); setPressed('tip', false);
    }
    function press(which, on) {
      if (phase === 'broken' || phase === 'showcase' || phase === 'done') return;
      holding[which] = on;
      setPressed(which, on);
      if (on && which === 'heat') {
        // 每重新伸进火里一次，针身多一分酥 —— 反复加热让钢变脆
        if (seenHeat) { h.oxide = clamp(h.oxide + NEEDLE.tapOxide, 0, NEEDLE.oxideFail); h.cycle += 1; }
        seenHeat = true;
        sfx('cast');
      } else if (on && h.heat < NEEDLE.band[0]) {
        sfx('click');
      }
      if (on) refreshStats();
    }
    function bindHold(btn, which) {
      const down = (e) => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch { /* 忽略 */ } press(which, true); };
      const up = () => press(which, false);
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    bindHold(btnHeat, 'heat');
    bindHold(btnBody, 'body');
    bindHold(btnTip, 'tip');
    btnDone.addEventListener('click', finish);

    const onKeyDown = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (KEYMAP[k]) { e.preventDefault(); press(KEYMAP[k], true); }
      else if (k === 'enter') { e.preventDefault(); finish(); }
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (KEYMAP[k]) { e.preventDefault(); press(KEYMAP[k], false); }
    };
    const onBlur = () => releaseAll();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    /* ── 绘制 ── */
    let _firePulse = 0;

    function render(t) {
      const g = ctx;
      /* 字在屏幕上恒定大小：设计字高 = 目标屏幕字号 ÷ viewScale。
         （viewScale = 画布显示宽度 / 720；画布 570 宽时它是 0.79，
          于是 13 屏幕 px 的字在设计坐标里写 16.4 —— 反过来放大。） */
      const fpx = clamp(HUD_PX / viewScale, HUD_FP_MIN, HUD_FP_MAX);
      g.setTransform(DPR * viewScale, 0, 0, DPR * viewScale, 0, 0);
      g.clearRect(0, 0, W, H);
      if (shake > 0) {
        g.translate(rnd(-1, 1) * shake * 4, rnd(-1, 1) * shake * 4);
        shake = Math.max(0, shake - 0.03);
      }

      drawSky(g, t);
      drawGround(g, 1 + _firePulse * 0.05);
      const baseY = drawBrazier(g, t, _firePulse, sparks);

      const pts = needlePath(h.body, h.tip);
      const bb = bboxOf(pts);
      const cxL = (bb.x0 + bb.x1) / 2, cyL = (bb.y0 + bb.y1) / 2;
      const p = showcase;                                 // 定妆进度（没定妆时恒为 0，结束后停在 1）
      const rp = clamp((p - 0.42) / 0.5, 0, 1);          // 推镜进度
      const rot = rp * PI / 2;                            // 立起来
      // 擦亮成金：**没弯成钩就不给金** —— 交上去一根直针不该看起来像成功了
      const goldT = (h.body >= 180 ? 1 : 0) * clamp((p - 0.34) / 0.42, 0, 1);
      const cool = clamp(p / 0.42, 0, 1);                  // 冷却
      const heatNow = lerp(Math.max(h.heat, 20), 16, cool);
      const oxNow = h.oxide * (1 - goldT * 0.85);
      const plAlpha = clamp(1 - p / 0.30, 0, 1);           // 钳子在推镜开头就撤出去

      g.save();
      g.translate(TAIL_X, needleY);

      if (plAlpha > 0.01 && phase !== 'broken') {
        g.save();
        g.globalAlpha = plAlpha;
        drawPliers(g, PI, 104);                                   // 左手夹住针眼端
        g.save();
        g.translate(NEEDLE_LEN * SEC_A - 12, 0);
        drawPliers(g, -0.62, 92);                                 // 右手夹在弯折点前
        g.restore();
        g.restore();
      }

      if (broken) {
        /* 断针：broken 与 done 两个阶段都停在"两截落在地上"，不能画回一根整针 */
        const fall = broken.t;
        for (const [piece, dir] of [[broken.a, -1], [broken.b, 1]]) {
          g.save();
          g.translate(dir * fall * 26, fall * fall * 55);
          g.rotate(dir * fall * 0.55);
          drawNeedle(g, piece, Math.max(18, h.heat - fall * 90), h.oxide);
          g.restore();
        }
      } else if (showcase > 0) {
        /* 成钩：showcase 与 done 两个阶段都停在定妆位 ——
           早先这里是 `phase === 'showcase'`，结果 resolve 之后 phase 变成 'done'，
           钩子当场弹回工作位、金色也褪成铁色（金色像素断言抓到的就是这个）。
           另一处坑：SHOWCASE 是**屏幕坐标**，而这一层已经被外层 translate(TAIL_X, needleY)
           平移过了；直接把屏幕坐标喂进去，钩子会被再推 (132,200)，落到屏幕 y≈434 —— 画布只有 400 高，
           整根跑出画面。所以这里要把屏幕目标换算回本层局部坐标。 */
        const sx = TAIL_X + cxL, sy = needleY + cyL;                      // 钩中心当前的屏幕位置
        const tx = lerp(sx, SHOWCASE.x, rp), ty = lerp(sy, SHOWCASE.y, rp);
        g.save();
        g.translate(tx - TAIL_X, ty - needleY);                          // → 外层帧的局部坐标
        g.rotate(rot);
        g.translate(-cxL, -cyL);
        drawNeedle(g, pts, heatNow, oxNow, { goldT });
        // 擦亮的那一道光：从针眼端扫到钩尖
        if (goldT > 0.05 && goldT < 0.96) {
          const n = pts.length - 1;
          const c = Math.floor(goldT * n);
          const i0 = Math.max(0, c - 3), i1 = Math.min(n, c + 3);
          g.save();
          g.strokeStyle = 'rgba(255,250,228,0.85)';
          g.lineWidth = 2.6;
          g.lineCap = 'round';
          g.shadowColor = 'rgba(255,236,170,0.9)';
          g.shadowBlur = 12;
          g.beginPath();
          for (let i = i0; i <= i1; i++) { if (i === i0) g.moveTo(pts[i].x, pts[i].y); else g.lineTo(pts[i].x, pts[i].y); }
          g.stroke();
          g.restore();
        }
        g.restore();
      } else {
        drawNeedle(g, pts, h.heat, h.oxide);
        if (strain > 0.02) drawStrain(g, pts[IDX_A], pts[IDX_A].a, strain / NEEDLE.strainLimit);
      }
      g.restore();

      // 在火里：再补一层薄火苗盖住针的下半，才有"没进火里"的实感
      if (holding.heat && phase !== 'broken' && phase !== 'showcase') {
        g.save();
        g.globalCompositeOperation = 'lighter';
        drawFlames(g, t, _firePulse, baseY, 1.18);
        g.restore();
      }

      /* 仪表盘 —— 字用 fpx（= 目标屏幕字号 ÷ viewScale 反算出来的设计字高），
         所以画面缩到多窄，字的物理大小都不变。
         三列等宽 166、间隔 17（16 / 199 / 382，右止 548，避开 578 起的样板框）：
         实测最长的标签「火候 100 · 甜区 50–90」约 8.7 字宽 ≈ 143，仍在列内，
         所以标签不会再互相撞。 */
      const bx = 16, bw2 = 166, step = 183;
      const heatBad = h.heat >= NEEDLE.overheat;
      meter(g, P, bx, 28, bw2, 12, h.heat / 100, heatBad ? '#e2603a' : '#e8cd9a', [0.50, 0.90]);
      label(g, P, `火候 ${Math.round(h.heat)} · 甜区 50–90`, bx, 24, fpx,
        heatBad ? 'rgba(244,168,146,0.96)' : undefined);
      meter(g, P, bx + step, 28, bw2, 12, h.body / GOAL.bodyMax, '#e8cd9a',
        [GOAL.body[0] / GOAL.bodyMax, GOAL.body[1] / GOAL.bodyMax]);
      label(g, P, `钩门 ${Math.round(h.body)}° · 222–250`, bx + step, 24, fpx);
      meter(g, P, bx + step * 2, 28, bw2, 12, h.tip / GOAL.tipMax, '#e8cd9a',
        [GOAL.tip[0] / GOAL.tipMax, GOAL.tip[1] / GOAL.tipMax]);
      label(g, P, `钩尖 ${Math.round(h.tip)}° · 42–64`, bx + step * 2, 24, fpx);
      // 针身（酥）：单独一条细的，泛红就是快废了
      meter(g, P, bx, 64, bw2, 6, h.oxide / 100,
        h.oxide > 62 ? '#d9694f' : h.oxide > 30 ? '#c8a05a' : '#8f9a86', null);
      label(g, P, `针身 ${oxideWord()} ${Math.round(h.oxide)}`, bx, 60, fpx,
        h.oxide > 62 ? 'rgba(244,168,146,0.96)' : 'rgba(240,235,218,0.94)');

      drawSample(g, P, pts, IDEAL, fpx);

      // 地点交代：与钓鱼那支同一个写法，先把"这是哪儿"说清楚
      const bandH = Math.max(20, fpx * 1.45);
      g.fillStyle = 'rgba(12,16,14,0.55)';
      g.fillRect(0, H - bandH, W, bandH);
      label(g, P, '松潘草地 · 1935 年 8 月 · 宿营地的铁皮盆边 —— 缝衣针只有一根',
        12, H - fpx * 0.30, fpx);
    }

    /* ── rAF ── */
    let raf = 0;
    let last = performance.now();
    let statTick = 0;
    function loop(now) {
      if (!alive) return;
      if (!document.body.contains(container)) { teardown(); return; }
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      step(dt);
      render(now / 1000);
      statTick += dt;
      if (statTick > 0.16) { statTick = 0; refreshStats(); }
      raf = requestAnimationFrame(loop);
    }

    let syncTimer = 0;
    function teardown() {
      alive = false;
      cancelAnimationFrame(raf);
      clearInterval(syncTimer);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', applySize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    }

    // 契约声明：调试台用 'bendhook' 区分来源；接主线时用 opts.id 覆盖成注册表的 id（'needle'）
    container.dataset.mini = opts.id || 'bendhook';
    container.dataset.miniState = 'idle';
    container.dataset.miniHeat = '0';
    container.dataset.miniBody = '0';
    container.dataset.miniTip = '0';
    container.dataset.miniOxide = '0';
    container.dataset.miniStrain = '0';
    container.dataset.miniInFire = '0';
    setStatus('缝衣针，就一根 —— 先把它烧红。');
    refreshStats();

    // 把状态同步进 dataset，自动化才有得看
    syncTimer = window.setInterval(() => {
      if (!alive) return;
      container.dataset.miniHeat = h.heat.toFixed(1);
      container.dataset.miniBody = h.body.toFixed(1);
      container.dataset.miniTip = h.tip.toFixed(1);
      container.dataset.miniOxide = h.oxide.toFixed(1);
      container.dataset.miniInFire = holding.heat ? '1' : '0';
    }, 100);

    raf = requestAnimationFrame(loop);
  });
}

/* ══════════════════════════════════════════════════════════════════
   导出：调试台读这个
   ══════════════════════════════════════════════════════════════════ */
export const NEEDLE_MINIGAMES = [
  {
    id: 'bendhook',
    title: '弯针成钩',
    family: '搭建',
    run: (host, opts = {}) => runBendHook(host, opts),
    states: ['idle', 'heat', 'bend', 'broken', 'showcase', 'done'],
    actions: ['heat', 'bend-body', 'bend-tip', 'done'],
    act: 'act4 · 草地（钓鱼前置）',
    note: '火候甜区 50–90 + 两段弯折（钩门/钩尖）；三种死法：冷弯断、弯崩口、烧酥。成品与《金色的鱼钩》同形（289° ≈ 1.6π）同色。',
  },
];
