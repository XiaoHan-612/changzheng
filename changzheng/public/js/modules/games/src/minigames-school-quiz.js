/**
 * 《夜校识字 · 知识竞答》（AI 随机出题版 · **单独开发，未接入主线**）
 *
 * ── 它取代的是什么 ──
 *   旧版（minigames.js 的 runNightSchool，58 行）在这个点上只有一种玩法：
 *   三道写死的单选题，**三道的正确答案都是 A**（`a: 0`）——一路点 A 就是 3/3；
 *   "口令"也写死成 `'瑞金'`；整屏没有一个 `data-*` 标记，自动化只能干等；
 *   模型一次都没被调用。玩家没有决策、没有代价、没有输的可能。
 *
 * ── 这一版保留什么、改什么 ──
 *   保留：**教员出题、学员作答**这件事本身（这是历史锚点里的"具名、地名、口令作课本"）。
 *   改掉：
 *     ① 题目**由模型当场出**（school_quiz 一次调用出三道 + 今晚口令），每次都不一样；
 *     ② 每题只有一次机会、**14 秒香头**，超时也算记歪了 —— 失败条件在这里；
 *     ③ 错的那一项会被当成对的记住（模型在 minigame_review 里要写出"歪成什么字"）；
 *     ④ 口令题答错 → `detail.password` 为空 → 下游《夜岗》走"对不上暗号"的分支。
 *
 * ── 玩家的决策在哪 ──
 *   · **限时**：14 秒里要在四个形近/近音的选项里认出对的那个 —— 犹豫就是输；
 *   · **不能回退**：一次作答定生死，错了那一道就永远是错的那道；
 *   · **取舍**：三道题里有一道是口令，答错它比答错别的更贵（夜岗要用）。
 *
 * ── 内容闸（为什么必须有）──
 *   `gateQuiz()` 是纯函数，逐题查：题干够长、选项正好 4 个且互不相同、答案下标没越界。
 *   另外两件事只能在客户端补：
 *     · **答案位置打散**：模型很爱把三个答案都放在 A（旧版就是写死的 A）。
 *       若三道题答案同位置，就地调换选项顺序（不动题目内容），否则"一路点同一个字母"又满分了。
 *     · **口令题保底**：模型三道题里没有一道以今晚口令作正确答案 → 客户端补一道，
 *       否则"口令喂给夜岗"这条线会断。
 *
 * ── 与另一条路的关系 ──
 *   同一个点上的另一个选择是《一灯油》（minigames-school.js）：那条路考的是"怎么分光"，
 *   这条路考的是"限时里认不认得出来"。两条路的产出格式**故意对齐**（都有
 *   password / passwordOk / outcome），这样下游《夜岗》不用关心玩家走了哪条路。
 *   入口由 minigames-school-entry.js 提供。
 *
 * ── 契约（与主线玩法完全一致，见 public/js/step.js 顶部）──
 *   1. 签名  runXxx(container, opts) -> Promise<{ score: 0..1, detail, summary? }>
 *   2. 容器  container.dataset.mini / container.dataset.miniState
 *   3. 操作  所有可交互元素带 [data-mini-action]（本支：answer）
 *   4. 自清  离开板屏后动画 / 定时器 / 监听自行停止
 *
 * ── 额外可观测状态（自动化靠它们驱动，见 tests/manual/qa-school.mjs）──
 *   miniQ      第几题（0 起）
 *   miniLeft   本题剩余秒数（一位小数）
 *   miniScore  已答对几道
 *   miniAnswer 本题正确答案下标（作答前为 -1，防作弊式断言）
 *   miniPicked 本题玩家选的下标（-1 = 还没选 / 超时）
 *   miniOutcome 结局词：all | two | one | none
 *
 * 玩法 id：`nightschool-quiz`
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

/* ── 小工具（与 minigames.js / minigames-school.js 同名同义，故意不共享） ── */

function stats(_host, items) { return STATS(items); }

function sfx(name) {
  try { SFX(name); } catch { /* 单独搬走没有音频模块也不该炸 */ }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** 确定性随机：星点、草丛、选项洗牌都要可复现，画面/结论才不会每跑一次换一个样 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLACE_NAME = {
  草地: '松潘草地 · 1935 年 8 月 · 教员用树枝在沙地上写字',
  遵义: '遵义老城 · 1935 年 1 月 · 灯下把今天的路出成题',
};

const POOLS = {
  草地: ['松潘', '毛儿盖', '班佑', '若尔盖', '巴西', '草地', '夹金山', '雪山', '泸定桥',
    '金沙江', '皎平渡', '腊子口', '瑞金', '于都', '遵义', '赤水', '湘江',
    '老班长', '小号手', '指导员', '卫生员', '红小鬼', '同志', '战友', '司务长'],
  遵义: ['遵义', '瑞金', '于都', '湘江', '乌江', '赤水', '娄山关', '桐梓', '泸定桥',
    '金沙江', '草地', '腊子口', '老班长', '指导员', '卫生员', '红小鬼', '司务长',
    '宣传员', '小号手', '同志', '战友'],
};

/** 备题库：模型不可用时用。**故意多备几道、每题随机抽** ——
 *  免得"备课本"又变成一个每局一样的固定题。界面会明说这是备题库。 */
const FALLBACK_BANK = [
  { q: '「志」字，写的是哪一层意思？', options: ['志向、意志', '语气词', '一个地名', '数量单位'], answer: 0, explain: '志，心里的方向。同志，就是同一条方向上的人。' },
  { q: '「同志」这个称呼，说的是什么人？', options: ['只指军官', '同一条路上的人', '老乡', '过路的陌生人'], answer: 1, explain: '同志，因共同的方向走到一起，跟军衔无关。' },
  { q: '「瑞金」是哪一个地方？', options: ['一条江', '一座桥', '我们从那儿出发的城', '一座雪山'], answer: 2, explain: '瑞金在江西，是中央红军出发的地方。' },
  { q: '「于都河」上发生过什么？', options: ['打了一场大仗', '夜里架浮桥渡河出发', '分过粮食', '开过大会'], answer: 1, explain: '1934 年 10 月，队伍在于都河夜渡，开始长征。' },
  { q: '「泸定桥」最要紧的是什么？', options: ['桥上的木板', '桥下的水', '桥头的守军', '铁索本身'], answer: 3, explain: '桥板被抽走，只剩十三根铁索——过桥靠的是铁索。' },
  { q: '「雪山」上的队伍最怕什么？', options: ['太阳太大', '停下不走', '果子太多', '路太宽'], answer: 1, explain: '雪山上不能停：一停下，人就再也起不来了。' },
  { q: '「草地」里最要命的是什么？', options: ['沼气泡子', '风沙', '陡坡', '蚊虫'], answer: 0, explain: '看着是草，踩下去是泥潭。走草地要踩着前人的脚印。' },
  { q: '「老班长」这三个字里的「班」，本义跟什么有关？', options: ['一条河', '队列、一班人', '一块石头', '一种粮食'], answer: 1, explain: '班，本是分队的意思。班长就是这一班人的头儿。' },
  { q: '「小号手」的「号」，在这里指什么？', options: ['号码', '名字', '能吹响的军号', '日期'], answer: 2, explain: '号，是那支铜号；号声一响，全营都听他的。' },
];

/* ── 样式（运行时注入；画面自己的色写在 JS 里，不碰项目 CSS） ──
   注意两层：舞台是**夜**，里面的字色一律写死浅色 —— 用 --ink-* 会拿到浅色主题的深墨，
   在黑底上等于没写。 */
function ensureStyle() {
  if (document.getElementById('school-quiz-style')) return;
  const s = document.createElement('style');
  s.id = 'school-quiz-style';
  s.textContent = `
.smini4-wrap { display: flex; flex-direction: column; gap: 9px; align-items: center; width: 100%; }
.smini4-stage { position: relative; display: flex; flex-direction: column; width: 100%; max-width: 720px;
  margin: 0 auto; overflow: hidden; border-radius: 6px; border: 1px solid var(--rule-strong, rgba(0,0,0,.2));
  background: #05080b; user-select: none; }

/* 层次必须显式给 z-index：*.smini4-night / sand 是 absolute，不给就会盖住 static 的题干盒。
   （项目里踩过一次：背景层压住内容盒，默认动效下侥幸可点，减动效下整屏点不动。） */
.smini4-night { position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(140% 96% at 50% 118%, #1b2a34 0%, #101a21 44%, #070d12 78%, #04070a 100%); }
.smini4-star { position: absolute; width: 2px; height: 2px; border-radius: 50%; background: rgba(214,228,238,.62); }
.smini4-hill { position: absolute; left: 0; right: 0; bottom: 26%; height: 30%; background: #0a1116;
  clip-path: polygon(0 78%, 9% 52%, 18% 66%, 27% 40%, 38% 60%, 47% 34%, 58% 56%, 68% 38%, 79% 62%, 88% 46%, 100% 70%, 100% 100%, 0 100%); }
.smini4-ground { position: absolute; left: 0; right: 0; bottom: 0; height: 28%;
  background: linear-gradient(#0b1013, #06090b); }

.smini4-top { position: relative; z-index: 2; flex: 1 1 auto; display: flex; flex-direction: column;
  justify-content: center; padding: 14px 22px 12px; min-height: 156px; }
.smini4-sand { position: absolute; z-index: 1; left: 7%; right: 7%; top: 16%; bottom: 10%;
  border-radius: 30px 18px 26px 14px; pointer-events: none;
  background: radial-gradient(120% 100% at 38% 26%, #d9c193 0%, #c4a978 56%, #a98f60 100%);
  box-shadow: inset 0 0 0 2px rgba(92,72,42,.30), inset 0 -8px 16px rgba(90,70,40,.24); }
.smini4-qtext { position: relative; z-index: 2; margin: 0; text-align: center; color: #3b2d17;
  font-family: var(--font-kai, "KaiTi", serif); line-height: 1.5;
  text-shadow: 0 1px 0 rgba(255,246,226,.30); }
.smini4-qtag { position: relative; z-index: 2; margin: 0 0 6px; text-align: center; color: #6b5a38;
  font-size: 12px; letter-spacing: .16em; font-family: var(--font-kai, var(--font)); }
.smini4-lamp { position: absolute; z-index: 3; left: 10px; bottom: 8px; width: 44px; height: 55px; pointer-events: none; }
.smini4-kid { position: absolute; z-index: 3; right: 16px; bottom: 10px; width: 62px; height: 78px;
  pointer-events: none; transition: transform .22s ease; }
.smini4-kid.yes { transform: translateY(-5px) rotate(-4deg); }
.smini4-kid.no { transform: translateY(2px) rotate(6deg); }

.smini4-opts { position: relative; z-index: 2; display: grid; grid-template-columns: 1fr 1fr;
  gap: 8px; padding: 10px 14px 4px; }
.smini4-opt { display: flex; align-items: center; gap: 9px; text-align: left; cursor: pointer;
  padding: 9px 12px; border-radius: 4px; border: 1px solid #7c5f39;
  background: linear-gradient(178deg, #cdae7c 0%, #c2a173 52%, #b0905f 100%);
  color: #241a0e; font-family: var(--font-kai, "KaiTi", serif); font-size: 15px; line-height: 1.35;
  transition: transform .12s ease, box-shadow .12s ease; }
.smini4-opt:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(0,0,0,.4); }
.smini4-opt:disabled { cursor: default; }
.smini4-opt .k { flex: none; width: 18px; height: 18px; display: grid; place-items: center;
  border-radius: 50%; border: 1px solid rgba(60,44,22,.55); font-size: 11px; font-family: var(--font); }
.smini4-opt.right { border-color: #e9c16e; box-shadow: inset 0 0 0 2px rgba(233,193,110,.75); }
.smini4-opt.wrong { border-color: #9b2d24; box-shadow: inset 0 0 0 2px rgba(155,45,36,.75); opacity: .82; }
.smini4-opt.dim { opacity: .42; }

.smini4-foot { position: relative; z-index: 2; display: flex; flex-direction: column; gap: 4px;
  padding: 6px 14px 10px; }
.smini4-line { display: flex; align-items: center; gap: 10px; }
.smini4-wick { flex: 1 1 auto; height: 7px; border-radius: 4px; background: rgba(120,104,80,.32);
  overflow: hidden; border: 1px solid rgba(196,183,156,.22); }
.smini4-wick > i { display: block; height: 100%; width: 100%;
  background: linear-gradient(90deg, #f0d59a, #d8a94e); transition: width .1s linear; }
.smini4-wick.low > i { background: linear-gradient(90deg, #dd9a78, #b8543a); }
.smini4-meta { flex: none; color: #cdc6b4; font-size: 12px; }
.smini4-read { margin: 0; color: #cdc6b4; font-size: 12.5px; line-height: 1.45;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.smini4-read .good { color: #f0d59a; }
.smini4-read .bad { color: #e59a90; }

.smini4-hud { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 720px; }
.smini4-status { margin: 0; text-align: center; font-size: 14px; line-height: 1.7; min-height: 24px;
  color: var(--ink-0); font-family: var(--font-kai, var(--font)); }
.smini4-status .warn { color: var(--seal); }
.smini4-status .good { color: var(--gold); }
.smini4-hint { margin: 0; text-align: center; font-size: 12px; color: var(--ink-2); line-height: 1.6; }
.smini4-hint b { color: var(--ink-0); font-weight: 400; }
.smini4-actions { display: flex; gap: 10px; justify-content: center; min-height: 34px; align-items: center; }
`;
  document.head.appendChild(s);
}

/* ══ 内容闸 + 计分（导出成纯函数，方便单测） ══ */

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * 模型出的三道题必须真的能玩。
 * @returns {{quiz:{password:string,questions:Array}|null, notes:string[]}}
 */
export function gateQuiz(raw, pool) {
  const notes = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { quiz: null, notes: ['返回不是对象'] };

  const qs = [];
  for (const q of (Array.isArray(raw.questions) ? raw.questions : [])) {
    if (!q || typeof q !== 'object') continue;
    // 字段别名：提示词写的是 q/options/answer_index，但模型也会写 question/choices/answer/index。
    const text = String(q.q || q.question || '').trim();
    const opts = (Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : [])
      .map((o) => String(o == null ? '' : o).trim());
    const rawIdx = q.answer_index != null ? q.answer_index : (q.answer != null ? q.answer : q.index);
    let ai = Number(rawIdx);
    if (!Number.isInteger(ai)) ai = NaN;
    if (text.length < 4) { notes.push('题干太短或缺失'); continue; }
    if (opts.length !== 4) { notes.push(`选项不是 4 个（${opts.length}）`); continue; }
    if (opts.some((o) => !o)) { notes.push('有选项是空的'); continue; }
    if (new Set(opts).size !== 4) { notes.push('选项里有重复项'); continue; }
    if (!(ai >= 0 && ai < 4)) { notes.push(`答案下标越界：${String(rawIdx)}`); continue; }
    qs.push({ q: text, options: opts, answer: ai, explain: String(q.explain || '').slice(0, 80) });
  }
  if (qs.length < 3) {
    return { quiz: null, notes: [...notes.slice(0, 3), `只凑齐 ${qs.length} 道题（要 3 道）`] };
  }
  const picked = qs.slice(0, 3);

  // ① 答案位置打散。模型极爱把三个答案都放在 A（旧版干脆写死 a:0，一路点 A 就满分）。
  //    三道题答案同位置时，**就地调换选项顺序**：题目、解说、正确内容一个字不动，
  //    只让"正确项"换个位置。这样既保留了模型的内容，又堵掉了"一路点同一个字母"。
  const spread = new Set(picked.map((x) => x.answer));
  if (spread.size === 1) {
    const targets = [0, 2, 1];
    picked.forEach((x, i) => {
      const to = targets[i];
      if (x.answer === to) return;
      const keep = x.options[to];
      x.options[to] = x.options[x.answer];
      x.options[x.answer] = keep;
      notes.push(`第${i + 1}题正确项从 ${LETTERS[x.answer]} 换到 ${LETTERS[to]}（原三题答案同位置）`);
      x.answer = to;
    });
  }

  // ② 口令：必须落在候选池里，而且**必须有一道题以它作正确答案** ——
  //    否则"口令喂给夜岗"这条线会断（detail.password 就永远只能是空串）。
  let password = String(raw.password || '').trim();
  if (!pool.includes(password)) {
    notes.push(`口令"${password}"不在候选词池，改由客户端补位`);
    password = pool[0];
  }
  if (!picked.some((x) => x.options[x.answer] === password)) {
    const ds = pool.filter((w) => w !== password).slice(0, 3);
    if (ds.length === 3) {
      const ai = password.charCodeAt(0) % 4;
      const options = ds.slice();
      options.splice(ai, 0, password);
      picked[2] = {
        q: '今晚的口令是哪一个？说错了，哨位上就进不来。',
        options, answer: ai,
        explain: `口令就是今晚的暗号：${password}。`,
      };
      notes.push(`模型三道题里没有问口令，末题改由客户端补上（答案 ${password}）`);
    }
  }
  return { quiz: { password, questions: picked }, notes };
}

/** 从备题库里随机抽三道（**用传入的随机源**，测试里可复现） */
export function pickFallback(rnd, pool) {
  const idx = [...FALLBACK_BANK.keys()];
  for (let i = idx.length - 1; i > 0; i--) {          // Fisher–Yates
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const questions = idx.slice(0, 3).map((k) => ({ ...FALLBACK_BANK[k], options: FALLBACK_BANK[k].options.slice() }));
  const password = pool[Math.floor(rnd() * pool.length)];
  // 备题库也要保证"有一道是问口令的"
  const ds = pool.filter((w) => w !== password).slice(0, 3);
  if (ds.length === 3) {
    const ai = password.charCodeAt(0) % 4;
    const options = ds.slice();
    options.splice(ai, 0, password);
    questions[2] = { q: '今晚的口令是哪一个？说错了，哨位上就进不来。', options, answer: ai, explain: `口令就是今晚的暗号：${password}。` };
  }
  return { password, questions };
}

/** 答对几道 → 分数。3 道全对封顶 0.98（和《一灯油》同一条约定：不给满分）。 */
export function gradeQuiz(correct, total = 3) {
  const score = clamp(total ? correct / total : 0, 0, 0.98);
  const outcome = correct >= 3 ? 'all' : correct === 2 ? 'two' : correct === 1 ? 'one' : 'none';
  return { score, outcome };
}

/* ── 画面零件 ── */
function lampSvg() {
  return `<svg viewBox="0 0 56 70" width="100%" height="100%">
    <path d="M20 9 h16 M28 9 v7" stroke="#6d6a60" stroke-width="2" fill="none"/>
    <path d="M13 21 q15 -12 30 0 z" fill="#4c4a44"/>
    <rect x="13" y="20" width="30" height="5" rx="2" fill="#6d6a60"/>
    <path d="M16 25 h24 l-3 30 h-18 z" fill="#3c3f42"/>
    <path d="M18.4 27.5 h19.2 l-2.4 25 h-14.4 z" fill="#f6d489" opacity=".92"/>
    <ellipse cx="28" cy="40" rx="6" ry="9" fill="#fff3cc"/>
    <rect x="13" y="55" width="30" height="7" rx="2.5" fill="#6d6a60"/>
    <path d="M10 62 h36" stroke="#6d6a60" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`;
}
/** 蹲着写字的红小鬼：答对直起一点，答错歪一下 */
function kidSvg() {
  return `<svg viewBox="0 0 90 120" width="100%" height="100%">
    <g fill="#070b0e">
      <path d="M28 22 q17 -14 34 0 q5 6 3 13 h-40 q-2 -7 3 -13 z"/>
      <path d="M22 18 q23 -19 46 0 q-23 -8 -46 0 z"/>
      <path d="M30 38 q15 11 30 0 l8 30 h-46 z"/>
      <path d="M34 68 h30 l6 34 h-42 z"/>
      <path d="M56 44 q22 8 30 26 q3 7 -4 9 q-8 1 -11 -6 q-6 -14 -19 -19 z"/>
    </g>
    <g stroke="#8a7a5c" stroke-width="2.4" stroke-linecap="round">
      <path d="M46 78 l-16 34"/>
    </g>
  </svg>`;
}

/* ══════════════════════════════════════════════════════════════════
   主入口
   ══════════════════════════════════════════════════════════════════ */

/**
 * @param {HTMLElement} container 玩法区
 * @param {{stats?:HTMLElement, id?:string, place?:'草地'|'遵义', pool?:string[],
 *          quiz?:object, secPerQ?:number, log?:string[], state?:object, seed?:number,
 *          noReview?:boolean, onQuiz?:(info:object)=>void}} [opts]
 */
export function runNightSchoolQuiz(container, opts = {}) {
  ensureStyle();
  const place = PLACE_NAME[opts.place] ? opts.place : '草地';
  const pool = Array.isArray(opts.pool) && opts.pool.length ? opts.pool : POOLS[place];
  const SEC = Number.isFinite(opts.secPerQ) && opts.secPerQ > 0 ? opts.secPerQ : 14;

  return new Promise((resolve) => {
    let alive = true;
    let raf = 0, guard = 0, revealTimer = 0;
    let phase = 'loading';
    let qi = 0;                      // 第几题
    let correct = 0;
    let q0 = 0;                      // 本题起点（performance.now）
    let picked = -1;
    let timedOut = false;
    let result = null;
    const answers = [];

    const rnd = mulberry32(0x7c1e02 + (opts.seed || 0));

    /* ── 骨架 ── */
    container.innerHTML = '';
    container.dataset.mini = opts.id || 'nightschool-quiz';
    const wrap = el('div', 'smini4-wrap');
    const stage = el('div', 'smini4-stage');

    const night = el('div', 'smini4-night');
    for (let i = 0; i < 42; i++) {
      const st = el('div', 'smini4-star');
      st.style.left = (rnd() * 100).toFixed(2) + '%';
      st.style.top = (rnd() * 38).toFixed(2) + '%';
      st.style.opacity = (0.22 + rnd() * 0.6).toFixed(2);
      night.appendChild(st);
    }
    const top = el('div', 'smini4-top');
    const hill = el('div', 'smini4-hill');
    const ground = el('div', 'smini4-ground');
    top.append(night, hill, ground);
    const sand = el('div', 'smini4-sand');
    const qtag = el('p', 'smini4-qtag', '');
    const qtext = el('p', 'smini4-qtext', '');
    top.append(sand, qtag, qtext);

    const optsBox = el('div', 'smini4-opts');
    const foot = el('div', 'smini4-foot');
    const line = el('div', 'smini4-line');
    const wick = el('div', 'smini4-wick');
    const wickI = el('i');
    wick.appendChild(wickI);
    const meta = el('span', 'smini4-meta', '');
    line.append(el('span', 'smini4-meta', '香头'), wick, meta);
    const read = el('p', 'smini4-read', '');
    foot.append(line, read);
    stage.append(top, optsBox, foot);

    const hud = el('div', 'smini4-hud');
    const hudBar = el('div', 'smini4-wick');
    const hudFill = el('i');
    hudBar.appendChild(hudFill);
    hud.append(el('span', 'smini4-meta', '识字'), hudBar);
    const statusEl = el('p', 'smini4-status');
    const hintEl = el('p', 'smini4-hint');
    const actions = el('div', 'smini4-actions');
    wrap.append(stage, hud, statusEl, hintEl, actions);
    container.appendChild(wrap);

    const kid = el('div', 'smini4-kid');
    kid.innerHTML = kidSvg();
    const lamp = el('div', 'smini4-lamp');
    lamp.innerHTML = lampSvg();
    top.append(lamp, kid);

    const optEls = [];
    for (let i = 0; i < 4; i++) {
      const b = el('button', 'smini4-opt');
      b.type = 'button';
      b.dataset.miniAction = 'answer';
      b.dataset.miniIndex = String(i);
      const k = el('span', 'k', LETTERS[i]);
      const t = el('span', 't', '');
      b.append(k, t);
      b.onclick = () => pick(i);
      optsBox.appendChild(b);
      optEls.push({ b, t });
    }

    let quiz = null;
    let questions = [];

    function setState(s) {
      phase = s;
      try { container.dataset.miniState = s; } catch { /* 拆了就算了 */ }
    }
    function syncData() {
      try {
        const left = phase === 'ask' ? Math.max(0, SEC - (performance.now() - q0) / 1000) : 0;
        container.dataset.miniQ = String(qi);
        container.dataset.miniLeft = left.toFixed(1);
        container.dataset.miniScore = String(correct);
        container.dataset.miniAnswer = questions[qi] ? String(questions[qi].answer) : '-1';
        container.dataset.miniPicked = String(picked);
      } catch { /* 同上 */ }
    }

    /* ── 出题 / 作答 ── */
    function renderQuestion() {
      const q = questions[qi];
      if (!q) return;
      picked = -1;
      timedOut = false;
      qtag.textContent = `第 ${qi + 1} / ${questions.length} 问`;
      qtext.textContent = q.q;
      optEls.forEach((o, i) => {
        o.t.textContent = q.options[i] || '';
        o.b.disabled = false;
        o.b.classList.remove('right', 'wrong', 'dim');
      });
      kid.classList.remove('yes', 'no');
      read.innerHTML = '<span class="dim">一次机会，想好了再点。</span>';
      meta.textContent = `答对 ${correct}`;
      q0 = performance.now();
      setState('ask');
      // 立刻同步一次观测量：不然 dataset 会比界面慢一帧，
      // 自动化"读 miniAnswer → 点对应选项"就会读到**上一题**的答案（自己踩过）。
      syncData();
    }

    function pick(i) {
      if (phase !== 'ask') return;
      const q = questions[qi];
      picked = i;
      const ok = i === q.answer;
      if (ok) { correct += 1; sfx('correct'); } else sfx('wrong');
      reveal(q, i, false);
    }

    function timeUp() {
      if (phase !== 'ask') return;
      const q = questions[qi];
      timedOut = true;
      picked = -1;
      sfx('wrong');
      reveal(q, -1, true);
    }

    function reveal(q, i, late) {
      setState('reveal');
      const ok = i === q.answer;
      optEls.forEach((o, k) => {
        o.b.disabled = true;
        if (k === q.answer) o.b.classList.add('right');
        else if (k === i) o.b.classList.add('wrong');
        else o.b.classList.add('dim');
      });
      kid.classList.add(ok ? 'yes' : 'no');
      answers.push({
        q: q.q, picked: i, pickedText: i >= 0 ? q.options[i] : '',
        answer: q.answer, answerText: q.options[q.answer], ok, timeout: !!late,
      });
      const head = ok ? '<span class="good">对了。</span>' : late ? '<span class="bad">香头烧完了。</span>'
        : '<span class="bad">错了。</span>';
      read.innerHTML = head + `正确答案是 ${LETTERS[q.answer]}．${esc(q.options[q.answer])}`
        + (q.explain ? `　${esc(q.explain)}` : '');
      meta.textContent = `答对 ${correct}`;
      syncData();                     // miniPicked 也要立刻反映"这一题选了什么"
      clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        if (!alive) return;
        qi += 1;
        if (qi >= questions.length) finish('finished');
        else renderQuestion();
      }, ok ? 1150 : 1900);        // 答错了多看一会儿，看清错在哪儿
    }

    /* ── 主循环：只用来跑香头与同步 dataset ── */
    function loop() {
      if (!alive) return;
      if (!container.isConnected) { teardown(); return; }
      if (phase === 'ask') {
        const left = SEC - (performance.now() - q0) / 1000;
        const pct = clamp(left / SEC, 0, 1);
        wickI.style.width = (pct * 100).toFixed(1) + '%';
        wick.classList.toggle('low', pct < 0.34);
        hudFill.style.width = (correct / questions.length * 100).toFixed(0) + '%';
        if (left <= 0) timeUp();
      }
      syncData();
      raf = requestAnimationFrame(loop);
    }

    /* ── 结算 ── */
    function finish(why) {
      if (phase === 'done' || phase === 'review') return;
      clearTimeout(revealTimer);
      setState('review');
      const g = gradeQuiz(correct, questions.length);
      const pwQ = answers.find((a) => a.answerText === quiz.password);
      const pwOk = !!pwQ && pwQ.ok;
      const detail = {
        dir: 'quiz',
        why,
        place,
        correct,
        total: questions.length,
        answers,
        password: pwOk ? quiz.password : '',
        passwordRemembered: !!pwQ,
        passwordOk: pwOk,
        outcome: g.outcome,
        fromModel: !!quiz._model,
      };
      stats(undefined, []);
      statusEl.innerHTML = `夜校结束：答对 <b>${correct}/${questions.length}</b>。`;
      hintEl.innerHTML = answers.map((a, i) =>
        `${i + 1}${a.ok ? '<span class="good">✓</span>' : '<span class="warn">✗</span>'}`).join('　')
        + `　·　口令 ${pwOk ? '记住了' : '没记住'}`;
      result = { score: g.score, detail, summary: '' };
      if (opts.noReview) { doneOut(); return; }
      reviewAndResolve(detail);
    }

    async function reviewAndResolve(detail) {
      statusEl.textContent = '教员把沙地抹平，蹲着想了一会儿……';
      let out = null;
      try {
        out = await DECIDE({
          scene: `夜校识字 · ${place}`,
          callType: 'minigame_review',
          situation: `沙地三问：答对 ${detail.correct}/${detail.total}；`
            + detail.answers.map((a, i) => `第${i + 1}题${a.timeout ? '没答上来' : a.ok ? '答对' : `错选"${a.pickedText}"`}`).join('；'),
          state: opts.state || {},
          operation: { type: 'school_quiz', ...detail },
        });
      } catch (err) {
        out = { _error: true, message: String(err?.message || err) };
      }
      if (!alive) { doneOut(); return; }
      if (out && !out._error) {
        result.summary = String(out.narrative || '');
        result.detail.effects = out.effects || {};
        result.detail.choice = out.choice || '';
        result.detail.reason = out.reason || '';
        statusEl.innerHTML = esc(result.summary || '教员抹平了沙地。');
      } else {
        statusEl.innerHTML = `<span class="warn">结算调用失败：${esc(String(out?.message || '未知')).slice(0, 60)}</span>`;
        result.detail.reviewError = true;
      }
      doneOut();
    }

    function doneOut() {
      try { container.dataset.miniOutcome = result.detail.outcome; } catch { /* 已拆 */ }
      setState('done');
      try { opts.onQuiz?.({ quiz, detail: result.detail }); } catch { /* 回调炸了不影响 resolve */ }
      teardown();
      resolve(result);
    }

    function esc(s) {
      return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function teardown() {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(revealTimer);
      clearInterval(guard);
    }

    /* ── 开局：先请模型出题 ── */
    async function askQuiz() {
      const ctx = [`今晚在${place}宿营。`,
        opts.log?.length ? `今天做过的事：${opts.log.join('；')}。` : ''].filter(Boolean).join('');
      for (let attempt = 0; attempt < 2; attempt++) {
        let raw = null;
        try {
          raw = await DECIDE({
            scene: `夜校识字 · ${place}`,
            callType: 'school_quiz',
            situation: '出今晚夜校的三道识字题（4 选 1），并定今晚的口令',
            state: opts.state || {},
            extraContext: `${ctx}\n【今晚可选的词】${pool.join('、')}\n`
              + '口令只能从上面的词里取。三道题的正确答案位置要打散，别都放 A。',
            operation: { type: 'school_quiz', attempt: attempt + 1 },
          });
        } catch (err) {
          return { quiz: null, note: `模型调用失败：${String(err?.message || err).slice(0, 50)}` };
        }
        if (raw && !raw._error) {
          const { quiz: Q, notes } = gateQuiz(raw, pool);
          if (Q) return { quiz: { ...Q, _model: true }, note: '' };
          if (attempt === 1) return { quiz: null, note: `模型给的题没过闸：${notes.slice(0, 2).join('；')}` };
        } else if (attempt === 1) {
          return { quiz: null, note: `模型调用失败：${String(raw?.message || '未知').slice(0, 50)}` };
        }
        if (!alive) return { quiz: null, note: '' };
      }
      return { quiz: null, note: '' };
    }

    async function boot() {
      setState('loading');
      statusEl.textContent = '教员拿起树枝，在沙地上划拉……';
      hintEl.textContent = '（在等模型根据今天的经历出三道题）';
      qtag.textContent = '静一静';
      qtext.textContent = '⋯⋯';
      syncData();

      let Q = opts.quiz || null;
      let note = '';
      if (!Q) {
        const asked = await askQuiz();
        Q = asked.quiz; note = asked.note;
      }
      if (!alive) return;
      if (!Q) {
        Q = { ...pickFallback(rnd, pool), _fallback: true };
        note = note || '模型没给出能用的题，教员从备题库里抽了三道。';
      }
      quiz = Q;
      questions = Q.questions.slice(0, 3);
      hintEl.innerHTML = note
        ? `<span class="warn">${note}</span>`
        : '教员出题，你答。一题一次机会 —— <b>答错的那一项，今晚就会当成对的记住</b>。';
      statusEl.textContent = `今晚的口令是「${Q.password}」，三道题里有一个会问到它。`;
      qi = 0; correct = 0;
      renderQuestion();
      if (!raf) raf = requestAnimationFrame(loop);
    }

    boot();

    /* 兜底：容器被拆掉时别把 Promise 永远挂着 */
    guard = setInterval(() => {
      if (!alive || !container.isConnected) {
        clearInterval(guard);
        if (alive) {
          teardown();
          resolve(result || { score: 0, detail: { dir: 'quiz', why: 'detached', outcome: 'none' }, summary: '' });
        }
      }
    }, 500);
  });
}

export const SCHOOL_QUIZ_MINIGAMES = [
  {
    id: 'nightschool-quiz',
    title: '夜校识字 · 知识竞答（AI 出题）',
    family: '判读',
    run: (host, opts = {}) => runNightSchoolQuiz(host, opts),
    states: ['loading', 'ask', 'reveal', 'review', 'done'],
    actions: ['answer'],
    act: 'act2 · 遵义 / act4 · 草地',
    note: '三道题由模型当场出（每次不同）+ 14 秒香头；答错的会被当成对的记下去',
  },
];
