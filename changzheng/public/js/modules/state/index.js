/**
 * state 模块 —— **游戏状态的唯一持有者**（业务模块里唯一能改状态的地方）。
 *
 * 它修的是这一坨老问题（见 `docs/BUS.md` §一）：
 *   · 状态对象 `S` 是 `main.js` 的私有变量，20+ 处**直接写字段**（`S.ap -= 1`、`S.quiz.human += 1`…），
 *     绕过 `state.js` 里的纯函数；哪些字段被谁改过，读代码才知道。
 *   · HUD 靠"调用顺序"维持正确：`applyEffects()` 之后**必须**紧跟 `renderStats()`，十几处手工配对。
 *   · 存档要调用方记得 `saveState(S)`（漏一处就是"刷新后回退"）。
 *
 * 现在：
 *   · 写状态只有一条路 —— `api.apply(label, mutator, keys)` 或语义动作（它们内部都用 state.js 的纯函数）；
 *     写完自动做三件事：**作废快照 → 广播 `state:change` → 存档**。
 *   · 别的模块要读数据用 `kernel.snapshot.get()`（只读冻结副本）；渲染器要读嵌套字段可用 `api.raw()`（约定只读）。
 *   · HUD 不再被手工调用，而是订阅 `state:change` 自己重渲染（见 `modules/hud`）。
 *
 * `state.js` 保留原样作为**纯函数层**（可单测、无副作用）；本模块是它的持有者与广播者。
 */
import {
  createState, applyEffects, applyStarvation, checkFailure, addLoss, resolveLoss,
  unlockFact, markLineDone, linesDoneCount, canNight, loadState, saveState,
} from '../../state.js';

let S = null;            // 唯一的持有者（模块级变量，不挂描述符）
let kernelRef = null;

/** 存档（写状态后自动调；sessionStorage 写入很小，不必节流） */
function persist() {
  try { saveState(S); } catch { /* 存档失败不影响玩法 */ }
}

/** 写入口：跑 mutator → 作废快照 → 广播 → 存档 */
function apply(label, mutator, keys = []) {
  if (!S) return undefined;
  const out = mutator ? mutator(S) : undefined;
  kernelRef?.snapshot.invalidate();
  kernelRef?.emit('state:change', { keys, label });
  persist();
  return out;
}

export default {
  name: 'state',
  note: '游戏状态唯一持有者：写走动作并广播 state:change，读走只读快照',
  subscriptions: {},          // 它不需要听别人的事；别人听它的 state:change

  api: {
    /**
     * 只读原始对象。**模块外部优先用 `kernel.snapshot.get()`**；
     * 这个出口留给"要读嵌套字段的渲染器"与诊断（约定：只读，别写）。
     */
    raw() { return S; },

    /** 新开一局；返回状态对象（调用方可存一份只读别名） */
    start(mode = 'study') {
      S = createState();
      S.mode = mode;
      S.actIndex = 0;
      S.actLog = [];
      kernelRef?.snapshot.invalidate();
      kernelRef?.emit('state:change', { keys: ['*'], label: '开局' });
      persist();
      return S;
    },

    /** 把存档读进内存（offerResume 用）；没有存档返回 null */
    load() { return loadState(); },

    /** 从存档恢复（返回恢复后的状态对象） */
    resume(saved) {
      S = { ...createState(), ...saved };
      kernelRef?.snapshot.invalidate();
      kernelRef?.emit('state:change', { keys: ['*'], label: '续局' });
      persist();
      return S;
    },

    /** **唯一写入口**：一次可能改多个字段，keys 是"这次动了哪些"（HUD 据此决定重渲染什么） */
    apply,

    // ── 语义动作：调用方不用认识字段名，也别自己碰字段 ──
    /** 模型给的资源变化（内部走 state.js 的钳制表）；返回人类可读的变化清单 */
    applyEffects(effects, label = '资源变化') {
      let changes = [];
      apply(label, (s) => { changes = applyEffects(s, effects); }, Object.keys(effects || {}));
      return changes;
    },

    /** 花行动点 */
    spendAp(n = 1, why = '') {
      apply(why || '花行动点', (s) => { s.ap = Math.max(0, s.ap - n); s.行动日志.push(why); }, ['ap', '行动日志']);
    },

    /** 进入营地日：重置当日计数并设置天数与行动点 */
    enterDay({ day, ap, maxAp }) {
      apply('进入营地日', (s) => {
        s.day = day; s.ap = ap; s.maxAp = maxAp;
        s.restCount = 0; s.phase = 'camp'; s.行动日志 = [];
      }, ['day', 'ap', 'maxAp', 'restCount', 'phase', '行动日志']);
    },

    /** 休息次数 +1（体力恢复递减用） */
    bumpRest() {
      apply('休息', (s) => { s.restCount = (s.restCount || 0) + 1; }, ['restCount']);
    },

    /** 写一个字段（简单场景用；复杂场景请加语义动作，别让调用方拼字段名） */
    set(key, value, label = '') {
      apply(label || `写 ${key}`, (s) => { s[key] = value; }, [key]);
    },

    /** 批量写（键值都在一处看得见） */
    patch(obj, label = '') {
      apply(label || '批量写', (s) => { Object.assign(s, obj); }, Object.keys(obj || {}));
    },

    /** 篝火/夜间/结局这类"记录型"字段：直接 set 更清楚，这里给个语义名字 */
    remember(key, value) { this.set(key, value, `记住 ${key}`); },

    // ── 日志 ──
    pushLog(kind, text) {
      apply('行动日志', (s) => { s.actLog.push({ act: s.actIndex ?? 0, kind, text }); }, ['actLog']);
    },
    pushChoice(entry) {
      apply('抉择记录', (s) => { s.choiceLog.push({ act: entry.act || '', label: entry.label || '', mood: entry.mood || '' }); }, ['choiceLog']);
    },
    pushCampLog(tag, text) {
      apply('营地手记', (s) => { s.campLog.unshift({ tag, text }); }, ['campLog']);
    },
    clearCampLog() { apply('清空手记', (s) => { s.campLog = []; }, ['campLog']); },

    // ── 幂等标记 ──
    markDone(actId, key) {
      apply('标记已完成', (s) => {
        if (!s.doneKeys) s.doneKeys = {};
        s.doneKeys[`${actId}:${key}`] = true;
      }, ['doneKeys']);
    },
    isDone(actId, key) { return !!(S?.doneKeys && S.doneKeys[`${actId}:${key}`]); },

    markLine(key) {
      let added = false;
      apply('点亮附身线', (s) => { added = markLineDone(s, key); }, ['linesDone']);
      return added;
    },
    linesDone() { return linesDoneCount(S); },
    canNight(need = 3) { return canNight(S, need); },

    unlockFact(id) {
      let added = false;
      apply('解锁史实', (s) => { added = unlockFact(s, id); }, ['unlockedFacts']);
      return added;
    },

    // ── 胜负与减员 ──
    failure() { return checkFailure(S); },
    starvation() {
      let drain = 0;
      apply('断粮', (s) => { drain = applyStarvation(s); }, ['体力']);
      return drain;
    },
    addLoss(who, reason) {
      let added = false;
      apply('减员', (s) => { added = addLoss(s, who, reason); }, ['losses']);
      return added;
    },
    lossFor(choiceSet, choiceIndex) { return resolveLoss(choiceSet, choiceIndex, S); },

    // ── 对决计分（原来是 S.quiz.human += 1 这种直改）──
    quizScore({ human = 0, ai = 0 } = {}) {
      apply('对决计分', (s) => { s.quiz.human += human; s.quiz.ai += ai; }, ['quiz']);
      return S.quiz;
    },

    /** AI 调用计数（原来是 ui.bumpAiCount 顺手改了 state） */
    bumpAiCount() {
      apply('AI 计数', (s) => { s.aiCount = (s.aiCount || 0) + 1; }, ['aiCount']);
      return S.aiCount;
    },
  },

  init(kernel) {
    kernelRef = kernel;
  },

  ready(kernel) {
    // 只读快照的唯一提供者（其它模块一律从 kernel.snapshot.get() 读）
    kernel.snapshot.provide(() => S || {});
  },
};
