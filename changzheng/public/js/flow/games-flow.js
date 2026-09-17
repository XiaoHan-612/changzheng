/**
 * flow/games-flow —— **玩法流程**：把"开一局玩法 → 交给模型复盘 → 走回响"串起来的那几段。
 *
 * 与 modules/games 的分工（批 5 定的边界，别混）：
 *   modules/games  负责**怎么把玩法摆上板屏**（题名/数值签/契约/清理），玩法本身是插件；
 *   本文件负责**玩完之后怎么办**（调哪个模型、记什么状态、点亮哪条附身线、弹不弹回响）。
 * 所以这里出现 callAI / afterJudge / markLine 是正常的，出现板屏 DOM 就不正常（那是宿主的事）。
 */
import { $, showScreen, setStageBanner, setStagePanel, say, setPortrait, toast, escapeHtml } from '../ui.js';
import { askChoice, waitContinue } from '../step.js';
import { kernel } from '../kernel/index.js';
import { S, st, gamesApi, callAI, step, waitBtn, publicState, logShare, markLine, markDone } from './kit.js';
import { COMPANIONS } from '../data.js';
import { sceneImage, showNpc } from './view.js';

/**
 * 玩法要用模型时的**唯一通道**：调用与记账都留在流程层，玩法只描述"要判什么"。
 *
 * 为什么不让玩法自己发请求：预算/温度/重试/账目都归 `modules/ai`（见 docs/BUS.md 的口径），
 * 玩法那边（同事单独开发的那条线）原来是自己 `POST /api/decide`——现在改成调这个回调，
 * 于是一次调用在 `qa:ai` 与 JSONL 日志里都看得见，参数也收在一张表里。
 * 玩法里自己带着 10 秒窗口（candy 的 `AI_WINDOW_MS`）与"没答就用固定内容"的兜底，保持不动。
 */
/**
 * 不需要模型复盘的那几支用**固定效果**（卡片标了 `noAi: true` = 纯铺垫，见他们的注册表口径）：
 * 玩法自己的分与过程已经说明一切，再花一次真调写两句旁白不值当。
 * 只动士气/体力三档；**不碰信念**——那是"关键抉择"才动的维度（与 minigame_review 的预算口径一致）。
 */
export function fixedEffectsFor(op) {
  const s = Number(op?.score) || 0;
  if (s >= 0.7) return { 士气: +5, 体力: -3 };
  if (s >= 0.4) return { 士气: +2, 体力: -5 };
  return { 士气: -3, 体力: -7 };
}

/**
 * 玩法收尾的**唯一分岔**：要模型就调 `minigame_review`，不要模型（`op.noAi`）就落固定效果。
 * 别把这个判断散回各个 doXxx——散一次就会漏一处（同事那六支标了 noAi 的玩法，
 * 早先照样每局烧一次真调）。
 *
 * **中途放弃/拆屏**（`detail.aborted` / `why:detached`）：不调模型、不改资源，
 * 返回短旁白；调用方应跳过 afterJudge/markLine（见 `isAborted`）。
 */
export function isAborted(op) {
  return !!(op?.detail?.aborted || op?.detail?.why === 'detached' || op?.detail?.why === 'abandoned');
}

/** 放弃/拆屏时的统一短收尾：不点亮附身线、不弹回响 */
function abortedOut(result) {
  return !!(result?._aborted);
}

/** 玩家放弃或容器被拆走：短旁白收束；返回 'aborted' 供调用方跳过 markDone */
async function finishAborted() {
  await say('叙事', '这一局没有打完。');
  st().pushCampLog('系统', '中途放弃了这一局');
  await waitBtn('继续');
  return 'aborted';
}

async function reviewOrFixed(op, body = {}) {
  if (isAborted(op)) {
    return { effects: {}, narrative: '这一局没有打完。', _aborted: true, factId: null };
  }
  if (op?.noAi) return { effects: fixedEffectsFor(op), narrative: op.summary || '', _fixed: true };
  return await callAI({ state: publicState(), ...body, situation: body.situation || op?.summary || '' });
}

const decideFor = (scene) => (payload = {}) => callAI({
  ...payload,
  scene: payload.scene || scene,
  state: payload.state || publicState(),
});
import { afterJudge } from './echo.js';

export async function doSchool() {
  step('school', 'minigame');
  showScreen('screen-stage');
  setStageBanner('夜校识字', '/assets/scenes/school_close.jpg');
  showNpc('文化教员', { role: '夜校', mood: '耐心' });
  setStagePanel('');                                  // 玩法不在纸卷里，正文区留空
  await say('文化教员', '跟着念。认得一个字，就能传给下一个人。', 'jiaoyuan_school');
  const op = await gamesApi().play('nightschool', { params: { decide: decideFor('夜校识字') } });
  showScreen('screen-stage');                         // 结算回到对白屏：人物 + 叙事 + 继续
  if (isAborted(op)) { return finishAborted(); }
  st().remember('tonightPassword', op.detail?.password || '瑞金');
  markLine('school', { voluntary: true });
  let result;
  result = await reviewOrFixed(op, {
    scene: '夜校识字',
    callType: 'minigame_review',
    situation: `识字正确率 ${(op.score * 100) | 0}%`,
    state: publicState(),
    operation: { type: 'school', ...op },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || '');
  st().pushCampLog('夜校', `口令「${S.tonightPassword}」`);
  await waitBtn('继续');
  await afterJudge(result, '行军中的文化学习', 'h_nightschool');
}

/** 红小鬼 · 分糖：三颗糖，AI 逐颗判定。`fromForced` 时不算自愿附身线 */
export async function doCandy(fromForced = false) {
  step('candy', 'minigame');
  showScreen('screen-stage');
  setStageBanner('分糖', sceneImage('/assets/scenes/sugar_close.jpg', '/assets/scenes/camp_pano.jpg'));
  setPortrait('红小鬼', '16岁小战士', '鬼', '倔强', '/assets/characters/xiaogui.png');
  setStagePanel('');
  await say('红小鬼', '我兜里有三颗糖。你说，给谁？');
  const op = await gamesApi().play('candy-share', { params: { decide: decideFor('分糖') } });
  showScreen('screen-stage');
  if (isAborted(op)) { return finishAborted(); }
  st().remember('sugarPlan', op.detail || null);
  markLine('candy', { voluntary: !fromForced });
  let result;
  result = await callAI({
    scene: '分糖·红小鬼',
    callType: 'share_judge',
    situation: `三颗糖的分配：${op.summary}`,
    state: publicState(),
    options: [op.summary],
    operation: { type: 'sugar', ...op.detail },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || '');
  st().pushCampLog('分糖', op.summary);
  await waitBtn('继续');
  await afterJudge(result, '行军中的分享', 'h_share');
}

/** 哨兵 · 夜岗：五信号判断，夜校口令在此生效。`fromForced` 时不算自愿附身线 */
export async function doSentry(fromForced = false) {
  step('sentry', 'minigame');
  showScreen('screen-stage');
  setStageBanner('夜岗', sceneImage('/assets/scenes/sentry_night.jpg', '/assets/scenes/camp_pano.jpg'));
  setPortrait('哨兵', '夜哨', '哨', '警觉');
  setStagePanel('');
  await say('哨兵', '后半夜归你。听不清就再听一遍，别急着开枪。');
  const op = await gamesApi().play('sentry-watch', { params: { password: S.tonightPassword } });
  showScreen('screen-stage');
  if (isAborted(op)) { return finishAborted(); }
  st().remember('sentryScore', op.score);
  markLine('sentry', { voluntary: !fromForced });
  let result;
  result = await reviewOrFixed(op, {
    scene: '夜岗·哨位',
    callType: 'minigame_review',
    situation:
      // detail 用可选链兜底：玩法被中途拆走时 detail 里没有 hits/total（shape 是 detached），
      // 直接取属性会得到 "undefined/undefined" 这种 Prompt——顺手写死成 0/0
      `五个信号处置 ${op.detail?.hits ?? 0}/${op.detail?.total ?? 0}`
      + (S.tonightPassword ? `，夜校口令「${S.tonightPassword}」用上了` : '，未学过口令只能硬扛'),
    state: publicState(),
    operation: { type: 'sentry', ...op.detail },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || '');
  st().pushCampLog('夜岗', op.summary);
  await waitBtn('继续');
  await afterJudge(result, '夜间警戒', 'h_sentry');
}

/** 两个小鬼 · 泥地五子棋 */
export async function doGomoku() {
  step('gomoku', 'minigame');
  showScreen('screen-stage');
  setStageBanner('泥地五子棋', '/assets/scenes/camp_pano.jpg');
  setPortrait('两个小鬼', '泥地上的棋', '棋', '专注', '/assets/characters/xiaogui.png');
  setStagePanel('');
  await say('红小鬼', '石子当子，泥地当盘。你要是输了，可不许说没吃饱。');
  const op = await gamesApi().play('mud-gomoku', { params: { decide: decideFor('泥地五子棋') } });
  showScreen('screen-stage');
  if (isAborted(op)) { return finishAborted(); }
  markLine('gomoku', { voluntary: true });
  let result;
  result = await reviewOrFixed(op, {
    scene: '泥地五子棋',
    callType: 'minigame_review',
    situation: op.summary || '两个小鬼下了一盘棋',
    state: publicState(),
    operation: { type: 'gomoku', ...op.detail },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || '');
  st().pushCampLog('五子棋', op.summary || '');
  await waitBtn('继续');
}

/** 雪山陡坡 · 拽住同伴（时机操作） */
export async function doGrab() {
  step('grab', 'minigame');
  showScreen('screen-stage');
  setStageBanner('陡坡上', sceneImage('/assets/scenes/snow_climb.jpg', '/assets/scenes/snow_pano.jpg'));
  setPortrait('你', '年轻战士', '你', '咬牙');
  setStagePanel('');
  await say('你', '他的手在滑。前面的雪是硬的，下面是空的。');
  const op = await gamesApi().play('snow-grab');
  showScreen('screen-stage');
  if (isAborted(op)) { return finishAborted(); }
  let result;
  result = await reviewOrFixed(op, {
    scene: '雪山·拽住同伴',
    callType: 'minigame_review',
    situation: op.summary || '在陡坡上拉住同伴',
    state: publicState(),
    operation: { type: 'grab', ...op.detail },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || result.scene_text || '');
  st().pushCampLog('陡坡', op.summary || '');
  await waitBtn('继续');
  await afterJudge(result, '风雪中的手', 'h_xueshan');
}

/**
 * 于都河 · 夜搭浮桥（第一幕的开场玩法，接在原来的「浮桥」抉择位上）。
 * 玩法自己判断"搭满即渡"，模型只做一句复盘——`operation.type='pontoon'` 供服务端换 schema 用。
 */
export async function doPontoonNight() {
  step('pontoon', 'minigame');
  showScreen('screen-stage');
  setStageBanner('于都河 · 夜渡', sceneImage('/assets/scenes/depart_bridge.jpg', '/assets/scenes/depart_pano.jpg'));
  setPortrait('你', '年轻战士', '你', '沉着');
  setStagePanel('');
  await say('你', '门板只有这些。往哪一段投，天亮前就得定下来。');
  const op = await gamesApi().play('pontoon-night');
  showScreen('screen-stage');
  if (isAborted(op)) { return finishAborted(); }
  const result = await reviewOrFixed(op, {
    scene: '于都河·夜搭浮桥',
    callType: 'minigame_review',
    situation: op.summary || '夜里搭浮桥，把队伍送过河',
    state: publicState(),
    operation: { type: 'pontoon', ...op.detail },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || result.scene_text || '');
  st().pushCampLog('浮桥', op.summary || '');
  await waitBtn('继续');
  await afterJudge(result, '门板与浮桥', 'h_depart');
}

/**
 * 湘江东岸 · 收拢（第一幕湘江的新玩法：八刻的时间账——搜一处 / 渡一趟）。
 * 位置按 [`HANDOFF-RALLY.md`](../../docs/minigames/逐支交接包/HANDOFF-RALLY.md) §七：
 * 新增一个 `kind:"rally"` 的热点，**不动** `escort`（那支是"护送伤员"，与这一支是两个位置）。
 */
export async function doRallyRiver() {
  step('rally', 'minigame');
  showScreen('screen-stage');
  setStageBanner('湘江东岸 · 收拢', sceneImage('/assets/scenes/xiangjiang_wreck.jpg', '/assets/scenes/xiangjiang_pano.jpg'));
  setPortrait('你', '年轻战士', '你', '沉着');
  setStagePanel('');
  await say('你', '渡口还开着。东岸还有人——搜一处，还是渡一趟，天亮之前只够选八次。');
  const op = await gamesApi().play('rally-river');
  showScreen('screen-stage');
  if (isAborted(op)) { return finishAborted(); }
  const result = await reviewOrFixed(op, {
    scene: '湘江·东岸收拢',
    callType: 'minigame_review',
    situation: op.summary || '天亮之前，把东岸的人接回来',
    state: publicState(),
    operation: { type: 'rally', ...op.detail },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || result.scene_text || '');
  st().pushCampLog('收拢', op.summary || '');
  await waitBtn('继续');
  await afterJudge(result, '天亮之前', 'h_xiangjiang');
}

/** 会宁 · 数一数熟面孔（读关系与牺牲名单） */
export async function doRoster() {
  showScreen('screen-stage');
  setStageBanner('会宁 · 数一数熟面孔', sceneImage('/assets/scenes/huining_crowd.jpg', '/assets/scenes/huining_pano.jpg'));
  setPortrait('你', '年轻战士', '你', '平静');
  setStagePanel('<p class="hint">队伍汇合了，人山人海。你在人群里找那些熟悉的脸。</p>');
  await say('你', '（你在数。有些位置，怎么数都空着。）');
  let r = null;
  try {
    // 这一处**没有玩法板**（会宁清点是纯叙事），所以没有 op 可复盘：直接走 act_review。
    // 早先这里照抄了隔壁收拢那一段的 `reviewOrFixed(op, …)`，而 op 在本函数根本不存在 →
    // 一点就 ReferenceError，被下面的 catch 变成「清点失败」toast（功能永久坏）。
    r = await callAI({
      scene: '会宁·数一数熟面孔',
      callType: 'act_review',
      situation: '会师了，清点这一路还认得出来的人',
      state: publicState(),
      extraContext:
        `关系：${COMPANIONS.map((c) => `${c.name}${S[`好感_${c.name}`] ?? 40}`).join('、')}`
        + `；没能跟上的人：${(S.losses || []).map((l) => l.who).join('、') || '无'}`,
    });
    const box = $('stage-panel');
    // 这里原先用 mg-title + 手写 style 的 paper-dim：那是"给暗底用的纸色"，落在浅墨纸卷上看不清（批五修）
    box.innerHTML = `<h3 class="blk-title sm">${escapeHtml(r.title || '这一路')}</h3>`
      + (r.lines || []).map((l) => `<p class="blk-body">${escapeHtml(l)}</p>`).join('');
    await say('叙事', (r.lines || []).join(' '));
    st().pushCampLog('会师', (r.lines || [])[0] || '');
  } catch (err) {
    toast('清点失败：' + err.message);
  }
  await waitBtn('继续');
}

export async function doFishing(act, forced) {
  step('fishing', 'minigame');
  showScreen('screen-stage');
  // 弯针 → 咬钩起竿（与报名信息一致：先做钩，再钓鱼）
  setStageBanner('金色的鱼钩 · 弯针', '/assets/scenes/pond_close.jpg');
  setPortrait('老班长', '炊事班长', '班', '专注', '/assets/characters/laoban.png');
  setStagePanel('');
  await say('老班长', '鱼钩是缝衣针弯的。手上稳着点，别掰断。');
  const hookOp = await gamesApi().play('bendhook');
  showScreen('screen-stage');
  // 弯针中途放弃：整段钓鱼结束，不再强拉进起竿
  if (isAborted(hookOp)) { return finishAborted(); }

  setStageBanner('金色的鱼钩 · 起竿', '/assets/scenes/pond_close.jpg');
  await say('老班长', '漂相看真了再起竿。晃是假的，沉才是口。', 'laoban_hook');
  const op = await gamesApi().play('goldenhook');
  showScreen('screen-stage');
  if (isAborted(op)) { return finishAborted(); }
  st().remember('fishingBest', Math.max(S.fishingBest || 0, op.score));
  markLine('fishing', { voluntary: !forced });
  let result;
  result = await reviewOrFixed(op, {
    scene: '钓鱼·咬钩起竿',
    callType: 'minigame_review',
    situation: '钓鱼小游戏结束',
    operation: { type: 'fishing', ...op },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || '');
  st().pushCampLog('钓鱼', result.narrative || '');
  await waitBtn('继续');
  await afterJudge(result, '金色的鱼钩', 'h_fishhook');
  if (!forced) markDone(act.id, 'fishing');
  // 钓鱼后连带的分汤要一起登记，否则强制链里会再结算一次（同一锅汤结算两遍）
  if (forced || S.day >= (act.apDays || 1)) {
    await doSoup();
    markDone(act.id, 'soup');
  }
}

/** 飞夺泸定桥：横版过桥（第一次跌落由战友拉住，体力 −10） */
export async function doLuding(act) {
  step('luding', 'minigame');
  showScreen('screen-stage');
  setStageBanner('飞夺泸定桥', sceneImage('/assets/scenes/luding_bridge.jpg', '/assets/scenes/luding_pano.jpg'));
  kernel.emit('scene:enter', { name: 'luding' });        // 泸定桥：急流 + 该章的 BGM
  showNpc('突击队长', { role: '红四团', mood: '决绝' });
  setStagePanel('');
  await say('突击队长', '桥板被人抽了，铁索还在。跟着我，别往下看。');
  const op = await gamesApi().play('luding-chain');
  showScreen('screen-stage');
  if (isAborted(op)) { return finishAborted(); }
  st().remember('ludingResult', op.detail || null);
  // 战友拉住的那一下，先落到状态里再交给模型写后果
  if (op.detail?.retry) st().applyEffects({ 体力: -10 });
  let result;
  result = await reviewOrFixed(op, {
    scene: `${act.title}·飞夺泸定桥`,
    callType: 'minigame_review',
    situation: op.summary || '突击队过桥',
    state: publicState(),
    operation: { type: 'luding', ...op.detail },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || result.scene_text || '');
  st().pushCampLog('泸定桥', op.summary || '');
  await waitBtn('继续');
  await afterJudge(result, '飞夺泸定桥', 'h_luding');
}

export async function doSoup() {
  step('soup', 'choice');
  showScreen('screen-stage');
  setStageBanner('煮粥分汤', '/assets/scenes/pond_close.jpg');
  setPortrait('老班长', '炊事班长', '班', '沉默', '/assets/characters/laoban.png');
  setStagePanel('<p class="hint">锅里只有几条小鱼和草根。</p><div class="choices" id="soup-opts"></div>');
  await say('老班长', '汤要分匀。伤员先喝，我们再看锅底。', 'laoban_soup');
  const soupOpts = [
    { label: '稠的全给伤员，自己喝清汤', icon: '汤' },
    { label: '全班平分', icon: '分' },
    { label: '只给病号', icon: '病' },
    { label: '自己先盛一碗', icon: '己' },
  ];
  const choice = (await askChoice($('soup-opts'), soupOpts)).label;
  logShare(choice);
  let result;
  result = await callAI({
    scene: '煮粥分汤',
    callType: 'share_judge',
    situation: `分配：${choice}`,
    state: publicState(),
    options: [choice],
    operation: { type: 'soup', choice },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || '');
  await waitBtn('继续');
  await afterJudge(result, '金色的鱼钩', 'h_fishhook');
}

export async function doShare(h = {}) {
  step('share', 'choice');
  showScreen('screen-stage');
  setStageBanner('分一口粮', '/assets/scenes/night_fire.jpg');
  // 热点带 npc 就立这个人（如"岸边伤员"），否则立玩家自己
  if (h.npc) showNpc(h.npc, { role: h.sub });
  else setPortrait('你', '年轻战士', '你', '平静');
  setStagePanel('<div class="choice-row" id="share-opts"></div>');
  const shareOpts = ['全给伤员', '全班平分，自己少一点', '先紧着小鬼和卫生员', '自己留大半'];
  const choice = (await askChoice($('share-opts'), shareOpts.map((label) => ({ label })), {
    extraOf: () => '',
  })).label;
  logShare(choice);
  let result;
  result = await callAI({
    scene: '分享口粮',
    callType: 'share_judge',
    situation: `玩家选择：${choice}`,
    state: publicState(),
    options: [choice],
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || '');
  st().pushCampLog('分享', result.narrative || choice);
  await waitBtn('继续');
  await afterJudge(result, '行军中的分享', 'h_share');
}
