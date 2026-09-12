import { CONFIG } from './config.js';
import { logAiCall } from './logger.js';

/**
 * 调用天津移动 glm-5.1 进行游戏 AI 决策
 * 所有运行态智能决策必须走这里，禁止用独立算法替代
 */
export async function callGlm51({ scene, situation, state, options, systemPrompt, extraContext, operation }) {
  const startTime = Date.now();

  const system = systemPrompt || buildSystemPrompt(scene);
  const userMessage = buildUserMessage({ scene, situation, state, options, extraContext, operation });

  if (CONFIG.MOCK_AI) {
    const result = mockDecision(scene, options, state, operation);
    const duration = Date.now() - startTime;
    logAiCall({
      scene,
      situation,
      stateSnapshot: { ...state },
      options,
      operation: operation || null,
      prompt: { system, user: userMessage },
      response: result,
      appliedEffects: result.effects,
      durationMs: duration,
      source: 'MOCK_AI',
      note: CONFIG.MOCK_AI && !CONFIG.GLM_API_KEY ? '未配置 GLM_API_KEY，使用本地模拟决策' : 'MOCK_AI=1',
    });
    return result;
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
            { role: 'user', content: userMessage },
          ],
          temperature: 0.75,
          max_tokens: 900,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error('模型返回无法解析为 JSON');
      }

      const duration = Date.now() - startTime;
      logAiCall({
        scene,
        situation,
        stateSnapshot: { ...state },
        options,
        operation: operation || null,
        prompt: { system, user: userMessage },
        rawResponse: content,
        response: parsed,
        appliedEffects: parsed.effects || {},
        durationMs: duration,
        source: 'GLM-5.1',
        attempt,
        requestId: data.id,
      });

      return parsed;
    } catch (err) {
      lastError = err;
      if (attempt < CONFIG.MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }

  const fallback = mockDecision(scene, options, state, operation);
  fallback._fallback = true;
  fallback._fallbackReason = String(lastError?.message || 'unknown');

  logAiCall({
    scene,
    situation,
    stateSnapshot: { ...state },
    options,
    operation: operation || null,
    prompt: { system, user: userMessage },
    response: fallback,
    appliedEffects: fallback.effects,
    durationMs: Date.now() - startTime,
    source: 'FALLBACK_AFTER_ERROR',
    error: String(lastError?.message || lastError),
  });

  return fallback;
}

function buildSystemPrompt(scene) {
  return `你是《附身·长征营地》的“决策大脑”与“叙事引擎”。玩家可附身营地中的红军战士，替他完成手上的事。

【角色】历史情境为 1934–1935 长征途中；语言克制、有力，不用口号堆砌；不编造具体真实历史人物姓名（可用虚构角色名）。

【严格要求】
1. 只返回 JSON，不要任何其他文字
2. 数值变化：单项 -15 到 +15
3. 符合红军战友关系与牺牲、分享的史实氛围
4. 若给出 operation（小游戏结果），叙事必须贴合操作表现（好/一般/差）
5. factId 可选：仅当适合解锁史实卡时给出

【返回 JSON】
{
  "choice": "采用的方案或结论（短）",
  "reason": "理由（40字内）",
  "effects": {"体力":0,"食物":0,"药品":0,"士气":0,"信念":0,"安全":0},
  "narrative": "40-90字第二人称叙事，克制",
  "factId": "可选史实卡 id",
  "nextBeat": "可选，下一句可发生的小事"
}`;
}

function buildUserMessage({ scene, situation, state, options, extraContext, operation }) {
  const parts = [
    `【场景】${scene}`,
    `【营地状态】体力:${state?.体力 ?? state?.stamina ?? 70} 食物:${state?.食物 ?? state?.food ?? 3} 药品:${state?.药品 ?? 2} 士气:${state?.士气 ?? 65} 信念:${state?.信念 ?? 75} 安全:${state?.安全 ?? 80}`,
  ];
  if (state?.伤员情况) parts.push(`【伤员】${state.伤员情况}`);
  if (state?.tonightPassword) parts.push(`【今晚口令】${state.tonightPassword}`);
  parts.push(`【情境】${situation}`);
  if (operation) {
    parts.push(`【小游戏结果】${JSON.stringify(operation)}`);
  }
  if (options?.length) {
    parts.push(`【可选行动】\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`);
  }
  if (extraContext) parts.push(`【补充】${extraContext}`);
  parts.push('请以 JSON 返回决策与叙事。');
  return parts.join('\n');
}

// ─── 本地模拟（无密钥时保证完整一局可演示） ───
function mockDecision(scene, options, state, operation) {
  const faith = state?.信念 ?? state?.faith ?? 70;
  const food = state?.食物 ?? state?.food ?? 2;
  const score = operation?.score ?? 0.6;
  const band = score >= 0.85 ? 'excellent' : score >= 0.5 ? 'good' : 'poor';

  const key = pickSceneKey(scene);

  if (key === 'fishing_result' || key === 'fishing') {
    const n =
      band === 'excellent'
        ? '漂一顿，你腕上一沉——鱼出水了，在火光里银亮地跳。老班长笑了笑，把锅架上。'
        : band === 'good'
          ? '起竿稍慢了些，一条小鱼脱了钩。你又下了竿，风把水面吹碎。'
          : '空了三竿。你听见肚子响，只好去拔草根。老班长没说话，接过你的空钩。';
    return {
      choice: band === 'excellent' ? '钓到了鱼' : band === 'good' ? '勉强有收获' : '没钓到',
      reason: '按操作表现结算',
      effects: band === 'excellent' ? { 食物: 2, 士气: 4 } : band === 'good' ? { 食物: 1, 士气: 1 } : { 士气: -1, 食物: 0 },
      narrative: n,
      factId: 'h_fishhook',
    };
  }

  if (key === 'soup' || key === '分配' || key === '分汤') {
    const c = options?.[0] || '全班分';
    const selfish = /自己/.test(c) && !/让/.test(c);
    return {
      choice: c,
      reason: selfish ? '你留下了自己的一份' : '优先伤员与病号',
      effects: selfish
        ? { 士气: -4, 信念: -6, 食物: -1 }
        : { 士气: 6, 信念: 8, 食物: -1 },
      narrative: selfish
        ? '你端着碗，看见老班长转过身去，把草根往嘴里送。锅里还剩一点汤，他推给了伤员。'
        : '你把稠的拨给伤员，自己舀了清汤。老班长把最后一点鱼肉按进病号碗里，像完成一件大事。',
      factId: 'h_fishhook',
    };
  }

  if (key === 'candy' || key === '分糖') {
    return {
      choice: operation?.given || '把糖分给了大家',
      reason: '按分配结果',
      effects: { 士气: 5, 信念: 4 },
      narrative: '糖纸在夜里响。有人先推说“不要”，后来还是含住了。你兜里空了，心却是满的。',
      factId: 'h_share',
    };
  }

  if (key === 'sentry' || key === '哨') {
    const safe = (state?.安全 ?? 80) + (score >= 0.7 ? 6 : score >= 0.4 ? 0 : -8);
    return {
      choice: score >= 0.7 ? '处置得当' : score >= 0.4 ? '有惊无险' : '出现误报或漏报',
      reason: '按岗哨表现',
      effects: { 安全: score >= 0.7 ? 6 : score >= 0.4 ? 0 : -8, 士气: score >= 0.7 ? 3 : -2 },
      narrative:
        score >= 0.7
          ? '你压低声音报出口令。黑暗里那人应了半句，是自己人。风又紧了一阵。'
          : score >= 0.4
            ? '你犹豫了一拍。来的是换岗的同志。他拍拍你的肩：“稳住。”'
            : '你几乎要喊。虚惊一场，手心的汗把枪托都浸湿了。下半夜你的眼睛瞪得更直。',
      factId: 'h_sentry',
    };
  }

  if (key === 'school' || key === '识字' || key === '口令') {
    return {
      choice: '完成今晚的识字与口令',
      reason: '按答题正确率',
      effects: { 士气: score >= 0.7 ? 6 : 2, 信念: 3 },
      narrative:
        score >= 0.7
          ? '沙地上留下歪歪扭扭的字。有人念出声，又赶紧捂住嘴笑。今晚的口令，他们记住了。'
          : '字写得难看，但都记住了口令。教员说：认得一个，就能传一个。',
      factId: 'h_nightschool',
      nextBeat: '口令已写入营地记忆，夜岗时会用到。',
    };
  }

  if (scene.includes('生成抉择')) {
    return {
      options: [
        { label: '加岗并匀出口粮', sub: '安全优先，明天更苦' },
        { label: '原编制休息，伤员优先', sub: '保留体力赶路' },
      ],
      lead: '火压低了。有人说明天还要赶路，有人盯着伤员的担架。',
      choice: '',
      reason: '生成今夜抉择',
      effects: {},
      narrative: '火压低了。有人说明天还要赶路，有人盯着伤员的担架。',
    };
  }

  if (key === 'gomoku' || scene.includes('五子棋')) {
    const n =
      band === 'excellent'
        ? '你赢了。小鬼把石子一收，嘴硬道：“再来。”眼里却亮了一下。'
        : band === 'good'
          ? '平局。你们同时笑出声，又赶紧压低。'
          : '小鬼赢了，得意地拍手，又怕吵醒别人，捂住嘴。';
    return {
      choice: band === 'excellent' ? '你赢了' : band === 'good' ? '平局' : '小鬼赢了',
      reason: '按棋局结果',
      effects: { 士气: band === 'poor' ? 2 : 5, 信念: 2 },
      narrative: n,
    };
  }

  if (key === 'talk' || scene.includes('交谈')) {
    return {
      choice: '说了一会儿',
      reason: '对话',
      effects: { 士气: 3, 信念: 2 },
      narrative:
        '他说家里还有个妹子，托人写了信，不知收到没有。又说路再远，也比夜里睡在野地强。火光把他半边脸照亮。',
    };
  }

  if (key === 'map' || scene.includes('指导员') || scene.includes('路线')) {
    return {
      choice: '绕远，稳一点',
      reason: '大部队在后头',
      effects: { 安全: 4, 士气: 2 },
      narrative:
        '近路贴着沼泽，夜里看不清。指导员说：宁可多走十里，也别把人陷进去。今晚口令是「瑞金」——出发的地方，记牢。',
      nextBeat: '他把图折好，塞进怀里最贴身的口袋。',
    };
  }

  if (key === 'night' || key === '夜间' || key === '篝火') {
    return {
      choice: options?.[0] || '加强警戒，匀出口粮',
      reason: '结合整日营地状态',
      effects: { 安全: 3, 士气: 2, 食物: -1 },
      narrative: '火堆压低了。有人提议加岗，有人说明天还要走远路。最后大家把目光看向你——不，是看向彼此。',
      nextBeat: '队伍在后半夜安静下来。',
    };
  }

  if (key === 'ending' || key === '终局') {
    const which = faith >= 75 ? '守望' : faith >= 50 ? '同行' : '未竟';
    return {
      choice: which,
      reason: '综合信念与营地状态',
      effects: {},
      narrative:
        which === '守望'
          ? '天亮前你们把伤员抬上肩。有人回头看了一眼火堆的灰，然后跟上。'
          : which === '同行'
            ? '路还长，但脚步声叠在了一起。你忽然明白：同行本身就是路。'
            : '你们走出了这一夜。有些名字没来得及问，有些糖纸被收进了最贴身的口袋。',
    };
  }

  if (key === 'intro') {
    return {
      choice: '开始',
      reason: '入戏',
      effects: {},
      narrative: options?.[0] || '火光跳了一下。你听见有人喊你的名字——不，是你现在这具身体的名字。',
    };
  }

  // 默认
  return {
    choice: options?.[1] || options?.[0] || '继续',
    reason: '保持队伍完整最重要',
    effects: { 体力: -3, 士气: 2, 信念: 1 },
    narrative: '队伍沉默地继续，脚步声被风声吞没。有人把水壶递过来，你喝了一口，又传下去。',
  };
}

function pickSceneKey(scene) {
  const s = String(scene || '');
  if (s.includes('终局') || s.includes('结局')) return 'ending';
  if (s.includes('生成抉择')) return 'gen_night';
  if (s.includes('五子棋')) return 'gomoku';
  if (s.includes('交谈')) return 'talk';
  if (s.includes('指导员') || s.includes('路线')) return 'map';
  if (s.includes('夜间') || s.includes('深夜') || s.includes('篝火议事') || s.includes('篝火')) return 'night';
  if (s.includes('钓鱼') || s.includes('咬钩')) return 'fishing';
  if (s.includes('分汤') || s.includes('煮粥') || s.includes('分配')) return 'soup';
  if (s.includes('分糖') || s.includes('糖')) return 'candy';
  if (s.includes('哨') || s.includes('岗')) return 'sentry';
  if (s.includes('识字') || s.includes('口令') || s.includes('夜校')) return 'school';
  if (s.includes('开场') || s.includes('入戏') || s.includes('穿越')) return 'intro';
  return 'default';
}
