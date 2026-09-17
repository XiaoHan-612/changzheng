/**
 * 《飞夺泸定桥 · 攀链》v2（**重做版 · 单独开发，未接入主线**）
 *
 * ── 为什么有 v2（v1 为什么不算数）──
 *   这一支的 v1（本文件上一版）做的是「曳光预警 0.85 秒 → 按住 S 贴链 → 中弹 +1 → 满 3 次坠江」。
 *   它和同批的陡坡 / 浮桥 / 担架是**同一套骨架**：等一个预警窗口、按一下、扣一格、扣满 M 次失败。
 *   用户否掉的正是这个 —— 四支玩法拆开看是四个题材，合起来是一个人。
 *   v2 换骨架：**不再有预警窗口，不再有"按一下躲"**。
 *
 * ── v2 的骨架：两个不可逆的稀缺资源 × 一条时钟 × 一个换挡税 ──
 *   你不是在躲子弹，你是在**排班**：
 *     · **姿态**（连续量）：贴链匍匐 0.95 m/s、折人 ×0.25 ⇄ 直起身冲 3.05 m/s、折人 ×1.85。
 *       没有"正确的时机"，只有"你愿意拿多少人换多少秒"。**换姿势要站住 0.75 秒**（这半秒最贵）。
 *     · **6 块门板**（不可逆）：把**你脚下这一段**铺成板面 —— 板上折人 ×0.13，可以放心冲。
 *       102 米、12 段光链上只有 6 段拿得到它，**铺在西段（火力弱）= 白扔**。
 *       铺板要站住 2.5 秒（三连扛着门板爬到你脚边，这三秒他们全在火力下）。
 *     · **3 发掩护**（不可逆）：停火 5 秒（折人归零）。三发不能叠加，用早用晚都是账。
 *   两条失败线：
 *     · **折完 22 人**（一路直冲 ≈ 28 秒就折光 —— "他一个人冲过去了"不是胜利）
 *     · **78 秒到没过完**（一路贴链要 107 秒 —— 东桥头浇了煤油，火封桥面）
 *   与陡坡 v3 的对照（**刻意做成镜像**）：陡坡按下去 = 用力（危险、会绷断，靠"松手"活下来）；
 *   泸定按下去 = 贴住（安全、但慢，靠"松开"抢时间）。两边的按键动作相反，胜负手也相反。
 *
 * ── 画面：画作当场景（沿用陡坡 v3 定下的路线）──
 *   项目里 `assets/scenes/luding_bridge.jpg` 画的**就是这一局**：西石墩、多股铁索、
 *   **中段残存的桥板**、深峡水汽、"下午四点"的暖光。板屏背景早就是这张图
 *   （`main.js` 的 `doLuding` 里 `openBoard({bg: sceneImage('/assets/scenes/luding_bridge.jpg')})`）。
 *   所以**一个像素都不重画**：取画作一块当取景框原样铺上，可交互的东西全是覆盖层 ——
 *   桥面轴线（`DECK`，在画上量出来的折线）、已铺的新板、你身后的队列点、东桥头机枪口的曳光、
 *   掩护的曳光、最后点起来的火。坐标全部是**画作像素**，不是"我想象中的位置"。
 *
 * ── 史实锚点（出处见 docs/HANDOFF-LUDING.md）──
 *   1935-05-29 下午四时总攻，红四团夺泸定桥：
 *     · 桥长约 100 米、**13 根铁链**（9 根桥面、4 根扶栏）；川军已拆去大部分桥板，
 *       **靠西桥头一块板也没有**；
 *     · 二连连长廖大珠带 **22 名勇士**，身挂冲锋枪、背插马刀、腰缠手榴弹，**攀着光铁索匍匐前进**；
 *       记述："双脚缠着铁链""两腿夹着链条，挪步前进""紧贴铁索，一尺一尺向前爬行"；
 *     · 敌机枪、迫击炮在东桥头高地组成火力网，"子弹打在铁索上叮当作响"；
 *       **两名突击队员中弹坠入河中**；
 *     · 三连跟在后面**每人扛一块门板，边铺边冲**；
 *     · 接近东桥头时**敌人浇煤油点火**，廖大珠带头**冲进火海**；**40 分钟**夺下桥头。
 *   → 机制全从这几句来：贴链 / 直起身两种姿态、"22 人"这个数、门板铺在脚下、
 *     东桥头火力递增、最后两段是火、时间走完 = 火封桥面。
 *   **虚构声明**：火力数值、门板 6 块、掩护 3 发、局内 78 秒都是互动化设计，不是史实。
 *
 * ── 接不接 AI：不接 ──
 *   用户原话："泸定桥这支不用游戏 API 也行，把体验和画面做好。" 游戏内 **0 次模型调用**。
 *   理由是硬的：这是一局 78 秒的连续取舍，没有一秒能让玩家站着等模型。
 *   主线 `minigame_review` 的 luding 分支接线后接管判词。
 *
 * 玩法 id：`luding-chain`（**故意不复用 `luding`** —— 调试台按 id 查表，撞 id 会取到主线那份旧的）。
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

/* ══════════════ 小工具（自包含，不 import minigames.js）══════════════ */

function h(tag, attrs = {}, kids = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) el.appendChild(kid);
  return el;
}

function mount(container, node) {
  container.innerHTML = '';
  container.appendChild(node);
  return node;
}

function stats(_host, items) { return STATS(items); }

const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs = {}, kids = []) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) el.appendChild(kid);
  return el;
}

/**
 * 渐变的 stop 列表 —— **必须显式构造 `<stop>` 元素**。
 * ⚠️ 踩过的坑（陡坡 v3 初稿）：把 `[['0%','#fff',.9], ...]` 这种"数组的数组"当 kids 传给 `sv()`，
 *    而 `sv()` 只认元素节点 → `appendChild([...])` 直接抛
 *    `Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'`。
 *    因为抛在构造函数里，表现是"玩法连第一帧都到不了"，dataset 上一个字段都没有。
 */
function stopEls(stops) {
  return stops.map(([o, c, a]) => sv('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 }));
}
/** 线性渐变（画作坐标，userSpaceOnUse） */
function linGrad(id, x1, y1, x2, y2, stops) {
  return sv('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1, y1, x2, y2 }, stopEls(stops));
}
/** 径向渐变（画作坐标，userSpaceOnUse） */
function radGrad(id, cx, cy, r, stops) {
  return sv('radialGradient', { id, gradientUnits: 'userSpaceOnUse', cx, cy, r }, stopEls(stops));
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function play(sfx) {
  try { SFX(sfx); } catch { /* 音频没起来不影响玩法 */ }
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ══════════════ 几何：全部用**画作像素**（与 luding_bridge.jpg 一一对应）══════════════
 * QA 也 import 这些，别写两份。改这里 = 改画面上桥面落在哪儿。
 */

export const PAINT = { w: 1280, h: 872 };                     // 原画尺寸（luding_bridge.jpg）
export const PLATE = '/assets/scenes/luding_bridge.jpg';
/** 场上取景框（画作像素）。1232×690 —— 西石墩、整条桥、深峡、暖光天全在框内。 */
export const CROP = { x: 30, y: 112, w: 1232, h: 690 };

/**
 * 桥面轴线 —— **在画上量出来的折线**，不是估的。
 * 量法：把画放大 2 倍、叠 40px 坐标网格，逐段读出桥面木板带的上缘与下缘，取中线；
 * 再用"暖木色连通段"扫描复核（见 docs/HANDOFF-LUDING.md §九）。
 * 首点落在西石墩东面（画里桥板开始的地方），末点落在东崖斜面上。
 * ⚠️ 这 9 个点是"桥面上你走的那条线"，改动它 = 所有人（你、队列、门板、火力落点）整体挪位。
 */
export const DECK = [
  { x: 182, y: 523 }, { x: 300, y: 535 }, { x: 440, y: 547 },
  { x: 600, y: 557 }, { x: 760, y: 564 }, { x: 920, y: 568 },
  { x: 1060, y: 569 }, { x: 1180, y: 568 }, { x: 1240, y: 571 },
];

const DECK_SEGS = [];
export const DECK_LEN = (() => {
  let t = 0;
  for (let i = 0; i < DECK.length - 1; i += 1) {
    const a = DECK[i]; const b = DECK[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    DECK_SEGS.push({ from: t, len, a, b });
    t += len;
  }
  return t;
})();

/** 桥面位置 p（0=西桥头，1=东桥头）→ 画作坐标 */
export function deckAt(p) {
  const t = clamp(p, 0, 1) * DECK_LEN;
  for (const s of DECK_SEGS) {
    if (t <= s.from + s.len || s === DECK_SEGS[DECK_SEGS.length - 1]) {
      const k = s.len ? (t - s.from) / s.len : 0;
      return { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k };
    }
  }
  return { ...DECK[DECK.length - 1] };
}
/** 桥面位置 p 处的走向单位向量（用来把"横铺的板"摆正） */
export function deckDir(p) {
  const a = deckAt(p - 0.004);
  const b = deckAt(p + 0.004);
  const dx = b.x - a.x; const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L, y: dy / L };
}

export const BRIDGE_M = 102;                                   // 史实约 100 米
/** 画作 px / 米 —— 由轴线长度推出，QA 用它对账 */
export const PX_PER_M = DECK_LEN / BRIDGE_M;

/* ══════════════ 数值（QA 直接 import，改这里就是改手感）══════════════ */

export const SEGMENTS = 12;                 // 桥分 12 段，每段 8.5 米
export const SEG_M = BRIDGE_M / SEGMENTS;
export const MEN = 22;                      // 史实：22 名勇士
export const TIME = 78;                     // 局内 78 秒 ≈ 史实 40 分钟

/**
 * 每段的火力（**人/秒**，即"在这一段上每秒折多少人"）。从西到东递增 ——
 * 史实：机枪、迫击炮都在东桥头高地，"子弹打在铁索上叮当作响"；最后两段还浇了煤油。
 * 这张表就是本作的"难度曲线"，也是"门板该铺哪一段"的唯一依据。
 * 定表的口径（两版都实测过，见 docs/HANDOFF-LUDING.md §七）：
 *   · 一路直冲要折 32 人 > 22 —— "只求快"必须打死；
 *   · 3 发掩护全打出去换直冲，仍要折 25 人 > 22 —— **光靠掩护也过不去**，门板是硬需求。
 */
export const FIRE = [
  0.13, 0.18, 0.23, 0.28, 0.34, 0.40, 0.47, 0.54, 0.64, 0.77, 0.97, 1.30,
];

/** 姿态：贴链匍匐 ⇄ 直起身冲。没有"正确时机"，只有"拿多少人换多少秒"。 */
export const CLING = { spd: 0.95, hurt: 0.25, label: '贴链匍匐' };
export const RUSH = { spd: 3.05, hurt: 1.85, label: '直起身冲' };
/** 换姿势要站住多久 —— 这半秒不前进，而且这半秒的暴露按 SWAP_HURT 算 */
export const SWAP_SEC = 0.75;
export const SWAP_HURT = 1.20;

/** 板面段：折人 ×0.10（板上能借力、有遮挡），可以放心冲 —— 板的全部价值就在这个数 */
export const PLANK_HURT = 0.10;
/** 门板：6 块，把**脚下这一段**铺成板面；铺的 2.5 秒你得停下，三连在火力下扛板 */
export const PLANKS = 6;
export const LAY_SEC = 2.5;
export const LAY_HURT = 0.18;

/** 掩护：3 发，每发停火 5 秒（折人归零），不能叠加 */
export const COVERS = 3;
export const COVER_SEC = 5.0;
export const COVER_SPD = 1.0;

/** 东桥头的火什么时候起来（时间走过这个比例后开始点）—— 只影响画面，压死人的是时限本身 */
export const BURN_AT = 0.45;

/** 位置（米）→ 第几段（0 起） */
export function segOf(pos) {
  return Math.min(SEGMENTS - 1, Math.max(0, Math.floor(pos / SEG_M)));
}
/** 位置（米）处的火力 */
export function fireAt(pos) {
  return FIRE[segOf(pos)];
}
/** 分数：过桥分（活着的人 0.37 + 剩下的秒 0.18，活的越多/越快越高）*/
export function scoreOf(kind, m, deadN, tUsed, timeTotal = TIME) {
  if (kind === 'crossed') {
    const alive = Math.max(0, MEN - deadN) / MEN;
    return 0.45 + 0.37 * alive + 0.18 * clamp((timeTotal - tUsed) / timeTotal, 0, 1);
  }
  return 0.04 + 0.26 * clamp(m / BRIDGE_M, 0, 1);
}

/* ══════════════ 玩法本体 ══════════════ */

export function runLudingChain(container, opts = {}) {
  return new Promise((resolve) => {
    const rnd = opts.rnd || mulberry32(opts.rndSeed || 20260529);
    const TT = opts.time || TIME;      // 验收用短表来跑"火封桥"那条线

    /* ── 状态（全部先声明，避免 TDZ）── */
    let phase = 'brief';               // brief → cross → done
    let m = 0;                         // 位置（米）
    let dead = 0;                      // 折损（连续量）；deadN 是它的整数部分
    let tUsed = 0;
    let stance = 'rush';
    let wantStance = 'rush';
    let swapLeft = 0;
    let layLeft = 0;
    let laySeg = -1;
    let planks = PLANKS;
    const planked = new Set();
    let covers = COVERS;
    let coverLeft = 0;
    let hurtNow = 0;                   // 当前每秒折人率（含所有系数）
    let outcome = null;
    let why = '';
    let over = false;
    let settled = false;               // 内层 Promise 结过账没有（正常结算 / 中途被拆走都算）
    /** 只结一次账：正常玩完走 finish()，容器被拆走也要结 —— 否则内层 Promise 永远挂着，
     *  局内的 svg / 帧循环 / 闭包全被钉住（多局就是一路泄漏）。见 sentry 的同款写法。 */
    function settleOnce(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }
    /** 中途被拆走：形状与各支一致（score 0 · detached · aborted），别改分与 detail 的形状 */
    function settleDetached() {
      settleOnce({ score: 0, detail: { outcome: 'none', why: 'detached', aborted: true }, summary: '' });
    }
    let fb = '';
    let raf = 0;
    let last = performance.now();
    let lastDt = 0.016;
    let actsSig = '';
    let statsSig = '';
    const wind = [];

    const aliveN = () => Math.max(0, MEN - Math.floor(dead));
    const pOf = () => clamp(m / BRIDGE_M, 0, 1);
    const fireHer = () => fireAt(m);

    /* ── DOM ── */
    const root = h('div', { class: 'smini10-wrap' });
    mount(container, root);
    const lead = h('p', { class: 'smini10-lead' });
    const scene = h('div', { class: 'smini10-scene' });
    const acts = h('div', { class: 'smini10-acts' });
    const fbEl = h('div', { class: 'smini10-fb' });
    const hud = h('div', { class: 'smini10-hud' });
    const hudP = h('div', { class: 'hg-row' });
    const hudD = h('div', { class: 'hg-row' });
    const hudT = h('div', { class: 'hg-row' });
    const hudS = h('div', { class: 'hg-row' });
    hud.append(hudP, hudD, hudT, hudS);
    root.append(lead, scene, acts, fbEl, hud);

    /* ── 场景：画作原样铺 + 覆盖层 ──
       铺图用"放大 + 负偏移"裁切：容器 aspect-ratio = 取景框，img 按画作比例放大到对应倍数，
       于是 <svg> 的 viewBox 可以直接写取景框（画作像素），覆盖层坐标 === 画作坐标。 */
    const padScale = 100 / CROP.w;                         // 1 画作 px = padScale% 容器宽
    scene.style.aspectRatio = `${CROP.w} / ${CROP.h}`;
    const plate = h('img', { class: 'smini10-plate', src: PLATE, alt: '', draggable: 'false' });
    plate.style.width = `${(PAINT.w * padScale).toFixed(4)}%`;
    plate.style.left = `${(-CROP.x * padScale).toFixed(4)}%`;
    plate.style.top = `${(-CROP.y * padScale * (CROP.w / CROP.h)).toFixed(4)}%`;
    const svg = sv('svg', {
      class: 'smini10-sv', viewBox: `${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`,
      preserveAspectRatio: 'xMidYMid slice', role: 'img',
    });
    svg.append(
      sv('title', { text: '飞夺泸定桥 · 攀链' }),
      sv('desc', {
        text: '泸定桥：铁索上残存着部分桥板，东桥头是敌人的火力网。你要带着 22 个人过完这 102 米。',
      }),
    );

    const MX = 1244;   // 东桥头机枪位（画中东崖上）
    const MY = 470;
    const WX = 120;    // 西桥头（掩护从这边打出去）
    const defs = sv('defs');
    defs.append(
      radGrad('gCover', MX, MY, 420,
        [['0%', '#ffe9a8', 0.62], ['45%', '#f6c46a', 0.2], ['100%', '#e8a24a', 0]]),
      radGrad('gBurn', 1238, 540, 340,
        [['0%', '#ffd98a', 0.92], ['38%', '#f0823c', 0.6], ['72%', '#c8471f', 0.26], ['100%', '#a03010', 0]]),
      radGrad('gFight', MX, MY, 260,
        [['0%', '#ffd9a0', 0.5], ['60%', '#e8642f', 0.14], ['100%', '#e8642f', 0]]),
      linGrad('gBeam', WX, 480, MX, MY,
        [['0%', '#fff2c4', 0.95], ['55%', '#ffd77a', 0.7], ['100%', '#ffcf66', 0.25]]),
    );
    svg.append(defs);

    /* ① 已铺的新板（最底层，压在画上） */
    const plankG = sv('g', { 'data-layer': 'plank' });
    /* ② 段界刻度 + 当前段高亮 */
    const curG = sv('g', { 'data-layer': 'cur' });
    /* ③ 东桥头火力曳光 */
    const fightG = sv('g', { 'data-layer': 'fire' });
    const fightGlow = sv('rect', {
      x: CROP.x, y: CROP.y, width: CROP.w, height: CROP.h, fill: 'url(#gFight)', opacity: 0,
    });
    /* ④ 掩护曳光 */
    const coverG = sv('g', { 'data-layer': 'cover', opacity: 0 });
    const coverGlow = sv('rect', {
      x: CROP.x, y: CROP.y, width: CROP.w, height: CROP.h, fill: 'url(#gCover)', opacity: 0,
    });
    /* ⑤ 火（东桥头；时间走过 BURN_AT 后起来） */
    const burnG = sv('g', { 'data-layer': 'burn' });
    const burnGlow = sv('rect', {
      x: CROP.x, y: CROP.y, width: CROP.w, height: CROP.h, fill: 'url(#gBurn)', opacity: 0,
    });
    /* ⑥ 铺板中的人与板 */
    const layG = sv('g', { 'data-layer': 'lay', opacity: 0 });
    /* ⑦ 你 + 身后的队列 */
    const squadG = sv('g', { 'data-layer': 'squad' });
    svg.append(plankG, curG, fightGlow, coverGlow, burnGlow, fightG, coverG, burnG, layG, squadG);

    // 段界刻度（13 根短齿）—— 只在局内显示，帮玩家读"我在第几段"
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const p = i / SEGMENTS;
      const pt = deckAt(p);
      const d = deckDir(p);
      const L = 22;
      curG.appendChild(sv('line', {
        x1: pt.x - d.y * L, y1: pt.y + d.x * L, x2: pt.x + d.y * L, y2: pt.y - d.x * L,
        stroke: 'rgba(255,246,226,.42)', 'stroke-width': 2, 'stroke-linecap': 'round',
      }));
    }
    const curStrip = sv('path', { d: '', fill: 'rgba(255,228,164,.18)', stroke: 'none' });
    curG.appendChild(curStrip);

    // 火力曳光（预建，逐帧摆位）
    const tracerEls = [];
    for (let i = 0; i < 10; i += 1) {
      const ln = sv('line', {
        x1: MX, y1: MY, x2: MX, y2: MY,
        stroke: 'rgba(236,110,52,.66)', 'stroke-width': 2.2, 'stroke-linecap': 'round',
      });
      tracerEls.push(ln);
      fightG.appendChild(ln);
    }
    const muzzle = sv('circle', { cx: MX, cy: MY, r: 7, fill: '#ffe3a6', opacity: 0 });
    fightG.appendChild(muzzle);

    // 掩护曳光（预建）
    const beamEls = [];
    for (let i = 0; i < 6; i += 1) {
      const ln = sv('line', {
        x1: WX, y1: 480, x2: MX, y2: MY,
        stroke: 'url(#gBeam)', 'stroke-width': 4, 'stroke-linecap': 'round',
      });
      beamEls.push(ln);
      coverG.appendChild(ln);
    }

    // 火舌（预建 9 片，逐帧摆位）
    const flameEls = [];
    for (let i = 0; i < 9; i += 1) {
      const fl = sv('ellipse', { cx: 1238, cy: 540, rx: 10, ry: 20, fill: i % 3 === 0 ? '#ffe6ae' : '#f2903f', opacity: 0 });
      flameEls.push(fl);
      burnG.appendChild(fl);
    }

    // 铺板中：三连的人影 + 一块正在落下的板
    const layMan = [];
    for (let i = 0; i < 3; i += 1) {
      const g1 = sv('g', { opacity: 0 });
      g1.append(
        sv('ellipse', { cx: 0, cy: 0, rx: 9, ry: 5, fill: '#2c3742' }),
        sv('circle', { cx: 8, cy: -4, r: 4.4, fill: '#2c3742' }),
        sv('line', { x1: 3, y1: -3, x2: 14, y2: -9, stroke: '#2c3742', 'stroke-width': 3, 'stroke-linecap': 'round' }),
      );
      layMan.push(g1);
      layG.appendChild(g1);
    }
    const layBoard = sv('path', { d: '', fill: '#c98a45', stroke: '#5a3a1c', 'stroke-width': 2, opacity: 0 });
    const layDust = sv('ellipse', { cx: 0, cy: 0, rx: 60, ry: 16, fill: 'rgba(232,208,168,.4)', opacity: 0 });
    layG.append(layDust, layBoard);

    // 你（姿态不同画法不同）+ 身后的队列点
    const youG = sv('g', { 'data-men': 'you' });
    const youRing = sv('circle', {
      cx: 0, cy: 0, r: 13, fill: 'none', stroke: '#fff3d6', 'stroke-width': 2.6,
    });
    const youBody = sv('g', {});
    const youLabel = sv('text', {
      x: 0, y: -20, 'text-anchor': 'middle', 'font-size': '22', 'font-weight': '700',
      fill: '#fff6e2', style: 'paint-order:stroke;stroke:#22303c;stroke-width:5',
    });
    youLabel.textContent = '你';
    youBody.append(sv('ellipse', { cx: 0, cy: 0, rx: 10, ry: 5, fill: '#22303c' }));
    youG.append(youRing, youBody, youLabel);
    squadG.appendChild(youG);

    const dotG = sv('g', { 'data-layer': 'rank' });
    squadG.appendChild(dotG);

    for (let i = 0; i < 24; i += 1) {
      const l = 6 + rnd() * 14;
      const ln = sv('line', {
        x1: CROP.x + rnd() * CROP.w, y1: CROP.y + rnd() * CROP.h, x2: 0, y2: 0,
        stroke: 'rgba(255,246,226,.34)', 'stroke-width': 1.1, 'stroke-linecap': 'round',
      });
      wind.push({ el: ln, v: 90 + rnd() * 190, l });
      svg.append(ln);
    }

    scene.append(plate, svg);
    container.dataset.mini = opts.id || 'luding-chain';

    /* ── 输入 ── */
    function setStance(want) {
      if (phase !== 'cross' || over || layLeft > 0) return;
      wantStance = want;
    }
    function doLay() {
      if (phase !== 'cross' || over || layLeft > 0 || planks <= 0) return;
      const seg = segOf(m);
      if (planked.has(seg)) return;
      laySeg = seg;
      layLeft = LAY_SEC;
      planks -= 1;
      // ⚠️ 扛板期间本来就走不了（step 里 layLeft>0 那一支不推换挡计时）——把在途的换挡**就地结清**，
      //    否则它会冻在 2.5 秒里、铺完之后接着扣一次 SWAP_HURT（板刚落地就白挨枪，且玩家看不出来）。
      swapLeft = 0;
      stance = wantStance;
      play('click');
      fb = `三连扛着门板爬过来了 —— 这 2.5 秒他们全在火力下，你别动。`;
    }
    function doCover() {
      if (phase !== 'cross' || over || covers <= 0 || coverLeft > 0) return;
      covers -= 1;
      coverLeft = COVER_SEC;
      play('thud');
      fb = `你把最后那点家底打了出去 —— 对面机枪口哑了 5 秒。`;
    }
    function doStart() {
      if (phase !== 'brief') return;
      phase = 'cross';
      last = performance.now();
      play('click');
      fb = '上桥。**先贴住还是先冲，从现在起每一秒都在算账。**';
      render(true);
    }

    const onKey = (ev, down) => {
      if (ev.code === 'Space') {
        if (down && phase === 'brief') { ev.preventDefault(); doStart(); return; }
        if (phase !== 'cross') return;
        ev.preventDefault();
        setStance(down ? 'cling' : 'rush');
      }
    };
    const kd = (e) => onKey(e, true);
    const ku = (e) => onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    // ⚠️ 全局兜底松手：按钮行在任何状态变化时都会被重建（acts.innerHTML = ''），
    //    重建后原来那个按钮上的 pointerup/pointerleave 就跟着没了 → 姿态会卡在"贴链"松不开。
    const onUp = () => setStance('rush');
    window.addEventListener('pointerup', onUp);

    /* ── 每帧推演 ── */
    function step(dt) {
      tUsed += dt;
      if (coverLeft > 0) coverLeft = Math.max(0, coverLeft - dt);
      const underCover = coverLeft > 0;

      if (layLeft > 0) {
        // 铺板：站住不动；三连在火力下（掩护时归零）
        layLeft -= dt;
        hurtNow = underCover ? 0 : fireHer() * LAY_HURT;
        dead += hurtNow * dt;
        if (layLeft <= 0 && laySeg >= 0) {
          planked.add(laySeg);
          laySeg = -1;
          play('click');
          fb = '板铺上了 —— 这一段能直起身跑。';
        }
      } else {
        if (swapLeft > 0) {
          // 换姿势：站住，且这半秒按 SWAP_HURT 算（站着换最容易挨枪）。
          // ⚠️ 换挡期间持续绑定 wantStance：中途改主意就落到"最后要的那个姿势"，
          //    不会再叠第二次站住 —— 否则松手后角色先蹲回去、再罚站 0.75 秒，手感像卡住。
          swapLeft = Math.max(0, swapLeft - dt);
          stance = wantStance;
          hurtNow = underCover ? 0 : fireHer() * SWAP_HURT;
          dead += hurtNow * dt;
        } else if (wantStance !== stance) {
          swapLeft = Math.max(0, SWAP_SEC - dt);
          stance = wantStance;
          hurtNow = underCover ? 0 : fireHer() * SWAP_HURT;
          dead += hurtNow * dt;
        } else {
          const st = stance === 'cling' ? CLING : RUSH;
          const spd = st.spd * (underCover ? COVER_SPD : 1);
          hurtNow = underCover ? 0 : fireHer() * (planked.has(segOf(m)) ? PLANK_HURT : st.hurt);
          dead += hurtNow * dt;
          m += spd * dt;
        }
      }

      if (Math.floor(dead) >= MEN) {
        m = Math.min(m, BRIDGE_M);
        finish('wiped', '铁索还在晃。22 个人全折在这 102 米上 —— 对面那挺机枪最后一个才停。');
        return;
      }
      if (m >= BRIDGE_M) {
        m = BRIDGE_M;
        finish('crossed', '你从火里钻出来，眉毛燎着了半边。东桥头是你们的了。');
        return;
      }
      if (tUsed >= TT) {
        finish('fire', '东桥头的火借着风封住了桥面。退回西岸的人，回头看那 102 米。');
      }
    }

    /* ── 结算 ── */
    function finish(kind, text) {
      if (over) return;
      over = true;
      outcome = kind;
      why = text;
      phase = 'done';
      // ⚠️ 帧循环在 over 时提前 return，终态**必须在这里写**，否则 miniState 永远停在 cross。
      container.dataset.miniState = 'done';
      const deadN = Math.min(MEN, Math.floor(dead));
      const alive = MEN - deadN;
      const score = scoreOf(kind, m, deadN, tUsed, TT);
      const summary = kind === 'crossed'
        ? `22 个勇士过桥：折损 ${deadN} 人，${alive} 人踏上东岸，用时 ${tUsed.toFixed(1)} 秒。`
          + `${planks ? `还剩 ${planks} 块门板没用完。` : '门板一块不剩。'}`
        : kind === 'wiped'
          ? `折完了 22 个人 —— 过到 ${Math.round(m)} 米，铁索上没人了。`
          : `${TT} 秒（局内）到了，火封住桥面 —— 过到 ${Math.round(m)} 米，剩下 ${alive} 个人退回西岸。`;
      play(kind === 'crossed' ? 'win' : 'lose');
      render(true);
      settleOnce({
        score: Number(clamp(score, 0, 1).toFixed(3)),
        detail: {
          outcome: kind, why, dead: deadN, alive,
          meters: Math.round(m), usedSec: Number(tUsed.toFixed(1)),
          planksLeft: planks, coversLeft: covers,
          planked: [...planked].sort((a, b) => a - b).map((i) => i + 1),
          timeTotal: TT,
        },
        summary,
      });
    }

    /* ── 覆盖层绘制 ── */
    /** 沿桥面第 i 段画一条"横铺的带子"（四边形路径） */
    function bandPath(i, half, from = 0, to = 1) {
      const a = deckAt((i + from) / SEGMENTS);
      const b = deckAt((i + to) / SEGMENTS);
      const d = deckDir((i + (from + to) / 2) / SEGMENTS);
      const nx = -d.y * half; const ny = d.x * half;
      return `M${a.x + nx} ${a.y + ny} L${b.x + nx} ${b.y + ny} L${b.x - nx} ${b.y - ny} L${a.x - nx} ${a.y - ny} Z`;
    }
    /** 一段板上的板缝 */
    function seams(i, half) {
      const d = deckDir((i + 0.5) / SEGMENTS);
      const nx = -d.y * half; const ny = d.x * half;
      const n = 7;
      let s = '';
      for (let k = 1; k < n; k += 1) {
        const pt = deckAt((i + k / n) / SEGMENTS);
        s += `M${pt.x - nx} ${pt.y - ny} L${pt.x + nx} ${pt.y + ny} `;
      }
      return s.trim();
    }

    function paint() {
      const pYou = pOf();
      const ptYou = deckAt(pYou);
      const dirYou = deckDir(pYou);
      const seg = segOf(m);
      const fireLv = FIRE[seg] / FIRE[SEGMENTS - 1];
      const burn = outcome === 'fire' ? 1 : clamp((tUsed / TT - BURN_AT) / (1 - BURN_AT), 0, 1);
      const underCover = coverLeft > 0;

      /* 已铺的新板 */
      while (plankG.childNodes.length) plankG.removeChild(plankG.lastChild);
      for (const i of planked) {
        plankG.appendChild(sv('path', {
          d: bandPath(i, 15), fill: '#c9883f', opacity: '.9', 'data-plank': String(i + 1),
        }));
        plankG.appendChild(sv('path', {
          d: bandPath(i, 15), fill: 'none', stroke: '#6b4118', 'stroke-width': 1.6,
        }));
        plankG.appendChild(sv('path', {
          d: seams(i, 15), stroke: 'rgba(84,50,18,.55)', 'stroke-width': 1.4,
        }));
        plankG.appendChild(sv('path', {
          d: bandPath(i, 5, 0, 1), fill: 'rgba(255,236,196,.26)', stroke: 'none',
        }));
      }
      // 正在铺的那一段：板从 0 长到满
      if (layLeft > 0 && laySeg >= 0) {
        const k = clamp(1 - layLeft / LAY_SEC, 0, 1);
        plankG.appendChild(sv('path', {
          d: bandPath(laySeg, 15, 0, k), fill: 'rgba(201,136,63,.55)', stroke: '#6b4118', 'stroke-width': 1.2,
        }));
      }

      /* 当前段高亮 */
      curStrip.setAttribute('d', bandPath(seg, 17));
      curG.setAttribute('opacity', phase === 'cross' ? 1 : 0.35);

      /* 火力曳光：数量与亮度都跟着当前段火力走；掩护期间全灭 */
      const nTracer = Math.max(0, Math.round(fireLv * tracerEls.length));
      const fireO = underCover || over && outcome === 'crossed' ? 0 : 0.35 + 0.65 * fireLv;
      fightG.setAttribute('opacity', fireO.toFixed(3));
      tracerEls.forEach((ln, i) => {
        const on = i < nTracer;
        ln.setAttribute('opacity', on ? '1' : '0');
        if (!on) return;
        const jitter = Math.sin(performance.now() / (40 + i * 13) + i * 2.1) * 0.028;
        const p = clamp(0.52 + i * 0.045 + jitter, 0, 1);
        const pt = deckAt(p);
        ln.setAttribute('x1', MX);
        ln.setAttribute('y1', MY);
        ln.setAttribute('x2', pt.x);
        ln.setAttribute('y2', pt.y - 6);
      });
      muzzle.setAttribute('opacity', underCover ? '0' : (0.35 + 0.65 * fireLv).toFixed(3));
      muzzle.setAttribute('r', String(5 + 7 * fireLv));
      fightGlow.setAttribute('opacity', underCover ? '0' : (0.22 + 0.5 * fireLv).toFixed(3));

      /* 掩护曳光 */
      coverG.setAttribute('opacity', underCover ? (0.45 + 0.55 * Math.min(1, coverLeft / COVER_SEC)) : 0);
      coverGlow.setAttribute('opacity', underCover ? '0.8' : '0');
      if (underCover) {
        beamEls.forEach((ln, i) => {
          const j = Math.sin(performance.now() / 55 + i * 1.7) * 22;
          ln.setAttribute('x1', WX);
          ln.setAttribute('y1', 480 + j);
          ln.setAttribute('x2', MX);
          ln.setAttribute('y2', MY + j * 0.35);
          ln.setAttribute('stroke-width', String(2.4 + (i % 3) * 1.6));
        });
      }

      /* 火 */
      burnG.setAttribute('opacity', (0.25 + 0.75 * burn).toFixed(3));
      burnGlow.setAttribute('opacity', burn.toFixed(3));
      flameEls.forEach((fl, i) => {
        const o = burn <= 0 ? 0 : clamp(burn * (1.15 - i * 0.06), 0, 1);
        fl.setAttribute('opacity', o.toFixed(3));
        if (o <= 0) return;
        const t2 = performance.now() / 1000;
        const dx = Math.sin(t2 * (2.1 + i * 0.23) + i) * 13;
        const hgt = (16 + i * 9) * burn;
        fl.setAttribute('cx', String(1236 - i * 3 + dx));
        fl.setAttribute('cy', String(548 - hgt * 0.5));
        fl.setAttribute('rx', String((7 + i * 0.7) * burn));
        fl.setAttribute('ry', String(hgt * 0.55));
      });

      /* 铺板中的人 */
      layG.setAttribute('opacity', layLeft > 0 ? '1' : '0');
      if (layLeft > 0 && laySeg >= 0) {
        const base = deckAt((laySeg + 0.5) / SEGMENTS);
        const d = deckDir((laySeg + 0.5) / SEGMENTS);
        layMan.forEach((g1, i) => {
          const off = (i - 1) * 34;
          g1.setAttribute('transform', `translate(${base.x + d.x * off} ${base.y + d.y * off - 12})`);
        });
        const k = clamp(1 - layLeft / LAY_SEC, 0, 1);
        layBoard.setAttribute('d', bandPath(laySeg, 15, 0, k));
        layBoard.setAttribute('opacity', '0.9');
        layDust.setAttribute('cx', base.x);
        layDust.setAttribute('cy', base.y - 6);
        layDust.setAttribute('opacity', String(0.25 + 0.3 * Math.sin(performance.now() / 120)));
      } else {
        layBoard.setAttribute('opacity', '0');
        layDust.setAttribute('opacity', '0');
      }

      /* 你 + 身后的队列 */
      const tilt = stance === 'cling' ? 0 : -8;
      youG.setAttribute('transform', `translate(${ptYou.x} ${ptYou.y - 9}) rotate(${tilt})`);
      youRing.setAttribute('stroke', stance === 'cling' ? '#ffe9a8' : '#ffd0a8');
      youRing.setAttribute('stroke-dasharray', swapLeft > 0 ? '5 5' : 'none');
      [...youBody.childNodes].forEach((n, i) => {
        if (i === 0) { n.setAttribute('rx', stance === 'cling' ? '15' : '9'); n.setAttribute('ry', stance === 'cling' ? '4' : '7'); }
      });

      const alive = aliveN();
      while (dotG.childNodes.length > alive) dotG.removeChild(dotG.lastChild);
      while (dotG.childNodes.length < alive) {
        dotG.appendChild(sv('circle', { cx: 0, cy: 0, r: 5.2, fill: '#25303a', stroke: 'rgba(255,246,226,.62)', 'stroke-width': 1.1 }));
      }
      const gap = 0.016;
      [...dotG.childNodes].forEach((c, i) => {
        const p = clamp(pYou - (i + 1) * gap, 0, 1);
        const pt = deckAt(p);
        c.setAttribute('cx', pt.x);
        c.setAttribute('cy', pt.y - 6);
        c.setAttribute('opacity', p <= 0.001 ? '0' : '0.9');
      });

      /* 风（水汽） */
      for (const w of wind) {
        const o = w.el;
        let x = parseFloat(o.getAttribute('x1') || '0') + w.v * lastDt;
        if (x > CROP.x + CROP.w + 12) x = CROP.x - 12;
        const y = parseFloat(o.getAttribute('y1') || '0');
        o.setAttribute('x1', x);
        o.setAttribute('y1', y);
        o.setAttribute('x2', x - w.l);
        o.setAttribute('y2', y + 1.2);
      }
    }

    /* ── 文字/面板 ── */
    const fireWord = (f) => (f < 0.22 ? '稀' : f < 0.4 ? '中' : f < 0.7 ? '密' : f < 1.0 ? '很密' : '火网');
    function actBtn(label, act, cls = '') {
      return h('button', {
        type: 'button', class: `smini10-btn ${cls}`.trim(), 'data-mini-action': act, text: label,
      });
    }
    function render(force) {
      const seg = segOf(m);
      const leadTxt = phase === 'brief'
        ? '泸定桥，102 米，13 根铁索 —— **靠西桥头一块板也没有**。'
          + '你是廖大珠，身后 22 个人。敌人机枪在东桥头，子弹打在铁索上叮当响。'
          + '**没有"躲"这个动作**：你只有三笔账 —— '
          + '**姿态**（按住「贴链」就慢而安全，松开就直起身冲、快但折人；换姿势要站住 0.75 秒）、'
          + '**6 块门板**（铺在你脚下，板上折人只有 1/10，但 102 米里只够铺 6 段）、'
          + '**3 发掩护**（停火 5 秒）。40 分钟的表一直在走。'
        : phase === 'cross'
          ? (layLeft > 0
            ? '**三连在铺板 —— 你别动。** 这三秒他们全在对面枪口底下。'
            : coverLeft > 0
              ? '**对面哑了。** 这 5 秒折不了人 —— 要么往前压，要么趁现在铺板。'
              : (fireWord(fireHer()) === '火网'
                ? '**这一段是火网。** 再贴下去时间就没了，再冲下去人就没了。'
                : '往前。**贴链省人、直起身抢时间**；门板只够铺 6 段，掩护只有 3 发。'))
          : (outcome === 'crossed' ? '东桥头是你们的了。**回头看那 102 米，铁索还在晃。**'
            : outcome === 'wiped' ? '铁索上没人了。'
              : '火封住了桥面。');
      lead.innerHTML = leadTxt
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<span class="dim">$1</span>');

      // ⚠️ `seg` 必须进签名：铺板按钮的文案写着"脚下第 N 段"，只按 planked.has(seg) 判的话，
      //    从一段未铺的段走进下一段未铺的段时签名不变 → 按钮文案会停在上一段的段号上。
      const sigA = `${phase}|${seg}|${planks}|${covers}|${coverLeft > 0}|${layLeft > 0}|${planked.has(seg)}|${over}`;
      if (force || sigA !== actsSig) {
        actsSig = sigA;
        acts.innerHTML = '';
        if (phase === 'brief') {
          const b = actBtn('上桥', 'start', 'is-main');
          b.addEventListener('click', doStart);
          acts.append(b);
        } else if (phase === 'cross') {
          const hold = actBtn('按住 · 贴链匍匐', 'cling', 'is-main');
          hold.title = '按住 = 贴住铁索（0.95 m/s，折人 ×0.25）；松开 = 直起身冲（3.05 m/s，折人 ×1.85）';
          hold.addEventListener('pointerdown', (e) => { e.preventDefault(); setStance('cling'); });
          hold.addEventListener('pointerup', () => setStance('rush'));
          hold.addEventListener('pointerleave', () => setStance('rush'));
          hold.addEventListener('pointercancel', () => setStance('rush'));
          const bl = actBtn(`铺门板（脚下第 ${seg + 1} 段）`, 'lay');
          bl.disabled = planks <= 0 || planked.has(seg) || layLeft > 0;
          bl.title = '把脚下这一段铺成板面：板上折人 ×0.13，可以放心冲。要站住 2.5 秒。';
          bl.addEventListener('click', doLay);
          const bc = actBtn(`打掩护（${covers} 发）`, 'cover');
          bc.disabled = covers <= 0 || coverLeft > 0;
          bc.title = '停火 5 秒，期间折人归零。三发不能叠加。';
          bc.addEventListener('click', doCover);
          acts.append(hold, bl, bc);
        }
      }

      const sigH = `${Math.floor(m)}|${Math.floor(dead)}|${Math.floor(tUsed * 4)}|${stance}|${Math.ceil(swapLeft * 10)}`
        + `|${planks}|${covers}|${Math.ceil(coverLeft * 4)}|${layLeft > 0 ? 1 : 0}|${seg}`;
      if (force || sigH !== statsSig) {
        statsSig = sigH;
        hudP.innerHTML = '<span>位置</span><div class="hg-bar prog"><i style="width:'
          + `${(m / BRIDGE_M) * 100}%"></i></div><b>${m.toFixed(0)}/${BRIDGE_M} 米</b>`;
        hudD.innerHTML = '<span>折损</span><div class="hg-bar dmg"><i style="width:'
          + `${(Math.floor(dead) / MEN) * 100}%"></i></div><b>${Math.floor(dead)}/${MEN} 人</b>`;
        hudT.innerHTML = '<span>时间</span><div class="hg-bar clock"><i style="width:'
          + `${(tUsed / TT) * 100}%"></i></div><b>剩 ${Math.max(0, TT - tUsed).toFixed(0)}s</b>`;
        hudS.innerHTML = `<span>姿态</span><b class="st ${stance}">${
          layLeft > 0 ? '铺板中' : swapLeft > 0 ? '换姿势…' : (stance === 'cling' ? CLING.label : RUSH.label)}</b>`
          + `<em>第 ${seg + 1} 段 · 火力${fireWord(fireHer())}</em>`
          + `<em>门板 ${planks}</em><em>掩护 ${covers}</em>`;
      }
      const host = opts.stats || null;
      const sig2 = `${Math.floor(m)}|${Math.floor(dead)}|${Math.floor(tUsed)}|${planks}|${covers}`;
      if (host && sig2 !== statsSig2) {
        statsSig2 = sig2;
        stats(host, [
          ['位置', `${m.toFixed(0)}/${BRIDGE_M} 米`],
          ['折损', `${Math.floor(dead)}/${MEN} 人`],
          ['剩余', `${Math.max(0, TT - tUsed).toFixed(0)}s`],
          ['门板', `${planks}/${PLANKS}`],
          ['掩护', `${covers}/${COVERS}`],
        ]);
      }
      const fbSig = over ? `e|${outcome}|${why}` : `r|${fb}`;
      if (force || fbSig !== lastFbSig) {
        lastFbSig = fbSig;
        fbEl.innerHTML = over
          ? `<b class="${outcome === 'crossed' ? 'good' : 'bad'}">${
            outcome === 'crossed' ? '过桥了' : outcome === 'wiped' ? '全折了' : '火封桥'}</b> —— ${why}`
          : fb;
      }
    }
    let statsSig2 = '';
    let lastFbSig = '';

    /* ── 对外观测面（dataset）──
       ⚠️ 必须**同步写一次**（见文件末尾），不能只在帧里写：`miniState` 是同步落地的，
       前端/自动化一读到它就认为"玩法起来了"，同一刻去读别的字段会拿到空串 → NaN。 */
    function writeDataset() {
      const seg = segOf(m);
      container.dataset.miniState = phase;
      container.dataset.miniM = m.toFixed(1);
      container.dataset.miniSeg = String(seg + 1);
      container.dataset.miniDead = String(Math.min(MEN, Math.floor(dead)));
      container.dataset.miniAlive = String(aliveN());
      container.dataset.miniTime = Math.max(0, TT - tUsed).toFixed(1);
      container.dataset.miniStance = stance;
      container.dataset.miniSwap = swapLeft.toFixed(2);
      container.dataset.miniPlanks = String(planks);
      container.dataset.miniCovers = String(covers);
      container.dataset.miniCover = coverLeft.toFixed(2);
      container.dataset.miniLay = layLeft.toFixed(2);
      container.dataset.miniFire = FIRE[seg].toFixed(3);
      container.dataset.miniHurt = hurtNow.toFixed(4);
      container.dataset.miniPlanked = [...planked].sort((a, b) => a - b).map((i) => i + 1).join(',');
      const pt = deckAt(pOf());
      container.dataset.miniDeck = `${Math.round(pt.x)},${Math.round(pt.y)}`;
      if (outcome) container.dataset.miniOutcome = outcome;
    }

    /* ── 帧 ── */
    function frame(now) {
      if (over) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      lastDt = dt;
      if (phase === 'cross') {
        step(dt);
        if (over) { paint(); writeDataset(); return; }
      }
      paint();
      render(false);
      writeDataset();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    /* ── 清场 ── */
    const ctl = new AbortController();
    const teardown = () => {
      ctl.abort();
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('pointerup', onUp);
    };
    ctl.signal.addEventListener('abort', teardown);
    const guard = setInterval(() => {
      if (!document.body.contains(container)) { teardown(); clearInterval(guard); settleDetached(); }
    }, 500);

    render(true);
    paint();
    writeDataset();          // ← 同步落地一次，别等第一帧
  });
}

/* ══════════════ 调试台规格 ══════════════ */

export const LUDING_MINIGAMES = [
  {
    id: 'luding-chain',
    title: '飞夺泸定桥 · 攀链',
    family: '排程',
    act: 'act3 · 大渡河（热点 luding）',
    note: 'v2：**画作当场景**（`assets/scenes/luding_bridge.jpg`，原样铺，不再自绘索桥）+ 覆盖层。'
      + '骨架换成**排程取舍**（不是 v1 的"预警→按一下躲"）：姿态是连续量 —— '
      + '**按住「贴链」0.95 m/s、折人 ×0.25；松开直起身冲 3.05 m/s、折人 ×1.85**，换姿势要站住 0.75 秒；'
      + '**6 块门板**把脚下这一段变板面（折人 ×0.13），**3 发掩护**停火 5 秒；'
      + '两条失败线：折完 22 人 / 时限内没过完（东桥头浇了煤油）。',
    states: ['brief', 'cross', 'done'],
    actions: ['start', 'cling', 'lay', 'cover'],
    noAi: true,
    noAiNote: '游戏内 0 次模型调用：分秒计时的连续取舍，没有一秒能让玩家站着等。'
      + '主线 minigame_review 的 luding 分支接线后接管判词。',
    run: (host, o = {}) => runLudingChain(host, o),
  },
];

export const CARDS = LUDING_MINIGAMES;

/* ══════════════ 样式（运行时注入，前缀 smini10-）══════════════ */
{
  const css = `
/* ⚠️ width:100% + 子项 max-width:min(620px,100%) 缺一不可：
   挂载点比 620 窄时（板屏纸面、调试台中栏都窄过它），只写 max-width:620px 的话
   子项会按内容宽度撑到 620 并**居中溢出**，两头被裁 —— 判词读起来像缺了半个字。 */
.smini10-wrap { display:flex; flex-direction:column; gap:9px; align-items:center; width:100%; }
.smini10-lead { margin:0; font-size:13px; line-height:1.8; color:#3f3524; max-width:min(620px,100%); text-align:left; }
.smini10-lead .dim { color:#83745a; font-style:normal; }
.smini10-lead b { color:#8c2f22; }
/* 画作容器：position:relative + overflow:hidden，里面 img 放大后靠负偏移裁切 */
.smini10-scene { position:relative; width:100%; max-width:min(620px,100%); overflow:hidden;
  border-radius:6px; background:#dcd6c8;
  box-shadow:0 0 0 1px rgba(92,80,62,.42), 0 10px 26px rgba(38,30,20,.26); }
.smini10-plate { position:absolute; height:auto; max-width:none; user-select:none; -webkit-user-drag:none; }
.smini10-sv { position:absolute; inset:0; width:100%; height:100%; display:block; }
.smini10-acts { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; max-width:min(620px,100%); }
.smini10-btn { font:600 13px/1 var(--font-ui, system-ui); padding:10px 16px; cursor:pointer;
  color:#2b2317; background:linear-gradient(180deg,#fbf6ea,#ece0c8);
  border:1px solid rgba(104,88,62,.5); border-radius:5px;
  box-shadow:0 1px 0 rgba(255,255,255,.7) inset, 0 2px 5px rgba(50,40,26,.14); }
.smini10-btn:hover:not(:disabled) { background:linear-gradient(180deg,#fffdf6,#f2e8d2); }
.smini10-btn:disabled { opacity:.45; cursor:default; }
.smini10-btn.is-main { color:#1f1a12; background:linear-gradient(180deg,#f6e3b4,#e8cd8c);
  border-color:rgba(150,110,40,.62); font-weight:700; }
.smini10-fb { min-height:20px; font-size:12.5px; line-height:1.7; color:#4b4130; max-width:min(620px,100%); text-align:left; }
.smini10-fb b.good { color:#2f6b3a; }
.smini10-fb b.bad { color:#8c2f22; }
.smini10-hud { width:100%; max-width:min(620px,100%); display:flex; flex-direction:column; gap:6px;
  padding:9px 11px 7px; background:rgba(255,252,244,.75);
  border:1px solid rgba(120,100,70,.3); border-radius:6px; box-sizing:border-box; }
.hg-row { display:flex; align-items:center; gap:9px; font-size:11.5px; color:#5f5442; }
.hg-row > span:first-child { width:52px; flex:none; }
.hg-bar { position:relative; flex:1; height:9px; background:rgba(120,104,78,.22); border-radius:5px; overflow:hidden; }
.hg-bar > i { display:block; height:100%; background:linear-gradient(90deg,#6d7f92,#9fb2c4); transition:width .06s linear; }
.hg-bar.dmg > i { background:linear-gradient(90deg,#8c2f22,#c4553a); }
.hg-bar.clock > i { background:linear-gradient(90deg,#9a7a26,#d8a92c); }
.hg-row > b { min-width:76px; text-align:right; font-variant-numeric:tabular-nums; color:#3a3125; }
.hg-row b.st.cling { color:#8a6a1e; }
.hg-row b.st.rush { color:#8c2f22; }
.hg-row em { font-style:normal; padding:1px 6px; border-radius:3px; background:rgba(120,100,70,.14); color:#5f5442; }
@media (prefers-reduced-motion: reduce) { .hg-bar > i { transition:none; } }
`;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}
