/**
 * 《打水漂》v3（**第一人称 · 甩石片 · 单独开发，未接入主线**）
 *
 * ── 这版改的是"体现形式"，不是玩法骨架 ──
 *   用户点名要"向钓鱼那版看齐"：把 v2（minigames-skipstone.js）的**真实物理骨架**
 *   原样搬过来（六颗石头你先挑、弹弓手势、真弹跳、三档失败线），但画面从示意图式
 *   改成**第一人称站在贡水河边**：镜头是你的眼睛，脚边是卵石滩，画面下方是捏着石片的手，
 *   对面是夜色里的于都河与渡口的火把船影；石头**向远处透视**地一路点过去，每一次落水
 *   有一圈涟漪。娃站在你身边（看得见，不是抽象对手）。
 *
 * ── 视角 ──
 *   第一人称：镜头=人物的眼睛。竿/手从画面下方（手里）伸出去；水面从脚下一直铺到地平线；
 *   石头按"离眼睛的距离"算远近——近了大、远了小，收进对岸浅滩才慢慢看清，有"从近到远"
 *   的空间感（透视用一套朴素针孔模型，与钓鱼版同构：y = HORIZON + EYE_H*FOCAL/d）。
 *   夜色：1934 年 10 月 17–20 日，中央红军夜渡于都河（贡水）；等渡的部队在河滩上要等
 *   半夜。画面压成湿冷的夜蓝，只有渡口火把留一点暖橙——这就是题眼。
 *
 * ── 玩家的三个决策 ──
 *   ① **拿哪颗**：石堆六颗（薄瓦片 1 / 扁石板 4 / 圆卵石 1），**你先挑**（娃客气），
 *      剩下的他挑（他贪心：瓦 > 扁 > 圆）。三轮一人一颗。
 *      → 瓦片跳得最凶（贴着碎线 12 跳），但**拉过碎线就当场碎**（0 跳）；
 *        扁石板稳（9 跳，拉满也不怕）；圆卵石跳不动（5 跳）。
 *      → 圆卵石你永远可以躲给娃（你每轮先挑）——把它留到他手里，是他输掉三成的地方。
 *   ② **怎么甩**：在画面（手/水面上）按住、往后下方拖、松手（弹弓手势）。
 *      拖多长 = 力道（画面上有条力道条）；拖的方向 = 出手角（画面上有把**角度尺**，
 *      金色那一段是甜区）。**出手角 6–24° 跳得最多，14–18° 最好**（真打水漂的科学结论）；
 *      压到 40° 以上只剩一两跳，几乎垂直往下拖就一头扎进水里。
 *      ⚠ 手势**不是 1:1 映射**（乘 0.62）：人最自然的"往后下方拖"是 45°，1:1 会变成
 *      出手 45° = 只有 2 跳，怎么甩都打不起来。映射后拖 30° ≈ 出手 18.6°（甜区）。
 *   ③ **看它跳**：物理是真的——每落一次水掉一截速度，速度掉光就漂死了。
 *      扁石板满力压在甜区 = 9 跳、一路点到对岸；娃看着你。
 *
 * ── 失败线 ──
 *   三轮跳数加起来输给娃（`lose`）；三颗全沉全碎一个跳也没有（`duck`，0.08）。
 *   瓦片满力甩 = 当场碎（所以拿瓦的时候手要收着）。
 *
 * ── 史实锚点（沿用 v2 查证过的）──
 *   · 1934 年 10 月 17–20 日，中央红军 8.7 万人夜渡于都河（贡水）；于都百姓拆门板、床板、
 *     寿材搭浮桥，800 多条船摆 8 个渡口，整整四夜。等渡的部队在河滩上要等半夜。
 *   · 于都河这一带河床平缓、卵石滩多——河边孩子最会玩的就是打水漂。
 *   · 打水漂的物理：入水角约 20° 跳数最多，太平贴水皮儿、太陡一头扎进去，石子要扁要薄。
 *
 * ── 接不接 AI：不接 ──
 *   手感类玩法，AI 进来只会让每一掷之间多等十几秒。游戏内 0 次模型调用；
 *   赢/输之后那句评价由主线的 minigame_review 接管（不加 callType）。
 *
 * ── 文件结构 ──
 *   纯逻辑（常量 / simThrow / 对局推演 / 计分）→ 下面有「纯逻辑到此为止」标记，
 *   之前的段落不碰 DOM，可被临时脚本在 node 里单独跑（调难度用）。
 *   浏览器的飞行动画 = **逐帧回放 simThrow 预计算的轨迹**——画面上的跳数和判定里的跳数
 *   永远是同一个数（不会出现"动画跳了 7 下、结算说 8"）。
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

/**
 * 等模型给主意，但**不能把玩法挂住**：ms 毫秒内没回来就返回 null（调用方落回本地规则）。
 * 与五子棋那支同形（那边叫 decideWithin）——口径一致：超时不是错误，是"他没想出来"。
 */
async function decideWithin(payload, ms) {
  if (!DECIDE) return null;
  const ac = new AbortController();
  let t = 0;
  try {
    return await Promise.race([
      DECIDE(payload, { signal: ac.signal }),
      new Promise((r) => { t = setTimeout(() => r(null), ms); }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
    ac.abort();
  }
}


/* ══════════════ 小工具（自包含，不 import minigames.js）══════════════ */
function h(tag, attrs = {}, kids = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) el.appendChild(kid);
  return el;
}
function mount(container, node) { container.innerHTML = ''; container.appendChild(node); return node; }
function stats(_host, items) { return STATS(items); }
function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function play(sfx) { try { SFX(sfx); } catch { /* 音频没起来不影响玩法 */ } }
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;

/* ══════════════ 一、常量（与 v2 同参数，改这里 = 改难度）══════════════ */
/* 仿真坐标系：侧视，x 沿水面、y 向上为正。下面这套常量是"真实物理骨架"，原样保留。 */
export const W = 570;
export const H = 250;
export const YW = 168;              // 水面 y（画布像素）
export const LX = 22;               // 出手点 x
export const LY = YW - 2;           // 出手点 y：贴着水面甩（真实姿势）

export const K = {
  G: 1416,             // 重力 px/s²
  /* V0MAX 是**整条河能不能用上**的关键。旧版 780 太大：满力第一跳就飞掉 250px
     （半条多贡水），剩下的河面只够再点 4–5 下就撞上对岸 —— 于是"力道"和"角度"
     全都挤在 5~6 跳里，怎么甩都差不多，玩家没有手感。降到 560 之后第一跳 ~130px，
     后面还有 400px 让它一路点过去：甜区 9 跳、30° 只有 6 跳、42° 只剩 2 跳，梯度出来了。 */
  V0MAX: 560,          // 满力初速
  AIRK: 0.04,          // 空气阻尼 /s

  /* ── 保速曲线：**以理想入水角为中心，两边都变差** ──
     旧版是"陡过 26° → 直接 sink"的**断崖**：石头一下水就没了，反馈是 0 跳。
     而"往后下方拖"这句话让人自然拖成 30~45°，于是**怎么甩都打不起来**。
     改成连续曲线之后：随手一甩也能跳两三下（有反馈、看得出差别），
     甩到甜区才跳得多 —— 变成"练出来的手感"，不是"猜不中的门槛"。 */
  IDEAL_DEG: 18,       // 最佳入水角（真实的打水漂就是这个数）
  STEEP_SPAN: 20,      // 比理想值陡多少度，衰减到头（越小 = 陡的一侧掉得越快）
  /* 平的一侧要**轻罚**：每弹一次，弹起高度变小、入水角自然往下降，
     后半程本来就已经在"偏平"的那一侧了。平侧罚重了，后半程会一路崩掉。 */
  SHALLOW_SPAN: 20,    // 比理想值平多少度，衰减到头
  SINK_DEG: 44,        // 真的往上抛（几乎垂直往下拖）才一头扎进水里
  MIN_VX: 190,         // 水平速度掉到这以下 = 漂死了
  LIFT: 0.22,          // 水面升力（vy += vx*LIFT）：调大 = 每次弹得更高、跳得更远
  DRAG_MAX: 170,       // 手势拖满 170px = 满力
  /* ── 手势 → 出手角：不做 1:1 映射 ──
     1:1 时"往后下方拖"（人最自然的 45°）直接就是 45° 出手角 = 2 跳，
     怎么甩都打不起来。乘 0.62 之后：拖 30° → 出手 18.6°（甜区），
     拖 45° → 27.9°（还能跳 7 下，有反馈），拖到快垂直才扎水。
     = "随手能玩、练了更强"，而不是"猜不中门槛"。 */
  DRAG_DEG_K: 0.62,
  DRAG_DEG_CAP: 48,    // 上限 48°：只有真的快垂直往下拖，才会撞上 SINK_DEG
  ROUNDS: 3,
};

/** 石头三种。stock = 石堆里的颗数（一共 6 颗，你先挑，娃后挑）。 */
export const KINDS = {
  tile: {
    id: 'tile', name: '薄瓦片', stock: 1,
    rest: 0.18, keepBase: 0.94, steepK: 0.33, shallowK: 0.12, shatterV: 530,
    note: '跳得最凶——可别拉满，拉满当场碎在河面上。',
  },
  flat: {
    id: 'flat', name: '扁石板', stock: 4,
    rest: 0.14, keepBase: 0.91, steepK: 0.31, shallowK: 0.20, shatterV: 1e9,
    note: '稳。跳得最实在，拉满也不怕。',
  },
  round: {
    id: 'round', name: '圆卵石', stock: 1,
    rest: 0.12, keepBase: 0.83, steepK: 0.38, shallowK: 0.26, shatterV: 1e9,
    note: '圆的，压不住水——跳不动。别拿。',
  },
};
export const KIND_LIST = ['tile', 'flat', 'round'];
export const STOCK = Object.fromEntries(KIND_LIST.map((id) => [id, KINDS[id].stock]));

/** 娃（老表家的娃，河滩上最会打水漂的那双小手）。
 *  扁石板他敢用九成力；瓦片他知道碎线在哪，只敢用八成四——所以拉满碎瓦是**你的**独有风险。 */
export const KID = { powerFlat: 0.90, powerTile: 0.84, powerJit: 0.01, angle: 16, angleJit: 2 };
/** 娃挑石头：贪心（瓦 > 扁 > 圆）。你每轮先挑——把圆卵石躲给他，是能赢他的一成。 */
export function kidPick(pool) {
  if (pool.tile > 0) return 'tile';
  if (pool.flat > 0) return 'flat';
  return 'round';
}

/* ══════════════ 二、一次投掷（纯函数，node 可直接跑）══════════════ */

/**
 * 物理仿真。浏览器里的飞行动画**逐帧回放**它返回的 path/hops——
 * 判定和画面读的是同一条轨迹，不存在两套数。
 * input : kind, power 0..1, deg 出手角（度，相对水平面）
 * output: { skips, why: live|sink|shatter|skim|off, entry 首次入水角,
 *           hops: [{x, t, h}] 每次落水（x 画布px / t 秒 / h 弹起px）,
 *           path: [{x,y,t}] 1/60s 采样的整条轨迹, tEnd 总时长秒,
 *           endX, dist 步（px/6） }
 */
export function simThrow(kind, power, deg) {
  const k = KINDS[kind] || KINDS.flat;
  const v0 = K.V0MAX * clamp(power, 0, 1);
  const r = (deg * Math.PI) / 180;
  let x = LX, y = LY, vx = v0 * Math.cos(r), vy = -v0 * Math.sin(r);
  let skips = 0, why = 'off', entry = null;
  const hops = []; const path = [];
  const DT = 1 / 120;
  let t = 0, sample = 0;
  for (let i = 0; i < 6000; i++) {
    vy += K.G * DT;
    vx *= 1 - K.AIRK * DT;
    x += vx * DT; y += vy * DT; t += DT;
    if (sample++ % 2 === 0) path.push({ x, y, t });
    if (y >= YW && vy > 0) {
      const ratio = vy / Math.max(1e-6, vx);
      const ent = (Math.atan(ratio) * 180) / Math.PI;
      const speed = Math.hypot(vx, vy);
      if (entry === null) entry = Math.round(ent * 10) / 10;
      if (speed > k.shatterV) { why = 'shatter'; skips = 0; break; }
      if (ent > K.SINK_DEG) { why = 'sink'; break; }
      if (vx < K.MIN_VX) { why = 'skim'; break; }
      vy = -(vy * k.rest + vx * K.LIFT);
      /* 保速：偏离理想入水角越远，掉速越狠。**两边都掉** ——
         往上抛（陡）是扎水，压太扁（平）是拍在水面上，都不如那一记斜切。 */
      const d = ent - K.IDEAL_DEG;
      const loss = d >= 0
        ? k.steepK * (d / K.STEEP_SPAN)
        : k.shallowK * (-d / K.SHALLOW_SPAN);
      const keep = clamp(k.keepBase - loss, 0.10, 1.08);
      vx *= keep;
      skips += 1;
      hops.push({ x: Math.round(x * 10) / 10, t: Math.round(t * 1000) / 1000, h: Math.round((vy * vy) / (2 * K.G)) });
      y = YW;
    }
    if (x > W - 6) { why = 'off'; break; }
  }
  path.push({ x, y, t });
  return {
    skips, why, entry,
    hops, path, tEnd: Math.round(t * 1000) / 1000,
    endX: Math.round(x), dist: Math.round(x / 6),
  };
}

/* ══════════════ 三、计分（纯函数）══════════════ */

/** 结局四档 + 分数。diff = 你总跳数 − 娃总跳数。 */
export function scoreOf(you, kid) {
  if (you === 0) return { outcome: 'duck', score: 0.08 };
  const diff = you - kid;
  if (diff > 0) return { outcome: 'win', score: Number(clamp(0.60 + 0.34 * (diff / 8), 0, 1).toFixed(3)) };
  if (diff === 0) return { outcome: 'tie', score: 0.55 };
  const r = kid > 0 ? you / kid : 1;
  return { outcome: 'lose', score: Number((0.22 + 0.18 * clamp(r, 0, 1)).toFixed(3)) };
}

/**
 * 娃这一手的**候选**（三个，全部出自他自己的性格参数 KID）——给模型挑。
 *
 * 2026-09-18：原来他那一手是 `kidPick()`（贪心规则）+ 本地随机力道/角度，
 * 一个模型字都没问 —— 而"对手怎么扔"就是 AI 决策，赛制要求它必须走模型、且要留日志。
 * 物理一行没改：候选照样过 simThrow 真算，模型只回答"**挑哪一个**"。
 * 三个候选各有取舍（贪最凶的瓦 / 稳一手 / 搏一把），够模型按比分形势选。
 */
export function kidCandidates(pool) {
  const pickOf = (prefer) => {
    for (const k of prefer) if (pool[k] > 0) return k;
    return KIND_LIST.find((k) => pool[k] > 0) || 'flat';
  };
  const jit = (base, amp) => clamp(base + (Math.random() * 2 - 1) * amp, 0, 1);
  const best = pickOf(['tile', 'flat', 'round']);      // 贪心：瓦 > 扁 > 圆（他原来的口径）
  const safe = pickOf(['flat', 'round', 'tile']);      // 稳一手：先保扁石板
  return [
    { kind: best, pow: jit(best === 'tile' ? KID.powerTile : KID.powerFlat, KID.powerJit),
      deg: KID.angle, note: '照他平时的习惯扔：拿最好的那块石头、用他练熟的角度' },
    { kind: safe, pow: jit(KID.powerFlat, KID.powerJit), deg: KID.angle,
      note: '稳一手：宁可少跳两下，也不冒"瓦片满力当场碎"的险' },
    { kind: best, pow: clamp(jit(best === 'tile' ? KID.powerTile : KID.powerFlat, KID.powerJit) + 0.1, 0, 1),
      deg: KID.angle + 2, note: '搏一把：压更足、角度抬高一点 —— 跳成了多两下，跳砸了贴水皮儿' },
  ];
}

/** 一整局推演（node 侧参考打法用；浏览器侧不用它，浏览器跑的是真 UI 流程）。 */
export function contestOf(plan, rnd = Math.random) {
  const pool = { ...STOCK };
  let you = 0, kid = 0;
  const rounds = [];
  for (let i = 0; i < Math.min(K.ROUNDS, plan.length); i++) {
    const y = plan[i];
    pool[y.kind] -= 1;
    const yr = simThrow(y.kind, y.p, y.deg);
    you += yr.skips;
    const kp = kidPick(pool);
    pool[kp] -= 1;
    const kidDeg = KID.angle + (rnd() * 2 - 1) * KID.angleJit;
    const kidPow = clamp((kp === 'tile' ? KID.powerTile : KID.powerFlat) + (rnd() * 2 - 1) * KID.powerJit, 0, 1);
    const kr = simThrow(kp, kidPow, kidDeg);
    kid += kr.skips;
    rounds.push({
      youKind: y.kind, you: yr.skips, youWhy: yr.why,
      kidKind: kp, kid: kr.skips, kidWhy: kr.why,
    });
  }
  return { you, kid, rounds, ...scoreOf(you, kid) };
}

/** 参考打法（QA 钉分档用）。拖拽手势的等价输入：{kind, p 力道, deg 出手角}。 */
export const PLAYS = [
  {
    id: 'best', name: '最优线：拿瓦（贴着碎线用九成力）+ 两颗扁石板满力',
    plan: [
      { kind: 'tile', p: 0.90, deg: 18 },
      { kind: 'flat', p: 1.00, deg: 18 },
      { kind: 'flat', p: 1.00, deg: 18 },
    ],
  },
  {
    id: 'snap', name: '拿了瓦却拉满（当场碎）',
    plan: [
      { kind: 'tile', p: 1.00, deg: 18 },
      { kind: 'flat', p: 1.00, deg: 18 },
      { kind: 'flat', p: 1.00, deg: 18 },
    ],
  },
  {
    id: 'safe', name: '不碰瓦（三颗扁石板，瓦留给娃）',
    plan: [
      { kind: 'flat', p: 1.00, deg: 18 },
      { kind: 'flat', p: 1.00, deg: 18 },
      { kind: 'flat', p: 1.00, deg: 18 },
    ],
  },
  {
    id: 'sloppy', name: '手潮（只有六成力）',
    plan: [
      { kind: 'flat', p: 0.60, deg: 18 },
      { kind: 'flat', p: 0.60, deg: 18 },
      { kind: 'flat', p: 0.60, deg: 18 },
    ],
  },
  {
    id: 'trap', name: '乱拿（先拿了圆卵石）',
    plan: [
      { kind: 'round', p: 1.00, deg: 18 },
      { kind: 'flat', p: 1.00, deg: 18 },
      { kind: 'flat', p: 1.00, deg: 18 },
    ],
  },
  {
    id: 'duck', name: '全扔高（一颗接一颗扎进水里）',
    plan: [
      { kind: 'flat', p: 1.00, deg: 42 },
      { kind: 'flat', p: 1.00, deg: 42 },
      { kind: 'flat', p: 1.00, deg: 42 },
    ],
  },
];

/* ══════════ 纯逻辑到此为止（下面开始 第一人称视角 / DOM / 画面，node 里不能直接跑）══════════ */

/* ══════════════ 第一人称透视 & 场景常量 ══════════════ */
/* 针孔模型（与钓鱼版同构）：y = HORIZON + EYE_H*FOCAL/d；x = CX + lat*FOCAL/d。
   仿真 x（0..W）线性映射到世界距离 d（D_NEAR..D_FAR）：出手点在你脚边（近、大），
   收进对岸浅滩（远、小）——"从近到远"的空间感就来自这里。 */
const Wp = 720, Hp = 400;          // 画布逻辑尺寸
const HORIZON = 150;
const CX = 360;
const FOCAL = 900;
const EYE_H = 1.2;
const D_NEAR = 5.2;                // 出手点离眼睛的水平距离（米）——你脚边的水面
const D_FAR = 34;                  // 贡水对岸（渡口）——约此远
const LATK = 0.006;                // 仿真 x → 横向漂移（米/px），让石片斜着撇出去、别死贴中线
const HM = 0.022;                  // 仿真高度(px) → 离水高度(米)

const ySurf = (d) => HORIZON + (EYE_H * FOCAL) / d;
function projWorld(d, lat, dep) {
  const s = FOCAL / d;
  return { x: CX + lat * s, y: ySurf(d) + dep * s, s };
}
/** 仿真坐标点 → 第一人称屏幕点。latBase 给娃的石片一个横向基准（从娃那侧撇出）。 */
function projSim(p, latBase) {
  const d = D_NEAR + (p.x - LX) * (D_FAR - D_NEAR) / (W - LX);
  const dep = (YW - p.y) * HM;
  const lat = (p.x - LX) * LATK + (latBase || 0);
  return projWorld(d, lat, dep);
}

function palette() {
  return {
    gold: cssVar('--gold', '#d9b45a'),
    seal: cssVar('--seal', '#a8322a'),
    ink: cssVar('--ink-0', '#f2ead6'),
  };
}

/* 夜色贡水 · 1934 年 10 月 · 等渡的半宿。画面压成湿冷的夜蓝，只有渡口火把留一点暖橙。 */
const SC = {
  skyTop: '#070d20', skyMid: '#13243f', skyLow: '#21364f',
  waterFar: '#16273c', waterNear: '#070f1a',
  bank: '#0a1622', torch: '#ffb24d', torchCore: '#ffe1a0',
  boat: '#060c12', lantern: '#ffc46e',
  beachTop: '#1a140e', beachLow: '#0c0907', pebbleA: '#3a3326', pebbleB: '#2a2519', pebbleC: '#453c2c',
  kid: '#0c121a', hand: '#544730', sleeve: '#38301f',
  stoneTile: '#b9ad93', stoneFlat: '#cfc4a8', stoneRound: '#8f8676', stoneKid: '#c8a86a',
};

/* 预生成的静景（种子固定，避免每帧抖动） */
const STARS = (() => {
  const a = []; const r = mulberry32(77);
  for (let i = 0; i < 70; i++) a.push({ x: r() * Wp, y: r() * (HORIZON - 8), b: 0.2 + r() * 0.6, ph: r() * 6.28 });
  return a;
})();
const TORCHES = (() => {
  const a = []; const r = mulberry32(11);
  for (let i = 0; i < 7; i++) a.push({ lat: -14 + i * 4.2, ph: r() * 6.28, sz: 0.7 + r() * 0.5, tilt: (r() * 2 - 1) * 1.6 });
  return a;
})();
const BOATS = (() => {
  const a = []; const r = mulberry32(23);
  // lat 收在河道内：x = CX + lat*s，s=30 → |lat| ≤ 9 才不会有一条船被画布右边缘切一半
  for (let i = 0; i < 5; i++) a.push({ lat: -9 + i * 4.5 + (r() * 1.2 - 0.6), w: 1.2 + r() * 1.1 });
  return a;
})();
const PEBBLES = (() => {
  const a = []; const r = mulberry32(41);
  for (let i = 0; i < 30; i++) a.push({ x: r() * Wp, ty: r(), rx: 3 + r() * 8, ry: 1.6 + r() * 3, c: r() });
  return a;
})();
const WAVE_DS = (() => {
  const a = [];
  for (let i = 0; i < 26; i++) a.push(D_NEAR * Math.pow(D_FAR / D_NEAR, i / 25));
  return a;
})();
/* 对岸的那条线：旧版是一排**扇贝形半椭圆**（画出来像贴着水面的一串蘑菇/飞碟），
   一眼就是"拼凑图形"。换成**起伏的远山 + 一层真树线**（针叶/阔叶混着的三角与球冠，
   高低错落、带一点手抖），再加两间渡口屋的剪影 —— 一眼就读得出"这是河对岸的村子"。 */
const HILLS = (() => {
  const a = []; const r = mulberry32(53);
  for (let i = 0; i < 24; i++) a.push({ x: (i / 23) * (Wp + 60) - 30, h: 8 + r() * 13, w: 52 + r() * 74 });
  return a;
})();
const TREES = (() => {
  const a = []; const r = mulberry32(67);
  for (let i = 0; i < 46; i++) a.push({ x: r() * Wp, h: 7 + r() * 15, w: 3 + r() * 4.5, pine: r() < 0.45, tilt: (r() * 2 - 1) * 0.16 });
  return a;
})();
const HOUSES = (() => {
  const a = []; const r = mulberry32(89);
  for (let i = 0; i < 5; i++) a.push({ x: 40 + i * 155 + r() * 40, w: 15 + r() * 13, h: 7 + r() * 6, lit: r() < 0.5 });
  return a;
})();

/* ══════════════ 样式（前缀 smini18-，运行期注入，不碰项目 CSS）══════════════ */
function ensureStyle() {
  if (document.getElementById('skim-mini-style')) return;
  const s = document.createElement('style');
  s.id = 'skim-mini-style';
  s.textContent = `
.smini18-wrap { display:flex; flex-direction:column; gap:8px; align-items:center; width:100%; }
.smini18-wrap > * { position:relative; z-index:1; }   /* 内容盒不被任何背景层盖住 */
.smini18-lead { margin:0; font-family:var(--font-kai, "KaiTi", serif); font-size:13.5px; line-height:1.65;
  color:#3f3524; max-width:min(720px,100%); text-align:left; }
.smini18-lead b { color:#8c2f22; font-weight:400; }
.smini18-lead .dim { display:block; margin-top:3px; color:#7a6c53; font-size:12.5px; }
.smini18-hud { width:100%; max-width:min(720px,100%); box-sizing:border-box; padding:7px 10px 6px;
  background:rgba(255,252,244,.8); border:1px solid rgba(120,100,70,.3); border-radius:6px;
  display:flex; flex-wrap:wrap; gap:4px 12px; min-height:20px; }
.smini18-hud:empty { display:none; }
.smini18-stat { font-size:12.5px; color:#3f3524; }
.smini18-cv { background:#0a1422; border-radius:6px; touch-action:none; cursor:grab;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 0 0 1px rgba(90,80,64,.32); }
.smini18-cv:active { cursor:grabbing; }
.smini18-hint { width:100%; max-width:min(720px,100%); font-size:12px; color:#8a7c62; text-align:center; }
.smini18-hint:empty { display:none; }
.smini18-acts { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; min-height:30px; }
.smini18-acts:empty { display:none; }
.smini18-btn { font:inherit; font-size:12.5px; padding:5px 12px; border-radius:3px; cursor:pointer;
  background:rgba(255,252,244,.92); border:1px solid rgba(120,100,70,.45); color:#2c2416; }
.smini18-btn:hover:not([disabled]) { background:#fffcf4; border-color:rgba(150,110,40,.62); }
.smini18-btn[disabled], .smini18-btn.off { opacity:.4; cursor:default; }
.smini18-fb { width:100%; max-width:min(720px,100%); font-size:12.5px; line-height:1.7; color:#4b4130;
  text-align:left; min-height:20px; }
.smini18-fb:empty { display:none; }
.smini18-fb b { color:#8c2f22; font-weight:400; }
`;
  document.head.appendChild(s);
}

/* ══════════════ 玩法本体 ══════════════ */
export async function runSkim(container, opts = {}) {
  return new Promise((resolve) => {
    ensureStyle();
    const P = palette();
    const rndFn = opts.rnd || mulberry32(opts.rndSeed || 19341017);

    /* ── 局面 ── */
    let phase = 'pick';            // pick → aim → fly → kid → … → done
    let round = 0;                 // 0..2
    let you = 0, kid = 0;
    const pool = { ...STOCK };
    let picked = null;             // 手里的石头 kind
    let flying = null;             // { sim, t, who: 'you'|'kid', counted, done, latBase }
    let aim = null;                // { sx, sy, cx, cy } 拖拽
    let outcome = null, over = false, finishing = false;
    let ripples = [];              // { d, lat, t0 }
    let lastThrow = null;          // 本掷展示用
    let fbEl, lead, hud, cv, hintEl, acts, ctx;
    let raf = 0, lastT = 0, animT = 0;
    const SPEED = 1.4;            // 回放倍速（1 = 物理真实时间）
    let kidThrowStart = 0;

    /* ── 自清：统一用 AbortController 收掉监听；定时器也归到 timers 一并清 ── */
    const ac = new AbortController();
    const { signal } = ac;
    const timers = new Set();
    function later(fn, ms) {
      const id = setTimeout(() => { timers.delete(id); if (container.isConnected && !over) fn(); }, ms);
      timers.add(id);
      return id;
    }
    function clearTimers() { for (const id of timers) clearTimeout(id); timers.clear(); }
    let cleaned = false;
    function cleanup(reason) {
      if (cleaned) return;
      cleaned = true;
      cancelAnimationFrame(raf);
      ac.abort();
      clearTimers();
      if (!over && reason === 'detach') {
        over = true;
        resolve({ score: 0, detail: { outcome: 'none', why: 'detached' }, summary: '' });
      }
    }
    signal.addEventListener('abort', clearTimers);

    /* ── DOM ── */
    const root = h('div', { class: 'smini18-wrap' });
    mount(container, root);
    lead = h('p', { class: 'smini18-lead' });
    hud = h('div', { class: 'smini18-hud' });
    cv = h('canvas', { class: 'smini18-cv', width: Wp, height: Hp });
    hintEl = h('div', { class: 'smini18-hint' });
    acts = h('div', { class: 'smini18-acts' });
    fbEl = h('div', { class: 'smini18-fb' });
    root.append(lead, hud, cv, hintEl, acts, fbEl);

    ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(Wp * dpr);
    cv.height = Math.round(Hp * dpr);
    cv.style.width = '100%';
    cv.style.height = 'auto';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    container.dataset.mini = 'skim-v3';
    hintEl.textContent = '石片要扁 · 出手角压进尺子上的金色甜区（约 6–24°）· 每落一次水掉一截速度';
    const INTRO = '渡河前的那半夜。老表家的娃蹲在卵石滩边，把一把石子塞给你：'
      + '「比比谁的石子跳得多？你们要过河的人，手上有活儿。」';

    /* ── 按钮（pick 阶段用；不可用则不带 data-mini-action）── */
    function mkBtn(label, action, title, off) {
      const b = h('button', { type: 'button', class: `smini18-btn ${off ? 'off' : ''}`, text: label });
      if (title) b.title = title;
      if (action) b.setAttribute('data-mini-action', action);
      else b.disabled = true;
      return b;
    }
    function renderActs() {
      acts.innerHTML = '';
      if (phase === 'pick') {
        for (const id of KIND_LIST) {
          const n = pool[id];
          const k = KINDS[id];
          const b = mkBtn(`${k.name} ×${n}`, n > 0 ? `pick-${id}` : '', k.note, n === 0);
          acts.appendChild(b);
        }
      }
    }
    function setCanvasActionable(on) {
      if (on) cv.setAttribute('data-mini-action', 'aim');
      else cv.removeAttribute('data-mini-action');
    }

    function renderLead() {
      let step;
      if (phase === 'pick') {
        step = `第 ${round + 1} 轮 · <b>你先挑</b>（他挑剩下的）。石堆里还有六颗：薄瓦片跳得最凶、可满力一甩就碎；扁石板稳；圆卵石跳不动。`;
      } else if (phase === 'aim') {
        step = `手里是<b>${KINDS[picked].name}</b>。<b>在画布上按住、往后下方拖、松手</b>。拖得越长力道越足；拖得越平，出手角越低——<b>把角度压进顶上那把尺子的金色甜区</b>，跳得最多。`;
      } else if (phase === 'fly') {
        step = `石子出手了——${flying && flying.counted > 0 ? `已经 ${flying.counted} 跳` : '看着它一路点过去'}……`;
      } else if (phase === 'kid') {
        step = `娃把他那颗掂了掂，咧嘴一笑：「<b>看好了。</b>」`;
      } else {
        step = endText;
      }
      lead.innerHTML = `${INTRO}<span class="dim">${step}</span>`;
    }

    /** 对外观测面：一次写全、同步写（skill 规矩：同刻一致，不撒谎）。 */
    function writeData() {
      container.dataset.mini = 'skim-v3';
      container.dataset.miniState = phase;
      container.dataset.miniRound = String(round);
      container.dataset.miniYou = String(you);
      container.dataset.miniKid = String(kid);
      container.dataset.miniPool = KIND_LIST.map((id) => `${id}:${pool[id]}`).join(',');
      container.dataset.miniKind = picked || '';
      if (aim) {
        const v = aimVec();
        container.dataset.miniAngle = String(v.deg);
        container.dataset.miniPower = String(Math.round(v.pow * 100));
      } else {
        container.dataset.miniAngle = '';
        container.dataset.miniPower = '';
      }
      if (lastThrow) {
        container.dataset.miniSkips = String(flying ? flying.counted : lastThrow.sim.skips);
        container.dataset.miniThrow = lastThrow.sim.why;
        container.dataset.miniEntry = String(lastThrow.sim.entry);
      }
      if (outcome) {
        container.dataset.miniOutcome = outcome.outcome;
        container.dataset.miniScore = String(outcome.score);
      }
      const rows = [
        ['轮', `${Math.min(round + 1, K.ROUNDS)} / ${K.ROUNDS}`],
        ['你', `${you} 跳`],
        ['娃', `${kid} 跳`],
        ['石堆', KIND_LIST.reduce((a, id) => a + pool[id], 0)],
      ];
      stats(opts.stats, rows);
    }

    function aimVec() {
      const dx = aim.cx - aim.sx, dy = aim.cy - aim.sy;
      const len = Math.hypot(dx, dy);
      // 力度量化到 1%：dataset 上报的就是判定用的（QA 才能逐跳对账，不出现两套数）
      const pow = Math.round((clamp(len / K.DRAG_MAX, 0, 1)) * 100) / 100;
      // 弹弓：往后下方拖 → 石子往前（离你）上方走。
      // 出手角（水平面上方为正）= atan2(下拉量, 左拉量)。拖正下=90°，拖平往后=0°。
      // **不 1:1 映射**：见 K.DRAG_DEG_K 的注释（1:1 时自然的 45° 拖拽只有 2 跳，打不起来）。
      const rawDeg = (Math.atan2(dy, -dx) * 180) / Math.PI;
      const deg = len > 2 ? clamp(rawDeg * K.DRAG_DEG_K, 0, K.DRAG_DEG_CAP) : 0;
      return { pow, deg: Math.round(deg * 10) / 10, dx, dy, len };
    }

    function pickStone(id) {
      if (phase !== 'pick' || !pool[id]) return;
      picked = id;
      phase = 'aim';
      aim = null;
      setCanvasActionable(true);
      fbEl.textContent = `${KINDS[id].name}拿在手里。${KINDS[id].note}`;
      renderActs(); renderLead(); writeData();
      play('click');
    }

    function release() {
      const v = aimVec();
      aim = null;
      if (v.len < 10 || v.deg < 2) { writeData(); return; }   // 手一哆嗦没拖出去：石子还在手里
      pool[picked] -= 1;
      const sim = simThrow(picked, v.pow, v.deg);
      lastThrow = { sim, who: 'you', kind: picked, deg: v.deg, pow: v.pow };
      flying = { sim, t: 0, who: 'you', counted: 0, done: false, latBase: 0 };
      ripples = [];
      phase = 'fly';
      setCanvasActionable(false);
      renderActs(); renderLead();
      play('cast');
      writeData();
    }

    function settleThrow() {
      const who = flying.who;
      const s = flying.sim;
      if (who === 'you') you += s.skips; else kid += s.skips;
      fbEl.innerHTML = throwLine(who === 'you' ? '你' : '娃', s);
      if (who === 'you') play(s.why === 'sink' || s.why === 'shatter' ? 'wrong' : s.skips >= 5 ? 'correct' : 'splash');
      flying = null;
      writeData();
      if (who === 'you') {
        /* 你的那颗落定 → 娃的回合（留半秒让他掂石子） */
        phase = 'kid';
        kidThrowStart = animT;
        renderLead(); writeData();
        later(startKidFlight, 650);
      } else if (round >= K.ROUNDS - 1 || allOut()) {
        finish();
      } else {
        round += 1;
        picked = null;
        phase = 'pick';
        renderActs(); renderLead(); writeData();
      }
    }

    /**
     * 娃这一手：**先问模型挑一个候选**，10 秒内没答上来（或答得不合法）就落回他自己的规则。
     * 物理与画面一个字没变 —— 变的只是"挑哪一手"这个决策由谁下（原来是纯本地规则）。
     * `dataset.miniFrom` 如实标 model / engine，答辩与日志都看这个。
     */
    async function startKidFlight() {
      if (over || phase !== 'kid') return;
      container.dataset.miniFrom = 'engine';           // 先按兜底写着，模型答对了再改
      const cands = kidCandidates(pool);
      let pick = -1;
      let say = '';
      if (DECIDE) {
        phase = 'kid-think';
        fbEl.innerHTML = '他捏着石头，眼睛在你和水面之间来回 —— <b>他在挑</b>。';
        writeData(); renderActs();
        const out = await decideWithin({
          scene: '于都河·打水漂（娃这一手）',
          callType: 'skim_throw',
          situation: `第 ${round + 1} / ${K.ROUNDS} 轮，轮到他扔。你 ${you} 跳，他 ${kid} 跳。`,
          state: opts.state || {},
          operation: {
            type: 'skim_throw', round: round + 1, rounds: K.ROUNDS,
            you, kid, pool: { ...pool },
            legend: '薄瓦片跳最凶但满力就碎；扁石板稳；圆卵石跳不动。'
              + '跳数取决于石头 + 力道 + 出手角（约 15–20° 最好）。',
            candidates: cands.map((c, i) => ({ i, stone: KINDS[c.kind].name, power: Math.round(c.pow * 100), angle: Math.round(c.deg), note: c.note })),
          },
        }, 10000);
        if (over) return;
        if (out && !out._error && Number.isInteger(Number(out.pick)) && cands[Number(out.pick)]) {
          pick = Number(out.pick);
          container.dataset.miniFrom = 'model';
          say = typeof out.say === 'string' ? out.say.slice(0, 40) : '';
        }
        if (pick < 0) {
          // 兜底：他没等到主意，就照自己的老规矩扔（规则取自 kidPick）
          const kp = kidPick(pool);
          const kidDeg = KID.angle + (rndFn() * 2 - 1) * KID.angleJit;
          const kidPow = clamp((kp === 'tile' ? KID.powerTile : KID.powerFlat) + (rndFn() * 2 - 1) * KID.powerJit, 0, 1);
          pick = cands.findIndex((c) => c.kind === kp);
          if (pick < 0) pick = 0;
          cands[pick] = { kind: kp, pow: kidPow, deg: kidDeg, note: '他自己拿的主意' };
        }
        phase = 'kid';
      }
      const c = cands[pick < 0 ? 0 : pick];
      pool[c.kind] -= 1;
      const sim = simThrow(c.kind, c.pow, c.deg);
      lastThrow = { sim, who: 'kid', kind: c.kind, deg: c.deg, pow: c.pow };
      if (say) fbEl.innerHTML = `娃：<b>${say}</b>`;
      flying = { sim, t: 0, who: 'kid', counted: 0, done: false, latBase: 0.8 };
      ripples = [];
      writeData();
    }

    function allOut() {
      return KIND_LIST.every((id) => pool[id] === 0);
    }

    function throwLine(who, s) {
      if (s.why === 'shatter') return `${who}那颗薄瓦片「啪」一声碎在水面上，一下也没跳。`;
      if (s.why === 'sink') return `${who}那颗扔高了，一头扎进水里。`;
      if (s.skips === 0) return `${who}那颗贴着水皮儿漂了一下，没跳起来。`;
      /* 落在哪儿要说真话：飘到 90% 河宽才算"收进对岸浅滩"，
         死在河心就说死在河心（旧版只会说一句"收进对岸浅滩"，2 跳也这么报，假的）。 */
      const frac = (s.endX - LX) / (W - LX);
      const where = frac >= 0.9 ? '收进对岸浅滩了'
        : frac >= 0.6 ? '到河心就没劲了'
          : '没飘出多远就沉了';
      return `${who}那颗一路点过去——<b>${s.skips} 跳</b>，${where}。`;
    }

    let endText = '';
    function finish() {
      if (finishing) return;
      finishing = true;
      outcome = scoreOf(you, kid);
      phase = 'done';
      setCanvasActionable(false);
      acts.innerHTML = '';
      if (outcome.outcome === 'win') {
        endText = `三轮下来，你 ${you} 跳，娃 ${kid} 跳。娃把剩下的扁石板推过来：「你们过河的人，手上有活儿。」`
          + '远处渡口的号子响了——该上桥了。';
        play('correct');
      } else if (outcome.outcome === 'tie') {
        endText = `你 ${you} 跳，娃 ${kid} 跳——平了。娃咧嘴：「再比就是明天了，你们今夜要走。」`;
      } else if (outcome.outcome === 'duck') {
        endText = `三颗石子一颗接一颗沉在河汊里，一个跳也没有。娃没说话，把自己那把扁石板递过来：`
          + '「先歇着，号子还没响。」';
        play('wrong');
      } else {
        endText = `你 ${you} 跳，娃 ${kid} 跳。娃把手一摊：「我天天在这河滩上打，你们天天赶路——不亏。」`
          + '他把最后一颗扔出去，八跳，落在对岸浅滩上。';
        play('wrong');
      }
      renderLead();
      writeData();
      draw(animT);
      const id = setTimeout(() => {
        timers.delete(id);
        over = true;
        cleanup('done');
        resolve({
          score: outcome.score,
          detail: { outcome: outcome.outcome, you, kid, pool: { ...pool }, rounds: K.ROUNDS },
          summary: `打水漂：你 ${you} 跳，娃 ${kid} 跳，${outcome.outcome === 'win' ? '赢了' : outcome.outcome === 'tie' ? '平了' : outcome.outcome === 'duck' ? '一颗也没跳起来' : '输了'}`,
        });
      }, 1000);
      timers.add(id);
    }

    /* ── 挑石按钮（事件委托）＋ 键盘 1/2/3 快捷键 ── */
    acts.addEventListener('click', (e) => {
      const a = e.target.closest('[data-mini-action]');
      if (!a || a.disabled) return;
      const act = a.getAttribute('data-mini-action');
      if (act && act.startsWith('pick-')) pickStone(act.slice(5));
    });
    const onKey = (e) => {
      if (e.type !== 'keydown' || e.repeat) return;
      if (phase === 'pick') {
        const i = { 1: 0, 2: 1, 3: 2 }[e.key];
        if (i !== undefined) pickStone(KIND_LIST[i]);
      }
    };
    window.addEventListener('keydown', onKey, { signal });

    /* ── 拖拽（弹弓手势）── 在画布上任意处按住、往后下方拖、松手。 */
    function ptOf(e) {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (Wp / r.width), y: (e.clientY - r.top) * (Hp / r.height) };
    }
    cv.addEventListener('pointerdown', (e) => {
      if (phase !== 'aim') return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch { /* 拿不到捕获也能玩 */ }
      const p = ptOf(e);
      aim = { sx: p.x, sy: p.y, cx: p.x, cy: p.y };
      writeData();
    }, { signal });
    cv.addEventListener('pointermove', (e) => {
      if (phase !== 'aim' || !aim) return;
      const p = ptOf(e);
      aim.cx = p.x; aim.cy = p.y;
      writeData();
    }, { signal });
    const onUp = () => { if (phase !== 'aim' || !aim) return; release(); };
    cv.addEventListener('pointerup', onUp, { signal });
    cv.addEventListener('pointercancel', () => { aim = null; writeData(); }, { signal });

    /* ── 主循环：回放预计算轨迹 ── */
    function frame(now) {
      if (!document.body.contains(container)) { cleanup('detach'); return; }
      const dt = Math.min(0.05, (now - lastT) / 1000) || 0;
      lastT = now;
      animT += dt;
      if (flying && !flying.done) {
        flying.t += dt * SPEED;
        const s = flying.sim;
        // 数跳：动画时间越过每个跳点 → +1（画面与 dataset 同刻）
        while (flying.counted < s.hops.length && s.hops[flying.counted].t <= flying.t) {
          flying.counted += 1;
          const hp = s.hops[flying.counted - 1];
          ripples.push({
            d: D_NEAR + (hp.x - LX) * (D_FAR - D_NEAR) / (W - LX),
            lat: (hp.x - LX) * LATK + (flying.latBase || 0),
            t0: animT,
          });
          if (flying.counted === 1) play('splash');
          writeData();
        }
        if (flying.t >= s.tEnd) {
          flying.done = true;
          if (s.why === 'sink' || s.why === 'shatter' || s.why === 'skim') {
            ripples.push({
              d: D_NEAR + (s.endX - LX) * (D_FAR - D_NEAR) / (W - LX),
              lat: (s.endX - LX) * LATK + (flying.latBase || 0),
              t0: animT,
            });
          }
          later(settleThrow, 420);
        }
      }
      draw(animT);
      raf = requestAnimationFrame(frame);
    }

    /* ══════════════ 画面（第一人称 · 夜色贡水）═════════════ */
    function posAt(sim, t) {
      const p = sim.path;
      if (t <= 0) return p[0];
      for (let i = 1; i < p.length; i++) {
        if (p[i].t >= t) {
          const a = p[i - 1], b = p[i];
          const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
          return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
        }
      }
      return p[p.length - 1];
    }

    function drawStoneAt(g, x, y, kind, scale) {
      const col = kind === 'tile' ? SC.stoneTile : kind === 'round' ? SC.stoneRound : SC.stoneFlat;
      const rx = Math.max(3, 6 * scale), ry = Math.max(1.4, 2.5 * scale);
      g.save();
      g.translate(x, y);
      g.fillStyle = col;
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(10,14,20,0.5)'; g.lineWidth = 0.7; g.stroke();
      g.restore();
    }

    function drawSky(g, t) {
      const seam = ySurf(D_FAR) + 6;
      const gs = g.createLinearGradient(0, 0, 0, seam);
      gs.addColorStop(0, SC.skyTop);
      gs.addColorStop(0.7, SC.skyMid);
      gs.addColorStop(1, SC.skyLow);
      g.fillStyle = gs;
      g.fillRect(0, 0, Wp, seam);
      // 月晕 + 月
      const mx = 600, my = 54;
      const mg = g.createRadialGradient(mx, my, 2, mx, my, 48);
      mg.addColorStop(0, 'rgba(220,228,210,0.45)');
      mg.addColorStop(1, 'rgba(220,228,210,0)');
      g.fillStyle = mg; g.beginPath(); g.arc(mx, my, 48, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(232,238,224,0.85)'; g.beginPath(); g.arc(mx, my, 12, 0, Math.PI * 2); g.fill();
      // 星
      for (const s of STARS) {
        const tw = 0.5 + 0.5 * Math.sin(t * 1.5 + s.ph);
        g.fillStyle = `rgba(220,228,240,${s.b * tw})`;
        g.fillRect(s.x, s.y, 1.4, 1.4);
      }
    }

    function drawFarBank(g, t) {
      const yb = ySurf(D_FAR);
      /* ① 远山：一层低脊，**压得比岸还暗**（远处被空气压淡的是"对比"，不是"亮度"）。
         旧版把远山画得比水和岸都亮，于是整条对岸变成一道发灰的台阶横在画面中间；
         现在山只是岸线后面的一点起伏，靠**水汽雾带**（③）把远近揉开。 */
      g.fillStyle = '#0c1b2b';
      g.beginPath(); g.moveTo(-40, yb);
      for (const hh of HILLS) {
        g.quadraticCurveTo(hh.x, yb - hh.h * 1.5, hh.x + hh.w * 0.5, yb - hh.h * 0.85);
      }
      g.lineTo(Wp + 40, yb); g.closePath(); g.fill();
      /* ② 渡口的屋子（少数几间亮着灯，暖橙一点）*/
      for (const ho of HOUSES) {
        g.fillStyle = '#071320';
        const x = ho.x, w = ho.w, h = ho.h, hy = yb - h;
        g.beginPath();
        g.moveTo(x - w / 2, hy); g.lineTo(x, hy - h * 0.62); g.lineTo(x + w / 2, hy);
        g.lineTo(x + w / 2, yb); g.lineTo(x - w / 2, yb); g.closePath(); g.fill();
        if (ho.lit) {
          const lg = g.createRadialGradient(x, hy + h * 0.4, 0.5, x, hy + h * 0.4, 9);
          lg.addColorStop(0, 'rgba(255,196,110,0.55)');
          lg.addColorStop(1, 'rgba(255,196,110,0)');
          g.fillStyle = lg; g.beginPath(); g.arc(x, hy + h * 0.4, 9, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,214,140,0.8)'; g.fillRect(x - 1, hy + h * 0.3, 2, 2.4);
        }
      }
      /* ③ 真树线：针叶是三角、阔叶是球冠，高低差拉着画 */
      for (const tr of TREES) {
        const bx = tr.x, byT = yb + 1;
        g.fillStyle = '#081521';
        g.save(); g.translate(bx, byT); g.rotate(tr.tilt);
        if (tr.pine) {
          g.beginPath();
          g.moveTo(-tr.w / 2, 0); g.lineTo(0, -tr.h); g.lineTo(tr.w / 2, 0);
          g.closePath(); g.fill();
        } else {
          g.beginPath();
          g.ellipse(0, -tr.h * 0.42, tr.w * 0.62, tr.h * 0.5, 0, 0, Math.PI * 2);
          g.fill();
          g.fillRect(-tr.w * 0.09, -tr.h * 0.42, tr.w * 0.18, tr.h * 0.44);
        }
        g.restore();
      }
      /* ③ 水汽雾带：河面半夜起雾，把对岸的"硬边"揉掉 —— 一层很淡的横向渐变，
         上缘到岸线稍下，往下化开。有它，对岸才是"雾里的岸"，不是一条贴上去的色带。 */
      const y1 = yb + 26;
      const mgz = g.createLinearGradient(0, yb - 22, 0, y1);
      mgz.addColorStop(0, 'rgba(190,208,224,0.00)');
      mgz.addColorStop(0.52, 'rgba(190,208,224,0.13)');
      mgz.addColorStop(1, 'rgba(190,208,224,0.00)');
      g.fillStyle = mgz; g.fillRect(0, yb - 22, Wp, y1 - (yb - 22));
      /* ④ 湿岸线：水陆交界一道极淡的反光（不是硬黑线）*/
      g.strokeStyle = 'rgba(170,196,216,0.26)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, yb + 0.5); g.lineTo(Wp, yb + 0.5); g.stroke();
      // 渡口火把（暖橙）＋ 在水里的倒影
      for (const tr of TORCHES) {
        const p = projWorld(D_FAR, tr.lat, 0);
        const fl = 0.6 + 0.4 * Math.sin(t * 7 + tr.ph);
        g.fillStyle = 'rgba(255,178,77,0.30)'; g.fillRect(p.x - 0.4, p.y - 24, 0.8, 22);   // 火把的细杆
        const fg = g.createRadialGradient(p.x, p.y - 3, 1, p.x, p.y - 3, 15 * tr.sz);
        fg.addColorStop(0, `rgba(255,190,90,${0.9 * fl})`);
        fg.addColorStop(1, 'rgba(255,150,40,0)');
        g.fillStyle = fg; g.beginPath(); g.arc(p.x, p.y - 3, 15 * tr.sz, 0, Math.PI * 2); g.fill();
        /* 火把要有个**杆儿**：旧版只画了一小截亮条，看着像水上漂着的蜡烛。
           一根细竹竿插到岸上 + 顶上一点跳动的火苗，才读得出"渡口有人在举着火把等渡"。 */
        const fh = 9 * tr.sz;
        g.strokeStyle = 'rgba(20,16,10,0.95)'; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(p.x, p.y + 1); g.lineTo(p.x + tr.tilt, p.y - fh); g.stroke();
        const flameY = p.y - fh;
        g.fillStyle = `rgba(255,236,180,${0.96 * fl})`;
        g.beginPath();
        g.moveTo(p.x + tr.tilt - 1.6, flameY + 1.5);
        g.quadraticCurveTo(p.x + tr.tilt, flameY - 3.4 * fl, p.x + tr.tilt + 1.6, flameY + 1.5);
        g.closePath(); g.fill();
        // 倒影：从火苗正下方化开（旧版是一根 4px 宽的灰棍子，看着像插在水里的竹竿）
        const rg = g.createLinearGradient(0, p.y + 2, 0, p.y + 40);
        rg.addColorStop(0, `rgba(255,186,96,${0.30 * fl})`);
        rg.addColorStop(1, 'rgba(255,186,96,0)');
        g.fillStyle = rg;
        g.beginPath(); g.moveTo(p.x, p.y + 2); g.lineTo(p.x + 3.6, p.y + 40); g.lineTo(p.x - 3.6, p.y + 40);
        g.closePath(); g.fill();
      }
    }

    /* 渡船。**按米算尺寸**（px = 米 × FOCAL/d，和 kid / 岸线同一套针孔模型）。
       旧版写的是 `2.2 * s * b.w`，s=30 时半长 184px —— 一条船拉出 12 米长，
       画面上就是几块横在水面的黑色大方板（实测截图里最像"拼凑图形"的就是它）。
       真实渡船 4~5 米：halfwidth 60~75px，别超过人高太多。 */
    function drawBoats(g, t) {
      for (const b of BOATS) {
        const p = projWorld(30, b.lat, 0);
        const s = p.s;
        const lenM = 4.2 + b.w * 0.6;         // 4.2 ~ 5.9 米
        const hw = (lenM / 2) * s;            // 半长（px）
        const hh = 0.5 * s;                   // 参考高度：0.5 米
        /* 船身：**又细又长的一条**（高只有半长的 1/5 上下），两头微微上翘。
           旧版把船身画成"一条弧 + 一个穹顶"，合起来像展开的滑翔翼 —— 那是画面里最
           突兀的一块。夜里隔着水看渡船，本来就只有一条细黑线 + 一根桅 + 一点灯。 */
        g.fillStyle = '#05090e';
        g.beginPath();
        g.moveTo(p.x - hw, p.y - hh * 0.20);
        g.quadraticCurveTo(p.x, p.y + hh * 0.30, p.x + hw, p.y - hh * 0.20);
        g.quadraticCurveTo(p.x, p.y + hh * 0.02, p.x - hw, p.y - hh * 0.20);
        g.closePath(); g.fill();
        // 船头船尾各翘一小撮
        g.beginPath(); g.moveTo(p.x + hw * 0.72, p.y - hh * 0.24);
        g.quadraticCurveTo(p.x + hw * 0.95, p.y - hh * 0.9, p.x + hw, p.y - hh * 0.2);
        g.closePath(); g.fill();
        // 桅杆（细，几乎立在船上）
        const mastH = 0.9 * s;
        g.strokeStyle = '#060b11'; g.lineWidth = Math.max(0.8, 0.035 * s);
        g.beginPath(); g.moveTo(p.x, p.y - hh * 0.1); g.lineTo(p.x, p.y - hh * 0.1 - mastH); g.stroke();
        // 挂灯（一小点暖橙 + 光晕）
        const lx = p.x, ly = p.y - hh * 0.1 - mastH * 0.92;
        const lg = g.createRadialGradient(lx, ly, 0.5, lx, ly, 0.5 * s);
        lg.addColorStop(0, 'rgba(255,200,110,0.78)');
        lg.addColorStop(1, 'rgba(255,200,110,0)');
        g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, 0.5 * s, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,230,166,0.92)'; g.fillRect(lx - 0.9, ly - 0.9, 1.8, 2.1);
        // 水里的灯光倒影（一小段竖着化开的暖色）
        const rg = g.createLinearGradient(0, p.y, 0, p.y + 0.9 * s);
        rg.addColorStop(0, 'rgba(255,190,90,0.24)');
        rg.addColorStop(1, 'rgba(255,190,90,0)');
        g.fillStyle = rg;
        g.beginPath(); g.moveTo(lx, p.y); g.lineTo(lx + 2, p.y + 0.9 * s); g.lineTo(lx - 2, p.y + 0.9 * s);
        g.closePath(); g.fill();
      }
    }

    function drawWater(g, t) {
      const gw = g.createLinearGradient(0, ySurf(D_FAR), 0, Hp);
      gw.addColorStop(0, SC.waterFar);
      gw.addColorStop(0.4, '#0f1f31');
      gw.addColorStop(1, SC.waterNear);
      g.fillStyle = gw;
      g.fillRect(0, ySurf(D_FAR), Wp, Hp - ySurf(D_FAR));
      /* 月光路：月亮正下方一条碎光带（越近越宽、越散）。
         夜里一片均匀的黑，看不出"这是一条河"；有了这条光路，第一眼就认得出水面。 */
      const MX = 600;
      const mw0 = ySurf(D_FAR), mw1 = Hp;
      const mr = mulberry32(131);                       // 固定种子：位置固定、只让明暗随时间抖
      for (let i = 0; i < 60; i++) {
        const u = mr();                                 // 不规则铺，别排成一格一格的梯子
        const y = mw0 + Math.pow(u, 1.7) * (mw1 - mw0);
        const dashW = Math.max(5, 8 + u * 60) * (0.5 + mr());
        const a = (0.22 - u * 0.13) * (0.5 + 0.5 * Math.sin(t * 2.1 + i * 1.7));
        g.fillStyle = `rgba(206,222,236,${Math.max(0, a)})`;
        const off = (mr() * 2 - 1) * (3 + u * 16);
        g.beginPath();
        g.ellipse(MX + off, y, dashW / 2, 0.9, 0, 0, Math.PI * 2);
        g.fill();
      }
      drawBoats(g, t);
      // 透视波纹：越远波高/波长按比例收窄
      for (const d of WAVE_DS) {
        const y0 = ySurf(d);
        if (y0 > Hp + 10) continue;
        const s = FOCAL / d;
        const amp = Math.min(6, 0.04 * s);
        const wlen = Math.max(16, 1.2 * s);
        const a = 0.12 * clamp(1.8 - d / 40, 0.25, 1);
        g.strokeStyle = `rgba(150,180,200,${a})`;
        g.lineWidth = Math.max(0.6, 0.004 * s + 0.3);
        g.beginPath();
        for (let x = -10; x <= Wp + 10; x += 10) {
          const yy = y0 + Math.sin((x / wlen) * 6.283 + t * 1.2 + d * 0.7) * amp;
          x === -10 ? g.moveTo(x, yy) : g.lineTo(x, yy);
        }
        g.stroke();
      }
      // 近处压暗
      const gd = g.createLinearGradient(0, Hp - 90, 0, Hp);
      gd.addColorStop(0, 'rgba(4,8,14,0)');
      gd.addColorStop(1, 'rgba(4,8,14,0.5)');
      g.fillStyle = gd; g.fillRect(0, Hp - 90, Wp, 90);
    }

    function drawRipples(g) {
      for (const r of ripples) {
        const age = animT - r.t0;
        if (age < 0) continue;
        const k = clamp(age / 0.7, 0, 1);
        if (k >= 1) continue;
        const p = projWorld(r.d, r.lat, 0);
        const s = p.s;
        const rw = (0.1 + k * 1.6) * s;
        g.strokeStyle = `rgba(210,228,238,${0.5 * (1 - k)})`;
        g.lineWidth = Math.max(0.6, 0.006 * s);
        g.beginPath(); g.ellipse(p.x, p.y, rw, rw * 0.26, 0, 0, Math.PI * 2); g.stroke();
      }
    }

    function drawStoneFly(g) {
      const s = flying.sim;
      const pos = posAt(s, flying.t);
      const pr = projSim(pos, flying.latBase || 0);
      const dAt = D_NEAR + (pos.x - LX) * (D_FAR - D_NEAR) / (W - LX);
      const sh = projWorld(dAt, (pos.x - LX) * LATK + (flying.latBase || 0), 0);
      // 水面投影
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath(); g.ellipse(sh.x, sh.y, Math.max(1.5, 0.05 * sh.s), Math.max(0.8, 0.013 * sh.s), 0, 0, Math.PI * 2); g.fill();
      // 石片
      const col = flying.who === 'kid' ? SC.stoneKid : (flying.sim.kind === 'tile' ? SC.stoneTile : flying.sim.kind === 'round' ? SC.stoneRound : SC.stoneFlat);
      const rx = Math.max(1.6, 0.055 * pr.s), ry = Math.max(0.8, 0.022 * pr.s);
      g.save();
      g.translate(pr.x, pr.y);
      g.rotate(flying.t * 8);
      g.fillStyle = col;
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(10,14,20,0.5)'; g.lineWidth = 0.7; g.stroke();
      g.restore();
      // 跳数大字
      if (flying.counted > 0) {
        g.fillStyle = 'rgba(8,12,18,0.55)';
        g.fillRect(Wp / 2 - 46, 14, 92, 26);
        g.fillStyle = P.gold;
        g.font = 'bold 15px "Microsoft YaHei", sans-serif';
        g.textAlign = 'center';
        g.fillText(`${flying.counted} 跳`, Wp / 2, 33);
        g.textAlign = 'left';
      }
    }

    function drawEndMark(g) {
      const s = flying.sim;
      const pr = projSim({ x: s.endX, y: YW }, flying.latBase || 0);
      if (s.why === 'shatter') {
        g.fillStyle = P.seal; g.font = 'bold 13px "Microsoft YaHei", sans-serif';
        g.fillText('啪——碎了', pr.x - 24, pr.y - 12);
      } else if (s.why === 'sink') {
        g.fillStyle = 'rgba(220,228,236,0.8)'; g.font = '13px "Microsoft YaHei", sans-serif';
        g.fillText('咕咚。', pr.x - 14, pr.y - 10);
      } else {
        g.fillStyle = 'rgba(220,228,236,0.7)'; g.font = '12px "Microsoft YaHei", sans-serif';
        g.fillText('贴着水皮儿…', pr.x - 28, pr.y - 10);
      }
    }

    /** 脚边的石堆：三档石头分开堆，剩几颗画几颗（跟按钮上的数字同源 —— 同一个 pool）。 */
    function drawStonePile(g, cx, by) {
      // 石堆是"夜里脚边"的石头，不能画得跟白天一样白（scene 里最亮的是月亮和火把）
      const cols = { tile: '#6a6250', flat: '#776d58', round: '#514c42' };
      let k = 0;
      for (const id of KIND_LIST) {
        const n = Math.max(0, pool[id]);
        const px = cx + k * 46;
        // 影子
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.beginPath(); g.ellipse(px, by + 2, 20, 4.5, 0, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < Math.min(n, 4); i++) {
          const row = Math.floor(i / 2), col = i % 2;
          const sx = px - 8 + col * 15 + (row % 2) * 4;
          const sy = by - 3 - row * 5;
          const rx = id === 'round' ? 6 : id === 'tile' ? 7.5 : 7;
          const ry = id === 'round' ? 5 : id === 'tile' ? 2.4 : 3.2;
          g.fillStyle = cols[id];
          g.beginPath(); g.ellipse(sx, sy, rx, ry, id === 'flat' ? 0.16 : 0.3, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(8,10,14,0.55)'; g.lineWidth = 0.6; g.stroke();
        }
        if (n > 4) {
          g.fillStyle = 'rgba(214,224,236,0.75)'; g.font = '10px "Microsoft YaHei", sans-serif';
          g.fillText(`×${n}`, px + 12, by - 8);
        }
        k += 1;
      }
    }

    function drawKid(g, t, throwPhase) {
      const kx = Wp - 96, baseY = Hp - 2, hgt = 108, headR = 15;
      // 身体（宽肩窄腰的剪影，才看得出是个人）
      g.fillStyle = SC.kid;
      g.beginPath();
      g.moveTo(kx - 32, baseY);
      g.lineTo(kx - 22, baseY - hgt * 0.62);
      g.quadraticCurveTo(kx - 20, baseY - hgt * 0.78, kx, baseY - hgt * 0.8);
      g.quadraticCurveTo(kx + 20, baseY - hgt * 0.78, kx + 22, baseY - hgt * 0.62);
      g.lineTo(kx + 32, baseY);
      g.closePath(); g.fill();
      // 脖子 + 头
      g.fillRect(kx - 5, baseY - hgt * 0.88, 10, hgt * 0.12);
      const hy = baseY - hgt * 0.86 - headR * 0.75;
      g.beginPath(); g.arc(kx, hy, headR, 0, Math.PI * 2); g.fill();
      // 帽檐
      g.fillRect(kx - headR - 4, hy - headR * 0.55, (headR + 4) * 2, 4.5);
      // 手臂（扔：从后摆到前甩）
      const shx = kx - 14, shy = baseY - hgt * 0.72;
      const ang = throwPhase == null ? -0.5 : (-2.2 + throwPhase * 1.9);
      g.strokeStyle = SC.kid; g.lineWidth = 10; g.lineCap = 'round';
      g.beginPath(); g.moveTo(shx, shy); g.lineTo(shx + Math.cos(ang) * 32, shy + Math.sin(ang) * 32); g.stroke();
      // 暖色轮廓光（渡口火把的反光）
      g.strokeStyle = 'rgba(220,170,90,0.26)'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(kx - 30, baseY - 2);
      g.lineTo(kx - 22, baseY - hgt * 0.6);
      g.quadraticCurveTo(kx - 20, baseY - hgt * 0.76, kx, baseY - hgt * 0.79);
      g.quadraticCurveTo(kx + 20, baseY - hgt * 0.76, kx + 22, baseY - hgt * 0.6);
      g.lineTo(kx + 30, baseY - 2);
      g.stroke();
    }

    function drawHand(g, t, hasStone, stoneKind, pullPx) {
      const Lp = projWorld(D_NEAR, 0, 0);
      const hx = Lp.x, hy = Lp.y + 4;
      /* 小臂：从画面下方斜伸上来（不是一根正立的口袋）。
         旧版是"梯形 + 一个椭圆 + 一个椭圆拇指"，读出来就是三个色块 —— 于是像拼贴。
         现在按"掌 + 四指 + 拇指掐着石片"的解剖层次画：指节分开、边缘有光，才认得出是只手。 */
      const lean = pullPx * 0.35;                 // 蓄力时手往后收
      g.fillStyle = SC.sleeve;
      g.beginPath();
      g.moveTo(hx - 30 + lean * 0.4, Hp);
      g.lineTo(hx - 14 + lean, hy + 10);
      g.lineTo(hx + 14 + lean, hy + 10);
      g.lineTo(hx + 32 + lean * 0.4, Hp);
      g.closePath(); g.fill();
      // 袖口（布纹：两道人字褶）
      g.fillStyle = '#1c1812'; g.fillRect(hx - 17 + lean, hy + 4, 34, 9);
      g.strokeStyle = 'rgba(120,104,74,0.5)'; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(hx - 12 + lean, hy + 6); g.lineTo(hx + lean, hy + 11); g.lineTo(hx + 12 + lean, hy + 6);
      g.stroke();
      const px0 = hx + lean * 1.2;
      // 四指：并排弯着的指节（先画，被拇指/石片压住一部分）
      for (let i = 0; i < 4; i++) {
        const fx = px0 - 8 + i * 5.4, fy = hy - 4 + Math.abs(i - 1.5) * 1.4;
        g.fillStyle = i % 2 ? SC.hand : '#413826';
        g.beginPath(); g.ellipse(fx, fy, 2.9, 6.2, -0.22, 0, Math.PI * 2); g.fill();
      }
      // 掌
      g.fillStyle = SC.hand;
      g.beginPath(); g.ellipse(px0, hy + 2, 12.5, 9.5, -0.1, 0, Math.PI * 2); g.fill();
      // 拇指（掐在石片另一侧）
      g.fillStyle = '#463c2a';
      g.beginPath(); g.ellipse(px0 + 10, hy - 7, 4.6, 7.4, 0.42, 0, Math.PI * 2); g.fill();
      // 暖色轮廓光（火把的反光只落在上缘）
      g.strokeStyle = 'rgba(224,176,96,0.3)'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(px0, hy + 2, 12.5, 9.5, -0.1, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      if (hasStone) drawStoneAt(g, px0 + 3, hy - 8 + pullPx, stoneKind, 1.1);
    }

    function drawForeground(g, t) {
      const by = Math.max(ySurf(D_NEAR) - 6, Hp - 44);
      const bg = g.createLinearGradient(0, by, 0, Hp);
      bg.addColorStop(0, SC.beachTop);
      bg.addColorStop(1, SC.beachLow);
      g.fillStyle = bg;
      g.fillRect(0, by, Wp, Hp - by);
      // 卵石滩
      for (const p of PEBBLES) {
        const y = by + p.ty * (Hp - by);
        g.fillStyle = [SC.pebbleA, SC.pebbleB, SC.pebbleC][Math.floor(p.c * 3) % 3];
        g.beginPath(); g.ellipse(p.x, y, p.rx, p.ry, p.c, 0, Math.PI * 2); g.fill();
      }
      /* 石堆：把"还剩几颗、什么石头"画进场景里（左前方的卵石滩上）。
         画面里看得见石堆，玩家才不是在对着三行按钮做选择。 */
      drawStonePile(g, 118, Hp - 14);
      // 娃（永远在身边）；你的手（拿石片时）
      let tp = 0;
      if (phase === 'kid') tp = clamp((animT - kidThrowStart) / 0.6, 0, 1);
      else if (flying && flying.who === 'kid') tp = 1;
      drawKid(g, t, tp);
      /* 手**只在捏着石片的时候画**：空手时那只手（画面上就一团棕色）读不出是什么，
         留着反而是块贴图。拿到石头它再伸进来，动作才有由来。 */
      const handHasStone = (phase === 'pick' || phase === 'aim') && !!picked;
      if (handHasStone) {
        const pull = (phase === 'aim' && aim) ? clamp(aimVec().len * 0.2, 0, 22) : 0;
        drawHand(g, t, true, picked, pull);
      }
    }

    /* 甜区（出手角）：实测 6~24° 都能跳到 8 跳以上，14~18° 最好（9 跳）。
       尺子上把这一段染成金色，玩家一眼就知道"该压到哪儿"。 */
    const SWEET_LO = 6, SWEET_HI = 24;
    const DEG_MAX = K.DRAG_DEG_CAP;

    function drawAim(g, t) {
      const v = aimVec();
      const usable = v.len >= 10 && v.deg >= 2;
      const sweet = usable && v.deg >= SWEET_LO && v.deg <= SWEET_HI;

      /* ── 角度尺：一条横条，0..48°，甜区染金，指针是当前出手角 ──
         只画一条虚线箭头时，玩家看不出 20° 和 40° 差在哪（箭头几乎一样），
         于是"怎么甩都打不起来"还不知道为什么。换成尺子，甜区是看得见的目标。 */
      const bx = Wp / 2 - 96, by = 70, bw = 192, bh = 12;
      g.fillStyle = 'rgba(8,12,18,0.66)'; g.fillRect(bx - 6, by - 6, bw + 12, bh + 26);
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(bx, by, bw, bh);
      const sx0 = bx + (SWEET_LO / DEG_MAX) * bw, sx1 = bx + (SWEET_HI / DEG_MAX) * bw;
      g.fillStyle = sweet ? 'rgba(232,192,115,0.85)' : 'rgba(232,192,115,0.34)';
      g.fillRect(sx0, by, sx1 - sx0, bh);
      if (usable) {
        const px = bx + clamp(v.deg / DEG_MAX, 0, 1) * bw;
        g.fillStyle = sweet ? '#ffe6a8' : 'rgba(226,232,240,0.85)';
        g.fillRect(px - 1.5, by - 3, 3, bh + 6);
      }
      g.fillStyle = 'rgba(214,224,236,0.55)'; g.font = '10px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('甜区', (sx0 + sx1) / 2, by + bh + 10);
      g.textAlign = 'left';

      // 力道条（就画在角度尺下面，一条就够，别再堆字）
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(bx, by + bh + 14, bw, 5);
      const isTile = picked === 'tile';
      const danger = isTile && v.pow >= 0.94;
      g.fillStyle = danger ? 'rgba(200,60,50,0.9)' : 'rgba(150,190,220,0.75)';
      g.fillRect(bx, by + bh + 14, bw * clamp(v.pow, 0, 1), 5);
      if (isTile) {
        // 瓦片的碎线：画一道红刻痕，**拉过它就碎**（这是它"跳得最凶但要收着"的那条线）
        const dl = bx + 0.935 * bw;
        g.fillStyle = 'rgba(200,60,50,0.95)'; g.fillRect(dl - 1, by + bh + 12, 2, 9);
      }

      // 读数胶囊：居中放在顶栏下一行，避开左上/右上两块 HUD（曾与比分叠字）
      let label;
      if (!usable) label = '按住往后下方拖…';
      else if (danger) label = '过了碎线——瓦片会碎在河面上';
      else if (v.deg > SWEET_HI) label = '压得太陡，往下压平一点';
      else if (v.deg < SWEET_LO) label = '太平了，稍微抬一点';
      else label = `出手角 ${v.deg.toFixed(0)}° · 力道 ${Math.round(v.pow * 100)}%`;
      const lw = 200;
      g.fillStyle = 'rgba(8,12,18,0.62)'; g.fillRect(Wp / 2 - lw / 2, 40, lw, 22);
      g.fillStyle = danger ? '#ff9a8a' : (usable ? P.ink : 'rgba(242,234,214,.6)');
      g.font = '12px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText(label, Wp / 2, 55);
      g.textAlign = 'left';

      // 手里被拉回来的石片（蓄势）
      const Lp = projWorld(D_NEAR, 0, 0);
      const pull = clamp(v.len * 0.2, 0, 22);
      drawStoneAt(g, Lp.x, Lp.y - 4 + pull, picked || 'flat', 1.1);
    }

    function drawHud(g) {
      // 左上：这是哪儿
      g.fillStyle = 'rgba(8,12,18,0.5)'; g.fillRect(12, 12, 224, 20);
      g.fillStyle = 'rgba(214,224,236,0.85)'; g.font = '12px "Microsoft YaHei", serif';
      g.fillText('于都河 · 夜 · 等渡的半宿', 20, 26);
      // 右上：比分
      g.fillStyle = 'rgba(8,12,18,0.5)'; g.fillRect(Wp - 150, 12, 138, 20);
      g.fillStyle = 'rgba(242,234,214,0.92)'; g.font = '12px "Microsoft YaHei", sans-serif';
      g.fillText(`你 ${you}   娃 ${kid}`, Wp - 142, 26);
    }

    function draw(t) {
      const g = ctx;
      g.clearRect(0, 0, Wp, Hp);
      drawSky(g, t);
      drawFarBank(g, t);
      drawWater(g, t);
      drawRipples(g);
      if (flying && !flying.done) drawStoneFly(g);
      else if (flying && flying.done) drawEndMark(g);
      drawForeground(g, t);
      if (phase === 'aim' && aim) drawAim(g, t);
      drawHud(g);
    }

    /* ── 起跑 ── */
    renderActs();
    renderLead();
    writeData();
    draw(animT);
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  });
}

/* ══════════════ 调试台规格 ═══════════════ */
export const SKIM_MINIGAMES = [
  {
    id: 'skim-v3',
    title: '打水漂',
    family: '第一人称 · 甩石片',
    act: 'act0 于都河',
    note: 'v3（2026-09-18）：保留 v2 的真实物理骨架（六颗石头你先挑、弹弓手势、真弹跳、三档失败线），'
      + '但**改为第一人称站在贡水河边**：镜头是你的眼睛，脚边是卵石滩，画面下方是捏着石片的手，'
      + '对面是夜色里的于都河与渡口火把船影；石片**向远处透视**地一路点过去，每次落水一圈涟漪，'
      + '收进对岸浅滩才慢慢看清。娃站在你身边（看得见）。<br>'
      + '<b>三个决策</b>：①<b>拿哪颗</b>——薄瓦片跳最凶但满力就碎、扁石板稳、圆卵石跳不动，'
      + '你每轮先挑、可把圆卵石躲给娃；②<b>怎么甩</b>——在画布上按住、往后下方拖、松手，'
      + '拖长=力道、方向=出手角，<b>约 15–20° 跳得最多</b>，高于 26° 扎进水里、低于 8° 贴水皮儿；'
      + '③<b>看它跳</b>——每落一次掉一截速度。<br>'
      + '失败线：三轮总跳数<b>输给娃（lose）</b>；三颗<b>全沉全碎一个没跳（duck，0.08）</b>。',
    states: ['pick', 'aim', 'fly', 'kid', 'done'],
    actions: ['pick-tile', 'pick-flat', 'pick-round', 'aim'],
    // 2026-09-18：**收尾交给模型**（原来标 noAi，剧情里走固定效果、一句人话都没有）。
    // 局内该调的照调（见各支自己的 DECIDE）；这一次是主线的 minigame_review，写收尾叙事。
    noAi: false,
    noAiNote: '手感类玩法：局内 0 次模型调用，赢/输评价交主线 minigame_review。',
    run: (host, o = {}) => runSkim(host, o),
  },
];
