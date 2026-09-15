/**
 * ai 模块 · **调用策略表（registry）** —— 想改一类调用的行为，只改这张表。
 *
 * 每一项按 `callType` 给：显示名、token 预算、采样温度、要不要预取、走哪个端点。
 * 别的都不用动——`run.js` 是唯一的调用实现，`index.js` 负责编排与广播。
 *
 * 为什么要有"每类预算"：服务器上原来一律 `max_tokens: 2000`（沙盘 2400）。可 `quiz_judge`
 * 这类只回一个短结论的调用，给它 2000 的额度意味着模型有空间把话写长（实测过被推理占满导致空 JSON）。
 * 按类收窄既是省额度，也是让"短结论"这类调用更稳。数值取自各类输出的实测字数，留了余量。
 *
 * 改这里的规矩：
 *   1. 只加**策略**，别加逻辑（逻辑在 run.js，别把两件事混在一张表里）；
 *   2. 新增 callType 时，`server/schema.js` 的 REQUIRED 表必须同步加一类（字段契约的唯一真源），
 *      否则服务器会在落库前把响应判成"缺必需字段"；
 *   3. `prefetch: true` 表示"允许提前取、命中就用"——**默认全关**：预取会多花调用，
 *      要有实测收益（省下的是等待时间）再一个个打开。机制见 index.js 的 `prefetch()`。
 */

/** 没在表里的 callType 用这份兜底（宁可保守，不要静默按 0 处理） */
export const DEFAULT_POLICY = {
  label: '调用',
  maxTokens: 2000,
  temperature: 0.75,
  prefetch: false,
  endpoint: '/api/decide',
};

export const CALL_POLICY = {
  scene_gen: { label: '场景氛围', maxTokens: 1400, temperature: 0.85 },
  choice_hint: { label: '选项预告', maxTokens: 900, temperature: 0.7, prefetch: true },
  npc_chat: { label: '人物交谈', maxTokens: 900, temperature: 0.8 },
  share_judge: { label: '分粮裁决', maxTokens: 900, temperature: 0.7 },
  minigame_review: { label: '玩法复盘', maxTokens: 900, temperature: 0.75 },
  branch_judge: { label: '抉择裁决', maxTokens: 1200, temperature: 0.75 },
  quiz_generate: { label: '出题', maxTokens: 900, temperature: 0.9 },
  quiz_answer_ai: { label: 'AI 作答', maxTokens: 400, temperature: 0.6 },
  quiz_judge: { label: '判分', maxTokens: 700, temperature: 0.5 },
  night_options: { label: '夜间选项', maxTokens: 900, temperature: 0.85 },
  night_resolve: { label: '夜间结算', maxTokens: 1200, temperature: 0.75 },
  act_review: { label: '幕间总评', maxTokens: 1200, temperature: 0.75 },
  ending_review: { label: '终局总评', maxTokens: 1600, temperature: 0.8 },
  failure_review: { label: '失败结算', maxTokens: 1200, temperature: 0.75 },
  study_report: { label: '研学报告', maxTokens: 1500, temperature: 0.6 },
  // 沙盘走自己的端点（body 形状不同），但同样进这张表：预算与显示名一致对待
  sim_turn: { label: '沙盘推演', maxTokens: 2400, temperature: 0.8, endpoint: '/api/sim' },
};

/** 取某类调用的策略（表里没有就用兜底） */
export function policyOf(callType) {
  return { ...DEFAULT_POLICY, ...(CALL_POLICY[callType] || {}) };
}

/** 表里登记了哪些类（体检脚本用它和 server/schema.js 的 16 类对账） */
export function knownCallTypes() {
  return Object.keys(CALL_POLICY);
}
