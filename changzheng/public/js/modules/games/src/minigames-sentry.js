/**
 * 《夜岗 · 五个信号》（**重做版 · 单独开发，未接入主线**）
 *
 * ── 它取代的是什么 ──
 *   旧版（minigames.js 的 runSentry，108 行）：五个写死的信号，每个三个选项，选对加一分，
 *   最后 `hits/5` 就是分数。问题有三处，任何一处都足以毁掉这个玩法：
 *     ① **五个信号里，除口令题外正确答案全部落在 index 1（中间那个）** ——
 *        玩家点三次就会发现"永远点中间"，剩下的两下是盲点。玩法退化成装饰。
 *     ② **没有代价。** 处置错了只是少一分，玩家没有在赌任何东西。
 *        `wrong` 音效一响，下一个信号照旧，什么都不变。
 *     ③ **没有失败。** 最低 0 分，不存在"输"。而这支玩法的史实内核恰恰是
 *        "误报、漏报都可能让整支队伍付出代价"（data/facts.json · h_sentry）——
 *        代价是它的主题，旧版一刀切掉了。
 *   画面同样是空的：`.sentry-box` 是一张白纸 + 一行 20px 的字 + 一排 `← · →` 箭头，
 *   而那排箭头写的是 `idx % 2 === 0 ? '← · →' : '· ↑ ·'` —— 跟信号内容毫无关系，纯装饰。
 *   所谓"听声辨位"根本没有被表达：玩家看到的是**文字**，不是**声音**。
 *
 * ── 史实锚点 ──
 *   data/facts.json · h_sentry：
 *   "行军宿营时部队设岗哨、定口令，以防敌特袭扰与野兽；**误报、漏报都可能让整支队伍付出代价**，
 *    因此哨位强调**听声辨向、口令对答与不轻易暴露位置**。"
 *   这一局的三件事就是从这句里拆出来的：
 *     · 听声辨向 → **方位盘**（信号从哪个扇区来、多远）
 *     · 口令对答 → **口令题**（夜校学到的口令在这里生效）
 *     · 不轻易暴露位置 → **马灯**（照亮 = 拿到真相 = 位置暴露）
 *
 * ── 玩家的决策在哪 ──
 *   两个资源，不是一个。这是这一版和旧版最大的差别：
 *     · **惊动**（over，误报）：处置过重 —— 拉栓、开枪、喊人、挪哨位、举灯。
 *     · **漏**  （under，漏报）：处置过轻 —— 不管它、接着睡、蹲回去。
 *   两个方向**都会**让队伍付代价，而且**上限不同**（惊动 ≥4 才出事，漏 ≥3 就出事），
 *   所以"一路保守"和"一路激进"都走不通 —— 这正是史实里那句"误报、漏报都可能"。
 *
 *   然后是**马灯（全场只有一盏）**：
 *     · 用灯 = 当场看清这个信号的真值，把"你猜"变成"你知道"；
 *     · 代价 = **惊动 +1**（史实明写"不轻易暴露位置"），而且**用掉就没了**。
 *   → 于是真正的决策是：**你并不知道哪个信号是拿不准的那个，灯要留给谁。**
 *   花在能读出来的信号上是白举（界面会当场告诉你"这一句你读得出来"），
 *   花在拿不准的那个上就赚到一次确定性。五个信号里有两个是拿不准的。
 *
 * ── 失败条件（两条，都不是"分低"）──
 *   · `exposed`  惊动 ≥4 → 哨位被摸熟，天亮前东边的草动了一下。**分数压到 0.25 以下。**
 *   · `breached` 漏   ≥3 → 有人摸到了营地边上，天亮时营地外多了一行脚印。**分数压到 0.3 以下。**
 *   两条都在**结算屏**才落地 —— 局内只给计数，不给结论。
 *
 * ── 两条打法的分叉（实测数字见 docs/HANDOFF-SENTRY.md）──
 *   · 读得细 + 灯用在对的信号上 → 0.8；赌对了那一下 → 1.0；
 *   · 全程"图省事"（不管它／接着睡）→ 触 `breached`，0.2；
 *   · 全程"图安全"（拉栓／开枪／喊人／挪位）→ 触 `exposed`，0.25；
 *   · **不读线索只挑"看起来最谨慎"的那个** → 0.6（有两处"谨慎"其实是离开哨位）。
 *
 * ── 接不接 AI：**不接。这是量过之后的决定，不是省事** ──
 *   用户定的口径：AI 必须融进游戏，但**不许影响体验**；超过 10 秒就换固定内容。
 *   2026-09-15 在同一个比赛网关上实测：
 *     · `npm run check:glm` 极简探测（26 → 上限 256 tokens）：**6793 ms**，
 *       而且 `finish=length` —— 256 个 token 全烧在隐藏推理上，连 `{"ok":true` 都没写完；
 *     · `glm-5.3-flash`（唯一可能更快的档）：**HTTP 403，本 Key 无权限**；
 *     · 叙事类调用（分糖那轮实测）：输出 **28 个字** 也要 **19–39 秒**，判词 53–64 秒。
 *   → 最省的一条也要 6.8 秒且内容不完整；这个玩法**没有任何一秒**可以让玩家站着等
 *     （每按一次处置就要看下一个信号）。所以游戏内 **0 次模型调用**。
 *   → AI 并没有缺席：夜岗在主线上本来就有一次结算调用
 *     （`minigame_review` 的 `operation.type === 'sentry'` 分支，prompt 早就写好了，
 *      而且那句"按误报与漏报写后果：漏报要付代价，误报同样要付代价"正好就是这一版的机制）。
 *     接线后由它接管，**不需要新增 callType，也不需要改 schema**。
 *     详见 docs/HANDOFF-SENTRY.md §五。
 *
 * 玩法 id：`sentry-watch`（**故意不复用 `sentry`** —— 调试台 `specOf` 按 id 查表，
 * 撞 id 会取到主线那份旧的。）
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

/** 板头数值签：与项目其他玩法同一个签名（stats(host, [[名, 值]])） */
function stats(_host, items) { return STATS(items); }

/* ══════════════ 阈值与常量 ══════════════ */

/** 惊动上限：到 4 就是"哨位被人看熟了" */
export const EXP_LIMIT = 4;
/** 漏的上限：到 3 就是"有人摸到了营地边上"。**故意比惊动低** —— 漏比惊动更致命，
 *  所以"一路保守"这条懒路走得比"一路激进"更短。 */
export const MISS_LIMIT = 3;
/** 马灯：全场一盏。 */
export const LAMP_TOTAL = 1;
export const TOTAL_SIGNALS = 5;

/** 方位盘。角度以"正上"为 0，顺时针为正；`polar()` 把它换算成 SVG 坐标（y 向下）。 */
export const SECTORS = [
  { id: 'front', label: '正前', a1: -45, a2: 45 },
  { id: 'right', label: '右前', a1: 45, a2: 135 },
  { id: 'back', label: '身后', a1: 135, a2: 225 },
  { id: 'left', label: '左前', a1: 225, a2: 315 },
];
export const SECTOR_LABEL = Object.fromEntries(SECTORS.map((s) => [s.id, s.label]));

/* ══════════════ 信号表 ══════════════

   每条信号的字段：
     `hear`    你**听到**的（客观，永远是真的）
     `read`    你**怎么想**的（主观解读；`open` 的那两条没有这句，界面改写成"说不准"）
     `open`    true = 这条是"拿不准"的：真值每局随机，读不出来，只能靠灯或赌
     `truth`   固定真值时写死；`open` 的不管它
     `lamp`    用灯照出来的真值原文
     `near`    距离（近 = 三道涟漪，远 = 一道）。**画面要编码信息，不能只做装饰。**
     `options[]` 每个选项带 `tier`：`right` 得当 / `over` 惊动 / `under` 漏

   ⚠️ **每条信号必须有且只有一个 `right`**（`gradeWatch` 与 `arrange` 都依赖这条），
      单测 `qa-sentry.mjs` 的 A 段逐条断言。加信号时先过这一条。
   ⚠️ `open` 的两条，两个真值下 **`right` 必须落在不同的选项上** —— 否则就出现
      "永远选那个"的支配解，等于把决策点取消了。A 段同样断言这一点。 */

export const SIGNALS = [
  {
    id: 'step',
    type: '脚步',
    when: '上半夜',
    sector: 'left',
    near: true,
    hear: '左前方，不远。两点一顿，像人压着草走。',
    read: '两点一顿 —— 四条腿的不会这么走。',
    open: false,
    truth: 'threat',
    lamp: '两个人，弓着腰，一步一停，正朝营地这边来。',
    options: [
      { label: '矮下身，盯住那个方向，手按在枪上', tier: { threat: 'right', harmless: 'right' } },
      { label: '拉栓，冲那边喝问口令', tier: { threat: 'over', harmless: 'over' } },
      { label: '想来是野物踩草，接着听别的方向', tier: { threat: 'under', harmless: 'under' } },
    ],
  },
  {
    id: 'ember',
    type: '光点',
    when: '上半夜',
    sector: 'right',
    near: false,
    hear: '右侧林线外，一点暗红，明灭两次，位置一直没挪，然后没了。',
    read: null,                       // ★ 拿不准：知道是烟头，但不知道是谁的
    open: true,
    lamp: '',
    options: [
      { label: '不动，记下位置，看他接下来干什么', tier: { threat: 'under', harmless: 'right' } },
      { label: '压低身子换个位，从侧面看清是谁', tier: { threat: 'right', harmless: 'over' } },
      { label: '举枪示警，把全班叫起来', tier: { threat: 'over', harmless: 'over' } },
    ],
  },
  {
    id: 'password',
    type: '口令',
    when: '中夜',
    sector: 'front',
    near: true,
    hear: '',
    read: '',
    open: false,
    truth: 'threat',
    lamp: '三步外站着个人影，枪口朝下，还在等你答话。',
    options: [],
  },
  {
    id: 'beast',
    type: '野物',
    when: '后半夜',
    sector: 'right',
    near: false,
    hear: '右前方，一声低吼，草窸窣一阵，渐远。',
    read: '吼完就走的，是野物 —— 它比你还怕你。',
    open: false,
    truth: 'harmless',
    lamp: '一只水鸭子，扑棱着翅膀往水泡子那边去了。',
    options: [
      { label: '不理会，接着听别的方向', tier: { threat: 'right', harmless: 'right' } },
      { label: '朝那个方向放一枪', tier: { threat: 'over', harmless: 'over' } },
      { label: '跟上去看看是什么', tier: { threat: 'over', harmless: 'over' } },
    ],
  },
  {
    id: 'hush',
    type: '静默',
    when: '天快亮',
    sector: 'back',
    near: true,
    hear: '身后，很长一段时间，什么都没有。风停了，草也不响。',
    read: null,                       // ★ 拿不准：可能是真没动静，也可能是有人也在等
    open: true,
    lamp: '',
    options: [
      { label: '按最坏的打算：矮下、盯住那个方向，手按在枪上', tier: { threat: 'right', harmless: 'over' } },
      { label: '想来是真没动静，接着听别的方向', tier: { threat: 'under', harmless: 'right' } },
      { label: '把哨位往前挪几步，离得更近些', tier: { threat: 'over', harmless: 'over' } },
    ],
  },
];

/** `open` 信号的真值原文（灯照出来的那句话）。写成表，跟选项表分开，读起来清楚。 */
const OPEN_LAMP = {
  ember: {
    threat: '树后面蹲着一个人，正拿烟头挡着火。他不是自己人。',
    harmless: '是二班换哨的人在树后抽最后一口，抽完就回去了。',
  },
  hush: {
    threat: '十步外的草，有一道刚折的痕，还在慢慢往回弹。',
    harmless: '草是平的，一颗露水都没碰掉。',
  },
};

/** 口令题：**同一个点，两种题面** —— 夜校学过口令就是道奖励题，没学过才是真难题。 */
const PASSWORD_OPTIONS = {
  known: [
    { label: '压低嗓子，把口令报回去', tier: 'right' },
    { label: '站直了大声报，让他听清', tier: 'over' },
    { label: '记不清了，端着枪不吭声', tier: 'under' },
  ],
  unknown: [
    { label: '压低身子不答，等他先动', tier: 'right' },
    { label: '大声喊人，把全班叫起来', tier: 'over' },
    { label: '不管他，蹲回去接着听别的', tier: 'under' },
  ],
};

/* ══════════════ 固定判词（按结局分）══════════════

   这支玩法**不接模型**，所以下面这几句就是全部判词，不存在"模型赶上了就升级"的路径。
   写法与主线那条 prompt 同一个口径：克制、不揭破、不羞辱、不喊口号。 */

export const FIXED_JUDGE = {
  clean: '后半夜风一直没起。你始终没动，也没出声。天亮时草叶上的水珠一颗一颗往下掉，营地还是那个营地。',
  steady: '交班的人来叫你，你才发现手冻得握不住枪。这一夜没出什么事。有人在梦里喊了一声，翻个身又睡了。',
  thin: '你把枪交出去，腿是木的。有人问夜里怎么样，你说没什么。其实有一回你听见了，只是没敢动。',
  exposed: '那盏灯你举得太久了。天亮前，东边的草动了一下，又不动了。这一天队伍绕了很远的路，走在最前面的人一直没回头。',
  breached: '天刚亮，有个战士在营地外十几步的地方站住了 —— 草里一行脚印，方向和你们走的不一样。他没有声张。',
};

/* ══════════════ 纯函数层（无 DOM，可直接单测）══════════════ */

/** 可复现的随机数发生器。测试里靠它把"某一局"钉死，否则验收数字每跑一次都不一样。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "正确答案该落在第几个位置"合不合法。**这是整支玩法最要紧的一条约束**，
 *  因为旧版就是栽在这里：五个信号的正确答案全在 index 1，玩家点三次就发现"永远点中间"。
 *  两条硬要求：① 三个位置都要出现（否则玩家能靠排除法缩到两个）；
 *             ② 不能连续三次落在同一个位置。
 *  导出它是为了**让验收脚本有反证的能力**：`patternOk([1,1,1,1,1])` 必须是 false，
 *  否则这条检查就是摆设。 */
export function patternOk(p) {
  if (!Array.isArray(p) || p.length < 3) return false;
  if (p.some((v) => ![0, 1, 2].includes(v))) return false;
  if (new Set(p).size < 3) return false;
  for (let i = 2; i < p.length; i += 1) {
    if (p[i] === p[i - 1] && p[i - 1] === p[i - 2]) return false;
  }
  return true;
}

/** 243 种组合里筛出来的合法模式。模块加载时算一次。 */
const CORRECT_PATTERNS = (() => {
  const out = [];
  for (let a = 0; a < 3; a += 1) {
    for (let b = 0; b < 3; b += 1) {
      for (let c = 0; c < 3; c += 1) {
        for (let d = 0; d < 3; d += 1) {
          for (let e = 0; e < 3; e += 1) {
            const p = [a, b, c, d, e];
            if (patternOk(p)) out.push(p);
          }
        }
      }
    }
  }
  return out;
})();

/** 把选项排成"正确项落在 correctAt"的顺序，其余位置随机。
 *  ⚠️ 依赖"每条信号只有一个 right"。 */
function arrange(options, correctAt, rnd) {
  const right = options.filter((o) => o.tier === 'right');
  const rest = options.filter((o) => o.tier !== 'right');
  // Fisher–Yates
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const out = new Array(options.length).fill(null);
  out[correctAt] = right[0];
  let k = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (!out[i]) { out[i] = rest[k]; k += 1; }
  }
  return out;
}

/** 口令题的题面按"有没有学过"换。`known` 时那句 read 是在替夜校邀功。 */
function buildPassword(base, password, rnd, correctAt) {
  const known = !!password;
  const options = (known ? PASSWORD_OPTIONS.known : PASSWORD_OPTIONS.unknown)
    .map((o) => ({ label: o.label, tier: o.tier }));
  return {
    ...base,
    hear: known
      ? `正前方，黑影低喝：「口令？」—— 今晚的口令是「${password}」，你在夜校学过。`
      : '正前方，黑影低喝：「口令？」—— 你脑子里一空。',
    read: known
      ? '今晚的口令是学过的，他在按规矩问。'
      : '答不上来。这会儿谁先动，谁吃亏。',
    lamp: base.lamp,
    options: arrange(options, correctAt, rnd),
    passwordKnown: known,
  };
}

/**
 * 排一局。
 * @param {{rnd?:()=>number, password?:string}} [opts]
 * @returns {Array} 五个信号，每个带已经排好序的 `options`（`tier` 已是字符串）
 */
export function planRun(opts = {}) {
  const rnd = typeof opts.rnd === 'function' ? opts.rnd : Math.random;
  const password = String(opts.password || '').trim();
  const pattern = CORRECT_PATTERNS[Math.floor(rnd() * CORRECT_PATTERNS.length)];

  const plan = [];
  let slot = 0;
  for (const s of SIGNALS) {
    const correctAt = pattern[slot];
    slot += 1;
    if (s.id === 'password') {
      plan.push(buildPassword(
        { id: s.id, type: s.type, when: s.when, sector: s.sector, near: s.near, open: false, truth: 'threat' },
        password, rnd, correctAt,
      ));
      continue;
    }
    const truth = s.open ? (rnd() < 0.5 ? 'threat' : 'harmless') : s.truth;
    const options = s.options.map((o) => ({ label: o.label, tier: o.tier[truth] }));
    plan.push({
      id: s.id,
      type: s.type,
      when: s.when,
      sector: s.sector,
      near: s.near,
      hear: s.hear,
      read: s.read || null,
      open: !!s.open,
      truth,
      lamp: s.open ? OPEN_LAMP[s.id][truth] : s.lamp,
      options: arrange(options, correctAt, rnd),
    });
  }
  return plan;
}

/** 外部注入的局要过的闸（自动化走这条路）。错一条就返回 null，调用方退回 planRun。 */
export function gatePlan(raw) {
  if (!Array.isArray(raw) || raw.length !== TOTAL_SIGNALS) return null;
  const out = [];
  for (const ev of raw) {
    if (!ev || typeof ev !== 'object') return null;
    const opts = Array.isArray(ev.options) ? ev.options : null;
    if (!opts || opts.length !== 3) return null;
    if (opts.filter((o) => o.tier === 'right').length !== 1) return null;   // ★ 唯一正确项
    if (opts.some((o) => !['right', 'over', 'under'].includes(o.tier))) return null;
    if (opts.some((o) => !String(o.label || '').trim())) return null;
    if (!SECTOR_LABEL[ev.sector]) return null;
    out.push({
      id: String(ev.id || 'x'),
      type: String(ev.type || '信号'),
      when: String(ev.when || ''),
      sector: ev.sector,
      near: ev.near !== false,
      hear: String(ev.hear || ''),
      read: ev.read ? String(ev.read) : null,
      open: !!ev.open,
      truth: ev.truth === 'harmless' ? 'harmless' : 'threat',
      lamp: String(ev.lamp || ''),
      options: opts.map((o) => ({ label: String(o.label), tier: o.tier })),
    });
  }
  // 注入的局**也必须过位置闸** —— 否则自动化可以塞一个"正确答案全在中间"的局进来，
  // 而那是旧版真正的病根（见 patternOk 的注释）。
  if (!patternOk(out.map((ev) => ev.options.findIndex((o) => o.tier === 'right')))) return null;
  return out;
}

/**
 * 算分（纯函数）。口径写清楚，免得后人改数字时不知道在改什么：
 *   · 没来得及选（`picks[i] == null`）**算漏** —— 停手不动同样是要付代价的处置；
 *   · 恰当数 / 5 是基础分；
 *   · 惊动 ≥4 → 压到 0.25 以下并判 `exposed`；漏 ≥3 → 压到 0.3 以下并判 `breached`；
 *   · 马灯本身**不加分**，它的价值全在"少犯一次错"上。这是故意的：灯不是奖励，是工具。
 */
export function gradeWatch(plan, picks, lampUsed) {
  const rows = [];
  let hits = 0;
  let over = 0;
  let miss = 0;
  for (let i = 0; i < plan.length; i += 1) {
    const ev = plan[i];
    const p = picks[i];
    const tier = (p === null || p === undefined || !ev.options[p]) ? 'under' : ev.options[p].tier;
    if (tier === 'right') hits += 1;
    else if (tier === 'over') over += 1;
    else miss += 1;
    rows.push({
      id: ev.id, type: ev.type, sector: ev.sector, truth: ev.truth,
      pick: (p === null || p === undefined || !ev.options[p]) ? null : ev.options[p].label,
      tier,
    });
  }
  const exp = over + (lampUsed ? 1 : 0);
  let outcome;
  let score = hits / plan.length;
  if (exp >= EXP_LIMIT) { outcome = 'exposed'; score = Math.min(score, 0.25); }
  else if (miss >= MISS_LIMIT) { outcome = 'breached'; score = Math.min(score, 0.3); }
  else outcome = hits === plan.length ? 'clean' : hits >= 4 ? 'steady' : 'thin';
  return {
    outcome,
    score: Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000,
    hits, over, miss, exp, lampUsed: !!lampUsed,
    total: plan.length,
    rows,
    judge: FIXED_JUDGE[outcome] || FIXED_JUDGE.thin,
  };
}

/** 一行短描述，喂给主线那条 `minigame_review` 与营地日志。 */
export function watchSummary(g) {
  return `夜岗：${g.hits}/${g.total} 处置得当，惊动 ${g.exp}，漏 ${g.miss}`
    + (g.lampUsed ? '，用了灯' : '，灯没举');
}

/* ══════════════ 画面 ══════════════ */

function ensureStyle() {
  if (document.getElementById('sentry-watch-style')) return;
  const s = document.createElement('style');
  s.id = 'sentry-watch-style';
  // 夜场：**字色一律写死浅色**，不用 --ink-*（那是浅色主题的深墨，压在夜底上等于没写）。
  // 交互元素全部走 flex/grid 正常流，**不用绝对定位** —— 夜校那轮就是因为
  // "绝对定位的定位父级"算错，把字画到了判定中心之外，六个打法全是 0 分而页面零报错。
  // 唯一绝对定位的是两层背景（`-sky` / `-sweep`），它们 pointer-events:none 且 z-index:0。
  // 注意：CSS 注释里**不要出现反引号** —— 模板字符串会被当场闭合，整个模块 SyntaxError。
  s.textContent = `
.smini7-wrap { position: relative; display: flex; flex-direction: column; gap: 9px; width: 100%;
  max-width: 720px; padding: 12px 14px 11px; border-radius: 8px; overflow: hidden;
  background: #10151d; border: 1px solid rgba(226,214,190,.16); }
.smini7-sky { position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(ellipse 62% 46% at 74% 120%, rgba(224,146,52,.30), rgba(224,146,52,0) 68%),
              linear-gradient(180deg, #16202c 0%, #10151d 62%, #0c1017 100%); }
.smini7-sweep { position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0;
  background: linear-gradient(105deg, rgba(196,220,246,0) 30%, rgba(196,220,246,.20) 50%, rgba(196,220,246,0) 70%);
  transition: opacity .22s ease; }
.smini7-wrap.exposed .smini7-sweep { opacity: 1; }
.smini7-wrap > *:not(.smini7-sky):not(.smini7-sweep) { position: relative; z-index: 2; }
.smini7-lead { margin: 0; font-family: var(--font-kai, "KaiTi", serif); font-size: 13.5px; line-height: 1.55;
  color: #e7dfcb; }
.smini7-lead b { color: #e8c073; font-weight: 400; }
.smini7-lead .dim { color: #97a0a8; }

.smini7-mid { display: flex; gap: 13px; align-items: stretch; }
.smini7-dial { flex: 0 0 auto; width: 176px; height: 176px; }
.smini7-dial svg { display: block; width: 100%; height: 100%; }

.smini7-side { flex: 1 1 auto; display: flex; flex-direction: column; gap: 7px; justify-content: center; min-width: 0; }
.smini7-hear { margin: 0; font-family: var(--font-kai, "KaiTi", serif); font-size: 16px;
  line-height: 1.5; color: #f2ece0; }
.smini7-when { font-size: 11.5px; letter-spacing: .14em; color: #8f9aa4; }
.smini7-read { margin: 0; font-size: 12.5px; line-height: 1.5; color: #9fb0bd;
  border-left: 2px solid rgba(196,220,246,.30); padding-left: 8px; }
.smini7-read b { color: #cfe0ef; font-weight: 400; }
.smini7-read.unclear { color: #d9bb84; border-left-color: rgba(232,192,115,.55); }

.smini7-meters { display: flex; flex-direction: column; gap: 5px; }
.smini7-meter { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #a9b4bd; }
.smini7-meter i { font-style: normal; letter-spacing: .16em; font-size: 12px; }
.smini7-meter .on { color: #e6985c; }
.smini7-meter .off { color: #4d5a64; }
.smini7-meter .past { color: #d9564a; }
.smini7-meter .miss.on { color: #8fb6d6; }
.smini7-meter b { color: #e6ddc8; font-weight: 400; }

.smini7-lampRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.smini7-lamp { padding: 6px 12px; font-size: 12.5px; border-radius: 4px; cursor: pointer;
  border: 1px solid rgba(232,192,115,.55); background: rgba(232,192,115,.10); color: #f2d79a;
  font-family: var(--font, inherit); }
.smini7-lamp:hover:not(:disabled) { background: rgba(232,192,115,.22); }
.smini7-lamp:disabled { opacity: .34; cursor: default; border-color: rgba(226,214,190,.20); color: #8c8474; }
.smini7-lampHint { font-size: 11.5px; color: #8f9aa4; }

.smini7-opts { display: grid; grid-template-columns: 1fr; gap: 6px; }
.smini7-opt { display: block; width: 100%; text-align: left; padding: 9px 12px; font-size: 13px;
  line-height: 1.45; border-radius: 5px; cursor: pointer; color: #e6ddc8;
  border: 1px solid rgba(226,214,190,.24); background: rgba(240,231,210,.05);
  font-family: var(--font, inherit); }
.smini7-opt:hover:not(:disabled) { background: rgba(240,231,210,.14); border-color: rgba(226,214,190,.42); }
.smini7-opt:disabled { opacity: .40; cursor: default; }
.smini7-opt.taken.right { opacity: 1; border-color: rgba(232,192,115,.85); color: #f2d79a;
  background: rgba(232,192,115,.13); }
.smini7-opt.taken.over { opacity: 1; border-color: rgba(217,86,74,.70); color: #f0b2a8;
  background: rgba(217,86,74,.12); }
.smini7-opt.taken.under { opacity: 1; border-color: rgba(143,182,214,.65); color: #bcd6ea;
  background: rgba(143,182,214,.10); }

.smini7-status { display: flex; flex-direction: column; gap: 3px; min-height: 18px;
  border-top: 1px solid rgba(226,214,190,.14); padding-top: 8px;
  font-size: 12.5px; line-height: 1.6; }
.smini7-fb { color: #a9b4bd; }
.smini7-fb.right { color: #e8c073; }
.smini7-fb.over { color: #e0917f; }
.smini7-fb.under { color: #9fc2dd; }
.smini7-judge { color: #cfc6b2; }
.smini7-tag { font-size: 11px; color: #8b8574; }
`;
  document.head.appendChild(s);
}

/* ── 方位盘 ──────────────────────────────────────────────────────
   它不是装饰：**信号在哪个扇区、有多远，只有这里能看出来。**
   "近"画三道涟漪，"远"画一道 —— 画面编码信息，这是项目里定的规矩。
   （夜校那轮踩过：画面元素跟判定中心不是同一套坐标，玩家打中看得见的东西却判不中。）*/
function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}
function band(a1, a2, rOut, rIn, cx, cy) {
  const [x1, y1] = polar(cx, cy, rOut, a1);
  const [x2, y2] = polar(cx, cy, rOut, a2);
  const [x3, y3] = polar(cx, cy, rIn, a2);
  const [x4, y4] = polar(cx, cy, rIn, a1);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rOut} ${rOut} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
    + ` L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${rIn} ${rIn} 0 0 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z`;
}
const f1 = (n) => Number(n.toFixed(1));

/** 画盘。`lit` = 这个信号已经被灯照过。`ampl` = 涟漪道数（1 = 远，3 = 近）。 */
export function dialMarkup(sector, type, ampl, lit) {
  const cx = 88;
  const cy = 88;
  const rOut = 82;
  const rIn = 55;
  const parts = [];
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${rOut - 1}" fill="rgba(10,14,19,.55)" stroke="rgba(226,214,190,.16)" stroke-width="1"/>`);
  for (const s of SECTORS) {
    const on = s.id === sector;
    const fill = on
      ? (lit ? 'rgba(232,192,115,.40)' : 'rgba(143,182,214,.20)')
      : 'rgba(226,214,190,.045)';
    // ⚠️ 照亮态的填充提到 .40 是为了在夜底上"看得出暖"（.20 时冷暖两态只差一个色相，
    // 实测截图上很容易看混）。**但必须 < 0.5** —— 视觉断言拿 alpha ≥ 0.5 当硬条件把
    // "扇区填充"排除在"涟漪像素"之外，一超过就会把整块扇形算成涟漪，断言当场失效。
    parts.push(`<path d="${band(s.a1, s.a2, rOut - 4, rIn, cx, cy)}" fill="${fill}" stroke="rgba(226,214,190,.14)" stroke-width="1"/>`);
    const [tx, ty] = polar(cx, cy, (rOut + rIn) / 2, (s.a1 + s.a2) / 2);
    parts.push(`<text x="${f1(tx)}" y="${f1(ty + 3.5)}" text-anchor="middle" font-size="10" letter-spacing="1" fill="${on ? (lit ? '#f2d79a' : '#cfe0ef') : '#6b7680'}">${s.label}</text>`);
  }
  // 涟漪：从带内缘往圆心推。道数编码距离。
  const sec = SECTORS.find((s) => s.id === sector) || SECTORS[0];
  const mid = (sec.a1 + sec.a2) / 2;
  for (let i = 0; i < ampl; i += 1) {
    const r = rIn - 5 - i * 8;
    const a1 = mid - 26;
    const a2 = mid + 26;
    const [sx, sy] = polar(cx, cy, r, a1);
    const [ex, ey] = polar(cx, cy, r, a2);
    parts.push(`<path d="M ${f1(sx)} ${f1(sy)} A ${r} ${r} 0 0 1 ${f1(ex)} ${f1(ey)}" fill="none" stroke="${lit ? 'rgba(232,192,115,.72)' : 'rgba(196,220,246,.60)'}" stroke-width="${(1.9 - i * 0.35).toFixed(2)}" stroke-linecap="round"/>`);
  }
  const [dx, dy] = polar(cx, cy, rIn - 3, mid);
  parts.push(`<circle cx="${f1(dx)}" cy="${f1(dy)}" r="2.6" fill="${lit ? '#e8c073' : '#c6dcee'}"/>`);
  parts.push(`<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" letter-spacing="2" fill="${lit ? '#f2d79a' : '#e2e9ef'}" font-family="var(--font-kai, KaiTi, serif)">${type}</text>`);
  // 「已照亮」这行字**删掉过**：它原来放在 cy+76（y=164），正好压在底部「身后」标签（y≈156.5）上，
  // 而且盘外一圈没有余量。其实"被照亮"已经有三重编码了 —— 扇区填充转暖色、涟漪与源点转金色、
  // 面板里那一行「照见了：…」。再塞一行字是装饰，不是信息（而且它会撞）。
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 176 176" role="img" aria-label="方位盘">${parts.join('')}</svg>`;
}

/* ══════════════ 玩法本体 ══════════════ */

/**
 * @param {HTMLElement} container
 * @param {{stats?:HTMLElement, password?:string, id?:string, plan?:Array,
 *          rnd?:()=>number}} [opts]
 * @returns {Promise<{score:number, detail:object, summary:string}>}
 */
export function runNightWatch(container, opts = {}) {
  return new Promise((resolve) => {
    let alive = true;
    let plan = [];
    let idx = 0;
    let lampLeft = LAMP_TOTAL;
    let lampUsed = false;
    let litHere = false;          // 当前这个信号是否已照亮
    let picks = [];
    let settled = false;
    let advTimer = 0;
    let planFrom = 'random';
    const statsHost = opts.stats || null;

    const root = h('div', { class: 'smini7-wrap' });
    const sky = h('div', { class: 'smini7-sky', 'aria-hidden': 'true' });
    const sweep = h('div', { class: 'smini7-sweep', 'aria-hidden': 'true' });
    const lead = h('p', { class: 'smini7-lead' });
    const dialHost = h('div', { class: 'smini7-dial' });
    const whenEl = h('div', { class: 'smini7-when' });
    const hearEl = h('p', { class: 'smini7-hear' });
    const readEl = h('p', { class: 'smini7-read' });
    const meterExp = h('div', { class: 'smini7-meter' });
    const meterMiss = h('div', { class: 'smini7-meter' });
    const lampBtn = h('button', { type: 'button', class: 'smini7-lamp', 'data-mini-action': 'lamp', text: '举起马灯' });
    const lampHint = h('span', { class: 'smini7-lampHint' });
    const meters = h('div', { class: 'smini7-meters' }, [meterExp, meterMiss]);
    const lampRow = h('div', { class: 'smini7-lampRow' }, [lampBtn, lampHint]);
    const side = h('div', { class: 'smini7-side' }, [whenEl, hearEl, readEl, meters, lampRow]);
    const mid = h('div', { class: 'smini7-mid' }, [dialHost, side]);
    const optsBox = h('div', { class: 'smini7-opts' });
    // ⚠️ 结算区是**两个具名子元素**（fbEl / judgeEl）。任何地方都不许再写
    // `status.innerHTML` / `status.textContent` —— 那会把它们整棵清掉，
    // 之后往里写什么都看不见（分糖那轮踩过：变量里的值全对，屏幕上永远空白）。
    const fbEl = h('div', { class: 'smini7-fb' });
    const judgeEl = h('div', { class: 'smini7-judge' });
    const status = h('div', { class: 'smini7-status' }, [fbEl, judgeEl]);
    root.append(sky, sweep, lead, mid, optsBox, status);
    mount(container, root);
    ensureStyle();

    container.dataset.mini = opts.id || 'sentry-watch';
    container.dataset.miniState = 'setup';

    /* ── 观测量：必须与界面**同刻**更新（夜校那轮因为只在 rAF 里同步，
       自动化"读答案→点选项"点到了上一题，看着像分档坏了）。 */
    function syncData() {
      try {
        const g = countTiers();
        container.dataset.miniSig = String(idx);
        container.dataset.miniExp = String(g.exp);
        container.dataset.miniMiss = String(g.miss);
        container.dataset.miniLamp = String(lampLeft);
        container.dataset.miniLog = picks.map((p) => (p === null || p === undefined ? '-' : p)).join(',');
        if (plan[idx]) {
          container.dataset.miniSector = plan[idx].sector;
          container.dataset.miniOpen = plan[idx].open ? '1' : '0';
        }
      } catch { /* 已拆 */ }
      refreshStats();
    }

    /** 局内的计数（不含"没来得及选"的收尾），只给界面和观测量看。 */
    function countTiers() {
      let over = 0;
      let miss = 0;
      for (let i = 0; i < picks.length; i += 1) {
        const ev = plan[i];
        const p = picks[i];
        if (!ev || p === null || p === undefined || !ev.options[p]) continue;
        const t = ev.options[p].tier;
        if (t === 'over') over += 1;
        else if (t === 'under') miss += 1;
      }
      return { over, miss, exp: over + (lampUsed ? 1 : 0) };
    }

    function dots(n, limit, cls) {
      const out = [];
      for (let i = 0; i < limit; i += 1) {
        // 超过上限的那一颗用 past 色 —— 玩家一眼能看出"已经越线了"
        out.push(`<i class="${i < n ? (i >= limit - 1 && n >= limit ? 'past' : cls) : 'off'}">●</i>`);
      }
      return out.join('');
    }

    function refreshMeters() {
      const g = countTiers();
      meterExp.innerHTML = `惊动 ${dots(g.exp, EXP_LIMIT, 'on')} <b>${g.exp}</b>`
        + `<span class="off">/${EXP_LIMIT}</span>`;
      meterMiss.innerHTML = `漏 ${dots(g.miss, MISS_LIMIT, 'miss on')} <b>${g.miss}</b>`
        + `<span class="off">/${MISS_LIMIT}</span>`;
    }

    function paintDial() {
      const ev = plan[idx];
      if (!ev) { dialHost.innerHTML = ''; return; }
      // dialHost 是**整体重画**的叶子容器（没有需要保留的子元素），所以这里用 innerHTML 是安全的。
      dialHost.innerHTML = dialMarkup(ev.sector, ev.type, ev.near ? 3 : 1, litHere);
    }

    function paintOptions() {
      const ev = plan[idx];
      optsBox.innerHTML = '';
      if (!ev) return;
      ev.options.forEach((o, i) => {
        const b = h('button', { type: 'button', class: 'smini7-opt', text: o.label });
        b.dataset.miniAction = 'answer';
        b.dataset.miniPick = String(i);
        b.onclick = () => answer(i);
        optsBox.appendChild(b);
      });
    }

    function showSignal() {
      const ev = plan[idx];
      if (!ev) return;
      litHere = false;
      // 上一题的反馈**不能留着不标出处** —— 它就贴在选项下面，不标的话看起来像在说当前这个信号
      //（本轮截图里就是「处置得当。你压住了动静…」压在"光点"那条题下面，一眼误读）。
      // 标成"上一个（脚步）：…"就成了一行流水，既不留歧义也不丢信息。
      const prev = idx > 0 ? plan[idx - 1] : null;
      if (prev && picks[idx - 1] !== undefined) {
        const t = prev.options[picks[idx - 1]].tier;
        fbEl.className = `smini7-fb ${t}`;
        fbEl.textContent = `上一个（${prev.type}）：${FB[t]}`;
      } else {
        fbEl.className = 'smini7-fb';
        fbEl.textContent = '';
      }
      whenEl.textContent = `${ev.when} · 第 ${idx + 1} 个信号`;
      hearEl.textContent = ev.hear;
      if (ev.open) {
        readEl.className = 'smini7-read unclear';
        readEl.textContent = '你拿不准 —— 这条读不出来。要么举灯，要么赌。';
      } else {
        readEl.className = 'smini7-read';
        readEl.textContent = `你的判断：${ev.read}`;
      }
      lampBtn.disabled = lampLeft <= 0;
      lampBtn.textContent = lampLeft > 0
        ? `举起马灯，照向${SECTOR_LABEL[ev.sector]}`      // 写明是哪个方向 —— "这个方向"太虚
        : '灯已经用了';
      lampHint.textContent = lampLeft > 0
        ? `照一次，位置就露一次。全场只有 ${LAMP_TOTAL} 盏。`
        : '';
      paintDial();
      paintOptions();
      refreshMeters();
      container.dataset.miniState = 'play';
      syncData();
    }

    /** 举灯：拿确定性换暴露。**用掉就没了**，所以"留给哪一个"才是决策。 */
    function useLamp() {
      const ev = plan[idx];
      if (!ev || lampLeft <= 0 || settled) return;
      lampLeft -= 1;
      lampUsed = true;
      litHere = true;
      SFX('click');
      hearEl.textContent = ev.lamp ? `照见了：${ev.lamp}` : ev.hear;
      readEl.className = 'smini7-read';
      readEl.textContent = ev.open
        ? '看清了。现在你知道该往哪边用力。'
        : '这一句其实你读得出来 —— 灯白举了，位置还是露了。';
      lampBtn.disabled = true;
      lampBtn.textContent = '灯已经用了';
      lampHint.textContent = '';
      flashExposed();
      paintDial();
      refreshMeters();
      syncData();
    }

    /** 惊动：一道冷光扫过哨位（**看得见**的代价）。漏：什么都不发生（**看不见**的代价）。 */
    function flashExposed() {
      root.classList.add('exposed');
      setTimeout(() => { if (alive) root.classList.remove('exposed'); }, 260);
    }

    const FB = {
      right: '处置得当。你压住了动静，也没放它过去。',
      over: '动静大了。营地那头有人翻身，火堆边的影子晃了一下。',
      under: '你把它放过去了。草里那点痕迹，天亮前一直没人动它。',
    };

    function answer(pick) {
      const ev = plan[idx];
      if (!ev || settled || picks[idx] !== undefined) return;
      const tier = ev.options[pick] ? ev.options[pick].tier : 'under';
      picks[idx] = pick;
      SFX(tier === 'right' ? 'correct' : 'wrong');
      if (tier === 'over') flashExposed();
      // 锁住这一题的三个键，并且把"你点的是哪一个"标出来 ——
      // 自动化必须能断言"选的就是我点的那一项"，否则分档数字不可信。
      [...optsBox.children].forEach((b, i) => {
        b.disabled = true;
        if (i === pick) b.classList.add('taken', tier);
      });
      fbEl.className = `smini7-fb ${tier}`;
      fbEl.textContent = FB[tier];
      lampBtn.disabled = true;
      refreshMeters();
      try { container.dataset.miniLastTier = tier; } catch { /* 已拆 */ }
      syncData();
      container.dataset.miniState = 'feedback';
      advTimer = setTimeout(() => {
        if (!alive) return;
        idx += 1;
        if (idx >= plan.length) settle();
        else showSignal();
      }, 780);
    }

    function settle() {
      if (settled) return;
      settled = true;
      const g = gradeWatch(plan, picks, lampUsed);
      try { container.dataset.miniOutcome = g.outcome; } catch { /* 已拆 */ }
      container.dataset.miniState = 'done';
      idx = plan.length;
      optsBox.innerHTML = '';
      // 结束后**不留可点的残骸**：灯键连操作标记一起摘掉
      //（契约：不可操作的元素不要带 data-mini-action）。
      lampBtn.disabled = true;
      lampBtn.removeAttribute('data-mini-action');
      // 方位盘**不擦掉**，冻在最后一个信号上 —— 一是给结算屏留个画面锚点，
      // 二是"天要亮了"配一个空框太突兀。观测量 miniSector 也照旧指着最后那个信号。
      const lastEv = plan[plan.length - 1];
      dialHost.innerHTML = lastEv
        ? dialMarkup(lastEv.sector, lastEv.type, lastEv.near ? 3 : 1, litHere)
        : '';
      readEl.className = 'smini7-read';
      readEl.textContent = '';
      hearEl.textContent = `${plan.length} 个信号过去了。天要亮了。`;
      fbEl.className = 'smini7-fb right';
      fbEl.textContent = watchSummary(g);
      judgeEl.textContent = g.judge;
      refreshMeters();
      syncData();
      // ⚠️ 契约：`detail.outcome` 是结局词，`detail.score` 与 `detail` 一起给下游。
      resolve({
        score: g.score,
        detail: {
          outcome: g.outcome, score: g.score,
          hits: g.hits, total: g.total, over: g.over, miss: g.miss, exp: g.exp,
          lampUsed: g.lampUsed, lampFrom: planFrom,
          rows: g.rows, plan: plan.map((e) => ({ id: e.id, type: e.type, sector: e.sector, truth: e.truth, open: e.open })),
          judge: g.judge,
          effects: {},          // 固定判词**不编数值** —— 这一版本来就不接模型
        },
        summary: watchSummary(g),
      });
    }

    lampBtn.onclick = useLamp;

    /* ── 开局：零模型调用，排完就能玩 ── */
    (function start() {
      lead.innerHTML = '后半夜归你。<b>风停了以后，什么声响你都得当真。</b><br/>'
        + '<span class="dim">五个信号，每个只能处置一次。马灯只有一盏 —— 照过一次，位置就露了。</span>';
      let p = null;
      if (Array.isArray(opts.plan) && opts.plan.length) {
        p = gatePlan(opts.plan);            // 注入的局也得过闸（自动化走这条路）
        if (p) planFrom = 'injected';
      }
      if (!p) { p = planRun({ rnd: opts.rnd, password: opts.password }); planFrom = 'random'; }
      plan = p;
      picks = new Array(plan.length).fill(undefined);
      try { container.dataset.miniPlanFrom = planFrom; } catch { /* 已拆 */ }
      showSignal();
    })();

    /** 板头数值签。`syncData()` 每次都调它，所以它跟局面是同刻的。 */
    function refreshStats() {
      stats(statsHost, [
        ['信号', `${Math.min(idx + 1, plan.length)}/${plan.length}`],
        ['灯', lampLeft],
      ]);
    }

    /* ── 自清：容器被拆掉就收工（分糖那轮定的：interval + isConnected，别用 rAF） ── */
    const guard = setInterval(() => {
      if (container.isConnected) return;
      clearInterval(guard);
      teardown();
      if (!settled) resolve({ score: 0, detail: { outcome: 'none', why: 'detached' }, summary: '' });
    }, 500);
    function teardown() {
      alive = false;
      clearInterval(guard);
      clearTimeout(advTimer);
    }
  });
}

/* ══════════════ 调试台规格 ══════════════ */

export const SENTRY_MINIGAMES = [
  {
    id: 'sentry-watch',
    title: '夜岗 · 五个信号',
    family: '判读',
    act: 'act4 · 草地',
    note: '旧版夜岗的重做：五个信号 × 各自处置，两个资源（惊动 / 漏），马灯一盏只能照一次。'
      + '读得出来的一读一个准，读不出来的那条只能举灯或赌。两条失败线：惊动 ≥4 哨位被摸熟、漏 ≥3 有人摸到营地边上。',
    states: ['setup', 'play', 'feedback', 'done'],
    actions: ['answer', 'lamp'],
    needsPassword: true,
    noAi: true,          // ★ 游戏内 0 次模型调用（理由见文件头「接不接 AI」一节）
    noAiNote: '游戏内 <b>0 次模型调用</b>：网关实测最省的一条也要 6.79s（且 content 被 max_tokens 截断），'
      + '而这个玩法每按一次处置就要看下一个信号，没有一秒可以让玩家等。'
      + 'AI 仍在它该在的位置 —— 主线本来就为夜岗写了 <code>minigame_review</code> 的 sentry 分支，接线后由它接管。',
    run: (host, o = {}) => runNightWatch(host, o),
  },
];

export const CARDS = SENTRY_MINIGAMES;
