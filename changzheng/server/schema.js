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
};

/** 返回缺失的字段名数组（空数组 = 合规）；未登记的 callType 不做判定 */
export function missingFields(callType, res) {
  const need = REQUIRED[callType];
  if (!need) return [];
  // 数组也是 object，但契约要求的是对象：直接点明"整体不是对象"，
  // 否则报出来的是"缺少 narrative、feasible"，看着像字段名写错，实际是形状不对。
  if (!res || typeof res !== 'object' || Array.isArray(res)) return ['(整体不是对象)'];
  return need.filter((spec) => {
    const keys = spec.split('|');
    return !keys.some((k) => res[k] !== undefined && res[k] !== null);
  });
}

/**
 * 契约戳记：这条记录带回来的响应是否满足必需字段（用同一张表判定）。
 *
 * 为什么要有它：审计要能回答"**当前版本**有没有违约"，而 logs/ 是逐日累积的，
 * 里面混着守卫上线前的旧记录（旧标注 GLM-5.1、旧进程写入的数组响应），分不出来就成了一笔永远挂着的账。
 * 戳记在 logger 里算——落库只有一处，调用点想漏也漏不掉（`server/sim.js` 就漏接过整张表）。
 * 注意它只是**记账**：真正的拦截仍在调用点（不合规就重试，不落 GLM 记录）。
 *
 * @returns {boolean|null} true=合规；false=不合规（该响不该落库）；null=不判定（未登记类型 / 没带回响应）
 */
export function contractStamp(callType, res) {
  if (!REQUIRED[callType]) return null;
  if (res === undefined || res === null) return null;
  return missingFields(callType, res).length === 0;
}
