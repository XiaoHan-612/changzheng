/**
 * 《沙盘推演 · 往哪里走》（**单独开发版，未接入主线**）
 *
 * 起因：用户判语「我们这游戏是游戏吗？不就是个简单动画吗？」
 * 这个玩法是 act2 遵义那一幕的重做版。旧版（minigames-story.js 的 runSandTable）
 * 是"派两个侦察兵 → 三条路选一条"，选完就出分 —— 它没有失败，也没有代价，
 * 玩家其实只是在读三段说明文字。
 *
 * ── 这一版是什么 ──
 * 1935 年 1 月，遵义。隔壁屋里会还开着，参谋长把一盏油灯挪到沙盘上。
 * 川黔边这一块沙盘是拿手指头在沙里划出来的：西边是赤水河，北边是长江，
 * 川军的旗子沿着江岸插了一排。地图上标着地名的小纸旗你都知道，
 * **可是纸旗底下压着多少兵，你一个都不知道。**
 * 整个画面只有一盏油灯亮着 —— 灯照到的地方是暖的，照不到的地方埋在暗里。
 *
 * ── 决策在哪里（三条，缺一条这玩法就退回"动画"） ──
 *   ① 探哪里：只有两个侦察兵，十三条路。派出去一个，才知道那一处底下是空的还是堵的；
 *      探错了，钱就花在没用的地方。
 *   ② 走哪条：东路短（5 步）但卡着川军两道封锁线，最后一道是刘湘的老巢；
 *      西路长（6 步）但沿赤水河，多半是空档；中路有个土城 —— 情报说只有一个团。
 *      两条路都到得了长江，**快而伤 与 慢而全 是两种代价**。
 *   ③ 撞上以后：强攻（折损兵力，但过去了）还是后撤（白费行军点，兵留住）。
 *      重兵那一处硬打要折两个主力 —— 强攻的按钮会把它写清楚，按不按是你的事。
 *
 * ── 失败条件（两条，都会真的输） ──
 *   · 行军点用尽而没到长江 → 「四面都是兵，只好退回川黔边」
 *   · 兵力打到 0 → 「主力打光了，沙盘上那面红旗没人再扶」
 *
 * ── 画面（这一版的重点，"还是像 AI 的"就是从这里修） ──
 *   · 夜里的屋子：只有画面右上角一盏油灯（能看到灯罩和火苗），其余是暗的
 *   · 木托盘里的沙：有颗粒、有耙过的走向、有起伏 —— 山是堆起来的，
 *     河道是手指划出来的沟（迎光一边亮、背光一边暗），路也是沟
 *   · 地名是插在沙里的小纸旗（毛笔楷体、微微歪着、底下有投影），
 *     「长江」「赤水河」直接写在沙上
 *   · 侦察兵拨开的是**沙**：一撮沙扬起来，底下的敌军旗才露出来
 *   · 我们走的路是手指划过的沟痕，会一直留在沙上；走的步数看得见
 *   · 主力是插在沙上的小红旗，旁边摆着三枚木棋子 —— **打掉一个主力，
 *     沙盘上就少一枚棋子**（不是数值条在动）
 *   · 打光 / 打不下去时，沙上只剩一面孤旗
 *
 * ── 独立到什么程度 ──
 *   不 import 主线的 minigames.js；不登记进 minigames-registry.js；不写 acts.json。
 *   自带 stats / cssVar / sfx；样式运行时注入（前缀 smini2-），不碰项目 CSS。
 *   唯一外部依赖是 audio.js，且调用处全包了 try。
 *
 * ── 契约（与主线玩法完全一致，见 public/js/step.js 顶部） ──
 *   1. 签名  runXxx(container, opts) -> Promise<{ score: 0..1, detail, summary? }>
 *   2. 容器  container.dataset.mini / container.dataset.miniState
 *   3. 操作  所有可交互元素带 [data-mini-action]：visit / scout / storm / withdraw / back
 *   4. 自清  离开板屏后动画 / 监听自行停止（AbortController + document.body.contains）
 *
 * ── 额外可观测状态（自动化靠它们决定怎么走） ──
 *   miniMarch 剩余行军点 / miniScouts 剩余侦察兵 / miniTroops 兵力 /
 *   miniAt 当前节点 / miniFoe 当前节点的敌情（已探明才有）/ miniPath 已走路线
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
const lerp = (a, b, t) => a + (b - a) * t;

/** 固定种子的伪随机：沙盘的颗粒每次重开都是同一张沙，不会"每次长得不一样" */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ══════════════════════════════════════════════════════════════════
   画面尺寸 / 托盘 / 投影
   ══════════════════════════════════════════════════════════════════ */

const W = 720;
const H = 400;

/* 托盘：外面那圈是木头，里面是沙。梯形是为了让人看出来"这是斜着看的一张桌子" */
const TRAY_OUT = { yb: 392, yt: 44, xbl: 12, xbr: 708, xtl: 60, xtr: 660 };
const TRAY_IN = { yb: 366, yt: 70, xbl: 34, xbr: 686, xtl: 80, xtr: 640 };

const LAMP = { x: 646, y: 24 };   // 油灯在画面右上角

/** (u,v) 沙盘坐标 → 屏幕。u 0=西 1=东，v 0=南（近）1=北（远） */
function proj(u, v) {
  const L = lerp(TRAY_IN.xbl, TRAY_IN.xtl, v);
  const R = lerp(TRAY_IN.xbr, TRAY_IN.xtr, v);
  return { x: lerp(L, R, u), y: lerp(TRAY_IN.yb, TRAY_IN.yt, v), s: lerp(1, 0.7, v) };
}

/* 夜里的颜色。界面语义色（gold/seal/paper）走 tokens，沙盘的沙和水是这个场景自己的色 */
function palette() {
  return {
    gold: cssVar('--gold', '#b8963e'),
    seal: cssVar('--seal', '#a8322a'),
    paper: cssVar('--paper-0', '#f6f1e5'),
    kai: cssVar('--font-kai', '"Kaiti SC", "STKaiti", serif'),
    num: cssVar('--font-num', 'ui-monospace, monospace'),
  };
}

const SL = {
  room: '#0e0b07', roomLit: '#2a1e12',
  wood: '#3b2a18', woodDark: '#1d1409', woodLit: '#6a4c29',
  sand: '#a98a55', sandLit: '#c6a670', sandDark: '#7d6236', sandDeep: '#5b4525',
  ridgeLit: '#dcc394', ridgeDark: '#6b5228',
  water: '#5a6462', waterLit: '#8a9391', waterDeep: '#363e3d',
  paper: '#e9dcbc', ink: '#2b2118',
  red: '#b23329', redDark: '#7a1f19', redLit: '#d8614f',
  foe: '#3d4b5c', foeLit: '#63758a', foeDark: '#222c38',
  lamp: '#ffcf7a',
};

/* ══════════════════════════════════════════════════════════════════
   地图数据 —— 川黔边，1935 年 1 月
   ══════════════════════════════════════════════════════════════════ */

/* foe: 0 空档 / 1 前卫（打散即可，不折兵力）/ 2 封锁线（强攻折 1）/ 3 重兵（强攻折 2）
   jit: [换成多少, 多大概率] —— 每次开局重新掷，逼你侦察而不是背地图 */
const NODES = [
  { id: 'zunyi',     name: '遵义',   u: 0.520, v: 0.055, kind: 'start', foe: 0, army: '—',
    intel: '会就在隔壁那间屋里开着。地图上的线，还是热的。' },
  { id: 'loushan',   name: '娄山关', u: 0.575, v: 0.180, kind: 'pass',  foe: 2, army: '黔军',
    intel: '关上摆着黔军一个旅，险要处只能仰攻。川黔路卡在这里。' },
  { id: 'tongzi',    name: '桐梓',   u: 0.600, v: 0.285, kind: 'plain', foe: 1, army: '黔军',
    intel: '桐梓是黔军的地方部队，枪旧人散，一冲就垮。' },
  { id: 'songkan',   name: '松坎',   u: 0.630, v: 0.425, kind: 'plain', foe: 1, army: '川军',
    intel: '川军的前哨，土墙碉楼，卡在川黔路上。', jit: [2, 0.35] },
  { id: 'qijiang',   name: '綦江',   u: 0.670, v: 0.575, kind: 'plain', foe: 0, army: '—',
    intel: '綦江两岸这一段是空的，川军把兵都收在江边。' },
  { id: 'jiangjin',  name: '江津渡', u: 0.720, v: 0.855, kind: 'ford',  foe: 2, army: '川军',
    intel: '进重庆的门户。刘湘的老巢就在下游 —— 他不会让你从这里过江。', jit: [3, 0.30] },

  { id: 'renhuai',   name: '仁怀',   u: 0.400, v: 0.195, kind: 'plain', foe: 1, army: '黔军',
    intel: '仁怀是往西的岔口：一条顺赤水河走茅台，一条直插土城。' },
  { id: 'tucheng',   name: '土城',   u: 0.248, v: 0.400, kind: 'plain', foe: 3, army: '川军',
    intel: '情报说土城只有一个团。侦察兵回报：川军主力已经先到了。' },
  { id: 'maotai',    name: '茅台',   u: 0.215, v: 0.205, kind: 'plain', foe: 1, army: '—',
    intel: '茅台渡口。酒坊的窖还开着，人早跑光了。', jit: [0, 0.35] },
  { id: 'erlangtan', name: '二郎滩', u: 0.195, v: 0.560, kind: 'plain', foe: 0, army: '—',
    intel: '二郎滩渡口，河面窄、水急，两岸都是灯心草。', jit: [2, 0.35] },
  { id: 'gulin',     name: '古蔺',   u: 0.235, v: 0.700, kind: 'plain', foe: 0, army: '—',
    intel: '古蔺县城 —— 川黔边上的一个空档。', jit: [2, 0.25] },
  { id: 'xuyong',    name: '叙永',   u: 0.400, v: 0.780, kind: 'plain', foe: 1, army: '川军',
    intel: '叙永城高墙厚，川军摆着一个旅。' },
  { id: 'luzhou',    name: '泸州渡', u: 0.330, v: 0.910, kind: 'ford',  foe: 2, army: '川军',
    intel: '长江上的大渡口，川军封了江面。' },
  { id: 'yibin',     name: '宜宾渡', u: 0.150, v: 0.890, kind: 'ford',  foe: 1, army: '川军',
    intel: '宜宾渡，江面最窄。对岸的灯火看得见。' },
];

const EDGES = [
  ['zunyi', 'loushan'], ['zunyi', 'renhuai'],
  ['loushan', 'tongzi'], ['tongzi', 'songkan'], ['songkan', 'qijiang'], ['qijiang', 'jiangjin'],
  ['renhuai', 'maotai'], ['renhuai', 'tucheng'],
  ['maotai', 'tucheng'], ['maotai', 'erlangtan'], ['tucheng', 'erlangtan'],
  ['erlangtan', 'gulin'], ['gulin', 'xuyong'],
  ['gulin', 'luzhou'], ['xuyong', 'luzhou'], ['xuyong', 'yibin'], ['luzhou', 'yibin'],
];

/* 山：沙盘上堆起来的沙脊（u,v,半径）。沿着四边堆成一圈，中间留给路 ——
   沙盘看起来才像一块有起伏的地，而不是一张摊平的纸 */
const MOUNDS = [
  /* 西边：川黔边的山脊，密集地叠成一条岭 */
  [0.030, 0.930, 30], [0.060, 0.870, 27], [0.038, 0.800, 29], [0.066, 0.735, 26],
  [0.030, 0.672, 31], [0.062, 0.610, 27], [0.036, 0.548, 30], [0.068, 0.486, 26],
  [0.032, 0.424, 30], [0.064, 0.362, 27], [0.038, 0.300, 29], [0.070, 0.238, 26],
  [0.036, 0.176, 28], [0.082, 0.116, 26], [0.140, 0.058, 25],
  /* 北边：长江以北的群山 */
  [0.190, 0.972, 26], [0.290, 0.988, 28], [0.410, 0.980, 27], [0.530, 0.990, 27],
  [0.650, 0.978, 28], [0.760, 0.988, 26], [0.868, 0.966, 28], [0.945, 0.918, 26],
  /* 东边 */
  [0.940, 0.855, 27], [0.962, 0.788, 28], [0.938, 0.720, 26], [0.960, 0.652, 28],
  [0.936, 0.585, 27], [0.958, 0.518, 26], [0.934, 0.450, 28], [0.952, 0.384, 26],
  [0.930, 0.318, 28], [0.940, 0.252, 26], [0.906, 0.192, 27],
  /* 南边（近处，压在画面下沿） */
  [0.120, 0.006, 27], [0.250, 0.018, 26], [0.380, 0.004, 28], [0.510, 0.016, 27],
  [0.640, 0.004, 28], [0.770, 0.016, 26], [0.900, 0.030, 25],
  /* 内里的高地：娄山关是两山夹一口 */
  [0.545, 0.200, 18], [0.662, 0.190, 17],
  /* 松坎、綦江一带 */
  [0.722, 0.444, 15], [0.768, 0.650, 14],
  /* 土城、赤水河一带 */
  [0.268, 0.474, 14], [0.168, 0.316, 15],
  /* 古蔺、叙永之间的丘陵 */
  [0.302, 0.812, 14], [0.120, 0.640, 15],
];

/* 长江：横在沙盘北边的一道沟；渡口都落在它上面 */
const CHANGJIANG = [[0.010, 0.862], [0.150, 0.888], [0.330, 0.908], [0.500, 0.892], [0.660, 0.862], [0.780, 0.836], [0.990, 0.796]];
/* 赤水河：从西南进来，往东北汇进长江 —— 一条 S，红军在它身上来回渡了四次 */
const CHISHUI = [[0.105, 0.030], [0.150, 0.140], [0.185, 0.255], [0.215, 0.370], [0.245, 0.480], [0.278, 0.600], [0.305, 0.720], [0.328, 0.850], [0.334, 0.940]];

const FOE_NAME = { 0: '空档', 1: '前卫', 2: '封锁线', 3: '重兵' };
const FOE_MEN = { 1: 0, 2: 1, 3: 2 };        // 强攻要折的主力数
const RULES = { MARCH: 9, SCOUTS: 2, TROOPS: 3 };

let nodes = [];
const byId = new Map();

/** 开局掷一次：把 jit 过的节点重掷，于是"哪条路是软的"每次不一样 */
function rollMap() {
  nodes = NODES.map((n) => {
    let foe = n.foe;
    if (n.jit && Math.random() < n.jit[1]) foe = n.jit[0];
    return { ...n, foe, known: n.kind === 'start', cleared: false, visits: 0 };
  });
  byId.clear();
  for (const n of nodes) byId.set(n.id, n);
}
function neighbors(id) {
  const out = [];
  for (const [a, b] of EDGES) {
    if (a === id) out.push(b);
    else if (b === id) out.push(a);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   样式（前缀 smini2-，只在有玩法开跑时注入一次）
   ══════════════════════════════════════════════════════════════════ */

function ensureStyle() {
  if (document.getElementById('sandtable-mini-style')) return;
  const s = document.createElement('style');
  s.id = 'sandtable-mini-style';
  s.textContent = `
.smini2-wrap { display: flex; flex-direction: column; gap: 8px; }
.smini2-lead { margin: 0; font-size: var(--fs-label, 14px); color: var(--ink-2); line-height: 1.7; }
.smini2-lead b { color: var(--ink-0); font-weight: 400; font-family: var(--font-kai, var(--font)); }
.smini2-table { position: relative; width: 100%; max-width: 720px; margin: 0 auto; }
.smini2-canvas { display: block; width: 100%; height: auto; background-color: #0e0b07; }
.smini2-tags { position: absolute; inset: 0; pointer-events: none; }
.smini2-tag { position: absolute; transform-origin: 50% 100%; padding: 1px 5px 2px; margin: 0;
  border-radius: var(--radius-inset, 3px); border: 1px solid var(--rule-strong);
  background-color: var(--paper-0); color: var(--ink-0); cursor: default; white-space: nowrap;
  font-family: var(--font-kai, var(--font)); line-height: 1.25; pointer-events: auto;
  box-shadow: 0 1px 2px rgba(0,0,0,.45); transition: border-color .14s, background-color .14s, transform .14s; }
.smini2-tag .foe { display: block; font-family: var(--font); font-size: 9px; color: var(--ink-2); letter-spacing: .02em; }
.smini2-tag.can { cursor: pointer; border-color: var(--gold); }
.smini2-tag.can:hover { background-color: #f2e6c6; z-index: 5; }
.smini2-tag.cur { border-color: var(--seal); border-width: 2px; background-color: #f6ecd2; }
.smini2-tag.seen { background-color: #e2d4b2; }
.smini2-tag[disabled] { opacity: .72; }
.smini2-scout-chip { font-family: var(--font-kai, var(--font)); }
.smini2-status { margin: 0; min-height: 40px; padding: 0 2px; font-size: var(--fs-label, 14px); line-height: 1.6;
  color: var(--ink-0); font-family: var(--font-kai, var(--font)); letter-spacing: .01em; }
.smini2-status.warn { color: var(--seal); }
.smini2-status.good { color: var(--gold); }
.smini2-hint { margin: 0; font-size: var(--fs-micro, 12px); color: var(--ink-2); line-height: 1.7; }
.smini2-hint b { color: var(--ink-0); font-weight: 400; }
.smini2-cap { font-size: var(--fs-micro, 12px); color: var(--ink-2); align-self: center; }
.smini2-lethal { border-color: var(--seal); color: var(--seal); }
.smini2-lethal:hover { background-color: #f3ded6; }
`;
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════════════════
   沙盘的静态底 —— 一次画好缓存起来，每帧只贴图。
   （沙粒、耙痕、土包、河道、路沟都是不变的；会变的只有红旗、敌旗、路线、飞沙）
   ══════════════════════════════════════════════════════════════════ */

function buildSandBase() {
  const cv = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rnd = mulberry32(19350115);

  /* ── 屋子：除了油灯照到的地方，全是暗的 ── */
  x.fillStyle = SL.room;
  x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(LAMP.x - 40, LAMP.y + 40, 20, LAMP.x - 40, LAMP.y + 40, 460);
  glow.addColorStop(0, 'rgba(120,78,30,0.55)');
  glow.addColorStop(0.45, 'rgba(70,45,18,0.24)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = glow;
  x.fillRect(0, 0, W, H);

  /* 木桌：托盘的底座，露在托盘外面的那一圈 */
  x.save();
  x.beginPath();
  x.moveTo(TRAY_OUT.xbl, TRAY_OUT.yb); x.lineTo(TRAY_OUT.xbr, TRAY_OUT.yb);
  x.lineTo(TRAY_OUT.xtr, TRAY_OUT.yt); x.lineTo(TRAY_OUT.xtl, TRAY_OUT.yt);
  x.closePath();
  const wg = x.createLinearGradient(0, TRAY_OUT.yt, 0, TRAY_OUT.yb);
  wg.addColorStop(0, SL.woodDark);
  wg.addColorStop(0.55, SL.wood);
  wg.addColorStop(1, SL.woodDark);
  x.fillStyle = wg;
  x.fill();
  x.clip();
  /* 木纹 */
  for (let i = 0; i < 26; i++) {
    const yy = TRAY_OUT.yt + rnd() * (TRAY_OUT.yb - TRAY_OUT.yt);
    x.strokeStyle = rnd() < 0.5 ? 'rgba(20,13,6,0.35)' : 'rgba(150,112,62,0.16)';
    x.lineWidth = 0.6 + rnd() * 1.2;
    x.beginPath();
    for (let px = -40; px <= W + 40; px += 24) {
      const py = yy + Math.sin(px / 90 + i) * (2 + rnd() * 2);
      if (px === -40) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();
  }
  x.restore();

  /* 托盘口：光从右上角来 → 盘口的右下沿挑一道暖的高光 */
  x.save();
  x.beginPath();
  x.moveTo(TRAY_IN.xbl, TRAY_IN.yb); x.lineTo(TRAY_IN.xbr, TRAY_IN.yb);
  x.lineTo(TRAY_IN.xtr, TRAY_IN.yt); x.lineTo(TRAY_IN.xtl, TRAY_IN.yt);
  x.closePath();
  x.strokeStyle = 'rgba(196,150,84,0.6)';
  x.lineWidth = 2.4;
  x.stroke();
  x.restore();

  /* ── 沙面 ── */
  x.save();
  x.beginPath();
  x.moveTo(TRAY_IN.xbl, TRAY_IN.yb); x.lineTo(TRAY_IN.xbr, TRAY_IN.yb);
  x.lineTo(TRAY_IN.xtr, TRAY_IN.yt); x.lineTo(TRAY_IN.xtl, TRAY_IN.yt);
  x.closePath();
  x.clip();

  const sg = x.createLinearGradient(0, TRAY_IN.yt, 0, TRAY_IN.yb);
  sg.addColorStop(0, SL.sandDark);
  sg.addColorStop(0.45, SL.sand);
  sg.addColorStop(1, SL.sandLit);
  x.fillStyle = sg;
  x.fillRect(0, 0, W, H);

  /* 沙粒 */
  const inTray = (px, py) => {
    if (py < TRAY_IN.yt || py > TRAY_IN.yb) return false;
    const v = (TRAY_IN.yb - py) / (TRAY_IN.yb - TRAY_IN.yt);
    const L = lerp(TRAY_IN.xbl, TRAY_IN.xtl, v);
    const R = lerp(TRAY_IN.xbr, TRAY_IN.xtr, v);
    return px >= L + 2 && px <= R - 2;
  };
  for (let i = 0; i < 4200; i++) {
    const px = rnd() * W; const py = TRAY_IN.yt + rnd() * (TRAY_IN.yb - TRAY_IN.yt);
    if (!inTray(px, py)) continue;
    const t = rnd();
    x.fillStyle = t < 0.45 ? 'rgba(255,236,196,0.10)'
      : t < 0.85 ? 'rgba(60,40,14,0.13)' : 'rgba(20,12,4,0.22)';
    x.fillRect(px, py, 1, 1);
  }
  /* 背光的一侧压暗一点（远处的沙照不到灯） */
  const farg = x.createLinearGradient(0, TRAY_IN.yt, 0, TRAY_IN.yt + 150);
  farg.addColorStop(0, 'rgba(12,8,2,0.34)');
  farg.addColorStop(1, 'rgba(12,8,2,0)');
  x.fillStyle = farg;
  x.fillRect(0, 0, W, H);

  /* 沙耙过留下的走向 */
  for (let i = 0; i < 9; i++) {
    const yy = TRAY_IN.yt + 22 + i * 34 + rnd() * 10;
    x.strokeStyle = 'rgba(255,226,178,0.07)';
    x.lineWidth = 2 + rnd() * 2;
    x.beginPath();
    for (let px = 0; px <= W; px += 20) {
      const py = yy + Math.sin(px / 120 + i * 1.7) * (2 + rnd() * 2.5);
      if (px === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();
  }

  /* 沙面上深浅不匀的几处（手抹过、潮气重的地方）—— 免得中间一片死平 */
  for (let i = 0; i < 26; i++) {
    const px = rnd() * W; const py = TRAY_IN.yt + rnd() * (TRAY_IN.yb - TRAY_IN.yt);
    if (!inTray(px, py)) continue;
    const rr = 26 + rnd() * 76;
    const g = x.createRadialGradient(px, py, 1, px, py, rr);
    g.addColorStop(0, rnd() < 0.62 ? 'rgba(56,38,12,0.08)' : 'rgba(255,238,200,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.fill();
  }

  /* 沙贴着盘壁的一圈内影：越靠边越暗，沙才不像一张摊平的纸 */
  for (const [wdt, al] of [[30, 0.09], [21, 0.11], [13, 0.13], [6, 0.16]]) {
    x.strokeStyle = `rgba(20,12,3,${al})`;
    x.lineWidth = wdt;
    x.beginPath();
    x.moveTo(TRAY_IN.xbl, TRAY_IN.yb); x.lineTo(TRAY_IN.xbr, TRAY_IN.yb);
    x.lineTo(TRAY_IN.xtr, TRAY_IN.yt); x.lineTo(TRAY_IN.xtl, TRAY_IN.yt);
    x.closePath();
    x.stroke();
  }

  /* ── 山：堆起来的沙包 + 等高圈 + 迎光面（两个交叠的包，免得看着像一只只眼睛） ── */
  for (const [u0, v0, r0] of MOUNDS) {
    /* 位置和大小都抖一点：不抖的话沿边那一圈会变成一串一样大的豆子 */
    const u = u0 + (rnd() - 0.5) * 0.024;
    const v = v0 + (rnd() - 0.5) * 0.024;
    const r = r0 * (0.74 + rnd() * 0.62);
    const p = proj(u, v);
    const rx = r * p.s;
    const ry = rx * (0.40 + rnd() * 0.16);
    const tilt = (rnd() - 0.5) * 0.6;
    const lobes = 2 + (rnd() < 0.45 ? 1 : 0);
    x.save();
    /* 背光（左下）的落影：沙包是从沙里堆起来的，靠的是"影"，不是高光 */
    x.fillStyle = 'rgba(34,22,6,0.32)';
    x.beginPath();
    x.ellipse(p.x - rx * 0.22, p.y + ry * 0.62, rx * 1.06, ry * 1.1, tilt, 0, Math.PI * 2);
    x.fill();
    for (let k = 0; k < lobes; k++) {
      const ox = k ? (rnd() - 0.5) * rx * 1.1 : 0;
      const oy = k ? (rnd() - 0.5) * ry * 0.9 : 0;
      const rr = k ? rx * (0.60 + rnd() * 0.34) : rx;
      const ry2 = rr * (0.40 + rnd() * 0.14);
      /* 顶面只是"比周围亮一点点"，四周压到沙的暗色 —— 这样才像鼓起来的沙 */
      const mg = x.createRadialGradient(
        p.x + ox + rr * 0.34, p.y + oy - ry2 * 0.66, 1,
        p.x + ox, p.y + oy, rr);
      mg.addColorStop(0, SL.sandLit);
      mg.addColorStop(0.52, SL.sand);
      mg.addColorStop(1, SL.sandDark);
      x.fillStyle = mg;
      x.beginPath(); x.ellipse(p.x + ox, p.y + oy, rr, ry2, tilt, 0, Math.PI * 2); x.fill();
      /* 迎光一侧的一丝亮边（很细，不是整圈高光） */
      x.strokeStyle = 'rgba(255,236,196,0.15)';
      x.lineWidth = 0.9;
      x.beginPath();
      x.ellipse(p.x + ox - rr * 0.06, p.y + oy - ry2 * 0.18, rr * 0.84, ry2 * 0.84, tilt,
        -Math.PI * 1.02, -Math.PI * 0.46);
      x.stroke();
      /* 等高圈（沙盘上都这么堆） */
      for (let j = 1; j <= 2; j++) {
        const q = 1 - j * 0.3;
        x.strokeStyle = `rgba(88,66,30,${0.17 - j * 0.05})`;
        x.lineWidth = 0.8;
        x.beginPath(); x.ellipse(p.x + ox, p.y + oy, rr * q, ry2 * q, tilt, 0, Math.PI * 2); x.stroke();
      }
    }
    x.restore();
  }

  /* ── 河道：手指划出来的沟，迎光一边亮、背光一边暗 ── */
  const carve = (pts, wdt) => {
    const path = pts.map(([u, v]) => proj(u, v));
    const stroke = (color, width, dy) => {
      x.strokeStyle = color;
      x.lineWidth = width;
      x.lineJoin = 'round';
      x.lineCap = 'round';
      x.beginPath();
      path.forEach((p, i) => {
        const py = p.y + dy * p.s;
        if (i === 0) x.moveTo(p.x, py); else x.lineTo(p.x, py);
      });
      x.stroke();
    };
    stroke('rgba(24,16,6,0.5)', wdt + 5, 2);      // 沟外侧的落影
    stroke(SL.waterDeep, wdt, 0);                 // 沟底
    stroke(SL.water, wdt - 2.5, 0);
    stroke('rgba(255,228,180,0.30)', 1.6, -wdt * 0.5);   // 迎光的沙棱
    stroke(SL.waterLit, 1.2, wdt * 0.26);
  };
  carve(CHANGJIANG, 11);
  carve(CHISHUI, 6);

  /* 写在沙上的字（长江 / 赤水河） */
  x.save();
  x.fillStyle = 'rgba(38,26,10,0.62)';
  x.font = `13px ${palette().kai}`;
  x.textAlign = 'center';
  const cp = proj(0.505, 0.920);
  x.fillText('长   江', cp.x, cp.y - 9);
  x.save();
  const csp = proj(0.205, 0.650);
  x.translate(csp.x - 4, csp.y);
  x.rotate(-0.62);
  x.font = `11px ${palette().kai}`;
  x.fillText('赤 水 河', 0, -8);
  x.restore();
  x.restore();

  /* ── 路：也是沟，比河浅。桥（边）不是画出来的，走过才留下痕迹 ── */
  for (const [a, b] of EDGES) {
    const A = byId.get(a); const B = byId.get(b);
    if (!A || !B) continue;
    const pa = proj(A.u, A.v); const pb = proj(B.u, B.v);
    const mx = (pa.x + pb.x) / 2; const my = (pa.y + pb.y) / 2;
    const dx = pb.x - pa.x; const dy = pb.y - pa.y;
    const L = Math.hypot(dx, dy) || 1;
    const k = 10;
    const cx = mx - (dy / L) * k; const cy = my + (dx / L) * k;
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(30,20,7,0.42)';
    x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(pa.x, pa.y); x.quadraticCurveTo(cx, cy, pb.x, pb.y); x.stroke();
    x.strokeStyle = 'rgba(255,230,186,0.16)';
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(pa.x, pa.y - 1.6); x.quadraticCurveTo(cx, cy - 1.6, pb.x, pb.y - 1.6); x.stroke();
  }

  x.restore();

  /* ── 油灯：画面右上角。灯罩、灯芯、火苗，以及落在沙上的一团暖光 ── */
  x.save();
  x.translate(LAMP.x, LAMP.y);
  /* 灯座（铁皮油壶） */
  x.beginPath();
  x.moveTo(-19, 20); x.lineTo(19, 20); x.lineTo(12, 4); x.lineTo(-12, 4); x.closePath();
  x.fillStyle = '#241a12';
  x.fill();
  x.strokeStyle = 'rgba(206,158,88,0.85)';
  x.lineWidth = 1.3;
  x.stroke();
  x.beginPath(); x.moveTo(-23, 20); x.lineTo(23, 20);
  x.strokeStyle = 'rgba(206,158,88,0.6)'; x.lineWidth = 2.4; x.stroke();
  /* 灯口 */
  x.beginPath(); x.ellipse(0, 4, 12, 3.4, 0, 0, Math.PI * 2);
  x.fillStyle = '#3a2a1a'; x.fill();
  x.strokeStyle = 'rgba(226,182,110,0.7)'; x.lineWidth = 1; x.stroke();
  /* 火苗 + 光晕 */
  const halo = x.createRadialGradient(0, -12, 2, 0, -12, 46);
  halo.addColorStop(0, 'rgba(255,238,190,0.55)');
  halo.addColorStop(0.35, 'rgba(255,196,104,0.24)');
  halo.addColorStop(1, 'rgba(255,170,60,0)');
  x.fillStyle = halo;
  x.beginPath(); x.arc(0, -12, 46, 0, Math.PI * 2); x.fill();
  const fl = x.createRadialGradient(0, -8, 1, 0, -8, 17);
  fl.addColorStop(0, 'rgba(255,250,228,0.98)');
  fl.addColorStop(0.3, 'rgba(255,206,120,0.85)');
  fl.addColorStop(1, 'rgba(255,160,50,0)');
  x.fillStyle = fl;
  x.beginPath(); x.ellipse(0, -9, 9, 16, 0, 0, Math.PI * 2); x.fill();
  x.restore();

  /* 屋子角落的小字：告诉玩家这是哪一年、哪个夜里 */
  x.save();
  x.fillStyle = 'rgba(216,190,140,0.62)';
  x.font = `12px ${palette().kai}`;
  x.fillText('遵义 · 一九三五年一月 · 夜', 20, 24);
  x.fillStyle = 'rgba(216,190,140,0.4)';
  x.font = `11px ${palette().num}`;
  x.fillText('川 黔 边 · 沙 盘', 20, 40);
  x.restore();

  return cv;
}

/* ══════════════════════════════════════════════════════════════════
   玩法主体
   ══════════════════════════════════════════════════════════════════ */

export function runSandTableGame(container, opts = {}) {
  return new Promise((resolve) => {
    ensureStyle();
    const P = palette();
    rollMap();

    container.innerHTML = `
      <div class="smini2-wrap">
        <p class="smini2-lead">
          油灯挪到沙盘上。北边那道沟是<b>长江</b>，川军的旗子顺着江岸插了一排。
          地图上标着地名的纸旗你都知道，<b>纸旗底下压着多少兵，你一个都不知道</b>。
        </p>
        <div class="smini2-table" id="st-table">
          <canvas class="smini2-canvas" id="st-canvas" width="${W}" height="${H}"
                  aria-label="川黔边沙盘：点地图上亮起的纸旗行军，点下方的牌子派侦察兵"></canvas>
          <div class="smini2-tags" id="st-tags"></div>
        </div>
        <p class="smini2-status" id="st-status"></p>
        <div class="blk-actions center" id="st-scout"></div>
        <div class="blk-actions center" id="st-act"></div>
        <p class="smini2-hint">
          <b>两个侦察兵，九格行军点，三个整编主力。</b>走到长江边的渡口就算出去。<br>
          沙上鼓起来的小包包＝<b>敌情不明</b>；派侦察兵去拨开沙，才知道底下是多少兵（前卫／封锁线／重兵）。<br>
          撞上封锁线：<b>强攻</b>要折一个主力，<b>后撤</b>白费一格行军点。撞上重兵，强攻要折两个 —— 按不按在你。<br>
          两条路都通长江：东路短而硬，西路长而软。<b>行军点用完、或者主力打光，就是输。</b>
        </p>
      </div>
    `;
    const canvas = container.querySelector('#st-canvas');
    const ctx = canvas.getContext('2d');
    const tagsEl = container.querySelector('#st-tags');
    const statusEl = container.querySelector('#st-status');
    const scoutRow = container.querySelector('#st-scout');
    const actRow = container.querySelector('#st-act');

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const base = buildSandBase();

    /* ── 局内状态 ── */
    let march = RULES.MARCH;
    let scouts = RULES.SCOUTS;
    let troops = RULES.TROOPS;
    let cur = 'zunyi';
    let route = ['zunyi'];
    let phase = 'move';           // move | contact | crossed | stuck | broken
    let contactAt = null;         // 撞上的那个节点
    let chosen = [];              // 每个接触点怎么处理的
    let scouted = [];
    let deepest = 0;              // 走到最北的地方（失败时给分用）
    let resolved = false;
    let finishTimer = 0;           // 结算动画的排定定时器 id（0 = 还没排定）；拆容器时要清掉
    /** 只结一次账：正常玩完走 finish()（它比最后一步晚 0.7–0.9s），容器被拆走也要结 ——
     *  否则内层 Promise 永远挂着，canvas / 定时器 / 闭包全被钉住。见 sentry 的同款写法。 */
    function settleOnce(result) {
      if (resolved) return;
      resolved = true;
      resolve(result);
    }
    /** 中途被拆走：形状与各支一致（score 0 · detached · aborted），别改分与 detail 的形状 */
    function settleDetached() {
      settleOnce({ score: 0, detail: { outcome: 'none', why: 'detached', aborted: true }, summary: '' });
    }
    let status = '沙盘摊开了。先派侦察兵，还是先动身？';
    let statusCls = '';
    let fx = [];                  // 扬起来的沙
    let pop = new Map();          // 揭示动画：id -> 0..1
    let shake = 0;

    const ac = new AbortController();
    const { signal } = ac;

    function setStatus(text, cls = '') {
      status = text;
      statusCls = cls === 'warn' ? 'warn' : cls === 'good' ? 'good' : '';
      statusEl.textContent = text;
      statusEl.className = 'smini2-status' + (statusCls ? ' ' + statusCls : '');
    }

    /* ── 纸旗（DOM，字才清楚；沙里的杆子画在画布上） ── */
    const tagEls = new Map();
    for (const n of nodes) {
      const p = proj(n.u, n.v);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'smini2-tag';
      b.dataset.node = n.id;
      b.style.left = (p.x / W) * 100 + '%';
      b.style.top = (p.y / H) * 100 + '%';
      b.style.fontSize = (11 * p.s).toFixed(1) + 'px';
      b.style.setProperty('--stick', (22 * p.s).toFixed(1) + 'px');
      const tilt = ((n.u * 7 + n.v * 5) % 1) * 5 - 2.5;
      b.style.transform = `translate(-50%, calc(-100% - var(--stick))) rotate(${tilt.toFixed(1)}deg)`;
      b.innerHTML = `<span class="nm">${n.name}</span>`;
      b.addEventListener('click', () => visit(n.id), { signal });
      tagsEl.appendChild(b);
      tagEls.set(n.id, b);
    }

    /* ── 刷新界面 ── */
    function refresh() {
      for (const n of nodes) {
        const b = tagEls.get(n.id);
        const adj = neighbors(cur).includes(n.id);
        const canGo = phase === 'move' && adj && march > 0;
        b.querySelectorAll('.foe').forEach((e) => e.remove());
        if (n.known) {
          const f = document.createElement('span');
          f.className = 'foe';
          f.textContent = n.cleared && n.foe > 0
            ? '已打通'
            : `${n.army === '—' ? '' : n.army + '·'}${FOE_NAME[n.foe]}`;
          b.appendChild(f);
        }
        b.classList.toggle('can', canGo);
        b.classList.toggle('cur', n.id === cur);
        b.classList.toggle('seen', n.visits > 0);
        if (canGo) b.dataset.miniAction = 'visit';
        else { delete b.dataset.miniAction; b.disabled = true; }
        if (canGo) b.disabled = false;
        b.setAttribute('aria-label',
          `${n.name}${n.known ? `，${n.army === '—' ? '' : n.army + '·'}${FOE_NAME[n.foe]}` : '，敌情不明'}`
          + `${n.id === cur ? '，我军在此' : adj ? '，可走' : ''}`);
      }

      /* 侦察兵：还没探过的都能派 */
      scoutRow.innerHTML = '';
      if (scouts > 0) {
        const cap = document.createElement('span');
        cap.className = 'smini2-cap';
        cap.textContent = `派侦察兵（剩 ${scouts}）→`;
        scoutRow.appendChild(cap);
        for (const n of nodes) {
          if (n.known || n.id === cur) continue;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn sm smini2-scout-chip';
          b.dataset.miniAction = 'scout';
          b.dataset.node = n.id;
          b.textContent = n.name;
          b.addEventListener('click', () => doScout(n.id), { signal });
          scoutRow.appendChild(b);
        }
      } else {
        const cap = document.createElement('span');
        cap.className = 'smini2-cap';
        cap.textContent = '侦察兵已经派出去了，剩下的只能靠判断。';
        scoutRow.appendChild(cap);
      }

      /* 行动 */
      actRow.innerHTML = '';
      if (phase === 'move') {
        if (route.length > 1) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn sm';
          b.dataset.miniAction = 'back';
          const prev = byId.get(route[route.length - 2]);
          b.textContent = `按原路退到 ${prev.name}`;
          b.addEventListener('click', () => visit(prev.id), { signal });
          actRow.appendChild(b);
        }
      } else if (phase === 'contact') {
        const n = contactAt;
        const men = FOE_MEN[n.foe];
        const lethal = troops - men <= 0;
        const bs = document.createElement('button');
        bs.type = 'button';
        bs.className = 'btn ' + (lethal ? 'smini2-lethal' : 'primary');
        bs.dataset.miniAction = 'storm';
        bs.innerHTML = lethal
          ? `强攻 · 会打光（折损 ${men}）`
          : `强攻 · 折损 ${men} 个主力`;
        bs.addEventListener('click', doStorm, { signal });
        const bw = document.createElement('button');
        bw.type = 'button';
        bw.className = 'btn';
        bw.dataset.miniAction = 'withdraw';
        bw.textContent = '后撤 · 白费 1 个行军点';
        bw.addEventListener('click', doWithdraw, { signal });
        actRow.appendChild(bs); actRow.appendChild(bw);
      }

      stats(opts.stats, [
        ['行军点', `${march}/${RULES.MARCH}`, march <= 2 ? 'warn' : ''],
        ['侦察兵', scouts],
        ['主力', '●'.repeat(Math.max(0, troops)) + '○'.repeat(Math.max(0, RULES.TROOPS - troops)),
          troops <= 1 ? 'warn' : ''],
        ['走到', byId.get(cur).name],
      ]);

      container.dataset.mini = 'wargame';
      container.dataset.miniState = phase;
      container.dataset.miniMarch = String(march);
      container.dataset.miniScouts = String(scouts);
      container.dataset.miniTroops = String(troops);
      container.dataset.miniAt = cur;
      container.dataset.miniFoe = byId.get(cur).known ? String(byId.get(cur).foe) : '';
      container.dataset.miniPath = route.join('>');
      container.dataset.miniPhase = phase;
    }

    /* ── 侦察 ── */
    function doScout(id) {
      if (phase !== 'move' || scouts <= 0) return;
      const n = byId.get(id);
      if (!n || n.known) return;
      n.known = true;
      scouts -= 1;
      scouted.push(id);
      pop.set(id, 0);
      /* 拨开沙：一撮沙扬起来 */
      const p = proj(n.u, n.v);
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7;
        const sp = 18 + Math.random() * 46;
        fx.push({ x: p.x + (Math.random() - 0.5) * 10 * p.s, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, r: 0.8 + Math.random() * 1.4 });
      }
      sfx('click');
      setStatus(`侦察兵回来了：${n.intel}`, n.foe >= 3 ? 'warn' : '');
      refresh();
    }

    /* ── 行军 ── */
    function visit(id) {
      if (phase !== 'move' || march <= 0) return;
      if (!neighbors(cur).includes(id)) return;
      const n = byId.get(id);
      march -= 1;
      route.push(id);
      n.visits += 1;
      n.known = true;          // 人到那儿了，那儿有多少兵自然就知道了（不该再画"敌情不明"的沙包）
      cur = id;
      deepest = Math.max(deepest, n.v);
      sfx('click');
      resolveAt(n);
    }

    function resolveAt(n) {
      if (n.cleared) {
        /* 已经打通的口子不再收第二遍"折损"—— 后撤绕一圈再回来是允许的，
           但同一个卡子不该让玩家付两次代价 */
        setStatus(`${n.name}。这个卡子已经打通过了，队伍从缺口里过去。`);
        arrive(n);
        return;
      }
      if (n.foe === 0) {
        setStatus(`${n.name}：空的。部队踩着沙上的沟走过去，连枪都没响。`);
        arrive(n);
        return;
      }
      if (n.foe === 1) {
        n.cleared = true;
        setStatus(`${n.name}：${n.army}的搜索队。前卫一个冲锋就把它打散了，队伍没停。`);
        arrive(n);
        return;
      }
      /* 封锁线 / 重兵 —— 停下来，交给玩家决定 */
      phase = 'contact';
      contactAt = n;
      if (!n.known) {
        n.known = true;               // 撞上了，自然就知道了
        pop.set(n.id, 0);
      }
      if (n.foe === 3) {
        setStatus(`${n.name}方向的枪声不对 —— ${n.intel}`, 'warn');
      } else {
        setStatus(`${n.name}是封锁线。硬打要折人，退回去要费工夫。`, 'warn');
      }
      shake = 1;
      refresh();
    }

    /** 走到一个节点后的收尾：是不是渡口、行军点还够不够 */
    function arrive(n) {
      if (n.kind === 'ford') { doCross(n); return; }
      if (march <= 0) {
        phase = 'stuck';
        setStatus('行军点用完了。四面都是兵，只好退回川黔边。', 'warn');
        refresh();
        finish();
        return;
      }
      phase = 'move';
      refresh();
    }

    /* ── 撞上以后：强攻 / 后撤 ── */
    function doStorm() {
      if (phase !== 'contact') return;
      const n = contactAt;
      const men = FOE_MEN[n.foe];
      troops -= men;
      chosen.push({ node: n.id, kind: FOE_NAME[n.foe], choice: 'storm', men });
      shake = 1;
      sfx('thud');
      if (troops <= 0) {
        troops = 0;
        phase = 'broken';
        setStatus(`强攻${n.name}。主力打光了 —— 沙盘上那面红旗，没人再扶。`, 'warn');
        refresh();
        finish();
        return;
      }
      n.cleared = true;               // 打下来了，再走这个口子不收费（打光的那个不算）
      setStatus(`强攻。部队从${n.name}冲过去了，沙盘上少摆 ${men} 枚棋子。`, 'warn');
      contactAt = null;
      arrive(n);
    }

    function doWithdraw() {
      if (phase !== 'contact') return;
      const n = contactAt;
      chosen.push({ node: n.id, kind: FOE_NAME[n.foe], choice: 'withdraw', men: 0 });
      route.pop();
      const to = byId.get(route[route.length - 1]);
      cur = to.id;
      march -= 1;
      contactAt = null;
      sfx('click');
      if (march <= 0) {
        phase = 'stuck';
        setStatus('退回来，行军点也见底了。只剩退回川黔边一条路。', 'warn');
        refresh();
        finish();
        return;
      }
      setStatus(`后撤 —— 从${n.name}退到${to.name}。这点兵得留着。`, 'warn');
      phase = 'move';
      refresh();
    }

    function doCross(n) {
      phase = 'crossed';
      /* 渡江不算"接触点"：它已经写在 route 里了，detail.contacts 只留真的打过/退过的 */
      setStatus(`${n.name}。船都在江边，天亮前必须过完。`, 'good');
      refresh();
      sfx('click');
      finish();
    }

    /* ── 结算 ── */
    function finish() {
      if (resolved) return;
      const reached = phase === 'crossed';
      let score;
      if (reached) {
        score = 0.55 + (troops / RULES.TROOPS) * 0.25 + (Math.max(0, march) / RULES.MARCH) * 0.20;
      } else {
        score = 0.10 + deepest * 0.14 + (troops / RULES.TROOPS) * 0.06;
      }
      score = clamp(score, 0, 1);
      const names = route.map((id) => byId.get(id).name);
      const summary = reached
        ? `沙盘推演：探了 ${scouted.length} 处，走${names.slice(1).join('→')}，从${byId.get(cur).name}过江。主力还剩 ${troops} 个，行军点剩 ${Math.max(0, march)}。`
        : phase === 'broken'
          ? `沙盘推演：在${byId.get(cur).name}硬拼，主力打光了，没能过江。`
          : `沙盘推演：行军点用尽，停在${byId.get(cur).name}，没能过江。`;
      finishTimer = setTimeout(() => settleOnce({
        score: Math.round(score * 100) / 100,
        detail: {
          reached,
          how: reached ? 'cross' : phase,
          troops, marchLeft: Math.max(0, march),
          route, routeNames: names,
          scouted, scoutsLeft: scouts,
          contacts: chosen,
          foeMap: Object.fromEntries(nodes.map((n) => [n.id, n.foe])),
        },
        summary,
      }), reached ? 700 : 900);
    }

    /* ── 每帧 ── */
    function draw(t) {
      ctx.drawImage(base, 0, 0, W, H);

      /* 走过的手指划痕（会一直留在沙上） */
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 1; i < route.length; i++) {
        const A = byId.get(route[i - 1]); const B = byId.get(route[i]);
        const pa = proj(A.u, A.v); const pb = proj(B.u, B.v);
        const dx = pb.x - pa.x; const dy = pb.y - pa.y;
        const L = Math.hypot(dx, dy) || 1;
        const cx = (pa.x + pb.x) / 2 - (dy / L) * 12 + Math.sin(i * 2.1) * 3;
        const cy = (pa.y + pb.y) / 2 + (dx / L) * 12 + Math.cos(i * 1.7) * 3;
        ctx.strokeStyle = 'rgba(30,19,6,0.5)';
        ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.quadraticCurveTo(cx, cy, pb.x, pb.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,231,188,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y - 2); ctx.quadraticCurveTo(cx, cy - 2, pb.x, pb.y - 2); ctx.stroke();
      }
      ctx.restore();

      /* 每个节点：沙包（敌情不明）/ 敌军旗（已探明）/ 地名杆子 */
      for (const n of nodes) {
        const p = proj(n.u, n.v);
        const pk = pop.get(n.id);
        /* 杆子：长度与纸旗的 --stick 对齐，纸旗就"插"在这根杆上 */
        const stick = 22 * p.s;
        ctx.strokeStyle = 'rgba(46,30,12,0.85)';
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - stick); ctx.stroke();
        ctx.fillStyle = 'rgba(28,18,6,0.42)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 3.4 * p.s, 1.5 * p.s, 0, 0, Math.PI * 2); ctx.fill();

        if (n.id !== cur && n.visits > 0) {
          ctx.strokeStyle = 'rgba(40,26,8,0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 5.5 * p.s, 2.4 * p.s, 0, 0, Math.PI * 2); ctx.stroke();
        }

        if (!n.known) {
          /* 敌情不明＝沙上鼓起一个小包，底下是什么不知道 */
          const r = 6.5 * p.s;
          ctx.fillStyle = 'rgba(40,26,8,0.34)';
          ctx.beginPath(); ctx.ellipse(p.x - 1, p.y + 1.4, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
          const g = ctx.createRadialGradient(p.x + r * 0.3, p.y - r * 0.3, 0.5, p.x, p.y, r);
          g.addColorStop(0, SL.ridgeLit);
          g.addColorStop(1, SL.sandDark);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        } else if (n.foe > 0) {
          /* 已探明：纸旗左前方插一面敌旗（旗面朝左，免得被纸旗盖住），
             重兵那处的旗子更大更沉，旁边按兵力摆几个点 */
          const rise = pk !== undefined ? Math.min(1, pk * 3) : 1;
          const sz = p.s;
          const px0 = p.x - 4 * sz;
          const ph = (11 + n.foe * 2.6) * sz * (0.5 + 0.5 * rise);
          const top = p.y - ph;
          const len = (6.5 + n.foe * 2.6) * sz;
          ctx.save();
          ctx.globalAlpha = 0.35 + 0.65 * rise;
          ctx.strokeStyle = 'rgba(30,20,8,0.92)';
          ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.moveTo(px0, p.y + 1); ctx.lineTo(px0, top); ctx.stroke();
          ctx.fillStyle = n.foe >= 3 ? SL.foeDark : SL.foe;
          ctx.beginPath();
          ctx.moveTo(px0, top);
          ctx.lineTo(px0 - len, top + len * 0.52);
          ctx.lineTo(px0, top + len * 1.04);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,232,190,0.36)';
          ctx.lineWidth = 0.9;
          ctx.stroke();
          /* 兵力：几个点（重兵那处用红点，一眼看出是硬的） */
          ctx.fillStyle = n.foe >= 3 ? SL.redLit : 'rgba(255,240,206,0.92)';
          for (let k = 0; k < n.foe; k++) {
            ctx.beginPath();
            ctx.arc(px0 - 2.6 - k * 4.6, top + len * 1.04 + 4.4 * sz, 1.9, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      /* 我们的红旗 + 木棋子（打掉一个主力就少一枚，看得见） */
      const cp = proj(byId.get(cur).u, byId.get(cur).v);
      const wave = Math.sin(t * 2.4) * 1.6;
      const rh = 30 * cp.s;
      ctx.save();
      ctx.strokeStyle = 'rgba(28,18,6,0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cp.x + 1, cp.y - 3);
      ctx.quadraticCurveTo(cp.x + 1 + wave, cp.y - rh * 0.55, cp.x + 1, cp.y - rh);
      ctx.stroke();
      ctx.fillStyle = SL.red;
      ctx.beginPath();
      ctx.moveTo(cp.x + 1, cp.y - rh);
      ctx.quadraticCurveTo(cp.x + 11 + wave, cp.y - rh + 3, cp.x + 19 + wave * 1.4, cp.y - rh + 5);
      ctx.quadraticCurveTo(cp.x + 11 + wave, cp.y - rh + 10, cp.x + 1, cp.y - rh + 13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = SL.redLit;
      ctx.beginPath();
      ctx.moveTo(cp.x + 1, cp.y - rh);
      ctx.quadraticCurveTo(cp.x + 11 + wave, cp.y - rh + 3, cp.x + 19 + wave * 1.4, cp.y - rh + 5);
      ctx.lineTo(cp.x + 1, cp.y - rh + 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      /* 棋子 */
      for (let i = 0; i < troops; i++) {
        const tx = cp.x - 12 - (i % 2) * 8;
        const ty = cp.y + 6 + Math.floor(i / 2) * 6;
        ctx.fillStyle = 'rgba(40,26,8,0.35)';
        ctx.fillRect(tx + 0.6, ty + 0.8, 6.4 * cp.s, 4.6 * cp.s);
        ctx.fillStyle = '#8a6b3c';
        ctx.fillRect(tx, ty, 6.4 * cp.s, 4.6 * cp.s);
        ctx.strokeStyle = 'rgba(30,20,8,0.8)';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(tx, ty, 6.4 * cp.s, 4.6 * cp.s);
        ctx.strokeStyle = 'rgba(255,232,190,0.4)';
        ctx.beginPath(); ctx.moveTo(tx + 0.8, ty + 0.6); ctx.lineTo(tx + 6.4 * cp.s - 0.8, ty + 0.6); ctx.stroke();
      }

      /* 扬起来的沙 */
      for (const f of fx) {
        ctx.fillStyle = `rgba(214,186,132,${0.75 * f.life})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }

      /* 灯：照亮沙盘右上一大片，越往左下越沉进暗里 */
      const fl = 0.9 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 2.1) * 0.03;
      const lg = ctx.createRadialGradient(LAMP.x - 30, LAMP.y + 70, 30, LAMP.x - 30, LAMP.y + 70, 640 * fl);
      lg.addColorStop(0, 'rgba(255,198,106,0.24)');
      lg.addColorStop(0.4, 'rgba(210,150,70,0.11)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, W, H);

      const vx = LAMP.x - 80; const vy = LAMP.y + 100;
      const vg = ctx.createRadialGradient(vx, vy, 70, vx, vy, 820);
      vg.addColorStop(0, 'rgba(8,5,2,0)');
      vg.addColorStop(0.42, 'rgba(8,5,2,0.10)');
      vg.addColorStop(0.74, 'rgba(8,5,2,0.30)');
      vg.addColorStop(1, 'rgba(6,4,2,0.62)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      /* 挨打的震一下 */
      if (shake > 0.01) {
        ctx.fillStyle = `rgba(180,60,40,${0.16 * shake})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    /* ── 主循环：离开板屏就自己停 ── */
    let raf = 0; let last = 0;
    function loop(ts) {
      if (!document.body.contains(container)) { ac.abort(); cancelAnimationFrame(raf); clearTimeout(finishTimer); settleDetached(); return; }
      const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
      last = ts;
      const t = ts / 1000;
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.vy += 120 * dt;
        f.x += f.vx * dt; f.y += f.vy * dt;
        f.life -= dt * 1.5;
        if (f.life <= 0) fx.splice(i, 1);
      }
      for (const [k, v] of pop) {
        const nv = v + dt * 2.4;
        if (nv >= 1) pop.delete(k); else pop.set(k, nv);
      }
      if (shake > 0) shake = Math.max(0, shake - dt * 2.2);
      draw(t);
      raf = requestAnimationFrame(loop);
    }

    refresh();
    setStatus(status);
    raf = requestAnimationFrame(loop);
  });
}

/* ══════════════════════════════════════════════════════════════════
   这份清单供调试台渲染。它**不**混进 minigames-registry.js。
   ══════════════════════════════════════════════════════════════════ */

export const SANDTABLE_MINIGAMES = [
  {
    id: 'wargame',
    title: '沙盘推演 · 往哪里走',
    family: '决策',
    run: (host, o = {}) => runSandTableGame(host, o),
    states: ['move', 'contact', 'crossed', 'stuck', 'broken'],
    actions: ['visit', 'scout', 'storm', 'withdraw', 'back'],
    act: 'act2 · 遵义',
    note: '两个侦察兵探十三条路里的两处，九格行军点走到长江；每个接触点都要在"强攻折人"与"后撤费时"之间选一次。行军点用尽或主力打光即输。',
  },
];
