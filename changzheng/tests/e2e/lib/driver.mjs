/**
 * 五幕驱动的共用件。
 *
 * 为什么抽出来：full-run（真调回归）与 playtest（时长/数值测量）必须走同一套交互契约。
 * 各写一套的后果是玩法一改两边都得改，迟早漂移，而且"能不能通关"和"一局多久"的口径会不一致。
 *
 * 约定：这里只认 step.js 定义的契约（data-step / data-action / data-choice-index / data-mini-*），
 * 不认任何中文标签或屏内专属 id。
 */

/** 当前屏幕与交互契约快照 */
export const snap = (page) => page.evaluate(() => {
  const live = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null && !e.disabled);
  const body = document.body;
  const mini = [...document.querySelectorAll('[data-mini]')].find((e) => e.offsetParent !== null) || null;
  const visibleScreen = [...document.querySelectorAll('.screen')].find((s) => !s.classList.contains('hidden'));
  return {
    screens: [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).map((s) => s.id),
    step: body.dataset.step || '',
    kind: body.dataset.stepKind || '',
    state: body.dataset.stepState || '',
    choices: live('[data-choice-index]').length,
    cont: live('[data-action="continue"]').length,
    echoOk: live('[data-action="echo-ok"]').length,
    aiRetry: live('[data-action="ai-retry"]').length,
    talkEnd: live('[data-action="talk-end"]').length,
    hotspots: live('[data-action="hotspot"]').map((e) => e.dataset.hotspotLabel || ''),
    march: live('[data-action="march"]').length,
    // 交谈屏的"快捷问句"也带 data-choice-index（它们是可选话题，不是必答选项），
    // 所以驱动必须先看 talkEnd 再看通用选项，否则会在同一屏反复提问、把额度烧光。
    talkQuick: live('[data-action="talk-quick"]').length,
    // 营地剩余行动点（HUD 上的亮点）
    apOn: document.querySelectorAll('#ap-dots .ap-dot.on').length,
    mini: mini ? mini.dataset.mini : '',
    miniState: mini ? (mini.dataset.miniState || '') : '',
    miniActions: mini ? [...mini.querySelectorAll('[data-mini-action]')].filter((e) => !e.disabled).map((e) => e.dataset.miniAction) : [],
    act: (document.getElementById('act-title')?.textContent || '').trim(),
    chars: visibleScreen ? visibleScreen.innerText.replace(/\s+/g, '').length : 0,
    // 五维读数（HUD 顶栏）：让策略能像真人一样"没体力了先休息"
    stats: (() => {
      const out = {};
      for (const el of document.querySelectorAll('#stats .stat')) {
        const m = /^(体力|粮食|士气|信念|民心)(\d+)$/.exec((el.textContent || '').replace(/\s+/g, ''));
        if (m) out[m[1]] = Number(m[2]);
      }
      return out;
    })(),
  };
});

/** 点击"可见且可点"的那一个（契约元素可能残留在隐藏屏里） */
export async function tap(page, sel) {
  const loc = page.locator(sel);
  const n = await loc.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    const ok = (await el.isVisible().catch(() => false)) && !(await el.isDisabled().catch(() => false));
    if (ok && (await el.getAttribute('aria-disabled').catch(() => null)) === 'true') continue;
    if (ok) {
      await el.click({ force: true, timeout: 400 }).catch(() => {});
      return true;
    }
  }
  return false;
}

/**
 * 小游戏操作策略（唯一实现，回归与试玩共用）。
 * @returns {string} 动作标签；空字符串表示本轮没有可做的动作
 */
export async function applyMiniAction(page, s) {
  const a = s.miniActions || [];
  const has = (x) => a.includes(x);
  switch (s.mini) {
    case 'fishing':
      if (has('cast')) { await tap(page, '[data-mini-action="cast"]'); return 'fish-cast'; }
      if (has('hook')) { await tap(page, '[data-mini-action="hook"]'); return 'fish-hook'; }
      await page.waitForTimeout(250);
      return '';
    case 'needle':
      if (has('bend')) { await tap(page, '[data-mini-action="bend"]'); return 'needle'; }
      await page.waitForTimeout(220);
      return '';
    case 'candy':
      if (has('candy') && has('target')) {
        await tap(page, '[data-mini-action="candy"]');
        await page.waitForTimeout(40);
        await tap(page, '[data-mini-action="target"]');
        return 'candy-give';
      }
      if (has('confirm')) { await tap(page, '[data-mini-action="confirm"]'); return 'candy-ok'; }
      await page.waitForTimeout(80);
      return '';
    case 'sentry':
      if (has('answer')) { await tap(page, '[data-mini-action="answer"]'); return 'sentry'; }
      await page.waitForTimeout(120);
      return '';
    case 'school':
      if (has('answer')) { await tap(page, '[data-mini-action="answer"]'); return 'school'; }
      await page.waitForTimeout(200);
      return '';
    case 'gomoku':
      if ((s.miniState === 'player' || s.miniState === 'awaiting') && has('cell')) {
        await tap(page, '[data-mini-action="cell"]');
        return 'gomoku-move';
      }
      await page.waitForTimeout(220);
      return '';
    case 'luding':
      if (has('jump')) await tap(page, '[data-mini-action="jump"]');
      if (has('right')) await tap(page, '[data-mini-action="right"]');
      await page.waitForTimeout(320);
      return 'luding';
    case 'grab':
      if (has('grab')) { await tap(page, '[data-mini-action="grab"]'); return 'grab'; }
      await page.waitForTimeout(420);
      return '';
    default:
      await page.waitForTimeout(250);
      return '';
  }
}

/**
 * 人类节奏模型：按当前屏可见正文字数估算"读完并反应"的时间。
 * 目的是让试玩测量接近真人，而不是机器人零延迟狂点。
 * @param {number} chars 可见正文字数
 * @param {'human'|'fast'} speed
 */
export function readingDelay(chars, speed = 'human') {
  if (speed === 'fast') return 0;
  // 中文按 45ms/字估算（含看选项与按键反应），上下限兜住极端屏
  return Math.max(800, Math.min(7000, Math.round((chars || 0) * 45)));
}

/**
 * 跳过开场设定（出身三选一 + 出发前一问）。
 *
 * 开场是标准/行军模式的必经步骤：不专门测它的脚本（冒烟、布局、素材落盘）都要先过这一段，
 * 否则会在"等营地热点"的地方空等到超时。快速模式没有这一步，函数会直接返回。
 * @returns {Promise<boolean>} 调用后是否已不在开场步骤里
 */
export async function passOrigin(page) {
  for (let i = 0; i < 6; i++) {
    const stepId = await page.evaluate(() => document.body.dataset.step || '');
    if (!stepId.startsWith('origin')) return true;
    const opt = page.locator('[data-choice-index]').first();
    if (await opt.count().catch(() => 0)) {
      await opt.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
      continue;
    }
    const cont = page.locator('[data-action="continue"]').first();
    if (await cont.count().catch(() => 0)) {
      await cont.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
      continue;
    }
    await page.waitForTimeout(200);
  }
  return !(await page.evaluate(() => document.body.dataset.step || '')).startsWith('origin');
}

/**
 * 从当前可点的热点里挑一个：优先没做过的，再按策略打分。
 * 热点目前可以重复点（批次二会改成一次性），所以"优先没做过"能保证覆盖到新内容。
 */
export function pickHotspot(labels, { visited = new Set(), keyOf = (l) => l, scoreOf = () => 0 } = {}) {
  if (!labels.length) return '';
  const fresh = labels.filter((l) => !visited.has(keyOf(l)));
  const pool = fresh.length ? fresh : labels;
  let best = pool[0];
  let bestScore = -Infinity;
  for (const l of pool) {
    const sc = scoreOf(l);
    if (sc > bestScore) { best = l; bestScore = sc; }
  }
  return best;
}

/**
 * 试玩策略 = 「选第几个选项」+「优先点哪个热点」。
 * 三种画像：稳扎稳打 / 保守求存 / 抢进度。热点优先靠标签关键词打分。
 */
export const STRATEGIES = {
  // 三种策略都带"低于阈值先休息"的常识行为：不这么做，自动试玩永远测不出恢复阀的作用
  balanced: {
    pick: () => 0,
    score: (label, s) => (s?.stats?.体力 <= 35 && /背囊|休息/.test(label) ? 5 : 0),
  },
  thrifty: {
    pick: (n) => Math.min(1, n - 1),
    score: (label, s) => (s?.stats?.体力 <= 50 && /背囊|休息/.test(label) ? 6
      : /背囊|休息|分|塘/.test(label) ? 3
        : /说话|问|交谈/.test(label) ? 1 : 0),
  },
  greedy: {
    pick: () => 0,
    score: (label, s) => (s?.stats?.体力 <= 25 && /背囊|休息/.test(label) ? 6
      : /陡坡|隘口|红旗|桥/.test(label) ? 3
        : /说话|问|交谈/.test(label) ? 1 : 0),
  },
};

/** 按策略点选项：目标下标不可见时退到最近的可见项（不能原地返回，否则会假死） */
export async function clickChoice(page, index) {
  const opts = page.locator('[data-choice-index]');
  const n = await opts.count().catch(() => 0);
  if (!n) return '';
  const order = [...Array(n).keys()].sort((a, b) => Math.abs(a - index) - Math.abs(b - index));
  for (const i of order) {
    const el = opts.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if (await el.isDisabled().catch(() => false)) continue;
    const label = (await el.innerText().catch(() => '')).split('\n')[0].trim();
    await el.click({ force: true, timeout: 400 }).catch(() => {});
    return label || `#${i}`;
  }
  return '';
}

/**
 * 完整跑一局（唯一实现，试玩测量与影音审计共用）。
 *
 * @param {object} opts
 * @param {'study'|'march'|'quick'} opts.mode
 * @param {'human'|'fast'} opts.speed 人类节奏（按正文字数等待）或零延迟
 * @param {'balanced'|'thrifty'|'greedy'} opts.strategy
 * @param {(s:object, ctx:object)=>void} [opts.onSnapshot] 每次快照回调（审计挂在这里）
 * @param {(ev:object)=>void} [opts.onAct] 换幕回调（试玩计时挂在这里）
 * @param {number} [opts.maxMs]
 * @returns {Promise<{trace:string[], seconds:number, snapshot:object}>}
 */
export async function playThrough(page, {
  mode = 'study', speed = 'fast', strategy = 'balanced',
  onSnapshot = null, onAct = null, maxMs = 45 * 60 * 1000,
} = {}) {
  const policy = STRATEGIES[strategy] || STRATEGIES.balanced;
  const t0 = Date.now();
  const visited = new Set();
  const asked = new Set();          // 同一场交谈最多问一句
  const trace = [];
  let pacedFor = '';
  let lastSig = '';
  let lastProgress = Date.now();
  let currentAct = '';

  await page.click(mode === 'quick' ? '#btn-mode-quick' : mode === 'march' ? '#btn-mode-march' : '#btn-mode-study');

  for (;;) {
    const s = await snap(page);
    if (s.screens.includes('screen-end')) return { trace, seconds: Math.round((Date.now() - t0) / 1000), snapshot: s };
    if (Date.now() - t0 > maxMs) throw new Error(`跑局超时 ${Math.round(maxMs / 60000)} 分钟`);

    const actKey = s.act || s.step.split(':')[0];
    if (actKey && actKey !== currentAct) {
      currentAct = actKey;
      if (onAct) onAct(actKey, Math.round((Date.now() - t0) / 1000));
    }
    if (onSnapshot) onSnapshot(s, { sinceStart: Math.round((Date.now() - t0) / 1000) });

    const sig = [s.screens.join(), s.step, s.state, s.choices, s.cont, s.echoOk, s.mini, s.miniState].join('|');
    if (sig !== lastSig) { lastSig = sig; lastProgress = Date.now(); }
    if (Date.now() - lastProgress > 40000) {
      throw new Error(`卡住 40s：screen=${s.screens.join(',')} step=${s.step} state=${s.state}；最近动作：${trace.slice(-8).join(' → ')}`);
    }

    // 人类节奏：每个"新的待操作画面"只等一次。不能要求 state==='awaiting'：
    // askChoice 点完会置 busy，而结果面板的「继续」此时已经出现，先判 busy 会永远跳过它。
    if (speed === 'human' && sig !== pacedFor
      && (s.choices || s.cont || s.echoOk || s.mini || s.talkEnd || s.march)) {
      pacedFor = sig;
      await page.waitForTimeout(readingDelay(s.chars, speed));
      continue;
    }

    if (s.echoOk) { trace.push('echo-ok'); await tap(page, '[data-action="echo-ok"]'); continue; }
    if (s.cont) { trace.push('continue'); await tap(page, '[data-action="continue"]'); continue; }
    if (s.aiRetry) { trace.push('ai-retry'); await tap(page, '[data-action="ai-retry"]'); continue; }
    if (s.state === 'busy') { await page.waitForTimeout(300); continue; }
    if (s.mini) {
      const label = await applyMiniAction(page, s);
      if (label) trace.push(label);
      continue;
    }
    // 交谈：先问一句（贴近真人）再结束。必须排在通用选项之前：快捷问句也带 data-choice-index。
    if (s.talkEnd) {
      if (s.talkQuick && !asked.has(s.step) && strategy !== 'thrifty') {
        asked.add(s.step);
        trace.push('talk-ask');
        await tap(page, '[data-action="talk-quick"]');
        continue;
      }
      trace.push('talk-end');
      await tap(page, '[data-action="talk-end"]');
      continue;
    }
    if (s.choices) {
      trace.push(`choice ${await clickChoice(page, policy.pick(s.choices))}`);
      continue;
    }
    if (s.screens.includes('screen-camp')) {
      if (s.apOn > 0 && s.hotspots.length) {
        const keyOf = (l) => `${s.act}|${l}`;
        const label = pickHotspot(s.hotspots, { visited, keyOf, scoreOf: (l) => policy.score(l, s) });
        const clicked = await clickHotspot(page, label);
        if (clicked) { visited.add(keyOf(clicked)); trace.push(`hotspot ${clicked}`); continue; }
      }
      if (s.march) { trace.push('march'); await tap(page, '[data-action="march"]'); continue; }
    }
    await page.waitForTimeout(200);
  }
}

/** 点一个指定文案的热点，返回是否点到 */
export async function clickHotspot(page, label) {
  const el = page.locator('[data-action="hotspot"]', { hasText: label }).first();
  if (!(await el.count().catch(() => 0))) return '';
  if (!(await el.isVisible().catch(() => false))) return '';
  await el.click({ force: true, timeout: 400 }).catch(() => {});
  return label;
}
