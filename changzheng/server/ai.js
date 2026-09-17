import { CONFIG, assertSafeApiUrl } from './config.js';
import { logAiCall } from './logger.js';
import { missingFields } from './schema.js';
import { normalizeEffects } from './balance.js';

/**
 * 所有运行态智能决策必须走这里。禁止用独立算法替代模型判断。
 */
/**
 * 设置页「测试连通」专用：单次探测，不写日志、不重试。
 * 允许传入未保存的表单值（model / apiKey / apiUrl / reasoningEffort）。
 *
 * ⚠️ 两处收口（本地演示的对外面）：
 *   ① Key **只用请求体里显式传来的那把**，不回退服务器已保存的 `CONFIG.GLM_API_KEY` ——
 *      否则局域网里的任何人都能拿演示机的 Key 打一次真调用（额度与日志都被别人花掉）。
 *   ② apiUrl 过 `assertSafeApiUrl`：只认 https，host 在白名单（见 config.js）。
 */
export async function probeGlm({ model, apiKey, apiUrl, reasoningEffort, timeoutMs = 25000 } = {}) {
  const model0 = (model || '').trim() || CONFIG.GLM_MODEL;
  const key = (apiKey || '').trim();
  if (!key) {
    return {
      ok: false,
      latencyMs: 0,
      model: model0,
      error: '连通测试需要在请求里显式带上 apiKey（不回退服务器已保存的 Key）——把 Key 填进输入框再测一次',
    };
  }
  let url = '';
  try {
    url = assertSafeApiUrl((apiUrl || '').trim() || CONFIG.GLM_API_URL);
  } catch (err) {
    return { ok: false, latencyMs: 0, model: model0, error: String(err?.message || err) };
  }
  const cfg = {
    model: model0,
    key,
    url,
    effort: reasoningEffort === undefined ? CONFIG.GLM_REASONING_EFFORT : reasoningEffort,
  };

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
    extraContext,
    operation = null,
    callType = 'minigame_review',
    agent = null,
    // 每类调用的预算（批 6）：策略表在 public/js/modules/ai/registry.js，客户端随请求带过来。
    // 服务器只做上下界收口，不猜策略——没有就按老默认值走（老客户端/脚本仍然能跑）。
    maxTokens,
    temperature,
  } = payload || {};
  // 上下界：太低会截断 JSON（实测 max_tokens=1000 时偶发空 JSON），太高等于放任模型写长
  const budgetTokens = Math.min(4000, Math.max(300, Number(maxTokens) || 2000));
  const temper = Math.min(1.2, Math.max(0, Number.isFinite(Number(temperature)) ? Number(temperature) : 0.75));

  const startTime = Date.now();
  // systemPrompt **一律由服务端按 callType 生成**：早先这里是 `payload.systemPrompt || …`，
  // 等于把"模型的人格与护栏"交给调用方随手覆盖（护栏、JSON 输出要求、数值上限都在 system 里）。
  // 前端与脚本本来就没有任何地方传它，所以收掉这个口子不影响任何现有调用。
  const system = buildSystemPrompt(callType, scene, operation);
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
      // 超时定时器必须 try/finally 清掉：fetch 抛网络错误时不会走到 clearTimeout，
      // 那个定时器会挂到 25 秒才自己醒（行为无害——它 abort 的是已经失败的那一次——
      // 但白占事件循环，也让"超时"的语义看着不干净）。2026-09-15 修。
      const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
      let res;
      try {
        res = await fetch(CONFIG.GLM_API_URL, {
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
            temperature: temper,
            ...(CONFIG.GLM_REASONING_EFFORT ? { reasoning_effort: CONFIG.GLM_REASONING_EFFORT } : {}),
            // 额度按调用类型给（见 modules/ai/registry.js）：短结论类收窄，既省额度也少"写太长"
            max_tokens: budgetTokens,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
        }
      } finally {
        clearTimeout(timeout);
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
      // 数值护栏：先归一化，再落日志（日志里看到的就是玩家实际收到的）
      if ('effects' in parsed) parsed.effects = normalizeEffects(callType, parsed.effects);

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
        budgetTokens,             // 这次的额度（qa:ai 拿它核对策略表）
        usage: data.usage || null, // token 用量（有就记，便于算"每类花了多少"）
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
【护栏】禁止丑化红军战士；失败写代价与成长，不写羞辱。
【数值】effects 单项 -8～+8（信念 -6～+6、粮食 -2～+2、好感 -4～+4），单次最多写 3 个维度，能不给就不给。
失败、代价、赶时间一类结果**必须至少有一项为负**——不要让玩家觉得怎么选都不亏。
信念只由"关键抉择"与"夜间议事"推动：小游戏成败不要给信念加分，连续同类场景也不要每次都加。
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
  if (callType === 'candy_scene') {
    return `${base}
call_type=candy_scene。夜里的营地，队伍分三颗糖之前的氛围一句。
返回：
{"scene":"一句景/气氛（20-40字，克制，不出现现代词）"}`;
  }
  if (callType === 'gomoku_move') {
    return `${base}
call_type=gomoku_move。你是泥地上画棋盘的那位对手，按局面走一手。
返回：
{"move":"棋盘坐标，如 h8（小写字母+数字）","say":"一句嘴硬的话（10-24字，口语，不骂人）"}`;
  }
  if (callType === 'school_lesson') {
    return `${base}
call_type=school_lesson。你是红军夜校的教员，今晚教三个字（口令/地名/人名各一个），并给出今晚口令。
只能从提示里给的词表里取，ch 必须是该词里真实出现的一个汉字。
返回：
{"lesson":{"chars":[{"kind":"口令|地名|人名","from":"词表里的词","ch":"其中的一个字","hint":"一句提示"}]},"notes":""}`;
  }
  if (callType === 'school_quiz') {
    return `${base}
call_type=school_quiz。你是红军夜校的教员，就今晚教的字出三道题（每道四选一）。
返回：
{"questions":[{"stem":"题干","options":["A","B","C","D"],"answer_index":0,"explain":"一句讲解"}]}`;
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
call_type=study_report。生成一份「研学报告」摘要，供带队者课后复盘（不写行业、场景与合作方口径）。
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
