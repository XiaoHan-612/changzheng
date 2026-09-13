// 数值护栏：模型返回的 effects 一律先在这里归一化，再落库、再交给界面。
//
// 为什么必须在这一层做：实测一局 `体力` 净变化 −152、`信念` +79，而信念初值离上限只有 30 点——
// 提示词原先只写"单项 −20～+20"，一局二三十个节点必然撞到上下限，"选择"于是没有代价。
// 这里做三件事：①单维单次封顶；②单次最多影响 3 个维度；③信念只允许在关键抉择上正向增长。

export const EFFECT_LIMIT = {
  体力: 8, 士气: 8, 信念: 6, 民心: 8, 粮食: 2,
  好感_老班长: 4, 好感_指导员: 4, 好感_红小鬼: 4, 好感_卫生员: 4, 好感_老乡: 4,
};

/** 信念代表"为什么走"的认同，只该由关键抉择与夜间议事推动；小游戏成败不该改它 */
export const FAITH_POSITIVE_ALLOWED = new Set(['branch_judge', 'night_resolve']);

/** 单次最多影响几个维度（避免"一次全给"，让每次选择都有明确指向） */
export const MAX_DIMS = 3;

/**
 * @param {string} callType
 * @param {object} effects 模型原始返回
 * @returns {object} 归一化后的 effects（未登记维度直接丢弃；全 0 则返回 {}）
 */
export function normalizeEffects(callType, effects) {
  if (!effects || typeof effects !== 'object') return {};
  const out = {};
  let used = 0;
  for (const [k, raw] of Object.entries(effects)) {
    const lim = EFFECT_LIMIT[k];
    if (!lim || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    if (used >= MAX_DIMS) break;
    let v = Math.max(-lim, Math.min(lim, Math.round(raw)));
    if (k === '信念' && v > 0 && !FAITH_POSITIVE_ALLOWED.has(callType)) v = 0;
    if (v === 0) continue;
    out[k] = v;
    used += 1;
  }
  return out;
}
