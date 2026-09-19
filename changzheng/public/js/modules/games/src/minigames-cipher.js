/**
 * 《译电 · 一封电报》（**v2 · 完全重做 · 单独开发，未接入主线**）
 *
 * ── 为什么整份重写 ──
 *   v1 被用户打回，原话：「译电不知所云」。复盘：v1 是 **20 格 9 空 + 灯油 6 格 + 时辰 3 更 +
 *   韵目代日 + 昨报逐字对照**——五套规则同时压在玩家头上，玩家读完说明已经不想玩了。
 *   v2 把规则砍到**一句话能说完**：**报上的每个密组，在密本上查一个字。同一封报只能用一本密本。**
 *   深度不靠规则条数，靠"**时间预算**"和"**结论判断**"。
 *
 * ── 史实锚点（逐条可查，见 docs/HANDOFF-CIPHER.md §一）──
 *   · 1935 年 5 月 4 日，军委总司令部在云南**皎平渡**渡口。我方破译敌报，得知敌第十三师师长
 *     为了保存实力、不愿孤军深入尾追，向自己的上级**谎报**"在其前进的方向上，没有发现共军的形迹"，
 *     遂决定**就地休整一天**，然后再沿原路返回。（吕黎平回忆 · 人民网《"破译三杰"》）
 *   · 据此判断"可以赢得**四五天**时间"；5 月 5 日电令因无船不能渡江的主力沿小道兼程向皎平渡汇集，
 *     **5 月 9 日**全部到达北岸，渡船在北岸烧毁；5 月 10 日敌军赶到江边，红军已全部过江。
 *   · **换密**：5 月 2 日我方一参谋掉队被俘，身上搜出译好的敌电底稿；敌方 5 月 3 日起严令
 *     "须综印多备密码，每日调换使用"。→ **这就是"同一封报该用哪本密本"的史实依据。**
 *   · **韵目代日**：《平水韵》韵目代日期 —— 一东 二冬 **三江** **四支** 五微 六鱼 七虞。
 *     5 月 3 日 = 江，5 月 4 日 = 支。
 *   · 地名：**团街**（禄劝县团街乡，与皎平渡同县境）。
 *   · 首长对情报工作的评价："有了二局，我们就像打着灯笼走夜路。"
 *
 * ── 玩法（规则只有一句）──
 *   报上的每个密组，在密本上查一个字。**甲、乙两本密本各有一套读法，同一封报只能用一本。**
 *
 *   三样东西摆在桌上：
 *     ① **抄报纸**：报头（例规，白给）+ 8 个密组 + 旁边那份「前方台按甲本试译」的现成答案；
 *     ② **密本**：8 行 × 甲/乙两列，点一个字就填进对应的格；
 *     ③ **三份材料**：敌情通报 / 侦察记录 / 昨报。
 *
 *   **时间预算是这一支的骨架**：天亮前只有 **3 刻**；每翻一份材料花 1 刻，
 *   而**翻完三份就没时间回报了**（这就是失败线）。所以必须砍一份。
 *     要定"用哪本"，你需要「敌情通报」（江日=3日换密，改用乙本）+ 墙上那张免费的韵目表
 *     （把报头的"支日"翻成 4 日 → 4 > 3 → 换密已发生 → 用乙本）。**这份不能省。**
 *     要判"这是不是谎"，你需要「侦察记录」（敌距我后卫仅一日半）或「昨报」（昨天他报的是
 *     "已觅匪踪"）—— 任一即可。**还剩 1 刻，只够挑一份。**
 *
 * ── 陷阱 ──
 *   前方台把甲本试译抄在报边：**「已觅匪踪　星夜东进」** —— 读起来一样通顺，
 *   而且它是"别人已经译好的答案"。照抄 = 读反敌情（史实里敌军明明在追，却报"没找到"）。
 *
 * ── 失败线（都由"时间"画，不由配额画）──
 *   · `dawn`    三份材料全翻完 → 天亮，来不及回报；
 *   · `blunder` 照抄甲本 → 读到"已觅匪踪" → 部队连夜抢渡；
 *   · `wrong`   用错本却报了"敌未察觉" → 结论与自己的译文打架；
 *   · `messy`   两本掺着用 → 报出去的句子前后不通。
 *
 * ── 分数（分档实测见 docs/HANDOFF-CIPHER.md §四）──
 *   pass 0.95 / plain 0.72 / rash 0.40 / messy 0.35 / wrong 0.22 / blunder 0.15 / dawn 0.10
 *
 * ── 接不接 AI：**接，但挪出玩家的必经之路**（2026-09-18 第二次改）──
 *   原来这条写的是"不接"：玩家每查一个字都要立刻看到结果，而这条网关实测最省的探测也要 6.79 s。
 *   但用户要"多样性"（原话："就这一条目，是不是有点儿太简单了、太少了"），而多样性只能来自内容 ——
 *   一局只有一封报，玩过一遍再玩就是同一道题。
 *   于是把 AI 放到**两个都不占玩家时间的位置**：
 *     ① **下一封**：板屏一挂上就在后台请求一封新题面，过 gateTelegram 进池（localStorage），
 *        供**下一局**抽取；本局永远用池里现成的一封 —— 玩家一次也等不到它。
 *        它既然不占任何人的窗口，就把上限放宽到 DRAFT_WINDOW_MS = 30s（命中率反而比抢 10 秒高）。
 *     ② **结算**：仍归主线 server/ai.js 的 `minigame_review`（按 operation.type 分派），
 *        本支**不加客户端调用** —— 免得接线后和主线重复调两次。
 *   题面池本身是**手写的六封 + 模型预生成的若干封**，两者过的是**同一道闸**。
 *
 * 玩法 id：`cipher`（没有第二份同名条目：注册表 / acts.json / minigames.js 里都没有 cipher，
 *   所以这里沿用旧 id 不会撞——调试台 specOf 是按 id 在合并表里查的）。
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

function play(sfx) { try { SFX(sfx); } catch { /* 音频没起来不影响玩法 */ } }

/* ══════════════ 小工具（自包含，不 import minigames.js）══════════════ */

function h(tag, attrs = {}, kids = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) el.appendChild(kid);
  return el;
}

function mount(container, node) {
  container.innerHTML = '';
  container.appendChild(node);
  return node;
}

/** 把 el 滚进**最近的那个可滚动祖先**的可视区（板身就是 overflow:auto）。
 *  只认祖先、不动 window —— 否则会把调试台整页也一起滚走。
 *  结算面板展开后比首屏高 270px，不滚进来玩家就看不到自己错在哪（v1 的 P0 之一）。 */
function revealScroll(el) {
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 4) {
      const pr = p.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.bottom > pr.bottom) p.scrollTop += (er.bottom - pr.bottom) + 6;
      return true;
    }
    p = p.parentElement;
  }
  return false;
}

/** 板头数值签（与项目其他玩法同一个签名） */
function stats(_host, items) { return STATS(items); }

/* ══════════════ 常量（验收脚本会 import 它们当权威读数）══════════════ */

/* ── 题面池 ─────────────────────────────────────────────────────────────
   2026-09-18 第二次改。原来只有**一封**电报 —— 玩过一遍，再玩就是同一道题
   （用户原话："就这一条目，是不是有点儿太简单了，太少了"）。
   现在改成**池**：每封报自带 8 个密组、甲/乙两本读法、报头、三份材料、三档回报口径，
   以及"这一封的谎话在哪"。每局抽一封，且**避开最近 3 局抽到的那几封**。

   三条不变量（每封都必须满足；gateTelegram 逐条验，**模型新写的也过同一道闸**）：
   ① 两本都是 8 个汉字，分歧位 ≥3 个、且至少留 1 个共享位（共享位是"同一封报"的锚，白给）；
   ② **极性**：甲本含"进/追/攻/占"类字（读出来是危险），乙本含"休/驻/退/待"类字（读出来是安全）
      —— 同一封报读成"敌人在来"还是"敌人不动"，正是这个玩法要的那个对立；反了就没有陷阱了；
   ③ 零真实历史人名 / 番号全称（项目红线：游戏虚构层不许出现真实人名）。
   分歧位**不手写**，由两串字直接算（diffIdxOf）—— 手写一定会和文案漂移。
   手写这 6 封的共享位落在 2–5 个，但**不把"共享 2–5"写进闸门**：
   那等于给模型出一道字符位置题，它做不了（见下面 gateTelegram 的注）。 */

export const TELEGRAMS = [
  {
    id: 'rest',
    name: '谎报休整',
    head: { urgent: '万急', day: '支日', from: '第一台发' },
    groups: ['7391', '2046', '8815', '5173', '3620', '6498', '4412', '9075'],
    bookA: '已觅匪踪星夜东进',
    bookB: '未觅匪踪就地休整',
    mats: {
      order: '江日（3 日）敌严令换密，限每日一换 —— 此后往来电文改用<b>乙本</b>。',
      scout: '该师距我后卫<b>仅一日半路程</b>。',
      yesterday: '昨日截获该师电：<b>「已觅匪踪，着即尾追」</b>。',
    },
    reports: {
      rush: '敌已察觉我渡口，建议即刻抢渡',
      calm: '敌未察觉我动向，可按原计划渡河',
      lie: '此报系敌对上谎报、意在避战 —— 我可从容争得数日',
    },
    reading: '他不是"没找到"，是"不想追"—— 他在骗自己的上级。',
    trap: '敌人正扑过来。',
  },
  {
    id: 'fallback',
    name: '谎报请撤',
    head: { urgent: '万急', day: '微日', from: '第二台发' },
    groups: ['3157', '8824', '6071', '2493', '9510', '4386', '7725', '1638'],
    bookA: '匪已北窜职部尾追',
    bookB: '匪已远遁职部待命',
    mats: {
      order: '支日（4 日）敌严令换密，限每日一换 —— 此后往来电文改用<b>乙本</b>。',
      scout: '该师前卫昨夜宿营处<b>距我仅三十里</b>，未后撤。',
      yesterday: '前日截获该师电：<b>「职部已抵前沿，拟即攻击」</b>。',
    },
    reports: {
      rush: '敌仍在尾追，建议即刻抢渡',
      calm: '敌已停止追击，可按原计划渡河',
      lie: '此报系该师谎报回防、意在避战 —— 追兵不会真来',
    },
    reading: '他说"已远遁、请撤下来" —— 想撤回去，不打了。',
    trap: '敌人咬着我们追。',
  },
  {
    id: 'yield',
    name: '谎报弃守',
    head: { urgent: '急', day: '鱼日', from: '第三台发' },
    groups: ['5082', '2736', '9144', '3569', '6407', '1295', '8631', '4870'],
    bookA: '我军已占渡口要隘',
    bookB: '我军已撤渡口待命',
    mats: {
      order: '微日（5 日）敌严令换密，限每日一换 —— 此后往来电文改用<b>乙本</b>。',
      scout: '渡口北岸的新筑工事<b>三天前才动土</b>，守军没走远。',
      yesterday: '昨日截获该师电：<b>「渡口要隘已派兵据守」</b>。',
    },
    reports: {
      rush: '敌已占据渡口，建议改点渡江',
      calm: '敌已离开渡口，可按原计划渡河',
      lie: '此报系守军谎报撤守、对上敷衍 —— 渡口空虚，可争得数日',
    },
    reading: '他说"撤出渡口待命" —— 把我们最需要的那道口子让了出来。',
    trap: '渡口已经落在敌人手上。',
  },
  {
    id: 'idle',
    name: '谎报无踪',
    head: { urgent: '万急', day: '支日', from: '第四台发' },
    groups: ['6219', '4590', '1738', '8206', '3952', '7143', '2864', '9471'],
    bookA: '匪部北窜职部截击',
    bookB: '未见匪踪职部待命',
    mats: {
      order: '江日（3 日）敌严令换密，限每日一换 —— 此后往来电文改用<b>乙本</b>。',
      scout: '该师昨夜宿营地<b>距我后卫四十里</b>，并未真的脱离。',
      yesterday: '昨日截获该师电：<b>「已与匪后卫接触」</b>。',
    },
    reports: {
      rush: '敌已与我后卫接触，建议即刻抢渡',
      calm: '敌一天没动，可按原计划渡河',
      lie: '此报系该师谎报无踪、意在避战 —— 我可从容争得数日',
    },
    reading: '他说"未见匪踪、待命" —— 一天没动，他也不想动。',
    trap: '以为两头正在接火。',
  },
  {
    id: 'stall',
    name: '谎报缓开',
    head: { urgent: '急', day: '虞日', from: '第五台发' },
    groups: ['1463', '9078', '5321', '2695', '6834', '4180', '8572', '3246'],
    bookA: '职部遵令即日东开',
    bookB: '职部无令暂不开拔',
    mats: {
      order: '鱼日（6 日）敌严令换密，限每日一换 —— 此后往来电文改用<b>乙本</b>。',
      scout: '该师辎重<b>昨夜还在往前送</b>，没有撤收的样子。',
      yesterday: '昨日截获该师电：<b>「职部待命即开」</b>。',
    },
    reports: {
      rush: '敌即日东开，建议即刻抢渡',
      calm: '敌暂不开拔，可按原计划渡河',
      lie: '此报系该师谎称无令、意在拖延 —— 我可从容争得数日',
    },
    reading: '他说"无令不拔" —— 命令早到了，是他自己不走。',
    trap: '他明天就到。',
  },
  {
    id: 'hold',
    name: '谎报固守',
    head: { urgent: '万急', day: '冬日', from: '第六台发' },
    groups: ['8045', '3617', '7259', '1908', '4783', '6420', '5164', '2391'],
    bookA: '匪已渡江南岸东进',
    bookB: '匪未渡江就地固守',
    mats: {
      order: '东日（1 日）敌严令换密，限每日一换 —— 此后往来电文改用<b>乙本</b>。',
      scout: '对岸敌哨<b>昨夜换了三次岗</b>，位置一点没挪。',
      yesterday: '昨日截获该师电：<b>「匪已渡江一部」</b>。',
    },
    reports: {
      rush: '敌已察觉我渡江，建议即刻抢渡',
      calm: '敌未察觉我渡江，可按原计划渡河',
      lie: '此报系守军谎报"未渡江"、意在避战 —— 我可从容争得数日',
    },
    reading: '他说"未渡江" —— 其实我们已经在渡了，他还在等命令。',
    trap: '我们的行踪已经被报上去了。',
  },
];

export const DEFAULT_TG = TELEGRAMS[0];

/** 两本读法分歧的位置。**由两串字直接算**，不手写 —— 手写会和文案漂移。 */
export function diffIdxOf(t) {
  const out = [];
  for (let i = 0; i < t.bookA.length; i += 1) if (t.bookA[i] !== t.bookB[i]) out.push(i);
  return out;
}

/* ── 内容闸：模型新写的题面必须过这道闸才准进池 ──────────────────────────
  schema 表只能表达"有没有这个键"，表达不了"极性不能反、分歧位够不够"，
  所以这层放在客户端（与夜校的 gateLesson、分糖的 gateFaces 同一个思路）。

  ⚠️ 2026-09-18 教训（实测，见 docs/HANDOFF-CIPHER.md §六）：**闸门不许让模型数位置**。
  原先要求"两串字必须有 2–5 个字完全相同且位置相同"—— 模型看的是 token 不是字，
  字符级位置对齐是它的先天短板：实测 5/5 次把这 2500 个 token 全烧在隐藏推理上、
  吐回空 JSON（92s、143s 各一次），压 prompt、缩短内容都救不回来。
  **对照实验**：同一条 prompt 去掉"位置相同"这条，17.7s 就给出
  「敌军尾追渐次逼近／敌军据守按兵未动」—— 共享 2 位、分歧 6 位，完全可用。
  现在分工：**模型只管把对立的两句写通顺，位置关系由 diffIdxOf 在本地算**；
  闸门只验它算完之后"够不够玩"（分歧位 ≥3、至少留 1 个共享位当锚）。 */

const CJK_ONLY = /^[\u4e00-\u9fff]+$/;
/** 甲本读出来必须是"危险方向"。分两档 —— 这是被「据」字教出来的：
 *  STRICT = **无歧义的进攻字**（乙本里出现它就判极性反了）；
 *  WEAK   = 方向 / 急迫类（甲本有它就算"读出危险"，但**不**拿它去否乙本）。
 *  「据」踩过坑：`占据` 是进攻、`据守` 是防御 —— 一个字两种极性。
 *  先前把「据」放进唯一的 ADVANCE 表，于是模型写对的那句
 *  「…据守按兵未动」被闸门误杀（过闸: 拒绝）。现在「据」下放 WEAK。 */
const AGGR_STRICT = '追扑攻击犯截突逼压占';
const AGGR_WEAK = '东向速急抵尾进据';
const AGGR = AGGR_STRICT + AGGR_WEAK;
/** 乙本读出来必须是"按兵不动" */
const HOLD = '休驻退待守缓回原地按固整撤停防暂';
/** 真名黑名单（项目红线：游戏虚构层零真实历史人名）*/
const BANNED_NAMES = [
  '蒋介石', '毛泽东', '周恩来', '朱德', '林彪', '彭德怀', '刘伯承', '聂荣臻', '罗荣桓',
  '叶剑英', '陈毅', '贺龙', '万耀煌', '陈仲山', '龙云', '王家烈', '薛岳', '吴奇伟', '孙渡',
  '邹毕兆', '曹祥仁', '诸葛亮',
];

/**
 * 验一封题面。不合格一律返回 null（调用方当"没这封"处理）。
 * 只吃 `{book_a, book_b}` 两串字 —— 材料与口径的文案由模板补，不让模型碰。
 */
export function gateTelegram(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bookA = String(raw.book_a ?? raw.bookA ?? '').trim();
  const bookB = String(raw.book_b ?? raw.bookB ?? '').trim();
  if (!CJK_ONLY.test(bookA) || !CJK_ONLY.test(bookB)) return null;
  if (bookA.length !== 8 || bookB.length !== 8) return null;
  const chars = (s) => [...s];
  let same = 0;
  for (let i = 0; i < 8; i += 1) if (bookA[i] === bookB[i]) same += 1;
  const diff = 8 - same;
  if (diff < 3) return null;        // 分歧位太少 → 一局只剩两三次判断
  if (same < 1) return null;        // 一位都不共享，就不像"同一封报"了
  if (!chars(bookA).some((c) => AGGR.includes(c))) return null;        // 甲本必须读出危险
  if (!chars(bookB).some((c) => HOLD.includes(c))) return null;        // 乙本必须读出不动
  if (chars(bookB).some((c) => AGGR_STRICT.includes(c))) return null;  // 极性反了 → 陷阱不成立
  for (const n of BANNED_NAMES) if (bookA.includes(n) || bookB.includes(n)) return null;
  if (/\d/.test(bookA + bookB)) return null;
  return { bookA, bookB };
}

/** 天亮前的刻数。翻材料 1 刻/份，回报 1 刻。 */
export const TIME_MAX = 3;

/** 韵目代日（常备，免费贴在墙上）—— 三江=3 日，四支=4 日 */
export const RHYME = [['一东', '1'], ['二冬', '2'], ['三江', '3'], ['四支', '4'], ['五微', '5'], ['六鱼', '6'], ['七虞', '7']];

/* ── 兼容别名：验收脚本与旧调用点按这几个名字取"第一封"的读数 ── */
export const GROUPS = DEFAULT_TG.groups;
export const BOOK_A = DEFAULT_TG.bookA;
export const BOOK_B = DEFAULT_TG.bookB;
export const DIFF_IDX = diffIdxOf(DEFAULT_TG);
export const HEAD = DEFAULT_TG.head;
/** 前方台按甲本试译，抄在报边（陷阱：照抄就读反） */
export const FRONT_READS = BOOK_A;

/** 史实段（六封报共用 —— 底下那件事是同一件，变的只是截获到的那一封） */
export const TRUTH = '史实：1935 年 5 月 4 日，皎平渡渡口。我方破译敌台电报，得知敌第十三师师长为了保存实力、'
  + '向自己的上级谎报"前进方向上没有发现红军形迹"，决定就地休整一天、再沿原路返回。'
  + '据此判断可赢得四五天：5 月 5 日电令主力兼程向皎平渡汇集，5 月 9 日全部渡到北岸；'
  + '10 日敌军赶到江边时，渡船已在对岸烧毁。';

/** 三份材料的**角色**：id / 标签 / 耗时是共用的，**文案每封报自备**。
 *  ⚠️ 只有 3 刻、回报还要 1 刻 —— 所以最多只翻得动两份。 */
export const MAT_ROLES = [
  { id: 'order', label: '敌情通报', tag: '定本', cost: 1 },
  { id: 'scout', label: '侦察记录', tag: '辨析', cost: 1 },
  { id: 'yesterday', label: '昨报', tag: '辨析', cost: 1 },
];

/** 兼容别名（验收脚本按 MATERIALS 取 id / cost） */
export const MATERIALS = MAT_ROLES;

/** 回报纵队的三种口径：id 固定，文案随题面走 */
export const REPORT_IDS = ['rush', 'calm', 'lie'];

/** 把一封报 + 角色表拼成界面上那三份材料 */
export function materialsOf(t) {
  return MAT_ROLES.map((r) => ({ ...r, text: t.mats[r.id] }));
}

/** 把一封报拼成那三个回报口径 */
export function reportsOf(t) {
  return REPORT_IDS.map((rid) => ({ id: rid, text: t.reports[rid] }));
}

/** 分档底分（六封报共用 —— 分档只看"用哪本 + 报了哪个口径 + 有没有证据"） */
export const TIER_SCORE = { pass: 0.95, plain: 0.72, rash: 0.40, messy: 0.35, wrong: 0.22, blunder: 0.15, dawn: 0.10 };

/**
 * 分档标题 + 叙事。**不出现任何真实历史人名**。
 * `t` 是这一局的题面 —— 文案要点名那两串字，否则六封报读起来像同一封。
 */
export function tierText(tier, t = DEFAULT_TG) {
  const readA = `<q>${t.bookA}</q>`;
  const readB = `<q>${t.bookB}</q>`;
  switch (tier) {
    case 'pass':
      return {
        title: '争到了四五天。',
        body: `你没有照抄别人的答案，也没有只看字面 —— 你读出的是${t.reading}`
          + '一个把自己"按兵不动"报成"没找到"的指挥官，不会真追。'
          + '首长据"可以利用这一矛盾"，把主力调向皎平渡。5 月 9 日全部渡到北岸；'
          + '10 日敌军赶到江边时，渡船已在对岸烧毁。',
      };
    case 'plain':
      return {
        title: '报得稳，但没说透。',
        body: `电报读对了（${readB}），你只把字面报了回来。`
          + '部队多留了一夜警戒才动；那四五天，只剩下两天。',
      };
    case 'rash':
      return {
        title: '读对了，却不信。',
        body: `你明明译出${readB}，回报时还是写了"即刻抢渡"。`
          + '船不够、夜太黑，乱里丢了两条。多花的时间，正好是敌人需要的。',
      };
    case 'messy':
      return {
        title: '译混了。',
        body: '甲、乙两本掺着用，报出去的句子前后不通 —— 机要参谋念了三遍都卡壳，'
          + '天亮才把这句话说清。报文里一个字都不能是猜的。',
      };
    case 'wrong':
      return {
        title: '本子用错了。',
        body: `你按甲本读出了${readA}，回报却说"敌人没发觉" —— `
          + '报出去的结论和你手里那张纸互相打架。纵队只好按住不动，等第二封。',
      };
    case 'blunder':
      return {
        title: '读反了。',
        body: `你照抄了报边那份甲本试译：${readA} —— ${t.trap}纵队接到"敌已发现渡口"，连夜抢渡；那一夜江上没有月光，两条船撞在礁上。`
      };
    default:
      return {
        title: '天亮了。',
        body: '三份材料你全翻了一遍 —— 等提笔回报，天已经亮了。渡口的船还停在原地，'
          + '而敌人在往这边赶。情报工作从来不缺资料，缺的是**下决心的那一刻**。',
      };
  }
}

/* ══════════════ 纯逻辑（无 DOM，可单独在 node 里跑）══════════════ */

/** 有几格选了乙本（只数两本**有分歧**的那几位；共享位选哪本都一样） */
export function bookCount(picks, t = DEFAULT_TG) {
  let n = 0;
  for (const i of diffIdxOf(t)) if (picks[i] === 'B') n += 1;
  return n;
}

/** 这一局实际上用了哪本：'B' 全乙 / 'A' 全甲 / 'mixed' 掺着用 */
export function bookUsed(picks, t = DEFAULT_TG) {
  const n = bookCount(picks, t);
  const total = diffIdxOf(t).length;
  if (n === total) return 'B';
  if (n === 0) return 'A';
  return 'mixed';
}

export function filledCount(picks) {
  return picks.filter(Boolean).length;
}

/** 按当前选择拼出的句子；没填的位用 ＿ */
export function plainOf(picks, t = DEFAULT_TG) {
  return picks.map((p, i) => (p === 'A' ? t.bookA[i] : p === 'B' ? t.bookB[i] : '＿')).join('');
}

/** 有没有拿到"这是谎报"的依据 */
export function hasProof(seen) {
  return seen.includes('scout') || seen.includes('yesterday');
}

/** 这一局落在哪一档 */
export function tierOf({ picks, report, seen, t = DEFAULT_TG }) {
  if (!report) return 'dawn';
  const b = bookUsed(picks, t);
  if (b === 'mixed') return 'messy';
  if (b === 'A') return report === 'rush' ? 'blunder' : 'wrong';
  if (report === 'lie') return hasProof(seen) ? 'pass' : 'plain';
  if (report === 'calm') return 'plain';
  return 'rash';
}

export function scoreOf(tier) {
  const s = TIER_SCORE[tier];
  return s === undefined ? TIER_SCORE.dawn : s;
}

/* ══════════════ 抽题 + 模型预生成（"AI 不给你今天的题，给你下一封"）══════════════

   为什么不能"开局让模型现编一封"：比赛网关实测极简探测 6.79 s、叙事类 19–64 s，
   而耗时几乎全在隐藏推理上（输出 28 个字也要 38 秒），压 prompt 救不回来。
   译电的第一屏**就是那封报本身**，玩家一进来就要看见它 —— 现编必然让人干等十几秒到一分钟。

   所以把 AI 挪出玩家的必经之路：**板屏一挂上就在后台请求"下一封"**，
   回来过 gateTelegram 进池（落 localStorage），供**下一局**抽取。
   本局永远用池里现成的一封 —— 玩家一次也等不到它。
   因为不占任何人的时间，这条的窗口比别处宽得多；
   没回来 / 没过闸只是"池子没长大"，什么都不影响。

   ⚠️ 窗口为什么是 120s 而不是 30s（2026-09-18 实测）：改完 prompt 后真调用**成功**的一次是
   **32.9 s** —— 30s 的窗口会把这次已经成功了的结果直接扔掉（白花一次调用）。
   网关单次实测在 8–90s 之间抖（服务端 TIMEOUT_MS=90s、重试 2 次），
   而这条本来就不占玩家一秒，所以宁可放长：**只有"它回来晚了"会浪费，
   没有任何一屏会因为窗口长而变慢**。`inflight` 单例再保证同一次预取不会叠加发。 */

export const DRAFT_WINDOW_MS = 120000;
const DRAFT_KEY = 'czjc_cipher_drafts';
/** 最近抽过的几封（存 id 数组）—— 见 pickTelegram 的"记忆窗口" */
const LAST_KEY = 'czjc_cipher_last';
const DRAFT_CAP = 6;
/** 抽题时要避开的"最近几局"。只避开**上一局**是不够的：池子只有 6~7 封时，
 *  同一封会隔一局就回来（验收里真抽到过 `yield → 模型那封 → yield`）——
 *  而用户提这一轮要求的原因正是"玩第二遍就是同一道题"。避开最近 3 局之后，
 *  连开三局必然三封都不同。 */
const RECENT_N = 3;

/** 没有 localStorage 的场景（node 里跑单测）一律当"没有" */
function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 同上 */ } }

/** 由两串字确定性地生成 8 个密组（同一对读法永远同一组密组；模型不碰数字） */
function codesFrom(seed) {
  let x = 2166136261;
  for (const c of seed) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619) >>> 0; }
  const out = [];
  for (let i = 0; i < 8; i += 1) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out.push(String(1000 + (x % 9000)));
  }
  return out;
}

function rhymeWordOf(n) {
  const hit = RHYME.find(([, v]) => Number(v) === n);
  return hit ? hit[0] : '一东';
}

/** 模型只出那两串字；**材料、报头、口径、密组由模板补** —— 不让模型碰这些，
 *  它们要跟界面和分档逻辑严丝合缝，交给模板才不会漂。 */
export function dressDraft(pair) {
  const g = gateTelegram(pair);
  if (!g) return null;
  const days = [4, 5, 6, 7];
  const day = days[(g.bookA.charCodeAt(0) + g.bookB.charCodeAt(1)) % days.length];
  return {
    id: `model-${g.bookA}${g.bookB}`,
    name: '模型写的',
    from: 'model',
    head: { urgent: '万急', day: `${rhymeWordOf(day)}日`, from: '另台发' },
    groups: codesFrom(g.bookA + g.bookB),
    bookA: g.bookA,
    bookB: g.bookB,
    mats: {
      order: `${rhymeWordOf(day - 1)}（${day - 1} 日）敌严令换密，限每日一换 —— 此后往来电文改用<b>乙本</b>。`,
      scout: '该师昨夜宿营地<b>距我后卫不足一日路程</b>，未见后撤。',
      yesterday: '昨日截获该师电：<b>「已觅匪踪，着即尾追」</b>。',
    },
    reports: {
      rush: '敌已察觉我渡口，建议即刻抢渡',
      calm: '敌未察觉我动向，可按原计划渡河',
      lie: '此报系敌对上谎报、意在避战 —— 我可从容争得数日',
    },
    reading: '他报的是"按兵不动"，其实是"不想动" —— 他在骗自己的上级。',
    trap: `照抄甲本，读出来是"${g.bookA}" —— 与真话正好相反。`,
  };
}

/** 池里现有的模型题面（已过闸的那几封） */
export function readDrafts() {
  let raw = [];
  try { raw = JSON.parse(lsGet(DRAFT_KEY) || '[]'); } catch { raw = []; }
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => dressDraft(p)).filter(Boolean);
}

/** 把模型新写的一对读法收进池（重复的不收） */
export function saveDraft(pair) {
  const t = dressDraft(pair);
  if (!t) return null;
  const list = readDrafts();
  if (list.some((x) => x.bookA === t.bookA && x.bookB === t.bookB)) return t;
  const keep = [...list, { book_a: t.bookA, book_b: t.bookB }].slice(-DRAFT_CAP);
  lsSet(DRAFT_KEY, JSON.stringify(keep));
  return t;
}

/** 最近抽过的题面 id（新→旧）。老格式是单个字符串，读不动就当"没有"。 */
function recentIds() {
  try {
    const v = JSON.parse(lsGet(LAST_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

/** 抽这一局的题面。`tgId` 可指定（调试台 / 验收要可复现）；
 *  不给就随机，且**避开最近 3 局抽到的那几封**。 */
export function pickTelegram(tgId) {
  const pool = [...TELEGRAMS, ...readDrafts()];
  if (tgId) {
    const hit = pool.find((x) => x.id === tgId);
    if (hit) return hit;
  }
  const recent = recentIds();
  let cand = pool.filter((x) => !recent.includes(x.id));
  if (!cand.length) cand = pool;   // 池子还没"最近 3 封"多 → 退化成全池，别抽不出来
  const t = cand[Math.floor(Math.random() * cand.length)];
  lsSet(LAST_KEY, JSON.stringify([t.id, ...recent.filter((k) => k !== t.id)].slice(0, RECENT_N)));
  return t;
}

/** 同一次预取只发一条：玩家在板屏上进进出出时，别把同一条请求叠成好几条
 *  （叠了会白烧调用、日志也难对账；反正下一局抽到哪一封都一样）。 */
let inflight = null;

/** 后台请求"下一封"。**返回 null 表示这次没成**，调用方什么都不用做。 */
export async function requestDraft(opts = {}, ms = DRAFT_WINDOW_MS) {
  if (inflight) return inflight;
  inflight = run();
  try { return await inflight; } finally { inflight = null; }

  async function run() {
    const ac = new AbortController();
    let timer = 0;
    const seen = [...TELEGRAMS, ...readDrafts()].map((t) => `${t.bookA}／${t.bookB}`);
    try {
      const out = await Promise.race([
        DECIDE({
          scene: '译电 · 截获敌台电报（为下一局备题）',
          callType: 'cipher_draft',
          situation: '换一封信，不要和已给出的重复。',
          state: opts.state || {},
          operation: { type: 'cipher', avoid: seen },
        }, { signal: ac.signal }),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
      ]);
      if (!out) return null;
      return saveDraft(out);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      ac.abort();
    }
  }
}

/* ══════════════ 样式（前缀 smini17-）══════════════ */

const STYLE_ID = 'smini17-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  /* 注意：这段 CSS 写在模板字符串里，**注释里不许出现反引号**（会当场闭合模板串）。
     本支全部用 DOM 排版，不用 canvas —— 密组与汉字都要够小又够清楚，
     canvas 上的汉字在 0.79 缩放下会糊（见 docs/MINIGAMES.md）。
     坐标系只有一套：没有绝对定位的嵌套定位父级，所有盒子都在文档流里。 */
  s.textContent = `
  .smini17-wrap {
    position: relative; width: 100%; box-sizing: border-box;
    font-family: var(--font, serif); color: #e8dcc0;
    padding: 10px 10px 12px; border-radius: 6px; overflow: hidden;
  }

  /* ── 场景层：金沙江的夜。画作当场景，只叠夜色与一点灯火，不另画山水。── */
  .smini17-scene { position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background-image: url('/assets/scenes/jinsha_ferry.jpg');
    background-size: cover; background-position: 50% 42%; }
  .smini17-night { position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background:
      radial-gradient(52% 40% at 18% 64%, rgba(255, 206, 128, .26), rgba(255, 190, 110, 0) 70%),
      linear-gradient(180deg, rgba(9, 12, 20, .84), rgba(11, 13, 18, .76) 44%, rgba(14, 12, 10, .88)); }
  /* 天亮：刻用掉一格，东边就白一分。这是"时间"这个资源的画面。 */
  .smini17-dawn { position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: 0;
    background: linear-gradient(180deg, rgba(226, 214, 188, .5), rgba(206, 190, 160, .08) 44%, rgba(0, 0, 0, 0) 66%);
    transition: opacity .8s ease; }

  .smini17-in { position: relative; z-index: 3; }

  /* ── 报头 ── */
  .smini17-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .smini17-head b { font-size: 12.5px; letter-spacing: .08em; color: #f0e3c8; font-weight: 600; }
  .smini17-head span { font-size: 10.5px; color: #c8b48c; font-family: var(--font-num, monospace); }
  .smini17-rule { margin: 4px 0 6px; font-size: 11px; line-height: 1.55; color: #cbbda0; }
  .smini17-rule b { color: #e8c073; font-weight: 600; }
  .smini17-rule i { font-style: normal; color: #9fb4c4; }

  /* ── 两栏：左=抄报纸，右=密本 ── */
  .smini17-cols { display: grid; grid-template-columns: minmax(0, 1.18fr) minmax(0, 1fr); gap: 8px; align-items: start; }
  @media (max-width: 560px) { .smini17-cols { grid-template-columns: 1fr; } }

  /* ── 抄报纸：真正的纸。字压在纸面上，对比度不随照片漂。── */
  .smini17-sheet { position: relative; border-radius: 4px; padding: 7px 7px 6px;
    background-image: url('/assets/scenes/echo_paper.jpg');
    background-size: cover; background-position: 50% 40%;
    border: 1px solid rgba(60, 44, 24, .55);
    box-shadow: 0 8px 22px rgba(0, 0, 0, .45), inset 0 0 26px rgba(120, 88, 44, .2); }
  .smini17-thead { font-family: var(--font, serif); font-size: 11.5px; color: #1b1409; letter-spacing: .06em; }
  .smini17-thead b { color: #8c2f22; font-weight: 600; }
  .smini17-rhyme { margin-top: 2px; font-size: 9.5px; line-height: 1.35; color: #5d4c30;
    font-family: var(--font-num, monospace); }
  .smini17-rhyme em { font-style: normal; color: #8c2f22; font-weight: 600; }

  /* 8 格：两行四列 */
  .smini17-cells { margin-top: 6px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  .smini17-cell { border-radius: 3px; padding: 2px 1px 1px; text-align: center; box-sizing: border-box;
    border: 1px solid rgba(74, 56, 30, .4); background: rgba(255, 251, 240, .42); }
  .smini17-cell.is-on { background: rgba(255, 246, 220, .82); border-color: rgba(140, 47, 34, .6); }
  .smini17-cell.is-proof { box-shadow: inset 0 -3px 0 rgba(74, 100, 52, .8); }
  .smini17-code { font-family: var(--font-num, monospace); font-size: 9.5px; letter-spacing: .04em;
    color: #6b5433; line-height: 1.1; }
  .smini17-slot { font-size: 20px; line-height: 1.14; font-weight: 600; color: #1b1409; }
  .smini17-slot.is-void { color: rgba(90, 72, 44, .42); font-weight: 400; font-size: 17px; }

  .smini17-fread { margin-top: 6px; padding-top: 4px; border-top: 1px dashed rgba(74, 56, 30, .35);
    font-size: 10px; line-height: 1.5; color: #4e3f26; }
  .smini17-fread b { color: #1b1409; letter-spacing: .14em; font-weight: 600; }
  .smini17-copy { margin-top: 4px; padding: 3px 8px; border-radius: 3px; cursor: pointer;
    border: 1px solid rgba(140, 62, 42, .65); background: rgba(255, 248, 232, .5);
    color: #6d2a1d; font-family: var(--font, serif); font-size: 10.5px; }
  .smini17-copy:hover { background: rgba(255, 246, 222, .85); }

  /* ── 密本：8 行 × 甲/乙 ── */
  .smini17-book { border-radius: 4px; padding: 6px 7px 7px;
    background: rgba(22, 19, 14, .72); border: 1px solid rgba(168, 134, 63, .38); }
  .smini17-book h4 { margin: 0 0 4px; font-size: 10.5px; letter-spacing: .16em; color: #e2c98c; font-weight: 600; }
  .smini17-btab { width: 100%; border-collapse: collapse; }
  .smini17-btab th { font-size: 9.5px; font-weight: 400; color: #a99b7e; letter-spacing: .1em;
    padding: 0 0 3px; text-align: center; }
  .smini17-btab th:first-child { text-align: left; }
  .smini17-bcode { font-family: var(--font-num, monospace); font-size: 10px; color: #9a8e74;
    letter-spacing: .05em; padding: 0 4px 0 0; white-space: nowrap; }
  .smini17-btab td { padding: 1px 0; }
  .smini17-bbtn { width: 100%; padding: 1px 0; border-radius: 3px; cursor: pointer; box-sizing: border-box;
    border: 1px solid rgba(120, 100, 62, .5); background: rgba(255, 250, 236, .12);
    color: #e8dcc0; font-family: var(--font, serif); font-size: 15px; line-height: 1.25;
    transition: background .12s ease; }
  .smini17-bbtn:hover { background: rgba(255, 246, 222, .26); }
  .smini17-bbtn.is-on { background: linear-gradient(180deg, rgba(240, 214, 150, .95), rgba(206, 168, 96, .95));
    color: #1a1207; border-color: rgba(246, 220, 156, .9); font-weight: 600; }
  .smini17-btab tr.is-diff .smini17-bcode { color: #e2c98c; }

  /* ── 材料 ── */
  .smini17-mats { margin-top: 7px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .smini17-mats em { font-style: normal; font-size: 10.5px; letter-spacing: .12em; color: #b9ab8d; }
  .smini17-mat { padding: 3px 9px; border-radius: 3px; cursor: pointer; white-space: nowrap;
    border: 1px solid rgba(168, 134, 63, .55); background: rgba(24, 20, 14, .6);
    color: #e8dcc0; font-family: var(--font, serif); font-size: 11px; }
  .smini17-mat small { font-family: var(--font-num, monospace); font-size: 9px; color: #a99b7e; margin-left: 3px; }
  .smini17-mat:hover { background: rgba(48, 40, 26, .8); }
  .smini17-mat.is-on { background: rgba(58, 46, 26, .9); border-color: rgba(232, 192, 115, .8); color: #f0dcae; }
  .smini17-mat.is-warn { background: rgba(120, 44, 30, .8); border-color: rgba(240, 160, 120, .85); color: #ffe4d2; }
  .smini17-mbox { margin-top: 5px; display: flex; flex-direction: column; gap: 3px; }
  .smini17-mbox:empty { display: none; }
  .smini17-mline { padding: 4px 7px; border-radius: 3px; font-size: 10.5px; line-height: 1.5;
    background: rgba(20, 17, 12, .68); border-left: 2px solid rgba(168, 134, 63, .6); color: #ddcfb2; }
  .smini17-mline u { text-decoration: none; color: #e2c98c; letter-spacing: .1em; }

  /* ── 底栏 ── */
  .smini17-hud { margin-top: 7px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .smini17-meter { display: flex; align-items: center; gap: 4px; }
  .smini17-meter em { font-style: normal; font-size: 10.5px; letter-spacing: .12em; color: #b9ab8d; }
  .smini17-pip { width: 9px; height: 9px; border-radius: 50%;
    background: rgba(120, 108, 84, .4); border: 1px solid rgba(180, 160, 120, .45); }
  .smini17-pip.on { background: #9fb4c4; border-color: #cfdde8; }
  .smini17-go { margin-left: auto; padding: 6px 15px; border-radius: 3px; cursor: pointer;
    border: 1px solid rgba(168, 134, 63, .8);
    background: linear-gradient(180deg, rgba(214, 176, 100, .95), rgba(168, 128, 58, .95));
    color: #1a1207; font-family: var(--font, serif); font-size: 12.5px; letter-spacing: .12em; font-weight: 600; }
  /* 未就绪：压暗但仍要读得出"还差 N 字"—— v1 那种 0.42 的透明度在夜色底上等于没写 */
  .smini17-go.is-off { opacity: .72; cursor: default;
    background: rgba(96, 86, 66, .62); border-color: rgba(178, 160, 120, .62); color: #efe6d2; }

  /* 回报口径 */
  .smini17-opts { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
  .smini17-opts:empty { display: none; }
  .smini17-opt { padding: 6px 9px; border-radius: 3px; cursor: pointer; text-align: left;
    border: 1px solid rgba(168, 134, 63, .55); background: rgba(24, 20, 14, .66);
    color: #e8dcc0; font-family: var(--font, serif); font-size: 11.5px; line-height: 1.45; }
  .smini17-opt:hover { background: rgba(58, 46, 26, .9); color: #f0dcae; }

  /* ── 反馈行：标出处，别让它看着像在说当前这一格 ── */
  .smini17-say { margin-top: 6px; font-size: 11.5px; line-height: 1.5; color: #e8dcc0; }
  .smini17-say:empty { display: none; }
  .smini17-say i { font-style: normal; color: #e2c98c; }
  .smini17-say.s-bad i { color: #e8a48c; }

  /* ── 结算 ── */
  .smini17-end { margin-top: 9px; padding: 9px 11px; border-radius: 4px;
    background: rgba(20, 17, 12, .82); border: 1px solid rgba(168, 134, 63, .42); }
  /* 【踩过的坑】结算盒在首屏就是空的：不排掉它，首屏底下会挂一个 30px 的空白纸框
     —— 像素断言全绿、页面零报错，只有整屏截图看得出来（v1 那一版就是这个毛病）。 */
  .smini17-end:empty { display: none; }
  .smini17-end h4 { margin: 0 0 4px; font-size: 13px; letter-spacing: .1em; color: #f0dcae; }
  .smini17-end p { margin: 4px 0 0; font-size: 12px; line-height: 1.65; color: #ddd0b4; }
  .smini17-end q { color: #e8c073; font-style: normal; letter-spacing: .12em; }
  .smini17-end .miss { margin-top: 6px; padding-top: 5px; border-top: 1px dashed rgba(168, 134, 63, .3);
    font-size: 10.5px; line-height: 1.55; color: #b9ab8d; }
  .smini17-end .miss b { color: #ddcfb2; font-weight: 600; }
  .smini17-end .src { margin-top: 6px; font-size: 10px; line-height: 1.5; color: #9a8e74; }

  @media (prefers-reduced-motion: reduce) {
    .smini17-dawn, .smini17-bbtn { transition: none; }
  }
  `;
  document.head.appendChild(s);
}

/* ══════════════ 玩法本体 ══════════════ */

export function runCipher(container, opts = {}) {
  ensureStyle();
  const id = opts.id || 'cipher';

  /* 这一局的题面：`opts.telegram` 可指定（调试台与验收要可复现），否则随机抽一封、避开最近 3 局。 */
  const T = pickTelegram(opts.telegram);

  /* 下面这几个名字与模块级常量**同名 —— 是故意的遮蔽**：runCipher 内部从此只认这一局的这封报，
     不必去改函数体里二十多处引用。模块级那几个同名导出是"第一封"的读法，供验收脚本按名取用。 */
  const GROUPS = T.groups;
  const BOOK_A = T.bookA;
  const BOOK_B = T.bookB;
  const DIFF_IDX = diffIdxOf(T);
  const HEAD = T.head;
  const MATERIALS = materialsOf(T);
  const REPORTS = reportsOf(T);
  const FRONT_READS = T.bookA;

  return new Promise((resolve) => {
    const S = {
      picks: new Array(GROUPS.length).fill(null),
      clock: TIME_MAX,
      seen: [],
      warn: null,          // 二次确认中的材料
      report: null,
      phase: 'read',       // read | report | done
      done: false,
      out: null,
      draft: 'idle',       // 后台那封"下一局"的题：idle | pending | ready | none
    };

    /* ── 结构 ── */
    const elScene = h('div', { class: 'smini17-scene' });
    const elNight = h('div', { class: 'smini17-night' });
    const elDawn = h('div', { class: 'smini17-dawn' });

    const elHead = h('div', { class: 'smini17-head' }, [
      h('b', { text: '译电 · 一封电报' }),
      h('span', { text: `皎平渡 · ${HEAD.day}夜` }),
    ]);
    /* 题面点名 + 来源标记：六封手写的与模型预生成的**同池抽取**，
       标出来是为了"每局不一样"这件事在界面上看得见、也能被验收脚本读到。
       （insertAdjacentHTML 用的是 innerHTML —— 模型那两串字过了 CJK_ONLY 闸，插不进标签。）*/
    const elRule = h('p', {
      class: 'smini17-rule',
      html: `本封：<b>${T.name}</b>${T.from === 'model' ? '<i>（模型写的题面）</i>' : ''}　`
        + '报上的每个密组，在密本上查一个字 —— <b>甲、乙两本各有一套读法，同一封报只能用一本</b>。'
        + '天亮的 <i>3 刻</i>里，每翻一份材料花 1 刻，回报也要 1 刻。',
    });

    /* 抄报纸 */
    const elThead = h('div', { class: 'smini17-thead' });
    const elRhyme = h('div', { class: 'smini17-rhyme' });
    const elCells = h('div', { class: 'smini17-cells' });
    const elFread = h('div', { class: 'smini17-fread' });
    const elCopy = h('button', {
      class: 'smini17-copy', type: 'button',
      text: '照抄前方台这份',
      'data-mini-action': 'copy',
    });
    /* 【踩过的坑·第二次】按钮一定要挂监听：v1 那轮的"挑石按钮是死的"就是这个，
       这次照抄按钮又漏了一遍 —— 而它偏偏是"读反敌情"那条失败线的唯一入口，
       漏了它等于那条线在界面上不存在（QA 的 B2 段当场抓到）。 */
    elCopy.addEventListener('click', () => copyFront());
    const elSheet = h('div', { class: 'smini17-sheet' }, [elThead, elRhyme, elCells, elFread, elCopy]);

    /* 密本 */
    const elBtab = h('table', { class: 'smini17-btab' });
    const elBook = h('div', { class: 'smini17-book' }, [h('h4', { text: '密　本' }), elBtab]);

    const elCols = h('div', { class: 'smini17-cols' }, [elSheet, elBook]);

    /* 材料 */
    const elMatLabel = h('em', { text: '先看什么' });
    const elMatBtns = [];
    for (const m of MATERIALS) {
      const b = h('button', {
        class: 'smini17-mat', type: 'button',
        'data-mini-action': 'material',
        'data-mini-mat': m.id,
      }, [h('span', { text: m.label }), h('small', { text: m.tag + ' · ' + m.cost + '刻' })]);
      b.addEventListener('click', () => buyMaterial(m.id));
      elMatBtns.push(b);
    }
    const elMbox = h('div', { class: 'smini17-mbox' });
    const elMats = h('div', { class: 'smini17-mats' }, [elMatLabel, ...elMatBtns]);

    /* 底栏 */
    const elMeter = h('div', { class: 'smini17-meter' });
    const elGo = h('button', { class: 'smini17-go', type: 'button', text: '回报纵队' });
    elGo.addEventListener('click', () => openReport());
    const elHud = h('div', { class: 'smini17-hud' }, [elMeter, elGo]);

    const elOpts = h('div', { class: 'smini17-opts' });
    const elSay = h('div', { class: 'smini17-say' });
    const elEnd = h('div', { class: 'smini17-end' });

    const elIn = h('div', { class: 'smini17-in' }, [
      elHead, elRule, elCols, elMats, elMbox, elHud, elOpts, elSay, elEnd,
    ]);
    const wrap = h('div', { class: 'smini17-wrap' }, [elScene, elNight, elDawn, elIn]);
    mount(container, wrap);

    /* ── 对外观测面：所有字段同一时刻一齐可见 ── */
    function writeDataset() {
      container.dataset.mini = id;
      container.dataset.miniState = S.phase;
      container.dataset.miniClock = String(S.clock);
      container.dataset.miniFilled = String(filledCount(S.picks));
      container.dataset.miniNew = String(bookCount(S.picks, T));
      container.dataset.miniSeen = S.seen.join(',');
      container.dataset.miniBook = filledCount(S.picks) === GROUPS.length ? bookUsed(S.picks, T) : '';
      container.dataset.miniReport = S.report || '';
      container.dataset.miniTier = S.out ? S.out.tier : '';
      container.dataset.miniScore = S.out ? String(S.out.score) : '';
      /* 题面来源：池里手写的六封 / 模型预生成的那几封（'pool' | 'model'） */
      container.dataset.miniTg = T.id;
      container.dataset.miniTgName = T.name;
      container.dataset.miniTgFrom = T.from || 'pool';
      container.dataset.miniDiff = String(DIFF_IDX.length);
      /* 分歧位具体是哪几位 —— 每封不同，所以自动化不能写死（它得按本封的实际位置点） */
      container.dataset.miniDiffIdx = DIFF_IDX.join(',');
      container.dataset.miniPool = String(TELEGRAMS.length + readDrafts().length);
      /* 后台那封"下一局"的题：idle → pending → ready / none */
      container.dataset.miniDraft = S.draft;
    }

    function say(html, bad) {
      elSay.className = 'smini17-say' + (bad ? ' s-bad' : '');
      elSay.innerHTML = html || '';
    }

    function renderStats() {
      stats(opts.stats, [
        ['刻', `${S.clock}/${TIME_MAX}`],
        ['已译', `${filledCount(S.picks)}/${GROUPS.length}`],
      ]);
    }

    /* ── 抄报纸 ── */
    function renderSheet() {
      elThead.innerHTML = `<b>${HEAD.urgent}</b>　${HEAD.day}　${HEAD.from}`;
      /* ⚠️ RHYME 里的词是"四支"（带序号），而报头写的是"支日" —— 原来直接比较，
         两者永远不相等，那个高亮**一次也没亮过**（"报头是几号"正是推断的关键一步，
         高亮不亮等于这一步少了个提示）。改成去掉序号再加"日"比。 */
      elRhyme.innerHTML = '韵目代日：'
        + RHYME.map(([w, n]) => (w.slice(1) + '日' === HEAD.day
          ? `<em>${w}=${n}日</em>` : `${w}=${n}`)).join('　');

      elCells.innerHTML = '';
      GROUPS.forEach((code, i) => {
        const p = S.picks[i];
        const ch = p === 'A' ? BOOK_A[i] : p === 'B' ? BOOK_B[i] : null;
        elCells.appendChild(h('div', {
          class: 'smini17-cell' + (ch ? ' is-on' : '') + (DIFF_IDX.includes(i) && ch ? ' is-proof' : ''),
          'data-mini-cell': String(i),
          'data-mini-code': code,
        }, [
          h('div', { class: 'smini17-code', text: code }),
          h('div', { class: 'smini17-slot' + (ch ? '' : ' is-void'), text: ch || '＿' }),
        ]));
      });

      elFread.innerHTML = '前方台按<b>甲本</b>试译：'
        + FRONT_READS.split('').join('') + '　<span style="opacity:.72">（抄在报边，照不照抄随你）</span>';

      elCopy.hidden = S.phase !== 'read';
      if (elCopy.hidden) elCopy.removeAttribute('data-mini-action');
      else elCopy.setAttribute('data-mini-action', 'copy');
    }

    /* ── 密本 ── */
    function renderBook() {
      elBtab.innerHTML = '';
      const live = S.phase === 'read';
      const thead = h('tr', {}, [
        h('th', { text: '' }), h('th', { text: '甲本' }), h('th', { text: '乙本' }),
      ]);
      const tb = h('tbody', {}, [thead]);
      GROUPS.forEach((code, i) => {
        const diff = DIFF_IDX.includes(i);
        const mk = (book, ch) => {
          const b = h('button', {
            class: 'smini17-bbtn' + (S.picks[i] === book ? ' is-on' : ''),
            type: 'button', text: ch,
            'data-mini-action': live ? 'pick' : false,
            disabled: live ? null : 'disabled',
            'data-mini-book': book,
            'data-mini-idx': String(i),
          });
          b.addEventListener('click', () => pickChar(i, book));
          return h('td', {}, [b]);
        };
        tb.appendChild(h('tr', { class: diff ? 'is-diff' : '' }, [
          h('td', { class: 'smini17-bcode', text: code }),
          mk('A', BOOK_A[i]),
          mk('B', BOOK_B[i]),
        ]));
      });
      elBtab.appendChild(tb);
    }

    /* ── 材料 ── */
    function renderMats() {
      for (let k = 0; k < MATERIALS.length; k++) {
        const m = MATERIALS[k];
        const b = elMatBtns[k];
        const got = S.seen.includes(m.id);
        b.className = 'smini17-mat' + (got ? ' is-on' : '') + (S.warn === m.id ? ' is-warn' : '');
        b.innerHTML = '';
        b.appendChild(h('span', { text: m.label }));
        b.appendChild(h('small', {
          text: got ? '已阅' : (S.warn === m.id ? '再点=天亮' : m.tag + ' · ' + m.cost + '刻'),
        }));
        b.hidden = S.phase !== 'read';
        if (b.hidden) b.removeAttribute('data-mini-action');
        else b.setAttribute('data-mini-action', 'material');
      }
      elMbox.innerHTML = '';
      for (const m of MATERIALS) {
        if (!S.seen.includes(m.id)) continue;
        elMbox.appendChild(h('div', { class: 'smini17-mline', html: `<u>${m.label}｜</u>${m.text}` }));
      }
      elMatLabel.hidden = S.phase !== 'read';
    }

    /* ── 底栏 ── */
    function renderHud() {
      elMeter.innerHTML = '';
      elMeter.appendChild(h('em', { text: '刻' }));
      for (let k = 0; k < TIME_MAX; k++) {
        elMeter.appendChild(h('span', { class: 'smini17-pip' + (k < S.clock ? ' on' : '') }));
      }
      const full = filledCount(S.picks) === GROUPS.length;
      const ok = S.phase === 'read' && full && S.clock >= 1;
      elGo.className = 'smini17-go' + (ok ? '' : ' is-off');
      elGo.textContent = full ? '回报纵队' : `还差 ${GROUPS.length - filledCount(S.picks)} 字`;
      elGo.hidden = S.phase !== 'read';
      if (ok) elGo.setAttribute('data-mini-action', 'report');
      else elGo.removeAttribute('data-mini-action');
      elDawn.style.opacity = String(0.16 * (TIME_MAX - S.clock));
    }

    function renderAll() {
      renderSheet(); renderBook(); renderMats(); renderHud(); renderStats();
      syncClocks();
      writeDataset();
    }

    /** 刻用完 → 天亮：这是失败线，不是"配额扣光"。
     *  只在"还在读"的阶段生效 —— 回报本身也要花 1 刻，
     *  不能因为"把最后一刻用在回报上"就判天亮（那会把最省时的正确打法判死）。 */
    function syncClocks() {
      if (S.done || S.phase !== 'read') return;
      if (S.clock >= 1) return;
      finish('dawn');
    }

    /* ── 交互 ── */
    function pickChar(i, book) {
      if (S.phase !== 'read') return;
      S.picks[i] = S.picks[i] === book ? null : book;
      play('echo');
      say(`第 ${i + 1} 组 <i>${GROUPS[i]}</i> 记作「${book === 'A' ? BOOK_A[i] : BOOK_B[i]}」（${book === 'A' ? '甲本' : '乙本'}）`);
      renderAll();
    }

    function copyFront() {
      if (S.phase !== 'read') return;
      for (let i = 0; i < GROUPS.length; i++) S.picks[i] = 'A';
      play('wrong');
      say('<i>照抄</i>：整封报按甲本填好了 —— 前方台是这么译的。', true);
      renderAll();
    }

    function buyMaterial(mid) {
      if (S.phase !== 'read') return;
      const m = MATERIALS.find((x) => x.id === mid);
      if (!m || S.seen.includes(mid)) return;
      if (S.clock - m.cost < 1 && S.warn !== mid) {
        // 二次确认：翻完这份天就亮了，没时间回报
        S.warn = mid;
        play('wrong');
        say(`还剩 <i>${S.clock}</i> 刻 —— 翻完这份，就没时间回报了。再点一次就是天亮。`, true);
        renderAll();
        return;
      }
      S.warn = null;
      S.clock = Math.max(0, S.clock - m.cost);
      S.seen.push(mid);
      play('echo');
      say(`翻到了《<i>${m.label}</i>》。`);
      renderAll();
    }

    function openReport() {
      if (S.phase !== 'read') return;
      if (filledCount(S.picks) !== GROUPS.length || S.clock < 1) return;
      S.clock -= 1;
      S.phase = 'report';
      play('click');
      elOpts.innerHTML = '';
      for (const r of REPORTS) {
        const b = h('button', {
          class: 'smini17-opt', type: 'button', html: `回报：${r.text}`,
          'data-mini-action': 'opt', 'data-mini-opt': r.id,
        });
        b.addEventListener('click', () => chooseReport(r.id));
        elOpts.appendChild(b);
      }
      say(`报已抄清：<i>${plainOf(S.picks, T)}</i>。现在，报告什么？`);
      renderAll();
    }

    function chooseReport(rid) {
      if (S.phase !== 'report') return;
      S.report = rid;
      play(rid === 'lie' ? 'correct' : 'click');
      finish(tierOf({ picks: S.picks, report: S.report, seen: S.seen, t: T }));
    }

    /* ── 结算 ── */
    function finish(tier) {
      if (S.done) return;
      S.done = true;
      S.phase = 'done';
      S.out = { tier, score: scoreOf(tier) };

      container.querySelectorAll('[data-mini-action]').forEach((n) => n.removeAttribute('data-mini-action'));
      elOpts.innerHTML = '';
      elCells.style.pointerEvents = 'none';

      const tx = tierText(tier, T);
      const missed = MATERIALS.filter((m) => !S.seen.includes(m.id));
      const used = bookUsed(S.picks, T);
      const bookName = used === 'A' ? '甲本' : used === 'B' ? '乙本' : '两本掺着用';

      const kids = [
        h('h4', { text: tx.title }),
        /* 先点名"你读出来的到底是哪一句" —— 六封报的真话各不相同，
           不点名的话结算屏那套模板读起来像在说同一封。 */
        h('p', {
          html: `本封（${T.name}）：<q>${T.bookB}</q>　你报出去的：<q>${plainOf(S.picks, T)}</q>`,
        }),
        h('p', { text: tx.body }),
      ];
      if (missed.length) {
        kids.push(h('div', {
          class: 'miss',
          html: '<b>你没来得及翻的那份：</b><br>' + missed.map((m) => `${m.label}：${m.text}`).join('<br>'),
        }));
      }
      kids.push(h('div', {
        class: 'src',
        html: `题面：${T.from === 'model' ? '模型预生成' : '手写池'}　用本：${bookName}`
          + `　刻剩：${S.clock}/${TIME_MAX}　已阅：${S.seen.length}/3　分：${S.out.score.toFixed(2)}`,
      }));
      elEnd.innerHTML = '';
      elEnd.appendChild(h('div', {}, kids));
      elEnd.appendChild(h('div', { class: 'src', html: TRUTH }));

      renderAll();
      elGo.hidden = true;
      renderStats();
      /* 结算面板比首屏高一大截 —— 展开后顺着板身把它滚进可视区 */
      const scrollEnd = () => revealScroll(elEnd);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scrollEnd);
      else scrollEnd();

      const book = filledCount(S.picks) === GROUPS.length ? used : '';
      resolve({
        score: S.out.score,
        detail: {
          tier,
          book,
          report: S.report,
          seen: S.seen.slice(),
          clock: S.clock,
          filled: filledCount(S.picks),
          plain: plainOf(S.picks, T),
          copied: book === 'A',
          missed: missed.map((m) => m.id),
          /* 这一局用的是哪封报、从哪来 —— 接线方与日志要能看出"多样性真的在发生" */
          telegram: T.id,
          telegramFrom: T.from || 'pool',
          telegramBooks: { A: T.bookA, B: T.bookB },
          diffPositions: DIFF_IDX.length,
        },
        summary: `译电：${tx.title}（${T.name}·${bookName}，刻剩 ${S.clock}）`,
      });
    }

    /* 离开板屏自清 */
    const guard = setInterval(() => {
      if (document.body.contains(container)) return;
      clearInterval(guard);
      if (!S.done) {
        S.done = true;
        resolve({ score: 0, detail: { tier: 'detached', why: 'detached' }, summary: '离开板屏' });
      }
    }, 500);
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => clearInterval(guard), { once: true });
    }

    renderAll();

    /* ── 后台给**下一局**备一封题 ──
       板屏一挂上就发，谁也不等它：本局用的是池里现成的一封，玩家从进来到离开都不会卡在这里。
       回来了 → 过 gateTelegram → 进池（localStorage），下一局就可能抽到"模型写的那封"。
       没回来 / 没答对 / 没过闸 → S.draft 落 'none'，池子维持原样，什么都不影响。
       这条之所以能放宽到 30 秒，正因为它不占任何人的时间 ——
       别处那个 10 秒窗口是给"玩家正在等"的调用设的，这条不适用。 */
    S.draft = 'pending';
    writeDataset();
    void requestDraft(opts).then((made) => {
      S.draft = made ? 'ready' : 'none';
      /* 板屏已经拆了就别再碰它的 dataset（拆了也不影响结果，只是白写） */
      if (document.body.contains(container)) writeDataset();
    });
  });
}

/* ══════════════ 调试台卡片 ══════════════ */

export const CIPHER_MINIGAMES = [
  {
    id: 'cipher',
    title: '译电 · 一封电报',
    family: '推断',
    act: 'act3 · 金沙江（幕前）',
    note: '**v2 整份重写 + 题面池**（2026-09-18，v1 被用户打回：「译电不知所云」）。'
      + '规则只剩一句：<b>报上的每个密组，在密本上查一个字；甲、乙两本各有一套读法，同一封报只能用一本</b>。'
      + '手上 8 个密组 + 报头（例规，白给）+ 报边那份「前方台按甲本试译」的现成答案。'
      + '骨架是<b>时间预算</b>：天亮前 3 刻，每翻一份材料 1 刻、回报 1 刻 → <b>翻完三份就没时间回报</b>。'
      + '要定"用哪本"，得翻《敌情通报》（换密日早于报头日 → 改用乙本）配墙上那张免费的韵目代日表；'
      + '要判"这是不是谎"，得翻《侦察记录》或《昨报》—— 只剩 1 刻，只够挑一份。'
      + '陷阱：照抄甲本 → 读反敌情。'
      + '失败线：<b>dawn</b> 三份全翻完、天亮来不及回报 / <b>blunder</b> 照抄甲本读反 / '
      + '<b>wrong</b> 用错本却报"敌未察觉" / <b>messy</b> 两本掺着用。'
      + '<br><b>题面池（本轮新加）</b>：手写 6 封 + 模型预生成的若干封，<b>同池随机抽取、避开最近 3 局</b>；'
      + '每封的密组、甲/乙两本读法、分歧位置、报头日子、材料文案、三档口径<b>全都不同</b>，'
      + '分歧位每封 3~6 个 —— 玩第二遍背不出答案。'
      + '<br><b>AI 放在两个都不占玩家时间的位置</b>：① 板屏一挂上就在后台请求"下一封"'
      + '（<code>cipher_draft</code>、30s 窗口），过闸进池供<b>下一局</b>抽 —— 本局永远用池里现成的一封，'
      + '玩家一次也等不到它；② 结束后由主线 <code>minigame_review</code> 按 <code>operation.type</code> 接管结算。',
    states: ['read', 'report', 'done'],
    actions: ['pick', 'copy', 'material', 'report', 'opt'],
    noAi: false,
    noAiNote: '本支**在玩家的必经之路上 0 次调用**（每个字、每份材料都要当场出结果），'
      + '唯一的调用是挂载后**后台预生成"下一封"题面**（30s 窗口、结果供下一局用）——'
      + '它不挡任何操作，玩家等不到它；回来了也要过 <code>gateTelegram</code> 才准进池。',
    run: (host, o = {}) => runCipher(host, o),
  },
];

export const CARDS = CIPHER_MINIGAMES;

/* 接线时要动的三处（**等用户验收通过再动**）：
   ① data/acts.json · act3 加一个**幕前**（照 act4「雪山」的形状）：
        "prelude": { "id": "cipher", "title": "译电", "pano": "/assets/scenes/jinsha_ferry.jpg",
                     "kind": "cipher" }
      —— 为什么走幕前不走热点：act3 是 apDays3 × apPerDay2 = **6 点行动点**，
         而非 march 热点正好 6 个（老船工/木筏/伤员/老乡/铁索桥头/背囊），预算已满；
         再开热点就变成 7 个抢 6 点，玩家必然漏掉一项（很可能正好漏掉译电）。
         幕前**不占行动点、不会被漏掉**，而且"先拿到那四五天，再决定怎么过江"因果最顺。
      —— 为什么是 act3：皎平渡就是金沙江，史实上破译发生在渡江之前；act1 归补草鞋、act2 归对歌。
   ② public/js/main.js · runPrelude() 目前只认 choice（act4 那条路）。给"玩法型幕前"加一句分支：
        if (pre.kind) { await HOTSPOT_HANDLERS[pre.kind](act, { kind: pre.kind }); }
      并新增 doCipher()：openBoard({ title:'译电 · 一封电报', bg: sceneImage('/assets/scenes/jinsha_ferry.jpg',
      '/assets/scenes/jinsha_pano.jpg') })，然后把 board.body 交给 runCipher(host, { stats: board.stats, id:'cipher' })。
   ③ public/js/minigames-registry.js · { id:'cipher', title:'译电 · 一封电报', family:'推断',
      run: runCipher, states:['read','report','done'], actions:[...], act:'act3' }
      板头题名三处必须一致：「译电 · 一封电报」。 */
