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
 *   3. `prefetch` 字段**尚未实现**（modules/ai 没有 prefetch()）。保留表结构便于以后接；
 *      别把它当成「已经会预取」——当前所有真调都在玩家触发时同步 await。
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
  scene_gen: { label: '场景氛围', maxTokens: 900, temperature: 0.85 },
  choice_hint: { label: '选项预告', maxTokens: 900, temperature: 0.7, prefetch: true },
  npc_chat: { label: '人物交谈', maxTokens: 900, temperature: 0.8 },
  share_judge: { label: '分粮裁决', maxTokens: 900, temperature: 0.7 },
  minigame_review: { label: '玩法复盘', maxTokens: 900, temperature: 0.75 },
  // 同事玩法的四类小调用：回复都很短（一句氛围 / 一手棋 / 一课三个字 / 三道题），
  // 且玩法那边自带 10 秒窗口——预算给紧一点，慢了就让它走固定内容（见 HANDOFF-CANDY 的口径）
  candy_scene: { label: '分糖·开场氛围', maxTokens: 260, temperature: 0.85 },
  // 译电（简单档）：后台预取一封新题面，玩家看不到这次调用。答案很短（两句各 8 字），
  // 但过闸要求严（极性/分歧位/黑名单），所以温度给高一点多试几种写法，预算不用大。
  cipher_draft: { label: '译电·换一封信', maxTokens: 400, temperature: 0.9 },
  // 打水漂·娃那一手：答案就一个序号 + 一句嘴硬话，预算给紧；温度中等（别把候选挑乱）
  skim_throw: { label: '打水漂·娃这一手', maxTokens: 300, temperature: 0.7 },
  // 对歌·歌师接话：一句口语反应，要热闹就多给点温度
  antiphony_reply: { label: '对歌·歌师接话', maxTokens: 300, temperature: 0.9 },
  // 编草鞋·老班长看鞋：一句点评，按工序数据说人话
  weave_note: { label: '编草鞋·老班长看鞋', maxTokens: 300, temperature: 0.8 },
  gomoku_move: { label: '五子棋·对手落子', maxTokens: 300, temperature: 0.6 },
  school_lesson: { label: '夜校·定今晚三个字', maxTokens: 700, temperature: 0.7 },
  school_quiz: { label: '夜校·出三道题', maxTokens: 900, temperature: 0.7 },
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
  // 标题页科普入口：详细介绍，预算给足；温度偏低求稳
  march_intro: { label: '了解长征', maxTokens: 2200, temperature: 0.55 },
  // 长征常识实时问答（标题页「了解长征」面板内）
  march_qa: { label: '长征问答', maxTokens: 900, temperature: 0.35 },
};

/** 取某类调用的策略（表里没有就用兜底） */
export function policyOf(callType) {
  return { ...DEFAULT_POLICY, ...(CALL_POLICY[callType] || {}) };
}

/** 表里登记了哪些类（体检脚本用它和 server/schema.js 的 16 类对账） */
export function knownCallTypes() {
  return Object.keys(CALL_POLICY);
}
