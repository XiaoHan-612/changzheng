/**
 * 《金色的鱼钩》· 搏鱼（**第一人称视角 · 单独开发版，未接入主线**）
 *
 * ── 视角 ──
 * 第一人称：镜头就是老班长的眼睛。竿从画面右下角（手里）斜伸出去，
 * 水面从脚下一直铺到地平线，鱼按**米**算距离——远了只是水里一道影子，
 * 收近了才慢慢看清鳞和眼，跳起来那一下就在你眼前。
 *
 * 透视用的是一套很朴素的针孔模型，三个式子够用：
 *   视线高出水面 EYE_H 米，焦距 FOCAL 像素/米
 *   水面上的点： y = HORIZON + EYE_H * FOCAL / d        （d 越远越贴地平线）
 *   水下/空中的点：y = y(水面) + 高度 * FOCAL / d       （dep 为负就是离水）
 *   横向：        x = CX + lat * FOCAL / d
 * 于是"收线"在画面上就是鱼一点点变大、往下沉、往你眼前靠 —— 不靠任何假动画。
 *
 * ── 这一版是什么地方 ──
 *   松潘草地，1935 年 8 月。沼泽地上一口水泡子，不是河。
 *   铅灰的低云、下不完的冷雨、四面无边的枯草甸，看不见一棵树；
 *   水是泡烂了草根的泥炭水，浑黄发黑；雾里更远的地方是宿营地，几顶帐篷、一缕青烟。
 *   整个画面压成湿冷的灰，只有那枚**弯针磨成的钩**留一点金色 —— 这就是题眼。
 *
 * ── 这一版有什么 ──
 *   · 天空  铅灰厚云、天地之间压一层湿雾、雾里远处的草丘
 *   · 对岸  四十米外的草甸与一丛丛枯草墩（塔头），雾里更远处是宿营的帐篷和人影
 *   · 水面  泥炭水的浑黄到近处发黑、随距离收窄的透视波纹、云缝里漏下的冷天光、
 *           悬浮的草屑、鱼在水下划出的 V 形水纹
 *   · 天气  斜雨丝 + 雨点打在水面一圈圈化开 + 冷调罩与暗角
 *   · 近景  脚下会晃的泥炭草墩子、左右两丛被雨压弯的枯黄苔草（给第一人称一个"框"）、
 *           握着树枝做的钓竿的手
 *   · 鱼    沿身体 20 点采样中线做正弦游动；分叉尾鳍/背鳍/臀鳍/胸鳍/鳃盖/侧线/眼。
 *           水泡子里只有小鱼：泥鳅、小鲫鱼、小鲤、老鲤，按**远近**分区。
 *   · 操作  按住抛竿蓄力 → 力度决定落点（落点越远才够得着中间的深水）→ 鱼会游到饵边
 *           打转 → 看漂相起竿（晃=假口）→ 按住收线搏鱼
 *
 * ── 搏鱼（三层，已验证） ──
 *   ① 识别：漂相三档。② 搏鱼：张力甜区 45–82，鱼挣扎时**必须松手**，
 *      硬拉半秒断线，松到底脱钩，绷过 90 磨线扣分；鱼跳离水面时线会松。
 *   ③ 收束：鱼力竭后收线 ×2.2。不跟它硬拼，跟它耗——这正是老班长做的事。
 *
 * ── 独立到什么程度 ──
 *   不 import 主线的 minigames.js；不登记进 minigames-registry.js；不写 acts.json。
 *   自带 stats / cssVar / palette / sfx；样式运行时注入（前缀 hmini-），不碰项目 CSS。
 *   唯一外部依赖是 audio.js，且调用处全包了 try。
 *
 * ── 契约（与主线玩法完全一致，见 public/js/step.js 顶部） ──
 *   1. 签名  runXxx(container, opts) -> Promise<{ score: 0..1, detail, summary? }>
 *   2. 容器  container.dataset.mini / container.dataset.miniState
 *   3. 操作  所有可交互元素带 [data-mini-action]
 *   4. 自清  离开板屏后动画 / 监听自行停止
 *
 * ── 额外可观测状态（自动化靠它们判断"什么时候该按"） ──
 *   miniRod / miniTension / miniDist / miniStamina / miniStruggle /
 *   miniBite / miniPower / miniFish / miniJump
 */

/* ── 宿主注入（我们的架构：玩法不碰音频门面、数值签归宿主）────────────────
 * 这一段由 tools/intake-minigames.mjs 插入；要改缝合方式请改工具，别手改这里。
 * 宿主（modules/games/adapter.js）在装配这一支时调 bindHost({sfx, stats, decide})：
 *   sfx(name)     音效：宿主转成总线事件 sfx:play（玩法不认识音频框架）
 *   stats(items)  数值签：宿主唯一实现，返回句柄（{标签: <b>元素}）
 *   decide(payload) 需要模型时由流程层注入（玩法自己不发请求，见 docs/MINIGAMES-INTAKE.md）
 */
// 画布自适应（宽度铺满玩法板、高度让开状态与按钮区）。同目录（src/）内的共享工具，规则允许 import。
import { fitCanvas } from './fit-canvas.js';

let SFX = () => {};
let STATS = (items) => items;
let DECIDE = null;
export function bindHost(h = {}) {
  if (h.sfx) SFX = h.sfx;
  if (h.stats) STATS = h.stats;
  if (h.decide) DECIDE = h.decide;
}

/* ── 小工具（与 minigames.js / minigames-story.js 同名同义，故意不共享） ── */

function stats(_host, items) { return STATS(items); }

function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function sfx(name) {
  try { SFX(name); } catch { /* 单独搬走没有音频模块也不该炸 */ }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, p) => a + (b - a) * p;

/** 界面语义色走 tokens；水色、天光这些是这幅画自己的色，写死在这里。 */
function palette() {
  return {
    alert: '#d9694f',
    gold: cssVar('--gold', '#b8963e'),
    seal: cssVar('--seal', '#a8322a'),
    paper: cssVar('--paper-0', '#f6f1e5'),
    num: cssVar('--font-num', 'ui-monospace, monospace'),
    disp: cssVar('--font-display', 'serif'),
  };
}

/* 松潘草地 · 1935 年 8 月 · 冷雨
   这里是沼泽地上的一口水泡子，不是河。天是铅灰的低云，没有太阳；
   水是泡了草根的泥炭水，浑黄发黑；四面是无边的枯草甸，看不见一棵树。
   整个画面压成冷灰，只有那枚弯针做的钩留一点金色 —— 这就是题眼。 */
const SC = {
  skyTop: '#4c5663', skyMid: '#7c858a', skyLow: '#b0b3a3',
  fog: '#c3c6ba',
  mtnFar: '#78837a', mtnNear: '#59644f',      // 远处起伏的草丘
  farBank: '#4d5540',                          // 对岸草甸
  wHorizon: '#9ba190', wMid: '#4a4a38', wNear: '#1a1e16',   // 泥炭水
  soil: '#3b3323', soilDark: '#241e14',        // 泥炭土
  reed: '#7f7040', reedHead: '#5c5030',        // 枯黄苔草
  hand: '#3a4139',                             // 灰布军袖
  rodA: '#493a22', rodB: '#6d5a34', rodC: '#8d7748',        // 随手折的一根树枝
  gold: '#d9b45a',                             // 弯针磨亮的钩
};

function ensureStyle() {
  if (document.getElementById('fishing-mini-style')) return;
  const s = document.createElement('style');
  s.id = 'fishing-mini-style';
  s.textContent = `
.hmini-wrap { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.hmini-canvas { display: block; margin: 0 auto;
  border-radius: 6px; border: 1px solid var(--rule-strong); background: #173034; }
.hmini-status { min-height: 22px; margin: 0; text-align: center; font-size: var(--fs-label, 14px);
  color: var(--ink-0); font-family: var(--font-kai, var(--font)); letter-spacing: .02em; }
.hmini-status.warn { color: var(--seal); }
.hmini-status.good { color: var(--gold); }
.hmini-hint { margin: 0; text-align: center; font-size: var(--fs-micro, 12px); color: var(--ink-2); line-height: 1.6; }
.hmini-hint b { color: var(--ink-0); font-weight: 400; }
.hmini-btn[aria-pressed="true"] { border-color: var(--seal); background-color: rgba(168,50,42,0.14); }
`;
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════════════════
   透视与场景常量
   ══════════════════════════════════════════════════════════════════ */
const W = 720;
const H = 400;
const HORIZON = 148;    // 地平线（无限远的水面）
const CX = 368;         // 视线正前方在画面上的 x
const FOCAL = 900;      // 焦距：1 米处的"像素 / 米"
const EYE_H = 1.2;      // 视线高出水面（米）
const D_NEAR = 4.6;     // 画面最下沿对应的距离
const D_FAR = 15;       // 抛得到的最远
const CAST_NEAR = 5.2;

const ySurf = (d) => HORIZON + (EYE_H * FOCAL) / d;   // 148 + 1080/d
const pxPerM = (d) => FOCAL / d;

/** 世界坐标 → 屏幕。d 距离(米) / lat 横向(米) / dep 相对水面高度(米，负=离水) */
function proj(d, lat, dep) {
  const s = FOCAL / d;
  return { x: CX + lat * s, y: ySurf(d) + dep * s, s };
}

const ROD_BUTT = { x: 108, y: 486 };   // 握把在画面外下方（就在你手里）
const ROD_LEN = 470;
const ROD_A0 = 1.06;                   // 竿与水平线夹角（约 61°）
function rodTipAt(tension) {
  const bend = Math.pow(clamp(tension, 0, 100) / 100, 1.25) * 0.58;
  const a = ROD_A0 - bend;
  return { x: ROD_BUTT.x + Math.cos(a) * ROD_LEN, y: ROD_BUTT.y - Math.sin(a) * ROD_LEN };
}
function rodTip() { return rodTipAt(tensionOf()); }
let tensionOf = () => 0;

/* ── 鱼种：mLen 体长(米) / dzone 离岸距离(米) / dep 水深(米) / lat 横向活动范围 ── */
/* 草地的水泡子里没有大鱼：只有指头长的小鱼和巴掌大的鲫鲤。
   老班长钓的就是这些 —— 够煮一碗汤，也只够一碗汤。 */
const SPECIES = [
  { key: 'qiu', name: '泥鳅', mLen: 0.13, len: 26, back: '#4a4530', belly: '#9d9374', fin: 'rgba(96,92,64,0.5)',
    stamina: 24, rush: 9, gap: [1.8, 2.8], dur: [0.5, 0.9], score: 0.48,
    dzone: [4.9, 7.6], dep: [0.10, 0.30], lat: [-2.4, 2.4], spd: 0.52 },
  { key: 'ji', name: '小鲫鱼', mLen: 0.19, len: 34, back: '#59603f', belly: '#b8b189', fin: 'rgba(112,116,80,0.55)',
    stamina: 38, rush: 11, gap: [2.6, 3.8], dur: [0.8, 1.3], score: 0.68,
    dzone: [5.0, 8.4], dep: [0.18, 0.55], lat: [-2.2, 2.2], spd: 0.40 },
  { key: 'li', name: '小鲤鱼', mLen: 0.33, len: 52, back: '#6b4f2a', belly: '#b89a62', fin: 'rgba(150,120,70,0.5)',
    stamina: 62, rush: 16, gap: [2.0, 3.0], dur: [1.1, 1.7], score: 0.9,
    dzone: [7.6, 11.4], dep: [0.30, 0.85], lat: [-2.0, 2.0], spd: 0.32 },
  { key: 'lao', name: '老鲤', mLen: 0.47, len: 68, back: '#4c4630', belly: '#a89876', fin: 'rgba(122,112,78,0.5)',
    stamina: 94, rush: 21, gap: [1.4, 2.1], dur: [1.5, 2.2], score: 1.15, big: true,
    dzone: [11.0, 14.6], dep: [0.45, 1.20], lat: [-1.6, 1.6], spd: 0.24 },
];
const SPAWN = ['qiu', 'ji', 'ji', 'li', 'li', 'lao'];

const BITES = [
  { key: 'shake', name: '晃', win: 1.10, weight: 0.34, fake: true, tip: '漂在原地打颤 —— 它在试饵，别急' },
  { key: 'sink', name: '沉', win: 0.85, weight: 0.44, fake: false, tip: '漂稳稳沉下去 —— 真口，起竿！' },
  { key: 'black', name: '黑漂', win: 0.65, weight: 0.22, fake: false, big: true, tip: '漂整个没了 —— 大物，起竿！' },
];

const PHYS = {
  rise: 46, riseStruggle: 2.4,
  fall: 22, fallStruggle: 1.25,
  reel: 30, reelStruggle: 0.34,
  exhaustBoost: 2.2,
  staminaReel: 4.5, staminaStruggle: 13, staminaJump: 16,
  breakAt: 100, breakHold: 0.55,
  slackAt: 8, slackHold: 1.4,
  wearAt: 90, wearRate: 0.45,
  start: 30, limit: 45,
  jumpSlack: 14,
};

function reelEff(v) {
  if (v < 18) return 0.34;
  if (v < 45) return 0.72;
  if (v <= 82) return 1.0;
  if (v <= 92) return 0.78;
  return 0.30;
}

/* ══════════════════════════════════════════════════════════════════
   静态景物
   ══════════════════════════════════════════════════════════════════ */
function makeRidge(seed, baseY, amp) {
  const pts = [];
  for (let x = -20; x <= W + 20; x += 8) {
    const y = baseY
      - (Math.sin(x * 0.0115 + seed) * 0.55 + Math.sin(x * 0.027 + seed * 2.3) * 0.28
         + Math.sin(x * 0.0051 + seed * 0.7) * 0.62) * amp;
    pts.push([x, y]);
  }
  return pts;
}
const RIDGE_FAR = makeRidge(1.3, 118, 52);
const RIDGE_NEAR = makeRidge(5.1, 142, 30);
const FAR_BANK_D = 40;                       // 水泡子不大，对岸四十米出头
/* 对岸草甸上的枯草墩（塔头）：矮、枯、一丛一丛，没有一棵树 */
const TUNDRA = (() => {
  const t = [];
  for (let i = 0; i < 110; i++) {
    const lat = -34 + i * 0.64 + Math.sin(i * 3.1) * 0.5;
    const nz = Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);   // 伪随机 0..1
    t.push({ lat, h: 0.14 + nz * 0.42, w: 0.24 + nz * 0.5, a: 0.55 + nz * 0.45 });
  }
  return t;
})();
/* 雾里更远处的宿营地：几顶帐篷、几个人影、一缕湿柴的青烟 */
const CAMP_D = 132;
const CAMP = (() => {
  const c = [];
  const t = (lat, w, h) => c.push({ kind: 'tent', lat, w, h });
  const p = (lat) => c.push({ kind: 'man', lat });
  t(-15.5, 2.6, 1.5); t(-11.0, 2.2, 1.3); t(-6.2, 2.8, 1.6); t(2.4, 2.3, 1.35);
  t(7.6, 2.6, 1.5); t(13.4, 2.0, 1.2);
  p(-9.2); p(-4.0); p(-2.4); p(5.2); p(10.4); p(16.0);
  return c;
})();
const CLOUDS = (() => {
  const c = [];
  for (let i = 0; i < 6; i++) {
    c.push({ x: rnd(-100, W + 100), y: rnd(34, 116), w: rnd(46, 120), h: rnd(9, 17), sp: rnd(1.2, 3.2), a: rnd(0.10, 0.22) });
  }
  return c;
})();
const WAVE_DS = (() => {
  const a = [];
  for (let i = 0; i < 30; i++) a.push(D_NEAR * Math.pow(70 / D_NEAR, i / 29));
  return a;
})();
const GLITTER = (() => {
  const a = [];
  for (let i = 0; i < 110; i++) {
    a.push({ d: D_NEAR + Math.pow(Math.random(), 0.65) * (26 - D_NEAR), u: Math.random() * 2 - 1, ph: rnd(0, 6.28) });
  }
  return a;
})();
const MOTES = (() => {
  const a = [];
  for (let i = 0; i < 40; i++) a.push({ lat: rnd(-4, 4), dep: rnd(-0.1, 0.5), d: rnd(D_NEAR, 22), ph: rnd(0, 6.28) });
  return a;
})();
/* 落进水里的雨点：各管各的一圈涟漪，循环出现 */
const RAIN = (() => {
  const a = [];
  for (let i = 0; i < 34; i++) {
    a.push({ d: D_NEAR + Math.pow(Math.random(), 0.6) * (30 - D_NEAR), lat: rnd(-9, 9), ph: Math.random() });
  }
  return a;
})();

/* ══════════════════════════════════════════════════════════════════
   鱼
   ══════════════════════════════════════════════════════════════════ */
const PROF = [0.05, 0.30, 0.50, 0.60, 0.62, 0.58, 0.50, 0.40, 0.30, 0.19, 0.10];

function makeFish(spKey) {
  const sp = SPECIES.find((s) => s.key === spKey);
  return {
    sp,
    d: rnd(sp.dzone[0], sp.dzone[1]),
    lat: rnd(sp.lat[0], sp.lat[1]),
    dep: rnd(sp.dep[0], sp.dep[1]),
    dir: Math.random() < 0.5 ? 1 : -1,
    phase: rnd(0, 6.28),
    state: 'roam',
    wanderT: 0, targetDep: 0, targetD: 0, targetLat: 0,
    inspectT: 0, fleeT: 0, fleeDep: 1.6,
    angle: 0, x: 0, y: 0, s: 60,
  };
}

function updateFish(f, dt) {
  const sp = f.sp;
  if (f.state === 'gone') return;
  f.phase += dt * (3.4 + (f.state === 'hooked' || f.state === 'flee' ? 12 : sp.spd * 14));

  if (f.state === 'roam') {
    f.lat += f.dir * sp.spd * dt;
    if (f.lat > sp.lat[1]) { f.lat = sp.lat[1]; f.dir = -1; }
    if (f.lat < sp.lat[0]) { f.lat = sp.lat[0]; f.dir = 1; }
    f.wanderT -= dt;
    if (f.wanderT <= 0) {
      f.wanderT = rnd(1.6, 3.6);
      f.targetDep = rnd(sp.dep[0], sp.dep[1]);
      f.targetD = rnd(sp.dzone[0], sp.dzone[1]);
      f.targetLat = rnd(sp.lat[0], sp.lat[1]);
      if (Math.random() < 0.25) f.dir *= -1;
    }
    f.dep += (f.targetDep - f.dep) * Math.min(1, dt * 0.7);
    f.d += (f.targetD - f.d) * Math.min(1, dt * 0.5);
    f.lat += (f.targetLat - f.lat) * Math.min(1, dt * 0.25);
    f.angle += (0 - f.angle) * Math.min(1, dt * 4);
  } else if (f.state === 'approach') {
    const dd = f.aimD - f.d; const dl = f.aimLat - f.lat; const dp = f.aimDep - f.dep;
    const dd2 = Math.hypot(dd, dl, dp);
    if (dd2 > 0.05) {
      const v = sp.spd * 1.7;
      f.d += (dd / dd2) * v * dt;
      f.lat += (dl / dd2) * v * dt;
      f.dep += (dp / dd2) * v * dt;
      f.dir = dl > 0 ? 1 : -1;
      f.angle = clamp(Math.atan2(dp, Math.abs(dl) + 0.001) * 0.5, -0.5, 0.5);
    } else {
      f.state = 'inspect';
      f.inspectT = rnd(0.45, 1.15);
    }
  } else if (f.state === 'inspect') {
    f.inspectT -= dt;
    f.lat += Math.cos(f.phase * 0.7) * 0.22 * dt;
    f.d += Math.sin(f.phase * 0.5) * 0.16 * dt;
  } else if (f.state === 'flee') {
    f.fleeT -= dt;
    f.d += sp.spd * 2.4 * dt;
    f.dep += (f.fleeDep - f.dep) * Math.min(1, dt * 1.4);
    f.lat += f.dir * 0.4 * dt;
    if (f.fleeT <= 0) { f.state = 'roam'; f.wanderT = 0; }
  }
}

/** 把世界坐标写进 f.x / f.y，并返回屏幕缩放（像素/米） */
function place(f) {
  const p = proj(f.d, f.lat, f.dep);
  f.x = p.x; f.y = p.y; f.s = p.s;
  return p;
}

/** 一条会游泳的鱼：沿身体采样中线做正弦波动，越靠尾摆幅越大 */
function drawFish(g, f, opt = {}) {
  const sp = f.sp;
  const L = sp.len * (opt.scale || 1);
  if (L < 3) return;
  const amp = opt.amp == null ? L * 0.055 : opt.amp;
  const wave = opt.wave == null ? 1.05 : opt.wave;
  const alpha = opt.alpha == null ? 1 : opt.alpha;
  if (alpha <= 0.02) return;

  g.save();
  g.translate(f.x, f.y);
  g.rotate(opt.angle == null ? f.angle : opt.angle);
  g.scale(f.dir, 1);
  g.globalAlpha = alpha;

  const N = L < 26 ? 12 : 20;
  const hwMax = L * 0.185;
  const mid = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const mx = L * (0.5 - t);
    const my = amp * Math.sin(f.phase - t * Math.PI * 2 * wave) * (0.16 + 0.84 * t * t);
    const p = t * 10;
    const i0 = Math.min(9, Math.floor(p));
    const fr = p - i0;
    const hw = hwMax * (PROF[i0] * (1 - fr) + PROF[Math.min(10, i0 + 1)] * fr);
    mid.push([mx, my, hw]);
  }
  const top = []; const bot = [];
  for (let i = 0; i <= N; i++) {
    const a = mid[Math.max(0, i - 1)];
    const b = mid[Math.min(N, i + 1)];
    let tx = b[0] - a[0]; let ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty; const ny = tx;
    top.push([mid[i][0] + nx * mid[i][2], mid[i][1] + ny * mid[i][2]]);
    bot.push([mid[i][0] - nx * mid[i][2], mid[i][1] - ny * mid[i][2]]);
  }

  g.beginPath();
  g.moveTo(top[0][0], top[0][1]);
  for (let i = 1; i <= N; i++) g.lineTo(top[i][0], top[i][1]);
  for (let i = N; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
  g.closePath();
  const gb = g.createLinearGradient(0, -hwMax, 0, hwMax);
  gb.addColorStop(0, sp.back);
  gb.addColorStop(0.52, sp.back);
  gb.addColorStop(1, sp.belly);
  g.fillStyle = gb;
  g.fill();
  g.strokeStyle = 'rgba(12,22,22,0.38)';
  g.lineWidth = Math.max(0.5, L * 0.012);
  g.stroke();

  const tp = mid[N];
  const sway = Math.sin(f.phase - Math.PI * 2 * wave) * L * 0.13;
  g.fillStyle = sp.fin;
  g.beginPath();
  g.moveTo(tp[0], tp[1]);
  g.quadraticCurveTo(tp[0] - L * 0.16, tp[1] - L * 0.02, tp[0] - L * 0.25, tp[1] - L * 0.19 + sway);
  g.quadraticCurveTo(tp[0] - L * 0.15, tp[1] + sway * 0.35, tp[0] - L * 0.10, tp[1]);
  g.quadraticCurveTo(tp[0] - L * 0.15, tp[1] + sway * 0.35, tp[0] - L * 0.25, tp[1] + L * 0.19 + sway);
  g.quadraticCurveTo(tp[0] - L * 0.16, tp[1] + L * 0.02, tp[0], tp[1]);
  g.closePath();
  g.fill();

  const i1 = Math.round(N * 0.28); const i2 = Math.round(N * 0.62);
  g.beginPath();
  g.moveTo(top[i1][0], top[i1][1]);
  g.quadraticCurveTo((top[i1][0] + top[i2][0]) / 2, top[i1][1] - L * 0.20, top[i2][0], top[i2][1]);
  g.quadraticCurveTo((top[i1][0] + top[i2][0]) / 2 + L * 0.03, top[i1][1] - L * 0.05, top[i1][0], top[i1][1]);
  g.closePath();
  g.fill();

  const i3 = Math.round(N * 0.72);
  g.beginPath();
  g.moveTo(bot[i3][0], bot[i3][1]);
  g.lineTo(bot[i3][0] - L * 0.06, bot[i3][1] + L * 0.12);
  g.lineTo(bot[i3][0] - L * 0.13, bot[i3][1] + L * 0.02);
  g.closePath();
  g.fill();

  if (L > 22) {
    const i4 = Math.round(N * 0.25);
    g.save();
    g.translate(mid[i4][0], mid[i4][1] + mid[i4][2] * 0.45);
    g.rotate(0.5 + Math.sin(f.phase * 1.7) * 0.35);
    g.beginPath();
    g.ellipse(0, L * 0.07, L * 0.13, L * 0.045, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.strokeStyle = 'rgba(30,40,40,0.22)';
    g.lineWidth = Math.max(0.4, L * 0.008);
    g.beginPath();
    for (let i = 2; i <= N - 2; i++) {
      const p = mid[i];
      i === 2 ? g.moveTo(p[0], p[1] - p[2] * 0.18) : g.lineTo(p[0], p[1] - p[2] * 0.18);
    }
    g.stroke();

    const i5 = Math.round(N * 0.19);
    g.strokeStyle = 'rgba(20,32,32,0.30)';
    g.beginPath();
    g.moveTo(top[i5][0], top[i5][1]);
    g.quadraticCurveTo(mid[i5][0] + L * 0.02, mid[i5][1], bot[i5][0], bot[i5][1]);
    g.stroke();
  }

  const i6 = Math.round(N * 0.075);
  const ex = mid[i6][0]; const ey = mid[i6][1] - mid[i6][2] * 0.22;
  const er = Math.max(1.2, L * 0.048);
  g.fillStyle = 'rgba(246,241,229,0.95)';
  g.beginPath(); g.arc(ex, ey, er, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(18,24,26,0.95)';
  g.beginPath(); g.arc(ex + er * 0.18, ey, er * 0.6, 0, Math.PI * 2); g.fill();
  if (er > 2.2) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(ex - er * 0.2, ey - er * 0.3, er * 0.22, 0, Math.PI * 2); g.fill();
  }

  g.strokeStyle = 'rgba(20,32,32,0.4)';
  g.lineWidth = Math.max(0.4, L * 0.01);
  g.beginPath();
  g.moveTo(mid[0][0] - L * 0.01, mid[0][1] + mid[0][2] * 0.3);
  g.lineTo(mid[0][0] + L * 0.03, mid[0][1] + mid[0][2] * 0.55);
  g.stroke();

  g.restore();
}

/* ══════════════════════════════════════════════════════════════════
   玩法主体
   ══════════════════════════════════════════════════════════════════ */
export function runGoldenHook(container, opts = {}) {
  return new Promise((resolve) => {
    ensureStyle();
    const P = palette();
    const RODS_TOTAL = 3;

    container.innerHTML = `
      <div class="hmini-wrap">
        <canvas class="hmini-canvas" id="hk-canvas" width="${W}" height="${H}"
                aria-label="钓鱼（第一人称）：按住抛竿蓄力，看漂相起竿，搏鱼时按收线"></canvas>
        <p class="hmini-status" id="hk-status"></p>
        <div class="blk-actions center">
          <button type="button" class="btn primary hmini-btn" id="hk-cast" data-mini-action="cast">按住抛竿</button>
          <button type="button" class="btn hmini-btn" id="hk-recast" data-mini-action="recast" disabled>收竿换窝</button>
          <button type="button" class="btn hmini-btn" id="hk-hook" data-mini-action="hook" disabled>起竿</button>
          <button type="button" class="btn hmini-btn" id="hk-reel" data-mini-action="reel" disabled>按住收线</button>
        </div>
        <p class="hmini-hint">
          松潘草地，八月。雨没停过，干粮袋早就空了 —— 伤员还等着一口热的。<br>
          <b>按住「抛竿」蓄力</b>，松手甩进水泡子：抛得远才够得着中间的深水。<br>
          盯住漂：鱼会<b>游到饵边</b>，水里有影子在动。<b>晃是假口</b>，沉和黑漂才是真口。<br>
          中鱼后按住收线，<b>张力甜区 45–82</b>；<b>它一挣扎就松手</b>，硬拉半秒必断。
        </p>
      </div>
    `;
    const canvas = container.querySelector('#hk-canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = container.querySelector('#hk-status');
    const btnCast = container.querySelector('#hk-cast');
    const btnRecast = container.querySelector('#hk-recast');
    const btnHook = container.querySelector('#hk-hook');
    const btnReel = container.querySelector('#hk-reel');

    // 画布按玩法板可用空间自适应：宽度铺满（原来被样式里的 max-width:720 卡住，
    // 纸面放大到 960 之后右边空一截）、高度让开状态文字与按钮区。
    // 后备缓冲同步放大 —— 只把 CSS 拉宽会让 720 的底图被拉伸发虚（2026-09-17 修）。
    fitCanvas(canvas, W, H, {
      onSize: (s, dpr) => ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0),
    });

    const fishes = SPAWN.map(makeFish);
    let hooked = null;

    /* ── 特效池（世界坐标：d / lat / dep） ── */
    const drops = [];
    const rings = [];
    function addSplash(d, lat, n, power = 1) {
      for (let i = 0; i < n; i++) {
        drops.push({
          d: d + rnd(-0.18, 0.18), lat: lat + rnd(-0.22, 0.22), dep: 0,
          vd: rnd(-0.5, 0.5) * power, vl: rnd(-0.7, 0.7) * power, vup: rnd(1.5, 3.2) * power,
          life: 1,
        });
      }
    }
    function addRing(d, lat, n = 3) {
      for (let i = 0; i < n; i++) rings.push({ d, lat, r: 0.04 + i * 0.05, max: 0.5 + i * 0.45, life: 1, sp: 0.55 + i * 0.2 });
    }
    function stepFx(dt) {
      for (let i = drops.length - 1; i >= 0; i--) {
        const p = drops[i];
        p.vup -= 9.8 * dt;
        p.dep += p.vup * dt;
        p.d += p.vd * dt;
        p.lat += p.vl * dt;
        p.life -= dt * 1.1;
        if (p.life <= 0 || p.dep < -0.05) drops.splice(i, 1);
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.r += r.sp * dt;
        r.life = clamp(1 - r.r / r.max, 0, 1);
        if (r.life <= 0.02) rings.splice(i, 1);
      }
    }

    /* ── 运行时状态 ── */
    let phase = 'idle';
    let rodI = 0;
    const rods = [];
    let power = 0.5, charging = false, chargeT = 0;
    let castT = 0, castFrom = { x: 0, y: 0 };
    let castD = 8;                 // 钩的落点（米）
    let castLat = 0;
    let hookPos = null;
    let tension = 0, dist = 100, stamina = 100, wear = 0;
    let reeling = false, struggle = false, struggleT = 0, struggleLeft = 0;
    let bite = null, biteLeft = 0, overT = 0, fightT = 0, resultT = 0;
    let waitT = 0, jump = null, jumpT = 0, tickT = 0;
    let landAnim = 0, landFrom = null;
    let resolved = false;
    /** 只结一次账：正常玩完走 finish()，容器被拆走也要结 —— 否则内层 Promise 永远挂着，
     *  局内的 canvas / 定时器 / 闭包全被钉住（多局就是一路泄漏）。见 sentry 的同款写法。 */
    function settleOnce(result) {
      if (resolved) return;
      resolved = true;
      resolve(result);
    }
    /** 中途被拆走：形状与各支一致（score 0 · detached · aborted），别改分与 detail 的形状 */
    function settleDetached() {
      settleOnce({ score: 0, detail: { outcome: 'none', why: 'detached', aborted: true }, summary: '' });
    }
    let tensionView = 0;                       // 竿弯曲用这个，慢慢跟上张力，不硬切
    tensionOf = () => tensionView;

    const ac = new AbortController();
    const { signal } = ac;

    function setStatus(text, cls = '') {
      const gg = cls === 'warn' ? 'warn' : cls === 'good' ? 'good' : '';
      if (statusEl.textContent === text && statusEl.dataset.cls === gg) return;
      statusEl.textContent = text;
      statusEl.dataset.cls = gg;
      statusEl.className = 'hmini-status' + (gg ? ' ' + gg : '');
    }

    function refreshButtons() {
      btnCast.disabled = !(phase === 'idle');
      btnRecast.disabled = !(phase === 'wait' || phase === 'window');
      btnHook.disabled = !(phase === 'wait' || phase === 'window');
      btnReel.disabled = !(phase === 'fight');
      btnCast.setAttribute('aria-pressed', charging ? 'true' : 'false');
      btnReel.setAttribute('aria-pressed', reeling ? 'true' : 'false');
      btnCast.textContent = rodI >= RODS_TOTAL ? '三竿已尽' : '按住抛竿';
    }

    function refreshStats() {
      const landed = rods.filter((r) => r && r.landed).length;
      stats(opts.stats, [
        ['竿', `${Math.min(rodI + 1, RODS_TOTAL)}/${RODS_TOTAL}`],
        ['鱼篓', landed],
        ['线', wear > 0.66 ? '将断' : wear > 0.3 ? '起毛' : '完好'],
      ]);
    }

    function syncObservable() {
      container.dataset.mini = 'goldenhook';
      container.dataset.miniState = phase;
      container.dataset.miniRod = String(Math.min(rodI + 1, RODS_TOTAL));
      container.dataset.miniTension = String(Math.round(tension));
      container.dataset.miniDist = String(Math.max(0, Math.round(dist)));
      container.dataset.miniStamina = String(Math.max(0, Math.round((stamina / (hooked ? hooked.sp.stamina : 100)) * 100)));
      container.dataset.miniStruggle = struggle ? '1' : '0';
      container.dataset.miniBite = (phase === 'window' && bite) ? bite.key : '';
      container.dataset.miniPower = String(Math.round(power * 100));
      container.dataset.miniFish = hooked ? hooked.sp.key : '';
      container.dataset.miniJump = (phase === 'fight' && jump) ? '1' : '0';
    }

    /* ── 阶段流转 ── */
    function toIdle() {
      phase = 'idle';
      hooked = null;
      reeling = false; struggle = false; bite = null; biteLeft = 0; overT = 0; jump = null;
      power = 0.5; charging = false; hookPos = null;
      /* 一竿收完了，这一竿的状态必须全抹干净 ——
         之前漏了 tension / dist / stamina / wear，竿会僵在上一竿的弯度上 */
      tension = 0; dist = 100; stamina = 100; wear = 0;
      struggleT = 0; struggleLeft = 0; fightT = 0; waitT = 0; landAnim = 0; landFrom = null;
      setStatus(rodI >= RODS_TOTAL ? '三竿都下过了。' : `第 ${rodI + 1} 竿 —— 按住「抛竿」蓄力，往远处甩。`);
      refreshButtons(); refreshStats(); syncObservable();
    }

    function beginCharge() {
      if (phase !== 'idle' || rodI >= RODS_TOTAL) return;
      charging = true; chargeT = 0; power = 0.5; phase = 'charge';
      setStatus('蓄力 —— 松手甩出。抛得远，才够得着深水里的大物。');
      refreshButtons(); syncObservable();
    }

    function releaseCharge() {
      if (phase !== 'charge') return;
      charging = false;
      phase = 'cast';
      castT = 0;
      castD = CAST_NEAR + power * (D_FAR - CAST_NEAR);
      castLat = 0;
      castFrom = rodTip();
      sfx('cast');
      setStatus('钩出去了。');
      refreshButtons(); syncObservable();
    }

    function onSplash() {
      addSplash(castD, castLat, 14, 1);
      addRing(castD, castLat, 3);
      phase = 'wait';
      waitT = 0;
      setStatus('盯住漂。看水里有没有影子往饵边凑。');
      refreshButtons(); syncObservable();
    }

    function doHook() {
      if (phase !== 'wait' && phase !== 'window') return;
      const b = bite;
      if (phase !== 'window' || !b) {
        sfx('wrong');
        setStatus('起早了 —— 空钩收回来，白白折了一竿。', 'warn');
        endRod({ bite: null, landed: false, why: 'empty' });
        return;
      }
      if (b.fake) {
        sfx('wrong');
        setStatus('是晃，不是沉。它在试饵 —— 钩上什么也没有。', 'warn');
        if (hooked) spook(hooked);
        endRod({ bite: b.name, landed: false, why: 'fake' });
        return;
      }
      sfx('hook');
      phase = 'fight';
      tension = PHYS.start;
      dist = 100;
      stamina = hooked ? hooked.sp.stamina : 60;
      wear = 0;
      struggle = false; struggleLeft = 0;
      struggleT = 1.6 + Math.random() * 1.6;
      fightT = 0; overT = 0; jumpT = rnd(2.2, 4.2); jump = null;
      if (hooked) { hooked.state = 'hooked'; addSplash(hooked.d, hooked.lat, 14, 1.1); addRing(hooked.d, hooked.lat, 3); }
      setStatus(`${b.name}！${hooked ? hooked.sp.name : '鱼'}咬死了 —— 按住「收线」，盯住张力。`, 'good');
      refreshButtons(); syncObservable();
    }

    function spook(f) {
      if (!f) return;
      f.state = 'flee'; f.fleeT = 1.8; f.fleeDep = f.sp.dep[1] + 0.8; f.dir = Math.random() < 0.5 ? 1 : -1;
    }

    function endRod(outcome) {
      reeling = false;
      const r = Object.assign({
        rod: rodI + 1, fish: hooked ? hooked.sp.name : null, hold: fightT, wear,
      }, outcome);
      rods[rodI] = r;
      tension = 0;                       // 这一竿的力卸了，竿跟着慢慢回直
      phase = outcome.landed ? 'landed' : 'broken';
      resultT = 0; landAnim = 0;
      landFrom = hooked ? { d: hooked.d, lat: hooked.lat, dep: hooked.dep } : { d: castD, lat: 0, dep: 0 };
      refreshButtons(); refreshStats(); syncObservable();
    }

    function nextRod() {
      if (hooked && hooked.state === 'hooked') hooked.state = 'gone';
      rodI += 1;
      if (rodI >= RODS_TOTAL) { phase = 'done'; refreshButtons(); syncObservable(); finish(); }
      else toIdle();
    }

    function finish() {
      if (resolved) return;
      let sum = 0;
      for (const r of rods) {
        if (!r || !r.landed) continue;
        const sp = SPECIES.find((s) => s.name === r.fish);
        sum += (sp ? sp.score : 0.6) * (1 - Math.min(0.3, r.wear * 0.3));
      }
      const score = clamp(sum / RODS_TOTAL, 0, 1);
      const landed = rods.filter((r) => r && r.landed).length;
      const names = rods.filter((r) => r && r.landed).map((r) => r.fish);
      const summary = landed === 0
        ? '三竿空回。老班长把鱼钩擦干净，收进衣袋，什么也没说。'
        : landed === 3
          ? `三尾都上了岸：${names.join('、')}。这天晚上，伤员们终于喝上了一顿有油花的汤。`
          : `${landed} 尾上岸：${names.join('、')}。汤是稀的，老班长说自己已经吃过了。`;
      settleOnce({
        score: Math.round(score * 100) / 100,
        detail: {
          rods: rods.map((r) => ({
            rod: r.rod, fish: r.fish, bite: r.bite, landed: !!r.landed, why: r.why || null,
            seconds: Math.round(r.hold * 10) / 10, wear: Math.round(r.wear * 100) / 100,
          })),
          landed,
          empty: rods.filter((r) => r && r.why === 'empty').length,
          fake: rods.filter((r) => r && r.why === 'fake').length,
          broke: rods.filter((r) => r && r.why === 'break').length,
          slack: rods.filter((r) => r && r.why === 'slack').length,
          timeout: rods.filter((r) => r && r.why === 'timeout').length,
        },
        summary,
      });
    }

    function beginReel() { if (phase !== 'fight' || reeling) return; reeling = true; refreshButtons(); }
    function endReel() { if (!reeling) return; reeling = false; refreshButtons(); }
    function doRecast() {
      if (phase !== 'wait' && phase !== 'window') return;
      sfx('click');
      if (hooked && hooked.state !== 'hooked') hooked.state = 'roam';
      hooked = null; bite = null;
      tension = 0; wear = 0; waitT = 0;
      setStatus('收竿 —— 换个窝子下钩。这竿不算。');
      phase = 'idle';
      refreshButtons(); syncObservable();
    }

    btnCast.addEventListener('pointerdown', (e) => { e.preventDefault(); beginCharge(); }, { signal });
    btnRecast.addEventListener('click', doRecast, { signal });
    btnHook.addEventListener('click', doHook, { signal });
    btnReel.addEventListener('pointerdown', (e) => { e.preventDefault(); beginReel(); }, { signal });
    window.addEventListener('pointerup', () => { releaseCharge(); endReel(); }, { signal });
    window.addEventListener('pointercancel', () => { releaseCharge(); endReel(); }, { signal });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      e.preventDefault();
      if (e.repeat) return;
      if (phase === 'idle') beginCharge();
      else if (phase === 'wait' || phase === 'window') doHook();
      else if (phase === 'fight') beginReel();
    }, { signal });
    window.addEventListener('keyup', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      releaseCharge(); endReel();
    }, { signal });

    /* ── 主循环 ── */
    let raf = 0; let last = 0;
    function loop(t) {
      if (!document.body.contains(container)) { ac.abort(); cancelAnimationFrame(raf); settleDetached(); return; }
      const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
      last = t;
      step(dt);
      draw(t / 1000);
      raf = requestAnimationFrame(loop);
    }

    function step(dt) {
      stepFx(dt);
      for (const f of fishes) updateFish(f, dt);
      tensionView += (tension - tensionView) * Math.min(1, dt * 7);   // 竿软，不是开关

      if (phase === 'charge') {
        chargeT += dt;
        power = clamp(0.5 + 0.5 * Math.sin((chargeT / 1.6) * Math.PI * 2), 0.04, 1);
        syncObservable();
      } else if (phase === 'cast') {
        castT += dt;
        const dur = 0.62;
        const p = clamp(castT / dur, 0, 1);
        const tp = proj(castD, castLat, 0);
        hookPos = {
          x: castFrom.x + (tp.x - castFrom.x) * p,
          y: castFrom.y + (tp.y - castFrom.y) * p - Math.sin(p * Math.PI) * 130,
        };
        if (p >= 1) onSplash();
      } else if (phase === 'wait' || phase === 'window') {
        waitT += dt;
        if (!hooked) {
          let cand = null; let best = 1e9;
          for (const f of fishes) {
            if (f.state !== 'roam') continue;
            const dd = Math.abs(f.d - castD) + Math.abs(f.lat - castLat) * 0.4 + Math.abs(f.dep - 0.25) * 0.5;
            if (dd < best) { best = dd; cand = f; }
          }
          if (cand && best < 2.4) {
            hooked = cand;
            cand.state = 'approach';
            cand.aimD = castD + (cand.d < castD ? -0.25 : 0.25);
            cand.aimLat = castLat + (cand.lat < castLat ? -0.2 : 0.2);
            cand.aimDep = 0.3;
            setStatus('有影子过来了 —— 端住竿，看漂。');
          } else if (best >= 2.4 && waitT > 3 && Math.random() < dt * 0.7) {
            setStatus('这一处没鱼影。收竿，往别的窝子抛。');
          }
        }
        if (hooked && hooked.state === 'inspect' && phase === 'wait' && hooked.inspectT <= 0) triggerBite();
        if (phase === 'window') {
          biteLeft -= dt;
          if (biteLeft <= 0) {
            phase = 'wait';
            bite = null;
            if (hooked) {
              hooked.state = 'approach';
              hooked.aimD = castD + rnd(-0.3, 0.3);
              hooked.aimLat = castLat + rnd(-0.25, 0.25);
              hooked.aimDep = 0.3;
            }
            setStatus('它又退回去了…… 不急，等下一口。');
            syncObservable();
          }
        }
      } else if (phase === 'fight') {
        fightT += dt;
        const R = hooked ? hooked.sp : SPECIES[1];

        if (!jump) {
          jumpT -= dt;
          if (jumpT <= 0 && stamina > R.stamina * 0.22 && !struggle) {
            jump = { p: 0, dur: rnd(0.8, 1.15), h: rnd(0.45, 0.95) };
            if (hooked) { addSplash(hooked.d, hooked.lat, 12, 1.1); addRing(hooked.d, hooked.lat, 2); }
            sfx('splash');
          }
        } else {
          jump.p += dt / jump.dur;
          if (jump.p >= 1) {
            jump = null;
            jumpT = rnd(2.6, 5.0);
            if (hooked) { addSplash(hooked.d, hooked.lat, 14, 1.2); addRing(hooked.d, hooked.lat, 3); }
            sfx('splash');
          }
        }

        const vigor = clamp(stamina / R.stamina, 0, 1);
        if (stamina <= 0) {
          if (struggle) struggle = false;
          struggleLeft = 0; struggleT = 999;
        } else if (struggle) {
          struggleLeft -= dt;
          if (struggleLeft <= 0) {
            struggle = false;
            struggleT = rnd(R.gap[0], R.gap[1]) * (1 + (1 - vigor) * 1.6);
          }
        } else {
          struggleT -= dt;
          if (struggleT <= 0) {
            struggle = true;
            struggleLeft = rnd(R.dur[0], R.dur[1]);
            sfx('day');
            setStatus('它开始冲了 —— 松手！让它去。', 'warn');
          }
        }

        if (reeling) tension += PHYS.rise * (struggle ? PHYS.riseStruggle : 1) * dt;
        else tension -= PHYS.fall * (struggle ? PHYS.fallStruggle : 1) * dt;
        if (jump) tension -= PHYS.jumpSlack * dt;
        tension = clamp(tension, 0, PHYS.breakAt + 6);

        const exhausted = stamina <= 0;
        if (dist > 0) {
          let d = 0;
          if (reeling && !struggle) d -= PHYS.reel * reelEff(tension) * (exhausted ? PHYS.exhaustBoost : 1) * dt;
          if (struggle) d += R.rush * (0.5 + (stamina / R.stamina) * 0.5) * dt;
          if (jump) d -= 4 * dt;
          dist = clamp(dist + d, 0, 100);
        }

        if (reeling && !struggle) stamina -= PHYS.staminaReel * dt;
        if (struggle) stamina -= PHYS.staminaStruggle * dt;
        if (jump) stamina -= PHYS.staminaJump * dt;
        stamina = Math.max(-1, stamina);
        if (tension > PHYS.wearAt) wear += PHYS.wearRate * dt * (R.big ? 0.5 : 1);

        if (reeling && !struggle) {
          tickT += dt;
          if (tickT > 0.16) { tickT = 0; sfx('click'); }
        }

        if (tension >= PHYS.breakAt) overT += dt;
        else if (tension <= PHYS.slackAt) overT -= dt;
        else overT = 0;

        // 鱼在世界里的位置：距岸 0–100 → 4.6–14 米
        if (hooked) {
          hooked.d = D_NEAR + (dist / 100) * (14 - D_NEAR);
          hooked.dep = 0.2 + (dist / 100) * 0.95 + (struggle ? 0.32 : 0) - (jump ? Math.sin(jump.p * Math.PI) * jump.h : 0);
          const wob = struggle ? Math.sin(performance.now() / 95) * 0.55 : 0;
          hooked.lat = lerp(hooked.lat, wob, Math.min(1, dt * 2.2));
          hooked.dir = -1;
          hooked.angle = jump
            ? -Math.cos(jump.p * Math.PI) * 0.75
            : (struggle ? Math.sin(performance.now() / 90) * 0.18 : -0.05);
          place(hooked);
        }

        if (tension >= PHYS.breakAt && overT >= PHYS.breakHold) {
          sfx('wrong');
          setStatus('「嘣」—— 线断了。水面上只剩一圈散开的纹。', 'warn');
          if (hooked) spook(hooked);
          endRod({ bite: bite ? bite.name : null, landed: false, why: 'break' });
        } else if (tension <= PHYS.slackAt && -overT >= PHYS.slackHold) {
          sfx('wrong');
          setStatus('线松了太久，钩从它嘴里滑出来。', 'warn');
          if (hooked) spook(hooked);
          endRod({ bite: bite ? bite.name : null, landed: false, why: 'slack' });
        } else if (fightT >= PHYS.limit) {
          sfx('wrong');
          setStatus('耗得太久，钩终于挂不住了。', 'warn');
          if (hooked) spook(hooked);
          endRod({ bite: bite ? bite.name : null, landed: false, why: 'timeout' });
        } else if (dist <= 0) {
          sfx('splash');
          if (hooked) { addSplash(hooked.d, hooked.lat, 16, 1.2); addRing(hooked.d, hooked.lat, 3); hooked.state = 'gone'; }
          setStatus(`${hooked ? hooked.sp.name : '鱼'}上岸了，还在手里扑腾。`, 'good');
          endRod({ bite: bite ? bite.name : null, landed: true, why: null });
        } else if (phase === 'fight') {
          if (jump) setStatus('它跳出水面了 —— 线一松，别让它甩掉钩！', 'warn');
          else if (struggle && reeling) setStatus('它还在冲，你还拉着 —— 松手！', 'warn');
          else if (struggle) setStatus('它在冲，线在出。等它累。', 'warn');
          else if (stamina <= 0) setStatus('它翻肚了 —— 使劲收！', 'good');
          else if (tension > 92) setStatus('线快崩了，松一点。', 'warn');
          else if (tension < 18) setStatus('线松了，收不紧 —— 拉一点。', 'warn');
          else if (tension >= 45 && tension <= 82) setStatus('张力正好，收。', 'good');
        }
        syncObservable();
      } else if (phase === 'landed' || phase === 'broken') {
        resultT += dt;
        if (phase === 'landed') landAnim = Math.min(1, landAnim + dt * 0.75);
        if (resultT > 2.4) nextRod();
      }
    }

    function triggerBite() {
      let r = Math.random(); let acc = 0; let b = BITES[0];
      for (const x of BITES) { acc += x.weight; if (r <= acc) { b = x; break; } }
      if (b.big && hooked && hooked.sp.mLen < 0.5) b = BITES[1];
      bite = b; biteLeft = b.win; phase = 'window';
      addRing(castD, castLat, 2);
      sfx('day');
      setStatus(b.tip, 'warn');
      refreshButtons(); syncObservable();
    }

    /* ══════════════════════════════════════════════════════════════
       画面
       ══════════════════════════════════════════════════════════════ */
    function draw(t) {
      const g = ctx;
      g.clearRect(0, 0, W, H);
      drawSky(g, t);
      drawWater(g, t);
      drawFishLayer(g);
      drawEffects(g, t);
      drawForeground(g, t);
      drawFloat(g, t);
      drawRig(g, t);
      drawWeather(g, t);
      drawHud(g);
      drawResult(g);
    }

    function drawSky(g, t) {
      const gs = g.createLinearGradient(0, 0, 0, HORIZON + 6);
      gs.addColorStop(0, SC.skyTop);
      gs.addColorStop(0.58, SC.skyMid);
      gs.addColorStop(1, SC.skyLow);
      g.fillStyle = gs;
      g.fillRect(0, 0, W, HORIZON + 6);

      // 厚云：一层压一层的铅灰（草地八月的天，没有太阳）
      for (const c of CLOUDS) {
        const x = ((c.x + t * c.sp * 0.5) % (W + 300)) - 150;
        g.fillStyle = `rgba(210,212,202,${c.a * 0.55})`;
        g.beginPath();
        g.ellipse(x, c.y, c.w * 2.4, c.h * 0.62, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgba(92,100,106,${0.05 + c.a * 0.28})`;
        g.beginPath();
        g.ellipse(x - c.w * 0.7, c.y + c.h * 0.42, c.w * 1.6, c.h * 0.5, 0, 0, Math.PI * 2);
        g.fill();
      }

      // 远山两层
      const ridge = (pts, color, alpha) => {
        g.globalAlpha = alpha; g.fillStyle = color;
        g.beginPath();
        g.moveTo(pts[0][0], HORIZON + 22);
        for (const p of pts) g.lineTo(p[0], p[1]);
        g.lineTo(pts[pts.length - 1][0], HORIZON + 22);
        g.closePath(); g.fill();
        g.globalAlpha = 1;
      };
      ridge(RIDGE_FAR, SC.mtnFar, 0.42);
      ridge(RIDGE_NEAR, SC.mtnNear, 0.66);

      // 天地之间压一层湿雾，越靠地平线越白
      const gf = g.createLinearGradient(0, HORIZON - 62, 0, HORIZON + 4);
      gf.addColorStop(0, 'rgba(196,200,190,0)');
      gf.addColorStop(1, 'rgba(202,206,196,0.62)');
      g.fillStyle = gf;
      g.fillRect(0, HORIZON - 62, W, 66);
    }

    function drawWater(g, t) {
      const gw = g.createLinearGradient(0, HORIZON, 0, H);
      gw.addColorStop(0, SC.wHorizon);
      gw.addColorStop(0.13, '#7c7e67');
      gw.addColorStop(0.5, SC.wMid);
      gw.addColorStop(1, SC.wNear);
      g.fillStyle = gw;
      g.fillRect(0, HORIZON, W, H - HORIZON);

      /* ── 雾里更远处的宿营地（画在水之后，才不会被水盖掉）── */
      const campY = ySurf(CAMP_D);
      g.globalAlpha = 0.62;
      g.fillStyle = '#66705f';
      for (const c of CAMP) {
        const p = proj(CAMP_D, c.lat, 0);
        const s = p.s;
        if (c.kind === 'tent') {
          const hw = c.w * 0.5 * s; const hh = c.h * s;
          g.beginPath();
          g.moveTo(p.x - hw, campY);
          g.lineTo(p.x, campY - hh);
          g.lineTo(p.x + hw, campY);
          g.closePath(); g.fill();
        } else {
          const hh = 1.7 * s; const hw = 0.34 * s;
          g.fillRect(p.x - hw, campY - hh, hw * 2, hh);
        }
      }
      g.globalAlpha = 1;
      // 一缕湿柴的青烟，歪着往上散
      const smokeX = proj(CAMP_D, -9.2, 0).x;
      g.strokeStyle = 'rgba(208,210,200,0.42)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(smokeX, campY);
      for (let i = 1; i <= 6; i++) {
        const u = i / 6;
        g.lineTo(smokeX + Math.sin(t * 0.5 + u * 3) * 7 * u + 5 * u, campY - u * 26);
      }
      g.stroke();

      // 对岸：草甸 + 一丛丛枯草墩（画在水面之后，草脚才不会被水盖掉）
      const baseY = ySurf(FAR_BANK_D);
      g.fillStyle = SC.farBank;
      g.fillRect(0, baseY - 1, W, 6);
      for (const tr of TUNDRA) {
        const p = proj(FAR_BANK_D, tr.lat, 0);
        const s = p.s;
        const hpx = tr.h * s;
        const wpx = tr.w * s;
        g.globalAlpha = tr.a;
        g.beginPath();
        g.moveTo(p.x - wpx, baseY);
        g.quadraticCurveTo(p.x - wpx * 0.5, baseY - hpx * 0.75, p.x - wpx * 0.1 + wpx * 0.15, baseY - hpx);
        g.quadraticCurveTo(p.x + wpx * 0.6, baseY - hpx * 0.5, p.x + wpx, baseY);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;

      // 对岸的倒影（压在水面下方，被雨点搅碎）
      g.save();
      g.beginPath(); g.rect(0, baseY, W, 24); g.clip();
      g.globalAlpha = 0.22;
      g.fillStyle = SC.farBank;
      for (const tr of TUNDRA) {
        const p = proj(FAR_BANK_D, tr.lat, 0);
        const s = p.s;
        const jx = Math.sin(t * 1.1 + tr.lat) * 1.6;
        g.beginPath();
        g.moveTo(p.x - tr.w * s + jx, baseY);
        g.lineTo(p.x + jx, baseY + tr.h * s * 0.8);
        g.lineTo(p.x + tr.w * s + jx, baseY);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
      for (let i = 0; i < 7; i++) {
        g.fillStyle = `rgba(206,208,196,${0.10 - i * 0.012})`;
        g.fillRect(0, baseY + i * 3.4, W, 1.3);
      }
      g.restore();

      // 透视波纹：距离越远，波高与波长都按比例收窄
      for (const d of WAVE_DS) {
        const y0 = ySurf(d);
        if (y0 > H + 12) continue;
        const s = pxPerM(d);
        const amp = Math.min(7, 0.03 * s);
        const wlen = Math.max(14, 1.1 * s);
        const a = 0.17 * clamp(1.7 - d / 30, 0.3, 1);
        g.strokeStyle = `rgba(206,212,200,${a})`;
        g.lineWidth = Math.min(1.6, 0.004 * s + 0.4);
        g.beginPath();
        for (let x = -10; x <= W + 10; x += 8) {
          const yy = y0 + Math.sin((x / wlen) * Math.PI * 2 + t * 1.5 + d * 0.9) * amp
                        + Math.sin((x / (wlen * 2.3)) * Math.PI * 2 - t * 0.9 + d) * amp * 0.45;
          x === -10 ? g.moveTo(x, yy) : g.lineTo(x, yy);
        }
        g.stroke();
      }

      // 没有太阳，只有云缝里漏下来的冷天光，被雨点搅得零散
      g.save();
      for (const q of GLITTER) {
        const s = pxPerM(q.d);
        const y = ySurf(q.d);
        if (y > H + 6 || y < HORIZON) continue;
        const x = CX + q.u * 2.6 * s + Math.sin(t * 0.7 + q.ph) * 0.06 * s;
        const wpx = 0.5 * s;
        const a = (0.05 + 0.06 * Math.abs(Math.sin(t * 1.6 + q.ph))) * clamp(1.3 - q.d / 24, 0.15, 1);
        g.fillStyle = `rgba(214,220,206,${a})`;
        g.fillRect(x - wpx / 2, y - Math.max(0.5, 0.010 * s), wpx, Math.max(1, 0.020 * s));
      }
      g.restore();

      // 悬浮微粒（水里泡烂的草屑）
      for (const m of MOTES) {
        const p = proj(m.d, m.lat, m.dep + Math.sin(t * 0.6 + m.ph) * 0.05);
        if (p.y < HORIZON || p.y > H) continue;
        g.fillStyle = `rgba(198,190,150,${0.16 * clamp(1.3 - m.d / 24, 0.15, 1)})`;
        g.beginPath(); g.arc(p.x, p.y, Math.max(0.5, 0.008 * p.s), 0, Math.PI * 2); g.fill();
      }

      // 近处压暗 + 水面的暗涌
      const gd = g.createLinearGradient(0, H - 120, 0, H);
      gd.addColorStop(0, 'rgba(8,22,26,0)');
      gd.addColorStop(1, 'rgba(8,22,26,0.42)');
      g.fillStyle = gd;
      g.fillRect(0, H - 120, W, 120);
    }

    /** 水里的鱼：远了只是影子，近了才看清 */
    function drawFishLayer(g) {
      // 入篓那一刻鱼由 drawRig 单独画（正朝镜头飞过来），这儿别再画一遍
      const list = fishes.filter((f) => f.state !== 'gone' && !(phase === 'landed' && f === hooked))
        .sort((a, b) => b.d - a.d);
      for (const f of list) {
        place(f);
        const pxLen = FOCAL * f.sp.mLen / f.d;
        if (f.y < HORIZON - 4 || f.y > H + 60) continue;
        const depthFade = clamp(0.9 - f.dep * 0.5, 0.14, 0.9);
        const distFade = clamp(1.15 - f.d / 17, 0.25, 1);
        let alpha = depthFade * distFade;
        if (f.state === 'hooked' || f.state === 'flee') alpha = Math.min(1, alpha + 0.35);
        if (f.x < -120 || f.x > W + 120) continue;
        drawFish(g, f, { scale: pxLen / f.sp.len, amp: pxLen * 0.055, alpha });
      }
    }

    function drawEffects(g, t) {
      // 涟漪
      for (const r of rings) {
        const p = proj(r.d, r.lat, 0);
        const s = p.s;
        g.strokeStyle = `rgba(240,244,228,${0.36 * r.life})`;
        g.lineWidth = Math.max(0.6, 0.006 * s);
        g.beginPath();
        g.ellipse(p.x, p.y, r.r * s, r.r * s * 0.26, 0, 0, Math.PI * 2);
        g.stroke();
      }
      // 水珠
      g.fillStyle = 'rgba(240,246,234,0.78)';
      for (const p of drops) {
        const q = proj(p.d, p.lat, p.dep);
        g.globalAlpha = clamp(p.life, 0, 1);
        g.beginPath();
        g.arc(q.x, q.y, Math.max(0.7, 0.012 * q.s), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;

      // 中钩的鱼在水下划出的 V 形水纹
      if ((phase === 'fight') && hooked && !jump) {
        const p = proj(hooked.d, hooked.lat, 0);
        const s = p.s;
        const wob = Math.sin(t * 5) * 0.05 * s;
        g.strokeStyle = `rgba(240,246,236,${clamp(0.34 - hooked.dep * 0.1, 0.06, 0.34)})`;
        g.lineWidth = Math.max(0.8, 0.008 * s);
        for (let i = 1; i <= 2; i++) {
          const L = (0.35 + i * 0.22) * s;
          g.beginPath();
          g.moveTo(p.x - L, p.y - L * 0.22 + wob);
          g.quadraticCurveTo(p.x - L * 0.3, p.y + 0.03 * s + wob, p.x, p.y + 0.05 * s);
          g.quadraticCurveTo(p.x + L * 0.3, p.y + 0.03 * s + wob, p.x + L, p.y - L * 0.22 + wob);
          g.stroke();
        }
      }

      // 蓄力时的落点靶
      if (phase === 'charge') {
        const d = CAST_NEAR + power * (D_FAR - CAST_NEAR);
        const p = proj(d, 0, 0);
        const s = p.s;
        g.strokeStyle = 'rgba(246,241,229,0.6)';
        g.setLineDash([5, 4]);
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(p.x, p.y, 0.36 * s, 0.36 * s * 0.26, 0, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(246,241,229,0.8)';
        g.font = `11px ${P.num}`;
        g.textAlign = 'center';
        g.fillText(`${d.toFixed(1)} 米`, p.x, p.y - 0.4 * s - 4);
        g.textAlign = 'left';
      }
    }

    /** 近景：脚下的泥炭草墩子 + 左右两丛枯草，给第一人称一个"框" */
    function drawForeground(g, t) {
      // 脚下：泥炭草墩子（草地上的「塔头」，踩上去会晃，下面是黑水）
      g.fillStyle = SC.soil;
      g.beginPath();
      g.moveTo(0, H);
      g.lineTo(0, H - 32);
      g.quadraticCurveTo(42, H - 27, 94, H - 4);
      g.lineTo(150, H);
      g.closePath();
      g.fill();
      g.fillStyle = SC.soilDark;
      g.beginPath();
      g.moveTo(0, H - 32);
      g.quadraticCurveTo(42, H - 27, 94, H - 4);
      g.lineTo(94, H);
      g.lineTo(0, H);
      g.closePath();
      g.fill();
      // 墩子边上垂下来的草根
      g.strokeStyle = 'rgba(20,24,14,0.5)';
      g.lineWidth = 1.4;
      for (let i = 0; i < 9; i++) {
        const bx = 4 + i * 10;
        g.beginPath();
        g.moveTo(bx, H - 30 + i * 3);
        g.quadraticCurveTo(bx + 3, H - 14, bx - 2 + Math.sin(t + i) * 2, H + 4);
        g.stroke();
      }

      /* 枯黄苔草丛：被雨压得往下弯，没有蒲棒 —— 高寒草地不长香蒲 */
      const tuft = (bx, by, n, hh, ph, spread) => {
        for (let i = 0; i < n; i++) {
          const u = (i / (n - 1) - 0.5) * 2;                 // -1..1
          const lean = u * spread + Math.sin(t * 0.8 + ph + i) * 4;
          const h = hh * (0.72 + 0.28 * Math.cos(u * 1.2));
          g.strokeStyle = i % 3 === 0 ? SC.reedHead : SC.reed;
          g.lineWidth = 2.2;
          g.beginPath();
          g.moveTo(bx + u * spread * 0.5, by);
          g.quadraticCurveTo(bx + u * spread * 0.5 + lean * 0.35, by - h * 0.62,
                             bx + u * spread * 0.5 + lean, by - h);
          g.stroke();
        }
      };
      tuft(22, H - 24, 7, 104, 0.4, 20);
      tuft(56, H - 12, 6, 78, 1.9, 16);
      tuft(84, H - 2, 5, 56, 3.1, 12);
      // 右边一小丛，从水里长出来的
      tuft(W - 26, H + 2, 7, 92, 2.4, 18);
      tuft(W - 58, H + 6, 5, 62, 4.2, 13);
    }

    /** 天气：草地八月的冷雨 —— 斜雨丝 + 打在水面的雨点 + 一层冷调 */
    function drawWeather(g, t) {
      // 雨点落在水泡子上，一圈一圈化开
      for (const rp of RAIN) {
        const p = proj(rp.d, rp.lat, 0);
        if (p.y < HORIZON || p.y > H + 8) continue;
        const s = p.s;
        const cyc = (t * 0.85 + rp.ph) % 1;
        g.strokeStyle = `rgba(210,216,204,${0.30 * (1 - cyc) * clamp(1.2 - rp.d / 30, 0.15, 1)})`;
        g.lineWidth = Math.max(0.5, 0.004 * s);
        g.beginPath();
        g.ellipse(p.x, p.y, cyc * 0.34 * s, cyc * 0.34 * s * 0.27, 0, 0, Math.PI * 2);
        g.stroke();
      }

      // 斜着下来的雨丝
      g.strokeStyle = 'rgba(224,230,220,0.17)';
      g.lineWidth = 1;
      for (let i = 0; i < 96; i++) {
        const sp = 300 + (i % 7) * 52;
        const x = ((i * 97.3 + t * 52) % (W + 140)) - 70;
        const y = ((i * 53.7 + t * sp) % (H + 90)) - 45;
        const len = 13 + (i % 5) * 5;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - len * 0.3, y + len);
        g.stroke();
      }

      // 冷调罩 + 暗角：把整幅画压成湿冷的灰
      g.fillStyle = 'rgba(112,126,134,0.10)';
      g.fillRect(0, 0, W, H);
      const vg = g.createRadialGradient(CX, H * 0.46, 140, CX, H * 0.46, 500);
      vg.addColorStop(0, 'rgba(10,14,12,0)');
      vg.addColorStop(1, 'rgba(9,13,11,0.40)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    }

    /** 漂：立在水面上，三档漂相各是各的样子 */
    function drawFloat(g, t) {
      if (!(phase === 'wait' || phase === 'window')) return;
      const p = proj(castD, castLat, 0);
      const s = p.s;
      const bob = Math.sin(t * 1.7) * 0.02 * s;
      let dy = 0;
      let vis = 0.18;                       // 露出水面的高度（米）
      if (phase === 'window' && bite) {
        if (bite.key === 'shake') { dy = Math.sin(t * 24) * 0.03 * s; }
        else if (bite.key === 'sink') { dy = 0.06 * s; vis = 0.11; }
        else { dy = 0.13 * s; vis = 0.03; }
      }
      const fy = p.y + dy + bob;
      const fh = vis * s;
      const fw = Math.max(1.6, 0.022 * s);

      // 水面的小涟漪
      g.strokeStyle = 'rgba(240,244,228,0.34)';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(p.x, p.y, 0.16 * s + Math.sin(t * 2.4) * 0.02 * s, 0.16 * s * 0.28, 0, 0, Math.PI * 2);
      g.stroke();

      g.fillStyle = (bite && bite.key === 'black' && phase === 'window') ? P.alert : '#f2e6cd';
      g.fillRect(p.x - fw / 2, fy - fh, fw, fh);
      g.fillStyle = P.seal;
      g.fillRect(p.x - fw / 2, fy - fh - 0.05 * s, fw, 0.05 * s);

      if (phase === 'window' && bite) {
        g.fillStyle = P.seal;
        g.font = `600 ${Math.max(12, 0.05 * s)}px ${P.disp}`;
        g.textAlign = 'center';
        g.fillText(bite.name, p.x, fy - fh - 0.22 * s);
        g.textAlign = 'left';
      }
    }

    /** 竿 + 线 + 握竿的手 */
    function drawRig(g, t) {
      const bend = Math.pow(clamp(tensionView, 0, 100) / 100, 1.25) * 0.58;
      const N = 22;
      const pts = [];
      const shake = (reeling ? Math.sin(t * 22) * 1.6 : 0) + (struggle ? Math.sin(t * 13) * 2.4 : 0);
      for (let i = 0; i <= N; i++) {
        const s = i / N;
        const a = ROD_A0 - bend * Math.pow(s, 1.5);
        pts.push({
          x: ROD_BUTT.x + Math.cos(a) * ROD_LEN * s + shake * s * s,
          y: ROD_BUTT.y - Math.sin(a) * ROD_LEN * s,
          w: 13 * (1 - s) + 2.2 * s,
        });
      }
      const left = []; const right = [];
      for (let i = 0; i <= N; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(N, i + 1)];
        let tx = b.x - a.x; let ty = b.y - a.y;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        left.push([pts[i].x - ty * pts[i].w, pts[i].y + tx * pts[i].w]);
        right.push([pts[i].x + ty * pts[i].w, pts[i].y - tx * pts[i].w]);
      }
      const tip = pts[N];

      // 握竿的手（第一人称里唯一能看见的"自己"）
      {
        const s = 0.2;
        const i = Math.round(N * s);
        const p = pts[i];
        const ang = Math.atan2(pts[i + 1].y - pts[i - 1].y, pts[i + 1].x - pts[i - 1].x);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(ang + Math.PI / 2);
        g.fillStyle = SC.hand;
        g.beginPath();
        g.ellipse(0, 0, 17, 22, 0, 0, Math.PI * 2);
        g.fill();
        // 袖口
        g.beginPath();
        g.moveTo(-16, 8);
        g.quadraticCurveTo(-22, 40, -14, 62);
        g.lineTo(16, 62);
        g.quadraticCurveTo(20, 34, 16, 8);
        g.closePath();
        g.fill();
        // 拇指
        g.beginPath();
        g.ellipse(11, -8, 6, 10, 0.4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(236,230,206,0.16)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.ellipse(0, 0, 17, 22, 0, -Math.PI * 0.85, -Math.PI * 0.15);
        g.stroke();
        g.restore();
      }

      g.beginPath();
      g.moveTo(left[0][0], left[0][1]);
      for (let i = 1; i <= N; i++) g.lineTo(left[i][0], left[i][1]);
      for (let i = N; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
      g.closePath();
      const gr = g.createLinearGradient(ROD_BUTT.x, ROD_BUTT.y, tip.x, tip.y);
      gr.addColorStop(0, SC.rodA);
      gr.addColorStop(0.45, SC.rodB);
      gr.addColorStop(1, SC.rodC);
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = 'rgba(16,14,8,0.45)';
      g.lineWidth = 1;
      g.stroke();
      // 树皮的裂纹
      g.strokeStyle = 'rgba(24,18,8,0.34)';
      for (let i = 3; i < N; i += 3) {
        const p = pts[i];
        const a = pts[i - 1]; const b = pts[i + 1];
        let tx = b.x - a.x; let ty = b.y - a.y;
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        g.beginPath();
        g.moveTo(p.x - ty * p.w, p.y + tx * p.w);
        g.lineTo(p.x + ty * p.w, p.y - tx * p.w);
        g.stroke();
      }

      /* ── 线：从竿尖垂到漂 / 到鱼嘴 ── */
      let end = null;
      if (phase === 'charge') {
        end = { x: tip.x + 5 + Math.sin(t * 1.3) * 2, y: tip.y + 34 };
      } else if (phase === 'cast' && hookPos) {
        end = hookPos;
      } else if (phase === 'wait' || phase === 'window') {
        const p = proj(castD, castLat, 0);
        end = { x: p.x, y: p.y };
      } else if (phase === 'fight' && hooked) {
        const p = place(hooked);
        const s = p.s;
        end = { x: hooked.x + (hooked.dir < 0 ? -hooked.sp.mLen * s * 0.42 : hooked.sp.mLen * s * 0.42), y: hooked.y - hooked.sp.mLen * s * 0.05 };
      } else if (phase === 'landed' && hooked) {
        const p = lerp(landFrom.d, 3.4, landAnim);
        const lat = lerp(landFrom.lat, -0.15, landAnim);
        const dep = lerp(landFrom.dep, -0.95, landAnim);
        hooked.d = p; hooked.lat = lat; hooked.dep = dep;
        place(hooked);
        const pxLen = FOCAL * hooked.sp.mLen / hooked.d;
        hooked.dir = -1;
        hooked.angle = lerp(0.2, -0.5, landAnim) + Math.sin(landAnim * 14) * 0.1;
        drawFish(g, hooked, { scale: pxLen / hooked.sp.len, amp: pxLen * 0.05, alpha: 1 });
        end = { x: hooked.x - hooked.sp.mLen * (FOCAL / hooked.d) * 0.42, y: hooked.y };
      } else {
        end = { x: tip.x + 5 + Math.sin(t * 1.3) * 2, y: tip.y + 34 };
      }

      const taut = clamp(tension / 100, 0, 1);
      const sag = (1 - taut) * 34;
      g.strokeStyle = 'rgba(232,230,214,0.55)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(tip.x, tip.y);
      g.quadraticCurveTo((tip.x + end.x) / 2, (tip.y + end.y) / 2 + sag, end.x, end.y);
      g.stroke();

      /* 弯针磨成的钩 —— 这一整片灰里唯一的金色 */
      if (end && phase !== 'idle' && phase !== 'done') {
        const hd = (phase === 'wait' || phase === 'window') ? castD
          : (hooked ? Math.max(3.4, hooked.d) : 8);
        const s = FOCAL / hd;
        const r = Math.max(2, 0.055 * s);
        g.save();
        g.shadowColor = `rgba(226,186,96,${hooked ? 0.75 : 0.4})`;
        g.shadowBlur = hooked ? 10 : 6;
        g.strokeStyle = '#e3bd66';
        g.lineWidth = Math.max(1.1, 0.018 * s);
        g.beginPath();
        g.arc(end.x, end.y - r, r, Math.PI * 0.12, Math.PI * 1.72);
        g.stroke();
        g.restore();
      }
    }

    function bar(g, x, y, w, h, p, col, label) {
      g.fillStyle = 'rgba(10,16,18,0.55)';
      g.fillRect(x, y, w, h);
      g.fillStyle = col;
      g.fillRect(x, y, w * clamp(p, 0, 1), h);
      g.strokeStyle = 'rgba(238,232,212,0.28)';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (label) {
        g.fillStyle = 'rgba(238,232,212,0.8)';
        g.font = `10px ${P.num}`;
        g.textAlign = 'left';
        g.fillText(label, x, y - 4);
      }
    }

    function drawHud(g) {
      const fighting = phase === 'fight' || phase === 'landed';
      if (fighting) {
        const bx = 22; const by = H - 26; const bw = 250; const bh = 11;
        const xOf = (v) => bx + (v / 100) * bw;
        g.fillStyle = 'rgba(184,150,62,0.42)';
        g.fillRect(xOf(45), by, xOf(82) - xOf(45), bh);
        g.fillStyle = 'rgba(217,105,79,0.34)';
        g.fillRect(xOf(0), by, xOf(18) - xOf(0), bh);
        g.fillRect(xOf(92), by, xOf(100) - xOf(92), bh);
        bar(g, bx, by, bw, bh, tension / 100,
          tension > 92 ? P.alert : tension < 18 ? 'rgba(150,168,160,0.8)' : 'rgba(226,214,182,0.85)',
          `张力 ${Math.round(tension)}`);
        g.strokeStyle = 'rgba(246,241,229,0.55)';
        g.lineWidth = 1;
        for (const v of [18, 45, 82, 92]) {
          g.beginPath(); g.moveTo(xOf(v) + 0.5, by - 1); g.lineTo(xOf(v) + 0.5, by + bh + 1); g.stroke();
        }
        const px = bx + (clamp(tension, 0, 100) / 100) * bw;
        g.fillStyle = '#f4ecd6';
        g.fillRect(px - 1, by - 3, 2, bh + 6);

        const sp = hooked ? hooked.sp : SPECIES[1];
        bar(g, 306, by, 170, bh, clamp(stamina / sp.stamina, 0, 1),
          stamina > sp.stamina * 0.5 ? 'rgba(226,214,182,0.85)' : stamina > 0 ? P.gold : P.alert,
          `${sp.name}的力气`);
        bar(g, 500, by, 130, bh, 1 - dist / 100, 'rgba(140,178,168,0.8)',
          `还有 ${(D_NEAR + (dist / 100) * (14 - D_NEAR)).toFixed(1)} 米`);
        g.fillStyle = 'rgba(238,232,212,0.72)';
        g.font = `10px ${P.num}`;
        g.fillText(wear > 0.3 ? `线已${wear > 0.66 ? '将断' : '起毛'}` : '', 500, by - 4);
      } else if (phase === 'charge') {
        const bx = 250; const by = H - 44; const bw = 220; const bh = 12;
        g.fillStyle = 'rgba(10,16,18,0.6)';
        g.fillRect(bx - 6, by - 6, bw + 12, bh + 12);
        bar(g, bx, by, bw, bh, power, 'rgba(226,214,182,0.85)', '力度');
        const px = bx + power * bw;
        g.fillStyle = '#f4ecd6';
        g.fillRect(px - 1.5, by - 4, 3, bh + 8);
        g.fillStyle = 'rgba(238,232,212,0.8)';
        g.font = `10px ${P.num}`;
        g.textAlign = 'center';
        g.fillText(power > 0.72 ? '远水 · 深窝' : power > 0.38 ? '中程' : '近岸 · 浅水', bx + bw / 2, by + bh + 12);
        g.textAlign = 'left';
      }

      // 左上：先交代清楚这是哪儿、为什么在这儿钓
      g.fillStyle = 'rgba(12,16,14,0.5)';
      g.fillRect(12, 12, 232, 20);
      g.fillStyle = 'rgba(214,220,208,0.82)';
      g.font = `12px ${P.disp}`;
      g.fillText('松潘草地 · 八月 · 冷雨 · 干粮已断', 20, 26);

      g.fillStyle = 'rgba(10,16,18,0.42)';
      g.fillRect(W - 118, 12, 106, 20);
      g.fillStyle = 'rgba(238,232,212,0.85)';
      g.font = `11px ${P.num}`;
      g.fillText(`第 ${Math.min(rodI + 1, RODS_TOTAL)}/${RODS_TOTAL} 竿`, W - 110, 26);
      const inBasket = rods.filter((r) => r && r.landed).length;
      g.fillStyle = inBasket > 0 ? 'rgba(226,186,96,0.95)' : 'rgba(238,232,212,0.55)';
      g.fillText(inBasket > 0 ? `篓 ${inBasket} · 够一碗汤` : '篓 · 空', W - 52, 26);
    }

    function drawResult(g) {
      if (phase !== 'landed' && phase !== 'broken') return;
      const r = rods[rodI];
      const a = clamp(resultT / 0.35, 0, 1);
      g.fillStyle = `rgba(10,14,16,${0.42 * a})`;
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.font = `26px ${P.disp}`;
      g.fillStyle = r && r.landed ? P.gold : P.alert;
      g.fillText(r && r.landed ? '入篓' : '脱手', W / 2, 96);
      g.font = `13px ${P.num}`;
      g.fillStyle = 'rgba(246,241,229,0.85)';
      if (r) {
        const why = { break: '线断了', slack: '钩滑了', empty: '空钩', fake: '假口——它在试饵', timeout: '耗脱了' }[r.why] || '';
        g.fillText(r.landed ? `${r.fish} · ${r.hold.toFixed(1)} 秒` : why, W / 2, 122);
        if (r.landed) {
          g.font = `12px ${P.disp}`;
          g.fillStyle = 'rgba(226,186,96,0.9)';
          g.fillText('够给伤员煮一口汤', W / 2, 146);
        }
      }
      g.textAlign = 'left';
    }

    toIdle();
    raf = requestAnimationFrame(loop);
  });
}

/* ── 供调试台装载：与 minigames-registry 的条目同构，但**不进主线注册表** ── */
export const HOOK_MINIGAMES = [
  {
    id: 'goldenhook',
    title: '金色的鱼钩',
    family: '第一人称钓鱼 · 搏鱼',
    act: 'act4 草地',
    note: '松潘草地八月，雨没停过，干粮袋空了——镜头是老班长的眼睛，蹲在沼泽水泡子边上。<b>按住抛竿蓄力</b>控落点（越远越够得着中间的深水）；鱼会游到饵边，看漂相起竿（晃=假口）；中鱼后按收线，<b>张力甜区 45–82</b>，它挣扎时<b>必须松手</b>，跳离水面那一下线会松。鱼按<b>米</b>算距离，收近了才慢慢看清：水泡子里只有泥鳅、小鲫鱼、小鲤——够煮一碗汤，也只够一碗。',
    states: ['idle', 'charge', 'cast', 'wait', 'window', 'fight', 'landed', 'broken', 'done'],
    actions: ['cast', 'recast', 'hook', 'reel'],
    noAi: true,
    run: (host, o = {}) => runGoldenHook(host, o),
  },
];
