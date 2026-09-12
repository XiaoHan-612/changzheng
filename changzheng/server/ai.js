import { CONFIG } from './config.js';
import { logAiCall } from './logger.js';

/**
 * 所有运行态智能决策必须走这里。禁止用独立算法替代模型判断。
 */
export async function callGlm51(payload) {
  const {
    scene,
    situation = '',
    state = {},
    options = [],
    systemPrompt,
    extraContext,
    operation = null,
    callType = 'minigame_review',
    agent = null,
  } = payload || {};

  const startTime = Date.now();
  const system = systemPrompt || buildSystemPrompt(callType, scene);
  const userMessage = buildUserMessage({ scene, situation, state, options, extraContext, operation, callType, agent });

  if (CONFIG.MOCK_AI) {
    const result = mockDecision({ scene, callType, options, state, operation, agent });
    logAiCall({
      scene,
      callType,
      agent,
      situation,
      stateSnapshot: { ...state },
      options,
      operation,
      prompt: { system, user: userMessage },
      rawResponse: JSON.stringify(result),
      response: result,
      appliedEffects: result.effects || {},
      durationMs: Date.now() - startTime,
      source: 'MOCK_AI',
      note: '未配置 GLM_API_KEY 或强制 MOCK',
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
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('模型返回无法解析为 JSON');
        parsed = JSON.parse(match[0]);
      }

      logAiCall({
        scene,
        callType,
        agent,
        situation,
        stateSnapshot: { ...state },
        options,
        operation,
        prompt: { system, user: userMessage },
        rawResponse: content,
        response: parsed,
        appliedEffects: parsed.effects || {},
        durationMs: Date.now() - startTime,
        // source 只标「走的是真模型」，具体模型名见日志的 model 字段，
        // 避免默认 glm-5.3-flash 被误标成 GLM-5.1。
        source: 'GLM',
        attempt,
        requestId: data.id,
      });
      return parsed;
    } catch (err) {
      lastError = err;
      if (attempt < CONFIG.MAX_RETRIES) await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }

  const fallback = mockDecision({ scene, callType, options, state, operation, agent });
  fallback._fallback = true;
  fallback._fallbackReason = String(lastError?.message || 'unknown');
  logAiCall({
    scene,
    callType,
    agent,
    situation,
    stateSnapshot: { ...state },
    options,
    operation,
    prompt: { system, user: userMessage },
    response: fallback,
    appliedEffects: fallback.effects || {},
    durationMs: Date.now() - startTime,
    source: 'FALLBACK',
    error: String(lastError?.message || lastError),
  });
  return fallback;
}

function buildSystemPrompt(callType, scene) {
  const base = `你是《长征·抉择》的叙事与裁决引擎。题材：1934–1936 中国工农红军长征关键节点（于都河、湘江、遵义、金沙江、泸定桥、雪山草地、腊子口、会宁）。
【语气】第二人称、克制、具体、有画面感；不堆口号，不戏说，不编造具体真实历史人物姓名。
【史实】以提供的事实为锚；文学典型须可辨认为文学化记述。
【护栏】禁止丑化红军战士；失败写代价与成长，不写羞辱。effects 单项 -20～+20。
【输出】只返回 JSON，不要任何其他文字。`;

  if (callType === 'scene_gen') {
    return `${base}
call_type=scene_gen。根据幕名、地点、玩家资源与已完成行动，生成进入营地时的场景氛围（非选项）。
返回：
{"title":"短场景题","atmosphere":"60-100字第二人称氛围","whisper":"一句可听的环境细语或旁人低语","focus_hint":"提示玩家光该照向哪里（20字内）"}`;
  }
  if (callType === 'choice_hint') {
    return `${base}
call_type=choice_hint。为每个选项生成「倾向预告」——只写方向不写精确数值，像卡牌预览。
返回：
{"hints":[{"label":"与选项原文一致","trend":"体力↓ 信念↑","risk":"低|中|高","blurb":"10字内气质"}]}`;
  }
  if (callType === 'failure_review') {
    return `${base}
call_type=failure_review。玩家在行军模式下失败（掉队/减员/断粮）。写一段克制的失败结算：不羞辱、不喊口号，写代价与队伍仍在前进。
返回：
{"title":"四个字内标题","paragraphs":["段1","段2"],"history_points":["史实要点1","要点2"],"personal":"一句给玩家的话"}`;
  }
  if (callType === 'npc_chat') {
    return `${base}
call_type=npc_chat。你是营地中的红军同伴，接住玩家的话并回一句到三句。
返回：
{"reply":"同伴的话（40-80字）","affinity_delta":-2到3,"mood":"平静|温和|警觉|感伤","topic_hint":"可选下一句话题"}`;
  }
  if (callType === 'share_judge' || callType === 'minigame_review') {
    return `${base}
call_type=${callType}。根据玩家操作与分配方案写后果。
返回：
{"choice":"短结论","reason":"40字内","effects":{"体力":0,"粮食":0,"士气":0,"信念":0,"民心":0,"好感_老班长":0,"好感_指导员":0,"好感_红小鬼":0},"narrative":"40-90字叙事","factId":"可选","nextBeat":"可选"}`;
  }
  if (callType === 'branch_judge') {
    return `${base}
call_type=branch_judge。裁决玩家在历史节点的应对。
返回：
{"result":"success|partial|fail","effects":{...同上},"scene_text":"60-120字","factId":"可选"}`;
  }
  if (callType === 'quiz_generate') {
    return `${base}
call_type=quiz_generate。根据本幕节点出一道长征史实单选题（4选1），知识点必须有史实依据。
返回：
{"question":"题干","options":["A","B","C","D"],"answer_index":0,"explain":"40-60字解说","difficulty":"easy|medium"}`;
  }
  if (callType === 'quiz_answer_ai') {
    return `${base}
call_type=quiz_answer_ai。你是参赛 AI 选手，独立作答，不看标准答案。
返回：
{"answer_index":0,"confidence":0.6,"reason":"20字内"}`;
  }
  if (callType === 'quiz_judge') {
    return `${base}
call_type=quiz_judge。根据标准答案给双方判分。
返回：
{"human_score":0或1,"ai_score":0或1,"winner":"human|ai|draw","explain":"40-60字","effects":{"士气":0}}`;
  }
  if (callType === 'night_options') {
    return `${base}
call_type=night_options。根据整日状态生成 2-3 个互斥的夜间抉择（禁止写死感，要贴合今日发生了什么）。
返回：
{"lead":"30-50字夜景引子","options":[{"label":"短标题","sub":"一句说明","key":"a"},{"label":"...","sub":"...","key":"b"}]}`;
  }
  if (callType === 'night_resolve') {
    return `${base}
call_type=night_resolve。玩家已选定夜间抉择，写「当夜之后」。
返回：
{"effects":{...},"narrative":"80-120字","nextBeat":"可选"}`;
  }
  if (callType === 'ending_review') {
    return `${base}
call_type=ending_review。综合本章资源、关系与抉择写结局。
返回：
{"ending_id":"同行|守望|未竟|星火","title":"结局标题","paragraphs":["段1","段2"],"history_points":["史实要点1","要点2","要点3"],"personal":"一句给玩家的寄语"}`;
  }
  if (callType === 'act_review') {
    return `${base}
call_type=act_review。根据玩家本幕行为写一段「幕间总评」，像连队文书的小结，克制、具体、有画面。
返回：
{"title":"总评短标题","lines":["句子1","句子2"],"style_hint":"玩家风格：如「重情」「谨慎」「果断」","points":3}`;
  }
  if (callType === 'study_report') {
    return `${base}
call_type=study_report。生成面向教育场景的「研学报告」摘要，可给教师/党建干事看。
返回：
{"summary":"120字内总评","knowledge":["掌握的史实点3-5条"],"values":["体现的精神价值2-3条"],"suggest":"一句延伸学习建议"}`;
  }
  return base + '\n返回通用决策 JSON：{"choice","reason","effects","narrative"}';
}

function buildUserMessage({ scene, situation, state, options, extraContext, operation, callType, agent }) {
  const parts = [
    `【场景】${scene}`,
    `【call_type】${callType}`,
    `【资源】体力:${state?.体力 ?? 70} 粮食:${state?.粮食 ?? 4} 士气:${state?.士气 ?? 65} 信念:${state?.信念 ?? 75} 民心:${state?.民心 ?? 50}`,
    `【好感】老班长:${state?.好感_老班长 ?? 40} 指导员:${state?.好感_指导员 ?? 40} 红小鬼:${state?.好感_红小鬼 ?? 40} 卫生员:${state?.好感_卫生员 ?? 40} 老乡:${state?.好感_老乡 ?? 30}`,
  ];
  if (state?.行动日志?.length) parts.push(`【今日已完成】${state.行动日志.join('；')}`);
  if (agent) parts.push(`【AI选手人设】${agent}`);
  if (situation) parts.push(`【情境】${situation}`);
  if (operation) parts.push(`【操作结果】${JSON.stringify(operation)}`);
  if (options?.length) parts.push(`【可选】\n${options.map((o, i) => `${i + 1}. ${typeof o === 'string' ? o : o.label || o}`).join('\n')}`);
  if (extraContext) parts.push(`【补充】${extraContext}`);
  parts.push('请以严格 JSON 返回。');
  return parts.join('\n');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function mockDecision({ scene, callType, options, state, operation, agent }) {
  const s = String(scene || '');
  const score = operation?.score ?? 0.65;
  const band = score >= 0.85 ? 'excellent' : score >= 0.5 ? 'good' : 'poor';

  if (callType === 'scene_gen') {
    return {
      title: s.split('·').pop() || '营地',
      atmosphere: '风把水汽压得很低。火堆旁有人在补鞋，有人把最后一点炒面推来推去。你听见自己的呼吸，也听见整支队伍的呼吸。',
      whisper: '「明天……还走吗？」',
      focus_hint: '光先照向火堆与水边',
    };
  }
  if (callType === 'failure_review') {
    return {
      title: '掉队',
      paragraphs: [
        '你没能在天黑前跟上队伍。风声盖过了脚步声，路迹被雪盖住。',
        '但队伍没有停。他们把你没走完的那一段，接了过去。',
      ],
      history_points: [
        '长征中的减员，多发生在掉队、伤病与断粮之间。',
        '许多名字没有留在名册上，只留在走过的人的记忆里。',
      ],
      personal: '这一局你没能走到终点。换一种选择，或许能。',
    };
  }
  if (callType === 'choice_hint') {
    const labels = options?.length ? options : ['A', 'B', 'C'];
    return {
      hints: labels.map((o, i) => ({
        label: typeof o === 'string' ? o : o?.label || String(i),
        trend: i === 0 ? '体力↓ 信念↑' : i === 1 ? '稳妥 士气≈' : '风险 粮食↓',
        risk: i === 0 ? '中' : i === 1 ? '低' : '高',
        blurb: i === 0 ? '向前一步' : i === 1 ? '稳住队伍' : '另辟蹊径',
      })),
    };
  }

  if (callType === 'npc_chat') {
    if (/老班长|鱼|汤/.test(s)) {
      return {
        reply: '鱼钩是缝衣针弯的。能喝上一口汤，伤员就能多走十里。你先把漂看好，别的不用想。',
        affinity_delta: 1,
        mood: '温和',
        topic_hint: '为什么不自己喝？',
      };
    }
    if (/指导员|路|图/.test(s)) {
      return {
        reply: '草地看着平，踩下去才知道深。宁可绕远，也别把人陷进去。你探路时多喊一声。',
        affinity_delta: 1,
        mood: '平静',
      };
    }
    if (/红小鬼|小鬼/.test(s)) {
      return {
        reply: '我腿不软。就是夜里冷，想家的时候数干粮。你别把这事说出去。',
        affinity_delta: 2,
        mood: '感伤',
      };
    }
    return {
      reply: '火边坐会儿吧。明天还得走。有话慢慢说，风大。',
      affinity_delta: 1,
      mood: '平静',
    };
  }

  if (callType === 'minigame_review' || callType === 'share_judge') {
    // 先认 operation.type / 明确钓鱼场景，避免「鱼钩」被误判成分汤
    if (operation?.type === 'fishing' || /钓鱼|咬钩|起竿|鱼钩/.test(s)) {
      const n =
        band === 'excellent'
          ? '漂一顿，你腕上一沉——鱼出水了，在暮色里银亮地跳。老班长笑了笑，把锅架上。'
          : band === 'good'
            ? '起竿稍慢，一条小鱼脱了钩。你又下了竿，风把水面吹碎。'
            : '空了三竿。肚子响，只好去拔草根。老班长没说话，接过你的空钩。';
      return {
        choice: band === 'excellent' ? '钓到了鱼' : band === 'good' ? '勉强有收获' : '没钓到',
        reason: '按起竿时机结算',
        effects:
          band === 'excellent'
            ? { 粮食: 3, 士气: 5 }
            : band === 'good'
              ? { 粮食: 1, 士气: 2 }
              : { 士气: -1 },
        narrative: n,
        factId: 'h_fishhook',
      };
    }
    if (operation?.type === 'soup' || /分汤|分配|煮粥/.test(s) || options?.some?.((o) => /伤员|病号|清汤|平分|自己/.test(String(o)))) {
      const choice = options?.[0] || operation?.choice || '全班平分';
      // 「自己喝清汤/自己少一点」是让，不是自私
      const selfish = /自己/.test(String(choice)) && !/给伤员|给病号|清汤|少一点|平分|忍着/.test(String(choice));
      return {
        choice: String(choice),
        reason: selfish ? '先顾了自己' : '优先伤员与病号',
        effects: selfish
          ? { 士气: -3, 信念: -5, 粮食: 1, 好感_老班长: -2 }
          : { 士气: 6, 信念: 8, 粮食: 1, 好感_老班长: 3, 好感_卫生员: 2 },
        narrative: selfish
          ? '你端着碗，看见老班长转过身去，把草根往嘴里塞。锅里还剩一点汤，他推给了伤员。'
          : '你把稠的拨给伤员，自己舀了清汤。老班长把最后一点鱼肉按进病号碗里，像完成一件大事。',
        factId: 'h_fishhook',
      };
    }
    if (/识字|夜校|口令/.test(s)) {
      return {
        choice: '完成今晚识字',
        reason: '按答题表现',
        effects: { 信念: 5, 士气: 4 },
        narrative: '沙地上留下歪歪扭扭的字。有人念出声，又赶紧捂住嘴。今晚的口令，他们记住了。',
        factId: 'h_nightschool',
        nextBeat: '口令写入营地记忆。',
      };
    }
    if (/休息/.test(s)) {
      return {
        choice: '歇了一会儿',
        reason: '恢复体力',
        effects: { 体力: 12, 粮食: -1, 士气: 2 },
        narrative: '你靠着背囊眯了一阵。风把火堆吹低，有人把最后一点炒面推到你手边。',
      };
    }
    return {
      choice: band === 'excellent' ? '做得漂亮' : band === 'good' ? '还行' : '吃了亏',
      reason: '按操作结算',
      effects: band === 'excellent' ? { 士气: 5 } : band === 'good' ? { 士气: 2 } : { 体力: -4, 士气: -2 },
      narrative: '队伍沉默地继续，脚步声被风声吞没。有人把水壶递过来，你喝了一口，又传下去。',
    };
  }

  if (callType === 'branch_judge') {
    const pick = options?.[0] || '稳一点绕远';
    return {
      result: /稳|绕远/.test(String(pick)) ? 'success' : /近|冲/.test(String(pick)) ? 'partial' : 'success',
      effects: /稳|绕远/.test(String(pick))
        ? { 体力: -6, 粮食: -1, 士气: 3 }
        : { 体力: -12, 粮食: -1, 士气: -2, 信念: 2 },
      scene_text:
        /稳|绕远/.test(String(pick))
          ? '你们绕开亮闪闪的水洼，多走了七里。有人说腿软，没人掉队。天黑前找着一块硬地。'
          : '你们抄了近路。有人陷到膝盖，几个人七手八脚拽出来。鞋全湿了，心却热着。',
      factId: 'h_grassland',
    };
  }

  if (callType === 'quiz_generate') {
    return {
      question: '红军过松潘草地时，部队最紧缺、也最常被战友相互推让的是什么？',
      options: ['弹药', '口粮', '地图', '电台'],
      answer_index: 1,
      explain: '草地补给断绝，一把炒面、一碗鱼汤都能救命，互相让粮是大量回忆录里的共同记忆。',
      difficulty: 'easy',
    };
  }

  if (callType === 'quiz_answer_ai') {
    return {
      answer_index: 1,
      confidence: 0.78,
      reason: agent ? '见习宣传员：草地缺粮印象最深' : '口粮',
    };
  }

  if (callType === 'quiz_judge') {
    return {
      human_score: 1,
      ai_score: 1,
      winner: 'draw',
      explain: '双方都抓住「口粮」这一关键。草地行军中，食物就是生命线。',
      effects: { 士气: 3 },
    };
  }

  if (callType === 'night_options') {
    return {
      lead: '火压低了。有人说明天还要赶路，有人盯着伤员的担架。',
      options: [
        { label: '加岗并匀出口粮', sub: '安全优先，明天更苦', key: 'a' },
        { label: '原编制休息', sub: '保留体力，伤员优先', key: 'b' },
        { label: '连夜探出一段路', sub: '赌明天少走弯路', key: 'c' },
      ],
    };
  }

  if (callType === 'night_resolve') {
    return {
      effects: { 体力: -5, 粮食: -1, 士气: 4, 信念: 3, 安全感: 5 },
      narrative: '你们把岗排密了。后半夜有人咳嗽，又被轻轻拍背止住。天快亮时，火堆只剩一点红。',
      nextBeat: '队伍在微光里收拢背囊。',
    };
  }

  if (callType === 'ending_review') {
    const faith = state?.信念 ?? 70;
    const ending_id = faith >= 80 ? '星火' : faith >= 65 ? '同行' : faith >= 45 ? '守望' : '未竟';
    const map = {
      星火: {
        title: '星火不熄',
        paragraphs: [
          '走出草地那天，你回头看了很久。泥水、草根、被让来让去的半碗汤，都沉在身后。',
          '有人问你怕不怕。你说怕。但脚步没停——因为前面有人，后面也有人。',
        ],
      },
      同行: {
        title: '同行',
        paragraphs: [
          '路还长，但脚步声叠在了一起。你忽然明白：同行本身就是路。',
          '老班长把空鱼钩塞进你手心。「拿着，」他说，「下一口汤，该你让人了。」',
        ],
      },
      守望: {
        title: '守望',
        paragraphs: [
          '天亮前你们把伤员抬上肩。有人回头看了一眼火堆的灰，然后跟上。',
          '你活了下来，并且记住了他们怎样把生的希望递出去。',
        ],
      },
      未竟: {
        title: '未竟',
        paragraphs: [
          '你们走出了这一夜。有些名字没来得及问，有些糖纸被收进了最贴身的口袋。',
          '路还长。火种还在——只要还有人肯把汤让出去。',
        ],
      },
    };
    const m = map[ending_id];
    return {
      ending_id,
      title: m.title,
      paragraphs: m.paragraphs,
      history_points: [
        '1935年8月，红一、红四方面军走过松潘草地。',
        '草地气候恶劣、沼泽遍布、补给断绝，部队以野菜、草根甚至皮带充饥。',
        '战友之间互相推让食物、把口粮留给伤员，是大量回忆录中的共同记忆。',
        '《金色的鱼钩》为文学化记述，人物是典型形象，不是对某一具体历史人物的复原。',
      ],
      personal: '你曾路过他们的长征——愿你把「让一口汤」的勇气带回自己的时代。',
    };
  }

  if (callType === 'act_review') {
    return {
      title: '本幕小结',
      lines: [
        '你把有限的暮色用在了该用的地方。',
        '有人记得你问过的那句话。',
      ],
      style_hint: '玩家风格：重情',
      points: 3,
    };
  }

  if (callType === 'study_report') {
    const faith = state?.信念 ?? 70;
    return {
      summary: `本局信念 ${faith}，走完五幕关键节点。玩家在营地日中完成抉择、小游戏与知识对决，史实回响已对照真实发生过的长征记忆。`,
      knowledge: [
        '于都河出发与群众支援浮桥',
        '湘江战役的巨大代价',
        '遵义会议与方向转折',
        '过草地缺粮与战友互助',
        '会宁会师与长征胜利',
      ],
      values: ['顾全大局', '把生的希望递出去', '实事求是'],
      suggest: '可延伸阅读回忆录中的草地篇章，并讨论「今天如何让一口汤」。',
    };
  }

  return {
    choice: options?.[0] || '继续',
    reason: '默认',
    effects: { 体力: -2, 士气: 1 },
    narrative: '队伍沉默地继续。',
  };
}

// 避免未使用告警
void clamp;
