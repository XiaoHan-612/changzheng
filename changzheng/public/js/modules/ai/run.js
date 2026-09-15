/**
 * ai 模块 · **唯一的调用实现**（run）。
 *
 * 分工（别把这三件事混在一起）：
 *   registry.js  改行为的地方（每类的预算/温度/端点）
 *   run.js       一次调用怎么发出去（这里）——纯函数式的薄壳，不碰总线、不碰 DOM
 *   index.js     编排：广播事件、等玩家的「重试/跳过」、记账
 *
 * 为什么单独一层：`main.js` 里原来那句 `callAI()` 既发请求、又管 UI、又记账、又重试，
 * 四个职责缠在一起，于是 50 个调用点各自还要手工配 `showThinking` 与 `bumpAiCount`。
 * 现在"怎么发"只有这一份，换端点/加超时/改 body 都只改这里。
 */
import { decide } from '../../ai-client.js';

/**
 * 发一次请求（不含重试、不含事件）。端点与 body 形状按 callType 的策略走。
 * 沙盘的 `/api/sim` 与主线的 `/api/decide` body 不一样，所以在这里分派——**调用方不必知道**。
 *
 * @param {object} payload 业务 payload（callType/scene/situation/state/options/…）
 * @param {object} policy 该类的策略（见 registry.js）
 * @returns {Promise<object>} 模型返回的对象；失败抛错
 */
export async function invoke(payload, policy) {
  const { callType, maxTokens, temperature } = { ...payload, ...policy };
  return decide({
    ...payload,
    callType,
    // 预算与温度随 payload 走：服务器按它们收口（见 server/ai.js），日志里也记下来，便于 qa:ai 核对
    maxTokens,
    temperature,
  });
}

/**
 * 一次调用的**记账条目**（答辩面板的调用流 + qa:ai 都吃这个形状）。
 * 形状固定，别在这里塞 UI 字段（渲染在别处：modules/ai 的 render + shell 的思考提示）。
 */
export function feedEntry({ callType, scene, model, ms, result, error }) {
  const r = result || {};
  return {
    callType: callType || 'decide',
    scene: scene || '',
    ms: ms || 0,
    model: model || 'GLM',
    error: error ? String(error).slice(0, 160) : '',
    snippet: (r.narrative || r.reply || r.scene_text || r.title || r.question || r.verdict || '').slice(0, 80),
  };
}
