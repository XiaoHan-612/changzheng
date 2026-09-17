/**
 * 《收拢》—— 湘江东岸，拂晓之前（**重做版 · 单独开发，未接入主线**）
 *
 * ── 为什么换掉「担架急送」这个玩法 ──
 *   act1 湘江这一章**已经有两个"抬着人跑"的玩法**了：
 *     · 热点 `escort`「担架队 · 护送伤员」（choice，且是本章 forced）
 *     · 未接线的 `stretcher`「担架急送」（story 文件里的 run/duck）
 *   再补一个"在炮火间隙里抢时间"就是第三遍同一件事 —— 而且和另外三支重做版
 *   一样落在"预警窗口 → 按一下"的老骨架上（用户 2026-09-16 否掉的正是它）。
 *
 *   更要紧的是：**这一章的问题不是"怎么跑得快"，是"队伍为什么还在"**。
 *   `acts.json` act1：subtitle「代价」、theme「队伍为何还在」。而湘江史实里，
 *   12 月 1 日主力过江之后，**屏山渡、大坪、界首相继失守，凤凰嘴是最后一个渡口**，
 *   红 34 师（"后卫的后卫"）被隔在东岸，全师几乎打光。真正的问题发生在**天亮之前**：
 *   渡口还在，东岸还有人，**你拿什么把队伍接回来**。
 *   → 所以这一支不做"急送"，做**判断**：人在哪、值不值得去、什么时候该停止找人开始渡人。
 *
 * ── 这一支的骨架：回合制的"判断 × 时间账"（与其他三支都不同）──
 *   玩家**反复做的那件事**是「**读线索 → 决定这一刻做什么**」：
 *   一共 8 刻、每刻只能做一件事（搜一处／渡一趟）。没有连续量、没有时机窗口、
 *   没有空间配平 —— 每一刻都是一次离散的信息判断。
 *   对照：
 *     · 陡坡 v3 —— 按住/松开的**连续**拉锯（张力越拉越危险）
 *     · 泸定 v2 —— 两个**互斥姿态**在时间轴上的**排程**（贴链慢而稳 / 直冲快而折人）
 *     · 浮桥 —— 不可再生材料在**空间**上的配平（往哪一段投料）
 *     · 收拢（本支）—— **离散回合**里的**信息判断**：线索可信度、旁证的排除法、
 *       "继续找"与"开始渡"之间的时间账
 *
 *   三条代价线写死，**一条都不掷骰子**（随机只决定"是哪一个方向"，不决定"会不会发生"）：
 *     ① **刻**：8 刻用完 = 天亮。**这 8 刻正好等于最优线，一刻余量都没有**：
 *        搜出 4 个有人点最少 5 刻（其中一处有敌情，要两刻），18 人过江要 3 趟 = 3 刻。
 *        → 白搜一处（1 刻）= 少渡一趟 = **少 6 个人**。
 *     ② **"搜"和"渡"抢同一本账**：8 个方向、8 刻 —— 你**可以把每一刻都花在搜上**，
 *        然后天亮，一个人也没过去（`crossed === 0`）。**手勤不等于把人带回来。**
 *     ③ **有敌情的方向**：派人进去要两刻（人都接得回来），在外面喊只要一刻
 *        （**只回来一半**）。两刻还是半批人 —— 这笔账要在天黑里算。
 *
 *   ⚠️ 原本取 9 刻，模拟第一轮就否掉了：多出来的那 1 刻等于**白送一次误判**
 *      （白搜一处还能拿到 18/18 满分），失败边就被抹平了。**预算必须与最优线等长。**
 *
 *   难度是**模拟出来的**，不是猜的：`tests/manual/sim-rally.mjs` 驱动浏览器里的真实现跑
 *   7 套打法 × 4 个种子。数字见 docs/HANDOFF-RALLY.md。
 *   ⚠️ 初版设计过一套"小组"资源（每搜一处耗一个），模拟第一轮就否掉了它：
 *      设了搜索次数上限之后，"贪搜"的玩家会被**卡住**搜不动，反而**被迫**去渡 —— 越浪费越安全。
 *      **失败的边必须由时间画，不能由配额画。**
 *
 * ── 画面：画作当场景（沿用陡坡 v3 / 泸定 v2 定下的路线）──
 *   `assets/scenes/xiangjiang_night.jpg` 画的**就是这一夜**：夜色、江面、宿营地当中那堆火。
 *   act1 的 `cutAlt` 正是这张图。所以**一个像素都不重画** —— 取画作 y∈[290,872]
 *   一条横带原样铺上（`CROP`），其余全是覆盖层：8 个方向灯、渡口、
 *   方向灯的状态色、结算时留在东岸的人。坐标是**画作像素量出来的**，不是估的。
 *   ⚠️ 这张画四边有**撕纸边**（左侧 x<6% 是米黄/棕褐，所以它也是"暖 + 亮"的）。
 *      方向灯落在 x∈[8.5%, 88%]、渡口 x=7.2% —— 全在暗画面上，不压纸边。
 *      量坐标时踩过一次：把"左边缘那一列暖亮像素"当成了画里的火，其实量的是撕纸边。
 *
 * ── 接不接 AI：不接（`noAi: true`）──
 *   8 刻、每刻一次判断，**没有一秒钟能让玩家站着等模型**（用户 2026-09-15 定的硬规矩：
 *   任何"玩家要站着等"的位置都不许调模型）。结算判词按结局档位写死五句。
 *   主线 `minigame_review` 接线后接管那一段话。
 *
 * 玩法 id：`rally-river`（**故意不复用 `stretcher`** —— 调试台按 id 查表，撞 id 会取到旧那份）。
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
    if (v === null || v === undefined) continue;
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

/* ══════════════ 几何：全部用**画作像素**（与 xiangjiang_night.jpg 一一对应）══════════════ */

export const PAINT = { w: 1280, h: 872 };                     // 原画尺寸
export const PLATE = '/assets/scenes/xiangjiang_night.jpg';
/**
 * 取景带：原画 y ∈ [290, 872]（上边 y<290 是画作的米黄纸边，裁掉）。
 * 这条带子里有：横贯中部的江面暗带、宿营地、当中那堆火（x≈45%）、下方江滩。
 * 舞台 `aspect-ratio: 2.2` → 显示高 = 1280/2.2 ≈ 581.8 画作像素高；
 * 原图按舞台宽缩放后高 388.4，故需上移 290×(570/1280)=129.1 → 占自身高 33.26%。
 * 这个比例**与缩放无关**（宽高同比），所以直接 `translateY(-33.26%)`。
 */
export const CROP = { aspect: 2.2, y0: 290 };
export const CROP_SHIFT_PCT = -(CROP.y0 / PAINT.h) * 100;      // -33.26

/** 8 个方向灯在取景带里的位置（%，相对**取景带**，不是原画）：沿江滩一线铺开。 */
export const PINS = [
  { x: 8.5, y: 79.0 },    // 芦苇荡
  { x: 19.5, y: 73.0 },   // 断墙院
  { x: 30.5, y: 70.0 },   // 松林口
  { x: 41.5, y: 74.0 },   // 江心沙洲
  { x: 52.5, y: 70.0 },   // 上游浅滩
  { x: 63.5, y: 74.0 },   // 土地庙
  { x: 74.5, y: 70.5 },   // 木桥残桩
  { x: 88.0, y: 78.0 },   // 打谷场
];
/** 渡口：落在取景带左上那片暗水面（x=7.2% 已在左侧撕纸边之外，纸上压字读不出来）。 */
export const DOCK = { x: 7.2, y: 39.5 };

/* ══════════════ 规则常量（改这里 = 改难度；文档里的常量表要同步）══════════════ */

export const RALLY = {
  DAWN: 8,            // 刻：每刻只能做一件事，用完天亮（= 最优线正好用满，**零余量**）
  SPOTS: 8,           // 方向数（= 理论上能把每一刻都花在搜上的次数）
  FERRY_CAP: 6,       // 渡一趟最多送过江的人数
  PEOPLE: [3, 4, 5, 6], // 分布在 4 个"有人"方向 → 东岸共 18 人
  TRUST_N: 2,         // 「可信」线索的方向（必然有人）
  VAGUE_N: 4,         // 「存疑」线索的方向（其中 2 个有人）
  QUIET_N: 2,         // 没人提过的方向（必然无人）
  WARN_RUSH: 2,       // 有敌情的方向：派人进去 —— 两刻，人都接得回来
  WARN_CALL: 1,       // 有敌情的方向：在外面喊 —— 一刻，只回来一半
};

export const NAMES = ['芦苇荡', '断墙院', '松林口', '江心沙洲', '上游浅滩', '土地庙', '木桥残桩', '打谷场'];

const TRUST_SRC = [
  { who: '通信员', line: '我亲眼看见的，那边还有人' },
  { who: '二班长', line: '那边有我们的人在趴着，别漏了' },
];
const VAGUE_HIT = [
  { who: '老乡', line: '天黑前听见那边有人喊' },
  { who: '一个孩子', line: '他说那后头藏着人，不敢过去' },
];
const VAGUE_MISS = [
  { who: '轻伤员', line: '他说那边没动静，兴许是我记错了' },
  { who: '炊事员', line: '那边像是空的，我没敢往里去' },
];
const QUIET_SRC = [{ who: '没人提过', line: '没听谁说起过这里' }];
const WARN_FLAVOR = {
  flare: '那边有手电筒的光在晃',
  motor: '江上有马达声，是敌人的汽船',
  dogs: '那边的狗叫得凶',
};
const WARN_KINDS = ['flare', 'motor', 'dogs'];

/**
 * 生成一局。**纯函数**（给定 seed 结果确定），单测与模拟脚本直接 import 它。
 * 结构写死：2 可信(有人) + 4 存疑(2 有人 2 无人) + 2 没人提过(无人) = 8 个方向、18 人。
 */
export function genBoard(seed) {
  const rnd = mulberry32(seed);
  const idx = [0, 1, 2, 3, 4, 5, 6, 7];
  // Fisher–Yates（自己写，别依赖 Array.sort 的随机比较器）
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const trustAt = idx.slice(0, RALLY.TRUST_N);
  const vagueAt = idx.slice(RALLY.TRUST_N, RALLY.TRUST_N + RALLY.VAGUE_N);
  const quietAt = idx.slice(RALLY.TRUST_N + RALLY.VAGUE_N);
  const hitVague = vagueAt.slice(0, 2);
  const withPeople = [...trustAt, ...hitVague];                  // 4 个有人点
  const counts = RALLY.PEOPLE.slice();
  for (let i = counts.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [counts[i], counts[j]] = [counts[j], counts[i]];
  }
  // 敌情只落在"有人"的方向上（保证冒险换得到人 —— 否则那条线就变成纯惩罚）
  const warnAt = withPeople[Math.floor(rnd() * withPeople.length)];
  const warnKind = WARN_KINDS[Math.floor(rnd() * WARN_KINDS.length)];

  const spots = NAMES.map((name, i) => {
    const isTrust = trustAt.includes(i);
    const isVague = vagueAt.includes(i);
    const hasPeople = withPeople.includes(i);
    const src = isTrust
      ? TRUST_SRC[Math.min(trustAt.indexOf(i), TRUST_SRC.length - 1)]
      : isVague
        ? (hasPeople ? VAGUE_HIT : VAGUE_MISS)[Math.min(vagueAt.indexOf(i), 1)]
        : QUIET_SRC[0];
    return {
      i, name,
      role: isTrust ? 'trust' : isVague ? 'vague' : 'quiet',
      people: hasPeople ? counts[withPeople.indexOf(i)] : 0,
      enemy: i === warnAt ? warnKind : '',
      src,
      // 线索等级：可信 = 一定有人（开局就按"有人"给他），存疑/没人提过 = 未知
      known: isTrust ? 'y' : 'u',
      searched: false, got: 0,
    };
  });

  // 旁证顺序：先把"存疑"里那些**空**的判掉（那才是玩家最需要排除的），再判有人的，最后判没人提过的
  const revealQueue = [
    ...vagueAt.filter((i) => !withPeople.includes(i)),
    ...hitVague,
    ...quietAt,
  ];

  return {
    seed, spots, revealQueue,
    totalEast: counts.reduce((a, b) => a + b, 0),               // 18
    warnAt, warnKind, trustAt, vagueAt, quietAt, withPeople,
  };
}

/* ══════════════ 一局 ══════════════ */

const OUTCOME_TEXT = {
  full: '天亮时，名册上的人一个不少。渡口最后一趟船压得低低的。',
  high: '大半都过了江。留在东岸的是几个走不动的 —— 他们会往山里去。',
  mid: '过了多一半。天亮前那几趟太紧，江边还排着队。',
  low: '只接回来一小半。东岸还有人等着天亮，可渡口已经没了。',
  none: '天亮了，一个也没过江。你们留在东岸，成了另一支断后的队伍。',
};

/**
 * @param {HTMLElement} container 挂载点
 * @param {{id?:string, seed?:number, stats?:HTMLElement}} [opts]
 * @returns {Promise<{score:number, detail:object, summary:string}>}
 */
export function runRally(container, opts = {}) {
  const id = opts.id || 'rally-river';
  const seed = Number.isFinite(opts.seed) ? (opts.seed >>> 0) : ((Date.now() ^ 0x5f3a9c1d) >>> 0);
  const B = genBoard(seed);

  const st = {
    seed,
    ticks: RALLY.DAWN,
    gathered: 0,
    crossed: 0,
    reveal: B.revealQueue.slice(),
    done: false,
    outcome: 'none',
    log: [],
    last: '',
  };
  const spots = B.spots.map((s) => ({ ...s }));

  const ac = new AbortController();
  const sig = { signal: ac.signal };

  /* ── DOM 骨架 ───────────────────────────────────────────────── */
  const lead = h('p', { class: 'smini13-lead' });
  const hud = h('div', { class: 'smini13-hud' });
  const hudRow = h('div', { class: 'r-hud' });
  const dawnBar = h('div', { class: 'smini13-dawn' }, [h('i')]);
  const chipDawn = h('span', { class: 'r-chip' });
  const chipBank = h('span', { class: 'r-chip' });
  const chipCross = h('span', { class: 'r-chip' });
  const chipOut = h('span', { class: 'r-chip' });
  hudRow.append(chipDawn, dawnBar, chipBank, chipCross, chipOut);

  const scene = h('div', { class: 'smini13-scene', style: `aspect-ratio:${CROP.aspect}` });
  const plate = h('img', { class: 'smini13-plate', src: PLATE, alt: '', draggable: 'false' });
  plate.style.transform = `translateY(${CROP_SHIFT_PCT.toFixed(2)}%)`;
  const pins = h('div', { class: 'smini13-pins', 'aria-hidden': 'true' });
  scene.append(plate, pins);

  const board = h('div', { class: 'smini13-board' });
  const ferryBtn = h('button', {
    type: 'button', class: 'smini13-ferry', 'data-mini-action': 'ferry',
  });
  const ferryBox = h('div', { class: 'smini13-ferrybox' }, [ferryBtn]);
  const fbEl = h('div', { class: 'smini13-fb' });
  const hintEl = h('p', { class: 'smini13-hint' });

  hud.append(hudRow);
  const root = h('div', { class: 'smini13-wrap' }, [lead, hud, scene, board, ferryBox, fbEl, hintEl]);
  mount(container, root);

  /* ── 覆盖层：8 个方向灯 + 渡口 ───────────────────────────────── */
  const pinEls = spots.map((s, i) => {
    const el = h('div', { class: 'smini13-pin' }, [
      h('span', { class: 'dot' }), h('span', { class: 'nm', text: s.name }),
    ]);
    el.style.left = `${PINS[i].x}%`;
    el.style.top = `${PINS[i].y}%`;
    return el;
  });
  const dockEl = h('div', { class: 'smini13-pin is-dock' }, [
    h('span', { class: 'dot' }), h('span', { class: 'nm', text: '渡口' }),
  ]);
  dockEl.style.left = `${DOCK.x}%`;
  dockEl.style.top = `${DOCK.y}%`;
  pins.append(...pinEls, dockEl);

  /* ── 情报板：每个方向一行（行本身是按钮）──────────────────────── */
  const rowEls = spots.map((s, i) => {
    const lamp = h('span', { class: 'r-lamp' });
    const badge = h('span', { class: 'r-badge' });
    const name = h('span', { class: 'r-name', text: s.name });
    const clue = h('span', { class: 'r-clue' });
    const go = h('span', { class: 'r-go', text: '搜' });
    const btn = h('button', {
      type: 'button', class: 'smini13-row', 'data-mini-action': 'search', 'data-dir': String(i),
    }, [lamp, name, badge, clue, go]);
    const item = h('div', { class: 'smini13-item' }, [btn]);
    let echo = null;
    if (s.enemy) {
      echo = h('button', {
        type: 'button', class: 'smini13-echo', 'data-mini-action': 'callout', 'data-dir': String(i),
        text: `在外面喊他们过来（${RALLY.WARN_CALL} 刻 · 只回来一半）`,
      });
      item.appendChild(echo);
    }
    return { btn, badge, clue, lamp, go, item, echo };
  });
  board.append(...rowEls.map((r) => r.item));

  /* ── 契约：随局面更新的可观测面 ─────────────────────────────── */
  function writeDataset() {
    const d = container.dataset;
    d.mini = id;
    d.miniState = st.done ? 'done' : 'play';
    d.miniTicks = String(st.ticks);
    d.miniGathered = String(st.gathered);
    d.miniCrossed = String(st.crossed);
    d.miniOut = String(B.totalEast - st.crossed);        // 东岸还没过江的总数（含没找到的）
    d.miniTotal = String(B.totalEast);
    d.miniFerryCap = String(RALLY.FERRY_CAP);
    d.miniTruth = spots.map((s) => s.people).join(',');  // 自动化驱动用的真值面（同 miniTension 的性质）
    d.miniRole = spots.map((s) => s.role).join(',');
    d.miniEnemy = spots.map((s) => (s.enemy ? '1' : '0')).join(',');
    d.miniKnown = spots.map((s) => (s.searched ? 's' : s.known)).join(',');
    d.miniOutcome = st.done ? st.outcome : 'playing';
    d.miniJudgeFrom = 'fixed';
    d.miniLast = st.last || '';
  }

  /* ── 渲染 ──────────────────────────────────────────────────── */
  function renderBoard() {
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const R = rowEls[i];
      let badge, cls = `smini13-row r-${s.role}`;
      if (s.searched) {
        badge = s.got > 0 ? `已收拢 ${s.got} 人` : '空的';
        cls += s.got > 0 ? ' is-done' : ' is-empty';
      } else if (s.known === 'y') {
        badge = '有人'; cls += ' is-known';
      } else if (s.known === 'n') {
        badge = '空的'; cls += ' is-empty';
      } else if (s.role === 'vague') {
        badge = '存疑'; cls += ' is-unknown';
      } else {
        badge = '没人提过'; cls += ' is-unknown';
      }
      if (s.enemy && !s.searched) cls += ' is-warn';
      R.btn.className = cls;
      R.badge.textContent = badge;
      R.badge.className = `r-badge${s.known === 'y' && !s.searched ? ' on' : ''}${s.known === 'n' && !s.searched ? ' no' : ''}`;
      const line = `${s.src.who}：${s.src.line}`;
      R.clue.textContent = s.enemy && !s.searched ? `${line} · ${WARN_FLAVOR[s.enemy]}` : line;
      R.lamp.className = `r-lamp${s.searched ? (s.got > 0 ? ' got' : ' nil') : s.known === 'y' ? ' hot' : ''}`;
      // 契约：不可操作的行要连 data-mini-action 一起摘掉（只 disabled 不够）
      if (st.done || s.searched) {
        R.btn.removeAttribute('data-mini-action');
        R.go.textContent = s.searched ? '—' : '搜';
      } else {
        R.btn.setAttribute('data-mini-action', 'search');
        R.go.textContent = s.enemy ? `搜 ·${RALLY.WARN_RUSH} 刻` : '搜 ·1 刻';
      }
      if (R.echo) {
        if (st.done || s.searched || s.known === 'n') R.echo.removeAttribute('data-mini-action');
        else R.echo.setAttribute('data-mini-action', 'callout');
      }
      // 方向灯
      const p = pinEls[i];
      let pcls = 'smini13-pin';
      if (s.searched) pcls += s.got > 0 ? ' is-done' : ' is-empty';
      else if (s.known === 'y') pcls += ' is-known';
      else if (s.known === 'n') pcls += ' is-out';
      else pcls += ' is-unknown';
      if (s.enemy && !s.searched) pcls += ' is-warn';
      p.className = pcls;
    }
  }

  function renderHud() {
    const out = B.totalEast - st.crossed;
    chipDawn.className = `r-chip${st.ticks <= 2 ? ' low' : ''}`;
    chipDawn.innerHTML = `天光 <b>${st.ticks}</b> 刻`;
    dawnBar.className = `smini13-dawn${st.ticks <= 2 ? ' low' : ''}`;
    dawnBar.firstChild.style.width = `${(st.ticks / RALLY.DAWN) * 100}%`;
    chipBank.className = `r-chip${st.gathered > 0 ? ' on' : ''}`;
    chipBank.innerHTML = `江边待渡 <b>${st.gathered}</b>`;
    chipCross.innerHTML = `已过江 <b>${st.crossed}</b>/${B.totalEast}`;
    chipOut.className = `r-chip${out > 0 ? ' low' : ''}`;
    chipOut.innerHTML = `东岸还剩 <b>${out}</b>`;
    // ⚠️ 渡口**一直可点**（哪怕江边没人）——"什么时候开始渡"就是这一支的决策之一，
    //    把按钮禁用掉等于把这个决策拿掉。契约这边也省事：不可操作 ⇔ 不带 data-mini-action。
    if (st.done) ferryBtn.removeAttribute('data-mini-action');
    else ferryBtn.setAttribute('data-mini-action', 'ferry');
    ferryBtn.innerHTML = st.gathered > 0
      ? `渡一趟 · 送 ${Math.min(RALLY.FERRY_CAP, st.gathered)} 人过江（1 刻）`
      : `渡一趟（1 刻 · 一趟最多 ${RALLY.FERRY_CAP} 人）`;
    stats(opts.stats, [
      ['天光', `${st.ticks} 刻`],
      ['江边', `${st.gathered}`],
      ['已过江', `${st.crossed}/${B.totalEast}`],
      ['东岸还剩', `${out}`],
    ]);
  }

  function renderLead() {
    lead.innerHTML = st.done
      ? `天亮之前，渡口是开着的。东岸原本有 <b>${B.totalEast}</b> 个人。`
      : `拂晓前，渡口还开着。全连还有 <b>${B.totalEast}</b> 个人在东岸。`
        + `<br><span class="dim">一共 <b>${RALLY.DAWN}</b> 刻，每刻只能做一件事：<b>搜一处</b>，或<b>渡一趟</b>。`
        + `通信员、二班长带回来的话可以信（标「有人」）；老乡、孩子的说法只能参考（标「存疑」）。`
        + `搜一次会带回一条<b>旁证</b>，帮你把存疑的地方排掉。</span>`;
  }

  function fb(html, cls) {
    fbEl.className = `smini13-fb${cls ? ' ' + cls : ''}`;
    fbEl.innerHTML = html;
  }

  function sync() {
    renderLead();
    renderHud();
    renderBoard();
    writeDataset();
  }

  /* ── 结算 ──────────────────────────────────────────────────── */
  function verdict() {
    const r = B.totalEast ? st.crossed / B.totalEast : 0;
    if (st.crossed === 0) return 'none';
    if (r >= 1) return 'full';
    if (r >= 0.83) return 'high';
    if (r >= 0.55) return 'mid';
    return 'low';
  }

  function finish() {
    if (st.done) return;
    st.done = true;
    st.outcome = verdict();
    const leftTotal = B.totalEast - st.crossed;
    renderHud();
    writeDataset();

    const card = h('div', { class: 'smini13-res' });
    card.append(h('p', { class: 'r-res-h', text: '天亮了' }));
    card.append(h('p', { class: 'r-res-l', html:
      `东岸 <b>${B.totalEast}</b> 人 · 过江 <b>${st.crossed}</b> 人 · 留在东岸 <b>${leftTotal}</b> 人`
      + ` · 天亮前收拢 ${st.gathered + st.crossed} 人` }));
    const ul = h('ul', { class: 'r-res-list' });
    for (const s of spots) {
      if (s.people <= 0) continue;
      const missed = s.people - s.got;
      if (!s.searched) ul.appendChild(h('li', { text: `${s.name}：没来得及去找（${s.people} 人）` }));
      else if (missed > 0) ul.appendChild(h('li', { text: `${s.name}：接回 ${s.got} 人，还有 ${missed} 人没跟上` }));
      else ul.appendChild(h('li', { text: `${s.name}：${s.got} 人全部接回` }));
    }
    card.append(ul);
    card.append(h('p', { class: 'r-judge', text: OUTCOME_TEXT[st.outcome] }));
    board.innerHTML = '';
    board.appendChild(card);
    ferryBox.style.display = 'none';

    stats(opts.stats, [
      ['天光', `${st.ticks} 刻`],
      ['过江', `${st.crossed}/${B.totalEast}`],
      ['收拢', `${st.gathered + st.crossed}`],
      ['结局', st.outcome],
    ]);

    const score = clamp(st.crossed / (B.totalEast || 1), 0, 1);
    const detail = {
      outcome: st.outcome,
      score: Number(score.toFixed(3)),
      crossed: st.crossed,
      totalEast: B.totalEast,
      gatheredLeft: st.gathered,
      missed: leftTotal,
      ticksLeft: st.ticks,
      judgeFrom: 'fixed',      // 判词是作者写死的，没走模型
      aiPending: false,
      noAi: true,
      seed: st.seed,
      dirs: spots.map((s) => ({
        name: s.name, role: s.role, people: s.people, enemy: s.enemy || null,
        searched: s.searched, got: s.got, known: s.known,
      })),
      log: st.log.slice(-14),
    };
    const summary = st.crossed === 0
      ? `天亮时东岸还有 ${leftTotal} 人，一个也没能接过来。`
      : `天亮前把 ${st.crossed}/${B.totalEast} 个人接过了江${leftTotal ? `，东岸还剩 ${leftTotal} 人` : '，一个没落下'}。`;
    sync();
    const fin = { score, detail, summary };
    // 让结算屏至少上屏一帧再 resolve（不然自动化读不到终态）
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ac.abort();
      settleOnce(fin);
    }));
  }

  let resolve = () => {};
  const p = new Promise((r) => { resolve = r; });
  let settled = false;               // 内层 Promise 结过账没有（正常收工 / 中途被拆走都算）
  /** 只结一次账：正常收工走 finish()，容器被拆走也要结 —— 否则内层 Promise 永远挂着，
   *  局内的 DOM / 闭包全被钉住（这一支没有帧循环，所以只能靠下面的守卫发现"被拆走"）。 */
  function settleOnce(result) {
    if (settled) return;
    settled = true;
    resolve(result);
  }
  /** 中途被拆走：形状与各支一致（score 0 · detached · aborted），别改分与 detail 的形状 */
  function settleDetached() {
    settleOnce({ score: 0, detail: { outcome: 'none', why: 'detached', aborted: true }, summary: '' });
  }

  /* ── 动作 ──────────────────────────────────────────────────── */
  function spend(n) { st.ticks = Math.max(0, st.ticks - n); }

  function revealNext() {
    while (st.reveal.length) {
      const i = st.reveal.shift();
      const s = spots[i];
      if (s.searched || s.known !== 'u') continue;
      s.known = s.people > 0 ? 'y' : 'n';
      st.log.push(`情报：${s.name}${s.people > 0 ? '那边还有人' : '是空的'}`);
      return `另有情报：<b>${s.name}</b>${s.people > 0 ? '那边还有人' : '是空的，别去了'}`
        + `${s.enemy ? '（那边也有敌人）' : ''}`;
    }
    return '';
  }

  function afterSpend(note) {
    const extra = revealNext();
    st.last = note.replace(/<[^>]+>/g, '');
    const tail = st.ticks <= 0
      ? ' <b class="bad">天要亮了。</b>'
      : extra ? `<br><span class="dim">${extra}</span>` : '';
    fb(`${note}${tail}`);
    settle();
  }

  function doSearch(i) {
    const s = spots[i];
    if (st.done || s.searched) return;
    const cost = s.enemy ? RALLY.WARN_RUSH : 1;
    spend(cost);
    s.searched = true;
    s.got = s.people;
    st.gathered += s.got;
    play(s.got > 0 ? 'click' : 'thud');
    const note = s.got > 0
      ? `派人去<b>${s.name}</b>：接回 <b class="good">${s.got}</b> 人`
        + `${s.enemy ? `（那边有敌人，来回花了两刻）` : ''}。`
      : `派人去<b>${s.name}</b>：一个人也没有${s.enemy ? '，还搭进去两刻' : ''}。`;
    st.log.push(note.replace(/<[^>]+>/g, ''));
    afterSpend(note);
  }

  function doCallout(i) {
    const s = spots[i];
    if (st.done || s.searched) return;
    spend(RALLY.WARN_CALL);
    s.searched = true;
    s.got = Math.max(1, Math.ceil(s.people / 2));
    st.gathered += s.got;
    play('click');
    const lost = s.people - s.got;
    const note = `在<b>${s.name}</b>外面喊：回来 <b class="good">${s.got}</b> 人`
      + (lost > 0 ? `，还有 <b class="bad">${lost}</b> 个走不动，没能跟上` : '，一个没落下') + '。';
    st.log.push(note.replace(/<[^>]+>/g, ''));
    afterSpend(note);
  }

  function doFerry() {
    if (st.done) return;
    spend(1);
    if (st.gathered <= 0) {
      fb('江边一个人也没有 —— 这一趟白等了。', 'bad');
      st.log.push('渡口白等一刻');
      st.last = '渡口白等一刻';
      settle();
      return;
    }
    const k = Math.min(RALLY.FERRY_CAP, st.gathered);
    st.gathered -= k;
    st.crossed += k;
    play('click');
    fb(`渡一趟：<b class="good">${k}</b> 人过了江`
      + (st.gathered > 0 ? `，江边还排着 <b class="bad">${st.gathered}</b> 个人。` : '，江边空了。'));
    st.log.push(`渡一趟：${k} 人过江`);
    st.last = `渡 ${k} 人`;
    settle();
  }

  /** 每做完一件事看一次终局条件。 */
  function settle() {
    const leftTotal = B.totalEast - st.crossed;
    const allSearched = spots.every((s) => s.searched || s.known === 'n');
    if (leftTotal <= 0) { fb(fbEl.innerHTML + '<br><b class="good">东岸的人全接回来了。</b>'); finish(); return; }
    if (st.ticks <= 0) { finish(); return; }
    if (allSearched && st.gathered <= 0) {
      fb(fbEl.innerHTML + '<br><span class="dim">能找的地方都找过了，剩下的不会再有人。</span>');
      finish(); return;
    }
    sync();
  }

  /* ── 事件：整块面板用一个 AbortController 挂，卸载即全解 ───────── */
  board.addEventListener('click', (e) => {
    const el = e.target.closest('[data-mini-action]');
    if (!el) return;
    const act = el.getAttribute('data-mini-action');
    const i = Number(el.getAttribute('data-dir'));
    if (act === 'search') doSearch(i);
    else if (act === 'callout') doCallout(i);
  }, sig);
  ferryBox.addEventListener('click', (e) => {
    if (e.target.closest('[data-mini-action="ferry"]')) doFerry();
  }, sig);

  sync();
  fb('先从哪里下手？<span class="dim">标「有人」的地方最稳；标「存疑」的先等旁证再动。</span>');
  hintEl.textContent = '天亮之后，渡口就没了 —— 搜得越多，不等于带得走越多。';

  /* 自清 + 结账：板屏换屏后不会有人再来点这些按钮了，容器一被拆走就收工结账 */
  const guard = setInterval(() => {
    if (container.isConnected) return;
    clearInterval(guard);
    ac.abort();
    settleDetached();
  }, 500);

  return p;
}

/* ══════════════ 登记 ══════════════ */

export const RALLY_MINIGAMES = [
  {
    id: 'rally-river',
    title: '收拢',
    family: '搜索',
    states: ['play', 'done'],
    actions: ['search', 'callout', 'ferry'],
    noAi: true,
    noAiNote: '游戏内 0 次模型调用：8 刻里每刻都在等玩家判断，没有一秒能让玩家站着等；'
      + '结算判词按结局档写死五句。接线后由主线 minigame_review 接管那一段话。',
    act: 'act1 · 湘江',
    note: '拂晓前把打散在东岸的人收拢过江：线索判断 + 8 刻取舍；搜和渡抢同一本时间账',
    run: (host, o = {}) => runRally(host, o),
  },
];

export const CARDS = RALLY_MINIGAMES;

/* ══════════════ 样式（运行时注入，前缀 smini13-）══════════════ */
{
  const css = `
/* ⚠️ width:100% + 子项 max-width:min(620px,100%) 缺一不可：
   挂载点比 620 窄时（板屏纸面、调试台中栏都窄过它），只写 max-width:620px 的话
   子项会按内容宽度撑到 620 并居中溢出，两头被裁。 */
.smini13-wrap { display:flex; flex-direction:column; gap:9px; align-items:center; width:100%; }
.smini13-lead { margin:0; font-family:var(--font-kai, "KaiTi", serif); font-size:13.5px; line-height:1.7;
  color:#3f3524; max-width:min(620px,100%); text-align:left; }
.smini13-lead b { color:#8c2f22; font-weight:400; }
.smini13-lead .dim { color:#7a6c53; font-size:12.5px; }

.smini13-hud { width:100%; max-width:min(620px,100%); padding:8px 11px 7px; box-sizing:border-box;
  background:rgba(255,252,244,.78); border:1px solid rgba(120,100,70,.3); border-radius:6px; }
.r-hud { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.r-chip { font-size:11.5px; color:#5f5442; white-space:nowrap; }
.r-chip b { font-variant-numeric:tabular-nums; color:#3a3125; font-size:13px; }
.r-chip.on b { color:#8a6a1e; }
.r-chip.low b { color:#8c2f22; }
.smini13-dawn { position:relative; flex:1 1 90px; min-width:70px; height:9px; border-radius:5px;
  background:rgba(120,104,78,.22); overflow:hidden; }
.smini13-dawn > i { display:block; height:100%; width:100%;
  background:linear-gradient(90deg,#3b4a5e,#8ea3b8); transition:width .16s linear; }
.smini13-dawn.low > i { background:linear-gradient(90deg,#9a7a26,#e0b445); }

/* 画作容器：position:relative + overflow:hidden；img 上移裁出取景带 */
.smini13-scene { position:relative; width:100%; max-width:min(620px,100%); overflow:hidden;
  border-radius:6px; background:#0d1016;
  box-shadow:0 0 0 1px rgba(92,80,62,.5), 0 10px 26px rgba(20,16,10,.3); }
.smini13-plate { position:absolute; left:0; top:0; width:100%; height:auto; max-width:none;
  user-select:none; -webkit-user-drag:none; }
/* 覆盖层：只做指示，不拦点击（pointer-events:none）——行才是操作元素 */
.smini13-pins { position:absolute; inset:0; pointer-events:none; }
.smini13-pin { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column;
  align-items:center; gap:2px; }
.smini13-pin .dot { width:13px; height:13px; border-radius:50%; box-sizing:border-box;
  border:2px solid rgba(216,208,188,.42); background:rgba(16,18,22,.5); }
.smini13-pin .nm { font-size:10.5px; line-height:1; color:#efe6d2; white-space:nowrap;
  padding:1px 5px 2px; border-radius:3px;
  /* ⚠️ 这层暗底不是装饰：画作里"上游浅滩"那一带正好有水面高光（实测最亮 236），
     纯描边阴影压不住浅色字。像素断言 F5 就是钉这件事的 —— 去掉这行会立刻变红。 */
  background:rgba(10,12,16,.6);
  text-shadow:0 1px 2px rgba(0,0,0,.95), 0 0 5px rgba(0,0,0,.85); }
.smini13-pin.is-known .dot { border-color:#e8c073; background:rgba(232,192,115,.34);
  box-shadow:0 0 7px rgba(232,192,115,.5); }
.smini13-pin.is-unknown .dot { border-style:dashed; }
.smini13-pin.is-out .dot { border-color:rgba(190,190,180,.3); background:rgba(30,30,34,.45); }
.smini13-pin.is-warn .dot { border-color:#e07a5f; background:rgba(196,85,58,.4);
  box-shadow:0 0 9px rgba(224,122,95,.6); }
.smini13-pin.is-done .dot { border-color:#f0d79a; background:#e8c073; box-shadow:0 0 9px rgba(240,215,154,.7); }
.smini13-pin.is-empty .dot { border-color:#6f7566; background:rgba(70,76,66,.5); }
.smini13-pin.is-dock .dot { width:15px; height:15px; border-color:#cfe0ef; background:rgba(143,182,214,.4);
  box-shadow:0 0 9px rgba(143,182,214,.55); }
.smini13-pin.is-dock .nm { color:#dbe8f4; }

.smini13-board { width:100%; max-width:min(620px,100%); display:flex; flex-direction:column; gap:5px; }
.smini13-item { display:flex; flex-direction:column; gap:3px; }
.smini13-row { display:grid; grid-template-columns:auto auto auto 1fr auto; align-items:center;
  gap:8px; width:100%; text-align:left; cursor:pointer; box-sizing:border-box;
  padding:7px 9px; border-radius:5px;
  color:#332b1d; background:linear-gradient(180deg,#fffdf6,#f4ebd8);
  border:1px solid rgba(120,100,70,.34);
  font:inherit; font-size:12px; line-height:1.4; }
.smini13-row[data-mini-action]:hover { background:linear-gradient(180deg,#fffef9,#f8f0dd);
  border-color:rgba(150,110,40,.62); }
.smini13-row:not([data-mini-action]) { opacity:.86; cursor:default; }
.r-lamp { width:8px; height:8px; border-radius:50%; background:rgba(140,130,110,.5); }
.r-lamp.hot { background:#c39a2e; box-shadow:0 0 5px rgba(195,154,46,.7); }
.r-lamp.got { background:#3f7f4a; }
.r-lamp.nil { background:#8a8578; }
.r-name { font-family:var(--font-kai, "KaiTi", serif); font-size:13.5px; letter-spacing:.03em; white-space:nowrap; }
.r-badge { font-size:10.5px; padding:1px 6px; border-radius:3px; white-space:nowrap;
  background:rgba(120,100,70,.14); color:#6a5c44; }
.r-badge.on { background:rgba(195,154,46,.2); color:#7d6118; }
.r-badge.no { background:rgba(110,112,104,.18); color:#5c5f56; }
.r-clue { font-size:11.5px; color:#6a5c44; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.r-go { font-size:11px; color:#7d6a4a; white-space:nowrap; }
.smini13-row.is-warn { border-color:rgba(176,86,62,.6); background:linear-gradient(180deg,#fdf4ec,#f4e2d6); }
.smini13-row.is-done { border-color:rgba(63,127,74,.45); }
.smini13-row.is-empty { opacity:.72; }
.smini13-echo { align-self:flex-start; margin-left:26px; padding:4px 9px; border-radius:4px;
  font:inherit; font-size:11px; cursor:pointer; color:#7a3a28;
  background:rgba(255,250,244,.9); border:1px dashed rgba(176,86,62,.6); }
.smini13-echo[data-mini-action]:hover { background:#fff3ea; }
.smini13-echo:not([data-mini-action]) { opacity:.5; cursor:default; }

.smini13-ferrybox { width:100%; max-width:min(620px,100%); display:flex; }
.smini13-ferry { flex:1 1 auto; padding:10px 14px; border-radius:5px; cursor:pointer; text-align:center;
  font:600 13px/1 var(--font-ui, system-ui); color:#1f1a12;
  background:linear-gradient(180deg,#cfe0ef,#a9c4dc);
  border:1px solid rgba(70,96,124,.6);
  box-shadow:0 1px 0 rgba(255,255,255,.6) inset, 0 2px 5px rgba(40,50,64,.16); }
.smini13-ferry:hover { background:linear-gradient(180deg,#e0ecf6,#b8d0e4); }

.smini13-fb { width:100%; max-width:min(620px,100%); font-size:12.5px; line-height:1.7; color:#4b4130;
  text-align:left; }
.smini13-fb b.good { color:#2f6b3a; }
.smini13-fb b.bad { color:#8c2f22; }
.smini13-fb .dim { color:#7a6c53; }
.smini13-hint { margin:0; width:100%; max-width:min(620px,100%); font-size:11.5px; line-height:1.6;
  color:#7a6c53; text-align:left; }

.smini13-res { display:flex; flex-direction:column; gap:6px; padding:11px 12px; border-radius:6px;
  background:rgba(255,252,244,.86); border:1px solid rgba(120,100,70,.34); }
.r-res-h { margin:0; font-family:var(--font-kai, "KaiTi", serif); font-size:16px; color:#2c2416; }
.r-res-l { margin:0; font-size:12.5px; line-height:1.7; color:#4b4130; }
.r-res-l b { color:#8c2f22; font-variant-numeric:tabular-nums; }
.r-res-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px;
  font-size:11.5px; line-height:1.6; color:#6a5c44; }
.r-res-list li::before { content:'· '; color:#a89878; }
.r-judge { margin:0; padding-top:6px; border-top:1px dashed rgba(120,100,70,.36);
  font-family:var(--font-kai, "KaiTi", serif); font-size:12.5px; line-height:1.7; color:#54452c; }

@media (prefers-reduced-motion: reduce) {
  .smini13-dawn > i { transition:none; }
}
`;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}
