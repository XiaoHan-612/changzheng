import { CHAPTER, COMPANIONS, CUTSCENE, HOTSPOTS, FIRE_SUB, PATH_ZONES } from './data.js';
import { createState, applyEffects, unlockFact, saveState } from './state.js';
import { decide, fetchConfig, fetchLogs, fetchFacts } from './ai-client.js';
import { runFishing, runNightSchool } from './minigames.js';
import * as UI from './ui.js';

const { $, showScreen, setTopbar, renderStats, renderAp, renderCompanions,
  appendCampLog, toast, showThinking, say, setPortrait, setStageBanner, setStagePanel,
  flashEffects, setAiMode, bumpAiCount, typeText, escapeHtml, renderLogs, renderFacts,
  showOverlay, hideOverlay } = UI;

let S = null;
let allFacts = {};
let config = { mockMode: true, model: 'glm-5.1' };
let echoResolve = null;

// ─── boot ───
async function boot() {
  config = await fetchConfig();
  setAiMode(config);
  allFacts = (await fetchFacts()) || {};
  bindChrome();
  bindTitle();
  bindEcho();
  showScreen('screen-title');
  setTopbar(false);
}

function bindChrome() {
  $('btn-logs').onclick = async () => {
    showOverlay('screen-logs');
    const data = await fetchLogs();
    renderLogs(data.logs || []);
  };
  $('btn-logs-close').onclick = () => hideOverlay('screen-logs');
  $('btn-logs-refresh').onclick = async () => {
    const data = await fetchLogs();
    renderLogs(data.logs || []);
  };
  $('btn-facts').onclick = () => {
    showOverlay('screen-facts');
    renderFacts(allFacts, S?.unlockedFacts || []);
  };
  $('btn-facts-close').onclick = () => hideOverlay('screen-facts');
  $('btn-end-logs').onclick = () => $('btn-logs').click();
  $('btn-end-facts').onclick = () => $('btn-facts').click();
  $('btn-restart').onclick = () => location.reload();
  $('btn-fire-back').onclick = () => {
    hideOverlay('screen-fire');
    showScreen('screen-camp');
  };
}

function bindTitle() {
  $('btn-start').onclick = () => startRun();
  $('btn-how').onclick = () => showOverlay('screen-how');
  $('btn-how-back').onclick = () => hideOverlay('screen-how');
}

function bindEcho() {
  $('btn-echo-ok').onclick = () => {
    hideOverlay('screen-echo');
    if (echoResolve) {
      const r = echoResolve;
      echoResolve = null;
      r();
    }
  };
}

// ─── 史实回响：操作完成后立即对照科普 ───
function showEcho({ title, play, real, fic }) {
  return new Promise((resolve) => {
    $('echo-title').textContent = title || '刚刚发生的事';
    $('echo-play').textContent = play || '';
    $('echo-real').textContent = real || '';
    $('echo-fic').textContent = fic ? `虚构边界：${fic}` : '';
    showOverlay('screen-echo');
    echoResolve = resolve;
  });
}

function factFor(id) {
  return allFacts?.[id] || allFacts?.facts?.[id] || null;
}

/** 根据 factId + 本次叙事，弹史实回响 */
async function echoFromResult(result, fallbackTitle) {
  const fid = result.factId || result.fact_id;
  if (fid) unlockFact(S, fid);
  const fact = factFor(fid);
  const play = result.narrative || result.scene_text || result.reply || result.choice || '';
  if (!fact && !play) return;
  await showEcho({
    title: fact?.title || fallbackTitle || '史实回响',
    play: play || '（你刚完成一次抉择）',
    real: fact?.real || '（本条史实将在档案中补全）',
    fic: fact?.fiction || '',
  });
  // 等待确认后继续
  await new Promise((r) => {
    // bindEcho already resolves; if already closed somehow
    if (!document.getElementById('screen-echo').classList.contains('hidden')) {
      // still open, wait for click — resolve wired in bindEcho
      echoResolve = r;
    } else r();
  });
}

// 简化：showEcho 返回 Promise，echoFromResult 直接 await 即可
async function afterJudge(result, fallbackTitle) {
  const fid = result.factId || result.fact_id;
  if (fid) unlockFact(S, fid);
  const fact = factFor(fid);
  const play = result.narrative || result.scene_text || result.reply || '';
  if (!fact && !play) return;
  await showEcho({
    title: fact?.title || fallbackTitle || '史实回响',
    play: play || '（你刚完成一次操作）',
    real: fact?.real || '走过草地的部队普遍面临补给断绝；战友之间让出食物是大量回忆录中的共同记忆。',
    fic: fact?.fiction || '本关卡的具体操作为互动重演。',
  });
}

// ─── run start ───
async function startRun() {
  S = createState();
  saveState(S);
  setTopbar(true);
  renderStats(S);
  renderAp(S);
  renderCompanions(S);
  S.aiCount = 0;
  $('ai-count').textContent = '0';
  await runCutscene();
  enterCampDay(1);
}

async function runCutscene() {
  showScreen('screen-cutscene');
  const stage = $('cut-stage');
  const cap = $('cut-caption');
  const nextBtn = $('btn-cut-next');
  const skipBtn = $('btn-cut-skip');
  const screen = $('screen-cutscene');
  let skipped = false;
  let waitClick = null;

  const onClick = (e) => {
    if (e && (e.target === skipBtn)) return;
    if (waitClick) {
      const r = waitClick;
      waitClick = null;
      r();
    }
  };
  const waitUser = () => new Promise((r) => { waitClick = r; });

  nextBtn.onclick = onClick;
  skipBtn.onclick = () => { skipped = true; onClick(); };
  screen.onclick = onClick;

  for (let i = 0; i < CUTSCENE.length && !skipped; i++) {
    const step = CUTSCENE[i];
    stage.style.backgroundImage = `url('${step.img}')`;
    cap.textContent = '';
    nextBtn.textContent = i < CUTSCENE.length - 1 ? '下一句 ▸' : '进入营地 ▸';

    let finishedTyping = false;
    typeText(cap, step.text, 26).then(() => { finishedTyping = true; });

    // 第一次点击：若打字未完则补全文；若已完则进入下一张
    await waitUser();
    if (skipped) break;
    if (!finishedTyping) {
      cap.textContent = step.text;
      finishedTyping = true;
      await waitUser();
    }
  }

  nextBtn.onclick = null;
  skipBtn.onclick = null;
  screen.onclick = null;
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── camp panorama ───
function enterCampDay(day) {
  S.day = day;
  S.ap = S.maxAp;
  S.phase = 'camp';
  S.行动日志 = [];
  showScreen('screen-camp');
  $('camp-hint').textContent =
    day === 1
      ? '第一天：口粮还剩一点。光点在呼吸——走近一处，替他把事做完。'
      : '第二天：明天就要走出草地。把该做的事做完，或点东边小路继续行军。';
  renderStats(S);
  renderAp(S);
  renderCompanions(S);
  renderHotspots();
  appendCampLog(S, '系统', `营地日 ${day} 开始，行动点 ${S.ap}`);
}

function renderHotspots() {
  const box = $('hotspots');
  box.innerHTML = '';
  const doneCount = S.行动日志.length;
  HOTSPOTS.forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hotspot' + (h.kind === 'march' ? ' march' : '');
    b.style.left = h.x + '%';
    b.style.top = h.y + '%';
    const apOut = S.ap <= 0 && h.kind !== 'march';
    b.disabled = apOut;
    b.innerHTML = `<span class="pulse"></span><span class="hs-label">${h.label}</span><span class="hs-sub">${apOut ? '行动点已尽' : h.sub}</span>`;
    b.onclick = () => onHotspot(h);
    box.appendChild(b);
  });
  void doneCount;
}

async function onHotspot(h) {
  if (h.kind === 'march') {
    page.onceDialogAccept();
    if (S.ap > 0 && S.day < CHAPTER.totalDays) {
      if (!confirm(`还有 ${S.ap} 点行动未用，确定继续行军？`)) return;
    }
    if (S.day < CHAPTER.totalDays) enterCampDay(S.day + 1);
    else startForcedChain();
    return;
  }
  if (S.ap <= 0) {
    toast('行动点已用尽，点东边小路继续行军');
    return;
  }

  if (h.kind === 'hub') {
    showOverlay('screen-fire');
    renderFireMenu();
    return;
  }

  S.ap -= 1;
  S.行动日志.push(h.label);
  renderAp(S);
  renderHotspots();

  if (h.action === 'fishing') await doFishing(true);
  else if (h.action === 'school') await doSchool(true);
  else if (h.action === 'rest') await doRest();

  renderStats(S);
  renderCompanions(S);
  saveState(S);
  showScreen('screen-camp');
  if (S.ap <= 0) appendCampLog(S, '系统', '今日行动点用尽。点东边小路行军。');
}

function renderFireMenu() {
  const box = $('fire-opts');
  box.innerHTML = '';
  FIRE_SUB.forEach((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn choice';
    b.innerHTML = `<b>${f.label}</b><span>${f.sub}</span>`;
    b.disabled = S.ap <= 0;
    b.onclick = async () => {
      hideOverlay('screen-fire');
      if (S.ap <= 0) { toast('行动点已用尽'); showScreen('screen-camp'); return; }
      S.ap -= 1;
      S.行动日志.push(f.label);
      renderAp(S);
      renderHotspots();
      if (f.action === 'talk') await doTalk();
      else if (f.action === 'share') await doShare();
      renderStats(S);
      renderCompanions(S);
      saveState(S);
      showScreen('screen-camp');
    };
    box.appendChild(b);
  });
}

// ─── talk ───
async function doTalk() {
  showScreen('screen-stage');
  setStageBanner('交谈 · 火边', '/assets/scenes/night_fire.jpg');
  setStagePanel(`<p class="hint">想找谁说话？</p><div class="choices" id="talk-who"></div>`);
  const who = await new Promise((resolve) => {
    const box = $('talk-who');
    COMPANIONS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn choice';
      b.innerHTML = `<b>${c.name}</b><span>${c.role}</span>`;
      b.onclick = () => resolve(c);
      box.appendChild(b);
    });
  });

  setPortrait(who.name, who.role, who.ava, '平静', who.img);
  setStagePanel(`
    <div class="chat-row">
      <input id="talk-input" placeholder="对${who.name}说点什么…" autocomplete="off" />
      <button type="button" class="btn primary" id="talk-send">说</button>
    </div>
    <div class="choices" style="margin-top:10px" id="talk-quick"></div>
    <button type="button" class="btn ghost sm" id="talk-end" style="margin-top:14px">结束交谈</button>
  `);
  await say(who.name, '（火光跳了一下。他看了你一眼，没急着说话。）');

  const quick = ['前面的路怎么走？', '你为什么总把吃的让给别人？', '我想家了。'];
  const qbox = $('talk-quick');
  quick.forEach((q) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn choice';
    b.innerHTML = `<b>${q}</b>`;
    b.onclick = () => sendTalk(who, q);
    qbox.appendChild(b);
  });
  const send = () => {
    const v = $('talk-input').value.trim();
    if (v) sendTalk(who, v);
  };
  $('talk-send').onclick = send;
  $('talk-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

  await new Promise((resolve) => { $('talk-end').onclick = resolve; });
}

async function sendTalk(who, text) {
  showThinking(true);
  try {
    const result = await decide({
      scene: `交谈·${who.name}`,
      callType: 'npc_chat',
      situation: `玩家说：${text}`,
      state: publicState(),
    });
    bumpAiCount(S);
    const key = `好感_${who.name}`;
    const effects = {};
    if (typeof result.affinity_delta === 'number') effects[key] = result.affinity_delta;
    effects.士气 = 1;
    const changes = applyEffects(S, effects);
    await say(who.name, result.reply || '……');
    if (result.mood) $('portrait-mood').textContent = result.mood;
    flashEffects(changes);
    appendCampLog(S, '交谈', `${who.name}：${(result.reply || '').slice(0, 36)}…`);
    renderStats(S);
    renderCompanions(S);
  } catch (err) {
    toast('对话失败：' + err.message);
  } finally {
    showThinking(false);
  }
}

// ─── rest / share ───
async function doRest() {
  showScreen('screen-stage');
  setStageBanner('靠着背囊歇一会儿', '/assets/scenes/camp_evening.jpg');
  setPortrait('你', '年轻战士', '你', '疲惫');
  setStagePanel('<p class="hint">风把火堆吹低了一点。</p>');
  showThinking(true);
  let result;
  try {
    result = await decide({
      scene: '营地休息',
      callType: 'minigame_review',
      situation: '玩家选择休息恢复体力',
      state: publicState(),
      operation: { type: 'rest' },
    });
    bumpAiCount(S);
    const changes = applyEffects(S, result.effects);
    await say('叙事', result.narrative || '你歇了一会儿。');
    flashEffects(changes);
    appendCampLog(S, '休息', result.narrative || '');
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge({ ...result, factId: result.factId || 'h_grassland' }, '草地行军');
}

async function doShare() {
  showScreen('screen-stage');
  setStageBanner('分一口粮', '/assets/scenes/night_fire.jpg');
  setPortrait('你', '年轻战士', '你', '平静');
  setStagePanel('<p class="hint">把口粮分给谁？</p><div class="choices" id="share-opts"></div>');
  const choice = await new Promise((resolve) => {
    const opts = ['全给伤员', '全班平分，自己少一点', '先紧着红小鬼和卫生员', '自己留大半'];
    const box = $('share-opts');
    opts.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn choice';
      b.innerHTML = `<b>${o}</b>`;
      b.onclick = () => resolve(o);
      box.appendChild(b);
    });
  });

  showThinking(true);
  let result;
  try {
    result = await decide({
      scene: '分享口粮',
      callType: 'share_judge',
      situation: `玩家选择：${choice}`,
      state: publicState(),
      options: [choice],
    });
    bumpAiCount(S);
    const changes = applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
    flashEffects(changes);
    appendCampLog(S, '分享', result.narrative || choice);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge({ ...result, factId: result.factId || 'h_share' }, '行军中的分享');
}

// ─── fishing ───
async function doFishing(fromCamp) {
  showScreen('screen-stage');
  setStageBanner('金色的鱼钩 · 咬钩起竿', '/assets/scenes/pond_close.jpg');
  setPortrait('老班长', '炊事班长', '班', '专注', '/assets/characters/laoban.png');
  setStagePanel('');
  await say('老班长', '漂相看真了再起竿。晃是假的，沉才是口。');

  setStagePanel('<div id="fish-host"></div>');
  const op = await runFishing($('fish-host'));
  S.fishingBest = Math.max(S.fishingBest, op.score);

  showThinking(true);
  let result;
  try {
    result = await decide({
      scene: '钓鱼·咬钩起竿',
      callType: 'minigame_review',
      situation: '玩家完成起竿小游戏',
      state: publicState(),
      operation: { type: 'fishing', ...op },
    });
    bumpAiCount(S);
    const changes = applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
    flashEffects(changes);
    appendCampLog(S, '钓鱼', result.narrative || `得分 ${(op.score * 100) | 0}`);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge({ ...result, factId: result.factId || 'h_fishhook' }, '金色的鱼钩');

  if (!fromCamp || S.day >= CHAPTER.totalDays) {
    await doSoup();
  }
}

async function doSoup() {
  showScreen('screen-stage');
  setStageBanner('煮粥分汤', '/assets/scenes/pond_close.jpg');
  setPortrait('老班长', '炊事班长', '班', '沉默', '/assets/characters/laoban.png');
  setStagePanel('<p class="hint">锅里只有几条小鱼和草根。怎么分？</p><div class="choices" id="soup-opts"></div>');
  const choice = await new Promise((resolve) => {
    const opts = ['稠的全给伤员，自己喝清汤', '全班平分', '只给病号，别人忍着', '自己先盛一碗'];
    const box = $('soup-opts');
    opts.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn choice';
      b.innerHTML = `<b>${o}</b>`;
      b.onclick = () => resolve(o);
      box.appendChild(b);
    });
  });

  showThinking(true);
  let result;
  try {
    result = await decide({
      scene: '煮粥分汤',
      callType: 'share_judge',
      situation: `玩家分配：${choice}`,
      state: publicState(),
      options: [choice],
      operation: { type: 'soup', choice },
    });
    bumpAiCount(S);
    const changes = applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
    flashEffects(changes);
    appendCampLog(S, '分汤', result.narrative || choice);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge({ ...result, factId: result.factId || 'h_fishhook' }, '金色的鱼钩');
}

// ─── school ───
async function doSchool(fromCamp) {
  showScreen('screen-stage');
  setStageBanner('夜校识字', '/assets/scenes/school_close.jpg');
  setPortrait('文化教员', '夜校', '教', '耐心');
  setStagePanel('<div id="school-host"></div>');
  const op = await runNightSchool($('school-host'));
  S.tonightPassword = op.detail?.password || '瑞金';

  showThinking(true);
  let result;
  try {
    result = await decide({
      scene: '夜校识字',
      callType: 'minigame_review',
      situation: `识字正确率 ${(op.score * 100) | 0}%，今晚口令：${S.tonightPassword}`,
      state: publicState(),
      operation: { type: 'school', ...op },
    });
    bumpAiCount(S);
    const changes = applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
    flashEffects(changes);
    appendCampLog(S, '夜校', `口令「${S.tonightPassword}」已记下`);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge({ ...result, factId: result.factId || 'h_nightschool' }, '行军中的文化学习');
  void fromCamp;
}

function waitBtn(label) {
  return new Promise((resolve) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary';
    btn.id = 'btn-continue';
    btn.textContent = label;
    btn.style.marginTop = '14px';
    btn.onclick = () => { btn.remove(); resolve(); };
    $('stage-panel').appendChild(btn);
  });
}

// ─── forced chain ───
async function startForcedChain() {
  toast('进入强制节点：金色的鱼钩');
  await doFishing(false);
  await runPathOnImage();
  await runQuiz();
  await runNight();
  await runEnding();
}

// ─── path on image ───
async function runPathOnImage() {
  showScreen('screen-path');
  const zones = $('path-zones');
  zones.innerHTML = '';
  const choice = await new Promise((resolve) => {
    PATH_ZONES.forEach((z) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'path-zone';
      b.style.left = z.x + '%';
      b.style.top = z.y + '%';
      b.style.width = z.w + '%';
      b.style.height = z.h + '%';
      b.innerHTML = `<b>${z.label}</b><span>${z.sub}</span>`;
      b.onclick = () => resolve(z);
      zones.appendChild(b);
    });
  });

  showScreen('screen-stage');
  setStageBanner('过草地', '/assets/scenes/marsh.jpg');
  setPortrait('指导员', '连队指导员', '指', '严肃', '/assets/characters/zhiyuan.png');
  setStagePanel(`<p class="hint">你选了：${escapeHtml(choice.label)}</p>`);
  showThinking(true);
  let result;
  try {
    result = await decide({
      scene: '过草地·路线抉择',
      callType: 'branch_judge',
      situation: `玩家选择：${choice.label}`,
      state: publicState(),
      options: [choice.label],
      operation: { type: 'path', choice: choice.id, score: choice.score },
    });
    bumpAiCount(S);
    const changes = applyEffects(S, result.effects);
    await say('叙事', result.scene_text || result.narrative || '');
    flashEffects(changes);
    appendCampLog(S, '过草地', result.scene_text || choice.label);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge({ ...result, factId: result.factId || 'h_grassland' }, '过松潘草地');
}

// ─── quiz ───
async function runQuiz() {
  showScreen('screen-quiz');
  $('quiz-score').textContent = `${S.quiz.human} : ${S.quiz.ai}`;
  const body = $('quiz-body');
  body.innerHTML = '<p class="muted">正在出题…</p>';

  showThinking(true);
  let q;
  try {
    q = await decide({
      scene: '知识对决·草地',
      callType: 'quiz_generate',
      situation: '根据过草地节点出一道史实单选题',
      state: publicState(),
    });
    bumpAiCount(S);
  } finally {
    showThinking(false);
  }

  body.innerHTML = `
    <p class="quiz-q">${escapeHtml(q.question || '题目')}</p>
    <div class="quiz-opts" id="quiz-opts"></div>
    <div id="quiz-feedback" class="quiz-result"></div>
    <button type="button" class="btn primary" id="quiz-next" style="margin-top:12px;display:none">继续</button>
  `;
  const optsBox = $('quiz-opts');
  const opts = q.options || [];

  await new Promise((resolveQuiz) => {
    let answered = false;
    const finish = async (humanIdx) => {
      if (answered) return;
      answered = true;
      const ans = Number.isInteger(q.answer_index) ? q.answer_index : 0;

      showThinking(true);
      let aiAns;
      try {
        const ai = await decide({
          scene: '知识对决·AI作答',
          callType: 'quiz_answer_ai',
          situation: `题目：${q.question}\n选项：${opts.join(' / ')}`,
          state: publicState(),
          agent: '稳健派老李：重视口粮与纪律，作答偏保守',
          options: opts,
        });
        bumpAiCount(S);
        aiAns = Number.isInteger(ai.answer_index) ? ai.answer_index : 0;
      } finally {
        showThinking(false);
      }

      const humanRight = humanIdx === ans;
      const aiRight = aiAns === ans;
      if (humanRight) S.quiz.human += 1;
      if (aiRight) S.quiz.ai += 1;
      $('quiz-score').textContent = `${S.quiz.human} : ${S.quiz.ai}`;

      showThinking(true);
      let judge;
      try {
        judge = await decide({
          scene: '知识对决·判分',
          callType: 'quiz_judge',
          situation: `标准答案：${opts[ans]}（index ${ans}）。玩家：${opts[humanIdx] ?? '未答'}。AI：${opts[aiAns] ?? '未答'}`,
          state: publicState(),
          operation: { human: humanIdx, ai: aiAns, answer_index: ans },
        });
        bumpAiCount(S);
        applyEffects(S, judge.effects || { 士气: humanRight ? 3 : -1 });
        $('quiz-feedback').innerHTML = `
          <div>你：<b>${humanRight ? '正确' : '错误'}</b> · AI：<b>${aiRight ? '正确' : '错误'}</b></div>
          <div style="margin-top:6px">${escapeHtml(q.explain || judge.explain || '')}</div>
        `;
      } finally {
        showThinking(false);
      }

      [...optsBox.children].forEach((el, i) => {
        el.disabled = true;
        if (i === ans) el.classList.add('correct');
        else if (i === humanIdx) el.classList.add('wrong');
      });

      const next = $('quiz-next');
      next.style.display = 'inline-block';
      await new Promise((r) => { next.onclick = r; });

      await afterJudge({
        narrative: `你答：${opts[humanIdx]}。标准答案：${opts[ans]}。${q.explain || judge.explain || ''}`,
        factId: 'h_grassland',
      }, '知识对决 · 过草地');
      resolveQuiz();
    };

    opts.forEach((text, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quiz-opt';
      b.textContent = `${String.fromCharCode(65 + i)}. ${text}`;
      b.onclick = () => finish(i);
      optsBox.appendChild(b);
    });
  });
}

// ─── night ───
async function runNight() {
  showScreen('screen-night');
  renderStats(S);
  $('night-body').innerHTML = '<p class="muted">正在生成今夜的抉择…</p>';

  showThinking(true);
  let night;
  try {
    night = await decide({
      scene: '篝火深夜·生成抉择',
      callType: 'night_options',
      situation: '营地日结束，生成夜间互斥抉择',
      state: publicState(),
    });
    bumpAiCount(S);
  } finally {
    showThinking(false);
  }

  $('night-lead').textContent = night.lead || '火压低了。';
  const body = $('night-body');
  body.innerHTML = '';
  const opts = night.options || [
    { label: '加岗并匀出口粮', sub: '安全优先', key: 'a' },
    { label: '原编制休息', sub: '保留体力', key: 'b' },
  ];

  await new Promise((resolve) => {
    opts.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn choice';
      b.innerHTML = `<b>${escapeHtml(o.label)}</b><span>${escapeHtml(o.sub || '')}</span>`;
      b.onclick = async () => {
        body.innerHTML = '';
        showThinking(true);
        let res;
        try {
          res = await decide({
            scene: '篝火深夜·抉择结算',
            callType: 'night_resolve',
            situation: `玩家选择：${o.label} — ${o.sub || ''}`,
            state: publicState(),
            options: [o.label],
          });
          bumpAiCount(S);
          applyEffects(S, res.effects);
          renderStats(S);
          const p = document.createElement('p');
          p.style.cssText = 'line-height:1.85;margin:12px 0;color:var(--paper-dim)';
          body.appendChild(p);
          await typeText(p, res.narrative || '当夜无事。');
        } finally {
          showThinking(false);
        }
        await afterJudge({
          narrative: res.narrative || o.label,
          factId: 'h_campfire',
        }, '草地之夜');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn primary';
        btn.textContent = '天亮了 · 进入结算';
        btn.style.marginTop = '16px';
        btn.onclick = resolve;
        body.appendChild(btn);
      };
      body.appendChild(b);
    });
  });
}

// ─── ending ───
async function runEnding() {
  showScreen('screen-end');
  $('end-title').textContent = '结算中…';
  $('end-paras').innerHTML = '';
  $('end-history').innerHTML = '';
  $('end-personal').textContent = '';

  showThinking(true);
  let end;
  try {
    end = await decide({
      scene: '章节结局总评',
      callType: 'ending_review',
      situation: '草地章节结束，综合资源、关系、钓鱼/分汤/对决/夜间',
      state: publicState(),
      extraContext: `行动日志：${S.行动日志.join('；')}；口令：${S.tonightPassword || '无'}；钓鱼最佳：${S.fishingBest.toFixed(2)}；对决比分 ${S.quiz.human}:${S.quiz.ai}`,
    });
    bumpAiCount(S);
  } finally {
    showThinking(false);
  }

  $('end-eyebrow').textContent = `${CHAPTER.title} · ${end.ending_id || '结局'}`;
  $('end-title').textContent = end.title || '草地之后';
  const paras = end.paragraphs || [];
  const box = $('end-paras');
  for (const t of paras) {
    const p = document.createElement('p');
    box.appendChild(p);
    await typeText(p, t, 16);
  }
  $('end-history').innerHTML = (end.history_points || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('');
  renderStats(S);
  $('end-rel').innerHTML = COMPANIONS.map((c) => `${c.name}：${S[`好感_${c.name}`] ?? 40}`).join('<br/>');
  $('end-personal').textContent = end.personal || '';
  saveState(S);
  toast('章节完成 · 可打开行军记录核查 AI 调用', 4000);
}

// ─── helpers ───
const page = {
  onceDialogAccept() {
    const h = (d) => { d.accept(); window.removeEventListener('dialog', h); };
    window.addEventListener('dialog', h);
  },
};

function publicState() {
  return {
    体力: S.体力, 粮食: S.粮食, 士气: S.士气, 信念: S.信念, 民心: S.民心,
    好感_老班长: S.好感_老班长, 好感_指导员: S.好感_指导员, 好感_红小鬼: S.好感_红小鬼,
    好感_卫生员: S.好感_卫生员, 好感_老乡: S.好感_老乡,
    tonightPassword: S.tonightPassword, 行动日志: S.行动日志, day: S.day,
  };
}

boot();
