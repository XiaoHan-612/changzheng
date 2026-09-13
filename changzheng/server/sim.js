import { CONFIG } from './config.js';
import { logAiCall } from './logger.js';
import { missingFields } from './schema.js';

/**
 * 沙盘世界模拟：一次调用同时完成「裁判 + 世界更新 + NPC 反应」
 * 与 /api/decide 分离，避免污染既有 VN 流程。
 */
export async function callSim({ world, action, intent }) {
  const startTime = Date.now();
  const system = buildSimSystem();
  const user = buildSimUser({ world, action, intent });

  if (!CONFIG.GLM_API_KEY) {
    logAiCall({
      scene: `沙盘·${world?.place || '路上'}`,
      callType: 'sim_turn',
      situation: action,
      stateSnapshot: world || {},
      prompt: { system, user },
      durationMs: Date.now() - startTime,
      source: 'ERROR',
      error: '未配置 GLM_API_KEY',
    });
    return { _error: true, message: '未配置 GLM_API_KEY，请到「设置」里填入 Key 与接口地址' };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
      const res = await fetch(CONFIG.GLM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CONFIG.GLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: CONFIG.GLM_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.8,
          ...(CONFIG.GLM_REASONING_EFFORT ? { reasoning_effort: CONFIG.GLM_REASONING_EFFORT } : {}),
          max_tokens: 2400,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('无法解析 JSON');
        parsed = JSON.parse(m[0]);
      }
      if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
        throw new Error('模型返回空 JSON');
      }
      // 字段契约：与 /api/decide 走同一张表（server/schema.js）。
      // 这条原先只在 ai.js 里，沙盘漏了：模型返回 JSON **数组**时 `typeof === 'object'` 能过、
      // 非空数组的键数也大于 0，于是数组被当合规响应落库，界面拿到的是空白叙事
      // （2026-09-13 真调实测到一条 sim_turn 数组响应，日志审计才发现）。
      const missing = missingFields('sim_turn', parsed);
      if (missing.length) {
        throw new Error(`模型返回缺少必需字段：${missing.join('、')}`);
      }
      logAiCall({
        scene: `沙盘·${world?.place || '路上'}`,
        callType: 'sim_turn',
        situation: action,
        stateSnapshot: world || {},
        prompt: { system, user },
        rawResponse: content,
        response: parsed,
        appliedEffects: parsed.effects || {},
        durationMs: Date.now() - startTime,
        source: 'GLM',
        attempt,
      });
      return parsed;
    } catch (err) {
      lastError = err;
      if (attempt < CONFIG.MAX_RETRIES) await new Promise((r) => setTimeout(r, 700 * attempt));
    }
  }

  const message = String(lastError?.message || lastError || 'unknown');
  logAiCall({
    scene: `沙盘·${world?.place || '路上'}`,
    callType: 'sim_turn',
    situation: action,
    stateSnapshot: world || {},
    prompt: { system, user },
    durationMs: Date.now() - startTime,
    source: 'ERROR',
    attempts: CONFIG.MAX_RETRIES,
    error: message,
  });
  return { _error: true, message, attempts: CONFIG.MAX_RETRIES };
}

function buildSimSystem() {
  return `你是《长征·抉择》自由行军沙盘的「世界裁判」。
玩家扮演一名红军小队指挥员，用自然语言下达任何行动。你负责：判定可行性、推进世界状态、让角色作出反应。
【世界】1935 年长征途中。缺粮、伤兵、道路不明是常态。人不是数值，是会累会怕会牺牲的人。
【规则】
1. 不拒绝玩家的创造性行动，只判定其代价与可行性（feasible: yes|hard|no）。
2. 行动必须有代价；连续做同样的事收益递减。
3. 世界更新要具体：谁受伤、谁掉队、粮减多少、拿到什么情报。
4. 角色（老班长/卫生员/红小鬼/向导老乡/新兵）各自有目标与立场，会反对、会建议、会沉默；他们的立场在回合间持续（写进 people[].goal / people[].memory）。
5. 允许失败与死亡，但写代价与尊严，不写羞辱，不写口号。
6. 不编造真实历史人物姓名。
【visual 标签】必须从这些里选一个最贴合本回合场景的：rain / night_march / starve / village / loss / river / march / camp
【输出】严格 JSON，无其他文字。`;
}

function buildSimUser({ world, action, intent }) {
  return `【当前世界状态】
地点：${world?.place || '草地边缘'}
天数：第 ${world?.day ?? 1} 天
队伍：${JSON.stringify(world?.people || [])}
粮食：${world?.food ?? 0} 份
士气：${world?.morale ?? 60}　体力：${world?.stamina ?? 70}
已获情报：${JSON.stringify(world?.intel || [])}
上一回合：${world?.lastTurn || '（开局）'}
${intent ? `【玩家意图】${intent}` : ''}
【玩家本回合行动】${action}

请返回：
{
  "feasible": "yes|hard|no",
  "verdict": "一句话裁定（20字内）",
  "narrative": "60-140字第二人称结果叙事，具体、克制",
  "visual": "rain|night_march|starve|village|loss|river|march|camp",
  "effects": { "food": 0, "morale": 0, "stamina": 0 },
  "world_delta": {
    "place": "可选，若位置变化",
    "people_change": [{ "name": "谁", "status": "可选：受伤/掉队/牺牲/恢复", "note": "可选", "goal": "可选，更新其目标", "memory": "可选，追加一条记忆（一句话）" }],
    "intel_add": ["新增情报"],
    "day_advance": 0
  },
  "npc_reactions": [{ "name": "老班长", "line": "20-40字反应", "stance": "支持|反对|担忧|沉默" }],
  "suggestions": ["建议行动1", "建议行动2", "建议行动3"],
  "tension": 0.6,
  "ending_hint": "可选：若队伍濒临崩溃，给一句方向"
}`;
}
