/**
 * 《夜校 · 两条路》（**选择入口 · 单独开发，未接入主线**）
 *
 * ── 它解决的是什么 ──
 *   同一个点（夜校）上想保留两种学法的可能：
 *     · 《一灯油》——一盏灯、三个字、22 秒油。考的是"**怎么分光**"：
 *       三个字都想要，油只够认真教两个，被迫砍掉一个。
 *     · 《知识竞答》——沙地三道题、一题 14 秒、一次机会。考的是"**限时里认不认得出来**"。
 *   不让它们互相取代，而是**让玩家自己选**：这个选择本身就是这个点上的第一次决策。
 *
 * ── 为什么入口也做成一个独立玩法（而不是在板屏上并排放两个按钮）──
 *   三条理由，都是项目里踩过的：
 *     ① 两条路都要"先讲清楚自己在考什么"，否则玩家只能瞎点 —— 话得由玩法自己说；
 *     ② 主线接线时，夜校这个热点只能映射到一个 `run`，入口正好是那个落点
 *        （`kind:'school'` → 进选择屏，而不是直接进某个玩法）；
 *     ③ 两条路的产出格式本来就对齐（password / passwordOk / outcome），
 *        入口转发时再补一个 `detail.dir`，下游《夜岗》不用关心玩家走了哪条。
 *
 * ── 契约 ──
 *   1. 签名  runXxx(container, opts) -> Promise<{ score, detail, summary? }>
 *      （拿到的就是被选中那条路的结果，`detail.dir` = 'lamp' | 'quiz'）
 *   2. 容器  container.dataset.mini = 'nightschool-entry' → 选中后被子玩法改写为
 *      'nightschool' / 'nightschool-quiz'；`miniPick` 记着选了哪条
 *   3. 操作  [data-mini-action="pick-lamp" | "pick-quiz"]
 *   4. 自清  交给子玩法（它们自己会收）
 *
 * 玩法 id：`nightschool-entry`
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
import { runNightSchoolOil } from './minigames-school.js';
import { runNightSchoolQuiz } from './minigames-school-quiz.js';

function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function sfxF() { /* 保持与另两支同构的导入面 */ }
void cssVar; void sfxF;

function ensureStyle() {
  if (document.getElementById('school-entry-style')) return;
  const s = document.createElement('style');
  s.id = 'school-entry-style';
  s.textContent = `
.smini5-wrap { display: flex; flex-direction: column; gap: 12px; align-items: center;
  width: 100%; max-width: 764px; padding: 20px 22px 18px; border-radius: 8px;
  background: var(--paper-veil, rgba(196,183,156,.92));
  border: 1px solid var(--rule-strong);
  box-shadow: var(--shadow-float, 0 8px 24px rgba(0,0,0,.3)); }
.smini5-lead { margin: 0; text-align: center; color: var(--ink-0); font-size: 14px; line-height: 1.75;
  font-family: var(--font-kai, var(--font)); }
.smini5-lead b { font-weight: 400; color: var(--seal-deep); }
.smini5-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; max-width: 720px; }
@media (max-width: 640px) { .smini5-cards { grid-template-columns: 1fr; } }
.smini5-card { display: flex; flex-direction: column; gap: 7px; text-align: left; cursor: pointer;
  padding: 13px 15px 14px; border-radius: 6px; border: 1px solid var(--rule-strong);
  background: var(--paper-0, #f6efe0); color: var(--ink-0);
  font-family: var(--font, inherit); transition: transform .12s ease, box-shadow .12s ease; }
.smini5-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-float, 0 6px 18px rgba(0,0,0,.28)); }
.smini5-card .k { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.smini5-card .t { font-family: var(--font-kai, "KaiTi", serif); font-size: 17px; letter-spacing: .04em; }
.smini5-card .n { flex: none; padding: 1px 7px; border-radius: var(--radius-inset, 3px);
  background: var(--ink-bg-2); font-size: 11px; color: var(--gold); letter-spacing: .1em; }
.smini5-card .why { margin: 0; font-size: 12.5px; line-height: 1.65; color: var(--ink-1); }
.smini5-card .cost { margin: 0; padding-left: 8px; border-left: 2px solid var(--seal-veil);
  font-size: 12px; line-height: 1.6; color: var(--seal-deep); }
.smini5-card .go { margin-top: 2px; font-size: 12px; color: var(--ink-1); }
.smini5-foot { margin: 0; text-align: center; font-size: 12.5px; color: var(--ink-1); line-height: 1.65; }
`;
  document.head.appendChild(s);
}

const CARDS = [
  {
    dir: 'lamp', action: 'pick-lamp', id: 'nightschool',
    title: '跟着教员认字 · 一灯油',
    boardTitle: '夜校识字 · 一灯油',
    note: '灯火 · 22 秒',
    why: '一盏马灯、三块木牌（口令 / 地名 / 人名）。光圈落在哪个字上，哪个字才开始教。',
    cost: '三个字都想要，油只够认真教两个 —— 必须亲手砍掉一个。',
    go: '考的是：怎么分光 ▸',
  },
  {
    dir: 'quiz', action: 'pick-quiz', id: 'nightschool-quiz',
    title: '教员出题 · 知识竞答',
    boardTitle: '夜校识字 · 知识竞答（AI 出题）',
    note: '沙地 · 三问',
    why: '教员把今天走过的路出成三道题，写在沙地上。每题四个选项，只有一个对。',
    cost: '一题一次机会、14 秒香头 —— 答错的那一项，今晚就会当成对的记住。',
    go: '考的是：限时里认不认得出来 ▸',
  },
];

/**
 * @param {HTMLElement} container 玩法区
 * @param {{place?:'草地'|'遵义', log?:string[], state?:object, seed?:number,
 *          noReview?:boolean, stats?:HTMLElement, id?:string,
 *          pool?:string[], lesson?:object, quiz?:object, secPerQ?:number}} [opts]
 */
export function runNightSchoolEntry(container, opts = {}) {
  ensureStyle();
  const place = opts.place === '遵义' ? '遵义' : '草地';

  return new Promise((resolve) => {
    let alive = true;
    let picked = '';

    container.innerHTML = '';
    container.dataset.mini = opts.id || 'nightschool-entry';
    container.dataset.miniState = 'choose';

    const wrap = document.createElement('div');
    wrap.className = 'smini5-wrap';
    const lead = document.createElement('p');
    lead.className = 'smini5-lead';
    lead.innerHTML = '教员把本子合上，问你：<b>今晚这块识字，你想怎么学？</b><br/>'
      + '两条路都会教出今晚要用的口令，也都有代价 —— 你自己挑一条。';
    const cards = document.createElement('div');
    cards.className = 'smini5-cards';

    for (const c of CARDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'smini5-card';
      b.dataset.miniAction = c.action;
      const k = document.createElement('div');
      k.className = 'k';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = c.title;
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = c.note;
      k.append(t, n);
      const why = document.createElement('p');
      why.className = 'why';
      why.textContent = c.why;
      const cost = document.createElement('p');
      cost.className = 'cost';
      cost.textContent = c.cost;
      const go = document.createElement('p');
      go.className = 'go';
      go.textContent = c.go;
      b.append(k, why, cost, go);
      b.onclick = () => start(c);
      cards.appendChild(b);
    }

    const foot = document.createElement('p');
    foot.className = 'smini5-foot';
    foot.textContent = '（选定之后这一夜就按那条路走；夜里哨位上要用的口令，两条路都会给你。）';
    wrap.append(lead, cards, foot);
    container.appendChild(wrap);

    async function start(c) {
      if (picked) return;                         // 只认第一次点击
      picked = c.dir;
      container.dataset.miniPick = c.dir;
      container.dataset.miniState = 'running';
      container.innerHTML = '';
      // 板屏题名跟着走：入口叫"两条路"，玩家一挑，板头就该换成那条路的题名。
      // 不换的话（接线后）板头会一直挂着"两条路（选择入口）"，而人在答竞答 —— 一眼假。
      // 调试台与主线用的是同一个 id（#board-title），所以这里直接写就好；取不到就跳过。
      const bt = document.getElementById('board-title');
      if (bt) bt.textContent = c.boardTitle || c.title;
      const run = c.dir === 'quiz' ? runNightSchoolQuiz : runNightSchoolOil;
      const sub = { ...opts, id: c.id, place };
      // 不再透传子玩法的注入项：入口只决定"走哪条路"，题目/课本仍由模型定
      delete sub.lesson; delete sub.quiz; delete sub.secPerQ;
      if (c.dir === 'lamp' && opts.lesson) sub.lesson = opts.lesson;
      if (c.dir === 'quiz' && opts.quiz) sub.quiz = opts.quiz;
      if (c.dir === 'quiz' && opts.secPerQ) sub.secPerQ = opts.secPerQ;
      try {
        const r = await run(container, sub);
        if (!r.detail) r.detail = {};
        r.detail.dir = c.dir;
        r.detail.entryPick = c.dir;
        resolve(r);
      } catch (err) {
        resolve({ score: 0, detail: { dir: c.dir, why: 'error', outcome: 'none', error: String(err?.message || err) }, summary: '' });
      }
    }

    /* 兜底：容器被拆掉 → 结束 */
    const guard = setInterval(() => {
      if (!alive || !container.isConnected) {
        clearInterval(guard);
        if (alive) {
          alive = false;
          if (picked) return;            // 已经在跑子玩法，交给它自己收
          resolve({ score: 0, detail: { dir: '', why: 'detached', outcome: 'none' }, summary: '' });
        }
      }
    }, 500);
  });
}

export const SCHOOL_ENTRY_MINIGAMES = [
  {
    id: 'nightschool-entry',
    title: '夜校 · 两条路（选择入口）',
    family: '判读',
    run: (host, opts = {}) => runNightSchoolEntry(host, opts),
    states: ['choose', 'running', 'done'],
    actions: ['pick-lamp', 'pick-quiz'],
    act: 'act2 · 遵义 / act4 · 草地',
    note: '两条路都保留：一灯油（分光）或知识竞答（AI 限时出题），玩家自己挑',
  },
];
