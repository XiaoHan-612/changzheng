/** 营地全局状态 + 会话记忆 */
export const camp = {
  体力: 70,
  食物: 2,
  药品: 2,
  士气: 60,
  信念: 75,
  安全: 80,
  伤员情况: '小四川低烧，夜里说胡话',
  tonightPassword: '',
  linesDone: new Set(),
  facts: new Set(),
  aiCalls: 0,
  memory: [],
};

export function resetCamp() {
  camp.体力 = 70;
  camp.食物 = 2;
  camp.药品 = 2;
  camp.士气 = 60;
  camp.信念 = 75;
  camp.安全 = 80;
  camp.伤员情况 = '小四川低烧，夜里说胡话';
  camp.tonightPassword = '';
  camp.linesDone = new Set();
  camp.facts = new Set();
  camp.aiCalls = 0;
  camp.memory = [];
}

export function applyEffects(effects) {
  if (!effects) return;
  const keys = ['体力', '食物', '药品', '士气', '信念', '安全'];
  for (const k of keys) {
    if (typeof effects[k] !== 'number') continue;
    const cap = k === '食物' || k === '药品' ? 20 : 100;
    camp[k] = Math.max(0, Math.min(cap, camp[k] + effects[k]));
  }
}

export function snapshot() {
  return {
    体力: camp.体力,
    食物: camp.食物,
    药品: camp.药品,
    士气: camp.士气,
    信念: camp.信念,
    安全: camp.安全,
    伤员情况: camp.伤员情况,
    tonightPassword: camp.tonightPassword || undefined,
  };
}

export function remember(line) {
  camp.memory.push(line);
  if (camp.memory.length > 30) camp.memory.shift();
}

export function markLineDone(id) {
  camp.linesDone.add(id);
}

export function linesDoneCount() {
  return camp.linesDone.size;
}

export function canNight() {
  return camp.linesDone.size >= 3;
}
