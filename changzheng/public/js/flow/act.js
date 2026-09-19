/**
 * flow/act —— **一幕的推进**：营地日 → 热点派发 → 抉择/玩法 → 启程 → 幕间结算 → 下一幕。
 *
 * 从 main.js 搬出来（批 7 二·5）。**为什么营地与幕推进合在一个文件**：它们本来就互相咬——
 * 营地里的「启程」要调幕推进（finishAct / runForcedChain），推进完又回营地（enterCampDay）。
 * 硬拆必然成环；合成一块等于承认"一幕的推进"本来就是一个模块边界。
 *
 * 依赖方向（单向，别反向）：act → games-flow / quiz / night / end / echo / tables / view / kit。
 * 组合根（main.js）只把它的入口接到按钮与 dev 钩子上，不干涉内部流程。
 */
import {
  $, showScreen, setTopbar, setStageBanner, setStagePanel, say, setPortrait, flashEffects,
  toast, escapeHtml, showOverlay, hideOverlay,
} from '../ui.js';
import { askChoice, choiceButton, markAction, waitContinue, setStepState, askConfirm, isAutoPlay, setAutoPlay } from '../step.js';
import { kernel } from '../kernel/index.js';
import { dayScene, apPerDay } from '../state.js';
import { ORIGINS, ORIGIN_QUIZ, applyOrigin, applyOriginQuiz, findOrigin } from '../origin.js';
import { PATH_ZONES, COMPANIONS } from '../data.js';
import {
  S, hasS, st, callAI, step, waitBtn, publicState, currentActDef, cinemaApi,
  logChoice, logShare, markLine, markDone, isDone, LINE_NAMES, LINES_TOTAL,
  getActsData, withLock,
} from './kit.js';
import { sceneImage, showNpc, renderJourney, updateDusk, bindLantern } from './view.js';
import { afterJudge, showEcho } from './echo.js';
import { CHOICE_SETS, REPEATABLE_HOTSPOTS, talkQuickFor } from './tables.js';
import { doFishing, doSchool, doCandy, doSentry, doGomoku, doGrab, doRoster, doLuding, doSoup, doShare, doPontoonNight, doRallyRiver, doSkim, doWeave, doAntiphony, doCipher } from './games-flow.js';
import { runQuiz } from './quiz.js';
import { runNightChoice, nightContext } from './night.js';
import { runFailure, runEnding } from './end.js';

/** 行军类模式（含连贯/择点）：本地判据，避免 act↔modes 循环 import */
function modeIsMarchLike(mode) {
  const m = mode || (hasS() ? S.mode : '');
  return m === 'march' || m === 'march_auto' || m === 'auto' || m === 'select';
}
function modeIsAuto(mode) {
  const m = mode || (hasS() ? S.mode : '');
  return m === 'march_auto' || m === 'auto';
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }


// ─── run ───
/** 开局（三个模式按钮 + 答辩入口共用）。
 *
 *  整段包在流程锁里（`from:'user'`）：序章要演一两分钟，这期间按钮还挂在屏上——
 *  早先没有锁，双击「研学模式」就会起两局（第二局把第一局的序章顶掉、state 也被重开一次）。
 *  占不到锁时 withLock 会广播 `resource:blocked`（shell 提示"等一下"），并**直接返回**，
 *  所以重复触发是"点了没反应 + 一句提示"，而不是第二局。 */
export async function startRun(mode = 'march') {
  if (mode === 'auto' || mode === 'march_auto') {
    const { startAutoMode } = await import('./modes.js');
    return startAutoMode();
  }
  return withLock(async () => {
  import('./modes.js').then((m) => m.stopAutoAdvance()).catch(() => {});
  setAutoPlay(false);
  st().start('march');
  setTopbar(true);
  toast('行军模式：资源与抉择都可能真的带不走一些人', 3200);
  await cinemaApi()?.play('prologue-open', {
    ctx: { mapImg: sceneImage('/assets/scenes/map_route_deep.jpg', '/assets/scenes/map_route.jpg') },
  });
  await runOrigin();
  await cinemaApi()?.play('prologue-farewell');
  await runActIntro();
  }, { from: 'user', label: '开局' });
}

/**
 * 择点穿行入口已迁至 flow/modes.js（openSelectMode）。
 * 保留 jumpToAct 仅作内部/测试捷径：默认行军压力，跳到指定幕营地。
 */
export async function jumpToAct(mode = 'march', actId = 'act5') {
  return withLock(async () => {
    import('./modes.js').then((m) => m.stopAutoAdvance()).catch(() => {});
    setAutoPlay(false);
    st().start(mode === 'select' ? 'select' : 'march');
    setTopbar(true);
    const order = getActsData()?.order || [];
    let idx = order.indexOf(actId);
    if (idx < 0) idx = Math.max(0, order.length - 1);
    st().set('actIndex', idx, `跳到 ${actId}`);
    st().set('linesDone', ['fishing', 'candy', 'sentry', 'school', 'gomoku'], '跳幕预置');
    st().set('voluntaryLines', ['fishing', 'candy'], '跳幕预置');
    st().set('unlockedFacts', ['h_depart', 'h_xiangjiang', 'h_zunyi', 'h_luding', 'h_xueshan', 'h_huining'], '跳幕预置');
    renderJourney();
    toast(`已跳到：${currentActDef()?.title || actId}`, 2800);
    await cinemaApi()?.play('act-intro', {
      ctx: {
        act: currentActDef(),
        idx,
        prev: order[idx - 1] ? getActsData().acts[order[idx - 1]] : null,
        review: null,
        mapImg: sceneImage('/assets/scenes/map_route_deep.jpg', '/assets/scenes/map_route.jpg'),
      },
    });
    enterCampDay(currentActDef(), 1);
  }, { from: 'user', label: '跳幕' });
}

export function resumeRun(saved) {
  return withLock(async () => {
    st().resume(saved);
    setTopbar(true);
    renderJourney();
    $('ai-count').textContent = String(S.aiCount || 0);
    const act = currentActDef();
    if (!act) {
      // 存档过期/幕次越界：不要在锁内再调 startRun（会嵌套抢锁）
      toast('这份存档已经走完了，请重新开始一局', 3200);
      showScreen('screen-title');
      setTopbar(false);
      return;
    }
    toast(`接着上一局：${act.title} · 第 ${S.day || 1} 日`, 3200);
    enterCampDay(act, S.day || 1);
  }, { from: 'user', label: '续局' });
}

/** 交谈进行中标记：同一时刻只允许一场交谈（sendTalk / doTalk 共用） */
let talkPending = false;

/**
 * 开场设定：出身三选一 + 一道固定问答（本地题库，不调模型）。
 * 只影响起始五维，写入 S.origin / S.originQuiz，手记与终局关系面板会展示。
 */
export async function runOrigin() {
  step('origin', 'choice');
  showScreen('screen-stage');
  setStageBanner('你从哪里来', sceneImage('/assets/scenes/depart_crowd.jpg', ''));
  setPortrait('你', '年轻战士', '你', '平静');
  setStagePanel('<p class="hint">队伍就要出发了。先说说你自己——这一条只决定你的起点。</p>'
    + '<div class="choices" id="origin-opts"></div>');
  const picked = await askChoice($('origin-opts'), ORIGINS.map((o) => ({ label: o.label, sub: o.sub })));
  // 走 state 模块的 apply（而不是直接 applyOrigin(S, …)）：直接改不广播 state:change，
  // HUD 于是停在旧数字上——实测选完出身，存档体力 72→77 而界面还写着 72（2026-09-15 修）。
  // keys 用 effects 的键：HUD 的 PARTS 表按这些键决定重画哪几块。
  const wantOrigin = findOrigin(ORIGINS[picked.index]?.id);
  const { origin, changes } = st().apply(
    '出身',
    (s) => applyOrigin(s, wantOrigin?.id),
    ['出身', ...Object.keys(wantOrigin?.effects || {})],
  ) || {};
  if (!origin) return;                      // 理论上不会发生：选项由 ORIGINS 生成
  flashEffects(changes);
  st().pushCampLog('出发', `你是${origin.label}：${origin.sub}。`);
  logChoice({ title: '出发前' }, `出身：${origin.label}`, '设定');
  // 出发前一问：答对加信念，答错不扣（第一屏不给挫败感）
  step('origin:quiz', 'choice');
  setStagePanel(`<p class="hint">${escapeHtml(ORIGIN_QUIZ.question)}</p><div class="choices" id="origin-quiz"></div>`);
  const ans = await askChoice($('origin-quiz'), ORIGIN_QUIZ.options.map((label) => ({ label })));
  const quiz = st().apply(
    '开场问答',
    (s) => applyOriginQuiz(s, ans.index),
    ['originQuiz', ...Object.keys(ORIGIN_QUIZ.effects || {})],
  ) || {};
  if (quiz.right) flashEffects(quiz.changes);
  setStagePanel(`<p class="hint">${quiz.right ? '答对了。' : '记住了。'}${escapeHtml(ORIGIN_QUIZ.explain)}</p>`);
  st().pushCampLog('出发', `${quiz.right ? '答对' : '答错'}：${ORIGIN_QUIZ.explain}`);
  await waitContinue('进入于都河');
}

/**
 * 进入一幕：幕间过场（电影化，`modules/cinema`）→ 幕前引子 → 营地。
 * @param {{review?: object, prev?: object}} [incoming] 上一幕的幕间总评与那一幕本身
 *   （`finishAct` 传进来；第一幕没有"上一幕"，`act-intro` 编排会自己空转——序章已经演过题字与全程路线图）
 */
export async function runActIntro(incoming = {}) {
  const act = currentActDef();
  if (!act) return runEnding();
  if ($('act-tag')) $('act-tag').textContent = `${act.title} · ${act.subtitle}`;
  const order = getActsData()?.order || [];
  await cinemaApi()?.play('act-intro', {
    ctx: {
      act, idx: order.indexOf(act.id), prev: incoming.prev || null, review: incoming.review || null,
      // 路线图底图：第 2 轮的暗调新版（落盘即生效），没产出就用现成的 map_route
      mapImg: sceneImage('/assets/scenes/map_route_deep.jpg', '/assets/scenes/map_route.jpg'),
    },
  });
  if (act.prelude) await runPrelude(act);
  enterCampDay(act, 1);
}

export async function runPrelude(act) {
  step(`${act.id}:prelude`, 'choice');
  const pre = act.prelude;
  showScreen('screen-stage');
  setStageBanner(pre.title, sceneImage('/assets/scenes/snow_let_clothes.jpg', pre.pano));
  setPortrait('你', '年轻战士', '你', '风雪');
  setStagePanel('<p class="hint">雪线之上，有人发抖。你怎么选？</p><div class="choices" id="pre-opts"></div>');
  kernel.emit('voice:say', { text: '他接过外衣，没说谢。后来在你走不动时，递了水壶。', actorId: '叙事', voiceId: 'narr_snow' });
  const cs = CHOICE_SETS[pre.choice];
  const choice = (await askChoice($('pre-opts'), cs.options)).label;
  let result;
  result = await callAI({
    scene: `${act.title}·${cs.title}`,
    callType: cs.callType,
    situation: `玩家选择：${choice}`,
    state: publicState(),
    options: [choice],
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || result.scene_text || '');
  await waitBtn('继续');
  await afterJudge(result, cs.title, cs.factId);
}

/**
 * 快速模式：跳过营地日，只跑「一次关键交谈 + **一个**主玩法 + 对决」。
 * 不再跑完整 forced 链（act4 五节点会把演示拖到 20 分钟+，v0.3 P0-10）。
 */
export async function runQuickAct(act) {
  st().enterDay({ day: 1, ap: 1, maxAp: 1 });
  renderJourney();
  const talkHotspot = (dayScene(act, 1).hotspots || []).find((h) => h.kind === 'talk');
  if (talkHotspot) {
    await withLock(() => doTalk(act, talkHotspot), { from: 'flow', label: '快速演示' });
  }
  // 只跑 forced 的第一个节点（主玩法），其余节点留给标准模式
  const first = (act.forced || [])[0];
  await withLock(async () => {
    toast(`进入节点：${act.title}`);
    if (first && !isDone(act.id, first)) {
      if (first === 'fishing') await doFishing(act, true);
      else if (first === 'candy') await doCandy(true);
      else if (first === 'sentry') await doSentry(true);
      else if (first === 'path') await runPathOnImage();
      else if (first === 'luding') await doLuding(act);
      else if (first === 'pontoon') await doPontoonNight();
      else if (first === 'soup') await doSoup();
      else await doChoice(act, first);
      markDone(act.id, first);
    }
    if (act.quiz && !isDone(act.id, 'quiz')) {
      await runQuiz(act);
      markDone(act.id, 'quiz');
    }
    await finishAct(act, { quick: true });
  }, { from: 'flow', label: '快速演示' });
}

// ─── forced chain ───
export async function runForcedChain(act) {
  return withLock(async () => {
    toast(`进入节点：${act.title}`);
    const forced = act.forced || [];
    for (let i = 0; i < forced.length; i++) {
      const fid = forced[i];
      // 热点里已经做过的，不再重播
      if (isDone(act.id, fid)) {
        st().pushCampLog('系统', `${fid} 已完成，跳过。`);
        continue;
      }
      if (fid === 'fishing') { if (await doFishing(act, true) !== 'aborted') markDone(act.id, 'fishing'); }
      else if (fid === 'soup') { await doSoup(); markDone(act.id, 'soup'); }
      else if (fid === 'candy') { if (await doCandy(true) !== 'aborted') markDone(act.id, 'candy'); }
      else if (fid === 'sentry') { if (await doSentry(true) !== 'aborted') markDone(act.id, 'sentry'); }
      else if (fid === 'path') { await runPathOnImage(); markDone(act.id, 'path'); }
      else if (fid === 'luding') { if (await doLuding(act) !== 'aborted') markDone(act.id, 'luding'); }
      else if (fid === 'pontoon') { if (await doPontoonNight() !== 'aborted') markDone(act.id, 'pontoon'); }
      else { await doChoice(act, fid); markDone(act.id, fid); }
    }
    if (act.quiz && !isDone(act.id, 'quiz')) {
      await runQuiz(act);
      markDone(act.id, 'quiz');
    }
    await finishAct(act);
    // from:'flow'：这一棒既可能是玩家点「启程」进来的（那时锁已由入口占下），
    // 也可能是快速模式/幕末链里被嵌套调用（同一条流程）。两种情况都不该互相拒绝。
  }, { from: 'flow', label: '幕末流程' });
}

export async function finishAct(act, opts = {}) {
  st().pushLog(act.id, act.title);
  // 幕间 AI 总评（下面的幕间过场要拿它当回望字幕，所以提到 try 外面）
  let reviewNow = null;
  try {
    // quiet：仍真调 act_review（比赛要 API），但不弹「思考中」占住幕间过场
    const review = await callAI({
      scene: `幕间总评·${act.title}`,
      callType: 'act_review',
      situation: `玩家完成 ${act.title}，行动：${(S.行动日志 || []).join('、') || '—'}，对决 ${S.quiz.human}:${S.quiz.ai}`,
      state: publicState(),
      extraContext: `幕记录：${JSON.stringify(S.actLog)}`,
    }, { quiet: true });
    reviewNow = review || null;
    if (review?.lines?.length) {
      st().pushCampLog('总评', review.lines[0]);
      // 不再弹 toast：这两句会写进下一幕的幕间过场字幕（见 runActIntro 的 review 参数）——
      // 幕间的收束归电影化那一处管，别在营地屏上再飘一条气泡。
    }
  } catch { /* 非阻塞 */ }

  // 第四幕幕末：篝火深夜（快速模式跳过——演示时长优先，v0.3 P0-10）
  if (act.id === 'act4' && !opts.quick) await runNightChoice(act);

  st().set('actIndex', (S.actIndex || 0) + 1, '进入下一幕');
  renderJourney();
  // 幕间压力结算：粮荒 + 成败判定
  if (await settlePressure(act)) return;
  const order = getActsData().order || [];
  if (S.actIndex >= order.length) {
    await runEnding();
  } else {
    // 幕间过场由 cinema 演（回望上一幕 → 本幕空镜 → 本幕题字），
    // 原来那层 marchTransition 闪白交给拍子自己的 sfx 与题字，别两处各演一遍"下一幕到了"
    await runActIntro({ review: reviewNow, prev: act });
  }
}

/** 成败与粮荒结算：返回 true 表示已进入失败流程 */
export async function settlePressure(act) {
  if (!hasS()) return false;
  // 方案 A：行军类每过一幕先扣 1 口粮，再判断粮
  const burned = st().actFoodBurn ? st().actFoodBurn() : 0;
  if (burned > 0) {
    st().pushCampLog('口粮', `过幕消耗口粮 −${burned}，余 ${S.粮食}`);
    toast(`过幕口粮 −${burned}，余 ${S.粮食}`, 2400);
  }
  // 幕间粮荒（行军类统一 −8，见 state.applyStarvation）
  const drain = st().starvation();
  if (drain > 0) {
    st().pushCampLog('粮荒', `断粮，体力 −${drain}`);
    toast(`断粮：体力 −${drain}`, 2600);
  }
  updateCampGoal(act);
  const fail = st().failure();
  if (!fail) return false;
  st().remember('failure', fail);
  await runFailure(fail, act);
  return true;
}

export async function marchTransition(label) {
  kernel.emit('sfx:play', { name: 'march' });
  const flash = document.createElement('div');
  flash.className = 'march-flash';
  flash.innerHTML = `<span>${label || '启程'}</span>`;
  document.body.appendChild(flash);
  await wait(1100);
  flash.remove();
}

export async function runPathOnImage() {
  step('path', 'choice');
  showScreen('screen-path');
  kernel.emit('voice:say', { text: '前面岔开了三条路。你定。', actorId: '指导员', voiceId: 'zhiyuan_grass' });
  const choice = await new Promise((resolve) => renderPathZones($('path-zones'), resolve));
  showScreen('screen-stage');
  setStageBanner('过草地', '/assets/scenes/marsh.jpg');
  setPortrait('指导员', '连队指导员', '指', '严肃', '/assets/characters/zhiyuan.png');
  setStagePanel(`<p class="hint">你选了：${escapeHtml(choice.label)}</p>`);
  let result;
  result = await callAI({
    scene: '过草地·路线抉择',
    callType: 'branch_judge',
    situation: `玩家选择：${choice.label}`,
    state: publicState(),
    options: [choice.label],
    operation: { type: 'path', choice: choice.id, score: choice.score },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.scene_text || result.narrative || '');
  // 二次确认：字幕播完后仍要玩家点一下，再进史实回响（避免「字没读完就跳走」）
  await waitBtn('继续');
  await afterJudge(result, '过松潘草地', 'h_grassland');
}

/**
 * 把三个岔路点位画到图上（唯一实现：正式流程与逐页截图工具共用）。
 * 点位来自 data.js 的 PATH_ZONES，改坐标只需改那一处。
 * @param {HTMLElement} host 承载点位的容器
 * @param {(zone:object)=>void} onPick 玩家选定后回调
 */
export function renderPathZones(host, onPick) {
  host.innerHTML = '';
  PATH_ZONES.forEach((z, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'path-zone';
    b.dataset.choiceIndex = String(i);
    b.style.left = z.x + '%';
    b.style.top = z.y + '%';
    b.style.width = z.w + '%';
    b.style.height = z.h + '%';
    // 选区本身不铺底色（否则三块墨底把插画压死），标签单独坐在一小片墨纱上
    b.innerHTML = `<span class="pz-chip"><b>${z.label}</b><span>${z.sub}</span></span>`;
    b.onclick = () => onPick(z);
    host.appendChild(b);
  });
}

/** 目标 HUD 与氛围句分槽；方案 A 追加资源临界提示 */
export function updateCampGoal(act) {
  const goalEl = $('camp-goal');
  if (!goalEl) return;
  const a = act || currentActDef();
  if (!a) { goalEl.hidden = true; goalEl.textContent = ''; return; }
  const vol = (S.voluntaryLines || []).length;
  const need = 2;
  const goalBits = [];
  if (a.theme) goalBits.push(`本幕：${a.theme}`);
  if (a.id === 'act4') {
    goalBits.push(vol < need
      ? `篝火夜还需自愿点亮 ${need - vol} 条（钓鱼/分糖/夜岗/夜校/五子棋）`
      : '篝火夜已解锁——幕末会在火边议事');
  }
  const forcedLeft = (a.forced || []).filter((k) => !isDone(a.id, k)).map(String);
  if (forcedLeft.length) goalBits.push(`幕末待完成：${forcedLeft.join('、')}`);
  if (S.villageUnlocked) goalBits.push('老乡线已解锁');
  const warn = st().safetyText ? st().safetyText() : '';
  if (warn) goalBits.push(`⚠ ${warn}`);
  if (goalBits.length) {
    goalEl.hidden = false;
    goalEl.textContent = goalBits.join(' · ');
    // 临界资源：切朱红告警态（与 blk-stat.warn 同一套语义色）
    goalEl.classList.toggle('is-warn', !!warn);
  } else {
    goalEl.hidden = true;
    goalEl.textContent = '';
    goalEl.classList.remove('is-warn');
  }
}

export function enterCampDay(act, day) {
  step(`${act.id}:camp:${day}`, 'camp');
  st().enterDay({ day, ap: apPerDay(act), maxAp: apPerDay(act) });   // 新的一天：休息收益重置
  // 进幕就把"已经演过一遍"的点记成完成（acts.json 的 preDone）：序章已经演过与母亲告别，
  // 第1幕再点一次是重复内容。标记后它显示为「已看过」，不占行动力，也不算"没走过的点"。
  if (day === 1) for (const k of act.preDone || []) markDone(act.id, k);
  const scene = dayScene(act, day);
  showScreen('screen-camp');
  $('pano-img').style.backgroundImage = `url('${sceneImage(scene.alt, scene.pano)}')`;
  $('act-title').textContent = scene.label ? `${act.title} · ${scene.label}` : act.title;
  $('day-num').textContent = String(day);
  $('day-max').textContent = String(act.apDays || 1);
  $('camp-hint').textContent = '用光照亮他们。点余烬，走进他的一夜。';
  updateCampGoal(act);
  // 进幕事件：音频（场景表决定环境床与 BGM）、将来的过场/电影、HUD 都听它
  kernel.emit('flow:act-enter', { actId: act.id, day, label: scene.label });
  kernel.emit('sfx:play', { name: 'day' });
  renderHotspots(act, scene.hotspots);
  bindMarchButton(act);
  updateDusk();
  renderJourney();
  bindLantern();
  st().pushCampLog('系统', `${act.title} · 第 ${day} 日`);
  // 深度调用：进入营地时由模型写场景氛围
  fireSceneGen(act);
  bindCampNoteToggle();
  // 连贯行军：进幕后由 modes 排下一棒；会等语音/回响/流程空闲，不打断台词
  if (modeIsAuto()) {
    import('./modes.js').then((m) => m.scheduleAutoAdvance(act, 1000)).catch(() => {});
  }
}

/** 营地侧栏提示框：收起/展开（目标 + 氛围），避免挡住全景 */
function bindCampNoteToggle() {
  const btn = $('btn-camp-note-toggle');
  const box = $('camp-note');
  if (!btn || !box || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.onclick = () => {
    const collapsed = box.classList.toggle('collapsed');
    btn.textContent = collapsed ? '展开' : '收起';
  };
}

export async function fireSceneGen(act) {
  const dayAtCall = S.day;
  const actAtCall = act?.id;
  try {
    // 后台调用（quiet）：结果只用来填营地提示那一行，失败静默；预算/账目照样走模块
    const r = await callAI({
      scene: `${act.title}·进入营地`,
      callType: 'scene_gen',
      situation: `第 ${S.day} 日，体力${S.体力} 粮食${S.粮食} 士气${S.士气} 信念${S.信念}`,
      state: publicState(),
      extraContext: act.theme,
    }, { quiet: true });
    // 换日/换幕后丢弃旧文案：否则第 1 日的氛围句会压在第 2 日营地上
    if (S.day !== dayAtCall || currentActDef()?.id !== actAtCall) return;
    // 氛围只写 camp-hint；目标在 #camp-goal，不被模型句覆盖
    if (r?.atmosphere && $('camp-hint')) {
      $('camp-hint').textContent = r.atmosphere.slice(0, 80) + (r.atmosphere.length > 80 ? '…' : '');
      st().pushCampLog('场景', r.whisper || r.atmosphere.slice(0, 40));
    }
  } catch { /* 静默 */ }
}

export function bindMarchButton(act) {
  const btn = $('btn-march-fixed');
  if (!btn) return;
  markAction(btn, 'march');
  btn.onclick = () => onHotspot(act, { kind: 'march', label: '启程' });
  updateMarchButton();
}

export function updateMarchButton() {
  const btn = $('btn-march-fixed');
  if (!btn) return;
  if (kernel.resources.isHeld('flow')) {      // 忙不忙由流程锁说了算（不再看存档里的字段）
    btn.disabled = true;
    btn.classList.remove('urgent');
    btn.textContent = '…';
    return;
  }
  btn.disabled = false;
  if (S.ap <= 0) {
    btn.classList.add('urgent');
    btn.textContent = '天黑了 · 启程 ▸';
  } else {
    btn.classList.remove('urgent');
    btn.textContent = `启程 · 还剩 ${S.ap} 暮色 ▸`;
  }
}

/** 热点类型 → 牌子上的单字徽章：一眼看出"这个点是干啥的"（用户反馈：原来只有个红点，猜不出是什么） */
const HOTSPOT_BADGE = {
  march: '行', talk: '谈', choice: '择', rest: '歇', fire: '火',
  share: '分', path: '路', roster: '名',
  // 要动手的三类玩法：给具体字，比一个通用的"玩"更有信息
  pontoon: '桥', fishing: '鱼', gomoku: '棋', candy: '糖', sentry: '哨',
  grab: '坡', luding: '索', rally: '渡', school: '字',
};

export function renderHotspots(act, hotspots) {
  const box = $('hotspots');
  box.innerHTML = '';
  const list = hotspots || dayScene(act, S?.day || 1).hotspots;
  // 按 x **从左到右**渲染：玩家的读法就是从左上到右下，热点顺序得跟这条读法一致。
  // 原来直接按 JSON 里的书写顺序排，act1 的「东岸还有人」x=8 排在最后一个 ——
  // 看着像"先右后左"，跟图上位置对不上（用户反馈）。
  const sorted = [...list].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  sorted.forEach((h) => {
    const x = h.x ?? 0;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hotspot' + (h.kind === 'march' ? ' march' : '');
    b.style.left = h.x + '%';
    b.style.top = h.y + '%';
    markAction(b, h.kind === 'march' ? 'march' : 'hotspot');
    b.dataset.hotspot = h.kind || '';
    b.dataset.hotspotLabel = h.label || '';
    const apOut = S.ap <= 0 && h.kind !== 'march';
    const spent = hotspotSpent(act, h);
    b.dataset.hotspotState = spent ? 'done' : 'open';
    b.disabled = apOut || spent;
    // 靠右边的点，牌子挂到**左侧**：不然 x=90 那类点的牌子会顶出屏幕
    b.dataset.hsSide = x >= 78 ? 'left' : 'right';
    b.innerHTML = `
      <span class="ember"></span>
      <span class="hs-card">
        <span class="hs-head"><span class="hs-badge">${HOTSPOT_BADGE[h.kind] || '·'}</span><span class="hs-label">${h.label}</span></span>
        <span class="hs-sub">${spent ? '已看过' : apOut ? '暮色已尽' : (h.sub || '')}</span>
      </span>`;
    b.onclick = () => onHotspot(act, h);
    box.appendChild(b);
  });
  settleChips(box);
}

/**
 * 把压在一起的牌子错开：**先量再挪**，不是按顺序盲轮换。
 *
 * 为什么要有它：标签改成常显之后，窄屏上相邻两张牌子会叠住 —— 草地那天有 9 个点、
 * 彼此只差 8%（820 宽时相邻只隔 65px，而牌子宽 90–130px）。
 * 任何"按位置轮流上中下"的固定规则都会误伤（第一版就撞出了新的一对：
 * 篝火旁与背囊旁的 y 本来就不同，被轮流规则推到了一起），所以这里按**实测矩形**判定：
 * 后来者依次试 0/±32/±64/±96，
 * 挑第一个不与已放置的相交的位置。只挪牌子，火点（点击锚点）不动。
 */
function settleChips(box) {
  const els = [...box.querySelectorAll('.hotspot')];
  if (!els.length) return;
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const placed = [];
  for (const el of els) {
    let r = el.getBoundingClientRect();
    for (const dy of [0, -40, 40, -80, 80, -120, 120, -160, 160]) {
      if (dy) el.style.setProperty('--hs-dy', `${dy}px`);
      r = el.getBoundingClientRect();
      if (!placed.some((p) => hit(r, p))) break;
    }
    placed.push(r);
  }
}

/** 这个热点是否已经做过（走与 HOTSPOT_HANDLERS 相同的 action||id 口径） */
export function hotspotSpent(act, h) {
  if (!h || h.kind === 'march' || REPEATABLE_HOTSPOTS.has(h.kind)) return false;
  return isDone(act.id, h.action || h.id);
}

/**
 * 当前这一天里**还没走过的正经热点**（行军口、以及休息/篝火这类可重复的不算）。
 * 启程前拿它列清单：玩家该知道还有哪些地方没去，而不是走到收尾才发现少看了半幕。
 */
export function unfinishedPoints(act) {
  const list = dayScene(act, S?.day || 1).hotspots || [];
  return list.filter((h) => h.kind !== 'march'
    && !REPEATABLE_HOTSPOTS.has(h.kind)
    && !hotspotSpent(act, h));
}

/** 启程进行中：防止连点把多日/强制链叠跑（用户反馈「直接点启程会重复好几遍」） */
let marchBusy = false;

export async function onHotspot(act, h) {
  // 忙不忙由流程锁说了算（锁被占时 withLock 会广播 resource:blocked，由 shell 模块提示）
  // 做过一次的热点不再重复结算（不扣行动点、不重复调模型）
  if (hotspotSpent(act, h)) {
    toast('这里已经看过了', 1600);
    return;
  }
  kernel.emit('sfx:play', { name: 'click' });
  if (h.kind === 'march') {
    if (marchBusy || kernel.resources.isHeld('flow')) {
      toast('正在启程…', 1200);
      return;
    }
    marchBusy = true;
    try {
      return await withLock(async () => {
        // 走之前先把"没走过的点"摆出来：过去只报剩余行动点，玩家不点完也能一路走到下一幕，
        // 到收尾才发现少看了半幕（用户反馈"点数没过完就进下一幕"）。
        // 这里**默认留在营地**（是＝回去看看），要走得明确选"仍然启程"——不是硬拦，是别让人误走。
        const left = unfinishedPoints(act);
        if (S.ap > 0) {
          const parts = [];
          if (left.length) parts.push(`还有 ${left.length} 处没走过：${left.map((x) => x.label).join('、')}`);
          parts.push(`还有 ${S.ap} 点暮色未用`);
          const stay = await askConfirm(`${parts.join('；')}。`, {
            yes: left.length ? '回去看看' : '再逛逛',
            no: '仍然启程',
            yesSub: left.length ? '把没走过的走完' : '回到营地',
            noSub: left.length ? `直接走，落下 ${left.length} 处` : `浪费 ${S.ap} 点暮色`,
          });
          if (stay) return;
        } else if (left.length) {
          // 暮色已尽：这时候**不能**再给"回去看看"——热点全灰着（apOut），回去也点不了，
          // 等于把人骗回一个死营地（用户反馈过这个坑）。只如实报一句还差哪些，然后照常启程。
          toast(`暮色已尽，还有 ${left.length} 处没走过：${left.map((x) => x.label).join('、')}`, 3800);
        }
        if (S.day < (act.apDays || 1)) {
          await marchTransition('新的一日');
          enterCampDay(act, S.day + 1);
          return;
        }
        await marchTransition('离开 ' + act.title);
        await runForcedChain(act);
      }, { from: 'user', label: '启程' });
    } finally {
      marchBusy = false;
    }
  }
  if (S.ap <= 0) {
    toast('天黑了 → 点右下「启程」');
    return;
  }

  if (h.kind === 'fire') {
    showOverlay('screen-fire');
    renderFireMenu(act);
    return;
  }

  return withLock(async () => {
    st().spendAp(1, h.label);
    renderHotspots(act, dayScene(act, S.day).hotspots);
    updateMarchButton();
    updateDusk();

    const handler = HOTSPOT_HANDLERS[h.kind];
    const outcome = handler ? await handler(act, h) : null;
    // 中途放弃：不 markDone（热点保持可再点），附身线也不亮
    if (outcome !== 'aborted') {
      const doneKey = h.action || h.id;
      if (doneKey) markDone(act.id, doneKey);
    }
    // 立刻按新状态重画热点：热点用一次就作废，但 DOM 若不重画就会停在"看着还能点"的样子——
    // 点下去只弹一句「这里已经看过了」，界面对不上状态（自动化会卡在这颗热点上死循环，2026-09-13 实锤）。
    renderHotspots(act, dayScene(act, S.day).hotspots);
    showScreen('screen-camp');
    const ds = dayScene(act, S.day);
    $('pano-img').style.backgroundImage = `url('${sceneImage(ds.alt, ds.pano)}')`;
    updateMarchButton();
    updateDusk();
    updateCampGoal(act);
    if (S.ap <= 0) {
      st().pushCampLog('系统', '天黑了，点右下「启程」。');
      toast('天黑了 → 启程', 3200);
    }
  });
}

export function renderFireMenu(act) {
  const box = $('fire-opts');
  box.innerHTML = '';
  const items = [
    { label: '找人说话', sub: '改好感', action: 'talk' },
    { label: '分一口粮', sub: '士气信念', action: 'share' },
  ];
  items.forEach((f) => {
    const b = choiceButton({
      label: f.label, sub: f.sub, icon: String.fromCharCode(65 + items.indexOf(f)), index: items.indexOf(f),
    });
    b.disabled = S.ap <= 0;
    b.onclick = async () => {
      hideOverlay('screen-fire');
      if (S.ap <= 0 || kernel.resources.isHeld('flow')) { showScreen('screen-camp'); return; }
      // 当日 talk/share 各限 1 次（防刷好感；v0.3 P2-5）
      if (!st().trySpendFire(f.action === 'talk' ? 'talk' : 'share')) {
        toast(f.action === 'talk' ? '今天已经聊过了' : '今天已经分过口粮了');
        showScreen('screen-camp');
        return;
      }
      await withLock(async () => {
        st().spendAp(1, f.label);
        renderHotspots(act, dayScene(act, S.day).hotspots);
        updateMarchButton();
        updateDusk();
        let ok = true;
        try {
          if (f.action === 'talk') await doTalk(act, { npc: '老班长' });
          else await doShare();
        } catch (err) {
          ok = false;
          toast(`篝火这一下没做成：${err?.message || err}`);
        }
        // 模型/流程失败时退回 1 点暮色：先扣再玩会让玩家白丢行动点（比赛仍真调，只是失败可回滚）
        if (!ok && hasS()) {
          st().apply('篝火失败回滚AP', (s) => { s.ap = (s.ap || 0) + 1; }, ['ap']);
          updateMarchButton();
          updateDusk();
        }
        showScreen('screen-camp');
        const ds2 = dayScene(act, S.day);
        $('pano-img').style.backgroundImage = `url('${sceneImage(ds2.alt, ds2.pano)}')`;
      }, { from: 'user', label: '篝火菜单' });
    };
    box.appendChild(b);
  });
}

export async function doTalk(act, h) {
  step(`${act.id}:talk`, 'talk');
  // 不在这里清 talkPending：上一场交谈的回复可能还在飞，清掉就等于允许两路并发，
  // 而且它 finally 里的那次清空会把新的一场也放行（同一时刻只允许一场交谈的口径）。
  const npcName = h.npc || '同伴';
  showScreen('screen-stage');
  // 热点可以指定自己的近景（acts.json 的 img 字段），没写就用本幕全景
  setStageBanner(`${act.title} · 交谈`, sceneImage(h.img, act.pano));
  showNpc(npcName, { role: h.sub });
  setStagePanel(`
    <div class="chat-row">
      <input id="talk-input" placeholder="对${npcName}说点什么…" autocomplete="off" />
      <button type="button" class="btn primary" id="talk-send" data-action="talk-send">说</button>
    </div>
    <div class="choices" style="margin-top:10px" id="talk-quick"></div>
    <button type="button" class="btn ghost sm" id="talk-end" data-action="talk-end" style="margin-top:14px">结束交谈</button>
  `);
  await say(npcName, npcName.includes('老班') ? '来了。坐下，别踩了水花。'
    : npcName.includes('指导') ? '坐。有话慢慢说。'
    : npcName.includes('小鬼') ? '你也睡不着？火边还有位置。'
    : npcName.includes('卫生') ? '先按住伤口。有我在。'
    : npcName.includes('老乡') ? '路我认得，跟紧些。'
    : '（他看了你一眼。）',
    npcName.includes('老班') ? 'laoban_hello'
    : npcName.includes('指导') ? 'zhiyuan_hello'
    : npcName.includes('小鬼') ? 'xiaogui_hello'
    : npcName.includes('母亲') ? 'mother_bye'
    : npcName.includes('船工') ? 'boatman_night'
    : npcName.includes('老兵') ? 'veteran_xj'
    : npcName.includes('向导') ? 'guide_lazikou'
    : npcName.includes('卫生') ? 'weisheng_care'
    : undefined);
  // 连贯行军：只自动进入任务点；交谈/语音由玩家自己收尾，不自动关
  void isAutoPlay;
  // 顺口一问按人物给（表在 flow/tables.js）：母亲说的和船工说的不该是同一套话（用户反馈）
  const quick = talkQuickFor(npcName, act.id);
  const qbox = $('talk-quick');
  const sendBtn = $('talk-send');
  const input = $('talk-input');
  const setTalkBusy = (busy) => {
    if (sendBtn) {
      sendBtn.disabled = busy;
      sendBtn.textContent = busy ? '…' : '说';
    }
    qbox?.querySelectorAll('button').forEach((b) => { b.disabled = busy; });
    if (input) input.placeholder = busy ? '等对方说完…' : `对${npcName}说点什么…`;
  };
  quick.forEach((q, i) => {
    const b = choiceButton({ label: q, index: i, action: 'talk-quick' });
    b.onclick = () => { if (!talkPending) sendTalk(npcName, q); };
    qbox.appendChild(b);
  });
  const send = () => {
    if (talkPending) return;
    const v = input.value.trim();
    if (v) sendTalk(npcName, v);
  };
  sendBtn.onclick = send;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  // 问候打完后自动聚焦：玩家可以直接打字，不必先点输入框（v0.3 P0-6）
  input.focus();
  // 轮询同步发送键忙态（sendTalk 会改 talkPending；这里不引新事件，简单可靠）
  const busyTick = setInterval(() => setTalkBusy(talkPending), 200);
  try {
    await new Promise((resolve) => {
      $('talk-end').onclick = async () => { await settleTalks(); resolve(); };
    });
  } finally {
    clearInterval(busyTick);
  }
}

/** 等交谈里"正在飞的那一句"回来（无人应答时最多等 timeoutMs，绝不把界面挂住） */
async function settleTalks(timeoutMs = 8000) {
  const t0 = Date.now();
  while (talkPending && Date.now() - t0 < timeoutMs) await wait(80);
}

export async function sendTalk(npcName, text) {
  // 上一句还没回来就不接第二句：避免狂点/回车刷出重复调用，日志也更好审计
  if (talkPending) return;
  talkPending = true;
  try {
    const result = await callAI({
      scene: `交谈·${npcName}`,
      callType: 'npc_chat',
      situation: `玩家说：${text}`,
      state: publicState(),
    });
    const key = npcName.includes('老班') ? '好感_老班长'
      : npcName.includes('指导') ? '好感_指导员'
      : npcName.includes('小鬼') ? '好感_红小鬼'
      : npcName.includes('卫生') ? '好感_卫生员' : '好感_老乡';
    const effects = { 士气: 1 };
    if (typeof result.affinity_delta === 'number') effects[key] = result.affinity_delta;
    const changes = st().applyEffects(effects);
    await say(npcName, result.reply || '……');
    if (result.mood) $('portrait-mood').textContent = result.mood;
    flashEffects(changes);
    st().pushCampLog('交谈', `${npcName}：${(result.reply || '').slice(0, 30)}…`);
  } catch (err) {
    toast('对话失败：' + err.message);
  } finally {
    talkPending = false;
  }
}

export async function doRest() {
  step('rest', 'minigame');
  showScreen('screen-stage');
  setStageBanner('休息', '/assets/scenes/camp_evening.jpg');
  setPortrait('你', '年轻战士', '你', '疲惫');
  setStagePanel('<p class="hint">靠着背囊眯一会儿。</p>');
  // 体力恢复不交给模型：实测模型很少给正体力，一局净 −152 必然归零。
  // 这里的保底让"休息"成为可控手段；同一天反复休息收益递减，避免刷体力。
  st().bumpRest();
  const heal = S.restCount === 1 ? 10 : S.restCount === 2 ? 5 : 0;
  if (heal) {
    flashEffects(st().applyEffects({ 体力: heal }));
    st().pushCampLog('休息', `缓过来一点（体力 +${heal}）`);
  } else {
    // 第三次起不再烧真调：收益已是 0，再调一次模型只是浪费额度（v0.3 P2-4）
    st().pushCampLog('休息', '再歇也缓不过来多少了。');
    setStagePanel('<p class="hint">靠着背囊眯一会儿。再歇也缓不过来多少了。</p>');
    await waitBtn('继续');
    return;
  }
  let result;
  result = await callAI({
    scene: '营地休息',
    callType: 'minigame_review',
    situation: '休息',
    state: publicState(),
    operation: { type: 'rest' },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || '你歇了一会儿。');
  st().pushCampLog('休息', result.narrative || '');
  await waitBtn('继续');
}



export async function doChoice(act, actionId) {
  step(`${act.id}:${actionId}`, 'choice');
  const cs = CHOICE_SETS[actionId];
  if (!cs) return;
  showScreen('screen-stage');
  setStageBanner(cs.title, sceneImage(cs.img, act.pano));
  // 抉择集写 npc 就先立当事人（如雪山上的掉队战士），让代价看得见
  if (cs.npc) showNpc(cs.npc, { role: cs.npcRole, mood: '决断' });
  else setPortrait('你', act.title, '你', '决断');
  setStagePanel(`<div class="choice-row" id="ch-opts"></div>`);
  // 选项**立刻**可点（作者标注的风险先上）；倾向预告后台补，到了再往按钮里塞。
  // 原先 await 完 choice_hint 才 askChoice：quiet 不弹思考中，玩家对着空选项区干等最长 ~50s。
  let hints = {};
  const hintPromise = callAI({
    scene: `${act.title}·${cs.title}`,
    callType: 'choice_hint',
    situation: '为选项生成倾向预告',
    state: publicState(),
    options: cs.options.map((o) => o.label),
  }, { quiet: true }).then((hr) => {
    (hr?.hints || []).forEach((h) => { if (h?.label) hints[h.label] = h; });
    // 把 trend 补进已经渲染好的选项（ch-extra）
    document.querySelectorAll('#ch-opts .blk-choice').forEach((btn) => {
      const label = btn.querySelector('b')?.textContent || '';
      const h = hints[label];
      if (!h?.trend) return;
      const extra = btn.querySelector('.ch-extra') || (() => {
        const em = document.createElement('span');
        em.className = 'ch-extra';
        btn.querySelector('.ch-text')?.appendChild(em);
        return em;
      })();
      if (!extra.querySelector('.trend')) {
        const t = document.createElement('em');
        t.className = 'trend';
        t.textContent = h.trend;
        extra.prepend(t);
      }
    });
  }).catch(() => { /* 静默：没有预告也能选 */ });

  const choice = (await askChoice($('ch-opts'), cs.options, {
    extraOf: (o) => {
      const h = hints[o.label];
      const trend = h?.trend ? `<em class="trend">${escapeHtml(h.trend)}</em>` : '';
      // 风险标签优先用作者标注（决定实际后果），模型给的只作补充——
      // 否则会出现"界面显示低风险、判定却按高风险减员"的不一致
      const risk = o.risk || h?.risk;
      const riskChip = risk ? `<em class="risk r-${risk}">${risk === 'high' ? '高' : risk === 'mid' ? '中' : '低'}风险</em>` : '';
      // 方案 A：士气过低时在选项旁标「队伍疲乏」（不直接改结局，只做反馈）
      const mor = Number(S.士气);
      const tired = Number.isFinite(mor) && mor <= 15
        ? '<em class="risk r-mid">队伍疲乏</em>' : '';
      return `${trend}${riskChip}${tired}`;
    },
  })).label;
  await hintPromise.catch(() => {});
  logChoice(act, choice, hints[choice]?.trend || '');
  // 行军类模式（行军 / 连贯 / 择点）：减员由「作者标注的风险 + 当前资源」决定
  if (modeIsMarchLike()) {
    const loss = st().lossFor(cs, cs.options.findIndex((o) => o.label === choice));
    // 写状态一律走 state 模块的动作：批 4 之后 `S` 只是只读别名，这里曾漏改成裸调 addLoss，
    // 结果一进行军模式的高风险抉择就抛 ReferenceError、流程原地卡死（qa:loss 抓到的）
    if (loss && st().addLoss(loss.who, loss.reason)) {
      showLossToast(loss.who, loss.reason);
      st().pushCampLog('损失', `${loss.who} 没能跟上`);
    }
  }
  let result;
  result = await callAI({
    scene: `${act.title}·${cs.title}`,
    callType: cs.callType,
    situation: `玩家选择：${choice}`,
    state: publicState(),
    options: [choice],
    operation: cs.operationType ? { type: cs.operationType, choice } : { choice },
  });
  st().applyEffects(result.effects);
  await say('叙事', result.narrative || result.scene_text || '');
  st().pushCampLog(cs.title, choice);
  // 二次确认：读完裁决再进回响（用户反馈：字没输完就跳屏不行）
  await waitBtn('继续');
  await afterJudge(result, cs.title, cs.factId);
}

export function showLossToast(who, reason) {
  const el = document.createElement('div');
  el.className = 'loss-toast';
  el.innerHTML = `<div class="lw">${escapeHtml(who)} · 掉队</div><div class="lr">${escapeHtml(reason || '')}</div>`;
  document.body.appendChild(el);
  kernel.emit('sfx:play', { name: 'wrong' });
  setTimeout(() => el.remove(), 3400);
}

/** 热点种类 → 处理函数（新增玩法只加一行，不动主流程） */
export const HOTSPOT_HANDLERS = {
  talk: (act, h) => doTalk(act, h),
  fishing: (act) => doFishing(act, false),
  school: () => doSchool(),
  rest: () => doRest(),
  share: (act, h) => doShare(h),
  candy: () => doCandy(),
  sentry: () => doSentry(),
  gomoku: () => doGomoku(),
  grab: () => doGrab(),
  // 2026-09-18 吸收的四支（第一/二/三/四幕各一个任务点）
  skim: () => doSkim(),
  weave: () => doWeave(),
  antiphony: () => doAntiphony(),
  cipher: () => doCipher(),
  pontoon: () => doPontoonNight(),
  // 泸定桥：2026-09-17 起是**热点**。原来挂在 act3 的 forced 里，等于走到幕末自己弹出来 ——
  // 玩家一个点都没点，就被塞了一整支玩法（用户反馈"为什么在幕切换时冒出这个游戏"）。
  luding: (act) => doLuding(act),
  rally: () => doRallyRiver(),
  roster: () => doRoster(),
  // 草地三条岔路：从 forced 挪进营地热点（v0.3 P0-11），仍是图上点选
  path: () => runPathOnImage(),
  choice: async (act, h) => {
    await doChoice(act, h.action);
  },
};
