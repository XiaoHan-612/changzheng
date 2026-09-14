/**
 * 自由行军沙盘 v2 — 有图、有声、人物有记忆、可存档
 * 一句话行动 → 模型裁判 + 世界推进 + NPC 反应 → 事件图卡 + 语音
 */
import { runSimTurn, decide } from './ai-client.js';
import { kernel } from './kernel/index.js';

const START_PEOPLE = [
  { name: '老班长', status: '正常', goal: '把队伍完整带出去', memory: [] },
  { name: '卫生员', status: '正常', goal: '把伤员送到底', memory: [] },
  { name: '红小鬼', status: '正常', goal: '不拖后腿', memory: [] },
  { name: '向导老乡', status: '正常', goal: '把人送到硬地', memory: [] },
  { name: '新兵', status: '正常', goal: '证明自己能跟上', memory: [] },
];

const MAX_DAYS = 7;
const SAVE_KEY = 'czjc_sandbox_world_v2';

const $ = (id) => document.getElementById(id);

// 表单监听只绑一次；重复进入沙盘时用 activeSubmit 指向当前实例，
// 否则每次重进都会叠加一个 submit 处理器，一次行动触发多次调用。
let activeSubmit = null;
let formBound = false;

function bindSandboxFormOnce() {
  if (formBound) return;
  formBound = true;
  $('sb-form').addEventListener('submit', (e) => {
    e.preventDefault();
    activeSubmit?.($('sb-input').value);
  });
}

export function createSandboxWorld() {
  return {
    place: '草地边缘',
    day: 1,
    people: START_PEOPLE.map((p) => ({ ...p, memory: [] })),
    food: 4,
    morale: 58,
    stamina: 72,
    intel: [],
    lastTurn: '（开局）',
    turn: 0,
    tension: 0.5,
    log: [],
    visual: 'camp',
  };
}

export function saveWorld(w) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(w));
  } catch { /* ignore */ }
}

export function loadWorld() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw);
    if (!w || !Array.isArray(w.people)) return null;
    return w;
  } catch {
    return null;
  }
}

export function clearWorld() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

function setBar(barId, numId, val, max) {
  const pct = Math.max(0, Math.min(100, (val / max) * 100));
  $(barId).style.width = pct + '%';
  $(numId).textContent = String(val);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function renderWorld(w) {
  $('sb-day').textContent = String(w.day);
  $('sb-place').textContent = w.place;
  setBar('sb-food', 'sb-food-n', w.food, 10);
  setBar('sb-morale', 'sb-morale-n', w.morale, 100);
  setBar('sb-stamina', 'sb-stamina-n', w.stamina, 100);
  $('sb-people').innerHTML = w.people
    .map((p) => {
      const cls = /牺牲|掉队/.test(p.status) ? 'down' : /伤/.test(p.status) ? 'hurt' : '';
      const mem = (p.memory || []).slice(-1)[0];
      return `<div class="sb-person ${cls}" title="${esc(p.goal || '')}">
        <span>${esc(p.name)}</span>
        <span class="st">${esc(p.status)}</span>
      </div>
      ${p.goal ? `<div class="sb-goal">目标 · ${esc(p.goal)}</div>` : ''}
      ${mem ? `<div class="sb-mem">记 · ${esc(mem)}</div>` : ''}`;
    })
    .join('');
  $('sb-intel').innerHTML = w.intel.length
    ? w.intel.map((i) => `<li>${esc(i)}</li>`).join('')
    : '<li class="empty">还没有情报。</li>';
  // 事件图卡
  const tag = w.visual || 'march';
  const bg = $('sb-scene');
  if (bg) {
    bg.style.backgroundImage = `url('${VISUALS[tag] || VISUALS.march}')`;
  }
  const tagEl = $('sb-scene-tag');
  if (tagEl) tagEl.textContent = TAG_LABEL[tag] || '行军';
  saveWorld(w);
}

const DEFAULT_VISUALS = {
  rain: '/assets/events/ev_rain.jpg',
  night_march: '/assets/events/ev_night_march.jpg',
  starve: '/assets/events/ev_starve.jpg',
  village: '/assets/events/ev_village.jpg',
  loss: '/assets/events/ev_loss.jpg',
  river: '/assets/events/ev_river.jpg',
  march: '/assets/events/ev_night_march.jpg',
  camp: '/assets/scenes/camp_pano.jpg',
};
const DEFAULT_TAG_LABEL = {
  rain: '雨中行军', night_march: '夜行', starve: '断粮', village: '遇见老乡',
  loss: '有人留下', river: '涉水', march: '草地行军', camp: '宿营',
};

// 事件图与标签的唯一真相在 data/sim-visuals.json，这里只做兜底
let VISUALS = { ...DEFAULT_VISUALS };
let TAG_LABEL = { ...DEFAULT_TAG_LABEL };

async function loadSimVisuals() {
  try {
    const res = await fetch('/api/data/sim-visuals');
    if (!res.ok) return;
    const j = await res.json();
    const tags = j?.tags || {};
    const imgs = {};
    const labels = {};
    for (const [k, v] of Object.entries(tags)) {
      if (v?.img) imgs[k] = v.img;
      if (v?.label) labels[k] = v.label;
    }
    if (Object.keys(imgs).length) VISUALS = { ...VISUALS, ...imgs };
    if (Object.keys(labels).length) TAG_LABEL = { ...TAG_LABEL, ...labels };
    if (j?.reactions) REACTION_FILE = { ...REACTION_FILE, ...j.reactions };
  } catch { /* 用内置兜底 */ }
}

/** 角色 → 反应语音（仅固定台词命中，模型自由句静默） */
const REACTION_VOICE = {
  老班长: { 反对: 'laoban_oppose', 支持: 'laoban_support', 担忧: 'laoban_support', 沉默: null },
  卫生员: { 担忧: 'weisheng_worry', 反对: 'weisheng_worry', 支持: 'weisheng_worry', 沉默: null },
  红小鬼: { 支持: 'xiaogui_stubborn', 反对: 'xiaogui_stubborn', 担忧: 'xiaogui_stubborn', 沉默: null },
  向导老乡: { 支持: 'guide_advice', 担忧: 'guide_advice', 反对: 'guide_advice', 沉默: null },
  新兵: { 担忧: 'recruit_guilt', 反对: 'recruit_guilt', 支持: 'recruit_guilt', 沉默: null },
};
let REACTION_FILE = {
  laoban_oppose: '/audio/reactions/laoban_oppose.wav',
  laoban_support: '/audio/reactions/laoban_support.wav',
  weisheng_worry: '/audio/reactions/weisheng_worry.wav',
  xiaogui_stubborn: '/audio/reactions/xiaogui_stubborn.wav',
  guide_advice: '/audio/reactions/guide_advice.wav',
  recruit_guilt: '/audio/reactions/recruit_guilt.wav',
};

function playReactionVoice(npc) {
  const map = REACTION_VOICE[npc?.name];
  if (!map) return;
  const id = map[npc.stance] || map.支持;
  if (!id) return;
  const file = REACTION_FILE[id];
  if (!file) return;
  // 走语音通道（门面）：与台词同一套打断/静音语义，音量也归混音表管
  kernel.emit('voice:say', { text: '', file });
}

function pushFeed(html) {
  const feed = $('sb-feed');
  const el = document.createElement('div');
  el.innerHTML = html;
  el.querySelectorAll(':scope > *').forEach((n) => feed.appendChild(n));
  feed.scrollTop = feed.scrollHeight;
}

/**
 * 清掉「模型在推演…」气泡。
 * 注意：气泡自身就带 .thinking，用 element.querySelector('.thinking') 只会找后代，
 * 永远匹配不到，气泡会一直留在纪事里（历史遗留 bug）。
 */
function clearThinkingBubbles() {
  $('sb-feed').querySelectorAll('.turn.thinking').forEach((n) => n.remove());
}

export function feedOpening(w) {
  $('sb-feed').innerHTML = '';
  pushFeed(`<div class="turn">
    <div class="ev-card" style="background-image:url('${VISUALS.camp}')">
      <span class="ev-tag">${TAG_LABEL.camp}</span>
    </div>
    <div class="act-line">第 ${w.day} 天 · ${esc(w.place)}</div>
    <div class="narr">暮色压下来时，队伍在一块略高的草甸上停下。没人说话，只听见呼吸和风。你要带他们走出去。</div>
    <div class="npc"><span class="who">老班长</span><span class="say">「今天先歇还是再走一段？你定。」</span></div>
  </div>`);
}

function deltaText(effects) {
  if (!effects) return '';
  const map = { food: '粮食', morale: '士气', stamina: '体力' };
  return Object.entries(effects)
    .filter(([, v]) => typeof v === 'number' && v !== 0)
    .map(([k, v]) => `${map[k] || k} ${v > 0 ? '+' : ''}${v}`)
    .join(' · ');
}

function applyWorld(w, result) {
  const e = result.effects || {};
  if (typeof e.food === 'number') w.food = Math.max(0, Math.min(10, w.food + e.food));
  if (typeof e.morale === 'number') w.morale = Math.max(0, Math.min(100, w.morale + e.morale));
  if (typeof e.stamina === 'number') w.stamina = Math.max(0, Math.min(100, w.stamina + e.stamina));

  const d = result.world_delta || {};
  if (d.place) w.place = d.place;
  if (Array.isArray(d.people_change)) {
    for (const ch of d.people_change) {
      if (!ch?.name) continue;
      let p = w.people.find((x) => x.name === ch.name);
      if (!p) {
        p = { name: ch.name, status: '正常', goal: '', memory: [] };
        w.people.push(p);
      }
      if (ch.status) p.status = ch.status;
      if (ch.note) p.note = ch.note;
      if (ch.goal) p.goal = ch.goal;
      if (ch.memory) {
        p.memory = p.memory || [];
        p.memory.push(String(ch.memory).slice(0, 40));
        if (p.memory.length > 3) p.memory = p.memory.slice(-3);
      }
    }
  }
  if (Array.isArray(d.intel_add)) {
    for (const i of d.intel_add) if (i && !w.intel.includes(i)) w.intel.push(i);
  }
  if (typeof d.day_advance === 'number' && d.day_advance > 0) w.day += d.day_advance;
  if (typeof result.tension === 'number') w.tension = result.tension;
  if (result.visual && VISUALS[result.visual]) w.visual = result.visual;
  w.lastTurn = result.verdict || '';
}

function renderTurn(w, action, result) {
  const v = result.feasible || 'yes';
  const vTxt = v === 'yes' ? '可行' : v === 'hard' ? '可行·有代价' : '不可行';
  const tag = result.visual && VISUALS[result.visual] ? result.visual : 'march';
  const img = VISUALS[tag];
  const label = TAG_LABEL[tag] || '行军';
  const npcs = (result.npc_reactions || [])
    .map((n) => {
      const oppose = n.stance === '反对' ? 'oppose' : '';
      return `<div class="npc ${oppose}"><span class="who">${esc(n.name)}</span><span class="say">${esc(n.line)}</span></div>`;
    })
    .join('');
  const deltas = deltaText(result.effects);
  pushFeed(`<div class="turn">
    <div class="ev-card" style="background-image:url('${img}')">
      <span class="ev-tag">${esc(label)}</span>
    </div>
    <div class="act-line">▸ ${esc(action)}<span class="verdict ${v}">${vTxt}</span></div>
    <div class="narr">${esc(result.narrative || '')}</div>
    ${npcs}
    ${deltas ? `<div class="deltas">${esc(deltas)}</div>` : ''}
  </div>`);
  const first = (result.npc_reactions || []).find((n) => n && n.name && n.stance !== '沉默');
  if (first) playReactionVoice(first);
}

function renderSuggestions(list, onPick) {
  const box = $('sb-suggest');
  box.innerHTML = '';
  // 真调实测模型可能漏掉 suggestions 字段；兜底三条，别让玩家无路可走
  const DEFAULT_SUGGESTIONS = [
    '先就地休整，派人去找吃的东西',
    '用绳子把队伍串起来走',
    '打着手电往前探一段路',
  ];
  const items = Array.isArray(list)
    ? list.filter((s) => typeof s === 'string' && s.trim()).slice(0, 3)
    : [];
  (items.length ? items : DEFAULT_SUGGESTIONS).forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sug';
    b.textContent = s;
    b.onclick = () => onPick(s);
    box.appendChild(b);
  });
}

function checkCollapse(w) {
  const alive = w.people.filter((p) => !/牺牲|掉队/.test(p.status)).length;
  if (w.stamina <= 0) return '你走不动了，队伍必须把你架上担架。';
  if (alive <= 1) return '队伍只剩下一个人还能走。';
  if (w.food <= 0 && w.day >= 4) return '断粮太久，靠草根和皮带撑不了几天。';
  return null;
}

async function runSimEnding(w, reason) {
  pushFeed('<div class="turn thinking">模型在写这一段路的小结…</div>');
  try {
    const end = await decide({
      scene: '沙盘收尾',
      callType: 'ending_review',
      situation: reason,
      state: { 体力: w.stamina, 粮食: w.food, 士气: w.morale, 信念: 60, 民心: 50 },
      extraContext: `天数 ${w.day}，地点 ${w.place}，损失 ${w.people.filter((p) => /掉队|牺牲/.test(p.status)).map((p) => p.name).join('、') || '无'}；行动 ${w.log.map((l) => l.action).join('；')}`,
    });
    window.__pushAiFeed?.({
      callType: 'ending_review',
      scene: '沙盘收尾',
      ms: 0,
        model: 'glm',
      snippet: end.title || '',
    });
    clearThinkingBubbles();
    pushFeed(`<div class="turn">
      <div class="act-line">${esc(end.title || '这一段路')}</div>
      <div class="narr">${(end.paragraphs || []).map(esc).join('<br/><br/>')}</div>
      <div class="deltas">${(end.history_points || []).map(esc).join(' · ')}</div>
      ${end.personal ? `<div class="deltas">${esc(end.personal)}</div>` : ''}
    </div>`);
    renderSuggestions(['回到标题'], () => window.__sbExit?.());
  } catch {
    clearThinkingBubbles();
    pushFeed(`<div class="turn"><div class="narr">你在 ${w.day} 天里做了 ${w.log.length} 次决策。这一段路告一段落。</div></div>`);
    renderSuggestions(['回到标题'], () => window.__sbExit?.());
  }
}

export async function bindSandbox({ onExit }) {
  await loadSimVisuals();
  const exit = () => {
    activeSubmit = null;
    onExit && onExit();
  };
  window.__sbExit = exit;
  const saved = loadWorld();
  const state = { world: saved || createSandboxWorld(), busy: false, restored: !!saved };

  kernel.emit('scene:enter', { name: 'sandbox' });   // 自由行军：只铺环境床，不配乐（见 scene-table.js）
  renderWorld(state.world);
  if (state.restored) {
    pushFeed(`<div class="turn">
      <div class="act-line">续上存档 · 第 ${state.world.day} 天 · ${esc(state.world.place)}</div>
      <div class="narr">你记得上一段路走到哪里。队伍还在，火堆还在。</div>
    </div>`);
    const last = state.world.log.slice(-1)[0];
    pushFeed(`<div class="turn"><div class="deltas">上次行动：${esc(last?.action || '（无）')}　${esc(last?.verdict || '')}</div></div>`);
    renderSuggestions(['继续往前走', '派两个人去打探', '就地休整'], (s) => submit(s));
  } else {
    feedOpening(state.world);
    renderSuggestions(['先就地休整，派人找吃的', '用绳子把队伍串起来走', '打着手电探一段路'], (s) => submit(s));
  }

  async function submit(text) {
    if (state.busy) return;
    const action = String(text || '').trim();
    if (!action) return;
    state.busy = true;
  kernel.emit('sfx:play', { name: 'click' });
  $('sb-input').value = '';
  $('sb-suggest').innerHTML = '';
  pushFeed('<div class="turn thinking">模型在推演这一手…</div>');

  let result;
  const t0 = Date.now();
    try {
      result = await runSimTurn({ world: state.world, action });
      kernel.emit('sfx:play', { name: 'echo' });
      window.__pushAiFeed?.({
        callType: 'sim_turn',
        scene: `沙盘·${state.world.place}`,
        ms: Date.now() - t0,
        model: 'glm',
        snippet: result.verdict || (result.narrative || '').slice(0, 60),
      });
    } catch (e) {
      clearThinkingBubbles();
      pushFeed(`<div class="turn"><div class="narr">推演失败：${esc(e.message)}</div></div>`);
      state.busy = false;
      // 失败也要给回可点的下一步，别让玩家卡死
      renderSuggestions(null, (s) => submit(s));
      return;
    }

    clearThinkingBubbles();

    applyWorld(state.world, result);
    renderTurn(state.world, action, result);
    // 先登记日志再渲染，避免存档落到上一回合
    state.world.log.push({ day: state.world.day, action, verdict: result.verdict });
    renderWorld(state.world);
    renderSuggestions(result.suggestions, (s) => submit(s));

    const collapse = checkCollapse(state.world);
    if (collapse) {
      kernel.emit('sfx:play', { name: 'wrong' });
      pushFeed(`<div class="turn"><div class="act-line">行军中断</div><div class="narr">${esc(collapse)}</div></div>`);
      await runSimEnding(state.world, collapse);
      clearWorld();
    } else if (state.world.day > MAX_DAYS) {
      await runSimEnding(state.world, '走出了这一段草地');
      clearWorld();
    }
    state.busy = false;
  }

  activeSubmit = (text) => submit(text);
  bindSandboxFormOnce();

  // 重开按钮
  const reset = $('btn-sb-reset');
  if (reset) {
    reset.onclick = () => {
      clearWorld();
      kernel.emit('scene:enter', { name: 'title' });
      exit();
    };
  }

  // 语音输入
  const mic = $('sb-mic');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    mic.disabled = true;
    mic.title = '当前浏览器不支持语音输入';
  } else {
    let rec = null;
    mic.onclick = () => {
      if (rec) {
        rec.stop();
        rec = null;
        $('sb-form').classList.remove('rec');
        return;
      }
      rec = new SR();
      rec.lang = 'zh-CN';
      rec.interimResults = true;
      rec.onresult = (ev) => {
        const txt = [...ev.results].map((r) => r[0].transcript).join('');
        $('sb-input').value = txt;
      };
      rec.onend = () => {
        rec = null;
        $('sb-form').classList.remove('rec');
        if ($('sb-input').value.trim()) submit($('sb-input').value);
      };
      rec.onerror = () => {
        rec = null;
        $('sb-form').classList.remove('rec');
      };
      $('sb-form').classList.add('rec');
      try { rec.start(); } catch { /* ignore */ }
    };
  }

  return { world: state.world, submit };
}
