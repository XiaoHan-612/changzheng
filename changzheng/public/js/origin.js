/**
 * 开场设定：出身三选一 + 一道固定问答。
 *
 * 设计约束（为什么长这样）：
 *  - 只影响起始五维 ±5，不改玩法结构，避免开局就把平衡拆散；
 *  - 问答用**本地题库**，不调模型：开局第一屏不能依赖网络，否则断网时连门都进不去；
 *  - 纯数据 + 纯函数，不碰 DOM，便于单元测试（界面在 main.js 的 runOrigin()）。
 */
import { applyEffects } from './state.js';

/** 三条出身的净收益刻意对称：各 +5 / −2，避免出现"唯一正确答案" */
export const ORIGINS = [
  { id: 'farm', label: '农家子弟', sub: '地里的活干惯了，走得动', effects: { 体力: 5, 信念: -2 } },
  { id: 'apprentice', label: '学徒', sub: '跟着师傅跑过码头，认得人', effects: { 民心: 5, 体力: -2 } },
  { id: 'student', label: '学生', sub: '读过书，知道为什么走', effects: { 信念: 5, 民心: -2 } },
];

/** 出发前的一问：答对加信念，答错不扣（第一屏不给挫败感） */
export const ORIGIN_QUIZ = {
  question: '出发前，于都的百姓把什么拆下来交给了红军？',
  options: ['自家的门板和床板', '祠堂的牌匾', '屋顶的瓦片'],
  answerIndex: 0,
  explain: '1934 年 10 月，于都百姓连夜拆下门板、床板，帮红军在河上架起浮桥。',
  effects: { 信念: 3 },
};

export function findOrigin(id) {
  return ORIGINS.find((o) => o.id === id) || null;
}

/**
 * 应用出身：写入 state.origin 并结算五维。
 * @returns {{origin: object|null, changes: string[]}}
 */
export function applyOrigin(state, originId) {
  const origin = findOrigin(originId);
  if (!origin) return { origin: null, changes: [] };
  state.origin = origin.id;
  return { origin, changes: applyEffects(state, origin.effects) };
}

/**
 * 结算开场问答。
 * @returns {{right: boolean, changes: string[]}}
 */
export function applyOriginQuiz(state, pickedIndex) {
  const right = pickedIndex === ORIGIN_QUIZ.answerIndex;
  state.originQuiz = { picked: pickedIndex, right };
  return { right, changes: right ? applyEffects(state, ORIGIN_QUIZ.effects) : [] };
}
