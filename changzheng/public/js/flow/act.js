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
  toast, escapeHtml, typeText, showOverlay, hideOverlay, wipe,
} from '../ui.js';
import { askChoice, choiceButton, markAction, waitContinue, setStepState } from '../step.js';
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
import { CHOICE_SETS, REPEATABLE_HOTSPOTS } from './tables.js';
import { doFishing, doSchool, doCandy, doSentry, doGomoku, doGrab, doRoster, doLuding, doSoup, doShare } from './games-flow.js';
import { runQuiz } from './quiz.js';
import { runNightChoice, nightContext } from './night.js';
import { runFailure, runEnding } from './end.js';

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }


// ─── run ───
export async function startRun(mode = 'study') {
  st().start(mode);          // 新开一局（state 模块负责广播 + 存档）
  setTopbar(true);
  toast(mode === 'march' ? '行军模式：资源与抉择都可能真的带不走一些人' : '研学模式：不会失去战友', 3200);
  if (mode === 'quick') toast('快速演示：每幕只跑主玩法与对决', 3200);
  // 序章（电影化，见 modules/cinema）：黑场题字 → 路线图。快速模式只留题字一拍——
  // 它按定义要在 18 分钟内走完五幕，不能被序章吃掉时间。
  await cinemaApi()?.play(mode === 'quick' ? 'prologue-quick' : 'prologue-open');
  // 快速模式按定义要短，跳过开场设定；标准/行军模式走一次出身与出发前一问
  if (mode !== 'quick') {
    await runOrigin();
    // 告别：出身与出发前一问之后、进营地之前（序章下半场，两拍空镜 + 母亲/旁白各一句预录）
    await cinemaApi()?.play('prologue-farewell');
  }
  await runActIntro();
}

export function resumeRun(saved) {
  st().resume(saved);
  setTopbar(true);
  renderJourney();
  $('ai-count').textContent = String(S.aiCount || 0);
  const act = currentActDef();
  if (!act) {
    startRun(S.mode || 'study');
    return;
  }
  toast(`接着上一局：${act.title} · 第 ${S.day || 1} 日`, 3200);
  enterCampDay(act, S.day || 1);
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

export async function runActIntro() {
  const act = currentActDef();
  if (!act) return runEnding();
  if ($('act-tag')) $('act-tag').textContent = `${act.title} · ${act.subtitle}`;
  await runCutscene([
    { img: act.pano, text: `${act.date}。${act.subtitle}——${act.theme}。` },
    { img: sceneImage(act.cutAlt, act.pano), text: '营地在暮色里安顿下来。光点在呼吸，走近一处，把事做完。' },
  ]);
  if (act.prelude) await runPrelude(act);
  if (S.mode === 'quick') return runQuickAct(act);
  enterCampDay(act, 1);
}

export async function runCutscene(frames) {
  step('cutscene', 'cutscene');
  showScreen('screen-cutscene');
  wipe($('screen-cutscene'));     // 换幕抹擦：一层墨色横扫而过，动画结束自删
  const stage = $('cut-stage');
  const cap = $('cut-caption');
  const nextBtn = $('btn-cut-next');
  const skipBtn = $('btn-cut-skip');
  const screen = $('screen-cutscene');
  let skipped = false;
  let waitClick = null;
  const onClick = (e) => {
    if (e && e.target === skipBtn) return;
    if (waitClick) {
      const r = waitClick;
      waitClick = null;
      r();
    }
  };
  const waitUser = () => new Promise((r) => { waitClick = r; });
  nextBtn.onclick = onClick;
  skipBtn.onclick = () => { skipped = true; onClick(); };
  markAction(nextBtn, 'continue');
  markAction(skipBtn, 'skip');
  screen.onclick = onClick;

  for (let i = 0; i < frames.length && !skipped; i++) {
    const step = frames[i];
    stage.style.backgroundImage = `url('${step.img}')`;
    cap.textContent = '';
    nextBtn.textContent = i < frames.length - 1 ? '下一句 ▸' : '进入 ▸';
    let finishedTyping = false;
    typeText(cap, step.text, 24).then(() => { finishedTyping = true; });
    await waitUser();
    if (skipped) break;
    if (!finishedTyping) {
      cap.textContent = step.text;
      await waitUser();
    }
  }
  nextBtn.onclick = null;
  skipBtn.onclick = null;
  screen.onclick = null;
  // 过场结束必须摘掉契约标记：这些按钮是静态 DOM，留着会让"当前可交互项"判断出错
  delete nextBtn.dataset.action;
  delete skipBtn.dataset.action;
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

/** 快速模式：跳过营地日，只跑「一次关键交谈 + 主玩法 + 对决」 */
export async function runQuickAct(act) {
  st().enterDay({ day: 1, ap: 1, maxAp: 1 });
  renderJourney();
  const talkHotspot = (dayScene(act, 1).hotspots || []).find((h) => h.kind === 'talk');
  if (talkHotspot) {
    // 快速模式常在 finishAct 的锁内被调用：内部流转交给 withLock 的 from:'flow' 处理，不用手工解锁
    await withLock(() => doTalk(act, talkHotspot), { from: 'flow', label: '快速演示' });
  }
  await runForcedChain(act);
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
      if (fid === 'fishing') { await doFishing(act, true); markDone(act.id, 'fishing'); }
      else if (fid === 'soup') { await doSoup(); markDone(act.id, 'soup'); }
      else if (fid === 'candy') { await doCandy(); markDone(act.id, 'candy'); }
      else if (fid === 'sentry') { await doSentry(); markDone(act.id, 'sentry'); }
      else if (fid === 'path') { await runPathOnImage(); markDone(act.id, 'path'); }
      else if (fid === 'luding') { await doLuding(act); markDone(act.id, 'luding'); }
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

export async function finishAct(act) {
  st().pushLog(act.id, act.title);
  // 幕间 AI 总评
  try {
    const review = await callAI({
      scene: `幕间总评·${act.title}`,
      callType: 'act_review',
      situation: `玩家完成 ${act.title}，行动：${(S.行动日志 || []).join('、') || '—'}，对决 ${S.quiz.human}:${S.quiz.ai}`,
      state: publicState(),
      extraContext: `幕记录：${JSON.stringify(S.actLog)}`,
    });
    if (review?.lines?.length) {
      toast(review.title || '本幕小结', 2800);
      st().pushCampLog('总评', review.lines[0]);
    }
  } catch { /* 非阻塞 */ }

  // 第四幕幕末：篝火深夜（模型生成互斥抉择，一局一次）
  if (act.id === 'act4') await runNightChoice(act);

  st().set('actIndex', (S.actIndex || 0) + 1, '进入下一幕');
  renderJourney();
  // 幕间压力结算：粮荒 + 成败判定
  if (await settlePressure(act)) return;
  const order = getActsData().order || [];
  if (S.actIndex >= order.length) {
    await runEnding();
  } else {
    const next = getActsData().acts[order[S.actIndex]];
    await marchTransition('前往 ' + next.title);
    await runActIntro();
  }
}

/** 成败与粮荒结算：返回 true 表示已进入失败流程 */
export async function settlePressure(act) {
  if (!hasS()) return false;
  // 幕间粮荒
  const drain = st().starvation();
  if (drain > 0) {
    st().pushCampLog('粮荒', `断粮，体力 −${drain}`);
    toast(`断粮：体力 −${drain}`, 2600);
  }
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

export function enterCampDay(act, day) {
  step(`${act.id}:camp:${day}`, 'camp');
  st().enterDay({ day, ap: apPerDay(act), maxAp: apPerDay(act) });   // 新的一天：休息收益重置
  const scene = dayScene(act, day);
  showScreen('screen-camp');
  $('pano-img').style.backgroundImage = `url('${sceneImage(scene.alt, scene.pano)}')`;
  $('act-title').textContent = scene.label ? `${act.title} · ${scene.label}` : act.title;
  $('day-num').textContent = String(day);
  $('day-max').textContent = String(act.apDays || 1);
  $('camp-hint').textContent = '用光照亮他们。点余烬，走进他的一夜。';
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
}

export async function fireSceneGen(act) {
  try {
    // 后台调用（quiet）：结果只用来填营地提示那一行，失败静默；预算/账目照样走模块
    const r = await callAI({
      scene: `${act.title}·进入营地`,
      callType: 'scene_gen',
      situation: `第 ${S.day} 日，体力${S.体力} 粮食${S.粮食} 士气${S.士气} 信念${S.信念}`,
      state: publicState(),
      extraContext: act.theme,
    }, { quiet: true });
    if (r?.atmosphere) {
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

export function renderHotspots(act, hotspots) {
  const box = $('hotspots');
  box.innerHTML = '';
  const list = hotspots || dayScene(act, S?.day || 1).hotspots;
  list.forEach((h) => {
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
    b.innerHTML = `
      <span class="ember"></span>
      <span class="hs-card">
        <span class="hs-label">${h.label}</span>
        <span class="hs-sub">${spent ? '已看过' : apOut ? '暮色已尽' : (h.sub || '')}</span>
      </span>`;
    b.onclick = () => onHotspot(act, h);
    box.appendChild(b);
  });
}

/** 这个热点是否已经做过（走与 HOTSPOT_HANDLERS 相同的 action||id 口径） */
export function hotspotSpent(act, h) {
  if (!h || h.kind === 'march' || REPEATABLE_HOTSPOTS.has(h.kind)) return false;
  return isDone(act.id, h.action || h.id);
}

export async function onHotspot(act, h) {
  // 忙不忙由流程锁说了算（锁被占时 withLock 会广播 resource:blocked，由 shell 模块提示）
  // 做过一次的热点不再重复结算（不扣行动点、不重复调模型）
  if (hotspotSpent(act, h)) {
    toast('这里已经看过了', 1600);
    return;
  }
  kernel.emit('sfx:play', { name: 'click' });
  if (h.kind === 'march') {
    return withLock(async () => {
      if (S.ap > 0 && S.day < (act.apDays || 1)) {
        if (!confirm(`还有 ${S.ap} 点暮色未用，确定进入下一日？`)) return;
        await marchTransition('新的一日');
        enterCampDay(act, S.day + 1);
        return;
      }
      if (S.day < (act.apDays || 1)) {
        await marchTransition('新的一日');
        enterCampDay(act, S.day + 1);
        return;
      }
      await marchTransition('离开 ' + act.title);
      await runForcedChain(act);              // 同一条流程内：runForcedChain 自己知道要不要占锁
    }, { from: 'user', label: '启程' });
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
    if (handler) await handler(act, h);
    // 热点与幕末强制链是同一段内容的两个入口：在营地做过的，强制链不再重播。
    // 键优先取 action（与 forced 里的 id 对齐），没有 action 就用热点 id。
    const doneKey = h.action || h.id;
    if (doneKey) markDone(act.id, doneKey);
    // 立刻按新状态重画热点：热点用一次就作废，但 DOM 若不重画就会停在"看着还能点"的样子——
    // 点下去只弹一句「这里已经看过了」，界面对不上状态（自动化会卡在这颗热点上死循环，2026-09-13 实锤）。
    renderHotspots(act, dayScene(act, S.day).hotspots);
    showScreen('screen-camp');
    const ds = dayScene(act, S.day);
    $('pano-img').style.backgroundImage = `url('${sceneImage(ds.alt, ds.pano)}')`;
    updateMarchButton();
    updateDusk();
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
      await withLock(async () => {
        st().spendAp(1, f.label);
        renderHotspots(act, dayScene(act, S.day).hotspots);
        updateMarchButton();
        updateDusk();
        if (f.action === 'talk') await doTalk(act, { npc: '老班长' });
        else await doShare();
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
  talkPending = false;
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
  const quick = ['前面的路怎么走？', '你为什么来当红军？', '我想家了。'];
  const qbox = $('talk-quick');
  quick.forEach((q, i) => {
    const b = choiceButton({ label: q, index: i, action: 'talk-quick' });
    b.onclick = () => sendTalk(npcName, q);
    qbox.appendChild(b);
  });
  const send = () => {
    const v = $('talk-input').value.trim();
    if (v) sendTalk(npcName, v);
  };
  $('talk-send').onclick = send;
  $('talk-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  await new Promise((resolve) => { $('talk-end').onclick = resolve; });
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
    st().pushCampLog('休息', '再歇也缓不过来多少了。');
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
  // 深度调用：选项倾向预告（类 Reigns 卡牌预览）。后台调用（quiet）——玩家在读选项，
  // 不该顶一个「思考中」；失败静默，选项照常可点。
  let hints = {};
  try {
    const hr = await callAI({
      scene: `${act.title}·${cs.title}`,
      callType: 'choice_hint',
      situation: '为选项生成倾向预告',
      state: publicState(),
      options: cs.options.map((o) => o.label),
    }, { quiet: true });
    (hr.hints || []).forEach((h) => { if (h?.label) hints[h.label] = h; });
  } catch { /* 静默 */ }

  const choice = (await askChoice($('ch-opts'), cs.options, {
    extraOf: (o) => {
      const h = hints[o.label];
      const trend = h?.trend ? `<em class="trend">${escapeHtml(h.trend)}</em>` : '';
      // 风险标签优先用作者标注（决定实际后果），模型给的只作补充——
      // 否则会出现"界面显示低风险、判定却按高风险减员"的不一致
      const risk = o.risk || h?.risk;
      const riskChip = risk ? `<em class="risk r-${risk}">${risk === 'high' ? '高' : risk === 'mid' ? '中' : '低'}风险</em>` : '';
      return `${trend}${riskChip}`;
    },
  })).label;
  logChoice(act, choice, hints[choice]?.trend || '');
  // 行军模式：减员由「作者标注的风险 + 当前资源」决定（见 state.js 的 resolveLoss），不可逆
  if (S.mode === 'march') {
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
  roster: () => doRoster(),
  choice: async (act, h) => {
    await doChoice(act, h.action);
  },
};
