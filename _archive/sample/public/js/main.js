import { requestDecision, fetchConfig, fetchLogs } from './ai-client.js';
import {
  camp, resetCamp, applyEffects, snapshot, remember,
  markLineDone, linesDoneCount, canNight,
} from './state.js';
import { FACTS, HUB_LINES } from './data.js';
import {
  $, show, hide, showScreen, toast, setThinking, renderStats, setAiBadge,
  bumpAiCount, typeLine, clearDialogue, setPortrait, setStageBanner, setStageBg,
  setPanel,
} from './ui.js';
import {
  runFishing, runCandy, runSentry, runSchool, runBendNeedle, renderChoices, runGomoku,
} from './minigames.js';

let config = { mockMode: true, model: 'glm-5.1' };
let introTimer = null;

async function boot() {
  try {
    config = await fetchConfig();
  } catch {
    config = { mockMode: true, model: 'glm-5.1' };
  }
  setAiBadge(config);
  renderStats();
  wireChrome();
  showScreen('screen-title');
}

function wireChrome() {
  $('btn-start').onclick = () => startNewRun(true);
  $('btn-skip-intro').onclick = () => startNewRun(false);
  $('btn-how').onclick = () => showScreen('screen-how');
  $('btn-how-back').onclick = () => showScreen('screen-title');
  $('btn-logs').onclick = () => openLogs();
  $('btn-logs-close').onclick = () => hide('screen-logs');
  $('btn-logs-refresh').onclick = () => openLogs();
  $('btn-facts').onclick = () => openFacts();
  $('btn-facts-close').onclick = () => hide('screen-facts');
  $('btn-night').onclick = () => runNight();
  $('btn-chat').onclick = () => openChat();
  $('btn-chat-close').onclick = () => hide('screen-chat');
  $('btn-exit-stage').onclick = () => {
    renderHub();
    showScreen('screen-hub');
  };
  $('btn-intro-skip').onclick = () => {
    stopIntro();
    enterHub();
  };
  $('chat-form').onsubmit = (e) => {
    e.preventDefault();
    sendChat();
  };
}

function startNewRun(withIntro) {
  resetCamp();
  $('ai-count').textContent = '0';
  renderStats();
  if (withIntro) playIntro();
  else enterHub();
}

/* ─── 开场运镜 ─── */
const INTRO_BEATS = [
  { text: '风从雪山上下来。队伍还在走。', hold: 3200 },
  { text: '有人停下来。火生起来了。', hold: 3200 },
  { text: '你的意识落进营地——可以附身到任何一个人。', hold: 3600 },
];

function playIntro() {
  showScreen('screen-intro');
  show('topbar');
  const slides = [...document.querySelectorAll('.intro-slide')];
  const cap = $('intro-caption');
  slides.forEach((s) => s.classList.remove('on'));
  cap.classList.remove('on');
  let i = 0;

  function step() {
    slides.forEach((s) => s.classList.remove('on'));
    if (i >= slides.length) {
      enterHub();
      return;
    }
    slides[i].classList.add('on');
    cap.textContent = INTRO_BEATS[i]?.text || '';
    cap.classList.add('on');
    const hold = INTRO_BEATS[i]?.hold || 3000;
    i += 1;
    introTimer = setTimeout(step, hold);
  }
  step();
}

function stopIntro() {
  if (introTimer) {
    clearTimeout(introTimer);
    introTimer = null;
  }
}

function enterHub() {
  stopIntro();
  show('topbar');
  renderHub();
  showScreen('screen-hub');
}

/* ─── 全景热点 ─── */
function renderHub() {
  const box = $('hotspots');
  box.innerHTML = '';
  for (const line of HUB_LINES) {
    const done = camp.linesDone.has(line.id);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hotspot' + (done ? ' done' : '');
    el.style.left = line.hx + '%';
    el.style.top = line.hy + '%';
    el.setAttribute('aria-label', `${line.name} · ${line.tag}`);
    el.innerHTML = `
      <span class="hotspot-pulse"></span>
      <span class="hotspot-pulse delay"></span>
      <span class="hotspot-ring"></span>
      <span class="hotspot-core"></span>
      <span class="hotspot-label">${line.name} · ${line.tag}${done ? ' ✓' : ''}</span>
    `;

    let holdTimer = null;
    let entered = false;

    const tryEnter = () => {
      if (entered) return;
      entered = true;
      enterLine(line);
    };

    const cancel = () => {
      el.classList.remove('charging');
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
    };

    el.addEventListener('click', (e) => {
      e.preventDefault();
      cancel();
      tryEnter();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tryEnter();
      }
    });

    box.appendChild(el);
  }

  const n = linesDoneCount();
  $('hub-progress').textContent = `已完成 ${n} / ${HUB_LINES.length} 条附身线`;

  const legend = $('hub-legend');
  if (legend) {
    legend.innerHTML = '';
    for (const line of HUB_LINES) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'legend-chip' + (camp.linesDone.has(line.id) ? ' done' : '');
      chip.textContent = line.name;
      chip.onclick = () => enterLine(line);
      legend.appendChild(chip);
    }
  }

  if (canNight()) show('btn-night');
  else hide('btn-night');
  renderStats();
}

/* ─── AI ─── */
async function decide(payload) {
  setThinking(true);
  try {
    const result = await requestDecision(payload);
    bumpAiCount(1);
    if (result?._fallback) toast('模型不可用，已降级叙事（日志有记）');
    if (result?.factId) {
      camp.facts.add(result.factId);
      toast('史实档案：' + (FACTS[result.factId]?.title || result.factId));
    }
    applyEffects(result?.effects);
    renderStats();
    return result;
  } catch (err) {
    toast('AI 调用失败：' + err.message);
    return { choice: '继续', reason: '网络异常', effects: {}, narrative: '（火边的声音一时听不清。）' };
  } finally {
    setThinking(false);
  }
}

const speak = (speaker, text) => typeLine(speaker, text);

async function enterLine(line) {
  showScreen('screen-stage');
  setStageBg(line.sceneClass);
  setPortrait(line.name, line.role, line.icon, '在做事', line.sceneImg);
  setStageBanner(`${line.name} · ${line.role}`);
  clearDialogue();
  setPanel('<p class="mg-hint">入戏…</p>');
  const mood = (m) => setPortrait(line.name, line.role, line.icon, m, line.sceneImg);

  try {
    if (line.id === 'wuziqi') await lineWuziqi(line, mood);
    else if (line.id === 'tanxin') await lineTanxin(line, mood);
    else if (line.id === 'laoban') await lineLaoban(line, mood);
    else if (line.id === 'zhidao') await lineZhidao(line, mood);
    else if (line.id === 'shaobing') await lineSentry(line, mood);
  } catch (err) {
    console.error(err);
    toast('这条线出了点问题：' + err.message);
  }

  markLineDone(line.id);
  remember(`完成附身线：${line.name}`);
  await speak(line.name, '（这一段做完了。回营地吧，别人还有事。）');
  renderHub();
  showScreen('screen-hub');
}

async function intro(line, situation, options) {
  const r = await decide({
    scene: `${line.name}·入戏`,
    situation,
    state: snapshot(),
    options,
  });
  remember(`${line.name}: ${r.narrative}`);
  await speak(line.name, r.narrative || '……');
  return r;
}

/* 五子棋 */
async function lineWuziqi(line, mood) {
  await intro(line, '两个小鬼在泥地上画了格，用石子下棋。输的人今晚多站一班岗。');
  mood?.('下棋');
  setStageBanner('泥地 · 五子棋');
  const g = await runGomoku($('stage-panel'));
  const r = await decide({
    scene: '两个小鬼·五子棋结算',
    situation: g.summary,
    state: snapshot(),
    operation: { type: 'gomoku', score: g.score, detail: g.detail, summary: g.summary },
    options: ['认输让他', '再来一局', '赢了让岗'],
  });
  remember(`五子棋：${r.narrative}`);
  await speak('小鬼', r.narrative);
  await speak('旁白', '石子收进口袋。岗还是要站的，只是心里轻快了些。');
}

/* 交谈战士 · 对话剧 */
async function lineTanxin(line, mood) {
  await intro(line, '两个人坐在草坡背风处。一个在说家，一个在说路。');
  mood?.('交谈');
  setStageBanner('对话 · 你想问什么');

  const q1 = await renderChoices(
    $('stage-panel'),
    '开口',
    '附身到其中一人，先问一句。',
    [
      { label: '家里还有什么人？', sub: '问归处' },
      { label: '你觉得能走出去吗？', sub: '问前路' },
      { label: '你怕不怕？', sub: '问心里' },
    ]
  );
  const r1 = await decide({
    scene: '交谈战士·对话',
    situation: `你问：${q1}`,
    state: snapshot(),
    options: [q1],
  });
  remember(`交谈：${r1.narrative}`);
  await speak('战士', r1.narrative);

  const q2 = await renderChoices(
    $('stage-panel'),
    '再问',
    '火快灭了。再问一句。',
    [
      { label: '把你的干粮分我一点', sub: '要东西' },
      { label: '明天我替你背枪', sub: '给承诺' },
      { label: '不问了，一起坐着', sub: '沉默' },
    ]
  );
  const r2 = await decide({
    scene: '交谈战士·对话续',
    situation: `你选择：${q2}`,
    state: snapshot(),
    options: [q2],
  });
  remember(`交谈续：${r2.narrative}`);
  await speak('战士', r2.narrative);
  if (r2.factId || r2.nextBeat) await speak('旁白', r2.nextBeat || '有些话不必说完。');
}

/* 老班长 */
async function lineLaoban(line, mood) {
  setStageBg('river');
  await intro(line, '你蹲在池塘边，手里一枚缝衣针。要弯成鱼钩。');
  mood?.('弯针');
  setStageBanner('第一步 · 弯针成钩');
  await runBendNeedle($('stage-panel'));
  await speak('老班长', '成了。穿上线，去水边。');

  mood?.('钓鱼');
  setStageBanner('第二步 · 咬钩起竿');
  const fish = await runFishing($('stage-panel'));
  const rFish = await decide({
    scene: '老班长·钓鱼结算',
    situation: '你在池塘边守漂',
    state: snapshot(),
    operation: { type: 'fishing', score: fish.score, detail: fish.detail, summary: fish.summary },
    options: ['把鱼全煮进锅', '留半条给伤员', '只喝汤，肉全给病号'],
  });
  remember(`钓鱼：${rFish.narrative}`);
  await speak('老班长', rFish.narrative);

  mood?.('分汤');
  setStageBanner('第三步 · 这锅汤怎么分');
  const pick = await renderChoices($('stage-panel'), '分汤', '稠的给谁？', [
    { label: '优先伤员与病号', sub: '自己喝清汤' },
    { label: '全班平均分', sub: '谁也别特殊' },
    { label: '先紧着明天抬担架的', sub: '力气活的人' },
  ]);
  const rSoup = await decide({
    scene: '老班长·分汤仲裁',
    situation: `你选择了：${pick}`,
    state: snapshot(),
    options: [pick],
    extraContext: `钓鱼表现：${fish.summary}`,
  });
  remember(`分汤：${rSoup.narrative}`);
  await speak('老班长', rSoup.narrative);
  await speak('旁白', '锅空了，人还在。');
}

/* 指导员 · 对话 + 口令 */
async function lineZhidao(line, mood) {
  setStageBg('school');
  await intro(line, '指导员就着灯看行军图。他没抬头，先问了你一句。');
  mood?.('看图');
  setStageBanner('对话 · 行军图');

  const ask = await renderChoices($('stage-panel'), '他问你', '「要是你，走哪边？」', [
    { label: '走近路，哪怕陡', sub: '快' },
    { label: '绕远，稳一点', sub: '稳' },
    { label: '先派两个人探', sub: '保险' },
  ]);
  const r = await decide({
    scene: '指导员·路线对话',
    situation: `你答：${ask}`,
    state: snapshot(),
    options: [ask],
    extraContext: '请在叙事中自然带出今晚口令是「瑞金」，并说明为什么选稳。',
  });
  remember(`指导员：${r.narrative}`);
  await speak('指导员', r.narrative);

  camp.tonightPassword = camp.tonightPassword || '瑞金';
  toast(`今晚口令：「${camp.tonightPassword}」（夜岗会用到）`);
  await speak('旁白', '他把图折好，又在背面写了一个字，吹干墨迹。');
}

/* 夜岗 */
async function lineSentry(line, mood) {
  setStageBg('night');
  await intro(line, '换岗了。风从河谷上来。这一夜，营地交给你。');
  mood?.('站岗');
  setStageBanner('夜岗 · 五个信号');
  const pw = camp.tonightPassword;
  const result = await runSentry(pw, $('stage-panel'));
  const r = await decide({
    scene: '哨兵·夜岗判定',
    situation: result.summary,
    state: snapshot(),
    operation: { type: 'sentry', score: result.score, detail: result.detail, summary: result.summary },
    options: ['加岗', '按原编制', '叫醒排长汇报'],
  });
  remember(`夜岗：${r.narrative}`);
  await speak('夜岗战士', r.narrative);
  await speak('旁白', pw ? `你想起今晚口令是「${pw}」。` : '你没问到口令，全靠沉住气。');
}

/* 夜间 + 终局 */
async function runNight() {
  showScreen('screen-night');
  $('night-title').textContent = '篝火 · 深夜';
  $('night-lead').textContent = '完成至少三条附身线后，营地把决定权交给你们。选项由 glm-5.1 生成。';
  const stats = $('night-stats');
  stats.innerHTML = '';
  for (const [k, v] of Object.entries({
    体力: camp.体力, 食物: camp.食物, 药品: camp.药品,
    士气: camp.士气, 信念: camp.信念, 安全: camp.安全,
  })) {
    stats.insertAdjacentHTML('beforeend', `<div class="stat">${k}<b>${v}</b></div>`);
  }

  const body = $('night-body');
  body.innerHTML = '<p class="muted">正在请模型生成今夜的抉择…</p>';

  const memoryHint = camp.memory.slice(-10).join('；');
  const gen = await decide({
    scene: '篝火议事·生成抉择',
    situation: '深夜，必须决定后半夜怎么过、明天口粮怎么带。',
    state: snapshot(),
    options: [],
    extraContext: `今日记忆：${memoryHint || '（刚开始）'}`,
    systemPrompt:
      '你是《附身·长征营地》的叙事引擎。生成今夜 2 个互斥抉择，JSON：' +
      '{"options":[{"label":"不超过18字","sub":"不超过24字"},{"label":"...","sub":"..."}],"lead":"40字内引导语"}' +
      '只返回 JSON。符合1935行军语境，不编造真实人名。',
  });

  let options = gen?.options;
  if (!Array.isArray(options) || options.length < 2) {
    options = [
      { label: '加岗并匀出口粮', sub: '安全优先，明天更苦' },
      { label: '原编制休息，伤员优先', sub: '保留体力赶路' },
    ];
  }
  if (gen?.lead) $('night-lead').textContent = gen.lead;

  body.innerHTML = '';
  const pick = await renderChoices(body, '今夜', '选择后，模型将书写当夜之后。', options);

  const night = await decide({
    scene: '夜间大抉择',
    situation: `你决定：${pick}`,
    state: snapshot(),
    options: options.map((o) => o.label),
    extraContext: memoryHint,
  });
  remember(`夜间：${night.narrative}`);

  const ending = await decide({
    scene: '终局',
    situation: '写下这一夜之后，队伍的去向与你的寄语。',
    state: snapshot(),
    options: ['守望', '同行', '未竟'],
    extraContext: `整局记忆：${camp.memory.join('；')}`,
  });

  const title = ending.choice || '同行';
  body.innerHTML = `
    <div class="ending-title">${title}</div>
    <div class="ending-body">${night.narrative || ''}\n\n${ending.narrative || ''}</div>
    <p class="muted" style="text-align:center">互动为基于史实的虚构体验 · 真实长征是无数人的共同选择</p>
    <div class="ending-actions">
      <button type="button" class="btn primary" id="btn-end-logs">查看行军记录</button>
      <button type="button" class="btn ghost" id="btn-end-facts">史实档案</button>
      <button type="button" class="btn" id="btn-end-restart">再来一局</button>
    </div>
  `;
  $('btn-end-logs').onclick = () => openLogs();
  $('btn-end-facts').onclick = () => openFacts();
  $('btn-end-restart').onclick = () => {
    renderHub();
    showScreen('screen-hub');
  };
  $('night-title').textContent = '出发之前';
  toast('一局完成。行军记录里是每一次 glm-5.1 调用。');
}

/* 日志 / 史实 / 闲谈 */
async function openLogs() {
  show('screen-logs');
  const meta = $('logs-meta');
  const list = $('logs-list');
  list.innerHTML = '<p class="muted">读取中…</p>';
  try {
    const data = await fetchLogs('session');
    const logs = (data.logs || []).slice().reverse();
    meta.textContent = `共 ${data.count || 0} 条 · 模型 ${config.model || 'glm-5.1'} · ${config.mockMode ? '演示模式 MOCK' : '真实调用'}`;
    if (!logs.length) {
      list.innerHTML = '<p class="muted">还没有调用记录。</p>';
      return;
    }
    list.innerHTML = logs
      .map((log) => {
        const src = log.source === 'GLM-5.1' ? 'glm' : log.source === 'MOCK_AI' ? 'mock' : 'fb';
        const srcLabel = log.source === 'GLM-5.1' ? 'GLM-5.1' : log.source === 'MOCK_AI' ? 'MOCK' : 'FALLBACK';
        const narr = log.response?.narrative || log.response?.reason || '';
        const eff = log.appliedEffects && Object.keys(log.appliedEffects).length
          ? Object.entries(log.appliedEffects).filter(([, v]) => v).map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`).join(' ')
          : '';
        return `<div class="log-item">
          <div class="log-head">
            <span class="src ${src}">${srcLabel}</span>
            <span class="scene">${escapeHtml(log.scene || '')}</span>
            <span class="time">${escapeHtml((log.timestamp || '').replace('T', ' ').slice(0, 19))}</span>
            <span class="time">${log.durationMs || 0}ms</span>
          </div>
          ${narr ? `<div class="narr">${escapeHtml(String(narr).slice(0, 160))}</div>` : ''}
          ${eff ? `<div class="eff">${escapeHtml(eff)}</div>` : ''}
        </div>`;
      })
      .join('');
  } catch (err) {
    list.innerHTML = `<p class="muted">读取失败：${escapeHtml(err.message)}</p>`;
  }
}

function openFacts() {
  show('screen-facts');
  const list = $('facts-list');
  list.innerHTML = Object.entries(FACTS)
    .map(([id, f]) => {
      const unlocked = camp.facts.has(id);
      if (!unlocked) return `<div class="fact-card"><h3>（未解锁）</h3><p>在附身线中触发后可读。</p></div>`;
      return `<div class="fact-card">
        <h3>${escapeHtml(f.title)}</h3>
        <p><strong>${escapeHtml(f.date)}</strong></p>
        <p>${escapeHtml(f.real)}</p>
        <div class="fiction">【虚构互动】${escapeHtml(f.fiction)}</div>
      </div>`;
    })
    .join('');
}

function openChat() {
  show('screen-chat');
  const log = $('chat-log');
  if (!log.dataset.seeded) {
    log.dataset.seeded = '1';
    log.innerHTML = '';
    addChat('ai', '火堆噼啪响。你想问什么？比如「老班长为什么不吃鱼」。');
  }
  $('chat-input').focus();
}

function addChat(who, text) {
  const log = $('chat-log');
  const b = document.createElement('div');
  b.className = 'chat-bubble ' + who;
  b.textContent = text;
  log.appendChild(b);
  log.scrollTop = log.scrollHeight;
}

async function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addChat('me', text);
  const r = await decide({
    scene: '篝火闲谈',
    situation: text,
    state: snapshot(),
    options: [],
    extraContext: `已解锁史实：${[...camp.facts].join(',') || '无'}。以营地中某位战士口吻回答，40-80字，克制。`,
  });
  addChat('ai', r.narrative || r.reason || '……');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

boot();
