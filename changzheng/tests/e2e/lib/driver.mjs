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
