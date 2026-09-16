/**
 * 《红小鬼的糖 · 分糖》（**重做版 · 单独开发，未接入主线**）
 *
 * ── 它取代的是什么 ──
 *   旧版（minigames.js 的 runCandy，110 行）：三颗糖、三张卡（伤员 / 倔强的新兵 / 小号手）、
 *   加一个"自己收好"。**分数的唯一来源是"自留了几颗"**：
 *   自留 0 → 0.9，自留 1 → 0.6，自留 ≥2 → 0.35。
 *   也就是说 **"给谁"完全不影响分数** —— 那三张卡是装饰。
 *   而且没有失败（最低 0.35），没有任何需要打听的事（三张卡把底牌全摊开了）。
 *
 * ── 这一版是什么 ──
 *   历史锚点（data/facts.json · h_share）：
 *   "口粮奇缺，战友互相推让食物、留给伤病员，是大量回忆录中的共同记忆。"
 *   那一幕的主题是「把生的希望递出去」。所以这一局的题眼不是"给谁"，
 *   而是 —— **你并不知道谁真的要紧，而"知道"是要付代价的**。
 *
 *   于是有两个资源，不是一个：
 *     · **3 颗糖**：给谁、给几颗。
 *     · **2 次打听**：走近一个人，才看得见他的里子。每次代价是**你自己少吃一顿**（口粮 -1）。
 *   营地里是 **5 个人**，糖只有 3 颗 —— 必定有人拿不到。
 *
 * ── 玩家的决策在哪 ──
 *   每个人有两个**看不见**的值：
 *     · `need`  缺到什么程度（3 = 再没吃的撑不到明天）
 *     · `share` 拿到糖会不会掰开分给旁边（1 = 会）
 *   而这两件事**通常不在同一个人身上**（客户端闸 gateFaces 硬保证：
 *   need 最高的人 share 一定是 0）。于是有两条互斥的好打法：
 *     · 给**最需要的**：稳救一个，但只救一个；
 *     · 给**最会分的**（且不止一颗）：他掰开分出去，一颗糖可能照顾到好几个人，
 *       可那个最需要的就悬了。
 *   打听只有 2 次、5 个人 —— **你必须决定"先看清谁"，剩下的只能赌**。
 *   不问直接给是允许的，而且省下自己的口粮；但命中的概率肉眼可见地低。
 *
 * ── 失败条件 ──
 *   · `selfish` 自留 ≥2 颗 —— **是失败**，分数压到 0.2 以下，模型会写当晚士气受损；
 *   · `miss` 最需要的那个人**一颗都没拿到** —— **当场没有任何提示**：
 *     结算屏只写"那晚没人说什么"，第二天才会有一行 `late_line` 把这件事轻轻提起来。
 *     这是这个玩法真正的惩罚：你**不会知道自己给错了**。
 *   · `ok`  / `good`：覆盖到了最需要的，且覆盖比例够高。
 *
 * ── 产出（对齐下游）──
 *   detail: {
 *     asked:[名字], given:{名字:颗数}, selfKept, cost(花掉的口粮数),
 *     covered:[名字], missedTop, outcome, score 之外的 effects/narrative 由模型给
 *   }
 *   `detail.cost` 是**你自己的代价**（打听次数），接线时由主线并入 effects（粮食 -cost）。
 *
 * ── 模型用在哪（2026-09-15 改过一次，重要）──
 *   原先这五个人是**让模型当场现编**的。比赛网关实测：这一调单次要 **60 秒上下**
 *   （输出 2368 tokens，重试一次直接翻倍），而它正卡在玩家刚点开玩法、最不该等的位置。
 *   等 60 秒看五个名字 —— 这一局已经废了，玩法的脑子再好也救不回来。
 *   现在改成：
 *     · **五个人固定**（FACES_POOL：作者手写 6 份，`gateFaces` 逐份过闸，单测守着）→ 开局 0 等待；
 *     · 模型只出现在**两个短时刻**：
 *         ① `candy_scene` 开局一句营地氛围（**非阻塞** —— 回来了就换掉，回不来就用作者那句）；
 *         ② `share_judge` 收尾判词 + 第二天那句话（本来就是十几秒的量级，且是本局的情绪落点）。
 *   也就是说：**机制是作者写的，话是模型说的。** 该模型的地方一点没少，不该等的地方一秒不等。
 *
 * 玩法 id：`candy-share`
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

function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ══════════════ AI 的机会窗口：10 秒 ══════════════

   原则（定了就不改）：**AI 不许让玩家等。**
   比赛网关 2026-09-15 实测：极简探测 5.3 秒，但叙事类 prompt 单次 **30–60 秒**
   （candy_scene 38s / share_judge 64s），而且时间几乎全在模型的隐藏推理上 ——
   输出只有 28 个字的那条也要 38 秒，把 prompt 和输出压短救不回来。
   → 所以给每次调用 **10 秒上限**，掐断就当作"它没答"，游戏照常走固定内容。
   "能快就用、慢了就固定" —— 玩法**不依赖 AI 也能完整玩**，AI 只是锦上添花。

   注意：客户端 abort 之后服务端那一调还会跑完并落日志（清不掉），
   所以从 logs/ 里数调用次数时，会看到比玩家实际"用到"的更多。 */
export const AI_WINDOW_MS = 10000;

/** 带 10 秒上限的调用：超时/网络错/服务端失败，一律返回 null（= 当作它没答）。
 *
 *  ⚠️ 光给 fetch 传 AbortSignal **不够硬**：上限就成了"底层肯不肯听话"的赌注。
 *  本轮就被抓到一次：测试里那个假接口无视 signal，于是本该被掐断的调用在 12 秒时照旧回来，
 *  把固定判词顶掉了。所以这里用**计时器与请求赛跑**，到点就 resolve(null)，
 *  谁先到算谁 —— 上限是客户端说了算，不依赖任何底层实现。 */
async function decideWithin(payload, ms = AI_WINDOW_MS) {
  const ac = new AbortController();
  let timer = 0;
  try {
    return await Promise.race([
      DECIDE(payload, { signal: ac.signal }),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    ac.abort();          // 顺手把还挂着的请求掐掉（真实 fetch 会因此中止连接）
  }
}

/* ══════════════ 固定判词（按结局分）══════════════

   模型赶上了就升级成它写的那版（含 effects）；没赶上就是这几句。
   写法与模型那条 prompt 同一个口径：克制、不揭破、不羞辱、不喊口号。
   `miss` 那一档刻意**不点破**"你漏了最需要的人" —— 这个玩法真正的惩罚就是"你不知道"，
   点破了反而把这个设计毁了。 */
export const FIXED_JUDGE = {
  selfish: '你把糖收了起来，揣在最里层的口袋里。那晚没人说什么，可有人翻了个身，很久没再动。',
  miss: '糖都分出去了，谁也没落下话。夜里有人咳嗽，咳了很久。天亮整队时，少了一个人跟上来。',
  ok: '糖给出去了。接的人没吭声，攥了一会儿才剥开。天亮时，队伍又往前走。',
  good: '糖给出去了，还多照顾到了旁边的人。有人把糖掰开，一人一小块。天亮时，队伍又往前走。',
};

/* ══════════════ 内容闸 + 计分（纯函数，可单测）══════════════ */

/**
 * 闸住模型给的五个人。任何一条不满足 → 返回 null，调用方用备名单。
 *
 * 为什么必须有这个闸：**"最需要的"和"最会分的"若不是两个人，这一局就没有取舍了**——
 * 玩家会一眼看出"给那个人就对了"，打听也失去意义。这条约束 schema 表表达不了，
 * 只能在客户端做（与夜校的 gateLesson 同一个思路）。
 */
export function gateFaces(raw) {
  const list = Array.isArray(raw?.faces) ? raw.faces : (Array.isArray(raw) ? raw : null);
  if (!list || list.length !== 5) return null;
  const faces = [];
  for (const f of list) {
    const name = String(f?.name || '').trim();
    const look = String(f?.look || '').trim();
    const line = String(f?.line || '').trim();
    const truth = String(f?.truth || '').trim();
    const need = Number(f?.need);
    const share = Number(f?.share);
    if (!name || !look || !line || !truth) return null;
    if (name.length > 12 || look.length > 24 || line.length > 30 || truth.length > 30) return null;
    if (![1, 2, 3].includes(need)) return null;
    if (![0, 1].includes(share)) return null;
    faces.push({ name, look, line, truth, need, share });
  }
  if (new Set(faces.map((f) => f.name)).size !== 5) return null;      // 名字不能重
  if (new Set(faces.map((f) => f.look)).size < 3) return null;        // 表面不能一模一样
  if (faces.filter((f) => f.need === 3).length > 2) return null;      // 惨的人不能过半
  const sharers = faces.filter((f) => f.share === 1);
  if (sharers.length < 1) return null;                                // 没有会分糖的人 → "给会分的"这条路不存在
  if (sharers.length > 2) return null;
  const top = Math.max(...faces.map((f) => f.need));
  if (sharers.some((f) => f.need === top)) return null;               // ★ 最需要的不能是会分的
  return faces;
}

/* ── 固定名单池 ────────────────────────────────────────────────
   六份，每份五个人。**每一份都单独过 gateFaces**（单测逐份断言），
   所以这里的字段是"作者写的内容"，而闸是"机器守的规矩" —— 改字改数不值当去赌，
   跑一次 qa-candy.mjs 就知道有没有踩线。

   六份刻意做成**不同的形状**，这样重开一局不是换个名字重来：
     · 两份 need=3 → 两个都吊着命，"稳救一个"要挑；
     · 一份 need=3 只有一个 → "稳救"这条路清楚，但覆盖比上不去；
     · 一份一个 need=3 都没有（遵义休整）→ 没有惨到撑不住的人，取舍反而更细；
     · 只给一份一个会分糖的 → "给会分的"这条路很窄，赌不起。

   每份还标了 place：草地那一摊不该冒出"打草鞋的小鬼"式的休整感。
   挑的时候先按 place 过滤，没有匹配的才退回全池。 */
const POOL_CANDI = [
  {
    place: '草地',
    note: '推让——两个都硬撑着让，一个会分的在卫生员身上',
    faces: [
      { name: '伤员老陈', look: '小腿肿得发亮', line: '我不饿，给能走的。', need: 3, share: 0, truth: '两天没进粮，靠嚼皮带撑着。' },
      { name: '扛机枪的', look: '肩膀磨破了皮', line: '我有劲，别管我。', need: 3, share: 0, truth: '一直让着别人，自己只喝汤。' },
      { name: '小卫生员', look: '手抖着换绷带', line: '药不够，糖留给伤员。', need: 2, share: 1, truth: '拿到就掰开，挨个塞给伤员。' },
      { name: '江西口音老兵', look: '一直半闭着眼', line: '走过来了就好。', need: 2, share: 1, truth: '有口吃的先递给旁边的新兵。' },
      { name: '刚补进来的新兵', look: '缩着脖子不说话', line: '我不饿……', need: 1, share: 0, truth: '饿得直冒冷汗，但不敢开口。' },
    ],
  },
  {
    place: '草地',
    note: '掉队——打摆子的那个最缺，但不会分',
    faces: [
      { name: '发疟子的挑夫', look: '颧骨上烧得发红', line: '别停下，我能跟。', need: 3, share: 0, truth: '打摆子三天，走一步歇一步。' },
      { name: '走肿脚的号手', look: '脚脖子肿过了膝', line: '号还能吹。', need: 2, share: 1, truth: '拿到甜的，先塞给扶他的人。' },
      { name: '十六岁的马夫', look: '一直舔干裂的嘴', line: '我不渴。', need: 2, share: 0, truth: '把水壶全给了骡子。' },
      { name: '断后的排长', look: '腰上缠着旧布条', line: '后头还有人。', need: 2, share: 0, truth: '饿了两天，硬撑着。' },
      { name: '收容队的女兵', look: '头发上全是草屑', line: '你们先走。', need: 1, share: 1, truth: '别人匀给她的，她都分了。' },
    ],
  },
  {
    place: '草地',
    note: '宿营——冻的和抬担架的两个都在硬扛',
    faces: [
      { name: '冻得缩成一团的小鬼', look: '嘴唇紫得发黑', line: '我不冷。', need: 3, share: 0, truth: '单衣过夜，缩了一整晚。' },
      { name: '抬担架的壮汉', look: '肩膀上勒出沟', line: '抬得动。', need: 3, share: 0, truth: '抬人时自己啃过树皮。' },
      { name: '炊事班老周', look: '手背上全是裂口', line: '锅里还有汤。', need: 2, share: 1, truth: '那锅汤他一口没喝。' },
      { name: '眼镜碎了的文书', look: '眯着眼看路', line: '我认路。', need: 1, share: 0, truth: '把炒面都分给了伤员。' },
      { name: '背药箱的小丫头', look: '辫子散了', line: '我不吃甜的。', need: 1, share: 1, truth: '拿到就掰开，一人一小块。' },
    ],
  },
  {
    place: '遵义',
    note: '休整——没有一个撑不住的，取舍变细',
    faces: [
      { name: '从江西背锅的老兵', look: '一口牙掉了半边', line: '嚼得动。', need: 2, share: 0, truth: '把干粮匀给了新兵。' },
      { name: '会认字的司号员', look: '手指冻得发僵', line: '号谱我记着。', need: 2, share: 0, truth: '昨天的炒面全给了病号。' },
      { name: '缠着绷带的连长', look: '半边身子使不上劲', line: '别管我。', need: 2, share: 0, truth: '把马让给了伤员骑。' },
      { name: '打草鞋的小鬼', look: '手指头全是血口', line: '我会打。', need: 1, share: 1, truth: '谁鞋破了，他就给谁打。' },
      { name: '刚参军的学生娃', look: '笔杆子还攥着', line: '我跟得上。', need: 1, share: 1, truth: '家里带的糖，他分过。' },
    ],
  },
  {
    place: '草地',
    note: '夜雨——淋透了的一夜，伙夫把份都添给了人',
    faces: [
      { name: '淋透了的号兵', look: '头发贴在脸上', line: '我吹得动。', need: 3, share: 0, truth: '昨夜没进一口热的。' },
      { name: '拄棍子的伙夫', look: '膝盖弯不下去', line: '锅还在就行。', need: 3, share: 0, truth: '把自己的份全添给别人。' },
      { name: '掉了一只鞋的通信员', look: '光脚踩在泥里', line: '信送到了。', need: 2, share: 1, truth: '拿到就掰开，塞给身边的人。' },
      { name: '会说家乡话的班长', look: '嗓子哑得听不清', line: '都跟上没有？', need: 1, share: 0, truth: '最后一点炒面让给了新兵。' },
      { name: '分过半块饼的小鬼', look: '眼睛亮了一下', line: '我不馋。', need: 1, share: 1, truth: '上次那块饼他分了三份。' },
    ],
  },
  {
    place: '草地',
    note: '收容——只有司务长一个人会分，"给会分的"这条路很窄',
    faces: [
      { name: '不愿拖累队伍的伤员', look: '裤腿洇着血', line: '你们走吧。', need: 3, share: 0, truth: '夜里咬着袖子不吭声。' },
      { name: '背两支枪的老兵', look: '走一步晃一下', line: '我扛得住。', need: 3, share: 0, truth: '替倒下的人背了一路。' },
      { name: '管最后半袋米的司务长', look: '手一直在抖', line: '米还有。', need: 2, share: 1, truth: '那半袋米他动都没动。' },
      { name: '替人背行李的小鬼', look: '肩膀上两道血印', line: '不沉。', need: 2, share: 0, truth: '自己的铺盖早扔了。' },
      { name: '从遵义跟来的挑夫', look: '光着两只脚', line: '跟得上。', need: 2, share: 0, truth: '脚底板磨得没皮了。' },
    ],
  },
];

export const FACES_POOL = POOL_CANDI;

/** 备名单 = 池子的第一份（草地·推让）。测试与降级路径都用它。 */
export const FALLBACK_FACES = FACES_POOL[0].faces;

/* 游标：连着开两局不要给同一份。初值随机，免得每次刷新都从"推让"那份开始。 */
let poolCursor = Math.floor(Math.random() * 1000);

/**
 * 从池子里取一份（深拷贝，免得玩家那一局把池子里的对象改花了）。
 * @param {string} [place] '草地' | '遵义'；没有匹配的就退回全池。
 */
export function pickFaces(place) {
  const fit = FACES_POOL.filter((s) => s.place === place);
  const use = fit.length ? fit : FACES_POOL;
  const set = use[poolCursor % use.length];
  poolCursor += 1;
  return set.faces.map((f) => ({ ...f }));
}

/**
 * 计分（纯函数）。
 *
 * 口径写清楚，免得后人改数字时不知道在改什么：
 *   · `covered` = 直接拿到糖的人；**share=1 的人从第二颗起**，每多一颗就把一个
 *     还没被照顾到的人补进来（他掰开分给旁人）。
 *   · `share`  = 覆盖到的 need 之和 / 全部 need 之和 —— **不是人头数**：
 *     照顾到三个"不太缺"的人，不如照顾到一个"最缺"的人。
 *   · 覆盖到最缺的人 → +0.15（"稳救一个"本身有价值）。
 *   · 自留 ≥2 → 压到 0.2 以下并判 selfish；最缺的人没覆盖 → 压到 0.45 以下并判 miss。
 */
export function gradeShare(faces, asked, given, selfKept) {
  const byName = new Map(faces.map((f) => [f.name, f]));
  const got = new Map();
  for (const [n, k] of Object.entries(given || {})) {
    const num = Number(k);
    if (num > 0 && byName.has(n)) got.set(n, num);
  }
  const covered = new Set(got.keys());
  for (const [n, k] of got) {
    const f = byName.get(n);
    let extra = f && f.share === 1 ? Math.max(0, k - 1) : 0;
    while (extra > 0) {
      const cand = faces.filter((x) => !covered.has(x.name)).sort((a, b) => b.need - a.need)[0];
      if (!cand) break;
      covered.add(cand.name);
      extra -= 1;
    }
  }
  const totalNeed = faces.reduce((s, f) => s + f.need, 0);
  const coveredNeed = [...covered].reduce((s, n) => s + (byName.get(n)?.need || 0), 0);
  const ratio = totalNeed ? coveredNeed / totalNeed : 0;
  const top = Math.max(...faces.map((f) => f.need));
  const coveredTop = faces.some((f) => f.need === top && covered.has(f.name));

  let outcome;
  let score = ratio + (coveredTop ? 0.15 : 0);
  if (selfKept >= 2) { outcome = 'selfish'; score = Math.min(score, 0.2); }
  else if (!coveredTop) { outcome = 'miss'; score = Math.min(score, 0.45); }
  else outcome = score >= 0.6 ? 'good' : 'ok';

  return {
    outcome,
    score: Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000,
    ratio: Math.round(ratio * 1000) / 1000,
    coveredNeed, totalNeed, coveredTop,
    covered: [...covered],
    missedTop: !coveredTop,
    asked: [...asked],
  };
}

/** 判定一行：给谁几颗 → 一行短描述（喂给模型与营地日志） */
export function shareSummary(faces, given, selfKept) {
  const parts = [];
  for (const f of faces) {
    const k = Number(given?.[f.name] || 0);
    if (k > 0) parts.push(`${f.name}×${k}`);
  }
  if (selfKept > 0) parts.push(`自留×${selfKept}`);
  return parts.length ? parts.join('，') : '一颗没给';
}

/* ══════════════ 画面 ══════════════ */

function ensureStyle() {
  if (document.getElementById('candy-share-style')) return;
  const s = document.createElement('style');
  s.id = 'candy-share-style';
  // 夜场：**字色一律写死浅色**，不用 --ink-*（那是浅色主题的深墨，压在夜底上等于没写）。
  // 交互元素全部走 flex/grid 正常流，**不用绝对定位**——
  // 夜校那轮就是因为"绝对定位的定位父级"算错，把字画到了判定中心之外。
  s.textContent = `
.smini6-wrap { position: relative; display: flex; flex-direction: column; gap: 9px; width: 100%;
  max-width: 720px; padding: 12px 14px 11px; border-radius: 8px;
  background: var(--ink-bg-2, rgba(14,11,8,.9)); border: 1px solid var(--ink-line, rgba(232,220,200,.16));
  overflow: hidden; }
.smini6-glow { position: absolute; left: 50%; top: 0; width: 460px; height: 210px; transform: translateX(-50%);
  background: radial-gradient(ellipse at center, rgba(216,150,58,.30), rgba(216,150,58,0) 70%);
  pointer-events: none; z-index: 0; }
/* 注意：这条用 :not(.smini6-glow) 排除光晕。若写成 bare 的通配选择器，会和 .smini6-glow
   打成平手（两边都是 0,1,0），然后**靠先后顺序**决定胜负 —— 它在后面，就会把光晕的
   position:absolute 覆盖成 relative，光晕当场占掉 320px 版面，
   把五张卡全部挤出可视区（实测 elementFromPoint 0/5 命中）。
   （这段注释原本写了反引号包裹的选择器 —— 反引号在模板字符串里会**提前闭合字符串**，
     整个模块直接 SyntaxError 加载不了。CSS 注释里不要用反引号。） */
.smini6-wrap > *:not(.smini6-glow) { position: relative; z-index: 2; }
.smini6-lead { margin: 0; font-family: var(--font-kai, "KaiTi", serif); font-size: 13.5px; line-height: 1.55;
  color: #efe6d0; }
.smini6-lead b { color: #e8c073; font-weight: 400; }
.smini6-bar { display: flex; gap: 13px; flex-wrap: wrap; font-size: 12.5px; color: #b9ae95;
  border-bottom: 1px solid rgba(232,220,200,.14); padding-bottom: 7px; }
.smini6-bar b { color: #f0e7d2; font-weight: 400; font-size: 14px; }
.smini6-bar .warn b { color: #e0917f; }
.smini6-faces { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 7px; }
.smini6-face { display: flex; flex-direction: column; gap: 4px; padding: 7px 9px 8px; border-radius: 6px;
  border: 1px solid rgba(232,220,200,.18); background: rgba(30,24,18,.72); }
.smini6-face.known { border-color: rgba(232,192,115,.55); background: rgba(46,36,24,.85); }
.smini6-face.got { border-color: rgba(232,192,115,.9); }
.smini6-name { font-family: var(--font-kai, "KaiTi", serif); font-size: 14px; color: #f0e7d2; }
.smini6-look { font-size: 12px; color: #b9ae95; }
.smini6-line { font-size: 12px; color: #cbbf9f; font-style: italic; }
.smini6-truth { font-size: 12px; line-height: 1.5; color: #e8c073; border-top: 1px dashed rgba(232,192,115,.35);
  padding-top: 5px; }
.smini6-truth .miss { color: #b9ae95; }
.smini6-dots { display: flex; gap: 10px; font-size: 11.5px; color: #b9ae95; align-items: center; }
.smini6-dots i { font-style: normal; color: #e8c073; letter-spacing: .12em; }
.smini6-dots .off { color: #6a5f4d; }
.smini6-face .acts { display: flex; gap: 6px; margin-top: 1px; }
.smini6-face button { flex: 1; padding: 5px 6px; font-size: 11.5px; border-radius: 4px; cursor: pointer;
  border: 1px solid rgba(232,220,200,.28); background: rgba(240,231,210,.06); color: #e6ddc8;
  font-family: var(--font, inherit); }
.smini6-face button:hover:not(:disabled) { background: rgba(240,231,210,.16); }
.smini6-face button:disabled { opacity: .34; cursor: default; }
.smini6-face button.give { border-color: rgba(232,192,115,.6); color: #f2d79a; }
.smini6-foot { display: flex; gap: 9px; justify-content: space-between; align-items: center;
  border-top: 1px solid rgba(232,220,200,.14); padding-top: 9px; }
.smini6-foot .btns { display: flex; gap: 8px; }
.smini6-foot button { padding: 7px 14px; font-size: 12.5px; border-radius: 4px; cursor: pointer;
  border: 1px solid rgba(232,220,200,.28); background: rgba(240,231,210,.06); color: #e6ddc8;
  font-family: var(--font, inherit); }
.smini6-foot button.primary { border-color: rgba(232,192,115,.7); color: #1b1509; background: #e8c073; }
.smini6-foot button:disabled { opacity: .34; cursor: default; }
/* 结算区：结果行（当场出）与判词行（模型后面补）分开。判词最长时给个上限，
   免得一句长叙事把五张卡顶出视口 —— 收尾屏也不该出现滚动条以外的东西。 */
.smini6-status { min-height: 20px; max-height: 168px; overflow-y: auto;
  font-size: 12.5px; line-height: 1.6; color: #cbbf9f; }
.smini6-resline { color: #e8c073; }
.smini6-hint { color: #b9ae95; }
.smini6-judgeline { color: #cbbf9f; }
.smini6-judgeline .warn { color: #e0917f; }
.smini6-judgeline .late { color: #e8c073; }
.smini6-tag { font-size: 11px; color: #8d8471; }
`;
  document.head.appendChild(s);
}

const NEED_DOTS = 3;

/* ══════════════ 玩法本体 ══════════════ */

/**
 * @param {HTMLElement} container
 * @param {{place?:'遵义'|'草地', log?:string[], state?:object, stats?:HTMLElement,
 *          id?:string, faces?:Array, fallback?:boolean, candies?:number, asks?:number,
 *          noReview?:boolean}} [opts]
 */
export function runCandyShare(container, opts = {}) {
  const CANDY_TOTAL = Number(opts.candies ?? 3);
  const ASK_TOTAL = Number(opts.asks ?? 2);
  const place = opts.place === '遵义' ? '遵义' : '草地';

  return new Promise((resolve) => {
    let alive = true;
    let faces = [];
    let facesFrom = 'pool';           // 'pool'（固定池）| 'injected'（外部注入且过闸）
    let sceneEl = null;                // 开场那句氛围的落点（非阻塞模型调用写它）
    const asked = [];
    const given = {};
    let selfKept = 0;
    let asksLeft = ASK_TOTAL;
    let candiesLeft = CANDY_TOTAL;
    let settled = false;

    const root = h('div', { class: 'smini6-wrap' });
    const glow = h('div', { class: 'smini6-glow', 'aria-hidden': 'true' });
    const bar = h('div', { class: 'smini6-bar' });
    const lead = h('p', { class: 'smini6-lead' });
    const grid = h('div', { class: 'smini6-faces' });
    // 结算区分三行：提示行（开局那句）／结果行（**当场出**，作者算的）／判词行（固定文本，模型若能赶上就升级）。
    // ⚠️ 这三行是 status 的子元素，所以**任何地方都不许再写 status.innerHTML / status.textContent**
    // —— 那会把它们整个清掉，之后往里写什么都看不见（本轮踩过：play 时写行内提示，
    // 结果 resLine / judgeLine 当场变成游离节点，屏幕上永远出不来结算文字）。
    // 要写就往具体那一行写。
    const hintLine = h('div', { class: 'smini6-hint' });
    const resLine = h('div', { class: 'smini6-resline' });
    const judgeLine = h('div', { class: 'smini6-judgeline' });
    const status = h('div', { class: 'smini6-status' }, [hintLine, resLine, judgeLine]);
    const keepBtn = h('button', { type: 'button', text: '剩下的自己收好', 'data-mini-action': 'keep' });
    const confirmBtn = h('button', { type: 'button', class: 'primary', text: '这一夜就这样', 'data-mini-action': 'confirm' });
    const foot = h('div', { class: 'smini6-foot' }, [
      status ? h('span', { class: 'smini6-tag', text: '走近一个人，你就要少吃一顿。' }) : null,
      h('div', { class: 'btns' }, [keepBtn, confirmBtn]),
    ]);
    root.append(glow, lead, bar, grid, foot, status);
    mount(container, root);
    ensureStyle();

    container.dataset.mini = opts.id || 'candy-share';
    setState('setup');

    /* ── 板头数值 + 内部观测量 ──────────────────────────────────
       观测量必须与界面**同刻**：每次改界面就调一次 syncData()。
       夜校那轮就因为只在 rAF 里同步，自动化读到的是上一帧的值。 */
    function syncData() {
      try {
        container.dataset.miniAsked = asked.join(',');
        container.dataset.miniAsksLeft = String(asksLeft);
        container.dataset.miniCandies = String(candiesLeft);
        container.dataset.miniGiven = shareSummary(faces, given, selfKept);
      } catch { /* 已拆 */ }
    }

    function setState(s) {
      try { container.dataset.miniState = s; } catch { /* 已拆 */ }
      syncData();
    }

    function refreshBar() {
      const cost = ASK_TOTAL - asksLeft;
      bar.innerHTML = '';
      bar.append(
        h('span', { html: `糖 <b>${candiesLeft}</b>${candiesLeft === 0 ? '' : ' 颗'}` }),
        h('span', { class: asksLeft === 0 ? 'warn' : '', html: `还能打听 <b>${asksLeft}</b> 次` }),
        h('span', { html: `自己少吃 <b>${cost}</b> 顿` }),
        h('span', { html: `营地里 <b>${faces.length}</b> 个人` }),
      );
    }

    function paint() {
      grid.innerHTML = '';
      for (const f of faces) {
        const known = asked.includes(f.name);
        const owned = Number(given[f.name] || 0);
        const card = h('div', { class: `smini6-face${known ? ' known' : ''}${owned ? ' got' : ''}` });
        card.append(
          h('div', { class: 'smini6-name', text: f.name }),
          h('div', { class: 'smini6-look', text: f.look }),
          h('div', { class: 'smini6-line', text: `“${f.line}”` }),
        );
        if (known) {
          const dots = h('div', { class: 'smini6-dots' });
          dots.append(h('span', { html: `缺 <i>${'●'.repeat(f.need)}${'○'.repeat(NEED_DOTS - f.need)}</i>` }));
          dots.append(h('span', { html: f.share === 1 ? '会分给旁人' : '只会自己咽' }));
          card.append(dots, h('div', { class: 'smini6-truth', text: f.truth }));
        } else {
          card.append(h('div', { class: 'smini6-truth' },
            [h('span', { class: 'miss', text: '只知道这些。想看清？拿一顿饭去换。' })]));
        }
        if (owned) card.append(h('div', { class: 'smini6-dots' }, [h('span', { html: `已给 <i>${owned}</i> 颗` })]));

        const acts = h('div', { class: 'acts' });
        const askBtn = h('button', { type: 'button', text: known ? '已问过' : '走近看看', 'data-mini-action': 'ask', 'data-mini-face': f.name });
        askBtn.disabled = known || asksLeft <= 0 || settled;
        askBtn.onclick = () => doAsk(f);
        const giveBtn = h('button', { type: 'button', class: 'give', text: '给一颗', 'data-mini-action': 'give', 'data-mini-face': f.name });
        giveBtn.disabled = candiesLeft <= 0 || settled;
        giveBtn.onclick = () => doGive(f);
        acts.append(askBtn, giveBtn);
        card.append(acts);
        grid.appendChild(card);
      }
    }

    function doAsk(f) {
      if (asked.includes(f.name) || asksLeft <= 0 || settled) return;
      asked.push(f.name);
      asksLeft -= 1;
      SFX('click');
      paint();
      refreshBar();
      syncData();
    }

    function doGive(f) {
      if (candiesLeft <= 0 || settled) return;
      given[f.name] = Number(given[f.name] || 0) + 1;
      candiesLeft -= 1;
      SFX('click');
      paint();
      refreshBar();
      syncData();
    }

    keepBtn.onclick = () => {
      if (settled || candiesLeft <= 0) return;
      selfKept += candiesLeft;
      candiesLeft = 0;
      SFX('click');
      paint();
      refreshBar();
      syncData();
    };

    confirmBtn.onclick = () => { if (!settled) settle(); };
    confirmBtn.disabled = true;

    /* ── 开局：名单是**固定的**，一秒不等 ──
       原先这里要等模型现编五个人（比赛网关实测 60 秒上下）。那正好是玩家刚点开玩法、
       最不该等的位置 —— 等 60 秒看五个名字，玩法已经废了。
       现在走作者手写、逐份过闸的池子（FACES_POOL）：开局 0 等待。 */
    (async function start() {
      lead.innerHTML = '红小鬼把三颗糖塞进你手里，说：<b>“给谁你定。”</b><br/>'
        + '<span class="scene">草地上蹲着五个人，说的都是同一句话。</span>';
      sceneEl = lead.querySelector('.scene');
      refreshBar();
      setState('setup');

      let list = null;
      if (Array.isArray(opts.faces) && opts.faces.length) {
        list = gateFaces({ faces: opts.faces });      // 注入的也得过闸（自动化走这条路）
        if (list) facesFrom = 'injected';
      }
      if (!list) { list = pickFaces(place); facesFrom = 'pool'; }

      faces = list;
      try { container.dataset.miniFacesFrom = facesFrom; } catch { /* 已拆 */ }
      hintLine.textContent = '这五个人你都见过，可谁都没说实话。';
      paint();
      refreshBar();
      setState('play');
      confirmBtn.disabled = false;

      void sceneFlavor();                             // 非阻塞：不拦任何操作
    })();

    /** 开场那一句：作者写的那句**立刻就在**；模型有 10 秒机会把它换成今夜的样子，换不到就算了。 */
    async function sceneFlavor() {
      const out = await decideWithin({
        scene: `分糖 · ${place}`,
        callType: 'candy_scene',
        situation: `今天做过的事：${(opts.log || []).join('；') || '（没提供，按草地行军的常规写）'}`,
        state: opts.state || {},
      });
      if (!alive || !out) return;
      if (!sceneEl || !sceneEl.isConnected) return;
      const line = String(out.scene || '').trim();
      if (line) sceneEl.textContent = line.slice(0, 40);
    }

    /* ── 收尾：**当场出结果 + 当场出判词，一秒不等模型** ──
       比分与结局是作者算的；判词先用作者按结局写好的固定文本（FIXED_JUDGE）。
       模型有 10 秒机会把判词升级成它写的那版（并带回 effects）。
       为什么不是"等模型写完再展示"：这个网关的叙事调用实测 30–60 秒
       （时间几乎全在隐藏推理上，输出只有 28 个字也要 38 秒），玩家已经把决定做完了，
       再让他盯着"正在结算"一分钟是不可接受的。等不到就用固定的 —— 玩法本身是完整的。 */
    function settle() {
      if (settled) return;
      settled = true;
      setState('settle');
      confirmBtn.disabled = true;
      keepBtn.disabled = true;
      const g = gradeShare(faces, asked, given, selfKept);
      const detail = {
        outcome: g.outcome, score: g.score, ratio: g.ratio,
        asked: g.asked, given: { ...given }, selfKept,
        cost: ASK_TOTAL - asksLeft,                 // 你花掉的自己的口粮
        covered: g.covered, missedTop: g.missedTop,
        coveredNeed: g.coveredNeed, totalNeed: g.totalNeed,
        faces: faces.map((f) => ({ ...f })),        // 留给模型与营地日志
        facesFrom,                                  // 'pool' | 'injected'
        judge: FIXED_JUDGE[g.outcome] || FIXED_JUDGE.ok,
        judgeFrom: 'fixed',                         // 模型赶上了就变 'model'
        aiPending: !opts.noReview,                  // 10 秒窗口还开着
        effects: {},                                // 只有模型给了才有；固定判词**不编数值**
      };
      try { container.dataset.miniOutcome = g.outcome; } catch { /* 已拆 */ }
      resLine.textContent = `你把糖分了：${shareSummary(faces, given, selfKept)}。`;
      judgeLine.textContent = detail.judge;
      const result = { score: g.score, detail, summary: `分糖：${detail.judge}` };

      paint();
      setState('done');
      SFX('click');
      try { opts.onShare?.({ detail }); } catch { /* 回调炸了不影响 resolve */ }
      resolve(result);                              // ★ 立刻还给调用方，一秒不等
      if (!opts.noReview) void judge(g, detail);    // 给模型 10 秒机会
    }

    /**
     * 给模型 10 秒机会，把固定判词换成它写的那版。
     * 赶上了：换文本、补 effects / lateLine —— 写进**同一个 detail 对象**
     * （接线方手里拿着的就是它，onShare 会再来一次）；
     * 没赶上（超时 / 报错 / 空返回）：一个字都不动，屏幕上一直是作者写的那版。
     */
    async function judge(g, detail) {
      const out = await decideWithin({
        scene: `分糖 · ${place}`,
        callType: 'share_judge',
        situation: `分糖：${shareSummary(faces, given, selfKept)}；`
          + `玩家花 ${detail.cost} 顿口粮打听过 ${asked.length ? asked.join('、') : '任何人'}；`
          + `最后照顾到 ${g.covered.join('、') || '没人'}；最需要的那个${g.missedTop ? '没拿到' : '拿到了'}`,
        state: opts.state || {},
        operation: { type: 'sugar', ...detail },
      });
      detail.aiPending = false;                               // 窗口关闭（不管有没有赶上）
      if (!alive || !container.isConnected || !out) return;   // 没赶上 → 固定判词留着
      const nar = String(out.narrative || '').trim();
      if (!nar) return;                                       // 空返回也算没赶上
      detail.judgeFrom = 'model';
      detail.judge = nar;
      detail.narrative = nar;
      detail.effects = out.effects || {};
      detail.choice = out.choice || '';
      detail.reason = out.reason || '';
      detail.lateLine = out.late_line || '';
      judgeLine.textContent = nar;
      if (detail.choice) judgeLine.appendChild(h('div', { class: 'late', text: detail.choice }));
      if (out.late_line && g.missedTop) {
        judgeLine.appendChild(h('div', { class: 'late', text: `第二天，有人随口说了一句：“${out.late_line}”` }));
      }
      try { opts.onShare?.({ detail }); } catch { /* 判词回调炸了也不影响已经 resolve 的结果 */ }
      teardown();
    }

    /* ── 自清：容器被拆掉就收工 ── */
    const guard = setInterval(() => {
      if (!container.isConnected) {
        clearInterval(guard);
        if (!settled) {
          alive = false;
          resolve({ score: 0, detail: { outcome: 'none', why: 'detached' }, summary: '' });
        }
        teardown();
      }
    }, 500);
    function teardown() {
      alive = false;
      clearInterval(guard);
      window.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape' && !settled && container.isConnected) settle();
    }
    window.addEventListener('keydown', onKey);
  });
}

/* ══════════════ 调试台用的注册项 ══════════════

   题名必须与主线接线时 openBoard({title}) 用的那一串**完全一致**（被测试抓到过漂移）。 */
export const CANDY_MINIGAMES = [
  {
    id: 'candy-share',
    title: '分糖 · 红小鬼的三颗糖',
    family: '取舍',
    run: (host, opts = {}) => runCandyShare(host, opts),
    states: ['setup', 'play', 'settle', 'done'],
    actions: ['ask', 'give', 'keep', 'confirm'],
    act: 'act4 · 草地（热点 candy）',
    note: '两个资源：3 颗糖 + 2 次打听。找得到"最需要的"还是"最会分的"——这两个通常不是同一个人。',
  },
];
