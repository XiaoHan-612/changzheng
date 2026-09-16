/**
 * 《陡坡 · 拽住他》v3（**重做版 · 单独开发，未接入主线**）
 *
 * ── 为什么有 v3（v2 被用户当场否掉："这画面不是搞笑吗"）──
 *   v2 的做法是**用 SVG 基本图元现画一片雪山**：天空渐变 + 两个三角形远山 + 一条白色斜面 +
 *   一个圆角矩形拼的"人"。用户的原话是"这画面不是搞笑吗" —— 他说得对：
 *     · 项目 `public/assets/scenes/` 里躺着 **36 张油画级场景图**，其中 `snow_climb.jpg`
 *       画的**就是这一局**（一名战士在雪坡上探身，另一名滑脱的战士被他抓住手腕）；
 *     · 主线 `doGrab()` 早就把这张图设成了板屏背景（`openBoard({bg: sceneImage('/assets/scenes/snow_climb.jpg')})`）；
 *     · 而 v2 在纸面里又画了一片自制的假雪山，**把背后的真油画整个盖住了**。
 *   → v3 的第一条：**不许再画场景。画作就是场景。**
 *
 * ── v3 怎么用这张画 ──
 *   取画作中间一块（`CROP`），原样铺在纸面上，**一个像素都不改**；所有可交互的东西都是
 *   画在上面的**覆盖层**（绳、目标环、踏脚孔、风雪、雪雾）。坐标直接用**画作像素**，
 *   所以锚点是"画里那只手"，不是"我想象中的位置"：
 *     · `YOU_HAND` = 画里施救者握人的那只手（688, 458）—— 绳从这里出去；
 *     · `CLASP`    = 画里两只手交握处（700, 466）—— **把他拉回到这里就算救上来**，
 *                    也就是"赢"的那一刻画面正好变回原作本身；
 *     · `U`        = 坡向（顺坡向下 = 从施救者指向滑脱者），他顺这个方向滑走。
 *
 * ── 关键设计：他怎么"滑走"而不需要抠图 ──
 *   试过把他从画里抠出来当精灵让他真的往下滑 —— **不可行**：画里他浑身盖着雪，
 *   暗部被亮雪切成碎片，连通域抠出来是"瑞士奶酪"（实测 4.6 万像素里满是空洞，
 *   腿也整条丢了）。硬做只会更难看。
 *   → 改用**雪雾遮蔽 + 绳端标记**：他滑走的距离越远，两人之间的**雪雾越厚**（白毛风），
 *     他的身体本来就被画成半掩在雪里，雾一厚就"看不见了"——**这不是遮掩，这就是天气**；
 *     而"他在哪"由三个东西告诉你：**目标环**（他的手腕）、**绳上的记号码**（每 3 米一道）、
 *     以及 HUD 的「他离你 N 米」。**救上来时雾散开，画里那两只交握的手露出来** —— 画作本身就是奖励。
 *
 * ── 骨架没变（这是用户自己定的方向）──
 *   仍然是「一次性抓取 + 连续拉锯」：`decide → aim → hold → done`。
 *   换掉的只是**画面层**和**几何锚点**，不是玩法。
 *
 * ── 史实锚点（出处见 docs/HANDOFF-GRAB.md）──
 *   夹金山，1935-06-12，红四团穿单衣翻第一座大雪山。杨成武《忆长征》：
 *     · "一名红军不小心滑到一个雪坑里……杨成武等人见状赶紧**把绑腿解下，扭成布绳丢下去**。"
 *     · 过山"六不"：**不准自己开路** —— "自己开路就有坐'汽车'滑下山的危险。"
 *     · 前面的战士**用铁铲、刺刀在雪山上挖着踏脚孔**，便于后面的同志行走。
 *
 * 玩法 id：`snow-grab`（**故意不复用 `grab`** —— 调试台 `specOf` 按 id 查表，撞 id 会取到主线那份旧的）。
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
 * ⚠️ 这里踩过一个坑：v3 初稿把 `[['0%','#fff',.9], ...]` 这种"数组的数组"直接当 kids 传给 `sv()`，
 *    `sv()` 只认元素节点，于是一路 `appendChild([...])` →
 *    `Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'`。
 *    因为是同步抛在构造函数里，表现是"玩法连第一帧都到不了"，dataset 上一个字段都没有。
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

/* ══════════════ 几何：全部用**画作像素**（与 snow_climb.jpg 一一对应）══════════════
 * QA 也 import 这些，别写两份。改这里 = 改画面上锚在哪只手上。
 */

export const PAINT = { w: 1280, h: 872 };            // 原画尺寸（snow_climb.jpg）
/** 场上取景框（画作像素）。840×650 —— 两名战士都在框内，右下留出他滑走的方向。 */
export const CROP = { x: 290, y: 170, w: 840, h: 650 };
export const PLATE = '/assets/scenes/snow_climb.jpg';

/**
 * ⚠️ 这两个锚点是拿放大镜量出来的，别照着"感觉"改（改错一次就是绳长≈0）：
 *   · CLASP    —— 放大到 3 倍看，两只手交握的**拳心**在 (678, 424)。v3 初稿写 (700,466)，
 *                那已经落到滑脱者的小臂上了。
 *   · YOU_HAND —— 绳从**施救者撑在雪里那只手**出去，不是从交握那只手出去。
 *                若把 YOU_HAND 也设在交握处，绳长恒等于 0，整个"扔绳 / 拉锯"就不成立。
 *                (520,390) 在他背包下缘、撑地手臂一带。
 */
export const YOU_HAND = { x: 520, y: 390 };
/** 画里两只手交握处 —— 把他拉回这里 = 救上来（赢的那一刻准星正好压回原作那只手上） */
export const CLASP = { x: 678, y: 424 };
/** 坡向（顺坡向下：从施救者指向滑脱者）。与画面上那道雪痕走向一致（≈45°）。 */
export const U = { x: 0.76, y: 0.65 };
/** 他滑到某个距离时，手在哪 */
export function handAt(slip) {
  return { x: CLASP.x + U.x * slip, y: CLASP.y + U.y * slip };
}
/** 绳长（画作 px）= 你的手到他手的直线。HUD 的「他离你 N 米」和绳上记号码都用它。 */
export function ropeLenAt(slip) {
  const p = handAt(slip);
  return Math.hypot(p.x - YOU_HAND.x, p.y - YOU_HAND.y);
}

/* ══════════════ 数值（QA 直接 import，改这里就是改手感）══════════════ */

/** hisT：0..1，**越大越接近被救上来**
 *  用同一个 0..1 量是为了 HUD/断言口径统一；真正的空间量是 slip（画作 px）。 */
export const WIN_T = 0.85;    // 他的手回到交握处
export const SLOT_T = 0.08;   // 滑出画框（没了）
export const START_T = 0.42;  // 开局他在哪
/** hisT = SLOT_T 时的顺坡距离（画作 px）。550 ≈ 正好把准星送到取景框右下角。 */
export const SLIP_MAX = 550;
/** hisT → 顺坡距离 */
export function slipOf(hisT) {
  return ((WIN_T - hisT) / (WIN_T - SLOT_T)) * SLIP_MAX;
}
/** 显示用：多少画作 px 算一米。
 *  取 55 是让"起手 8 米、救上来 3 米"这句读数像人话（550/55=10 米是极限）。 */
export const PX_PER_M = 55;
export const TICKS_M = 2;

/** 还没抓住时他自由下滑（"坐汽车"）：基础速度 + 随时间加速。
 *  这两个数就是**失败钟**：0.42→0.08 约 7 秒（仿真实测 6.9s）。
 *  最初写 0.036/0.010 只有 5.7 秒 —— 玩家还在读那两行提示就没了，像秒杀。 */
export const SINK_FREE = 0.027;
export const SINK_FREE_ACC = 0.0075;
/** 抓住了、脚在孔里 / 不在孔里 */
export const SINK_HELD_IN = 0.008;
export const SINK_HELD_OUT = 0.036;

/** 解绑腿要多久（这 1.4 秒他继续溜 —— 史实：先解绑腿再出手） */
export const UNTIE_SEC = 1.4;
/** 挪脚（换踏脚孔）要多久：这期间不能拉，且按最浅的锚算 */
export const MOVE_SEC = 0.5;

/** 两次机会：甩空 / 张力爆脱手，共用 */
export const GRABS = 2;

/**
 * 徒手 vs 布绳 —— 一个"快而脆、够得近"和一个"慢而长、够得远"。
 * `reach`/`catchR`/`follow` 都是**画作像素**（取景框 840 宽，所以数值看着比 v2 大）。
 * `reach` 是从 YOU_HAND 量起 —— **够不够得着**就是这个数说了算。
 * ⚠️ 定 reach 的口径：开局他离你约 456px。
 *    · 徒手 500：**当下够得着**，但他只要再溜 50px 就够不着了 —— 这就是"够得近"的代价；
 *    · 布绳 640：解绑腿那 1.4 秒他滑掉 50 多 px，剩下的余量还够。
 *    两个数都是照着"解绑腿值不值"倒推的，不是拍脑袋。
 */
export const BARE = {
  reach: 500, catchR: 46, follow: 340,
  pullK: 1.15, capK: 0.78,
};
export const ROPE = {
  reach: 640, catchR: 68, follow: 280,
  pullK: 1.00, capK: 1.00,
};

/** 三个踏脚孔（画作像素）：沿坡一字排开。
 *  坡上（左上）雪被风刮实 → 锚牢但离他远、绳吃力；坡下（右下）离他近但脚下正是滑塌过的那一片。 */
export const HOLES = [
  { key: 'foot0', at: { x: 575, y: 615 }, label: '下孔', pullK: 1.26, capK: 0.80, note: '离他最近、绳短使得上劲；可这一段刚滑塌过，脚下最虚' },
  { key: 'foot1', at: { x: 450, y: 505 }, label: '中孔', pullK: 1.00, capK: 1.00, note: '不偏不倚' },
  { key: 'foot2', at: { x: 330, y: 400 }, label: '上孔', pullK: 0.76, capK: 1.24, note: '挨着雪脊、踩得最实；离他远，力使不上' },
];
export const START_FOOT = 1;
/**
 * 挪脚途中脚下的锚：取三孔里**最浅**的那个再打折 —— 挪脚是最危险的时刻。
 * ⚠️ 这里曾经写成 `HOLES[0].capK * 0.86`。当时 HOLES[0] 恰好是 **capK 最高**的那个，
 *    → 算出比踩实的中孔还高，**"挪脚反而更稳"**，与"脚下是虚的"完全相反。
 *    后来把三孔的排序倒过来（下孔近距离/弱锚），`HOLES[0]` 又变成最低的那个 —— **同一个写法这次"正好对"**。
 *    这就是它阴险的地方：常量取错方向不会报错，只会让玩法悄悄反过来。
 *    所以一律用 `Math.min(...)` 显式取最浅，并把"挪脚上限必须低于任何踩实的孔"钉成断言（QA D5b）。
 */
export const MOVE_CAPK = Math.min(...HOLES.map((x) => x.capK)) * 0.86;

/** 拉锯数值 */
export const PULL_RATE = 0.090;   // 按住「拉」时 hisT 每秒涨多少（再乘孔的 pullK 与工具 pullK）
                                  // 0.075 时"稳住"这套打法要拉 18.5 秒（仿真实测）—— 对一段叙事来说太长，提到 0.090
export const T_START = 30;        // 抓住瞬间的张力
export const T_PULL = 22;         // 拉的时候额外涨（每秒）
export const T_PASSIVE = 6;       // 被动涨：他的体重一直在拽
export const T_RELAX = 20;        // 松开时每秒回落
export const T_BARE_MAX = 70;     // 徒手的张力上限（手腕受不了）
export const T_ROPE_MAX = 92;     // 布绳的张力上限
export const T_BREAK_RESET = 28;  // 脱手后张力回落到哪
export const BREAK_SLIP = 0.06;   // 脱手他往下滑多少（hisT）
// 开局犹豫没有单独的"秒表"：他本来就在以 SINK_FREE 往下溜，站在 decide 屏上不动，
// 约 7.5 秒他自己就进雪槽了 —— 这就是那口钟，不必再单列一个 DECIDE_CAP。

/** 雪雾：他在雾里。滑得越远雾越厚 —— 这是本版"他滑走了"的主要视觉表达 */
export const VEIL_BASE = 0.40;
export const VEIL_PER_SLIP = 0.46;
export const VEIL_SAVED = 0.08;
export const VEIL_LOST = 0.88;   // 别给 0.97：那等于把油画整个擦掉，"白茫茫一片"也要留个形

/* ══════════════ 玩法本体 ══════════════ */

export function runSnowGrab(container, opts = {}) {
  return new Promise((resolve) => {
    const rnd = opts.rnd || mulberry32(opts.rndSeed || 20260916);

    /* ── 状态（全部先声明，避免 TDZ —— v1 就在这上面踩过）── */
    let phase = 'decide';          // decide → aim → hold → done
    let rope = false;
    let untieLeft = 0;
    let hisT = START_T + rnd() * 0.02 - 0.01;
    let freeT = 0;                 // 自由下滑累计时长（用于加速）
    let caught = false;
    let tension = 0;
    let grabs = GRABS;
    let footIdx = START_FOOT;
    let moveLeft = 0;
    let pulling = false;
    let throwUsed = false;
    let tip = { x: 0, y: 0 };
    let aimTarget = { x: 0, y: 0 };
    let outcome = null;
    let why = '';
    let over = false;
    let raf = 0;
    let last = performance.now();
    let lastDt = 0.016;
    let fb = '';
    let actsSig = '';
    let statsSig = '';
    let hudSig = '';
    let lastFbSig = '';
    const wind = [];

    const kit = () => (rope ? ROPE : BARE);
    const slip = () => slipOf(hisT);
    /** 他在画里的手（目标点） */
    const hisHand = () => handAt(slip());
    /** 绳长 = 你的手到他手的直线长度。**够不够得着**与 HUD 的米数都是它。 */
    const ropeLen = () => ropeLenAt(slip());
    const meters = () => ropeLen() / PX_PER_M;
    const reachGap = ropeLen;

    function capNow() {
      const base = rope ? T_ROPE_MAX : T_BARE_MAX;
      const holeK = moveLeft > 0 ? MOVE_CAPK : HOLES[footIdx].capK;
      return base * holeK * kit().capK;
    }

    /* ── DOM ── */
    const root = h('div', { class: 'smini9-wrap' });
    mount(container, root);
    const lead = h('p', { class: 'smini9-lead' });
    const scene = h('div', { class: 'smini9-scene' });
    const acts = h('div', { class: 'smini9-acts' });
    const fbEl = h('div', { class: 'smini9-fb' });
    const hud = h('div', { class: 'smini9-hud' });
    const hudT = h('div', { class: 'hg-row' });
    const hudD = h('div', { class: 'hg-row' });
    const hudG = h('div', { class: 'hg-row' });
    hud.append(hudT, hudD, hudG);
    root.append(lead, scene, acts, fbEl, hud);

    /* ── 场景：画作（原样）+ 覆盖层 ──
       铺图用"放大 + 负偏移"来裁切：容器 aspect-ratio = 取景框，img 按画作比例放大到对应倍数，
       于是 <svg> 的 viewBox 可以直接写取景框（画作像素），覆盖层坐标 === 画作坐标。 */
    const padScale = 100 / CROP.w;                       // 1 画作 px = padScale% 容器宽
    scene.style.aspectRatio = `${CROP.w} / ${CROP.h}`;
    const plate = h('img', {
      class: 'smini9-plate', src: PLATE, alt: '', draggable: 'false',
    });
    plate.style.width = `${(PAINT.w * padScale).toFixed(4)}%`;
    plate.style.left = `${(-CROP.x * padScale).toFixed(4)}%`;
    plate.style.top = `${(-CROP.y * padScale * (CROP.w / CROP.h)).toFixed(4)}%`;
    const svg = sv('svg', {
      class: 'smini9-sv', viewBox: `${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`,
      preserveAspectRatio: 'xMidYMid slice', role: 'img',
    });
    svg.append(
      sv('title', { text: '陡坡 · 拽住他' }),
      sv('desc', {
        text: '夹金山雪坡：一名战士探身拉住滑脱的同伴。你要把布绳甩到他的手腕上，再一路把他拽回雪沿。',
      }),
    );
    const defs = sv('defs');
    defs.append(
      // 雪雾：以"他滑没影"的位置（取景框右下角）为中心的一团白毛风
      radGrad('gVeil', 1090, 775, 640,
        [['0%', '#ffffff', 0.97], ['38%', '#f6f3ec', 0.86], ['68%', '#efeade', 0.40], ['100%', '#efeade', 0]]),
      // 交握处的一点暖光（救上来时亮起）
      radGrad('gWarm', CLASP.x, CLASP.y, 200,
        [['0%', '#ffdca6', 0.5], ['55%', '#e8b96a', 0.18], ['100%', '#e8b96a', 0]]),
      // 他顺坡拖出的那道雪痕（越滑越长）
      linGrad('gSmear', CLASP.x, CLASP.y, CLASP.x + U.x * SLIP_MAX, CLASP.y + U.y * SLIP_MAX,
        [['0%', '#ffffff', 0.72], ['45%', '#efe6d2', 0.5], ['100%', '#e2d3b4', 0.3]]),
      linGrad('gSnowCut', 0, 0, 0, 1, [['0%', '#ffffff', 0.5], ['100%', '#ffffff', 0.06]]),
    );
    svg.append(defs);

    // 他顺坡拖出来的雪痕（在雾**下面**——雪痕是地形，雾是天气）
    const smearG = sv('g', { style: 'filter:blur(7px)', opacity: 0 });
    const smearCore = sv('path', { d: '', stroke: 'url(#gSmear)', 'stroke-width': 74, fill: 'none', 'stroke-linecap': 'round' });
    const smearWide = sv('path', { d: '', stroke: 'rgba(255,255,255,.5)', 'stroke-width': 130, fill: 'none', 'stroke-linecap': 'round' });
    smearG.append(smearWide, smearCore);
    svg.append(smearG);

    // 雪雾层（整块，透明度随他滑走而变）
    const veil = sv('rect', {
      x: CROP.x, y: CROP.y, width: CROP.w, height: CROP.h, fill: 'url(#gVeil)',
    });
    svg.append(veil);
    // 暖光层
    const warm = sv('rect', {
      x: CROP.x, y: CROP.y, width: CROP.w, height: CROP.h, fill: 'url(#gWarm)', opacity: 0,
    });
    svg.append(warm);

    // 三个踏脚孔（前人用刺刀挖的）
    // 分两层：**雪面层**带一点模糊 —— 挖在雪里的坑不该有矢量图那样的硬边（初稿那圈白描边
    // 让三个孔看着像贴在雪上的贴片）；**指示层**（高亮环 / 标签）必须锐利，它是给玩家读的。
    const holeSkin = sv('g', { style: 'filter:blur(1.7px)' });
    const holeUI = sv('g', {});
    const holeMarks = HOLES.map((hole, i) => {
      const { x, y } = hole.at;
      const lip = sv('ellipse', { cx: x, cy: y - 3, rx: 27, ry: 12, fill: 'rgba(255,255,255,.24)' });
      const pit = sv('ellipse', { cx: x, cy: y, rx: 25, ry: 11, fill: 'rgba(52,68,86,.44)' });
      const inner = sv('ellipse', { cx: x, cy: y + 2, rx: 15, ry: 6, fill: 'rgba(30,44,58,.52)' });
      const halo = sv('ellipse', {
        cx: x, cy: y, rx: 42, ry: 21, fill: 'none', stroke: '#d8a92c', 'stroke-width': 3, opacity: 0,
      });
      const label = sv('text', {
        x, y: y + 33, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.9)',
        'font-size': '21', 'font-weight': '700', opacity: 0, style: 'paint-order:stroke;stroke:#2b3440;stroke-width:4.5',
      });
      label.textContent = hole.label;
      holeSkin.append(lip, pit, inner);
      holeUI.append(halo, label);
      return { pit, inner, lip, halo, label, i };
    });
    svg.append(holeSkin, holeUI);

    // 绳（从你的手出去）
    const ropePath = sv('path', {
      d: '', stroke: '#e6d6b0', 'stroke-width': 5.5, fill: 'none', 'stroke-linecap': 'round',
    });
    const ropeDark = sv('path', {
      d: '', stroke: 'rgba(74,60,38,.5)', 'stroke-width': 9, fill: 'none', 'stroke-linecap': 'round',
    });
    const tickG = sv('g', {});
    svg.append(ropeDark, ropePath, tickG);

    // 目标环（他的手腕）+ 搅动的雪
    const aimG = sv('g', { opacity: 0 });
    const sprayG = sv('g', {});
    const aimRing = sv('circle', {
      cx: 0, cy: 0, r: 52, fill: 'none', stroke: '#f3e6c4', 'stroke-width': 2.4, 'stroke-dasharray': '9 8',
    });
    const aimDot = sv('circle', { cx: 0, cy: 0, r: 5, fill: '#f3e6c4' });
    const aimCross = sv('g', { stroke: '#f3e6c4', 'stroke-width': 2, 'stroke-linecap': 'round' });
    aimCross.append(
      sv('line', { x1: -72, y1: 0, x2: -46, y2: 0 }), sv('line', { x1: 46, y1: 0, x2: 72, y2: 0 }),
      sv('line', { x1: 0, y1: -72, x2: 0, y2: -46 }), sv('line', { x1: 0, y1: 46, x2: 0, y2: 72 }),
    );
    aimG.append(sprayG, aimRing, aimCross, aimDot);
    svg.append(aimG);

    // 你的手（画里那只撑在雪里的手）—— 只做一个小标记，别盖住原作
    const handMark = sv('circle', {
      cx: YOU_HAND.x, cy: YOU_HAND.y, r: 8, fill: 'none',
      stroke: 'rgba(255,255,255,.72)', 'stroke-width': 1.8, 'stroke-dasharray': '4 3', opacity: 0,
    });
    svg.append(handMark);

    for (let i = 0; i < 26; i += 1) {
      const l = 5 + rnd() * 11;
      const ln = sv('line', {
        x1: CROP.x + rnd() * CROP.w, y1: CROP.y + rnd() * CROP.h, x2: 0, y2: 0,
        stroke: 'rgba(255,255,255,.5)', 'stroke-width': 1.1, 'stroke-linecap': 'round',
      });
      wind.push({ el: ln, v: 130 + rnd() * 240, l });
      svg.append(ln);
    }

    scene.append(plate, svg);

    /* ── 覆盖层之外的 CSS 由挂载方给（见文件末尾） ── */

    tip = { x: YOU_HAND.x, y: YOU_HAND.y };
    aimTarget = { x: tip.x, y: tip.y };

    container.dataset.mini = opts.id || 'snow-grab';

    /* ── 输入 ── */
    function onMove(ev) {
      if (phase !== 'aim' || throwUsed) return;
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      // 屏幕坐标 → 画作坐标（viewBox 与取景框一致，preserveAspectRatio 用 slice）
      const sx = (ev.clientX - r.left) / r.width;
      const sy = (ev.clientY - r.top) / r.height;
      aimTarget.x = CROP.x + sx * CROP.w;
      aimTarget.y = CROP.y + sy * CROP.h;
      tip.x = aimTarget.x;
      tip.y = aimTarget.y;
    }
    const onKey = (ev, down) => {
      if (ev.code === 'Space') {
        if (phase === 'hold') { ev.preventDefault(); pulling = down; }
        else if (down && phase === 'aim') { ev.preventDefault(); doThrow(); }
      }
    };
    const kd = (e) => onKey(e, true);
    const ku = (e) => onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    svg.addEventListener('pointermove', onMove);

    /* ── 渲染：动作行 ── */
    function actBtn(label, act, cls = '') {
      return h('button', {
        type: 'button', class: `smini9-btn ${cls}`.trim(), 'data-mini-action': act, text: label,
      });
    }
    function doPick(which) {
      if (phase !== 'decide') return;
      rope = which === 'leg';
      if (rope) untieLeft = UNTIE_SEC;
      play('click');
      fb = rope ? '你在解绑腿 —— 手在抖，结越急越紧。' : '不结了。手够到哪儿算哪儿。';
      go('aim');
    }
    function doThrow() {
      if (phase !== 'aim' || throwUsed) return;
      if (untieLeft > 0) return;
      throwUsed = true;
      const hand = hisHand();
      const gap = Math.hypot(tip.x - hand.x, tip.y - hand.y);
      const inReach = reachGap() <= kit().reach;
      if (inReach && gap <= kit().catchR) {
        caught = true;
        tension = T_START;
        play('click');
        fb = '绳头搭上了他的手腕 —— 别松劲，也别绷断。';
        go('hold');
      } else {
        grabs -= 1;
        play('miss');
        if (grabs <= 0) {
          finish('lost', '第二次也甩空了。绳从雪面上滑过去，坡下白茫茫一片，什么也看不见了。');
          return;
        }
        fb = inReach
          ? `甩偏了 —— 差 ${Math.round(Math.max(0, gap - kit().catchR))} 步。 <b>还剩 ${grabs} 次机会。</b>`
          : '他已经在绳够不着的地方了 —— 这一下甩出去只碰到雪。 <b>还剩 1 次机会。</b>';
        go('aim');
      }
    }
    function doFoot(i) {
      if (phase !== 'hold' || i === footIdx) return;
      moveLeft = MOVE_SEC;
      footIdx = i;
      play('click');
      fb = `挪到${HOLES[i].label}。这半秒脚下是虚的 —— 别使劲。`;
    }
    function go(next) {
      phase = next;
      if (next === 'aim') { throwUsed = false; tip = { x: YOU_HAND.x, y: YOU_HAND.y }; aimTarget = { ...tip }; }
      if (next === 'hold') pulling = false;
      render(true);
    }

    /* ── 结算 ── */
    function finish(kind, text) {
      if (over) return;
      over = true;
      outcome = kind;
      why = text;
      pulling = false;
      phase = 'done';
      // ⚠️ 帧循环在 over 时会提前 return，所以终态**必须在这里写**，
      //    否则 dataset.miniState 会永远停在 'hold'/'aim'，前端与自动化都读不到"已结束"。
      container.dataset.miniState = 'done';
      const cap = capNow() || 1;
      const margin = Math.max(0, Math.min(1, 1 - tension / cap));
      const slack = Math.max(0, Math.min(1, (hisT - START_T) / Math.max(0.001, WIN_T - START_T)));
      let score;
      if (kind === 'saved') score = 0.58 + 0.20 * margin + 0.14 * slack + 0.08 * (grabs / GRABS);
      else score = Math.max(0.02, 0.20 * margin + 0.10 * slack);
      const mNow = Math.max(0, meters());
      const summary = kind === 'saved'
        ? `你用${rope ? '绑腿拧的布绳' : '一双手'}把他从${mNow.toFixed(1)}米外拽了回来，`
          + `张力最后停在 ${Math.round(tension)}/${Math.round(cap)}${grabs < GRABS ? `，中途脱手 ${GRABS - grabs} 次` : '，一次没松'}。`
        : `他在${mNow.toFixed(1)}米外滑进了雪雾，再没露头。`;
      play(kind === 'saved' ? 'win' : 'lose');
      render(true);
      // 帧循环在同一帧内还会跑一次 paint()，把雾慢慢散开 / 合上
      resolve({
        score,
        detail: {
          outcome: kind, why, rope, grabs,
          tension: Number(tension.toFixed(1)), tensionCap: Math.round(cap),
          slipPx: Math.round(slip()), meters: Number(mNow.toFixed(1)),
          ropeLenPx: Math.round(ropeLen()),
          foot: HOLES[footIdx].label,
        },
        summary,
      });
    }

    /* ── 每帧更新 ── */
    function step(dt) {
      if (phase === 'decide' || phase === 'aim') {
        freeT += dt;
        hisT -= (SINK_FREE + SINK_FREE_ACC * freeT) * dt;
      } else if (phase === 'hold') {
        if (moveLeft > 0) moveLeft = Math.max(0, moveLeft - dt);
        const hole = HOLES[footIdx];
        const footIn = moveLeft <= 0;
        if (pulling && footIn) {
          hisT += PULL_RATE * hole.pullK * kit().pullK * dt;
          tension += (T_PULL + T_PASSIVE) * dt;
        } else {
          hisT -= (footIn ? SINK_HELD_IN : SINK_HELD_OUT) * dt;
          if (pulling && !footIn) tension += (T_PULL * 0.6 + T_PASSIVE) * dt;
          else tension -= T_RELAX * dt;
        }
        tension = Math.max(0, tension);
        const cap = capNow();
        if (tension >= cap) {
          grabs -= 1;
          caught = false;
          tension = T_BREAK_RESET;
          hisT -= BREAK_SLIP;
          pulling = false;
          play('click');
          if (hisT <= SLOT_T || grabs <= 0) {
            finish('lost', '布绳绷到极限，那一下还是脱了手 —— 他没停住，坡下什么也看不见了。');
            return;
          }
          fb = `绷断了（手腕/绳到了极限）。他往下滑了一截 —— <b>还剩 ${grabs} 次机会。</b>`;
          go('aim');
          return;
        }
        if (hisT >= WIN_T) { finish('saved', '他整个人的重心搭到了雪沿上，趴着喘。你们俩都没说话。'); return; }
      }
      if (untieLeft > 0) untieLeft = Math.max(0, untieLeft - dt);
      if (hisT <= SLOT_T) {
        finish('lost', '他从雪槽边上滑了下去。史书上只留下半句：滑下山的，就再也找不到他们了。');
        return;
      }
      // 绳头追随（速度有限 —— 这就是"提前量"的来源）
      if (phase === 'aim') {
        const follow = kit().follow * dt;
        const dx = aimTarget.x - tip.x;
        const dy = aimTarget.y - tip.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.001) {
          const k = Math.min(1, follow / dist);
          tip.x += dx * k;
          tip.y += dy * k;
        }
      }
      // 绳头不能超出臂长/绳长
      const maxR = kit().reach;
      const hx = tip.x - YOU_HAND.x;
      const hy = tip.y - YOU_HAND.y;
      const hd = Math.hypot(hx, hy);
      if (hd > maxR) {
        tip.x = YOU_HAND.x + (hx / hd) * maxR;
        tip.y = YOU_HAND.y + (hy / hd) * maxR;
      }
      tip.x = Math.max(CROP.x + 6, Math.min(CROP.x + CROP.w - 6, tip.x));
      tip.y = Math.max(CROP.y + 6, Math.min(CROP.y + CROP.h - 6, tip.y));
    }

    /* ── 画 ── */
    function ropeD(from, to, sag) {
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2 + sag;
      return `M${from.x} ${from.y} Q${mx} ${my} ${to.x} ${to.y}`;
    }
    function paint() {
      const slipNow = slip();
      const hand = hisHand();
      const end = caught ? hand : tip;
      const t = caught ? Math.max(0, Math.min(100, tension)) : 0;
      const cap = caught ? capNow() : 1;
      const taut = caught ? Math.min(1, t / Math.max(1, cap)) : 0;
      const sag = caught ? 34 * (1 - taut) : 16;
      const d = ropeD(YOU_HAND, end, sag);
      ropePath.setAttribute('d', d);
      ropeDark.setAttribute('d', d);
      const hot = caught && taut > 0.8;
      ropePath.setAttribute('stroke', hot ? '#f6e6b8' : '#e6d6b0');
      ropePath.setAttribute('stroke-width', hot ? 7 : 5.5);

      // 绳上的记号码（每 3 米一道）—— 他滑走得越远，两人之间出现的记号越多
      const len = Math.hypot(end.x - YOU_HAND.x, end.y - YOU_HAND.y);
      const stepPx = TICKS_M * PX_PER_M;
      const want = Math.min(16, Math.floor(len / stepPx));
      while (tickG.childNodes.length > want) tickG.removeChild(tickG.lastChild);
      for (let i = tickG.childNodes.length; i < want; i += 1) {
        tickG.appendChild(sv('line', {
          x1: 0, y1: 0, x2: 0, y2: 0, stroke: '#8d7a52', 'stroke-width': 5.5, 'stroke-linecap': 'round',
        }));
      }
      [...tickG.childNodes].forEach((el, i) => {
        const p = (i + 1) / (want + 1);
        const x = YOU_HAND.x + (end.x - YOU_HAND.x) * p;
        const y = YOU_HAND.y + (end.y - YOU_HAND.y) * p + sag * 2 * p * (1 - p) * 2;
        const nx = -(end.y - YOU_HAND.y);
        const ny = end.x - YOU_HAND.x;
        const nl = Math.hypot(nx, ny) || 1;
        const w = 5.5 * 1.1;
        el.setAttribute('x1', x - (nx / nl) * w);
        el.setAttribute('y1', y - (ny / nl) * w);
        el.setAttribute('x2', x + (nx / nl) * w);
        el.setAttribute('y2', y + (ny / nl) * w);
        el.setAttribute('stroke', i % 2 ? '#7d6a44' : '#9c8a5f');
      });

      // ⚠️ slipN 必须在这里先算：下面雪痕与雪雾都要用。曾经把它写在雪雾那段，
      //    雪痕那段先引用 → 同一作用域里 const 的 TDZ 直接抛错，整支玩法连第一帧都跑不到。
      const slipN = Math.max(0, Math.min(1, slipNow / SLIP_MAX));

      // 他顺坡拖出的雪痕：从交握处一路拖到"他现在在哪"。
      // 这是"他滑走了"在**画面上**的唯一证据（画里的他不能动），所以必须显眼。
      {
        const to = handAt(Math.max(0, slipNow));
        smearCore.setAttribute('d', ropeD(CLASP, to, 24));
        smearWide.setAttribute('d', ropeD(CLASP, to, 32));
        const smearO = outcome === 'saved' ? 0 : Math.min(0.92, 0.16 + 0.78 * slipN);
        smearG.setAttribute('opacity', smearO.toFixed(3));
      }

      // 雪雾：他滑得越远，雾越厚；救上来雾散
      let veilO = VEIL_BASE + VEIL_PER_SLIP * slipN;
      if (outcome === 'saved') veilO = VEIL_SAVED;
      else if (outcome === 'lost') veilO = VEIL_LOST;
      veil.setAttribute('opacity', veilO.toFixed(3));
      warm.setAttribute('opacity', outcome === 'saved' ? 1 : (caught ? 0.18 * taut : 0));
      handMark.setAttribute('opacity', phase === 'decide' ? 0.35 : (phase === 'done' ? 0.25 : 0.85));

      // 目标环（他手腕在哪）。
      // decide 屏也画（半透明）—— 否则开局"他在哪"只有 HUD 上一行米数，玩家没法判断该不该解绑腿。
      const showAim = phase === 'aim' && !throwUsed;
      const aimO = caught ? 1 : (showAim ? 1 : (phase === 'decide' ? 0.5 : 0));
      aimG.setAttribute('opacity', aimO);
      const kr = kit().catchR;
      const near = Math.hypot(tip.x - hand.x, tip.y - hand.y) <= kr;
      aimRing.setAttribute('r', kr);
      aimRing.setAttribute('cx', hand.x);
      aimRing.setAttribute('cy', hand.y);
      aimRing.setAttribute('stroke', near ? '#e0b52f' : '#f3e6c4');
      aimRing.setAttribute('opacity', caught ? 0.35 : 1);
      aimDot.setAttribute('cx', hand.x);
      aimDot.setAttribute('cy', hand.y);
      aimDot.setAttribute('fill', near ? '#e0b52f' : '#f3e6c4');
      aimDot.setAttribute('opacity', caught ? 0.4 : 1);
      aimCross.setAttribute('transform', `translate(${hand.x} ${hand.y})`);
      aimCross.setAttribute('opacity', caught ? 0.4 : 1);
      aimCross.setAttribute('stroke', near ? '#e0b52f' : '#f3e6c4');

      // 他身边被搅动的雪
      sprayG.setAttribute('opacity', outcome === 'lost' ? 0.15 : 0.5 + 0.5 * slipN);
      sprayG.setAttribute('transform', `rotate(${(performance.now() / 90) % 360} ${hand.x} ${hand.y})`);
      while (sprayG.childNodes.length < 7) {
        sprayG.appendChild(sv('line', {
          x1: 0, y1: 0, x2: 0, y2: 0, stroke: 'rgba(255,255,255,.85)', 'stroke-width': 3.4, 'stroke-linecap': 'round',
        }));
      }
      [...sprayG.childNodes].forEach((el, i) => {
        const a = (i / 7) * Math.PI * 2;
        const r0 = kr + 8;
        const r1 = r0 + 22 + 8 * Math.sin(i * 2.1);
        el.setAttribute('x1', hand.x + Math.cos(a) * r0);
        el.setAttribute('y1', hand.y + Math.sin(a) * r0 * 0.8);
        el.setAttribute('x2', hand.x + Math.cos(a) * r1);
        el.setAttribute('y2', hand.y + Math.sin(a) * r1 * 0.8);
      });

      // 踏脚孔高亮
      holeMarks.forEach((m) => {
        const on = phase === 'hold' && m.i === footIdx && moveLeft <= 0;
        const moving0 = phase === 'hold' && m.i === footIdx && moveLeft > 0;
        m.halo.setAttribute('opacity', on ? 0.95 : (moving0 ? 0.4 : 0));
        m.label.setAttribute('opacity', on || moving0 ? 1 : 0);
        m.inner.setAttribute('fill', moving0 ? 'rgba(104,76,40,.6)' : 'rgba(30,44,58,.52)');
        m.lip.setAttribute('fill', moving0 ? 'rgba(255,236,190,.3)' : 'rgba(255,255,255,.24)');
      });

      // 风雪
      for (const w of wind) {
        const o = w.el;
        let x = parseFloat(o.getAttribute('x1') || '0') + w.v * lastDt;
        if (x > CROP.x + CROP.w + 12) x = CROP.x - 12;
        const y = parseFloat(o.getAttribute('y1') || '0');
        o.setAttribute('x1', x);
        o.setAttribute('y1', y);
        o.setAttribute('x2', x - w.l);
        o.setAttribute('y2', y + 1.6);
      }
    }

    /* ── 文字/面板 ── */
    function render(force) {
      const leadTxt = phase === 'decide'
        ? '他的手正在滑。**先花 1.4 秒解下绑腿拧成布绳 —— 布绳够得更远、判得更宽，但他也滑得更远**；'
          + '或者徒手立刻去够。过山有一条规矩：*不准自己开路*。'
        : phase === 'aim'
          ? (rope
            ? '布绳拧好了。把他<strong>套住</strong> —— 手在雪雾里往下溜，绳头有自己的重量，要留提前量。**只有一次机会**。'
            : '徒手去够。够得近，但没有第二次。')
          : (phase === 'hold'
            ? '**按住「拉」**把他拽上来 —— 张力一碰红线就脱手；**松手**他会往下沉，趁这个空档换脚下的孔。'
            : (outcome === 'saved'
              ? '他趴住了。**雾散开 —— 你看见自己抓着的那只手。**'
              : '雾更厚了。'));
      lead.innerHTML = leadTxt
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<span class="dim">$1</span>');
      lead.hidden = false;

      const actsSigNext = `${phase}|${rope}|${untieLeft > 0}|${footIdx}|${moveLeft > 0}|${grabs}|${over}`;
      if (force || actsSigNext !== actsSig) {
        actsSig = actsSigNext;
        acts.innerHTML = '';
        if (phase === 'decide') {
          // 「解绑腿」点了就进 aim，1.4 秒的代价体现在**甩绳键被锁住**上，不是锁这个键
          const b1 = actBtn('解绑腿 · 拧成布绳', 'leg', 'is-main');
          const b2 = actBtn('徒手扑上去', 'bare');
          b1.addEventListener('click', () => doPick('leg'));
          b2.addEventListener('click', () => doPick('bare'));
          acts.append(b1, b2);
        } else if (phase === 'aim') {
          const b = actBtn(untieLeft > 0 ? '甩出去（布绳还没拧完）' : '甩出去', 'throw', 'is-main');
          b.disabled = untieLeft > 0;
          b.addEventListener('click', doThrow);
          acts.append(b);
        } else if (phase === 'hold') {
          const bp = actBtn(pulling ? '拉住了' : '按住 · 拉', 'pull', 'is-main');
          bp.addEventListener('pointerdown', (e) => { e.preventDefault(); if (moveLeft <= 0) pulling = true; });
          bp.addEventListener('pointerup', () => { pulling = false; });
          bp.addEventListener('pointerleave', () => { pulling = false; });
          acts.append(bp);
          HOLES.forEach((hole, i) => {
            const b = actBtn(hole.label, hole.key);
            b.disabled = i === footIdx || moveLeft > 0;
            b.title = hole.note;
            b.addEventListener('click', () => doFoot(i));
            acts.append(b);
          });
        }
      }

      // HUD：只在数值变了才动（每帧改 DOM 会把点击目标换掉）
      const cap = capNow();
      const hp = Math.max(0, Math.min(1, slip() / SLIP_MAX));
      const hs = `${Math.round(tension / 2)}|${Math.round(cap)}|${Math.round(hp * 50)}|${grabs}|${moveLeft > 0 ? 1 : 0}`;
      if (force || hs !== hudSig) {
        hudSig = hs;
        hudT.innerHTML = '<span>张力</span><div class="hg-bar"><i style="width:'
          + `${Math.max(0, Math.min(100, tension))}%"></i>`
          + `<s style="left:${Math.max(0, Math.min(100, cap))}%"></s></div><b>${Math.round(tension)}/${Math.round(cap)}</b>`;
        hudD.innerHTML = '<span>他离你</span><div class="hg-bar prog"><i style="width:'
          + `${(1 - hp) * 100}%"></i></div><b>${meters().toFixed(1)} 米</b>`;
        hudG.innerHTML = `<span>机会</span><b class="dots">${'●'.repeat(Math.max(0, grabs))}`
          + `${'○'.repeat(Math.max(0, GRABS - grabs))}</b>`
          + `${moveLeft > 0 ? '<em>挪脚中</em>' : ''}`
          + `<em class="foot">脚下 ${HOLES[footIdx].label}</em>`;
      }
      const host = opts.stats || null;
      const sig2 = `${phase}|${Math.round(hisT * 200)}|${grabs}|${Math.round(tension / 2)}|${moveLeft > 0 ? 1 : 0}`;
      if (host && sig2 !== statsSig) {
        statsSig = sig2;
        stats(host, [
          ['他离你', `${meters().toFixed(1)} 米`],
          ['张力', phase === 'hold' ? `${Math.round(tension)}/${Math.round(cap)}` : '—'],
          ['机会', `${grabs}/${GRABS}`],
          ['脚下', moveLeft > 0 ? '挪脚中' : HOLES[footIdx].label],
        ]);
      }
      const fbSig = over ? `e|${outcome}|${why}` : `r|${fb}`;
      if (force || fbSig !== lastFbSig) {
        lastFbSig = fbSig;
        fbEl.innerHTML = over
          ? `<b class="${outcome === 'saved' ? 'good' : 'bad'}">${outcome === 'saved' ? '救上来了' : '没了'}</b> —— ${why}`
          : fb;
      }
    }

    /* ── 对外观测面（dataset）──
       ⚠️ 必须**同步写一次**（见 runSnowGrab 末尾），不能只在帧里写：
       状态词 `miniState` 是同步落地的，前端/自动化一读到它就认为"玩法起来了"，
       同一刻去读 `miniMeters` 会拿到空串 → NaN。仿真第一版就报"他离你 NaN 米"。
       一并把 read/write 收在一处，免得以后加了字段只在帧里写又踩一次。 */
    function writeDataset() {
      const handNow = hisHand();
      container.dataset.miniState = phase;
      container.dataset.miniAim = `${Math.round(tip.x)},${Math.round(tip.y)}`;
      container.dataset.miniHand = `${Math.round(handNow.x)},${Math.round(handNow.y)}`;
      container.dataset.miniHisT = hisT.toFixed(3);
      container.dataset.miniTension = tension.toFixed(1);
      container.dataset.miniCap = capNow().toFixed(1);
      container.dataset.miniGrabs = String(grabs);
      container.dataset.miniFoot = String(footIdx);
      container.dataset.miniMove = moveLeft.toFixed(2);
      container.dataset.miniSlip = slip().toFixed(1);
      container.dataset.miniVeil = (veil.getAttribute('opacity') || '0');
      container.dataset.miniRope = rope ? '1' : '0';
      container.dataset.miniCatchR = String(kit().catchR);
      container.dataset.miniReach = String(kit().reach);
      container.dataset.miniRopeLen = ropeLen().toFixed(1);
      container.dataset.miniMeters = meters().toFixed(1);
    }

    /* ── 帧 ── */
    function frame(now) {
      if (over && outcome !== 'saved') return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      lastDt = dt;
      if (!over) {
        step(dt);
        if (over) { paint(); writeDataset(); return; }
      }
      paint();
      render(false);
      writeDataset();
      if (over) return;              // 结算后停在这里（saved 时多留几帧让雾散开）
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
      svg.removeEventListener('pointermove', onMove);
    };
    ctl.signal.addEventListener('abort', teardown);
    const guard = setInterval(() => {
      if (!document.body.contains(container)) { teardown(); clearInterval(guard); }
    }, 500);

    render(true);
    paint();
    writeDataset();        // ← 同步落地一次，别等第一帧（否则前端读到的米数是 NaN）
  });
}

/* ══════════════ 调试台规格 ══════════════ */

export const GRAB_MINIGAMES = [
  {
    id: 'snow-grab',
    title: '陡坡 · 拽住他',
    family: '抢救',
    act: 'act4 · 雪山（热点 grab）',
    note: 'v3：**画作当场景**（`assets/scenes/snow_climb.jpg`，原样铺，不再自绘雪山）+ 覆盖层。'
      + '玩法骨架沿用 v2（一次性抓取 + 连续拉锯）：他顺坡滑走且加速 → 只有一次甩绳机会'
      + '（绳头有重量，要留提前量）→ 抓住后是张力平衡：拉则涨、松则沉，到头就脱手；'
      + '三个踏脚孔决定使多大劲、能扛多大张力，挪脚 0.5 秒且脚下是虚的。'
      + '他滑得越远，两人之间的雪雾越厚 —— 救上来时雾散，画里那两只交握的手露出来。',
    states: ['decide', 'aim', 'hold', 'done'],
    actions: ['leg', 'bare', 'throw', 'pull', 'foot0', 'foot1', 'foot2'],
    noAi: true,
    noAiNote: '游戏内 0 次模型调用：分秒计时的纯交互玩法，没有一秒能让玩家站着等。'
      + '主线 minigame_review 的 grab 分支接线后接管判词。',
    run: (host, o = {}) => runSnowGrab(host, o),
  },
];

export const CARDS = GRAB_MINIGAMES;

/* ══════════════ 样式（运行时注入，前缀 smini9-）══════════════ */
{
  const css = `
/* ⚠️ width:100% + 子项 max-width:min(620px,100%) 缺一不可：
   挂载点比 620 窄时（板屏纸面、调试台中栏都窄过它），只写 max-width:620px 的话
   子项会按内容宽度撑到 620 并**居中溢出**，两头被裁 —— 判词读起来像"了 —— 他……"缺了半个字。 */
.smini9-wrap { display:flex; flex-direction:column; gap:9px; align-items:center; width:100%; }
.smini9-lead { margin:0; font-size:13px; line-height:1.8; color:#3f3524; max-width:min(620px,100%); text-align:left; }
.smini9-lead .dim { color:#83745a; font-style:normal; }
.smini9-lead b { color:#8c2f22; }
/* 画作容器：position:relative + overflow:hidden，里面 img 放大后靠负偏移裁切 */
.smini9-scene { position:relative; width:100%; max-width:min(620px,100%); overflow:hidden;
  border-radius:6px; background:#dcd6c8;
  box-shadow:0 0 0 1px rgba(92,80,62,.42), 0 10px 26px rgba(38,30,20,.26); }
.smini9-plate { position:absolute; height:auto; max-width:none; user-select:none; -webkit-user-drag:none; }
.smini9-sv { position:absolute; inset:0; width:100%; height:100%; display:block; }
.smini9-acts { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; max-width:min(620px,100%); }
.smini9-btn { font:600 13px/1 var(--font-ui, system-ui); padding:10px 16px; cursor:pointer;
  color:#2b2317; background:linear-gradient(180deg,#fbf6ea,#ece0c8);
  border:1px solid rgba(104,88,62,.5); border-radius:5px;
  box-shadow:0 1px 0 rgba(255,255,255,.7) inset, 0 2px 5px rgba(50,40,26,.14); }
.smini9-btn:hover:not(:disabled) { background:linear-gradient(180deg,#fffdf6,#f2e8d2); }
.smini9-btn:disabled { opacity:.45; cursor:default; }
.smini9-btn.is-main { color:#1f1a12; background:linear-gradient(180deg,#f6e3b4,#e8cd8c);
  border-color:rgba(150,110,40,.62); font-weight:700; }
.smini9-fb { min-height:20px; font-size:12.5px; line-height:1.7; color:#4b4130; max-width:min(620px,100%); text-align:left; }
.smini9-fb b.good { color:#2f6b3a; }
.smini9-fb b.bad { color:#8c2f22; }
.smini9-hud { width:100%; max-width:min(620px,100%); display:flex; flex-direction:column; gap:6px;
  padding:9px 11px 7px; background:rgba(255,252,244,.75);
  border:1px solid rgba(120,100,70,.3); border-radius:6px; box-sizing:border-box; }
.hg-row { display:flex; align-items:center; gap:9px; font-size:11.5px; color:#5f5442; }
.hg-row > span:first-child { width:52px; flex:none; }
.hg-bar { position:relative; flex:1; height:9px; background:rgba(120,104,78,.22); border-radius:5px; overflow:hidden; }
.hg-bar > i { display:block; height:100%; background:linear-gradient(90deg,#c08a2a,#e0b52f); transition:width .06s linear; }
.hg-bar > s { position:absolute; top:-3px; width:2px; height:15px; background:#8c2f22; }
.hg-bar.prog > i { background:linear-gradient(90deg,#6d7f92,#9fb2c4); }
.hg-row > b { min-width:56px; text-align:right; font-variant-numeric:tabular-nums; color:#3a3125; }
.hg-row .dots { letter-spacing:2px; color:#9a7a26; min-width:auto; }
.hg-row em { font-style:normal; padding:1px 6px; border-radius:3px; background:rgba(140,47,34,.12); color:#8c2f22; }
.hg-row em.foot { background:rgba(120,100,70,.14); color:#5f5442; }
@media (prefers-reduced-motion: reduce) { .hg-bar > i { transition:none; } }
`;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}
