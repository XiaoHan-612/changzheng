/**
 * flow/night —— **篝火夜**（点亮 ≥3 条附身线后解锁的幕末夜间议事）。
 *
 * 从 main.js 搬出来（批 7 二·4）：选项由模型现场生成、结算也由模型写，是"关键抉择"里
 * 唯一给信念正向增长的地方（口径见 server/balance.js）。
 */
import { $, showScreen, typeText, escapeHtml } from '../ui.js';
import { askChoice } from '../step.js';
import { kernel } from '../kernel/index.js';
import { S, st, callAI, step, waitBtn, logChoice, markDone, isDone, publicState, LINE_NAMES, LINES_TOTAL } from './kit.js';
import { afterJudge } from './echo.js';

/**
 * 第四幕幕末 · 篝火深夜：模型生成互斥抉择 → 玩家选 → 模型写「当夜之后」
 * 选项禁止写死；生成失败才用内置兜底两项。
 */
export async function runNightChoice(act) {
  step('night', 'choice');
  if (isDone(act.id, 'night')) return false;
  if (!st().canNight(3)) {
    st().pushCampLog('系统', `附身线不足三条（${st().linesDone()}/${LINES_TOTAL}），今夜没有议事。`);
    return false;
  }

  showScreen('screen-night');
  $('night-title').textContent = '篝火 · 深夜';
  $('night-lead').textContent = '正在请模型写今夜的抉择…';
  $('night-body').innerHTML = '';

  let gen = null;
  try {
    gen = await callAI({
      scene: `${act.title}·篝火夜`,
      callType: 'night_options',
      situation: '这一天结束了。后半夜怎么过、明天的口粮怎么带，得在火边定下来。',
      state: publicState(),
      extraContext: nightContext(),
    });
  } catch { /* 用兜底选项 */ }

  const raw = Array.isArray(gen?.options)
    ? gen.options.filter((o) => o && (typeof o === 'string' || o.label))
    : [];
  const options = (raw.length >= 2 ? raw : [
    { label: '加岗并匀出口粮', sub: '安全优先，明天更苦', key: 'a' },
    { label: '按原编制休息', sub: '保留体力，伤员优先', key: 'b' },
  ]).slice(0, 3).map((o, i) => (typeof o === 'string'
    ? { label: o, sub: '', key: String(i) }
    : { label: String(o.label), sub: String(o.sub || ''), key: String(o.key ?? i) }));

  $('night-lead').textContent = gen?.lead || '火压低了。没人先开口。';
  kernel.emit('voice:say', { text: '火压低了。后半夜怎么过，明天的口粮怎么带，得在火边定下来。', actorId: '旁白', voiceId: 'narr' });
  const body = $('night-body');
  body.innerHTML = '';
  const picked = await askChoice(body, options, { extraOf: () => '' });
  const choice = picked.raw;
  logChoice(act, choice.label, '篝火夜');
  st().remember('nightChoice', choice.label);
  markDone(act.id, 'night');

  let res = null;
  try {
    res = await callAI({
      scene: `${act.title}·篝火夜结算`,
      callType: 'night_resolve',
      situation: `玩家选择：${choice.label}${choice.sub ? ` — ${choice.sub}` : ''}`,
      state: publicState(),
      options: [choice.label],
      operation: { choice: choice.key, label: choice.label },
      extraContext: nightContext(),
    });
    st().applyEffects(res?.effects);
    body.innerHTML = '<p id="night-out" class="blk-body"></p>';   // 纸面用墨字，别用给暗底准备的纸色
    await typeText($('night-out'), res?.narrative || '当夜无事。');
    st().pushCampLog('篝火夜', res?.narrative || choice.label);
  } catch (err) {
    body.innerHTML = `<p class="muted">当夜无话：${escapeHtml(err.message)}</p>`;
  }
  await waitBtn('天亮了 · 继续', body);
  await afterJudge(res || { narrative: `你决定：${choice.label}` }, '篝火之夜', 'h_campfire');
  return true;
}

/** 交给夜间的上下文：这一夜之前到底发生了什么 */
export function nightContext() {
  const done = (S.linesDone || []).map((k) => LINE_NAMES[k] || k);
  return [
    `已点亮附身线：${done.join('、') || '无'}`,
    `钓鱼最佳 ${(S.fishingBest || 0).toFixed(2)}`,
    `夜岗 ${Math.round((S.sentryScore || 0) * 100)} 分`,
    S.tonightPassword ? `今晚口令「${S.tonightPassword}」` : '没上过夜校，不会口令',
    S.sugarPlan ? `分糖：${JSON.stringify(S.sugarPlan)}` : '',
  ].filter(Boolean).join('；');
}
