/**
 * flow/games-flow —— **玩法流程**：把"开一局玩法 → 交给模型复盘 → 走回响"串起来的那几段。
 *
 * 与 modules/games 的分工（批 5 定的边界，别混）：
 *   modules/games  负责**怎么把玩法摆上板屏**（题名/数值签/契约/清理），玩法本身是插件；
 *   本文件负责**玩完之后怎么办**（调哪个模型、记什么状态、点亮哪条附身线、弹不弹回响）。
 * 所以这里出现 callAI / afterJudge / markLine 是正常的，出现板屏 DOM 就不正常（那是宿主的事）。
 */
import { $, showScreen, setStageBanner, setStagePanel, say } from '../ui.js';
import { waitContinue } from '../step.js';
import { kernel } from '../kernel/index.js';
import { S, st, gamesApi, callAI, step, waitBtn, publicState, markLine, markDone } from './kit.js';
import { sceneImage, showNpc } from './view.js';
import { afterJudge } from './echo.js';

export async function doSchool() {
  step('school', 'minigame');
  showScreen('screen-stage');
  setStageBanner('夜校识字', '/assets/scenes/school_close.jpg');
  showNpc('文化教员', { role: '夜校', mood: '耐心' });
  setStagePanel('');                                  // 玩法不在纸卷里，正文区留空
  await say('文化教员', '跟着念。认得一个字，就能传给下一个人。', 'jiaoyuan_school');
  const op = await gamesApi().play('school');
  showScreen('screen-stage');                         // 结算回到对白屏：人物 + 叙事 + 继续
  st().remember('tonightPassword', op.detail?.password || '瑞金');
  markLine('school');
  let result;
  result = await callAI({
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

/** 红小鬼 · 分糖：三颗糖，AI 逐颗判定 */
export async function doCandy() {
  step('candy', 'minigame');
  showScreen('screen-stage');
  setStageBanner('分糖', sceneImage('/assets/scenes/sugar_close.jpg', '/assets/scenes/camp_pano.jpg'));
  setPortrait('红小鬼', '16岁小战士', '鬼', '倔强', '/assets/characters/xiaogui.png');
  setStagePanel('');
  await say('红小鬼', '我兜里有三颗糖。你说，给谁？');
  const op = await gamesApi().play('candy');
  showScreen('screen-stage');
  st().remember('sugarPlan', op.detail || null);
  markLine('candy');
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

/** 哨兵 · 夜岗：五信号判断，夜校口令在此生效 */
export async function doSentry() {
  step('sentry', 'minigame');
  showScreen('screen-stage');
  setStageBanner('夜岗', sceneImage('/assets/scenes/sentry_night.jpg', '/assets/scenes/camp_pano.jpg'));
  setPortrait('哨兵', '夜哨', '哨', '警觉');
  setStagePanel('');
  await say('哨兵', '后半夜归你。听不清就再听一遍，别急着开枪。');
  const op = await gamesApi().play('sentry', { params: { password: S.tonightPassword } });
  showScreen('screen-stage');
  st().remember('sentryScore', op.score);
  markLine('sentry');
  let result;
  result = await callAI({
    scene: '夜岗·哨位',
    callType: 'minigame_review',
    situation:
      `五个信号处置 ${op.detail.hits}/${op.detail.total}`
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
  const op = await gamesApi().play('gomoku');
  showScreen('screen-stage');
  markLine('gomoku');
  let result;
  result = await callAI({
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
  const op = await gamesApi().play('grab');
  showScreen('screen-stage');
  let result;
  result = await callAI({
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

/** 会宁 · 数一数熟面孔（读关系与牺牲名单） */
export async function doRoster() {
  showScreen('screen-stage');
  setStageBanner('会宁 · 数一数熟面孔', sceneImage('/assets/scenes/huining_crowd.jpg', '/assets/scenes/huining_pano.jpg'));
  setPortrait('你', '年轻战士', '你', '平静');
  setStagePanel('<p class="hint">队伍汇合了，人山人海。你在人群里找那些熟悉的脸。</p>');
  await say('你', '（你在数。有些位置，怎么数都空着。）');
  let r = null;
  try {
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
  await gamesApi().play('needle');
  showScreen('screen-stage');

  setStageBanner('金色的鱼钩 · 起竿', '/assets/scenes/pond_close.jpg');
  await say('老班长', '漂相看真了再起竿。晃是假的，沉才是口。', 'laoban_hook');
  const op = await gamesApi().play('fishing');
  showScreen('screen-stage');
  st().remember('fishingBest', Math.max(S.fishingBest || 0, op.score));
  markLine('fishing');
  let result;
  result = await callAI({
    scene: '钓鱼·咬钩起竿',
    callType: 'minigame_review',
    situation: '钓鱼小游戏结束',
    state: publicState(),
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
  const op = await gamesApi().play('luding');
  showScreen('screen-stage');
  st().remember('ludingResult', op.detail || null);
  // 战友拉住的那一下，先落到状态里再交给模型写后果
  if (op.detail?.retry) st().applyEffects({ 体力: -10 });
  let result;
  result = await callAI({
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
