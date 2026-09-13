const KEY = 'czjc_demo_state_v1';

export function createState() {
  return {
    day: 1,
    ap: 2,
    maxAp: 2,
    体力: 72,
    粮食: 5,
    士气: 62,
    信念: 58,          // 原 70 离上限只剩 30 点，一局必顶格；降到 58 给"抉择推动信念"留出空间
    民心: 48,
    restCount: 0,      // 当日休息次数（体力恢复递减，enterCampDay 重置）
    好感_老班长: 40,
    好感_指导员: 42,
    好感_红小鬼: 38,
    好感_卫生员: 36,
    好感_老乡: 28,
    tonightPassword: '',
    unlockedFacts: [],
    行动日志: [],
    campLog: [],
    aiCount: 0,
    quiz: { human: 0, ai: 0 },
    fishingBest: 0,
    // 附身线：点亮几条，决定篝火夜是否解锁
    linesDone: [],
    sugarPlan: null,
    sentryScore: 0,
    ludingResult: null,
    nightChoice: '',
    origin: null,          // 开场出身（origin.js 的 ORIGINS.id）
    originQuiz: null,      // 开场问答结果 { picked, right }
    phase: 'title',
    busy: false,
    doneKeys: {},
    choiceLog: [],
    actSummaries: [],
    mode: 'study',
    losses: [],
    failure: null,
  };
}

/** 成败判定：仅在行军模式生效 */
export function checkFailure(state) {
  if (state.mode !== 'march') return null;
  if (state.体力 <= 0) {
    return {
      kind: '体力耗尽',
      title: '掉队',
      who: '你',
      why: '你没能跟上队伍，在最后一段路上被落下了。',
    };
  }
  // 断粮且体力见底：不需要等到归零，也算撑不下去
  if (state.粮食 <= 0 && state.体力 <= 30) {
    return {
      kind: '断粮掉队',
      title: '撑不住了',
      who: '你',
      why: '连续断粮，你的体力先垮了下来。队伍分给你最后一把炒面，然后继续往前走。',
    };
  }
  return null;
}

/** 每幕每天的行动点上限：act.apPerDay 可配，缺省 2 */
export function apPerDay(act) {
  const n = Number(act?.apPerDay);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 2;
}

/** 第 day 天用哪张全景与哪些热点：支持 act.dayScenes，缺省用 act 自己的 */
export function dayScene(act, day) {
  const list = act?.dayScenes;
  if (Array.isArray(list) && list.length) {
    const i = Math.min(Math.max(day, 1), list.length) - 1;
    return {
      pano: list[i].pano || act.pano,
      alt: list[i].alt || '',      // 有就用 alt（生图模型落盘即生效），没有再用 pano
      label: list[i].label || '',
      hotspots: list[i].hotspots || act.hotspots,
    };
  }
  return { pano: act?.pano, alt: '', label: '', hotspots: act?.hotspots || [] };
}

export function addLoss(state, who, reason) {
  if (!state.losses) state.losses = [];
  if (state.losses.some((l) => l.who === who)) return false;
  state.losses.push({ who, reason, act: state.actIndex ?? 0 });
  return true;
}

/**
 * 减员判定（行军模式）：由**作者标注的风险 + 玩家当前资源**共同决定，不再看模型心情。
 *
 * 为什么改：原先只看 `choice_hint` 返回的 risk 是否 高/中 —— 模型不给风险就不减员，
 * 实测行军模式三局零减员，"抉择可能真的带不走一些人"这句话就落空了。
 * 现在的规则让"代价"与资源管理挂钩：
 *   高风险（正面强攻、抢渡、丢下他）：体力 <60 或 粮食 ≤1 就会失去一个人
 *   中风险（稳妥但慢、分担）：体力 ≤35 才会失去
 *   低风险：不减员
 * 每个抉择的 `loss.who` 各不相同，且同一人在一局里只减一次（addLoss 幂等）。
 */
export function lossRiskOf(cs, choiceIndex) {
  const opt = cs?.options?.[choiceIndex];
  return opt?.risk || 'low';
}

export function resolveLoss(cs, choiceIndex, state) {
  if (!cs?.loss || !state) return null;
  const risk = lossRiskOf(cs, choiceIndex);
  const exhausted = state.体力 < 60 || state.粮食 <= 1;
  if (risk === 'high' && exhausted) return cs.loss;
  if (risk === 'mid' && state.体力 <= 35) return cs.loss;
  return null;
}

/** 幕间粮荒惩罚：粮食为 0 时体力流失 */
export function applyStarvation(state) {
  if (state.粮食 > 0) return 0;
  const drain = state.mode === 'march' ? 10 : 6;
  state.体力 = Math.max(0, state.体力 - drain);
  return drain;
}

export function saveState(s) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadState() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function applyEffects(state, effects) {
  if (!effects) return [];
  const changes = [];
  const clamped = {
    体力: [0, 100],
    士气: [0, 100],
    信念: [0, 100],
    民心: [0, 100],
    粮食: [0, 20],
    好感_老班长: [0, 100],
    好感_指导员: [0, 100],
    好感_红小鬼: [0, 100],
    好感_卫生员: [0, 100],
    好感_老乡: [0, 100],
  };
  for (const [k, v] of Object.entries(effects)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (!(k in state)) continue;
    const [lo, hi] = clamped[k] || [0, 100];
    const before = state[k];
    state[k] = Math.max(lo, Math.min(hi, Math.round(before + v)));
    if (state[k] !== before) changes.push(`${k} ${state[k] > before ? '+' : ''}${state[k] - before}`);
  }
  return changes;
}

export function unlockFact(state, factId) {
  if (!factId) return false;
  if (state.unlockedFacts.includes(factId)) return false;
  state.unlockedFacts.push(factId);
  return true;
}

/** 记一条附身线（幂等） */
export function markLineDone(state, id) {
  if (!id) return false;
  if (!Array.isArray(state.linesDone)) state.linesDone = [];
  if (state.linesDone.includes(id)) return false;
  state.linesDone.push(id);
  return true;
}

export function linesDoneCount(state) {
  return Array.isArray(state.linesDone) ? state.linesDone.length : 0;
}

/** 篝火夜门槛：点亮 need 条附身线后可进夜间议事 */
export function canNight(state, need = 3) {
  return linesDoneCount(state) >= need;
}
