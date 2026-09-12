const KEY = 'czjc_demo_state_v1';

export function createState() {
  return {
    day: 1,
    ap: 2,
    maxAp: 2,
    体力: 72,
    粮食: 5,
    士气: 62,
    信念: 70,
    民心: 48,
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
    phase: 'title',
  };
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
