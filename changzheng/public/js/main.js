import { COMPANIONS, PATH_ZONES } from './data.js';
import { createState, applyEffects, unlockFact, saveState, checkFailure, addLoss, applyStarvation } from './state.js';
import { decide, fetchConfig, fetchLogs, fetchFacts, fetchActs, saveConfig, testConfig, clearLogs } from './ai-client.js';

let judgeMode = false;
const aiFeed = [];

/** 供沙盘等模块上报调用（答辩面板共用） */
export function pushAiFeed(entry) {
  aiFeed.unshift(entry);
  if (aiFeed.length > 30) aiFeed.pop();
  if (judgeMode) renderInspector();
}
if (typeof window !== 'undefined') window.__pushAiFeed = pushAiFeed;

async function callAI(payload) {
  const t0 = Date.now();
  const result = await decide(payload);
  const entry = {
    callType: payload.callType || 'decide',
    scene: payload.scene || '',
    ms: Date.now() - t0,
    model: config?.model || 'glm',
    mock: !!config?.mockMode,
    snippet: (result.narrative || result.reply || result.scene_text || result.title || result.question || '').slice(0, 80),
  };
  aiFeed.unshift(entry);
  if (aiFeed.length > 30) aiFeed.pop();
  if (judgeMode) renderInspector();
  const label = $('thinking-label');
  if (label) label.textContent = `${entry.callType} · ${entry.model}`;
  return result;
}

function renderInspector() {
  const box = $('ai-ins-body');
  if (!box) return;
  box.innerHTML = aiFeed
    .map(
      (e) => `<div class="ai-item">
        <span class="tag">${escapeHtml(e.callType)}</span>
        <span class="${e.mock ? 'src-mock' : 'src-glm'}">${e.mock ? 'MOCK' : 'GLM'}</span>
        <span class="muted">${e.ms}ms</span>
        <div>${escapeHtml(e.snippet || e.scene || '')}</div>
      </div>`
    )
    .join('');
}

function setJudgeMode(on) {
  judgeMode = !!on;
  const el = $('ai-inspector');
  if (el) el.classList.toggle('hidden', !on);
  if (on) {
    renderInspector();
    toast('评委演示模式：右侧实时显示每次大模型调用', 3500);
  }
}
import { runFishing, runNightSchool } from './minigames.js';
import { audio } from './audio.js';
import { bindSandbox } from './sandbox.js';
import * as UI from './ui.js';

const { $, showScreen, setTopbar, renderStats, renderAp, renderCompanions,
  appendCampLog, toast, showThinking, say, setPortrait, setStageBanner, setStagePanel,
  flashEffects, setAiMode, bumpAiCount, typeText, escapeHtml, renderLogs, renderFacts,
  showOverlay, hideOverlay } = UI;

let S = null;
let allFacts = {};
let actsData = null;
let config = { mockMode: true, model: 'glm-5.3-flash' };
let echoResolve = null;
let talkPending = false;

const CHOICE_SETS = {
  cross: {
    title: '怎么过河',
    callType: 'branch_judge',
    options: [
      { label: '跟着队伍快走', sub: '跟上，别掉队' },
      { label: '扶一把崴脚的战友', sub: '慢一点，拉他一把' },
      { label: '帮老乡拆最后一块门板', sub: '桥要稳，民心也要稳' },
    ],
    factId: 'h_depart',
  },
  escort: {
    title: '护送伤员过封锁',
    callType: 'branch_judge',
    loss: { who: '担架上的伤员', reason: '为了抢时间冲过封锁，担架没能全部抬过去' },
    options: [
      { label: '立刻冲过去', sub: '快，但风险大' },
      { label: '等烟散了再走', sub: '稳，但更耗体力' },
      { label: '绕浅滩', sub: '远一点，脚会湿' },
    ],
    factId: 'h_xiangjiang',
  },
  direction: {
    title: '往哪里走',
    callType: 'branch_judge',
    options: [
      { label: '要开个会，把方向定下来', sub: '信念向' },
      { label: '听上面的就行', sub: '稳妥' },
      { label: '我只想知道明天往哪走', sub: '小战士视角' },
    ],
    factId: 'h_zunyi',
  },
  ferry: {
    title: '今夜能不能渡',
    callType: 'branch_judge',
    options: [
      { label: '跟船工的桨声走', sub: '信老乡' },
      { label: '天亮再渡', sub: '更安全，更慢' },
      { label: '分批快渡，伤员先上', sub: '分工' },
    ],
    factId: 'h_jinsha',
  },
  luding: {
    title: '飞夺泸定桥',
    callType: 'minigame_review',
    options: [
      { label: '攀铁索冲过去', sub: '拼了' },
      { label: '铺板边打边过', sub: '稳一点' },
      { label: '火力掩护，分组突进', sub: '配合' },
    ],
    factId: 'h_luding',
    operationType: 'luding',
  },
  let_clothes: {
    title: '让出棉衣',
    callType: 'share_judge',
    options: [
      { label: '把外衣让给发抖的战士', sub: '你冷，他更冷' },
      { label: '两人挤一件走', sub: '一起扛' },
      { label: '先赶到山顶再说', sub: '保存自己' },
    ],
    factId: 'h_xueshan',
  },
  lazikou: {
    title: '腊子口怎么打',
    callType: 'branch_judge',
    options: [
      { label: '正面佯攻，侧崖奇袭', sub: '出其不意' },
      { label: '集中火力正面强攻', sub: '硬碰硬' },
      { label: '找向导绕道', sub: '耗粮但稳' },
    ],
    factId: 'h_huining',
  },
  rally: {
    title: '会师',
    callType: 'branch_judge',
    options: [
      { label: '跑过去和另一路兄弟拥抱', sub: '说不出话' },
      { label: '先安顿伤员再会合', sub: '责任' },
      { label: '把红旗插到高处', sub: '让所有人都看见' },
    ],
    factId: 'h_huining',
  },
};

// ─── boot ───
async function boot() {
  config = await fetchConfig();
  setAiMode(config);
  $('title-model').textContent = config.model + (config.mockMode ? '（MOCK）' : '');
  allFacts = (await fetchFacts()) || {};
  actsData = await fetchActs();
  bindChrome();
  bindTitle();
  bindEcho();
  bindSettings();
  showScreen('screen-title');
  setTopbar(false);
}

function currentActDef() {
  const order = actsData?.order || [];
  const idx = S.actIndex || 0;
  const id = order[idx];
  return actsData?.acts?.[id] || null;
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
  $('btn-settings').onclick = () => openSettings();
  $('btn-settings2').onclick = () => openSettings();
  const muteBtn = $('btn-mute');
  if (muteBtn) {
    muteBtn.onclick = () => {
      audio.setEnabled(!audio.enabled);
      muteBtn.textContent = audio.enabled ? '🔊' : '🔇';
      toast(audio.enabled ? '声音已开' : '声音已关');
    };
  }
  const defBtn = $('btn-defense');
  if (defBtn) defBtn.onclick = () => openDefense();
  const defClose = $('btn-defense-close');
  if (defClose) defClose.onclick = () => hideOverlay('screen-defense');
  const jBtn = $('btn-journal');
  if (jBtn) jBtn.onclick = () => openJournal();
  const jClose = $('btn-journal-close');
  if (jClose) jClose.onclick = () => hideOverlay('screen-journal');
  // 快捷键：1/2/3 选项，J 手记，Esc 关闭浮层
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ['screen-journal', 'screen-defense', 'screen-logs', 'screen-facts', 'screen-settings', 'screen-fire', 'screen-how']
        .forEach((id) => hideOverlay(id));
      return;
    }
    if (e.key.toLowerCase() === 'j' && S) { openJournal(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= 9) {
      const rows = [...document.querySelectorAll('.choice-row:not(.hidden) .btn.choice:not([disabled]), #stage-panel .btn.choice:not([disabled]), #fire-opts .btn.choice:not([disabled]), .quiz-opt:not([disabled]), .path-zone')]
        .filter((el) => el.offsetParent !== null);
      if (rows[n - 1]) {
        audio.playSfx('click');
        rows[n - 1].click();
      }
    }
  });
}

function openJournal() {
  if (!S) return;
  showOverlay('screen-journal');
  const order = actsData?.order || [];
  const now = S.actIndex ?? 0;
  $('journal-route').innerHTML = order
    .map((id, i) => {
      const a = actsData.acts[id];
      const cls = i < now ? 'done' : i === now ? 'now' : '';
      const mark = i < now ? '✓ ' : i === now ? '▸ ' : '';
      return `<span class="jr-chip ${cls}">${mark}${a?.title || id}</span>`;
    })
    .join('');

  const choices = S.choiceLog || [];
  $('journal-choices').innerHTML = choices.length
    ? choices.map((c) => `<li><b>${escapeHtml(c.act)}</b> · ${escapeHtml(c.label)}${c.mood ? ` <span class="muted">(${escapeHtml(c.mood)})</span>` : ''}</li>`).join('')
    : '<li class="empty">还没有写下抉择。</li>';

  const unlocked = S.unlockedFacts || [];
  $('journal-facts').innerHTML = unlocked.length
    ? unlocked.map((id) => {
        const f = allFacts?.[id];
        return `<li><b>${escapeHtml(f?.title || id)}</b>${f?.date ? ` <span class="muted">${escapeHtml(f.date)}</span>` : ''}</li>`;
      }).join('')
    : '<li class="empty">还没有照亮史实。</li>';

  $('journal-foot').textContent =
    `体力 ${S.体力} · 粮食 ${S.粮食} · 士气 ${S.士气} · 信念 ${S.信念} · 民心 ${S.民心}　｜　对决 ${S.quiz?.human ?? 0}:${S.quiz?.ai ?? 0}　｜　模型 ${config.model}${config.mockMode ? '（MOCK）' : ''}`;
}

function logChoice(act, label, mood) {
  if (!S) return;
  if (!S.choiceLog) S.choiceLog = [];
  S.choiceLog.push({ act: act?.title || '—', label: String(label).slice(0, 40), mood: mood || '' });
}

function logShare(label) {
  if (!S) return;
  if (!S.choiceLog) S.choiceLog = [];
  S.choiceLog.push({ act: `第 ${S.actIndex + 1} 幕 · 分享`, label: String(label).slice(0, 40), mood: '分粮' });
}

function showLossToast(who, reason) {
  const el = document.createElement('div');
  el.className = 'loss-toast';
  el.innerHTML = `<div class="lw">${escapeHtml(who)} · 掉队</div><div class="lr">${escapeHtml(reason || '')}</div>`;
  document.body.appendChild(el);
  audio.playSfx('wrong');
  setTimeout(() => el.remove(), 3400);
}

async function openDefense() {
  showOverlay('screen-defense');
  const box = $('defense-body');
  box.innerHTML = '<p class="muted sm">统计中…</p>';
  let logs = [];
  try {
    const d = await fetchLogs();
    logs = d.logs || [];
  } catch { /* ignore */ }
  const byType = {};
  const bySource = {};
  let lat = [];
  for (const l of logs) {
    const t = l.callType || 'other';
    byType[t] = (byType[t] || 0) + 1;
    const s = l.source || '?';
    bySource[s] = (bySource[s] || 0) + 1;
    if (typeof l.durationMs === 'number') lat.push(l.durationMs);
  }
  const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
  // source 只区分「真调 / 演示 / 降级」，真实模型名以日志 model 字段为准
  const glmCalls = Object.entries(bySource)
    .filter(([s]) => /glm/i.test(s))
    .reduce((sum, [, n]) => sum + n, 0);
  const cards = [
    { k: '总调用', v: logs.length, n: '每次决策均有 JSONL' },
    { k: '平均延迟', v: avg + 'ms', n: 'MOCK≈0 · 真调 2–5s' },
    { k: 'GLM 真调', v: glmCalls, n: `source=GLM · ${config?.model || 'glm'}` },
    { k: 'MOCK', v: bySource.MOCK_AI || 0, n: '无 Key 演示' },
    { k: 'FALLBACK', v: bySource.FALLBACK || bySource.FALLBACK_AFTER_ERROR || 0, n: '降级可审计' },
  ];
  Object.entries(byType).forEach(([t, n]) => {
    cards.push({ k: t, v: n, n: '环节调用' });
  });
  box.innerHTML = cards
    .map((c) => `<div class="def-card"><div class="k">${escapeHtml(c.k)}</div><div class="v">${c.v}</div><div class="n">${escapeHtml(c.n)}</div></div>`)
    .join('');
}

function bindTitle() {
  const study = $('btn-mode-study');
  const march = $('btn-mode-march');
  if (study) study.onclick = () => startRun('study');
  if (march) march.onclick = () => startRun('march');
  const judge = $('btn-judge');
  if (judge) {
    judge.onclick = () => {
      setJudgeMode(true);
      startRun('study');
    };
  }
  $('btn-how').onclick = () => showOverlay('screen-how');
  $('btn-how-back').onclick = () => hideOverlay('screen-how');
  const sb = $('btn-mode-sandbox');
  if (sb) sb.onclick = () => startSandbox();
  $('btn-inspect-close') && ($('btn-inspect-close').onclick = () => setJudgeMode(false));
}

function startSandbox() {
  setTopbar(true);
  showScreen('screen-sandbox');
  const sbLogs = $('btn-sb-logs');
  if (sbLogs) sbLogs.onclick = () => $('btn-logs')?.click();
  bindSandbox({
    onExit: () => {
      audio.stopAmbient();
      showScreen('screen-title');
      setTopbar(false);
    },
  });
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

// ─── settings ───
async function openSettings() {
  const cfg = await fetchConfig();
  config = cfg;
  const sel = $('set-model');
  sel.innerHTML = (cfg.availableModels || ['glm-5.3-flash', 'glm-5.1'])
    .map((m) => `<option value="${m}" ${m === cfg.model ? 'selected' : ''}>${m}</option>`)
    .join('');
  $('set-key').value = '';
  $('set-url').value = cfg.apiUrl?.replace('/***', '/chat/completions') || '';
  $('set-key-mask').textContent = `当前 Key：${cfg.keyMask || '（无）'}　模式：${cfg.mockMode ? 'MOCK' : '真实调用'}`;
  $('set-status').textContent = '';
  $('set-test-result').innerHTML = '';
  showOverlay('screen-settings');
}

function bindSettings() {
  $('btn-settings-close').onclick = () => hideOverlay('screen-settings');
  $('btn-set-save').onclick = async () => {
    const body = {
      model: $('set-model').value,
      apiUrl: $('set-url').value.trim(),
    };
    const key = $('set-key').value.trim();
    if (key) body.apiKey = key;
    try {
      const r = await saveConfig(body);
      config = await fetchConfig();
      setAiMode(config);
      $('title-model').textContent = config.model + (config.mockMode ? '（MOCK）' : '');
      $('set-key-mask').textContent = `当前 Key：${config.keyMask || '（无）'}　模式：${config.mockMode ? 'MOCK' : '真实调用'}`;
      $('set-status').textContent = `已保存：${r.model}　${r.mockMode ? 'MOCK' : '真实调用'}`;
      $('set-key').value = '';
      toast('设置已保存');
    } catch (e) {
      $('set-status').textContent = '保存失败：' + e.message;
    }
  };
  $('btn-set-test').onclick = async () => {
    $('set-status').textContent = '测试中…';
    $('set-test-result').innerHTML = '';
    try {
      const r = await testConfig();
      $('set-status').textContent = r.mock
        ? r.message || 'MOCK 模式'
        : `连通成功　${r.model}　${r.latencyMs}ms　source=${r.source}`;
      $('set-test-result').innerHTML = r.reply ? `<div class="muted sm">回声：${escapeHtml(r.reply)}</div>` : '';
    } catch (e) {
      $('set-status').textContent = '连通失败：' + e.message;
    }
  };
  $('btn-set-clear-logs').onclick = async () => {
    await clearLogs();
    S && (S.aiCount = 0);
    $('ai-count').textContent = '0';
    toast('调用日志已重置');
    $('set-status').textContent = '日志已清空';
  };
  $('btn-set-mock').onclick = async () => {
    await saveConfig({ mock: true });
    config = await fetchConfig();
    setAiMode(config);
    $('set-status').textContent = '已切到 MOCK 模式';
    toast('MOCK 模式');
  };
}

function showEcho({ title, play, real, fic }) {
  return new Promise((resolve) => {
    audio.playSfx('echo');
    audio.speak('你刚经历的，和真实发生过的，往往只隔着一层时间。', '叙事', 'narr_echo');
    $('echo-title').textContent = title || '刚刚发生的事';
    $('echo-play').textContent = play || '';
    $('echo-real').textContent = real || '';
    $('echo-fic').textContent = fic ? `虚构边界：${fic}` : '';
    showOverlay('screen-echo');
    echoResolve = resolve;
  });
}

async function afterJudge(result, fallbackTitle, defaultFactId) {
  const fid = result.factId || result.fact_id || defaultFactId;
  if (fid) unlockFact(S, fid);
  const fact = allFacts?.[fid];
  const play = result.narrative || result.scene_text || result.reply || '';
  if (!fact && !play) return;
  await showEcho({
    title: fact?.title || fallbackTitle || '史实回响',
    play: play || '（你刚完成一次操作）',
    real: fact?.real || '走过这段路的部队普遍面临严酷考验；战友互助是大量回忆录中的共同记忆。',
    fic: fact?.fiction || '本关卡具体操作为互动重演。',
  });
}

// ─── run ───
async function startRun(mode = 'study') {
  S = createState();
  S.mode = mode;
  S.actIndex = 0;
  S.actLog = [];
  saveState(S);
  setTopbar(true);
  renderStats(S);
  renderAp(S);
  renderCompanions(S);
  S.aiCount = 0;
  $('ai-count').textContent = '0';
  toast(mode === 'march' ? '行军模式：资源与抉择都可能真的带不走一些人' : '研学模式：不会失去战友', 3200);
  await runActIntro();
}

/** 成败与粮荒结算：返回 true 表示已进入失败流程 */
async function settlePressure(act) {
  if (!S) return false;
  // 幕间粮荒
  const drain = applyStarvation(S);
  if (drain > 0) {
    renderStats(S);
    appendCampLog(S, '粮荒', `断粮，体力 −${drain}`);
    toast(`断粮：体力 −${drain}`, 2600);
  }
  const fail = checkFailure(S);
  if (!fail) return false;
  S.failure = fail;
  await runFailure(fail, act);
  return true;
}

async function runFailure(fail, act) {
  showScreen('screen-end');
  $('end-eyebrow').textContent = `${S.mode === 'march' ? '行军模式' : '研学模式'} · ${fail.kind}`;
  $('end-title').textContent = '结算中…';
  $('end-paras').innerHTML = '';
  $('end-history').innerHTML = '';
  showThinking(true);
  let end;
  try {
    end = await callAI({
      scene: '失败结算',
      callType: 'failure_review',
      situation: `${fail.kind}：${fail.why}`,
      state: publicState(),
      extraContext: `已走 ${(S.actLog || []).map((a) => a.title).join('、') || '开场'}；损失：${(S.losses || []).map((l) => l.who).join('、') || '无'}`,
    });
  } catch {
    end = null;
  } finally {
    showThinking(false);
  }
  if (!end) {
    end = {
      title: '掉队',
      paragraphs: ['你没能在天黑前跟上队伍。风声盖过了脚步声。', '但队伍还在往前走——他们把你没走完的路接了过去。'],
      history_points: ['长征中的减员多发生在掉队、伤病与断粮之间。', '许多名字没有留在名册上。'],
      personal: '这一局你没能走到终点。换一种选择，或许能。',
    };
  }
  $('end-title').textContent = end.title || '掉队';
  for (const t of end.paragraphs || []) {
    const p = document.createElement('p');
    $('end-paras').appendChild(p);
    await typeText(p, t, 14);
  }
  $('end-history').innerHTML = (end.history_points || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('');
  renderStats(S);
  $('end-rel').innerHTML = renderRelations();
  $('end-personal').textContent = end.personal || '';
  saveState(S);
}

function renderRelations() {
  const rows = COMPANIONS.map((c) => `${c.name}：${S[`好感_${c.name}`] ?? 40}`);
  const lost = (S.losses || []).map((l) => `<span style="color:#e07a5f">${escapeHtml(l.who)} · ${escapeHtml(l.reason)}</span>`);
  return rows.concat(lost).join('<br/>');
}

async function runActIntro() {
  const act = currentActDef();
  if (!act) return runEnding();
  if ($('act-tag')) $('act-tag').textContent = `${act.title} · ${act.subtitle}`;
  await runCutscene([
    { img: act.pano, text: `${act.date}。${act.subtitle}——${act.theme}。` },
    { img: act.pano, text: '营地在暮色里安顿下来。光点在呼吸，走近一处，把事做完。' },
  ]);
  if (act.prelude) await runPrelude(act);
  enterCampDay(act, 1);
}

async function runCutscene(frames) {
  showScreen('screen-cutscene');
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
}

async function runPrelude(act) {
  const pre = act.prelude;
  showScreen('screen-stage');
  setStageBanner(pre.title, pre.pano);
  setPortrait('你', '年轻战士', '你', '风雪');
  setStagePanel('<p class="hint">雪线之上，有人发抖。你怎么选？</p><div class="choices" id="pre-opts"></div>');
  audio.speak('他接过外衣，没说谢。后来在你走不动时，递了水壶。', '叙事', 'narr_snow');
  const cs = CHOICE_SETS[pre.choice];
  const choice = await new Promise((resolve) => {
    const box = $('pre-opts');
    cs.options.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn choice';
      b.innerHTML = `<b>${o.label}</b><span>${o.sub}</span>`;
      b.onclick = () => {
        [...box.children].forEach((x) => { x.disabled = true; });
        resolve(o.label);
      };
      box.appendChild(b);
    });
  });
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: `${act.title}·${cs.title}`,
      callType: cs.callType,
      situation: `玩家选择：${choice}`,
      state: publicState(),
      options: [choice],
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || result.scene_text || '');
    renderStats(S);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, cs.title, cs.factId);
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function makeChoice(label, sub, onClick, icon, extra, keyHint) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn choice';
  b.innerHTML = `<span class="ic">${icon || '·'}</span><span class="ch-text"><b>${escapeHtml(label)}</b><span class="ch-sub">${escapeHtml(sub || '')}</span>${extra ? `<span class="ch-extra">${extra}</span>` : ''}</span>${keyHint ? `<span class="kbd-hint">${keyHint}</span>` : ''}`;
  b.onclick = onClick;
  return b;
}

function enterCampDay(act, day) {
  S.day = day;
  S.ap = S.maxAp;
  S.phase = 'camp';
  S.行动日志 = [];
  showScreen('screen-camp');
  $('pano-img').style.backgroundImage = `url('${act.pano}')`;
  $('act-title').textContent = act.title;
  $('day-num').textContent = String(day);
  $('day-max').textContent = String(act.apDays || 1);
  $('camp-hint').textContent = '用光照亮他们。点余烬，走进他的一夜。';
  const amb = act.id === 'act4' ? 'camp' : act.id === 'act3' ? 'river' : act.id === 'act2' ? 'night' : act.id === 'act5' ? 'wind' : 'wind';
  audio.playAmbient(amb);
  audio.playSfx('day');
  renderStats(S);
  renderAp(S);
  renderCompanions(S);
  renderHotspots(act);
  bindMarchButton(act);
  updateDusk();
  renderJourney();
  bindLantern();
  appendCampLog(S, '系统', `${act.title} · 第 ${day} 日`);
  // 深度调用：进入营地时由模型写场景氛围
  fireSceneGen(act);
}

async function fireSceneGen(act) {
  try {
    const r = await decide({
      scene: `${act.title}·进入营地`,
      callType: 'scene_gen',
      situation: `第 ${S.day} 日，体力${S.体力} 粮食${S.粮食} 士气${S.士气} 信念${S.信念}`,
      state: publicState(),
      extraContext: act.theme,
    });
    bumpAiCount(S);
    if (r?.atmosphere) {
      $('camp-hint').textContent = r.atmosphere.slice(0, 80) + (r.atmosphere.length > 80 ? '…' : '');
      appendCampLog(S, '场景', r.whisper || r.atmosphere.slice(0, 40));
    }
  } catch { /* 静默 */ }
}

function updateDusk() {
  const dusk = $('dusk');
  if (!dusk || !S) return;
  const spent = Math.max(0, S.maxAp - S.ap);
  const level = Math.min(4, spent + (S.day > 1 ? 1 : 0));
  dusk.dataset.dusk = String(level);
}

function renderJourney() {
  const el = $('journey');
  if (!el || !actsData) return;
  const order = actsData.order || [];
  const now = S?.actIndex ?? 0;
  el.innerHTML = order.map((id, i) => {
    const a = actsData.acts[id];
    const cls = i < now ? 'done' : i === now ? 'now' : '';
    const line = i < order.length - 1 ? `<div class="j-line ${i < now ? 'done' : ''}"></div>` : '';
    return `<div class="j-node ${cls}"><span class="j-dot"></span><span class="j-label">${a?.title || id}</span></div>${line}`;
  }).join('');
}

function bindLantern() {
  const dusk = $('dusk');
  const lantern = $('lantern');
  if (!dusk || !lantern || dusk._lanternBound) return;
  dusk._lanternBound = true;
  dusk.addEventListener('pointermove', (e) => {
    const r = dusk.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    dusk.style.setProperty('--lx', x + '%');
    dusk.style.setProperty('--ly', y + '%');
    lantern.style.left = (e.clientX - r.left) + 'px';
    lantern.style.top = (e.clientY - r.top) + 'px';
  });
}

function bindMarchButton(act) {
  const btn = $('btn-march-fixed');
  if (!btn) return;
  btn.onclick = () => onHotspot(act, { kind: 'march', label: '启程' });
  updateMarchButton();
}

function updateMarchButton() {
  const btn = $('btn-march-fixed');
  if (!btn) return;
  if (S?.busy) {
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

async function marchTransition(label) {
  audio.playSfx('march');
  const flash = document.createElement('div');
  flash.className = 'march-flash';
  flash.innerHTML = `<span>${label || '启程'}</span>`;
  document.body.appendChild(flash);
  await wait(1100);
  flash.remove();
}

function renderHotspots(act) {
  const box = $('hotspots');
  box.innerHTML = '';
  const icons = { talk: '谈', choice: '择', rest: '歇', share: '分', fishing: '钩', school: '字', fire: '火', march: '行' };
  act.hotspots.forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hotspot' + (h.kind === 'march' ? ' march' : '');
    b.style.left = h.x + '%';
    b.style.top = h.y + '%';
    const apOut = S.ap <= 0 && h.kind !== 'march';
    b.disabled = apOut;
    b.innerHTML = `
      <span class="ember"></span>
      <span class="hs-card">
        <span class="hs-label">${h.label}</span>
        <span class="hs-sub">${apOut ? '暮色已尽' : (h.sub || '')}</span>
      </span>`;
    b.onclick = () => onHotspot(act, h);
    box.appendChild(b);
  });
  void icons;
}

async function onHotspot(act, h) {
  if (S?.busy) return;
  audio.playSfx('click');
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
      S.busy = false;
      await runForcedChain(act);
    });
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
    S.ap -= 1;
    S.行动日志.push(h.label);
    renderAp(S);
    renderHotspots(act);
    updateMarchButton();
    updateDusk();

    if (h.kind === 'talk') await doTalk(act, h);
    else if (h.kind === 'fishing') await doFishing(act, false);
    else if (h.kind === 'school') await doSchool();
    else if (h.kind === 'rest') await doRest();
    else if (h.kind === 'share') await doShare();
    else if (h.kind === 'choice') {
      await doChoice(act, h.action);
      // 热点做过的抉择，强制链不再重播
      if (h.action) markDone(act.id, h.action);
    }

    renderStats(S);
    renderCompanions(S);
    saveState(S);
    showScreen('screen-camp');
    $('pano-img').style.backgroundImage = `url('${act.pano}')`;
    updateMarchButton();
    updateDusk();
    if (S.ap <= 0) {
      appendCampLog(S, '系统', '天黑了，点右下「启程」。');
      toast('天黑了 → 启程', 3200);
    }
  });
}

function markDone(actId, key) {
  if (!S.doneKeys) S.doneKeys = {};
  S.doneKeys[`${actId}:${key}`] = true;
}
function isDone(actId, key) {
  return !!(S.doneKeys && S.doneKeys[`${actId}:${key}`]);
}

function renderFireMenu(act) {
  const box = $('fire-opts');
  box.innerHTML = '';
  const items = [
    { label: '找人说话', sub: '改好感', action: 'talk' },
    { label: '分一口粮', sub: '士气信念', action: 'share' },
  ];
  items.forEach((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn choice';
    b.innerHTML = `<b>${f.label}</b><span>${f.sub}</span>`;
    b.disabled = S.ap <= 0;
    b.onclick = async () => {
      hideOverlay('screen-fire');
      if (S.ap <= 0 || S.busy) { showScreen('screen-camp'); return; }
      await withLock(async () => {
        S.ap -= 1;
        S.行动日志.push(f.label);
        renderAp(S);
        renderHotspots(act);
        updateMarchButton();
        updateDusk();
        if (f.action === 'talk') await doTalk(act, { npc: '老班长' });
        else await doShare();
        renderStats(S);
        renderCompanions(S);
        saveState(S);
        showScreen('screen-camp');
        $('pano-img').style.backgroundImage = `url('${act.pano}')`;
      });
    };
    box.appendChild(b);
  });
}

async function doTalk(act, h) {
  talkPending = false;
  const npcName = h.npc || '同伴';
  const comp = COMPANIONS.find((c) => npcName.includes(c.name)) || COMPANIONS[0];
  showScreen('screen-stage');
  setStageBanner(`${act.title} · 交谈`, act.pano);
  setPortrait(npcName, h.sub || '同伴', comp.ava, '平静', comp.img);
  setStagePanel(`
    <div class="chat-row">
      <input id="talk-input" placeholder="对${npcName}说点什么…" autocomplete="off" />
      <button type="button" class="btn primary" id="talk-send">说</button>
    </div>
    <div class="choices" style="margin-top:10px" id="talk-quick"></div>
    <button type="button" class="btn ghost sm" id="talk-end" style="margin-top:14px">结束交谈</button>
  `);
  await say(npcName, npcName.includes('老班') ? '来了。坐下，别踩了水花。'
    : npcName.includes('指导') ? '坐。有话慢慢说。'
    : npcName.includes('小鬼') ? '你也睡不着？火边还有位置。'
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
  quick.forEach((q) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn choice';
    b.innerHTML = `<b>${q}</b>`;
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

async function sendTalk(npcName, text) {
  // 上一句还没回来就不接第二句：避免狂点/回车刷出重复调用，日志也更好审计
  if (talkPending) return;
  talkPending = true;
  showThinking(true);
  try {
    const result = await callAI({
      scene: `交谈·${npcName}`,
      callType: 'npc_chat',
      situation: `玩家说：${text}`,
      state: publicState(),
    });
    bumpAiCount(S);
    const key = npcName.includes('老班') ? '好感_老班长'
      : npcName.includes('指导') ? '好感_指导员'
      : npcName.includes('小鬼') ? '好感_红小鬼'
      : npcName.includes('卫生') ? '好感_卫生员' : '好感_老乡';
    const effects = { 士气: 1 };
    if (typeof result.affinity_delta === 'number') effects[key] = result.affinity_delta;
    const changes = applyEffects(S, effects);
    await say(npcName, result.reply || '……');
    if (result.mood) $('portrait-mood').textContent = result.mood;
    flashEffects(changes);
    appendCampLog(S, '交谈', `${npcName}：${(result.reply || '').slice(0, 30)}…`);
    renderStats(S);
    renderCompanions(S);
  } catch (err) {
    toast('对话失败：' + err.message);
  } finally {
    talkPending = false;
    showThinking(false);
  }
}

async function doRest() {
  showScreen('screen-stage');
  setStageBanner('休息', '/assets/scenes/camp_evening.jpg');
  setPortrait('你', '年轻战士', '你', '疲惫');
  setStagePanel('<p class="hint">靠着背囊眯一会儿。</p>');
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: '营地休息',
      callType: 'minigame_review',
      situation: '休息',
      state: publicState(),
      operation: { type: 'rest' },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || '你歇了一会儿。');
    appendCampLog(S, '休息', result.narrative || '');
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
}

async function doShare() {
  showScreen('screen-stage');
  setStageBanner('分一口粮', '/assets/scenes/night_fire.jpg');
  setPortrait('你', '年轻战士', '你', '平静');
  setStagePanel('<div class="choice-row" id="share-opts"></div>');
  const shareOpts = ['全给伤员', '全班平分，自己少一点', '先紧着小鬼和卫生员', '自己留大半'];
  const choice = await new Promise((resolve) => {
    shareOpts.forEach((o, i) => {
      $('share-opts').appendChild(makeChoice(o, '', () => {
        [...$('share-opts').children].forEach((x) => { x.disabled = true; });
        resolve(o);
      }, '分', '', String(i + 1)));
    });
  });
  logShare(choice);
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: '分享口粮',
      callType: 'share_judge',
      situation: `玩家选择：${choice}`,
      state: publicState(),
      options: [choice],
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
    appendCampLog(S, '分享', result.narrative || choice);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, '行军中的分享', 'h_share');
}

async function doSchool() {
  showScreen('screen-stage');
  setStageBanner('夜校识字', '/assets/scenes/school_close.jpg');
  setPortrait('文化教员', '夜校', '教', '耐心');
  setStagePanel('<div id="school-host"></div>');
  await say('文化教员', '跟着念。认得一个字，就能传给下一个人。', 'jiaoyuan_school');
  const op = await runNightSchool($('school-host'));
  S.tonightPassword = op.detail?.password || '瑞金';
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: '夜校识字',
      callType: 'minigame_review',
      situation: `识字正确率 ${(op.score * 100) | 0}%`,
      state: publicState(),
      operation: { type: 'school', ...op },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
    appendCampLog(S, '夜校', `口令「${S.tonightPassword}」`);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, '行军中的文化学习', 'h_nightschool');
}

async function doFishing(act, forced) {
  showScreen('screen-stage');
  setStageBanner('金色的鱼钩 · 起竿', '/assets/scenes/pond_close.jpg');
  setPortrait('老班长', '炊事班长', '班', '专注', '/assets/characters/laoban.png');
  await say('老班长', '漂相看真了再起竿。晃是假的，沉才是口。', 'laoban_hook');
  setStagePanel('<div id="fish-host"></div>');
  const op = await runFishing($('fish-host'));
  S.fishingBest = Math.max(S.fishingBest || 0, op.score);
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: '钓鱼·咬钩起竿',
      callType: 'minigame_review',
      situation: '钓鱼小游戏结束',
      state: publicState(),
      operation: { type: 'fishing', ...op },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
    appendCampLog(S, '钓鱼', result.narrative || '');
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, '金色的鱼钩', 'h_fishhook');
  if (!forced) markDone(act.id, 'fishing');
  // 钓鱼后连带的分汤要一起登记，否则强制链里会再结算一次（同一锅汤结算两遍）
  if (forced || S.day >= (act.apDays || 1)) {
    await doSoup();
    markDone(act.id, 'soup');
  }
}

async function doSoup() {
  showScreen('screen-stage');
  setStageBanner('煮粥分汤', '/assets/scenes/pond_close.jpg');
  setPortrait('老班长', '炊事班长', '班', '沉默', '/assets/characters/laoban.png');
  setStagePanel('<p class="hint">锅里只有几条小鱼和草根。</p><div class="choices" id="soup-opts"></div>');
  await say('老班长', '汤要分匀。伤员先喝，我们再看锅底。', 'laoban_soup');
  const choice = await new Promise((resolve) => {
    ['稠的全给伤员，自己喝清汤', '全班平分', '只给病号', '自己先盛一碗'].forEach((o, i) => {
      $('soup-opts').appendChild(makeChoice(o, '', () => {
        [...$('soup-opts').children].forEach((x) => { x.disabled = true; });
        resolve(o);
      }, ['汤', '分', '病', '己'][i], '', String(i + 1)));
    });
  });
  logShare(choice);
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: '煮粥分汤',
      callType: 'share_judge',
      situation: `分配：${choice}`,
      state: publicState(),
      options: [choice],
      operation: { type: 'soup', choice },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, '金色的鱼钩', 'h_fishhook');
}

async function doChoice(act, actionId) {
  const cs = CHOICE_SETS[actionId];
  if (!cs) return;
  showScreen('screen-stage');
  setStageBanner(cs.title, act.pano);
  setPortrait('你', act.title, '你', '决断');
  setStagePanel(`<div class="choice-row" id="ch-opts"></div>`);
  // 深度调用：选项倾向预告（类 Reigns 卡牌预览）
  let hints = {};
  try {
    const hr = await decide({
      scene: `${act.title}·${cs.title}`,
      callType: 'choice_hint',
      situation: '为选项生成倾向预告',
      state: publicState(),
      options: cs.options.map((o) => o.label),
    });
    bumpAiCount(S);
    (hr.hints || []).forEach((h) => { if (h?.label) hints[h.label] = h; });
  } catch { /* 静默 */ }

  const choice = await new Promise((resolve) => {
    cs.options.forEach((o, i) => {
      const h = hints[o.label];
      const trend = h?.trend ? `<em class="trend">${escapeHtml(h.trend)}</em>` : '';
      const risk = h?.risk ? `<em class="risk r-${h.risk}">${h.risk}风险</em>` : '';
      $('ch-opts').appendChild(makeChoice(
        o.label,
        `${o.sub || ''}`,
        () => {
          [...$('ch-opts').children].forEach((x) => { x.disabled = true; });
          resolve(o.label);
        },
        String.fromCharCode(65 + i),
        `${trend}${risk}`,
        i < 9 ? String(i + 1) : ''
      ));
    });
  });
  logChoice(act, choice, hints[choice]?.trend || '');
  // 行军模式：高风险抉择可能留下一个人（不可逆）
  if (S.mode === 'march' && cs.loss) {
    const risk = hints[choice]?.risk || '';
    if (risk === '高' || risk === '中') {
      const who = cs.loss.who;
      if (addLoss(S, who, cs.loss.reason)) {
        showLossToast(who, cs.loss.reason);
        appendCampLog(S, '损失', `${who} 没能跟上`);
      }
    }
  }
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: `${act.title}·${cs.title}`,
      callType: cs.callType,
      situation: `玩家选择：${choice}`,
      state: publicState(),
      options: [choice],
      operation: cs.operationType ? { type: cs.operationType, choice } : { choice },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || result.scene_text || '');
    appendCampLog(S, cs.title, choice);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, cs.title, cs.factId);
}

function waitBtn(label) {
  return new Promise((resolve) => {
    const host = $('sheet-actions') || $('stage-panel') || document.body;
    host.querySelectorAll('#btn-continue').forEach((n) => n.remove());
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary';
    btn.id = 'btn-continue';
    btn.textContent = label;
    btn.onclick = () => { btn.remove(); resolve(); };
    host.appendChild(btn);
  });
}

async function withLock(fn) {
  if (S && S.busy) return;
  if (S) S.busy = true;
  updateMarchButton?.();
  try {
    await fn();
  } finally {
    if (S) S.busy = false;
    updateMarchButton?.();
  }
}

// ─── forced chain ───
async function runForcedChain(act) {
  return withLock(async () => {
    toast(`进入节点：${act.title}`);
    const forced = act.forced || [];
    for (let i = 0; i < forced.length; i++) {
      const fid = forced[i];
      // 热点里已经做过的，不再重播
      if (isDone(act.id, fid)) {
        appendCampLog(S, '系统', `${fid} 已完成，跳过。`);
        continue;
      }
      if (fid === 'fishing') { await doFishing(act, true); markDone(act.id, 'fishing'); }
      else if (fid === 'soup') { await doSoup(); markDone(act.id, 'soup'); }
      else if (fid === 'path') { await runPathOnImage(); markDone(act.id, 'path'); }
      else if (fid === 'luding') { await doChoice({ ...act, pano: '/assets/scenes/luding_pano.jpg' }, 'luding'); markDone(act.id, 'luding'); }
      else { await doChoice(act, fid); markDone(act.id, fid); }
    }
    if (act.quiz && !isDone(act.id, 'quiz')) {
      await runQuiz(act);
      markDone(act.id, 'quiz');
    }
    await finishAct(act);
  });
}

async function runPathOnImage() {
  showScreen('screen-path');
  audio.speak('前面岔开了三条路。你定。', '指导员', 'zhiyuan_grass');
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
    result = await callAI({
      scene: '过草地·路线抉择',
      callType: 'branch_judge',
      situation: `玩家选择：${choice.label}`,
      state: publicState(),
      options: [choice.label],
      operation: { type: 'path', choice: choice.id, score: choice.score },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.scene_text || result.narrative || '');
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, '过松潘草地', 'h_grassland');
}

async function runQuiz(act) {
  showScreen('screen-quiz');
  $('quiz-bg').style.backgroundImage = `url('${act.pano}')`;
  $('quiz-score').textContent = `${S.quiz.human} : ${S.quiz.ai}`;
  const body = $('quiz-body');
  body.innerHTML = '<p class="muted">正在出题…</p>';
  audio.speak('停一停。刚才走过的路，你还记得多少。', '叙事', 'narr_quiz');
  showThinking(true);
  let q;
  try {
    q = await callAI({
      scene: `知识对决·${act.title}`,
      callType: 'quiz_generate',
      situation: `根据「${act.title}·${act.subtitle}」出一道长征史实单选题`,
      state: publicState(),
      extraContext: `本幕主题：${act.theme}；史实：${(act.facts || []).join(',')}`,
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
  const opts = Array.isArray(q.options) && q.options.length >= 2
    ? q.options.map((o) => String(o))
    : ['（题目选项缺失）', '（请重开本题）'];
  // 模型可能把下标写成字符串或越界：合法就取用，非法一律记 -1（本题不计分），
  // 避免「解析失败」被当成默认选了 A
  const normIdx = (v, len) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n < len ? n : -1;
  };
  await new Promise((resolveQuiz) => {
    let answered = false;
    const finish = async (humanIdx) => {
      if (answered) return;
      answered = true;
      const ans = normIdx(q.answer_index, opts.length);
      const answerKnown = ans >= 0;
      showThinking(true);
      let aiAns;
      try {
        const ai = await callAI({
          scene: '知识对决·AI作答',
          callType: 'quiz_answer_ai',
          situation: `题目：${q.question}\n选项：${opts.join(' / ')}`,
          state: publicState(),
          agent: '稳健派老李',
          options: opts,
        });
        bumpAiCount(S);
        aiAns = normIdx(ai.answer_index, opts.length);
      } finally {
        showThinking(false);
      }
      const humanRight = answerKnown && humanIdx === ans;
      const aiRight = answerKnown && aiAns === ans;
      if (humanRight) S.quiz.human += 1;
      if (aiRight) S.quiz.ai += 1;
      $('quiz-score').textContent = `${S.quiz.human} : ${S.quiz.ai}`;
      showThinking(true);
      let judge;
      try {
        judge = await callAI({
          scene: '知识对决·判分',
          callType: 'quiz_judge',
          situation: `标准答案 index=${ans}。玩家=${humanIdx}。AI=${aiAns}`,
          state: publicState(),
          operation: { human: humanIdx, ai: aiAns, answer_index: ans },
        });
        bumpAiCount(S);
        applyEffects(S, judge.effects || { 士气: humanRight ? 3 : -1 });
        audio.playSfx(humanRight ? 'correct' : 'wrong');
        $('quiz-feedback').innerHTML = `
          <div>你：<b>${humanRight ? '正确' : '错误'}</b> · AI：<b>${aiRight ? '正确' : '错误'}</b></div>
          <div style="margin-top:6px">${escapeHtml(answerKnown ? (q.explain || judge.explain || '') : '本题标准答案解析失败，双方均不计分。')}</div>
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
      await new Promise((r) => {
        next.onclick = () => { next.onclick = null; r(); };
        next.style.display = 'inline-block';
      });
      await afterJudge({
        narrative: `你答：${opts[humanIdx]}。标准答案：${opts[ans] ?? '（本题答案缺失）'}。${q.explain || ''}`,
      }, `知识对决 · ${act.title}`, act.facts?.[0]);
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

async function finishAct(act) {
  S.actLog.push({ id: act.id, title: act.title, 体力: S.体力, 信念: S.信念 });
  // 幕间 AI 总评
  try {
    showThinking(true);
    const review = await callAI({
      scene: `幕间总评·${act.title}`,
      callType: 'act_review',
      situation: `玩家完成 ${act.title}，行动：${(S.行动日志 || []).join('、') || '—'}，对决 ${S.quiz.human}:${S.quiz.ai}`,
      state: publicState(),
      extraContext: `幕记录：${JSON.stringify(S.actLog)}`,
    });
    if (review?.lines?.length) {
      toast(review.title || '本幕小结', 2800);
      appendCampLog(S, '总评', review.lines[0]);
    }
  } catch { /* 非阻塞 */ } finally {
    showThinking(false);
  }

  S.actIndex = (S.actIndex || 0) + 1;
  renderJourney();
  // 幕间压力结算：粮荒 + 成败判定
  if (await settlePressure(act)) return;
  const order = actsData.order || [];
  if (S.actIndex >= order.length) {
    await runEnding();
  } else {
    const next = actsData.acts[order[S.actIndex]];
    await marchTransition('前往 ' + next.title);
    await runActIntro();
  }
}

async function runEnding() {
  showScreen('screen-end');
  $('end-title').textContent = '结算中…';
  $('end-paras').innerHTML = '';
  $('end-history').innerHTML = '';
  showThinking(true);
  let end;
  try {
    end = await callAI({
      scene: '终局总评',
      callType: 'ending_review',
      situation: '长征五幕结束，综合资源、关系、抉择与对决',
      state: publicState(),
      extraContext: `幕记录：${JSON.stringify(S.actLog)}；对决 ${S.quiz.human}:${S.quiz.ai}；钓鱼最佳 ${(S.fishingBest || 0).toFixed(2)}`,
    });
    bumpAiCount(S);
  } finally {
    showThinking(false);
  }
  $('end-eyebrow').textContent = `终局 · ${end.ending_id || ''}`;
  $('end-title').textContent = end.title || '长征之后';
  for (const t of end.paragraphs || []) {
    const p = document.createElement('p');
    $('end-paras').appendChild(p);
    await typeText(p, t, 14);
  }
  $('end-history').innerHTML = (end.history_points || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('');
  renderStats(S);
  $('end-rel').innerHTML = COMPANIONS.map((c) => `${c.name}：${S[`好感_${c.name}`] ?? 40}`).join('<br/>');
  $('end-personal').textContent = end.personal || '';
  saveState(S);

  // 研学报告（教育/党建）
  try {
    showThinking(true);
    const report = await callAI({
      scene: '研学报告',
      callType: 'study_report',
      situation: '生成可给教师/党建干事的研学摘要',
      state: publicState(),
      extraContext: `结局=${end.ending_id}；史实解锁=${(S.unlockedFacts || []).join(',')}；对决=${S.quiz.human}:${S.quiz.ai}`,
    });
    const box = $('end-report');
    if (box && report) {
      box.classList.remove('hidden');
      $('report-summary').textContent = report.summary || '';
      $('report-knowledge').innerHTML = (report.knowledge || []).map((k) => `<li>${escapeHtml(k)}</li>`).join('');
      $('report-values').innerHTML = (report.values || []).map((k) => `<li>${escapeHtml(k)}</li>`).join('');
      $('report-suggest').textContent = report.suggest || '';
      S.lastReport = report;
    }
  } catch { /* optional */ } finally {
    showThinking(false);
  }

  const copyBtn = $('btn-copy-report');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const r = S.lastReport;
      const text = [
        `《长征·抉择》研学报告 — ${end.title || ''}`,
        r?.summary || '',
        '史实：' + (r?.knowledge || []).join('；'),
        '价值：' + (r?.values || []).join('；'),
        r?.suggest || '',
        '场景：天津移动 5G+红色研学 / 党建数字课堂 / 校园思政',
      ].join('\n');
      navigator.clipboard?.writeText(text).then(() => toast('报告已复制')).catch(() => toast('复制失败'));
    };
  }
  toast('全主线完成 · 可打开行军记录', 4000);
}

function publicState() {
  return {
    体力: S.体力, 粮食: S.粮食, 士气: S.士气, 信念: S.信念, 民心: S.民心,
    好感_老班长: S.好感_老班长, 好感_指导员: S.好感_指导员, 好感_红小鬼: S.好感_红小鬼,
    好感_卫生员: S.好感_卫生员, 好感_老乡: S.好感_老乡,
    tonightPassword: S.tonightPassword, 行动日志: S.行动日志, day: S.day, act: S.actIndex,
  };
}

void wait;
boot();
