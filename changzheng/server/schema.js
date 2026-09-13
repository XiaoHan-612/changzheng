/**
 * AI 响应契约（唯一定义处）。
 *
 * 两个消费方：
 *  1) server/ai.js —— 每次解析完模型返回就校验，缺必需字段就当次失败并重试，
 *     不再把"看起来是 JSON、实际缺字段"的对象交给界面（曾出现答题返回里
 *     answer_index 键名被模型写坏，界面照样往下跑）。
 *  2) scripts/audit-logs.mjs —— 用同一张表审计历史日志。
 *
 * 约定：值用 | 分隔表示"任一命中即可"，例如 'scene_text|narrative'。
 */
export const REQUIRED = {
  scene_gen: ['title', 'atmosphere'],
  choice_hint: ['hints'],
  npc_chat: ['reply'],
  share_judge: ['effects', 'narrative', 'choice'],
  minigame_review: ['effects', 'narrative'],
  branch_judge: ['effects', 'scene_text|narrative'],
  quiz_generate: ['question', 'options', 'answer_index'],
  quiz_answer_ai: ['answer_index'],
  quiz_judge: ['human_score', 'ai_score'],
  night_options: ['options'],
  night_resolve: ['narrative'],
  ending_review: ['ending_id', 'paragraphs'],
  act_review: ['title', 'lines'],
  failure_review: ['paragraphs'],
  study_report: ['summary'],
  sim_turn: ['narrative', 'feasible'],
};

/** 返回缺失的字段名数组（空数组 = 合规）；未登记的 callType 不做判定 */
export function missingFields(callType, res) {
  const need = REQUIRED[callType];
  if (!need) return [];
  if (!res || typeof res !== 'object') return ['(整体不是对象)'];
  return need.filter((spec) => {
    const keys = spec.split('|');
    return !keys.some((k) => res[k] !== undefined && res[k] !== null);
  });
}
