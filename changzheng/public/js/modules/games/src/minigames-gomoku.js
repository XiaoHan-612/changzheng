/**
 * 《泥地五子棋》（**重做版 · 单独开发，未接入主线**）
 *
 * ── 它取代的是什么 ──
 *   旧版（minigames.js 的 runGomoku，144 行）：9×9 的 81 个 `<button class="wzq-cell">`
 *   排成方格，点一下变个色块；对手是"优先成五、其次封堵、再者为邻近空位"的一步贪心。
 *   它的问题不在"能不能下"，而在三处：
 *     ① **没有棋盘，只有方格。** 画面上是 81 个格子拼成的色块矩阵 ——
 *        没有划痕、没有泥、没有石子的体积，也没有"这是在草地上"的任何痕迹。
 *     ② **没有代价，也没有第二次决策。** 除了"往哪儿落子"，玩家不做任何别的选择；
 *        输了就是 0.25 分，没有"我在赌什么"的感觉。
 *     ③ **对手是死的。** 同一套贪心，每一局都一样。
 *
 * ── 史实锚点（逐条查过，不是凭印象）──
 *   data/facts.json · h_grassland：1935 年 8 月，红一、红四方面军走过松潘草地；
 *   气候恶劣、沼泽遍布、补给断绝。
 *   公开史料（人民网 / 中国军网 / 央视"过草地"专题）里三条被反复写到的细节，
 *   直接变成了这一局的画面与规则：
 *     · **"8 月是草地最暖的季节，白天最高可达 30 度，一到夜间就降到 0 度左右"**
 *       → 所以是**夜里**、围着**篝火**下棋，手是冻的。
 *     · **"河沟交错，积水呈淤黑色，草丛下是沼泽泥潭"**
 *       → **泥地棋盘 + 渗水**：棋盘不是木板，是刚下过雨的草甸；
 *         棋盘上会**渗出水洼**，水洼里落不住石子（这是这一版的核心机制）。
 *     · **"没有树、没有石头做参照，只有沼泽上一丛丛几尺高的乱草"**
 *       → 棋子是**从泥里挑出来的石子**：深的是湿的青灰石，浅的是干的灰白石灰石；
 *         棋盘是**用树枝在泥地上刮出来的格子**，线是歪的。
 *   （旧版把"两个小鬼"只写在 `setPortrait` 与一句对白里，玩法区里一个人都没有。）
 *
 * ── 玩家的决策在哪（四重）──
 *   ⓪ **开局：对面坐谁。** 三档："他今天心不在焉 / 他认真起来了 / 他把老兵教的使出来了"。
 *      差别不是噪声大小，是**他看得见多远的杀招**（见下面「引擎」那段），
 *      而且"再来一盘"会回到这一屏 → 输了可以换个对手再来，这是重开一局的理由。
 *   ① **开局：接不接让子。** 小鬼先开口 ——「你比我大，要么我让你两子，要么咱俩实打实来。」
 *      · 接让子：你先连落**两子**（局面占优），但**结算上限压到 0.72** —— 让子赢的，不算你的本事；
 *      · 实打实：你先落一子，**上限 1.00** —— 但输面实打实存在（输了 0.20）。
 *      → 稳 vs 硬，第一层，而且它**真的改分数**，不是文案。
 *   ② **中盘：水洼往哪儿渗。** 从第 8 手起每 4 手渗一处（最多 3 处），
 *      而且**渗水前一回合就会预告**（棋盘上那一带先变成一块看得见的湿痕）。
 *      水洼格不能落子 → 渗水是**资源**：它能把对手正在做的那条线**封死**，
 *      也会把你自己的路堵掉。抢在渗水前占位置，或者反过来借它封人，都是正当打法。
 *      ⚠️ 这是**这一版与普通五子棋的唯一规则差异**，也是"泥地"两个字落在机制上的地方。
 *   ③ **每一手的落点**，仍然是五子棋本身。
 *
 * ── 失败条件（明确，而且不是"分低"）──
 *   · 小鬼连成五子 → `lose`，0.20；棋盘落满（含被水洼吃掉的位置）→ `draw`，0.45×上限；
 *   · 自己推子认输 → `resign`，0.12。三条都在结算屏才落地。
 *
 * ── AI（两条用途，都是用户点名的）──
 *   ⚠️ 前提：**AI 不许让玩家站着等**（用户 2026-09-15 定的项目级口径）。
 *   同一个比赛网关 2026-09-15 实测：极简探测 6.79s（且 content 被 max_tokens 截断）、
 *   叙事类 19–64s，时间几乎全耗在隐藏推理上 —— "2–6 秒及时反应"在这条网关上不成立。
 *   所以这一版的做法是：
 *
 *   【用途一 · 让小鬼自己想办法】默认**关**。开启后，小鬼那一手不再由引擎定，
 *   而是把引擎挑出的 4 个候选点（每点带一句"这一手做什么"）交给模型，由它 `pick` 一个，
 *   再配一句小鬼的嘴。**模型只能从候选里挑**，所以拿回来的落点一定合法 ——
 *   不存在"模型瞎下把棋力搞崩"这条路。
 *     · 10 秒窗口（`AI_WINDOW_MS`）+ 本地兜底：超时/非法/没返回 → 引擎照下。
 *     · 面板上有 **「催他一手」**（`[data-mini-action="urge"]`）：任何时候都能立刻用引擎的落点
 *       结束等待。**这是这一支唯一会出现"等待"的地方**，所以它默认关闭，
 *       开关上明写"每一手最多等 10 秒"。
 *     · `detail.moveFrom` 如实写清最后一手是谁定的（`model` / `engine`）。
 *
 *   【用途二 · 观棋】点「蹲一边看他俩下」进入。玩家是**看客**，点一次「下一手」推进。
 *   每一手**并发两次** `gomoku_move`（同一局面、分别问深色与浅色该怎么落），
 *   两个都受 10 秒窗口约束，超时各自落到引擎。
 *   等待是玩家**自己按出来的**，不是被逼的 → 这满足"观看 api 自己和自己下棋"。
 *
 *   【默认路径 0 次调用】不开开关、不进观棋 → 全由本地引擎走，游戏内 **0 次模型调用**。
 *   `tests/manual/qa-gomoku.mjs` 用 `/api/decide` 计数器断言这一点。
 *
 * ── 引擎（纯函数，可单测）── 两层：
 *   ① **位置分** `pointScore`："5 连窗"评估 —— 把所有包含该点的 5 连窗扫一遍，
 *      窗内全是自己人（或空）才计分，按 `WIN5[own]` 加权，天然处理 `X_XX` 这种**断点四**。
 *      它回答的是"这一格周围的手感好不好"，**但它赢不了棋**。
 *   ② **杀招** `killerRank`：五子棋赢的不是"我分高"，是**对面挡不住**（双四 / 双活三）。
 *      数法很直接：落完这一手，我有几个"下一手能成五"的点？
 *        2 个 → 活四/双四（对面只能挡一个，基本赢了）
 *        1 个 → 冲四（对面必须应）
 *        0 个 → 再看"我下一手能不能做出活四"，有 ≥2 个这样的点 → 双活三。
 *
 *   然后按**威胁阶梯**下（见 `topCandidates` 的 (c) 段）：
 *      我活四 > 挡对面活四 > 我双活三 > 挡对面双活三 > 位置分。
 *   ⚠️ 阶梯里**没有**"预判性去堵对面单个四/单个三"这一层。加过，结果是双方互堵到棋盘填满：
 *      hard 自对自 40 局全平、hard 打不过 easy（旧版那段"安全检查"就是这个毛病）。
 *      宁可让单个四漏过去，也不能让双方都不敢进攻 —— 那是没胜负的游戏。
 *
 *   三档棋力 = **他看得见多远的杀招**（`LEVELS`）：
 *      easy 不算杀招（只看"能成五"和"对面要成五"）+ 大噪声 + 手滑；
 *      mid  算到"四"；hard 还能算"双活三"，顺带看 12 个候选、还会算对面 8 个点。
 *   实测（40 局，固定种子交替先后手）：easy 对 mid 0 胜、对 hard 0 胜；
 *      hard 对 mid 11:4；hard 自对自 20:20（能分胜负，不是互堵）；easy 自对自 18:19。
 *   ⚠️ **平局率偏高是这套引擎的固有特性**（两个都会防的引擎在小盘上容易互堵到填满），
 *      实测换成 11 路盘也一样，所以不是盘面大小的问题。判据因此取"性质"而不是"胜场数"。
 *
 * ── 画面的颜色是**算过的**，不是随手调 ──
 *   `qa-gomoku.mjs` 用**格心 26×26 小块的均值**做像素分类（比数像素硬得多）：
 *     L = mean(r+g+b)/3，C = mean(b−r)      ← C 是关键：只有水发青，泥和石子都偏暖
 *     · 小鬼的石子   L ≈ 158            → L > 120 判 light
 *     · 水洼         C ≈ +36            → C > 28  判 puddle   （实测 35.6 / 泥地 −23.9）
 *     · 你的石子     C ≈ +23, L ≈ 62    → C > 8   判 dark
 *     · 渗水预告带   L ≈ 67, C ≈ −20    → L > 49  判 wetband  （实测 66.8 / 远处泥地 39.9）
 *     · 泥地         L ≈ 40, C ≈ −24    → 其余判 mud
 *   所以 **改 PAL 里任何一个颜色之前，先看这张表**；
 *   尤其别给棋盘那块加"盖满全屏的暖色叠加"（会把水洼的发青洗掉，整类断言立刻失真）——
 *   篝火光因此只落在棋盘外的留白圈上（见 `buildBg` 的 evenodd 挖洞）。
 *   ⚠️ 水洼**不能画成"中心亮、边缘暗"的圆** —— 那是一颗球，跟深色石子分不开，
 *     玩家会点上去才发现落不住子（第一版就是这样，已改成"中心最深 + 边上收亮边 + 天光反射"）。
 *
 * 玩法 id：`mud-gomoku`（**故意不复用 `gomoku`** —— 调试台 `specOf` 按 id 查表，
 * 撞 id 会取到主线那份旧的）。
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
  for (const [k2, v] of Object.entries(attrs)) {
    if (k2 === 'class') el.className = v;
    else if (k2 === 'text') el.textContent = v;
    else if (k2 === 'html') el.innerHTML = v;
    else if (k2.startsWith('on') && typeof v === 'function') el.addEventListener(k2.slice(2), v);
    else el.setAttribute(k2, v);
  }
  for (const kid of [].concat(kids)) if (kid) el.appendChild(kid);
  return el;
}

function mount(container, node) {
  container.innerHTML = '';
  container.appendChild(node);
  return node;
}

/** 板头数值签：与项目其他玩法同一个签名（stats(host, [[名, 值]])） */
function stats(_host, items) { return STATS(items); }

/** 可复现随机数（自动化要能用固定种子跑出同一局）*/
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ══════════════ 常量 ══════════════ */

export const N = 9;                 // 9×9 —— 泥地上用树枝刮得出来的尺寸
// 2026-09-17 放大：34/12 → 52/16（棋盘 330 → 500，面积 2.3 倍）。
// 原来 330 的盘在 960 宽的玩法板里明显偏小，落子点要瞄；用户反馈"把棋盘做大一点"。
// 放大是**成比例**的：石子半径、格线、命中格都从 CELL 推出来（见 r = CELL/2 - 0.8、
// CSS 里的 ${CELL}），所以只动这两个常量 + 下面那段参数化样式就够了。
// 校验：qa-gomoku 的像素对账读的是 dataset.miniBoard 里的 pad/cell（不是写死的），
// 采样半径 13*dpr 仍在半格（52/2=26）之内，分类阈值不受影响。
export const CELL = 52;             // 每格 CSS 像素
export const PAD = 16;              // 泥地留白（篝火光就落在这圈上）
export const BOARD_PX = N * CELL + PAD * 2;   // 500

export const PUDDLE_MAX = 3;
export const PUDDLE_FIRST = 8;      // 第 8 手（总手数）渗第一处
export const PUDDLE_EVERY = 4;      // 之后每 4 手一处
export const AI_WINDOW_MS = 10000;  // 用户定的窗口：超过 10 秒就当作"它没答"

/** 三档棋力。名字都是"小鬼今天什么状态"，不是难度菜单。 */
/**
 * 三档棋力。 **分层靠的是"看得见多远的杀招"，不是噪声大小** —— 这一点是重写的：
 * 旧版 hard 有一段"安全检查"，它把候选按"对面下完最好的一手有多强"重排，
 * 等于把进攻整个丢掉 —— 实测 hard 打不过 easy、hard 自对自 20 局全平（棋盘填满）。
 *
 *   killer  : 会不会算杀招（双四/双活三）。
 *   deep    : 杀招算到几层。false = 只认"四"，看不见双活三。
 *   head    : 自己算杀招的候选数。
 *   oppHead : 算对面杀招时取前几名（0 = 不算）。
 *   oppW    : 位置分里对面威胁的权重（< 1 才有进攻欲望）。
 *
 * 判定的顺序是**威胁阶梯**（见 `topCandidates` 的 (c) 段）：
 *   我活四 > 挡对面活四 > 我双活三 > 挡对面双活三 > 位置分。
 * ⚠️ 千万**不要**加"预判性去堵对面单个四/单个三"那一层 —— 试过，结果两边互堵到棋盘填满，
 *    hard 自对自 20 局全平，游戏直接没有胜负。宁可让单个四漏过去，也不能让双方都不敢进攻。
 *
 * 血统检查（`tests/manual/qa-gomoku.mjs` A5 + 临时 diag）：hard > mid > easy，且硬档自对自要能分胜负。
 */
// tier 是**给玩家看的难度档**（原来只有文艺腔那半句，玩家看不出哪个简单哪个难 —— 用户反馈
// "AI 难度要分简单中等困难三种"）。flavor 那半句保留，摆在档位后面当注释。
export const LEVELS = {
  easy: { tier: '简单', label: '他今天心不在焉', oppW: 0.20, noise: 0.55, slip: 0.30, killer: false, deep: false, head: 4, oppHead: 0 },
  mid: { tier: '中等', label: '他认真起来了', oppW: 0.50, noise: 0.08, slip: 0, killer: true, deep: false, head: 6, oppHead: 5 },
  hard: { tier: '困难', label: '他把老兵教的使出来了', oppW: 0.40, noise: 0, slip: 0, killer: true, deep: true, head: 12, oppHead: 8 },
};

/** 没到"杀招"档时，自己成四/成三的加分（rank 3/4 由阶梯直接短路，不走这里） */
export const RANK_BONUS = [0, 200, 6e3, 0, 0];
export const DEFAULT_LEVEL = 'mid';

/** 结算上限：接了让子就压到 0.72 —— 让子赢的，不算你的本事。 */
export const CAP_HANDICAP = 0.72;
export const CAP_FAIR = 1.0;
/** 观棋：你没有下场，拿一个中性分（既不算赢也不算输）。 */
export const SPECTATE_SCORE = 0.5;

/** 画面配色。见文件头「画面的颜色是算过的」那张表 —— 改色前先对一遍。 */
export const PAL = {
  mud: '#332a1b',            // 湿泥炭（L≈40, C≈−24）
  scratch: 'rgba(214,196,164,.22)',
  band: 'rgba(185,194,189,.17)',   // 渗水预告：一块偏亮的湿痕（实测 L≈66 vs 泥地 L≈40）
  puddle: '#0e2a35',         // 水洼：淤黑发青。**中心最深、边上才收亮边** —— 反过来画就是一颗球
  puddleRim: 'rgba(126,168,180,.55)',
  puddleSheen: 'rgba(190,225,235,.30)',
  stoneDark: '#31465f',      // 你的石子：湿的青灰石（C≈+46）
  stoneDarkHi: '#7f93ad',
  stoneDarkRim: '#1c2b3d',
  stoneLight: '#e6e1d6',     // 小鬼的石子：干的灰白石灰石（L≈203）
  stoneLightHi: '#fbf9f4',
  stoneLightRim: '#b5ae9f',
  press: 'rgba(12,9,6,.55)', // 石子压进泥里的暗圈
  shadow: 'rgba(8,6,4,.42)',
  mark: 'rgba(236,222,190,.85)',
  chalk: 'rgba(246,240,225,.92)',
  fire: 'rgba(255,170,72,.30)',
};

/** 小鬼的嘴。走模型时由模型写；不走模型时从这里轮转 —— **绝不假装是模型给的**。 */
export const TAUNTS = [
  '你这手，我看不懂。',
  '别急。泥里滑。',
  '我这儿的石头多着呢。',
  '你手抖了。',
  '这格是我先看上的。',
  '……让我想想。',
  '冻得手不听使唤。',
  '刚才那手不算，泥太软。',
  '草地里就这点乐子。',
  '下完这盘就得走了。',
];
export const TAUNT_PUDDLE = ['哎 —— 渗水了。', '这块地不行了。', '水泡子又冒出来了。'];

/** 固定判词（按结局）。模型赶上了才会被替换，默认就这几句。 */
export const FIXED_JUDGE = {
  'win-fair': '你连成五子。他盯着那五个格子看了很久，才把手里的石子全掼进泥里。夜里冷，你手心是热的。',
  'win-handicap': '你连成五子。他没吭声，过了会儿才嘟囔一句「让你两子呢」。篝火那头有人笑了一声。',
  lose: '他把第五颗石子落下的时候，你还在数自己那一列。他把石子收进兜里，说：「再来。」',
  draw: '棋盘满了，谁也没连成五子 —— 有几格已经成了水泡子，谁都不去碰。他说下次再来。',
  resign: '你把石子往泥里一推，说不下了。他看了你一会儿，没追问，只是把棋盘抹平了。',
};
export const SPECTATE_JUDGE = {
  'spectate-dark': '深色那一方连成了五子。浅色的把手里剩的石子扔进泥里，嘴里不干不净地嘟囔了一句。',
  'spectate-light': '浅色那一方连成了五子 —— 小的那个蹦起来，被大的按了回去：「小声点，有人睡了。」',
  'spectate-draw': '棋盘满了，谁也没连成五子。两个人对着那几格水泡子看了一会儿，谁都没说话。',
};

/* ══════════════ 纯函数：棋盘 / 判定 / 引擎 ══════════════
   全部无副作用、不碰 DOM、随机一律从参数进 —— 单测与自动化才能复现。 */

const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const kk = (x, y) => y * N + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

export const WIN5 = [0, 0, 30, 900, 12000, 4e7];

export function makeBoard() {
  return Array.from({ length: N }, () => new Array(N).fill(0));
}

/** [[x,y]] / [{x,y}] 一律收成 Set；越界当没写 */
export function toBlocked(list) {
  const s = new Set();
  for (const p of list || []) {
    const x = Array.isArray(p) ? p[0] : p.x;
    const y = Array.isArray(p) ? p[1] : p.y;
    if (inside(x, y)) s.add(kk(x, y));
  }
  return s;
}

export function legalMoves(board, blocked) {
  const out = [];
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      if (board[y][x] === 0 && !blocked.has(kk(x, y))) out.push([x, y]);
    }
  }
  return out;
}

/**
 * 一个点的分：把所有**包含该点**的 5 连窗扫一遍（每方向 5 个窗）。
 * 窗里只要有一颗对手子或被水洼封住 → 这个窗废掉；否则按窗内自己人的数量给分。
 * `who` 是"假设落在这里的人"。
 */
export function pointScore(board, blocked, x, y, who) {
  if (!inside(x, y)) return 0;
  let total = 0;
  for (const [dx, dy] of DIRS) {
    for (let off = -4; off <= 0; off += 1) {
      let own = 0;
      let ok = true;
      for (let i = 0; i < 5; i += 1) {
        const nx = x + dx * (off + i);
        const ny = y + dy * (off + i);
        if (!inside(nx, ny)) { ok = false; break; }
        if (blocked.has(kk(nx, ny))) { ok = false; break; }
        const v = (nx === x && ny === y) ? who : board[ny][nx];
        if (v === who) own += 1;
        else if (v !== 0) { ok = false; break; }
      }
      if (!ok) continue;
      total += WIN5[own];
      // 活度奖励：这条窗两端还开着 → 威胁更实（活四 > 冲四，活三 > 眠三）
      if (own >= 3) {
        const openEnd = (px, py) => inside(px, py) && !blocked.has(kk(px, py)) && board[py][px] === 0;
        if (openEnd(x + dx * (off - 1), y + dy * (off - 1))
          || openEnd(x + dx * (off + 5), y + dy * (off + 5))) {
          total += (own >= 4 ? 6000 : 260);
        }
      }
    }
  }
  return total;
}

function nearStone(board, x, y, rad = 1) {
  for (let dy = -rad; dy <= rad; dy += 1) {
    for (let dx = -rad; dx <= rad; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (inside(nx, ny) && board[ny][nx] !== 0) return true;
    }
  }
  return false;
}

/* ── 杀手锏：五子棋赢的不是"我分高"，是**对面挡不住**（双四 / 双活三）。
      这一层是重写的核心 —— 旧版没有它，两个都会防守的引擎互相挡到棋盘填满，必然平局。 ── */

/** 挨着子的空格。任何"成五点"都必定紧贴一颗自己的子，所以半径 1 足够，候选从 81 压到 ~25 */
function openNear(board, blocked) {
  const out = [];
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      if (board[y][x] !== 0 || blocked.has(kk(x, y))) continue;
      if (nearStone(board, x, y, 1)) out.push([x, y]);
    }
  }
  return out;
}

/** 这一格落 who 是否立刻成五（调用方保证该格为空） */
function makesFive(board, blocked, x, y, who) {
  for (const [dx, dy] of DIRS) {
    let n = 1;
    for (const s of [1, -1]) {
      for (let i = 1; i < N; i += 1) {
        const nx = x + dx * s * i;
        const ny = y + dy * s * i;
        if (!inside(nx, ny) || blocked.has(kk(nx, ny)) || board[ny][nx] !== who) break;
        n += 1;
      }
    }
    if (n >= 5) return true;
  }
  return false;
}

/** 当前局面下，who 一步能成五的点有几个（数到 cap 就停） */
function winSpotCount(board, blocked, who, cap = 3) {
  let n = 0;
  for (const [x, y] of openNear(board, blocked)) {
    if (makesFive(board, blocked, x, y, who)) { n += 1; if (n >= cap) return n; }
  }
  return n;
}

/**
 * 这一手的"杀手锏等级"。**这一步落完**再数我下一手能干什么。
 *   4 = 双杀：落完我有两个成五点（活四 / 双四）—— 对面只能挡一个，基本赢了
 *   3 = 双活三：有两个点能让我做出活四 —— 对面也只能挡一个
 *   2 = 一个四：对面必须马上应（先手）
 *   1 = 活三：对面得应
 *   0 = 还没成形
 * `deep=false` 只认到"四"，看不见双活三 —— 这就是中档和硬档的真实差距。
 */
function killerRank(board, blocked, x, y, who, deep) {
  if (!inside(x, y) || board[y][x] !== 0 || blocked.has(kk(x, y))) return 0;
  board[y][x] = who;
  let rank = 0;
  const ws = winSpotCount(board, blocked, who, 2);
  if (ws >= 2) rank = 4;
  else if (ws === 1) rank = 2;
  else if (deep) {
    let n = 0;
    for (const [cx, cy] of openNear(board, blocked)) {
      board[cy][cx] = who;
      const dup = winSpotCount(board, blocked, who, 2) >= 2;
      board[cy][cx] = 0;
      if (dup) { n += 1; if (n >= 2) break; }
    }
    rank = n >= 2 ? 3 : n === 1 ? 1 : 0;
  }
  board[y][x] = 0;
  return rank;
}

/** 这一手的"作用"，给模型看也给人看（候选表里就写它）。
 *  注意 `pointScore` 内部已经把 (x,y) 当成"who 的子"来算，
 *  所以传谁就是"如果这一格是这个人的"。 */
export function noteOf(board, blocked, x, y, who) {
  const opp = 3 - who;
  board[y][x] = who;
  const mine = pointScore(board, blocked, x, y, who);
  const theirs = pointScore(board, blocked, x, y, opp);
  board[y][x] = 0;
  if (mine >= WIN5[5]) return '成五';
  if (theirs >= WIN5[5]) return '挡他的成五';
  if (mine >= WIN5[4]) return '做成四';
  if (theirs >= WIN5[4]) return '挡他的四';
  if (mine >= WIN5[3]) return '做成三';
  if (theirs >= WIN5[3]) return '压他的三';
  if (mine >= WIN5[2]) return '接一口气';
  return '占个位置';
}

/**
 * 引擎挑点。`rnd` 可注入（自动化给固定种子 → 同一局）。
 * @returns {{x:number,y:number,note:string,score:number}|null}
 */
export function chooseMove(board, blocked, who, level = DEFAULT_LEVEL, rnd = Math.random) {
  const list = topCandidates(board, blocked, who, level, 1, rnd);
  return list[0] || null;
}

/** 前 k 个候选（模型只在这 k 个里挑；引擎自己也走它）。 */
export function topCandidates(board, blocked, who, level = DEFAULT_LEVEL, top = 4, rnd = Math.random) {
  const cfg = LEVELS[level] || LEVELS[DEFAULT_LEVEL];
  const opp = 3 - who;
  const all = legalMoves(board, blocked);
  if (!all.length) return [];
  const near = all.filter(([x, y]) => nearStone(board, x, y, 1));
  const pool = near.length ? near : all;

  // ⚠️ 空盘上 `pointScore` 全是 0 —— 没有这一项，排序就退化成"扫描顺序"，
  //    小鬼的开局永远落在左上角 (0,0)，又傻又好抓。这一项只在"没有威胁可分"时才起作用：
  //    24 < WIN5[2] = 30，所以"贴着自己上一步的子"永远压过"往中间凑"。
  const C0 = (N - 1) / 2;
  const rows = [];
  for (const [x, y] of pool) {
    const mine = pointScore(board, blocked, x, y, who);
    const theirs = pointScore(board, blocked, x, y, opp);
    const center = 24 * (1 - (Math.abs(x - C0) + Math.abs(y - C0)) / (2 * C0));
    let v = mine + cfg.oppW * theirs + center;
    if (cfg.noise) v *= 1 + (rnd() - 0.5) * cfg.noise;
    rows.push({ x, y, mine, theirs, v });
  }
  rows.sort((a, b) => b.v - a.v);

  const brief = (r) => ({
    x: r.x, y: r.y, score: Math.round(r.v),
    note: noteOf(board, blocked, r.x, r.y, who),
  });
  /** 把 `first` 提到最前面，其余按原序补到 top 个 */
  const lead = (first, list = rows) => {
    const out = [];
    for (const r of first) if (r && !out.includes(r)) out.push(r);
    for (const r of list) if (!out.includes(r)) out.push(r);
    return out.slice(0, top).map(brief);
  };

  // (a) 我能成五 → 直接赢。三档棋力都必须认得，不然会看着像故意不赢。
  const nowFive = rows.find((r) => r.mine >= WIN5[5]);
  if (nowFive) return lead([nowFive]);

  // (b) 对面能成五 → 必须堵。多个堵点里挑自己分最高的那个。
  const blocks = rows.filter((r) => r.theirs >= WIN5[5]).sort((a, b) => b.mine - a.mine);
  if (blocks.length) return lead(blocks);

  // (c) 威胁阶梯。**先看我能不能做杀招，再谈挡不挡** —— 因为先做出双招的人赢。
  //     这一整段取代了旧版那段"安全检查"：那段只算对面、不算自己，
  //     于是 hard 变成纯挡子机器，谁都赢不了（自对自 20 局全平）。
  if (cfg.killer) {
    const head = rows.slice(0, Math.min(cfg.head, rows.length));
    for (const r of head) r.myRank = killerRank(board, blocked, r.x, r.y, who, cfg.deep);

    // 对面下一步能达到的最高档（只认"四"以上 —— 那才是能直接带走比赛的杀招）
    let oppTop = null;
    let oppRank = 0;
    if (cfg.oppHead > 0) {
      const oppList = rows.slice().sort((a, b) => b.theirs - a.theirs).slice(0, cfg.oppHead);
      for (const o of oppList) {
        const k = killerRank(board, blocked, o.x, o.y, opp, cfg.deep);
        if (k > oppRank) { oppRank = k; oppTop = o; }
      }
    }

    const best4 = head.filter((r) => r.myRank === 4).sort((a, b) => b.v - a.v)[0];
    if (best4) return lead([best4]);                       // 我活四 —— 对面挡不住
    if (oppRank === 4 && oppTop) return lead([oppTop]);     // 对面能活四 —— 只能占掉那一格
    const best3 = head.filter((r) => r.myRank === 3).sort((a, b) => b.v - a.v)[0];
    if (best3) return lead([best3]);                       // 我双活三 —— 先做出来的赢
    if (oppRank === 3 && oppTop) return lead([oppTop]);     // 对面能双活三 —— 占掉

    for (const r of head) r.v += RANK_BONUS[r.myRank];      // 单个的四/三：只当加分
    rows.sort((a, b) => b.v - a.v);
  }

  // easy 的手滑：把最靠前的几个打乱一下 —— 但**成五/挡成五不手滑**（不然看着像瞎下）
  if (cfg.slip && rows.length > 1 && rnd() < cfg.slip) {
    const head = rows.slice(0, Math.min(6, rows.length));
    if (!head.some((r) => r.mine >= WIN5[5] || r.theirs >= WIN5[5])) {
      const pick = Math.floor(rnd() * head.length);
      const [chosen] = head.splice(pick, 1);
      rows.splice(0, 0, chosen);
    }
  }

  return lead([]);
}

/** 连成五子的那 5 个格子；没连成返回 null。 */
export function findFive(board, who) {
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      if (board[y][x] !== who) continue;
      for (const [dx, dy] of DIRS) {
        const cells = [[x, y]];
        for (let i = 1; i < N; i += 1) {
          const nx = x + dx * i;
          const ny = y + dy * i;
          if (!inside(nx, ny) || board[ny][nx] !== who) break;
          cells.push([nx, ny]);
        }
        if (cells.length >= 5) return cells.slice(0, 5);
      }
    }
  }
  return null;
}

/** 某一方在棋盘上最长的连子数（写进 detail，给结算叙事当素材）。 */
export function longestRun(board, who) {
  let best = 0;
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      if (board[y][x] !== who) continue;
      for (const [dx, dy] of DIRS) {
        if (inside(x - dx, y - dy) && board[y - dy][x - dx] === who) continue;   // 只从链头数
        let n = 0;
        let cx = x;
        let cy = y;
        while (inside(cx, cy) && board[cy][cx] === who) { n += 1; cx += dx; cy += dy; }
        if (n > best) best = n;
      }
    }
  }
  return best;
}

/** 下一处渗水的"预告带"：锚在最后一手附近，横或竖三格，至少两格能落子。
 *  一定是**看得见、算得出**的 —— 玩家据此布局，这就是"渗水是资源"的前提。 */
export function planBand(board, blocked, anchor, rnd = Math.random) {
  const ax = anchor ? anchor.x : Math.floor(N / 2);
  const ay = anchor ? anchor.y : Math.floor(N / 2);
  const ok = (cells) => cells.every(([x, y]) => inside(x, y))
    && cells.filter(([x, y]) => board[y][x] === 0 && !blocked.has(kk(x, y))).length >= 2;
  for (let t = 0; t < 40; t += 1) {
    const horiz = rnd() < 0.5;
    const off = Math.round((rnd() - 0.5) * 4);
    const start = (horiz ? ax : ay) - 1 + off;
    const cells = [];
    for (let i = 0; i < 3; i += 1) cells.push(horiz ? [start + i, ay] : [ax, start + i]);
    if (ok(cells)) return cells;
  }
  for (let y = 0; y < N; y += 1) {                 // 兜底：第一条合法的横带
    for (let x = 0; x <= N - 3; x += 1) {
      const cells = [[x, y], [x + 1, y], [x + 2, y]];
      if (ok(cells)) return cells;
    }
  }
  return null;
}

/**
 * 结算。纯函数，单测直接喂 5 种结局。
 * @returns {{score:number,outcome:string,cap:number,judge:string}}
 */
export function gradeGame({ result = 'lose', handicap = false, moves = 0, puddles = 0 } = {}) {
  const cap = handicap ? CAP_HANDICAP : CAP_FAIR;
  let score;
  let outcome;
  if (result === 'win') { score = cap; outcome = handicap ? 'win-handicap' : 'win-fair'; }
  else if (result === 'draw') { score = Number((0.45 * cap).toFixed(3)); outcome = 'draw'; }
  else if (result === 'resign') { score = 0.12; outcome = 'resign'; }
  else { score = 0.20; outcome = 'lose'; }
  return {
    score, outcome, cap, moves, puddles,
    judge: FIXED_JUDGE[outcome] || FIXED_JUDGE.lose,
  };
}

/** 观棋的结算（你没下场，拿中性分）。 */
export function gradeSpectate(winner) {
  const outcome = winner === 1 ? 'spectate-dark' : winner === 2 ? 'spectate-light' : 'spectate-draw';
  return { score: SPECTATE_SCORE, outcome, cap: SPECTATE_SCORE, judge: SPECTATE_JUDGE[outcome] };
}

/* ══════════════ 画面 ══════════════ */

const px_ = (x) => PAD + x * CELL + CELL / 2;
const py_ = (y) => PAD + y * CELL + CELL / 2;

function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** 静态底（泥地颗粒 + 篝火外圈 + 划痕格线）只画一次，存离屏 canvas。
 *  ⚠️ 颗粒用 `hash2` 而**不是** Math.random —— 同一局两次截图必须逐像素一致，
 *     否则像素断言没法回归。 */
function buildBg(dpr) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(BOARD_PX * dpr);
  cv.height = Math.round(BOARD_PX * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  g.fillStyle = PAL.mud;
  g.fillRect(0, 0, BOARD_PX, BOARD_PX);

  for (let i = 0; i < 1500; i += 1) {
    const x = hash2(i, 1.7) * BOARD_PX;
    const y = hash2(i, 9.3) * BOARD_PX;
    const r = 0.5 + hash2(i, 3.1) * 1.7;
    const dark = hash2(i, 5.5) < 0.62;
    g.fillStyle = dark ? 'rgba(20,15,9,.30)' : 'rgba(96,82,52,.16)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // 草根：只长在留白圈里（棋盘上是被刮平的泥）
  g.strokeStyle = 'rgba(74,64,38,.45)';
  g.lineWidth = 1;
  for (let i = 0; i < 130; i += 1) {
    const a = hash2(i, 11.3) * Math.PI * 2;
    const rad = PAD * 0.5 + hash2(i, 13.7) * (BOARD_PX / 2 - PAD * 0.5);
    const x = BOARD_PX / 2 + Math.cos(a) * rad;
    const y = BOARD_PX / 2 + Math.sin(a) * rad;
    if (x > PAD - 2 && x < BOARD_PX - PAD + 2 && y > PAD - 2 && y < BOARD_PX - PAD + 2) continue;
    const len = 2.5 + hash2(i, 17.1) * 4;
    const tilt = (hash2(i, 19.9) - 0.5) * 1.1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(tilt) * len, y - len);
    g.stroke();
  }

  // 篝火光：**只落在留白圈上**（evenodd 把棋盘那块挖掉）。
  // 为什么不做成盖满全屏的暖色叠加：那会把水洼的"发青"洗掉，像素分类立刻失真（见文件头那张表）。
  g.save();
  g.beginPath();
  g.rect(0, 0, BOARD_PX, BOARD_PX);
  g.rect(PAD, PAD, N * CELL, N * CELL);
  g.clip('evenodd');
  const grd = g.createRadialGradient(BOARD_PX * 0.88, BOARD_PX * 1.06, 8, BOARD_PX * 0.88, BOARD_PX * 1.06, BOARD_PX * 1.05);
  grd.addColorStop(0, PAL.fire);
  grd.addColorStop(0.55, 'rgba(255,170,72,.10)');
  grd.addColorStop(1, 'rgba(255,170,72,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, BOARD_PX, BOARD_PX);
  g.restore();

  // 划痕格线：树枝刮的，不是尺子画的 —— 每根线上给一点起伏（≤1.1px）
  g.strokeStyle = PAL.scratch;
  g.lineWidth = 1;
  for (let i = 0; i <= N; i += 1) {
    for (const vertical of [true, false]) {
      const fixed = PAD + i * CELL;
      g.beginPath();
      for (let s = 0; s <= 8; s += 1) {
        const t = PAD + (s / 8) * (N * CELL);
        const w = (hash2(i * 7 + (vertical ? 1 : 2), s) - 0.5) * 2.2;
        const x = vertical ? fixed + w : t;
        const y = vertical ? t : fixed + w;
        if (s === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  return cv;
}

function drawStone(g, x, y, who) {
  const cx = px_(x);
  const cy = py_(y);
  const r = 12.6;
  g.save();
  // 影子 + 压痕：石子是**陷进泥里**的，不是浮在上面的
  g.fillStyle = PAL.shadow;
  g.beginPath();
  g.ellipse(cx + 1.2, cy + 2.4, r * 0.98, r * 0.86, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = PAL.press;
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(cx, cy, r + 1.2, 0, Math.PI * 2);
  g.stroke();

  const dark = who === 1;
  const grd = g.createRadialGradient(cx - 3.6, cy - 4.2, 1.2, cx, cy, r);
  grd.addColorStop(0, dark ? PAL.stoneDarkHi : PAL.stoneLightHi);
  grd.addColorStop(dark ? 0.42 : 0.55, dark ? PAL.stoneDark : PAL.stoneLight);
  grd.addColorStop(1, dark ? PAL.stoneDarkRim : PAL.stoneLightRim);
  g.fillStyle = grd;
  // 略不规则：16 段带微扰的闭合曲线，像捡来的石子而不是圆片
  g.beginPath();
  for (let i = 0; i <= 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const wob = 1 + (hash2(x * 13 + i, y * 7) - 0.5) * 0.10;
    const sx = cx + Math.cos(a) * r * wob;
    const sy = cy + Math.sin(a) * r * wob;
    if (i === 0) g.moveTo(sx, sy);
    else g.lineTo(sx, sy);
  }
  g.closePath();
  g.fill();
  // 高光：一小片，别做成"镜面球"
  g.fillStyle = dark ? 'rgba(178,190,205,.42)' : 'rgba(255,255,255,.72)';
  g.beginPath();
  g.ellipse(cx - 4.4, cy - 4.8, 3.1, 2.1, -0.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** 不规则闭合轮廓。石子、水洼、湿痕都用它 —— 齐整的圆在泥地上看着像贴图。
 *  `amp` 是半径的抖动幅度；抖动来自 `hash2`，同一格永远同一形状（截图可复现）。 */
function blobPath(g, cx, cy, r, seedX, seedY, amp) {
  g.beginPath();
  for (let i = 0; i <= 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    const wob = 1 + (hash2(seedX + i, seedY) - 0.5) * amp;
    const sx = cx + Math.cos(a) * r * wob;
    const sy = cy + Math.sin(a) * r * wob;
    if (i === 0) g.moveTo(sx, sy);
    else g.lineTo(sx, sy);
  }
  g.closePath();
}

/** 水洼：**平的一层积水，不是球**。
 *  ⚠️ 画成"中心亮、边缘暗的圆"会读成一颗球 —— 跟深色石子分不开，玩家会点上去才发现落不住子。
 *     所以这里故意反着来：**中心最深、边上收亮边**（水面张力），
 *     再加两条贴着上沿的天光反射；不加投影、不加压痕 —— 没有体积感才是水。 */
function drawPuddle(g, x, y) {
  const cx = px_(x);
  const cy = py_(y);
  const r = CELL / 2 - 0.8;
  g.save();
  // ① 泥里的湿边：比水面略大一圈的暗湿痕，让水"陷在泥里"（大部分落在格心采样块之外）
  g.strokeStyle = 'rgba(16,12,7,.44)';
  g.lineWidth = 3.6;
  blobPath(g, cx, cy, r + 1.8, x + 3, y + 11, 0.14);
  g.stroke();
  // ② 水面：中心深、边缘亮
  const grd = g.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
  grd.addColorStop(0, PAL.puddle);
  grd.addColorStop(0.74, PAL.puddle);
  grd.addColorStop(1, PAL.puddleRim);
  g.fillStyle = grd;
  blobPath(g, cx, cy, r, x + 3, y + 11, 0.09);
  g.fill();
  // ③ 天光：两条细长的反光贴着上沿（位置随格子固定 → 截图可复现）
  g.fillStyle = PAL.puddleSheen;
  for (const [ox, oy, rw, rh, rot] of [[-3.8, -6.2, 5.4, 1.25, -0.16], [3.1, -8.0, 2.4, 0.95, -0.10]]) {
    g.beginPath();
    g.ellipse(cx + ox, cy + oy, rw, rh, rot, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function drawBand(g, band) {
  g.save();
  for (const [x, y] of band) {
    const cx = px_(x);
    const cy = py_(y);
    // 湿痕：**不规则**的一块 + 内部一道略深的潮线。
    // 上一版是半径 15.6 的正圆 —— 在盘上读成"一块圆片"，不像"这一带返潮了"。
    g.fillStyle = PAL.band;
    blobPath(g, cx, cy, CELL / 2 - 1.2, x + 5, y + 17, 0.17);
    g.fill();
    g.strokeStyle = 'rgba(92,80,58,.16)';
    g.lineWidth = 2.4;
    blobPath(g, cx, cy, CELL / 2 - 3.4, x + 5, y + 17, 0.17);
    g.stroke();
  }
  // 再点几颗露水：让"这一带要渗水"是**看得见**的
  g.fillStyle = 'rgba(186,224,236,.55)';
  for (const [x, y] of band) {
    for (let i = 0; i < 3; i += 1) {
      const a = hash2(x * 3 + i, y * 5) * Math.PI * 2;
      const rr = 3 + hash2(x + i, y * 2) * 8;
      g.beginPath();
      g.arc(px_(x) + Math.cos(a) * rr, py_(y) + Math.sin(a) * rr, 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** 连成五子的那五个圈子。半径 16.2 是为了**避开格心 26×26 采样块**（±13）——
 *  不然像素断言会把胜负圈算进"这颗子是什么颜色"里。 */
function drawWinRings(g, cells) {
  g.save();
  g.strokeStyle = 'rgba(246,240,225,.30)';
  g.lineWidth = 5;
  for (const [x, y] of cells) {
    g.beginPath();
    g.arc(px_(x), py_(y), 16.2, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = PAL.chalk;
  g.lineWidth = 2.2;
  for (const [x, y] of cells) {
    g.beginPath();
    g.arc(px_(x), py_(y), 16.2, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

/* ══════════════ 样式 ══════════════ */

function ensureStyle() {
  if (document.getElementById('mud-gomoku-style')) return;
  const s = document.createElement('style');
  s.id = 'mud-gomoku-style';
  // ⚠️ 这一支用的是**浅色纸面**（玩法板身是浅墨纸卷），所以字色走 --ink-* 令牌；
  //    棋盘自己的颜色全在 canvas 里（PAL），不进 CSS。
  // ⚠️ 绝对定位只有两处：`.smini8-cv` 与 `.smini8-grid`，都挂在 `.smini8-boardwrap`
  //    （position:relative）里；**格心与画布共用同一套坐标**（都是 PAD + i*CELL + CELL/2），
  //    所以"看见的位置 = 判定的位置"是构造保证的，不是靠运气（夜校那轮栽在这一点上）。
  // ⚠️ CSS 注释里不要出现反引号。
  // ⚠️ 盘面尺寸**全部由 N / CELL / PAD 推出来**（原来是写死的 330/306/12/34）：
  //    改棋盘大小只需要动上面那三个常量，样式、画布、命中格、导出几何会一起跟着走。
  //    写死过一次的代价：把 CELL 从 34 调到 52 时，四处尺寸得手工对齐，漏一处就"看着能点、点下去不是那格"。
  const DOT = Math.round(CELL * 0.26);            // 落点预览的小圆点（随格子成比例）
  s.textContent = `
.smini8-wrap { display:flex; flex-direction:column; gap:10px; }
.smini8-lead { margin:0; font-size:13px; line-height:1.8; color:#3f3524; }
.smini8-lead .dim { color:#7a6c53; }
.smini8-mid { display:flex; gap:14px; align-items:flex-start; }
.smini8-boardwrap { position:relative; width:${BOARD_PX}px; height:${BOARD_PX}px; flex:0 0 auto;
  border-radius:5px; overflow:hidden;
  box-shadow: inset 0 0 0 1px rgba(58,46,28,.55), 0 2px 7px rgba(40,32,20,.30); }
.smini8-cv { position:absolute; left:0; top:0; width:${BOARD_PX}px; height:${BOARD_PX}px; display:block; }
.smini8-grid { position:absolute; left:${PAD}px; top:${PAD}px; width:${N * CELL}px; height:${N * CELL}px;
  display:grid; grid-template-columns:repeat(${N},${CELL}px); grid-template-rows:repeat(${N},${CELL}px);
  z-index:2; }
.smini8-cell { width:${CELL}px; height:${CELL}px; padding:0; margin:0; border:0;
  background:transparent; position:relative; cursor:default; border-radius:50%; }
.smini8-cell[data-mini-action="place"] { cursor:pointer; }
.smini8-cell[data-mini-action="place"]::after { content:''; position:absolute;
  left:50%; top:50%; width:${DOT}px; height:${DOT}px; margin:-${DOT / 2}px 0 0 -${DOT / 2}px; border-radius:50%;
  background:rgba(250,244,228,.46); box-shadow:0 0 0 1px rgba(60,48,28,.35); }
.smini8-cell[data-mini-action="place"]:hover::after { background:rgba(255,252,240,.86); }
.smini8-cell[data-mini-action="place"]:focus-visible { outline:2px solid #6b7f52; outline-offset:-3px; }
.smini8-side { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:7px; }
.smini8-say { min-height:40px; font-size:13px; line-height:1.7; color:#332b1d;
  background:rgba(255,252,244,.62); border:1px solid rgba(120,100,70,.34);
  border-radius:4px; padding:5px 8px; }
.smini8-say .who { color:#8a6a3a; }
.smini8-kv { display:flex; flex-wrap:wrap; gap:3px 10px; font-size:12px; color:#5c4f38; }
.smini8-kv b { color:#2c2416; }
.smini8-log { list-style:none; margin:0; padding:0; font-size:12px; line-height:1.75;
  color:#5c4f38; min-height:44px; }
.smini8-log i { font-style:normal; color:#2c2416; }
.smini8-acts { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.smini8-btn { font:inherit; font-size:12px; line-height:1.4; padding:4px 9px;
  border-radius:3px; border:1px solid rgba(90,74,48,.5); background:rgba(255,252,244,.72);
  color:#2f2718; cursor:pointer; }
.smini8-btn:hover { background:rgba(255,255,250,.95); }
.smini8-btn[disabled] { opacity:.45; cursor:default; }
.smini8-btn.pri { background:#3f4a34; color:#f3ecdc; border-color:#2c3424; }
.smini8-btn.wide { width:100%; text-align:left; }
.smini8-toggle { font-size:12px; color:#5c4f38; display:flex; align-items:center; gap:5px; }
.smini8-status { border-top:1px dashed rgba(120,100,70,.40); padding-top:8px;
  display:flex; flex-direction:column; gap:5px; }
.smini8-fb { font-size:13px; line-height:1.8; color:#3f3524; }
.smini8-judge { font-size:13px; line-height:1.8; color:#2c2416; }
.smini8-pick { display:flex; flex-direction:column; gap:4px; width:100%; }
.smini8-picklab { font-size:12px; line-height:1.6; color:#5c4f38; }
.smini8-picklab b { color:#2c2416; }
.smini8-pick .smini8-btn { text-align:left; }
`;
  document.head.appendChild(s);
}

/* ══════════════ 玩法本体 ══════════════ */

/**
 * @param {HTMLElement} container
 * @param {{stats?:HTMLElement, id?:string, state?:object, level?:string,
 *          handicap?:boolean, autoStart?:boolean, spectate?:boolean,
 *          ai?:boolean, rnd?:()=>number}} [opts]
 * @returns {Promise<{score:number, detail:object, summary:string}>}
 */
export function runMudGomoku(container, opts = {}) {
  return new Promise((resolve) => {
    ensureStyle();

    let alive = true;
    let settled = false;
    let busy = false;                   // 一次只推进一手（观棋/小鬼思考期间挡重复点击）
    let mode = 'setup';                 // setup | play | spectate | done
    let turn = 1;                       // 1 = 你（深色）  2 = 小鬼（浅色）
    const board = makeBoard();
    let puddles = [];
    let blocked = new Set();
    let band = null;                    // 渗水预告带
    let nextPuddleAt = PUDDLE_FIRST;
    let moves = 0;
    let handicap = !!opts.handicap;
    let level = opts.level || DEFAULT_LEVEL;
    // 2026-09-17：**默认走模型**（原来默认关，对手每一手都由本地引擎算 —— 赛制要求
    // "游戏 AI 决策必须通过指定大模型实现，不得用独立算法替代"，默认关等于每局都没有
    // 一次 gomoku_move 调用、日志里也拿不出证据）。显式传 ai:false 仍可关掉；
    // 模型的每一手仍受 10 秒窗口与合法性校验约束，超时/不合法就落回引擎（看到"他在想"时催一手更快）。
    let aiOn = opts.ai !== false;
    let aiPending = false;
    let kidSeq = 0;                     // 小鬼这一手的序号：催他/结算都会 +1，作废在飞的请求
    // 小鬼这一手要说的话。⚠️ 必须由 `afterMove` 消费 —— 换手时会把状态栏刷成固定嘲讽，
    //    不在这里过渡一下的话，模型写的那句只活几个毫秒（E8 抓到过）。
    let lastSay = '';
    let waitLeft = 0;
    let moveFrom = 'engine';
    let last = null;
    let winCells = null;
    let result = null;
    let raf = 0;
    let timer = 0;
    const rnd = typeof opts.rnd === 'function' ? opts.rnd : Math.random;
    const statsHost = opts.stats || null;
    const reduceMotion = !!(window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* ── DOM ── */
    const lead = h('p', { class: 'smini8-lead' });
    const cv = h('canvas', { class: 'smini8-cv' });
    const grid = h('div', { class: 'smini8-grid' });
    const boardWrap = h('div', { class: 'smini8-boardwrap' }, [cv, grid]);
    const sayEl = h('div', { class: 'smini8-say' });
    const kvEl = h('div', { class: 'smini8-kv' });
    const logEl = h('ul', { class: 'smini8-log' });
    const actsEl = h('div', { class: 'smini8-acts' });
    const fbEl = h('div', { class: 'smini8-fb' });
    const judgeEl = h('div', { class: 'smini8-judge' });
    const statusEl = h('div', { class: 'smini8-status' }, [fbEl, judgeEl]);
    const side = h('div', { class: 'smini8-side' }, [sayEl, kvEl, logEl, actsEl]);
    const mid = h('div', { class: 'smini8-mid' }, [boardWrap, side]);
    const root = h('div', { class: 'smini8-wrap' }, [lead, mid, statusEl]);
    mount(container, root);

    container.dataset.mini = opts.id || 'mud-gomoku';
    container.dataset.miniState = 'setup';
    // 初始屏也要过一遍 renderSay：不然"他说话的地方"会空着摆一个白纸框
    // （resetTo 里调过，但首屏不走 resetTo —— 探针实测首屏 hidden=false、40px 空白盒）
    renderSay('', '');

    const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    cv.width = Math.round(BOARD_PX * DPR);
    cv.height = Math.round(BOARD_PX * DPR);
    const ctx = cv.getContext('2d');
    const bg = buildBg(DPR);
    // 画布几何给自动化：格心 = (PAD + i*CELL + CELL/2) × dpr（设备像素）
    container.dataset.miniBoard = JSON.stringify({ n: N, pad: PAD, cell: CELL, dpr: DPR, px: BOARD_PX });

    /* ── 棋盘命中层：81 个透明格，与画布的格心**同一套坐标** ── */
    const cells = [];
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const b = h('button', { type: 'button', class: 'smini8-cell' });
        b.dataset.x = String(x);
        b.dataset.y = String(y);
        b.setAttribute('aria-label', `${x + 1} 列 ${y + 1} 行`);
        b.onclick = () => playerPlace(x, y);
        grid.appendChild(b);
        cells.push(b);
      }
    }
    const cellAt = (x, y) => cells[y * N + x];

    /* ── 自清：容器被拆掉就收工（interval + isConnected，别用裸 rAF 当心跳）── */
    const guard = setInterval(() => {
      if (container.isConnected) return;
      teardown();
      if (!settled) {
        settled = true;
        resolve({ score: 0, detail: { outcome: 'none', why: 'detached' }, summary: '' });
      }
    }, 500);

    function teardown() {
      alive = false;
      clearInterval(guard);
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    }

    /* ── 画 ── */
    function paint() {
      if (!alive) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.drawImage(bg, 0, 0, BOARD_PX, BOARD_PX);
      if (band) drawBand(ctx, band);
      for (const [x, y] of puddles) drawPuddle(ctx, x, y);
      for (let y = 0; y < N; y += 1) {
        for (let x = 0; x < N; x += 1) if (board[y][x]) drawStone(ctx, x, y, board[y][x]);
      }
      if (last && board[last.y][last.x]) {
        // 最后一手的角标：小到不影响格心取色（像素断言靠格心，不靠它）
        ctx.fillStyle = PAL.mark;
        ctx.beginPath();
        ctx.arc(px_(last.x) + 10.5, py_(last.y) - 10.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (winCells) drawWinRings(ctx, winCells);
    }

    /* ── 契约：可点与不可点的分界全在 `syncCells()` 一处 ──
       ⚠️ 契约要求"不可操作的元素不要留 data-mini-action"，
       所以这个属性是每次同步时**装上/摘掉**的，不是一开始全装上。 */
    const legalNow = () => legalMoves(board, blocked).length;

    function syncCells() {
      const myTurn = mode === 'play' && !settled && turn === 1 && !aiPending;
      for (let y = 0; y < N; y += 1) {
        for (let x = 0; x < N; x += 1) {
          const c = cellAt(x, y);
          const ok = myTurn && board[y][x] === 0 && !blocked.has(kk(x, y));
          if (ok) c.setAttribute('data-mini-action', 'place');
          else c.removeAttribute('data-mini-action');
          c.disabled = !ok;
          if (board[y][x]) c.dataset.stone = board[y][x] === 1 ? 'you' : 'kid';
          else if (blocked.has(kk(x, y))) c.dataset.stone = 'puddle';
          else delete c.dataset.stone;
        }
      }
    }

    const count = (who) => {
      let n = 0;
      for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) if (board[y][x] === who) n += 1;
      return n;
    };

    function syncData() {
      const d = container.dataset;
      try {
        d.miniMode = mode;
        d.miniTurn = settled ? 'done' : (turn === 1 ? 'you' : 'kid');
        d.miniMoves = String(moves);
        d.miniYou = String(count(1));
        d.miniKid = String(count(2));
        d.miniPuddles = String(puddles.length);
        d.miniPuddleNext = String(
          puddles.length >= PUDDLE_MAX ? -1 : Math.max(0, nextPuddleAt - moves),
        );
        d.miniBand = band ? band.map(([x, y]) => `${x},${y}`).join(';') : '';
        d.miniLegal = String(legalNow());
        // 棋盘本身也暴露出来：自动化要能"照着局面算一手"（qa-gomoku 的强驱动就靠它），
        // 而且它让"像素看到的棋盘"与"代码里的棋盘"能直接对账。
        d.miniBoardText = boardText(board, blocked).replace(/\n/g, '/');
        d.miniLast = last ? `${last.x},${last.y}` : '';
        d.miniMoveFrom = moveFrom;
        d.miniHandicap = handicap ? '1' : '0';
        d.miniLevel = level;
        d.miniAi = aiOn ? '1' : '0';
        d.miniWait = String(waitLeft);
        if (result) d.miniOutcome = result;
      } catch { /* 已拆 */ }
      refreshStats();
    }

    function phaseWord() {
      if (settled) return '散场';
      if (mode === 'setup') return '开局';
      if (aiPending) return '他在想';
      if (mode === 'spectate') return '观棋';
      return turn === 1 ? '该你' : '该他';
    }

    function refreshStats() {
      stats(statsHost, [
        ['手数', moves],
        ['你的子', count(1)],
        ['他的子', count(2)],
        ['水洼', `${puddles.length}/${PUDDLE_MAX}`],
        ['局面', phaseWord()],
      ]);
    }

    function renderKv() {
      const bits = [];
      // 开局屏的档位由下面那行「对面坐的是…」+ 按下的按钮一起说，这里别再重复一遍
      if (mode !== 'setup') bits.push(`对手 <b>${LEVELS[level] ? LEVELS[level].label : level}</b>`);
      if (mode !== 'setup') bits.push(handicap ? '让你两子' : '实打实');
      if (puddles.length >= PUDDLE_MAX) bits.push('不会再多渗了');
      else if (band) bits.push('<b>下一处渗水就在这三格</b>');
      else if (mode !== 'setup') bits.push(`再过 <b>${Math.max(0, nextPuddleAt - moves)}</b> 手渗水`);
      kvEl.innerHTML = bits.join(' · ');
      kvEl.hidden = !bits.length;      // 没有局面可报时不要留一条空行
    }

    /** 只给 renderSay 用：who 是内部常量，text 可能来自模型（`renderSay('深色', m.say)`） */
    function escSay(s) {
      return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function renderSay(who, text) {
      // sayEl 是叶子容器（没有要保留的子元素）→ 写 innerHTML 是安全的
      // ⚠️ 但**内容**要转义：text 可能是模型写的那句话，写什么都不能当标签执行；
      // 其余调用点传的都是纯文本，过一遍没有副作用。
      sayEl.innerHTML = text ? `<span class="who">${escSay(who)}：</span>${escSay(text)}` : '';
      // 没人说话时**不要留一个空白纸框**（开局屏 / 收尾屏最容易看到这个空洞）
      sayEl.hidden = !text;
      // 也暴露给自动化：验"模型写的那句真的到了玩家眼前"（qt-gomoku E8 靠它）
      container.dataset.miniSay = text || '';
    }

    function renderLog() {
      logEl.innerHTML = '';
      if (!logLines.length) {
        logEl.appendChild(h('li', { text: '（还没落子）' }));
        return;
      }
      for (const line of logLines.slice(-5)) logEl.appendChild(h('li', { html: line }));
    }

    let logLines = [];

    function renderAll() {
      paint();
      syncCells();
      renderKv();
      renderLog();
      syncData();
    }

    function pushLog(who, x, y) {
      logLines.push(`${who === 1 ? '<i>你</i>' : '<i>他</i>'} ${String.fromCharCode(65 + x)}${y + 1}`);
    }

    /* ── 按钮区 ── */
    function renderActs() {
      actsEl.innerHTML = '';
      const btn = (label, action, cls) => {
        const b = h('button', { type: 'button', class: `smini8-btn ${cls || ''}`, text: label });
        b.setAttribute('data-mini-action', action);
        return b;
      };
      if (mode === 'setup') {
        lead.innerHTML = '宿营了。有人在泥地上用树枝刮了九道格，从草根底下挑出两把石子 —— '
          + '<b>深的是湿的，浅的是干的</b>。<br/>'
          + '<span class="dim">连成五子为赢。刚下过雨，棋盘上会渗水：<b>水洼里的格子落不住石子</b>，'
          + '而渗水前一回合，那一带会先显出来。</span>';

        // 对手档位。三档的差别是"他看得见多远的杀招"（见文件头 LEVELS 那段），
        // 不是噪声大小 —— 所以这个选择是真的，不是换个名字。
        const pick = h('div', { class: 'smini8-pick' });
        const cur = LEVELS[level] || LEVELS[DEFAULT_LEVEL];
        pick.appendChild(h('div', {
          class: 'smini8-picklab',
          html: `对面坐的是：<b>${cur.tier}</b>（${cur.label}）`,
        }));
        for (const key of ['easy', 'mid', 'hard']) {
          // 按钮上把难度档写在前面：玩家一眼能选"我要简单还是困难"
          const b = btn(`${LEVELS[key].tier} · ${LEVELS[key].label}`, 'level', key === level ? 'pri' : '');
          b.dataset.level = key;
          b.setAttribute('aria-pressed', key === level ? 'true' : 'false');
          b.onclick = () => { level = key; renderActs(); renderKv(); syncData(); };
          pick.appendChild(b);
        }

        const ba = btn('「你让两子吧」 —— 你先连落两子（好赢，但不算本事）', 'handicap', 'pri wide');
        ba.onclick = () => startGame(true);
        const bb = btn('「实打实来」 —— 你先落一子（输了别赖地滑）', 'fair', 'pri wide');
        bb.onclick = () => startGame(false);
        // 「不玩了」要**明确写成跳过**：原来只写"蹲一边看他俩下"，玩家不知道这就是不玩、
        // 更不知道点完流程照走（用户反馈：要有个不想玩的选项，而且不玩也要继续）。
        // 机制本来就是现成的——观棋按 SPECTATE_SCORE（0.5，中性分）结算，剧情照常往下走。
        const bc = btn('不玩了，让他们自己下（跳过这局，剧情照常走）', 'spectate');
        bc.onclick = () => startSpectate();
        actsEl.append(pick, ba, bb, h('div', { class: 'smini8-acts' }, [bc]));
        return;
      }
      if (mode === 'play') {
        const br = btn('推子认输', 'resign');
        br.disabled = busy || aiPending;
        br.onclick = () => finish('resign');
        actsEl.appendChild(br);
        if (aiPending) {
          const bu = btn('催他一手', 'urge', 'pri');
          bu.onclick = () => urge();
          actsEl.appendChild(bu);
        }
      }
      if (mode === 'spectate') {
        const bn = btn('下一手', 'next', 'pri');
        bn.disabled = busy;
        bn.onclick = () => spectateStep();
        actsEl.appendChild(bn);
      }
      const bag = btn('再来一盘', 'again');
      bag.disabled = busy;
      bag.onclick = () => resetTo('setup');
      actsEl.appendChild(bag);
      if (mode === 'play') {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = aiOn;
        cb.disabled = busy || aiPending;
        cb.setAttribute('data-mini-action', 'ai');
        cb.setAttribute('aria-label', '让小鬼子自己想办法');
        cb.onchange = () => { aiOn = cb.checked; syncData(); renderActs(); };
        actsEl.appendChild(h('label', { class: 'smini8-toggle' }, [
          cb,
          h('span', {
            text: aiOn
              ? '让小鬼自己想（每一手都由模型来定，最多等 10 秒，可随时「催他一手」）'
              : '不用等：他随手就落（快，但这一局的走棋不由模型决定）',
          }),
        ]));
      }
    }

    /* ── 对局流程 ── */

    function resetTo(next) {
      if (!alive) return;
      busy = false;
      aiPending = false;
      kidSeq += 1;
      clearTimeout(timer);
      for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) board[y][x] = 0;
      puddles = [];
      blocked = new Set();
      band = null;
      nextPuddleAt = PUDDLE_FIRST;
      moves = 0;
      last = null;
      winCells = null;
      result = null;
      logLines = [];
      waitLeft = 0;
      moveFrom = 'engine';
      lastSay = '';
      turn = 1;
      mode = next;
      settled = false;
      fbEl.textContent = '';
      judgeEl.textContent = '';
      renderSay('', '');
      container.dataset.miniState = next;
      renderActs();
      renderAll();
    }

    function startGame(handicapOn) {
      handicap = handicapOn;
      resetTo('play');
      if (handicap) {
        // 让两子：你先连落两子（中腹上下，不是随便乱塞）
        place(1, 4, 4);
        place(1, 4, 5);
        last = { x: 4, y: 5 };
      }
      renderSay('小鬼', handicap ? '行，让你两子。你可别输。' : '那就实打实。我先看你怎么起手。');
      renderAll();
      container.dataset.miniState = 'play';
    }

    function startSpectate() {
      handicap = false;
      level = DEFAULT_LEVEL;
      resetTo('spectate');
      container.dataset.miniState = 'spectate';
      renderSay('小鬼', '你看着，我俩下。有本事你替他想。');
      renderAll();
    }

    /** 玩家点格 */
    function playerPlace(x, y) {
      if (mode !== 'play' || settled || busy || aiPending || turn !== 1) return;
      if (board[y][x] !== 0 || blocked.has(kk(x, y))) return;
      place(1, x, y);
      moveFrom = 'you';
      afterMove();
    }

    /** 真落子（谁、哪儿）*/
    function place(who, x, y) {
      board[y][x] = who;
      moves += 1;
      last = { x, y };
      pushLog(who, x, y);
      SFX('click');
      splash();
    }

    /** 落子那一下的"泥点"：只跑 260ms，减动效下直接跳过 */
    function splash() {
      if (reduceMotion) return;
      const t0 = performance.now();
      const at = last;
      const step = () => {
        if (!alive) return;
        const p = (performance.now() - t0) / 260;
        paint();
        if (p >= 1) return;
        ctx.save();
        ctx.strokeStyle = `rgba(28,22,14,${(0.5 * (1 - p)).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(px_(at.x), py_(at.y), 13 + p * 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }

    /** 一手之后的公共收尾：判胜负 → 渗水 → 换手 */
    function afterMove() {
      const five = findFive(board, turn);
      if (five) { winCells = five; finish(turn === 1 ? 'win' : 'lose'); return; }
      if (legalNow() === 0) { finish('draw'); return; }
      schedulePuddle();
      if (turn === 1) {
        turn = 2;
        renderAll();
        renderActs();
        kidTurn();
      } else {
        turn = 1;
        renderAll();
        renderActs();
        // ⚠️ 模型（或「催他一手」）刚写的那句优先；没有才轮到固定嘲讽。
        //    不这么写的话，这一句会把模型的话盖掉 —— 状态栏里永远只剩"……让我想想"。
        const line = lastSay || (band ? '渗水的痕已经显出来了。'
          : TAUNTS[Math.floor(rnd() * TAUNTS.length)]);
        lastSay = '';
        renderSay('小鬼', line);
      }
    }

    /** 渗水：预告 → 落定。**全程公开**，上一手就能看见。 */
    function schedulePuddle() {
      if (puddles.length >= PUDDLE_MAX) { band = null; return; }
      if (moves >= nextPuddleAt) {
        const spot = band
          ? band.filter(([x, y]) => board[y][x] === 0 && !blocked.has(kk(x, y)))
          : null;
        if (spot && spot.length) {
          const pick = spot[Math.floor(rnd() * spot.length)];
          puddles.push(pick);
          blocked.add(kk(pick[0], pick[1]));
        }
        band = null;
        nextPuddleAt += PUDDLE_EVERY;
        if (mode === 'play') {
          renderSay('小鬼', TAUNT_PUDDLE[Math.floor(rnd() * TAUNT_PUDDLE.length)]);
        }
      } else if (moves === nextPuddleAt - 1 && !band) {
        band = planBand(board, blocked, last, rnd);
      }
    }

    /** 小鬼的回合 */
    function kidTurn() {
      if (settled || !alive) return;
      if (aiOn) { requestKidMove(); return; }
      // 默认路径：引擎落子，**0 次模型调用**
      timer = setTimeout(() => {
        if (settled || !alive) return;
        const mv = chooseMove(board, blocked, 2, level, rnd);
        if (!mv) { finish('draw'); return; }
        moveFrom = 'engine';
        place(2, mv.x, mv.y);
        afterMove();
      }, 260 + rnd() * 300);
    }

    /** 走模型：把引擎的 4 个候选交给它挑一个，10 秒窗口，超时/非法一律落回引擎 */
    async function requestKidMove() {
      const seq = ++kidSeq;
      busy = true;
      aiPending = true;
      moveFrom = 'engine';
      waitLeft = Math.round(AI_WINDOW_MS / 1000);
      container.dataset.miniState = 'think';
      renderSay('小鬼', '捏着石子，半天不落 —— 他在想。');
      renderAll();
      renderActs();
      const ticker = setInterval(() => {
        if (!alive || !aiPending) { clearInterval(ticker); return; }
        waitLeft = Math.max(0, waitLeft - 1);
        syncData();
      }, 1000);
      const cands = topCandidates(board, blocked, 2, level, 4, rnd);
      const out = await decideWithin({
        scene: '泥地五子棋·小鬼落子',
        callType: 'gomoku_move',
        situation: '轮到小鬼落子了',
        state: opts.state || {},
        agent: '一个十五六岁的红小鬼，走了一整天草地，鞋是湿的，嘴硬但心不坏',
        operation: {
          type: 'gomoku_move',
          size: N,
          side: 'kid',
          legend: 'X = 玩家（深色石子）；O = 小鬼自己（浅色石子）；'
            + '~ = 渗水的水洼格，落不住石子；. = 空地。x 从左到右 0-8，y 从上到下 0-8。',
          board: boardText(board, blocked),
          moveNo: moves,
          puddles: puddles.map(([x, y]) => `${x},${y}`),
          puddleNote: '水洼格不能落子，但可以把对手那条线封死。',
          candidates: cands.map((c, i) => ({ i, x: c.x, y: c.y, note: c.note })),
        },
      }, AI_WINDOW_MS);
      clearInterval(ticker);
      if (!alive || settled || seq !== kidSeq) return;   // 被「催他一手」或结算作废
      busy = false;
      aiPending = false;
      waitLeft = 0;

      let mv = null;
      let say = '';
      if (out && !out._error && Number.isInteger(Number(out.pick))) {
        const c = cands[Number(out.pick)];
        if (c && board[c.y][c.x] === 0 && !blocked.has(kk(c.x, c.y))) {
          mv = c;
          moveFrom = 'model';
          say = typeof out.say === 'string' ? out.say.slice(0, 40) : '';
        }
      }
      if (!mv) { mv = chooseMove(board, blocked, 2, level, rnd); moveFrom = 'engine'; }
      if (!mv) { finish('draw'); return; }
      lastSay = say;                      // 交给 afterMove 去显示，别让它被固定嘲讽冲掉
      place(2, mv.x, mv.y);
      afterMove();
    }

    /** 「催他一手」：不等了，引擎立刻落 —— 这是"不让玩家站着等"的出口 */
    function urge() {
      if (!aiPending || settled || !alive) return;
      kidSeq += 1;                        // 作废在飞的那次请求
      aiPending = false;
      busy = false;
      waitLeft = 0;
      moveFrom = 'engine';
      const mv = chooseMove(board, blocked, 2, level, rnd);
      if (!mv) { finish('draw'); return; }
      lastSay = '（他想太久了，随手一放）';
      place(2, mv.x, mv.y);
      afterMove();
    }

    /** 观棋：玩家按一次，两边各问一次（同一局面，**并发**），都受 10 秒窗口约束 */
    async function spectateStep() {
      if (mode !== 'spectate' || settled || busy || !alive) return;
      busy = true;
      container.dataset.miniState = 'spectate-think';
      renderSay('你', '（你在看。）');
      renderAll();
      renderActs();
      const both = await Promise.all([1, 2].map((who) => askFor(who)));
      if (!alive || settled) return;
      for (const m of both) {
        if (settled) break;
        let mv = m.move;
        if (!mv || board[mv.y][mv.x] !== 0 || blocked.has(kk(mv.x, mv.y))) {
          mv = chooseMove(board, blocked, m.who, level, rnd);
        }
        if (!mv) { finish('draw'); return; }
        turn = m.who;
        place(m.who, mv.x, mv.y);
        if (m.say) renderSay(m.who === 1 ? '深色' : '浅色', m.say);
        const five = findFive(board, m.who);
        if (five) { winCells = five; finishDarkOrLight(m.who); return; }
        if (legalNow() === 0) { finishDarkOrLight(0); return; }
        schedulePuddle();
      }
      turn = 1;
      busy = false;
      container.dataset.miniState = 'spectate';
      renderAll();
      renderActs();
    }

    async function askFor(who) {
      const cands = topCandidates(board, blocked, who, level, 4, rnd);
      const out = await decideWithin({
        scene: '泥地五子棋·观棋',
        callType: 'gomoku_move',
        situation: `有个人蹲在旁边看。现在轮到${who === 1 ? '执深色' : '执浅色'}那一方落子。`,
        state: opts.state || {},
        agent: who === 1
          ? '一个执深色石子的红小鬼，个子高一点，嘴上不让人'
          : '一个执浅色石子的红小鬼，年纪小一点，输了就闹',
        operation: {
          type: 'gomoku_move',
          size: N,
          side: who === 1 ? 'dark' : 'light',
          legend: 'X = 执深色石子那一方；O = 执浅色那一方；~ = 渗水的水洼格；. = 空地。'
            + 'x 从左到右 0-8，y 从上到下 0-8。',
          board: boardText(board, blocked),
          moveNo: moves,
          candidates: cands.map((c, i) => ({ i, x: c.x, y: c.y, note: c.note })),
        },
      }, AI_WINDOW_MS);
      let mv = null;
      let say = '';
      if (out && !out._error && Number.isInteger(Number(out.pick))) {
        const c = cands[Number(out.pick)];
        if (c) { mv = c; say = typeof out.say === 'string' ? out.say.slice(0, 40) : ''; }
      }
      return { who, move: mv, say };
    }

    /* ── 结算 ── */
    const finishDarkOrLight = (winner) => finish(winner === 1 ? 'win' : winner === 2 ? 'lose' : 'draw');

    function finish(res) {
      if (settled) return;
      settled = true;
      busy = false;
      aiPending = false;
      kidSeq += 1;
      clearTimeout(timer);
      result = res;
      const spectated = mode === 'spectate';
      const g = spectated
        ? gradeSpectate(res === 'win' ? 1 : res === 'lose' ? 2 : 0)
        : gradeGame({ result: res, handicap, moves, puddles: puddles.length });
      const yourRun = longestRun(board, 1);

      container.dataset.miniState = 'done';
      container.dataset.miniOutcome = g.outcome;
      SFX(res === 'win' ? 'correct' : res === 'draw' ? 'echo' : 'wrong');

      // 结束后**不留可点的残骸**：先把按钮区清空，再切 mode 让 81 格一起摘掉操作标记
      actsEl.innerHTML = '';
      mode = 'done';
      renderAll();
      // 结算别把嘴收掉：让他对结果有一句反应，比一个空纸框强
      renderSay('小鬼', spectated
        ? '看完了。你说说，谁下得好。'
        : res === 'win'
          ? '……行。这盘算你的。'
          : res === 'lose'
            ? '嘿嘿。老兵没骗我吧。'
            : '堵死了，谁也没连成。再来一盘？');
      fbEl.textContent = g.judge;
      judgeEl.textContent = spectated
        ? `${moves} 手 · 水洼 ${puddles.length} 处 · 你只是在看`
        : `${moves} 手 · 水洼 ${puddles.length} 处 · ${handicap ? '让两子' : '实打实'}`;

      const winWord = spectated
        ? (g.outcome === 'spectate-dark' ? '看完了：深色赢了'
          : g.outcome === 'spectate-light' ? '看完了：浅色赢了' : '看完了：谁也没连成')
        : res === 'win' ? (handicap ? '你连成五子（让两子）' : '你连成五子（实打实）')
          : res === 'lose' ? '小鬼连成五子'
            : res === 'draw' ? '棋盘满了，平局' : '你推子认输';

      resolve({
        score: g.score,
        detail: {
          outcome: g.outcome,
          score: g.score,
          cap: g.cap,
          result: spectated ? 'spectate' : res,
          spectateWinner: spectated ? (res === 'win' ? 1 : res === 'lose' ? 2 : 0) : 0,
          moves,
          handicap,
          level,
          puddles: puddles.length,
          puddleCells: puddles.map(([x, y]) => `${String.fromCharCode(65 + x)}${y + 1}`),
          you: count(1),
          kid: count(2),
          yourBestRun: yourRun,
          kidBestRun: longestRun(board, 2),
          line: winCells ? winCells.map(([x, y]) => `${String.fromCharCode(65 + x)}${y + 1}`).join('-') : '',
          moveFrom,
          judge: g.judge,
          effects: {},          // 数值交给主线的 minigame_review，玩法自己不带 effects
        },
        summary: `泥地五子棋：${winWord}（${moves} 手，水洼 ${puddles.length} 处）`,
      });
    }

    /* ── 10 秒窗口：计时器与请求**赛跑**，谁先到算谁。
       ⚠️ 只给 fetch 传 AbortSignal 不够硬 —— 上限就成了"底层肯不肯听话"的赌注
       （分糖那轮被一个无视 signal 的假接口抓到过）。── */
    async function decideWithin(payload, ms) {
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

    /* ── 开局 ── */
    renderActs();
    renderAll();
    if (opts.spectate) startSpectate();
    else if (opts.autoStart || opts.handicap !== undefined) startGame(!!opts.handicap);
  });
}

/** 给模型看的棋盘（X=深色，O=浅色，~=水洼，.=空） */
export function boardText(board, blocked) {
  const rows = [];
  for (let y = 0; y < N; y += 1) {
    let line = '';
    for (let x = 0; x < N; x += 1) {
      if (board[y][x] === 1) line += 'X';
      else if (board[y][x] === 2) line += 'O';
      else if (blocked.has(kk(x, y))) line += '~';
      else line += '.';
    }
    rows.push(line);
  }
  return rows.join('\n');
}

/** 格心坐标（画布 CSS 像素）—— 自动化与像素断言共用，避免两边各算一套。 */
export function cellCenter(x, y) {
  return { x: px_(x), y: py_(y) };
}

/* ══════════════ 调试台规格 ══════════════ */

export const GOMOKU_MINIGAMES = [
  {
    id: 'mud-gomoku',
    title: '泥地五子棋',
    family: '对弈',
    act: 'act4 · 草地（热点 gomoku）',
    note: '旧版是 81 个色块格子 + 一步贪心。这一版：泥地划痕棋盘、石子有体积（深的是湿青灰石、'
      + '浅的是干石灰石）、开局一次真抉择（接不接让子，直接改结算上限）、**开局可以挑对手**'
      + '（三档的差别是"他看得见多远的杀招"：只看四 / 也看四 / 还能算双活三）、'
      + '中盘有一条公开的变数「渗水」（水洼落不住子，渗水前一回合先显湿痕）。'
      + 'AI 两条用途：让小鬼子自己挑落点（10 秒窗口 + 催他一手）；或蹲一边看它俩下。默认 0 次调用。',
    states: ['setup', 'play', 'think', 'spectate', 'spectate-think', 'done'],
    actions: ['level', 'handicap', 'fair', 'spectate', 'place', 'urge', 'resign', 'next', 'again', 'ai'],
    run: (host, o = {}) => runMudGomoku(host, o),
  },
];

export const CARDS = GOMOKU_MINIGAMES;
