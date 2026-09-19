/**
 * 《译电》v3 · **真译一遍**（四码 · 韵目代日 · 地支代月 · 锁匙加减 · 换本）
 * （**单独开发，未接入主线**）
 *
 * ── 为什么还要再重做一版 ──
 *   v2（minigames-cipher.js）已经把规则砍到一句话：**报上每个密组在密本上查一个字，
 *   同一封报只能用一本**。但用户的评价是：「现在这玩法只能选甲乙，会不会也太简单了」——
 *   因为在 v2 里，**甲、乙两句译文是现成摆着的**，玩家只是在两句之间挑一句。
 *   "译"这件事本身玩家一下也没做过。
 *
 *   所以 v3 把**真实译电的每一步都做成玩家亲手做的事**：
 *
 *     ① **报头**：报文不写"5月4日"，写**「午支」**——地支代月（午＝五月）、
 *        韵目代日（支＝初四）。玩家要自己翻墙上那两张表把它翻成日期。
 *     ② **试锁匙**：敌军收发双方约定一个数，**明码逐位加减这个数再发出**（锁匙加减变法）。
 *        缴获的密文上没写锁匙是几 —— 玩家要**转 0–9 那个旋钮去试**：
 *        转错了，六格全是一片"□"（码本上查不到）；转到对的那一档，
 *        六个字**一下全都认得出来了**。这就是破译的手感。
 *     ③ **定本**：换密之后，**同一串码在新旧两本里配的是不同的字** ——
 *        所以锁匙对了以后，**甲乙两本各译出一句通顺的话，意思正好相反**。
 *        单看译文分不出哪句是真的，只能靠《敌情通报》里的**换密日**与报头那天比。
 *     ④ **判谎**：译得准**不代表情报准** —— 电报写着"没遇上"，人却就在你身后一日半。
 *        这是这一支真正的题眼。
 *
 * ── 史实锚点（逐条可查）──
 *   · **四码法**：1873 年威基谒《电报新书》起，汉字按《康熙字典》次序编号，
 *     一字一码，四个数字一组（0000–9999）。一份电报就是一串四码。
 *   · **地支代月**：子丑寅卯……代十二个月（农历正月建寅，故午为五月）。
 *   · **韵目代日**：洪钧以《平水韵》韵目代日期——**一东 二冬 三江 四支 五微 六鱼 七虞**，
 *     五日＝微、三十日＝陷、三十一日＝世。1935 年 5 月 4 日即"支日"。
 *   · **锁匙加减变法**：收发双方约定一个加减数，明码**逐位加减**此数后发出，
 *     收报方反向还原。是当年最通行的自编密法。
 *   · **换本**：1935 年 5 月 2 日我方一参谋掉队被俘，身上搜出已译的敌电底稿；
 *     敌方 5 月 3 日起严令"须综印多备密码，每日调换使用"。→ 这就是"用哪本"的依据。
 *   · **本题原型**（皎平渡，1935-05-04）：我方破译敌第十三师电报，
 *     该师师长**为保存实力**向自己的上级谎报"前进方向上没有发现共军形迹"，
 *     遂就地休整一天。据此判断"可以赢得四五天"，5 月 9 日主力全部渡完。
 *   · 首长对情报工作的评价："有了二局，我们就像打着灯笼走夜路。"
 *
 * ⚠️ **码值是本作自造的**（用来保证这套加减运算自洽、可验证），
 *    **编码原理（四码／代月／代日／锁匙加减／换本）是真实的**。
 *    虚构层零真实历史人名（项目红线）。
 *
 * ── 玩法（一句话）──
 *   **把锁匙试出来，用对的本子把六个码组逐组翻成字，再判断这句话是不是谎话。**
 *
 * ── 时间预算仍是骨架 ──
 *   天亮前 **3 刻**。翻一份材料 1 刻，回报也要 1 刻。
 *   必须翻《敌情通报》（换密日→定本）＋ 一份佐证（侦察记录／昨报→判谎）＋ 回报 = **正好 3 刻**，
 *   **三份全翻就天亮了，来不及回报**（`dawn`）。
 *
 * ── 失败线 ──
 *   `dawn` 0.10 三份全翻完 / `blunder` 0.15 用错本且结论跟着错本走（读反敌情）/
 *   `wrong` 0.22 本用错、结论也自相矛盾 / `plain` 0.72 译对了但结论保守 /
 *   `pass` 0.95 本对 ＋ 识破谎报。
 *
 * ── AI ──
 *   **游戏内 0 次模型调用**。这一支的每一步都要立刻看到结果（转一下旋钮就要出字），
 *   实测这条网关最省的探测也要 6.79 s，等不起。译完之后的评价仍归主线 `minigame_review`。
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

/** 把 el 滚进最近的那个可滚动祖先的可视区（不动 window，免得把调试台整页也滚走） */
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

function stats(_host, items) { return STATS(items); }

function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

/* ══════════════ 码运算（纯函数）══════════════ */

/** 逐位加：每一位各自 +n 后 mod 10（锁匙加减变法就是这个） */
export function addKey(code, n) {
  return String(code).split('').map((d) => String((Number(d) + n) % 10)).join('');
}

/** 逐位减：每一位各自 -n，不够就借 10 */
export function subKey(code, n) {
  return String(code).split('').map((d) => String((Number(d) - n + 10) % 10)).join('');
}

/** 逐位加一个"四位码"（换本用的偏移 1111） */
export function addShift(code, shift) {
  const s = String(shift).split('');
  return String(code).split('').map((d, i) => String((Number(d) + Number(s[i] || 0)) % 10)).join('');
}

export function subShift(code, shift) {
  const s = String(shift).split('');
  return String(code).split('').map((d, i) => String((Number(d) - Number(s[i] || 0) + 10) % 10)).join('');
}

/* ══════════════ 代月 / 代日（真实的）══════════════ */

/** 地支代月：农历正月建寅，故 寅=1 …… 午=5 …… 丑=12 */
export const BRANCH_MONTH = [
  ['寅', 1], ['卯', 2], ['辰', 3], ['巳', 4], ['午', 5], ['未', 6],
  ['申', 7], ['酉', 8], ['戌', 9], ['亥', 10], ['子', 11], ['丑', 12],
];

/** 韵目代日：《平水韵》韵目代日期，一至三十一 */
export const RHYME_DAY = [
  ['东', 1], ['冬', 2], ['江', 3], ['支', 4], ['微', 5], ['鱼', 6], ['虞', 7],
  ['齐', 8], ['佳', 9], ['灰', 10], ['真', 11], ['文', 12], ['元', 13], ['寒', 14],
  ['删', 15], ['铣', 16], ['篠', 17], ['巧', 18], ['皓', 19], ['哿', 20],
  ['马', 21], ['养', 22], ['梗', 23], ['迥', 24], ['有', 25], ['寝', 26],
  ['感', 27], ['俭', 28], ['艳', 29], ['陷', 30], ['世', 31],
];

export function dayOf(rhymeChar) {
  const row = RHYME_DAY.find((r) => r[0] === rhymeChar);
  return row ? row[1] : null;
}
export function monthOf(branchChar) {
  const row = BRANCH_MONTH.find((r) => r[0] === branchChar);
  return row ? row[1] : null;
}

/* ══════════════ 密本（码表在模块加载时确定性生成）══════════════ */

/**
 * 每个位置是一对字：**甲字 / 乙字**。
 *   甲字＝旧本（甲本）在这串码上配的字，乙字＝新本（乙本）配的字。
 *   两本的码差一个固定的 1357（换本＝整本平移，见 BOOK_SHIFT 的注），所以
 *     同一串密文 用甲本译出甲句、用乙本译出乙句 —— **两句都通顺，意思相反**。
 * 一句话说明为什么必须"字字不重复"：码是全局唯一的，
 * 同一个字若在两对里各出现一次，会被要求有两个不同的码。
 */
/**
 * 换本的偏移。**必须是逐位不相等的**（这里用 1357，不用 1111）：
 *   锁匙是"逐位加减同一个数"，若换本偏移恰好是 1111（逐位差 1），
 *   那"锁匙 +1"就和"换一次本"完全等价 —— 玩家会撞见**两个档位都读出通顺句子**
 *   （(key,甲本) 与 (key+1,甲本) 分别给出甲句和乙句），试锁匙这一步就没了唯一答案。
 *   实测三封报全是 [key, key+1] 泄漏，换成 1357 后归零。
 */
export const BOOK_SHIFT = 1357;

export const PAIRS = [
  // [甲本字, 乙本字]
  ['已', '未'], ['觅', '遇'], ['匪', '共'], ['踪', '迹'], ['追', '休'], ['击', '整'],
  ['职', '本'], ['部', '队'], ['占', '抵'], ['渡', '江'], ['口', '边'],
  ['即', '择'], ['日', '期'], ['开', '待'], ['拔', '命'],
];

/** 字 → 甲本码（四位字符串） */
export const CODE = {};
/** 甲本码 → 字 */
export const REV = {};

(function buildCodebook() {
  const used = new Set();
  PAIRS.forEach(([a, b], i) => {
    for (let t = 0; t < 9999; t++) {
      const base = String(1000 + ((i * 613 + t * 271) % 8500)).padStart(4, '0');
      const aCode = addShift(base, String(BOOK_SHIFT));
      if (!used.has(base) && !used.has(aCode)) {
        CODE[b] = base;            // 乙字的码
        CODE[a] = aCode;           // 甲字的码 = 乙字码 + BOOK_SHIFT
        used.add(base); used.add(aCode);
        return;
      }
    }
  });
  for (const [ch, c] of Object.entries(CODE)) REV[c] = ch;
})();

/** 乙本码（界面上密本的第二列） */
export function codeB(ch) { return subShift(CODE[ch], String(BOOK_SHIFT)); }

/** 查一个码：返回字或 null（查不到就是 □） */
export function lookup(code) { return REV[code] || null; }

/** 解一个密组：密文 -锁匙（-换本偏移） → 查密本 */
export function decodeGroup(cipher, key, book) {
  let c = subKey(cipher, key);
  if (book === 'B') c = subShift(c, String(BOOK_SHIFT));
  return lookup(c);
}

/* ══════════════ 题面池 ══════════════ */

/**
 * 每封报自带：报头（月/日，明文写代月代日字）、锁匙、六对字、
 * 换密日、正确本、正确结论、三份材料、三档回报。
 *
 * `pairs` 的第 i 项的第 0 个是甲字、第 1 个是乙字：
 *   甲句 = pairs.map(p => p[0]).join('')
 *   乙句 = pairs.map(p => p[1]).join('')
 */
export const TELEGRAMS = [
  {
    id: 'rest',
    name: '谎报休整',
    head: { urgent: '万急', month: '午', day: '支', from: '第一台发' },
    key: 3,
    pairs: [['已', '未'], ['觅', '遇'], ['匪', '共'], ['踪', '迹'], ['追', '休'], ['击', '整']],
    swapDay: 3,          // 江日换密
    ansBook: 'B',
    ansReport: 'lie',
    mats: {
      order: '江日（3 日）敌严令换密，限<b>每日一换</b> —— 此后往来电文改用<b>乙本</b>。',
      scout: '该师昨夜宿营地<b>距我后卫仅一日半路程</b>，今晨仍无前进迹象。',
      yesterday: '昨日截获该师电：<b>「已觅匪踪，着即尾追」</b>。',
    },
    reports: {
      rush: '敌已咬住我后卫，建议即刻抢渡',
      calm: '敌未发现我踪迹，可按原计划渡河',
      lie: '此报系该师对上谎报、意在避战 —— 我可从容争得数日',
    },
    reading: '他不是"没遇上"，是"不想追" —— 他在骗自己的上级。',
    trap: '敌人就在你身后一日半路程。',
  },
  {
    id: 'hold',
    name: '实话占据',
    head: { urgent: '万急', month: '午', day: '江', from: '第二台发' },
    key: 7,
    pairs: [['职', '本'], ['部', '队'], ['已', '未'], ['占', '抵'], ['渡', '江'], ['口', '边']],
    swapDay: 4,          // 支日换密
    ansBook: 'A',        // 报头 3 日 < 换密 4 日 → 换密还没发生 → 甲本
    ansReport: 'rush',
    mats: {
      order: '支日（4 日）敌严令换密，限每日一换 —— <b>4 日起</b>改用乙本。',
      scout: '渡口北岸新筑工事<b>三天前才动土</b>，守军并无撤离迹象。',
      yesterday: '昨日截获该师电：<b>「渡口要隘已派兵据守」</b>。',
    },
    reports: {
      rush: '渡口已在敌手，建议改点渡江',
      calm: '渡口尚在我手，可按原计划',
      lie: '守军谎报占据，渡口其实空虚',
    },
    reading: '这一封说的是实话 —— 他真占了渡口，危险是真的。',
    trap: '渡口已经落在敌人手上。',
  },
  {
    id: 'delay',
    name: '谎报缓开',
    head: { urgent: '急', month: '午', day: '微', from: '第三台发' },
    key: 5,
    pairs: [['职', '本'], ['部', '队'], ['即', '择'], ['日', '期'], ['开', '待'], ['拔', '命']],
    swapDay: 4,
    ansBook: 'B',        // 5 日 > 4 日 → 乙本
    ansReport: 'rush',
    mats: {
      order: '支日（4 日）敌严令换密，限每日一换 —— <b>4 日起</b>改用乙本。',
      scout: '该师辎重<b>昨夜仍在前送</b>，前卫已推进至距我三十里处。',
      yesterday: '前日截获该师电：<b>「职部待命即开」</b>。',
    },
    reports: {
      rush: '敌即日开拔，建议即刻抢渡',
      calm: '敌择期待命，可按原计划渡河',
      lie: '此报系谎称待命、意在麻痹我 —— 追兵不会真来',
    },
    reading: '他说"择期待命" —— 辎重却在前送。命令早到了，是他打算悄悄走。',
    trap: '他明天就到。',
  },
];

export const DEFAULT_TG = TELEGRAMS[0];

/** 甲句 / 乙句 */
export function sentenceOf(t, book) {
  return t.pairs.map((p) => (book === 'B' ? p[1] : p[0])).join('');
}

/** 六个密组（密文）—— 用甲字的码加过锁匙 */
export function cipherOf(t) {
  return t.pairs.map((p) => addKey(CODE[p[0]], t.key));
}

/** 用给定的锁匙和本，把六个密组解成六个字（查不到是 null） */
export function decodeAll(t, key, book) {
  const cs = cipherOf(t);
  return cs.map((c) => decodeGroup(c, key, book));
}

/** 这个锁匙下，六组里能查到字的个数 */
export function readableCount(t, key, book) {
  return decodeAll(t, key, book).filter(Boolean).length;
}

/** 哪些锁匙能把六个字全查出来（正确的那一档；两条不变量自检会验它唯一） */
export function validKeys(t) {
  const out = [];
  for (let k = 0; k <= 9; k++) if (readableCount(t, k, 'A') === 6) out.push(k);
  return out;
}

/** 正确本：报头日 > 换密日 → 换密已发生 → 乙本 */
export function ansBookOf(t) {
  return dayOf(t.head.day) > t.swapDay ? 'B' : 'A';
}

/* ══════════════ 判定与分档（纯函数）══════════════ */

export const TIME_MAX = 3;
export const MAT_ROLES = [
  { id: 'order', label: '敌情通报', tag: '定本', cost: 1 },
  { id: 'scout', label: '侦察记录', tag: '判谎', cost: 1 },
  { id: 'yesterday', label: '昨报', tag: '判谎', cost: 1 },
];

export const TIER_SCORE = {
  pass: 0.95, plain: 0.72, wrong: 0.22, blunder: 0.15, dawn: 0.10,
};

/**
 * @param {{book:string, report:string, seen:string[], timeLeft:number, t:object}} a
 *   book     玩家最后定下的本（'A' / 'B' / '' 没定）
 *   report   回报口径 rush / calm / lie / '' 没报
 *   seen     翻过的材料 id 列表
 */
export function tierOf({ book, report, seen, timeLeft = 0, t = DEFAULT_TG }) {
  const ansBook = ansBookOf(t);
  const ansReport = t.ansReport;

  // 天亮：三份全翻完，或刻用完了还没回报
  if (timeLeft <= 0 && !report) return 'dawn';

  const bookRight = book === ansBook;

  if (!bookRight) {
    // 用错本 —— 看他的结论是不是跟着错本那句走的（那就是把敌情读反了）
    const wrongSentenceIsRushy = ansBook === 'B'; // 甲句是"危险句"，乙句是"安全句"
    const followedWrong = wrongSentenceIsRushy ? report === 'rush' : report === 'calm';
    return followedWrong ? 'blunder' : 'wrong';
  }

  if (report === ansReport) return 'pass';
  return 'plain';
}

export function scoreOf(tier) { return TIER_SCORE[tier] ?? 0; }

export const TIER_TEXT = {
  pass: {
    title: '译准了，也看穿了',
    body: (t) => `报头翻出来是 <b>${monthOf(t.head.month)} 月 ${dayOf(t.head.day)} 日</b>，
      比换密的 ${t.swapDay} 日晚 —— 该用<b>${t.ansBook === 'B' ? '乙' : '甲'}本</b>，你用的正是这一本。
      <br>${t.reading}`,
  },
  plain: {
    title: '译准了，话没说透',
    body: (t) => `字都对，锁匙也转对了，本也没用错 —— 只是最后那句回报说得太稳：
      <b>${t.reports[t.ansReport]}</b>。字译得准，不等于情报判得准。`,
  },
  wrong: {
    title: '本用错了',
    body: (t) => `报头是 <b>${dayOf(t.head.day)} 日</b>，换密在 <b>${t.swapDay} 日</b> ——
      该用<b>${t.ansBook === 'B' ? '乙' : '甲'}本</b>。这一本译出来的话和你要报的结论对不上。`,
  },
  blunder: {
    title: '读反了敌情',
    body: (t) => `本用错了，而你的结论**正好跟着那句错话走** —— 报上去的是反的。
      <br><b>${t.trap}</b>`,
  },
  dawn: {
    title: '天亮了',
    body: () => '三份材料一份没落下，可回报也要一刻 —— 没时间了。'
      + '译得再准，没送出去就是没用。',
  },
};

/* ══════════════ 抽一封（避开最近三局）══════════════ */

const LAST_KEY = 'czjc_cipher_v3_recent';
const RECENT_N = 3;

function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 无痕模式忽略 */ } }

export function pickTelegram(tgId) {
  if (tgId) {
    const fixed = TELEGRAMS.find((t) => t.id === tgId);
    if (fixed) return fixed;
  }
  let recent = [];
  try { recent = JSON.parse(lsGet(LAST_KEY) || '[]'); } catch { recent = []; }
  const fresh = TELEGRAMS.filter((t) => !recent.includes(t.id));
  const pool = fresh.length ? fresh : TELEGRAMS;
  const t = pool[Math.floor(Math.random() * pool.length)];
  const next = [t.id, ...recent].slice(0, RECENT_N);
  lsSet(LAST_KEY, JSON.stringify(next));
  return t;
}

/* ══════════════ 样式 ══════════════ */

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const ink = cssVar('--ink', '#e8e0d0');
  const s = document.createElement('style');
  s.textContent = `
.smini21-wrap{position:relative;z-index:2;font-size:14px;line-height:1.7;color:${ink}}
.smini21-desk{
  border-radius:10px;padding:14px 16px 16px;
  background:linear-gradient(180deg,#241d17 0%,#1b1510 60%,#150f0b 100%);
  box-shadow:0 10px 30px rgba(0,0,0,.5),inset 0 0 60px rgba(255,180,90,.07);
  border:1px solid rgba(255,190,120,.14);
}
.smini21-lamp{position:absolute;right:8px;top:-6px;width:150px;height:150px;pointer-events:none;
  background:radial-gradient(circle at 50% 45%,rgba(255,193,116,.20),rgba(255,170,80,.06) 45%,transparent 70%)}
.smini21-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;
  padding-bottom:9px;border-bottom:1px dashed rgba(255,190,120,.22);margin-bottom:11px}
.smini21-urgent{color:#ff8b6b;font-weight:700;letter-spacing:2px;font-size:13px}
.smini21-headmeta{color:#c9b79a;font-size:12.5px;letter-spacing:.5px}
.smini21-headmeta b{color:#ffd79a;font-size:15px;letter-spacing:2px}
.smini21-ke{margin-left:auto;font-size:12.5px;color:#cbb89a}
.smini21-ke b{color:#ffcf8d;font-size:16px}
.smini21-ke .warn{color:#ff9a7a}

/* 电报纸 */
.smini21-paper{
  background:linear-gradient(180deg,#e8dcc0 0%,#ded0b0 100%);
  color:#2b2118;border-radius:3px;padding:12px 14px;
  box-shadow:0 6px 18px rgba(0,0,0,.45);position:relative;
}
.smini21-paper::after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:3px;
  background:repeating-linear-gradient(0deg,rgba(120,90,50,.05) 0 2px,transparent 2px 5px)}
.smini21-plabel{font-size:11px;letter-spacing:3px;color:#7a6444;margin-bottom:6px}
.smini21-groups{display:flex;flex-wrap:wrap;gap:7px 10px}
.smini21-grp{font-family:'Courier New',ui-monospace,monospace;font-size:19px;font-weight:700;
  letter-spacing:4px;color:#3a2c1c;background:rgba(255,255,255,.32);
  border:1px solid rgba(90,70,40,.28);border-radius:2px;padding:3px 8px 2px}
.smini21-grp i{color:#a8875c;font-style:normal}

/* 操作台 */
.smini21-bench{display:flex;gap:14px;flex-wrap:wrap;margin-top:12px}
.smini21-card{background:rgba(255,225,180,.05);border:1px solid rgba(255,190,120,.16);
  border-radius:8px;padding:10px 12px;min-width:0}
.smini21-card h5{margin:0 0 7px;font-size:12px;letter-spacing:2px;color:#e7c894;font-weight:600}
.smini21-keyrow{display:flex;align-items:center;gap:9px}
.smini21-knob{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;
  font-size:22px;font-weight:700;color:#2a1e12;cursor:pointer;user-select:none;
  background:radial-gradient(circle at 35% 30%,#ffd79a,#e0a860 60%,#b8843f);
  box-shadow:0 3px 10px rgba(0,0,0,.5),inset 0 -2px 6px rgba(90,50,10,.4);
  border:1px solid rgba(255,220,160,.5)}
.smini21-knob:hover{filter:brightness(1.08)}
.smini21-keyhint{font-size:11.5px;color:#bda98a;max-width:210px;line-height:1.55}
.smini21-btn{cursor:pointer;border-radius:6px;padding:6px 12px;font-size:13px;
  background:rgba(255,225,180,.09);border:1px solid rgba(255,190,120,.3);color:#f0dcb8;
  transition:.15s;font-family:inherit}
.smini21-btn:hover{background:rgba(255,225,180,.18)}
.smini21-btn.on{background:rgba(255,190,120,.28);border-color:rgba(255,205,140,.7);color:#fff2dc;font-weight:700}
.smini21-btn[disabled]{opacity:.35;cursor:not-allowed}
.smini21-btnrow{display:flex;gap:8px;flex-wrap:wrap}

/* 译文 */
.smini21-slate{margin-top:12px;background:rgba(20,14,10,.55);border:1px solid rgba(255,190,120,.2);
  border-radius:8px;padding:12px 14px}
.smini21-slatetitle{font-size:11.5px;letter-spacing:3px;color:#c9ab7d;margin-bottom:9px}
.smini21-chars{display:flex;gap:8px;flex-wrap:wrap}
.smini21-ch{width:42px;height:50px;display:grid;place-items:center;border-radius:4px;
  font-size:27px;font-weight:700;
  background:linear-gradient(180deg,#efe3c6,#dccdaa);color:#2b2118;
  border:1px solid rgba(255,235,190,.35);box-shadow:0 3px 8px rgba(0,0,0,.4)}
.smini21-ch.empty{background:rgba(255,255,255,.05);color:#8c7a5e;border-style:dashed;
  border-color:rgba(255,190,120,.2);box-shadow:none}
.smini21-ch small{display:block;font-size:9px;letter-spacing:0;font-weight:400;color:#8a7351;margin-top:2px}
.smini21-sent{margin-top:9px;font-size:13px;color:#e2cfa9;letter-spacing:1px}
.smini21-sent b{color:#ffd79a}

/* 代日 / 代月 表 */
.smini21-tables{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}
.smini21-tb{flex:1 1 240px;background:rgba(255,225,180,.045);border:1px solid rgba(255,190,120,.15);
  border-radius:8px;padding:9px 11px}
.smini21-tb h6{margin:0 0 6px;font-size:11.5px;letter-spacing:2px;color:#e2c288;font-weight:600}
.smini21-tbgrid{display:flex;flex-wrap:wrap;gap:4px 7px;font-size:12px;color:#cbb494}
.smini21-tbgrid span{white-space:nowrap}
.smini21-tbgrid span b{color:#ffd79a;font-weight:700}
.smini21-tbgrid span.hit{background:rgba(255,190,120,.25);border-radius:3px;padding:0 3px}

/* 材料 / 回报 */
.smini21-mats{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.smini21-mat{flex:1 1 170px;text-align:left;cursor:pointer;border-radius:8px;padding:10px 12px;
  background:rgba(255,225,180,.06);border:1px solid rgba(255,190,120,.2);color:#f0dcb8;
  font-family:inherit;font-size:13px;transition:.15s}
.smini21-mat:hover{background:rgba(255,225,180,.15)}
.smini21-mat .t{font-weight:700;font-size:13.5px;display:block;margin-bottom:3px}
.smini21-mat .g{font-size:11px;color:#b39d7c;display:block}
.smini21-mat.flipped{cursor:default;background:rgba(255,225,180,.03);border-style:dashed}
.smini21-mat.flipped .g{color:#8f7c60}
.smini21-matbody{margin-top:7px;font-size:12.5px;color:#e6d3ae;line-height:1.65}
.smini21-matbody b{color:#ffd79a}
.smini21-reports{margin-top:12px}
.smini21-rep{display:block;width:100%;text-align:left;cursor:pointer;border-radius:8px;
  padding:9px 12px;margin-bottom:7px;background:rgba(255,225,180,.07);
  border:1px solid rgba(255,190,120,.22);color:#f2e0bd;font-family:inherit;font-size:13px;transition:.15s}
.smini21-rep:hover{background:rgba(255,225,180,.17)}
.smini21-rep .k{display:inline-block;min-width:44px;color:#ffbe86;font-weight:700}

/* 密本 */
.smini21-book{margin-top:12px;border:1px solid rgba(255,190,120,.18);border-radius:8px;overflow:hidden}
.smini21-book>summary{cursor:pointer;padding:8px 12px;background:rgba(255,225,180,.06);
  font-size:12.5px;color:#e7c894;letter-spacing:1px}
.smini21-bookgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));
  gap:3px 8px;padding:10px 12px;font-size:12px;color:#cdb998;max-height:230px;overflow:auto}
.smini21-bookgrid span{display:flex;justify-content:space-between;gap:6px}
.smini21-bookgrid span b{color:#f4e2bd;font-weight:700}
.smini21-bookgrid span i{font-style:normal;color:#9b8767;font-family:'Courier New',monospace;font-size:11px}
.smini21-bookgrid span.hit b{color:#ffd79a}
.smini21-bookgrid span.hit{background:rgba(255,190,120,.18);border-radius:3px;padding:0 3px}

/* 结算 */
.smini21-end{margin-top:14px;border-radius:9px;padding:13px 15px;
  background:rgba(30,20,12,.7);border:1px solid rgba(255,190,120,.28)}
.smini21-end h4{margin:0 0 7px;font-size:15px;color:#ffd79a;letter-spacing:1px}
.smini21-end p{margin:0 0 7px;font-size:13px;line-height:1.75;color:#e4d2b2}
.smini21-end p b{color:#ffd79a}
.smini21-end .truth{margin-top:9px;padding-top:9px;border-top:1px dashed rgba(255,190,120,.25);
  font-size:12.5px;color:#c3ae8d}
.smini21-hint{font-size:11.5px;color:#a4907a;margin-top:8px;line-height:1.6}
`;
  document.head.appendChild(s);
}

/* ══════════════ 玩法主体 ══════════════ */

export function runCipherCode(container, opts = {}) {
  ensureStyle();
  const t = pickTelegram(opts.tgId || opts.telegramId);
  const cipherGroups = cipherOf(t);
  const headDay = dayOf(t.head.day);
  const headMonth = monthOf(t.head.month);

  let key = 0;                 // 玩家当前锁匙
  let book = 'A';              // 玩家当前本
  let ke = TIME_MAX;           // 剩几刻
  const seen = new Set();      // 翻过的材料
  let report = '';             // 回报口径
  let done = false;
  let resolveFn = null;

  container.dataset.mini = 'cipher-v3';
  container.dataset.miniState = 'work';
  container.dataset.miniKey = String(key);
  container.dataset.miniBook = book;
  container.dataset.miniDay = String(headDay);
  container.dataset.miniKe = String(ke);
  container.dataset.miniTelegram = t.id;   // 题面 id（不是答案），给调试与验收脚本认封用

  /* ── DOM ── */
  const wrap = h('div', { class: 'smini21-wrap' });
  const desk = h('div', { class: 'smini21-desk' });
  desk.appendChild(h('div', { class: 'smini21-lamp' }));

  // 报头
  const keEl = h('span', { class: '' });
  const head = h('div', { class: 'smini21-head' }, [
    h('span', { class: 'smini21-urgent', text: t.head.urgent }),
    h('span', {
      class: 'smini21-headmeta',
      html: `${t.head.month}月 <b>${t.head.day}</b> 日 · ${t.head.from}`,
    }),
    h('span', { class: 'smini21-ke' }, [keEl]),
  ]);
  desk.appendChild(head);

  // 电报纸
  const groupsEl = h('div', { class: 'smini21-groups' });
  cipherGroups.forEach((c) => {
    groupsEl.appendChild(h('span', { class: 'smini21-grp', text: c }));
  });
  desk.appendChild(h('div', { class: 'smini21-paper' }, [
    h('div', { class: 'smini21-plabel', text: '缴 获 密 报' }),
    groupsEl,
  ]));

  // 操作台：锁匙 + 本
  const knob = h('div', {
    class: 'smini21-knob', text: String(key),
    'data-mini-action': 'key-turn',
    onclick: () => { key = (key + 1) % 10; refresh(); },
  });
  const keyBack = h('button', {
    class: 'smini21-btn', text: '倒回一位',
    'data-mini-action': 'key-back',
    onclick: () => { key = (key + 9) % 10; refresh(); },
  });
  const btnA = h('button', {
    class: 'smini21-btn on', text: '甲本（旧）',
    'data-mini-action': 'book-a',
    onclick: () => { book = 'A'; refresh(); },
  });
  const btnB = h('button', {
    class: 'smini21-btn', text: '乙本（新）',
    'data-mini-action': 'book-b',
    onclick: () => { book = 'B'; refresh(); },
  });
  const bench = h('div', { class: 'smini21-bench' }, [
    h('div', { class: 'smini21-card' }, [
      h('h5', { text: '一 · 试 锁 匙' }),
      h('div', { class: 'smini21-keyrow' }, [
        knob,
        keyBack,
      ]),
      h('div', {
        class: 'smini21-keyhint',
        text: '明码逐位加减这个数再发出。转到六个字全都认得出来。',
      }),
    ]),
    h('div', { class: 'smini21-card' }, [
      h('h5', { text: '二 · 定 本' }),
      h('div', { class: 'smini21-btnrow' }, [btnA, btnB]),
      h('div', {
        class: 'smini21-keyhint',
        text: '换密后同一串码配的是不同的字。哪本对，看《敌情通报》里的换密日。',
      }),
    ]),
  ]);
  desk.appendChild(bench);

  // 译文
  const charsEl = h('div', { class: 'smini21-chars' });
  const sentEl = h('div', { class: 'smini21-sent' });
  desk.appendChild(h('div', { class: 'smini21-slate' }, [
    h('div', { class: 'smini21-slatetitle', text: '译 文' }),
    charsEl,
    sentEl,
  ]));

  // 代月 / 代日表
  const rhymeGrid = h('div', { class: 'smini21-tbgrid' });
  RHYME_DAY.forEach(([ch, n]) => {
    rhymeGrid.appendChild(h('span', {
      class: ch === t.head.day ? 'hit' : '',
      html: `<b>${ch}</b>${n}`,
    }));
  });
  const branchGrid = h('div', { class: 'smini21-tbgrid' });
  BRANCH_MONTH.forEach(([ch, n]) => {
    branchGrid.appendChild(h('span', {
      class: ch === t.head.month ? 'hit' : '',
      html: `<b>${ch}</b>${n}月`,
    }));
  });
  desk.appendChild(h('div', { class: 'smini21-tables' }, [
    h('div', { class: 'smini21-tb' }, [
      h('h6', { text: '韵 目 代 日（墙上贴着）' }),
      rhymeGrid,
    ]),
    h('div', { class: 'smini21-tb' }, [
      h('h6', { text: '地 支 代 月' }),
      branchGrid,
    ]),
  ]));

  // 材料
  const matsEl = h('div', { class: 'smini21-mats' });
  const matBtns = {};
  MAT_ROLES.forEach((m) => {
    const body = h('div', { class: 'smini21-matbody' });
    const btn = h('button', { class: 'smini21-mat' }, [
      h('span', { class: 't', text: m.label }),
      h('span', { class: 'g', text: `${m.tag} · 翻一次一刻` }),
      body,
    ]);
    btn.addEventListener('click', () => {
      if (done || seen.has(m.id) || ke <= 0) return;
      seen.add(m.id);
      ke -= m.cost;
      body.innerHTML = t.mats[m.id];
      btn.classList.add('flipped');
      btn.removeAttribute('data-mini-action');
      play('page');
      refresh();
    });
    btn.setAttribute('data-mini-action', `mat-${m.id}`);
    matBtns[m.id] = btn;
    matsEl.appendChild(btn);
  });
  desk.appendChild(matsEl);

  // 回报
  const repsEl = h('div', { class: 'smini21-reports' });
  const repBtns = {};
  [['rush', '抢渡'], ['calm', '照原计划'], ['lie', '他在骗上级']].forEach(([id, label]) => {
    const btn = h('button', { class: 'smini21-rep' }, [
      h('span', { class: 'k', text: label }),
      h('span', { text: t.reports[id] }),
    ]);
    btn.addEventListener('click', () => {
      if (done || ke <= 0) return;
      report = id;
      ke -= 1;
      finish();
    });
    btn.setAttribute('data-mini-action', `report-${id}`);
    repBtns[id] = btn;
    repsEl.appendChild(btn);
  });
  desk.appendChild(repsEl);

  // 密本
  const bookGrid = h('div', { class: 'smini21-bookgrid' });
  Object.keys(CODE).sort().forEach((ch) => {
    const a = CODE[ch];
    const b = codeB(ch);
    bookGrid.appendChild(h('span', { class: 'chrow' }, [
      h('b', { text: ch }),
      h('i', { text: `${a} / ${b}` }),
    ]));
  });
  desk.appendChild(h('details', { class: 'smini21-book' }, [
    h('summary', { text: '密 本（甲本码 / 乙本码）· 点开翻' }),
    bookGrid,
  ]));

  desk.appendChild(h('div', {
    class: 'smini21-hint',
    text: '报头那两个字要用墙上的表翻成日子；日子比换密日晚，就该用乙本。'
      + '天亮前三刻：翻材料一刻一份，回报也要一刻。',
  }));

  wrap.appendChild(desk);
  mount(container, wrap);

  /* ── 刷新 ── */
  function refresh() {
    // 锁匙
    knob.textContent = String(key);
    btnA.classList.toggle('on', book === 'A');
    btnB.classList.toggle('on', book === 'B');

    // 译文
    const chars = decodeAll(t, key, book);
    charsEl.innerHTML = '';
    chars.forEach((ch, i) => {
      charsEl.appendChild(h('div', {
        class: 'smini21-ch' + (ch ? '' : ' empty'),
      }, ch ? [document.createTextNode(ch)] : [h('span', { text: '□' })]));
    });
    const readable = chars.filter(Boolean).length;
    if (readable === 6) {
      const s = chars.join('');
      sentEl.innerHTML = `译出来是：<b>${s}</b>`;
    } else if (readable === 0) {
      sentEl.textContent = '一片方框 —— 锁匙不对，码本上查不到。';
    } else {
      sentEl.textContent = `查出 ${readable} 个字，还有 ${6 - readable} 个查不到 —— 锁匙还不对。`;
    }

    // 刻
    keEl.innerHTML = `天亮前 <b class="${ke <= 1 ? 'warn' : ''}">${ke}</b> 刻`;
    container.dataset.miniKe = String(ke);
    container.dataset.miniKey = String(key);
    container.dataset.miniBook = book;
    container.dataset.miniSeen = [...seen].join(',');

    // 锁匙旋钮 / 倒回 / 两个换本键：结算后（或没刻了）一律摘掉标记。
    // 漏了这四个的话，结算面板出来后页面上还留着 4 个"可点"的东西。
    [knob, keyBack, btnA, btnB].forEach((el, i) => {
      const verb = ['key-turn', 'key-back', 'book-a', 'book-b'][i];
      if (done || ke <= 0) el.removeAttribute('data-mini-action');
      else el.setAttribute('data-mini-action', verb);
    });

    // 材料卡：翻过的 / 没刻了的都不给 action
    MAT_ROLES.forEach((m) => {
      const btn = matBtns[m.id];
      if (done || seen.has(m.id) || ke <= 0) btn.removeAttribute('data-mini-action');
      else btn.setAttribute('data-mini-action', `mat-${m.id}`);
    });
    // 回报：没刻了就不给
    Object.keys(repBtns).forEach((id) => {
      const btn = repBtns[id];
      if (done || ke <= 0) btn.removeAttribute('data-mini-action');
      else btn.setAttribute('data-mini-action', `report-${id}`);
    });

    // 天亮
    if (!done && ke <= 0) finish();
  }

  function writeStats() {
    stats(opts.statsHost, [
      ['锁匙', key],
      ['本', book === 'A' ? '甲' : '乙'],
      ['报头日', `${headMonth}月${headDay}日`],
      ['剩刻', ke],
      ['翻过', [...seen].length ? [...seen].map((s) => (s === 'order' ? '通报' : s === 'scout' ? '侦察' : '昨报')).join('/') : '无'],
    ]);
  }

  function finish() {
    if (done) return;
    done = true;
    const tier = tierOf({ book, report, seen: [...seen], timeLeft: ke, t });
    const score = scoreOf(tier);
    const ansBook = ansBookOf(t);

    container.dataset.miniState = 'done';
    container.dataset.miniTier = tier;

    // 结算面板
    const info = TIER_TEXT[tier];
    const end = h('div', { class: 'smini21-end' }, [
      h('h4', { text: info.title }),
      h('p', { html: info.body(t) }),
      h('div', {
        class: 'truth',
        html: `这一报的实情：报头 <b>${t.head.month}月${t.head.day}日</b>（${headMonth} 月 ${headDay} 日），
          换密在 <b>${t.swapDay} 日</b> → 该用 <b>${ansBook === 'B' ? '乙' : '甲'}本</b>，
          译出来是「<b>${sentenceOf(t, ansBook)}</b」。
          锁匙是 <b>${t.key}</b>。<br>${t.reading}`,
      }),
    ]);
    desk.appendChild(end);
    revealScroll(end);
    // 结算后必须再走一遍 refresh —— 否则锁匙旋钮、换本按钮、三份材料、三档回报
    // 上的 [data-mini-action] 全都还挂着（实测残留 8 个），
    // 自动化会以为这一局还没结束，接线后主线也会继续等玩家操作。
    refresh();
    writeStats();
    play(tier === 'pass' || tier === 'plain' ? 'good' : 'bad');

    /* 注意：这里**不能再 new 一个 Promise 去覆盖 resolveFn** ——
       finish() 是在点击回调里跑的，那时外层那个 Promise 的 executor 早执行完了，
       resolveFn 已经是外层的 resolve；一旦在这里重新赋值，外层就永远 resolve 不了，
       接线后主线会一直卡在等玩法返回上（这个坑踩过一次，别再踩）。 */
    setTimeout(() => {
      const r = resolveFn;
      resolveFn = null;
      if (r) {
        r({
          score,
          detail: {
            tier, telegram: t.id, key, book, ansBook, ansReport: t.ansReport,
            report, seen: [...seen], timeLeft: ke,
            sentence: sentenceOf(t, book), ansSentence: sentenceOf(t, ansBook),
            headDay, headMonth, swapDay: t.swapDay,
          },
          summary: `${tier === 'pass' || tier === 'plain' ? '译准了' : '译岔了'}：`
            + `${sentenceOf(t, ansBook)} —— ${t.reading}`,
        });
      }
    }, 60);
  }

  refresh();
  writeStats();

  return new Promise((resolve) => { resolveFn = resolve; })
    .then((v) => v)
    .catch(() => null);
}

/* ══════════════ 调试台规格 ══════════════ */

export const CIPHER_CODE_MINIGAMES = [
  {
    id: 'cipher-v3',
    title: '译电 · 真译一遍',
    family: '判读 · 译码',
    act: 'act3 · 金沙江（待接线）',
    note: 'v3（2026-09-18）。用户原话：「现在这玩法只能选甲乙，会不会也太简单了」——'
      + 'v2 里甲乙两句是<b>现成摆着的</b>，玩家只是在两句之间挑，<b>译这件事一下也没做过</b>。<br>'
      + '这一版把真实译电的每一步都做成玩家亲手做的事：<br>'
      + '① <b>报头</b>写「午支」不写「5月4日」——<b>地支代月</b>（午＝五月）、<b>韵目代日</b>（支＝初四），'
      + '要自己翻墙上那两张表；<br>'
      + '② <b>试锁匙</b>：明码<b>逐位加减</b>一个数再发出（锁匙加减变法），缴获的密文上没写是几 —— '
      + '转 0–9 那个旋钮去试，<b>转错了六格全是□，转到对的那一档六个字一下全认得出来</b>；<br>'
      + '③ <b>定本</b>：换密后同一串码在新旧两本里配的是<b>不同的字</b>，'
      + '所以锁匙对了以后<b>甲乙两本各译出一句通顺的话、意思正好相反</b>，'
      + '单看译文分不出真假，只能拿报头日去比《敌情通报》里的换密日；<br>'
      + '④ <b>判谎</b>：译得准<b>不代表情报准</b> —— 电报写着"没遇上"，人却就在你身后一日半。<br>'
      + '骨架仍是<b>时间预算</b>：天亮前 3 刻，翻材料一刻一份、回报也要一刻，'
      + '<b>三份全翻就天亮了</b>（dawn）。<b>游戏内 0 次模型调用</b>。',
    states: ['work', 'done'],
    actions: ['key-turn', 'key-back', 'book-a', 'book-b',
      'mat-order', 'mat-scout', 'mat-yesterday',
      'report-rush', 'report-calm', 'report-lie'],
    noAi: true,
    run: (host, o = {}) => runCipherCode(host, o),
  },
];
