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
      for (const el of document.querySelectorAll('#stats .blk-stat')) {
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
 * 弹弓手势（拖拽类玩法用，目前是打水漂）：在画布上按住 → 往后下方拖 → 松手。
 *
 * 为什么不能用 tap：这类玩法的推进量是**拖拽向量**（长度=力道、方向=出手角），
 * 画布上没有"点一下就往前走"的按钮，只会白等。
 * 为什么要边拖边读：画布逻辑尺寸（720×400）与屏幕上的显示尺寸不是一个数，
 * 同一个 170px 在两边对应的力道不同——所以拖的过程中读它自己报的
 * `data-mini-power` / `data-mini-angle`（打水漂在 aim 阶段一直写这两个），
 * 到位了再松手。这样换画布尺寸/换机器都不用重标定。
 * @param {string} hostSel 宿主容器选择器（游戏把 data-mini-* 写在它身上）
 * @param {string} canvasSel 可拖拽的画布
 * @param {{wantPower:number, wantDeg:number}} [want] 目标：满力 + 甜区角（K.IDEAL_DEG=18°）
 */
export async function slingshotDrag(page, hostSel, canvasSel, { wantPower = 90, wantDeg = 18 } = {}) {
  const box = await page.locator(canvasSel).first().boundingBox().catch(() => null);
  if (!box) return false;
  const sx = box.x + box.width * 0.5;
  const sy = box.y + box.height * 0.45;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // 方向：拖到**左下方**（"往后下方拖"）→ rawDeg 约 29°，乘 0.62 落在 18° 甜区
  const dirX = -Math.cos(29 * Math.PI / 180);
  const dirY = Math.sin(29 * Math.PI / 180);
  const maxLen = Math.max(box.width, box.height) * 0.55;
  let last = null;
  for (let i = 1; i <= 14; i++) {
    const len = (maxLen * i) / 14;
    await page.mouse.move(sx + dirX * len, sy + dirY * len);
    const st = await page.evaluate((sel) => {
      const h = document.querySelector(sel);
      return h ? { p: Number(h.dataset.miniPower || 0), a: Number(h.dataset.miniAngle || 0) } : null;
    }, hostSel).catch(() => null);
    if (st) last = st;
    if (st && st.p >= wantPower && st.a >= wantDeg - 3 && st.a <= wantDeg + 6) break;
  }
  await page.mouse.up();
  return last ? `${last.p}%/$${last.a}°` : true;
}

/**
 * 小游戏操作策略（唯一实现，回归与试玩共用）。
 * @returns {string} 动作标签；空字符串表示本轮没有可做的动作
 */
export async function applyMiniAction(page, s) {
  const a = s.miniActions || [];
  const has = (x) => a.includes(x);
  // 玩法策略：同事重做的十支，动作词见各自卡片（`modules/games/src/minigames-*.js`）。
  // 统一写法——给一个"越靠后段越优先"的动作序，能点就点一下，都没有就等一会儿：
  // 每支的节奏不同（有的要反复加热、有的要先选难度、有的要先抛竿），
  // 但"总是推进最靠后的那一步"对它们都通用（比写十条各自的分支更不容易漂）。
  const prefer = async (list, tag) => {
    for (const a of list) {
      if (has(a)) { await tap(page, `[data-mini-action="${a}"]`); return `${tag}-${a}`; }
    }
    await page.waitForTimeout(180);
    return '';
  };
  switch (s.mini) {
    case 'bendhook': return prefer(['done', 'bend-tip', 'bend-body', 'heat'], 'bendhook');
    case 'goldenhook': return prefer(['reel', 'hook', 'cast', 'recast'], 'fish');
    // 夜校：入口（nightschool）选中后会**自己**把 data-mini 换成子玩法的 id，两种都要认
    case 'nightschool':
    case 'nightschool-entry': return prefer(['pick-quiz', 'pick-lamp'], 'school-pick');
    case 'nightschool-quiz': return prefer(['answer'], 'school-quiz');
    case 'candy-share': return prefer(['confirm', 'give', 'keep', 'ask'], 'candy');
    case 'sentry-watch': return prefer(['answer', 'lamp'], 'sentry');
    case 'mud-gomoku': return prefer(['again', 'next', 'resign', 'urge', 'place', 'spectate', 'fair', 'handicap', 'level'], 'gomoku');
    case 'luding-chain': return prefer(['cover', 'lay', 'cling', 'start'], 'luding');
    case 'snow-grab': return prefer(['pull', 'throw', 'bare', 'leg', 'foot0', 'foot1', 'foot2'], 'grab');
    case 'pontoon-night': return prefer(['reinforce', 'anchor', 'seg', 'lamp', 'mode-plank', 'mode-boat'], 'pontoon');
    case 'rally-river': return prefer(['ferry', 'callout', 'search'], 'rally');
    // 2026-09-18 吸收的四支：先点入口动作，再点局内推进
    case 'skim':
    case 'skim-v3': {
      // 挑石是按钮；甩出去是**手势**，必须真拖一把（只点 aim 那个画布等于没出手）。
      for (const k of ['pick-flat', 'pick-tile', 'pick-round']) {
        if (has(k)) { await tap(page, `[data-mini-action="${k}"]`); return `skim-${k}`; }
      }
      if (has('aim')) {
        const info = await slingshotDrag(page, '[data-mini]:not([class~="hidden"])', '[data-mini-action="aim"]');
        await page.waitForTimeout(300);
        return info ? `skim-throw(${info})` : 'skim-aim';
      }
      await page.waitForTimeout(180);
      return '';
    }
    case 'weave': return prefer([
      'finish-hold', 'ear-pick-cloth', 'ear-pick-hemp', 'ear-pick-straw',
      'weave-insert', 'weave-undo',
      'warp-tighten', 'warp-cord-0', 'warp-cord-1', 'warp-cord-2', 'warp-cord-3',
      'warp-pick-hemp', 'warp-pick-straw', 'twist-done', 'twist-left', 'twist-right',
      'pound-end', 'pound-tap', 'pull-hold',
    ], 'weave');
    case 'antiphony': return prefer([
      'end', 'next', 'beat',
      'sing-2-a', 'sing-2-b', 'sing-2-c',
      'sing-1-a', 'sing-1-b', 'sing-1-c',
      'sing-0-a', 'sing-0-b', 'sing-0-c',
    ], 'antiphony');
    case 'cipher':
    case 'cipher-entry': return prefer([
      'report-rush', 'report-calm', 'report-lie',
      'opt', 'report', 'material', 'copy', 'pick',
      'mat-order', 'mat-scout', 'mat-yesterday',
      'book-a', 'book-b', 'key-turn', 'key-back',
      'mode-easy', 'mode-hard',
    ], 'cipher');
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
 * 跳过开场（序章过场 + 出身三选一 + 出发前一问 + 告别过场）。
 *
 * 开场是标准/行军模式的必经步骤：不专门测它的脚本（冒烟、布局、素材落盘）都要先过这一段，
 * 否则会在"等营地热点"的地方空等到超时。快速模式只剩一拍题字，函数也会顺手跳过去。
 *
 * 2026-09-15（批 C）起，开场里多了几屏**过场**（题字/路线图/告别，见 modules/cinema）。
 * 它们由同一条契约驱动：`data-step-kind="cutscene"` + `#btn-cut-skip` 一跳到底，
 * 所以这里一并处理——不这么做，每个调用点都要自己数"现在该点几次跳过"（迟早数错）。
 * @returns {Promise<boolean>} 调用后是否已不在开场步骤里
 */
export async function passOrigin(page) {
  for (let i = 0; i < 14; i++) {
    const { stepId, kind } = await page.evaluate(() => ({
      stepId: document.body.dataset.step || '',
      kind: document.body.dataset.stepKind || '',
    }));
    if (kind === 'cutscene') {
      await page.click('#btn-cut-skip').catch(() => {});
      await page.waitForTimeout(150);
      continue;
    }
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
    risk: '',
    score: (label, s) => (s?.stats?.体力 <= 35 && /背囊|休息/.test(label) ? 5 : 0),
  },
  thrifty: {
    pick: (n) => Math.min(1, n - 1),
    risk: 'low',
    score: (label, s) => (s?.stats?.体力 <= 50 && /背囊|休息/.test(label) ? 6
      : /背囊|休息|分|塘/.test(label) ? 3
        : /说话|问|交谈/.test(label) ? 1 : 0),
  },
  greedy: {
    pick: () => 0,
    risk: 'high',
    score: (label, s) => (s?.stats?.体力 <= 25 && /背囊|休息/.test(label) ? 6
      : /陡坡|隘口|红旗|桥/.test(label) ? 3
        : /说话|问|交谈/.test(label) ? 1 : 0),
  },
};

/**
 * 按策略点选项。
 * @param {number} index 目标下标（不可见时退到最近的可见项；不能原地返回，否则会假死）
 * @param {'high'|'low'|''} preferRisk 有风险标注时优先选哪一类（激进玩家挑高风险、保守玩家挑低风险）
 */
export async function clickChoice(page, index, preferRisk = '') {
  const opts = page.locator('[data-choice-index]');
  const n = await opts.count().catch(() => 0);
  if (!n) return '';
  if (preferRisk) {
    for (let i = 0; i < n; i++) {
      const el = opts.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const cls = (await el.locator('.risk').first().getAttribute('class').catch(() => '')) || '';
      if (!cls.includes(`r-${preferRisk}`)) continue;
      const label = (await el.innerText().catch(() => '')).split('\n')[0].trim();
      await el.click({ force: true, timeout: 400 }).catch(() => {});
      return label || `#${i}`;
    }
  }
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
  onSnapshot = null, onAct = null, maxMs = 45 * 60 * 1000, resume = false,
} = {}) {
  const policy = STRATEGIES[strategy] || STRATEGIES.balanced;
  const t0 = Date.now();
  const visited = new Set();
  const asked = new Set();          // 同一场交谈最多问一句
  const trace = [];
  const boardStall = { key: '', since: 0, lastLabel: '', sameLabel: 0 };   // 板屏兜底：没进展/原地重复（见下面 mini 分支）
  let pacedFor = '';
  let lastSig = '';
  let lastProgress = Date.now();
  let currentAct = '';

  // resume=true 用于"注入存档后从中途续跑"的场景（调用方已自己回到营地）
  if (!resume) {
    // v0.3 起标题页只剩 行军 / 连贯行军 / 择点穿行 / 游戏模式（DESIGN.md §1「已移除研学/快速」）。
    // 历史模式名（study / quick）一律落到「行军模式」——它就是评审口径要跑的真闭环。
    const MODE_BTN = {
      march: '#btn-mode-march',
      march_auto: '#btn-mode-auto', auto: '#btn-mode-auto',
      select: '#btn-mode-select', arcade: '#btn-mode-arcade',
    };
    await page.click(MODE_BTN[mode] || '#btn-mode-march');
  }

  for (;;) {
    const s = await snap(page);
    if (s.screens.includes('screen-end')) return { trace, seconds: Math.round((Date.now() - t0) / 1000), snapshot: s };
    if (Date.now() - t0 > maxMs) {
      // 超时也要带现场：只报"跑局超时 N 分钟"查不出它这十分钟在忙什么。
      // 2026-09-15：loss 在编排器里超时 10 分钟、真调 0 次，就是靠这条定性的。
      throw new Error(`跑局超时 ${Math.round(maxMs / 60000)} 分钟 · 最后一次快照：`
        + `screen=${s.screens.join(',')} step=${s.step} kind=${s.kind} state=${s.state}`
        + ` choices=${s.choices} cont=${s.cont} echo=${s.echoOk} mini=${s.mini}/${s.miniState}`
        + ` apOn=${s.apOn} act=${s.act}｜最近动作：${trace.slice(-8).join(' → ')}`);
    }

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
      // 兜底：有些玩法的推进是**手势 / 等待**型的（打水漂要弹弓拖拽、夜搭浮桥要等乡亲送门板），
      // 机器人可能长时间推不动。同一支玩法同一状态连续 12 秒既没换状态、也没做成任何动作，
      // 就按板屏右上那个**真按钮**「跳过本局」——走的是玩家那条路
      // （modules/games 的 btn-board-skip：热点算完成、不给效果、不烧复盘调用），整局才走得完。
      // 判据用**整屏签名**（含已可点的动作清单）：有些玩法点了有反应、状态却长时间不动
      // （夜搭浮桥门板不够时反复点空格是合法空操作），只盯"有没有动作"会漏掉这种卡法。
      const key = `${sig}|${s.miniActions.join(',')}`;
      if (boardStall.key !== key) { boardStall.key = key; boardStall.since = Date.now(); }
      if (Date.now() - boardStall.since > 20000) {
        const skipped = await tap(page, '#btn-board-skip');
        trace.push(skipped ? `board-skip(${s.mini})` : 'board-skip-miss');
        boardStall.since = Date.now();
        await page.waitForTimeout(400);
        continue;
      }
      const label = await applyMiniAction(page, s);
      if (label) {
        trace.push(label);
        // 第二个兜底判据：**同一个动作被反复做却没换来状态变化**。
        // 有些玩法的按钮在"当前这一步没它的事"时也是可点的（点了只回一句提示），
        // 只按签名判会一直等下去（卢定桥的 cling 就这么卡过 40 秒）。
        if (boardStall.lastLabel === label) boardStall.sameLabel += 1;
        else { boardStall.lastLabel = label; boardStall.sameLabel = 1; }
        if (boardStall.sameLabel >= 12) {
          const skipped = await tap(page, '#btn-board-skip');
          trace.push(skipped ? `board-skip(${s.mini}:重复${boardStall.sameLabel}次${label})` : 'board-skip-miss');
          boardStall.sameLabel = 0;
          boardStall.lastLabel = '';
          await page.waitForTimeout(400);
        }
      }
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
      trace.push(`choice ${await clickChoice(page, policy.pick(s.choices), policy.risk)}`);
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
