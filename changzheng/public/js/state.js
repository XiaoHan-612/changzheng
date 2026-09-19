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
    voluntaryLines: [],
    sugarPlan: null,
    sentryScore: 0,
    ludingResult: null,
    nightChoice: '',
    origin: null,          // 开场出身（origin.js 的 ORIGINS.id）
    originQuiz: null,      // 开场问答结果 { picked, right }
    phase: 'title',
    // 注意：没有 busy 字段。"忙不忙"是运行时概念，由内核资源 'flow' 管（见 docs/BUS.md），
    // 早先放在这里会被写进存档、并在两处靠"手工置 false"绕过不可重入锁（批 3 收口）。
    doneKeys: {},
    choiceLog: [],
    actSummaries: [],
    mode: 'study',
    losses: [],
    failure: null,
    // 篝火 talk/share 当日已用次数（v0.3：防无限刷好感）
    fireTalkUsed: 0,
    fireShareUsed: 0,
    // 民心阈值解锁老乡线（DESIGN §4：民心解锁老乡支线）
    villageUnlocked: false,
    // 夜校已经教过的词（跨幕累计）：第四幕草地那场夜校据此换一批字 ——
    // 两场夜校原本都从同一张固定词表里挑，玩起来就是"每次都是那几个字"（用户反馈）。
    // 写入由 flow/games-flow 的 doSchool 收口；候选词表在玩法源码的 POOLS 里。
    schoolUsed: [],
  };
}

/** 民心 ≥ 60 解锁老乡支线（幂等；返回是否本局首次解锁） */
export function checkVillageUnlock(state) {
  if (!state || state.villageUnlocked) return false;
  if ((state.民心 ?? 0) >= 60) {
    state.villageUnlocked = true;
    return true;
  }
  return false;
}

/**
 * 营地临界提示阈值（方案 A）：只做「看得见的代价」，不在此处判失败。
 * 粮≤2 / 体力≤35 / 士气≤15 时 HUD 应给出红字提示。
 */
export const RESOURCE_WARN = {
  粮食: 2,
  体力: 35,
  士气: 15,
};

/** 生成临界提示文案（空字符串 = 一切尚可） */
export function resourceWarnText(state) {
  const bits = [];
  const food = state?.粮食 ?? 99;
  const hp = state?.体力 ?? 99;
  const mor = state?.士气 ?? 99;
  if (food <= 0) bits.push('已断粮：幕间体力会掉');
  else if (food <= RESOURCE_WARN.粮食) bits.push(`粮食告急（${food}）`);
  if (hp <= RESOURCE_WARN.体力) bits.push(`体力临界（${hp}）`);
  if (mor <= RESOURCE_WARN.士气) bits.push(`队伍疲乏（士气 ${mor}）`);
  return bits.join(' · ');
}

/** 按本地状态推一个 ending_id（模型失败时兜底；也作为 prompt 偏好提示） */
export function pickEndingId(state) {
  if (!state) return '同行';
  const faith = state.信念 ?? 50;
  const losses = (state.losses || []).length;
  const night = state.nightChoice || '';
  const hungryOut = (state.粮食 ?? 99) <= 0 && (state.士气 ?? 99) < 25;
  if (losses >= 3 || (state.体力 ?? 50) < 25 || hungryOut) return '未竟';
  if (night.includes('加岗') || night.includes('安全')) return '守望';
  if (faith >= 75 && losses === 0) return '星火';
  return '同行';
}

/** 是否行军类模式（失败/粮荒/幕间消耗都按这套压力走） */
export function isMarchLikeMode(mode) {
  return mode === 'march' || mode === 'march_auto' || mode === 'auto' || mode === 'select';
}

/** 成败判定：行军类模式（行军 / 连贯行军 / 择点穿行）生效；历史 study/quick 存档不失败 */
export function checkFailure(state) {
  const m = state?.mode;
  if (!m || m === 'study' || m === 'quick') return null;
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
 * 减员判定（行军类模式）：作者标注的风险 + 当前资源。
 * 方案 A：高风险在体力&lt;55 或 粮≤1 时丢人；中风险体力≤32；低风险永不。
 */
export function lossRiskOf(cs, choiceIndex) {
  const opt = cs?.options?.[choiceIndex];
  return opt?.risk || 'low';
}

export function resolveLoss(cs, choiceIndex, state) {
  if (!cs?.loss || !state) return null;
  const risk = lossRiskOf(cs, choiceIndex);
  const exhausted = state.体力 < 55 || state.粮食 <= 1;
  if (risk === 'high' && exhausted) return cs.loss;
  if (risk === 'mid' && state.体力 <= 32) return cs.loss;
  return null;
}

/**
 * 幕间口粮消耗（方案 A）：行军类模式每过一幕 −1 粮（0 则不再扣，交给粮荒）。
 * study/quick 历史存档不扣。
 * @returns {number} 实际扣掉的粮食
 */
export function consumeActFood(state) {
  if (!state || !isMarchLikeMode(state.mode)) return 0;
  if ((state.粮食 ?? 0) <= 0) return 0;
  state.粮食 = Math.max(0, state.粮食 - 1);
  return 1;
}

/** 幕间粮荒惩罚：粮食为 0 时体力流失（行军类统一 8，方案 A；study/quick 不扣） */
export function applyStarvation(state) {
  if (!state || (state.粮食 ?? 0) > 0) return 0;
  const m = state.mode;
  if (!m || m === 'study' || m === 'quick') return 0;
  const drain = 8;
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

/**
 * 记一条附身线（幂等）。
 * @param {{voluntary?: boolean}} [opts] voluntary=true 表示营地自愿玩过（计入篝火夜门槛）；
 *   强制链重播不算——否则 act4 强制跑 fishing/candy/sentry 会自动点亮 3 条，门槛形同虚设。
 */
export function markLineDone(state, id, opts = {}) {
  if (!id) return false;
  if (!Array.isArray(state.linesDone)) state.linesDone = [];
  const added = !state.linesDone.includes(id);
  if (added) state.linesDone.push(id);
  if (opts.voluntary) {
    if (!Array.isArray(state.voluntaryLines)) state.voluntaryLines = [];
    if (!state.voluntaryLines.includes(id)) {
      state.voluntaryLines.push(id);
      return true;
    }
  }
  return added;
}

export function linesDoneCount(state) {
  return Array.isArray(state.linesDone) ? state.linesDone.length : 0;
}

export function voluntaryLinesCount(state) {
  return Array.isArray(state.voluntaryLines) ? state.voluntaryLines.length : 0;
}

/** 篝火夜门槛：营地**自愿**点亮 need 条附身线后可进夜间议事（强制链不计） */
export function canNight(state, need = 2) {
  return voluntaryLinesCount(state) >= need;
}
