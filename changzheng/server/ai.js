import { CONFIG } from './config.js';
import { logAiCall } from './logger.js';
import { missingFields } from './schema.js';

/**
 * 所有运行态智能决策必须走这里。禁止用独立算法替代模型判断。
 */
/**
 * 设置页「测试连通」专用：单次探测，不写日志、不重试。
 * 允许传入未保存的表单值（model / apiKey / apiUrl / reasoningEffort）。
 */
export async function probeGlm({ model, apiKey, apiUrl, reasoningEffort, timeoutMs = 25000 } = {}) {
  const cfg = {
    model: (model || '').trim() || CONFIG.GLM_MODEL,
    key: (apiKey || '').trim() || CONFIG.GLM_API_KEY,
    url: (apiUrl || '').trim() || CONFIG.GLM_API_URL,
    effort: reasoningEffort === undefined ? CONFIG.GLM_REASONING_EFFORT : reasoningEffort,
  };
  if (!cfg.key) return { ok: false, latencyMs: 0, model: cfg.model, error: '未配置 API Key' };

  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: '只返回 JSON，不要其他文字。' },
        { role: 'user', content: '返回：{"ok":true,"echo":"长征·抉择"}' },
      ],
      temperature: 0,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    };
    if (cfg.effort) body.reasoning_effort = cfg.effort;
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    const latencyMs = Date.now() - t0;
    const base = { model: cfg.model, reasoningEffort: cfg.effort || '', latencyMs };
    if (!res.ok) {
      return { ...base, ok: false, httpStatus: res.status, error: text.slice(0, 300) };
    }
    let data = null;
    try { data = JSON.parse(text); } catch { /* 保持 null */ }
    const content = data?.choices?.[0]?.message?.content ?? '';
    let parsed = null;
    try { parsed = JSON.parse(content); } catch { /* 不是 JSON */ }
    return {
      ...base,
      ok: true,
      source: 'GLM',
      reply: String(content).slice(0, 120),
      jsonOk: !!parsed,
      finishReason: data?.choices?.[0]?.finish_reason || '',
      usage: data?.usage || null,
      emptyContent: String(content).trim().length === 0,
    };
  } catch (err) {
    // Node 的 fetch 只给 "fetch failed"，真正的原因在 err.cause
    const cause = err?.cause?.code || err?.cause?.message || '';
    const reason = err?.name === 'AbortError' ? `请求超时（>${Math.round(timeoutMs / 1000)}s）` : String(err.message || err);
    return {
      model: cfg.model,
      reasoningEffort: cfg.effort || '',
      latencyMs: Date.now() - t0,
      ok: false,
      error: cause ? `${reason}（${cause}）` : reason,
    };
  } finally {
    clearTimeout(timer);
  }
}

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
  const system = systemPrompt || buildSystemPrompt(callType, scene, operation);
  const userMessage = buildUserMessage({ scene, situation, state, options, extraContext, operation, callType, agent });

  // 没有 Key 就直接报错：不做任何"假演示"
  if (!CONFIG.GLM_API_KEY) {
    logAiCall({
      scene, callType, agent, situation,
      stateSnapshot: { ...state }, options, operation,
      prompt: { system, user: userMessage },
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
            { role: 'user', content: userMessage },
          ],
          temperature: 0.75,
          ...(CONFIG.GLM_REASONING_EFFORT ? { reasoning_effort: CONFIG.GLM_REASONING_EFFORT } : {}),
          // 留足 token：实测 max_tokens=1000 时模型偶发返回空 JSON（内容被推理占满）
          max_tokens: 2000,
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
      // 空对象视为失败：重试，仍失败则走 FALLBACK，别让玩家看到空白叙事
      if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
        throw new Error('模型返回空 JSON（可能是 token 被占满或内容被过滤）');
      }
      // 字段契约：缺必需字段就当次失败并重试（残缺对象比报错更难查，
      // 例如 quiz 少了 answer_index，界面会照常渲染但没有正确答案）
      const missing = missingFields(callType, parsed);
      if (missing.length) {
        throw new Error(`模型返回缺少必需字段：${missing.join('、')}`);
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

  // 重试用尽：不再编造叙事，返回结构化错误，由前端提示原因并让玩家重试
  const message = String(lastError?.message || lastError || 'unknown');
  logAiCall({
    scene, callType, agent, situation,
    stateSnapshot: { ...state }, options, operation,
    prompt: { system, user: userMessage },
    durationMs: Date.now() - startTime,
    source: 'ERROR',
    attempts: CONFIG.MAX_RETRIES,
    error: message,
  });
  return { _error: true, message, attempts: CONFIG.MAX_RETRIES };
}

function buildSystemPrompt(callType, scene, operation) {
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
{"title":"四个字内标题","paragraphs":["段1","段2"],"history_points":["史实要点1","要点2"],"personal":"一句给玩家的话"}
四个字段都要写：paragraphs 2–3 段、history_points 2–3 条（失败屏有对应区块，留空会空着）。`;
  }
  if (callType === 'npc_chat') {
    return `${base}
call_type=npc_chat。你是营地中的红军同伴，接住玩家的话并回一句到三句。
返回：
{"reply":"同伴的话（40-80字）","affinity_delta":-2到3,"mood":"平静|温和|警觉|感伤","topic_hint":"可选下一句话题"}`;
  }
  if (callType === 'share_judge' || callType === 'minigame_review') {
    // 分糖要逐颗判定，其余小游戏只写整体后果
    if (operation?.type === 'sugar') {
      return `${base}
call_type=share_judge（分糖）。玩家把三颗糖分给伤员 / 倔强的新兵 / 小号手，或自留。
逐颗判定谁接受、谁推辞、谁转赠，再给整局评价。不羞辱任何选择：自留也写情绪复杂度，不写道德指责。
返回：
{"items":[{"who":"伤员|倔强的新兵|小号手|自留","accepted":true,"reaction":"20字内"},...],
"choice":"一句话结论","reason":"40字内","effects":{"士气":0,"信念":0,"好感_红小鬼":0,"好感_卫生员":0,"粮食":0},
"narrative":"50-100字叙事","factId":"h_share"}`;
    }
    if (operation?.type === 'sentry') {
      return `${base}
call_type=minigame_review（夜岗）。玩家在五个信号（脚步/口令/光点/兽/静默）中各选一次处置。
按误报与漏报写后果：漏报要付代价，误报同样要付代价，别只奖励保守。
返回：
{"choice":"短结论","reason":"40字内","effects":{"士气":0,"信念":0,"体力":0},
"narrative":"50-90字叙事","factId":"h_sentry"}`;
    }
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
