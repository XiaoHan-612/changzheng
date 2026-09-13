import { COMPANIONS } from './data.js';
import { audio } from './audio.js';

export function $(id) {
  return document.getElementById(id);
}

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  const el = $(id);
  if (el) el.classList.remove('hidden');
  if (id !== 'screen-stage') {
    // 离开舞台屏时把舞台内容一起清掉：否则小游戏容器会作为"残留节点"留在 DOM 里，
    // 既有重复 id，也会让"元素存在即当前场景"的判断出错。
    document.querySelectorAll('#sheet-actions').forEach((n) => { n.innerHTML = ''; });
    const panel = $('stage-panel');
    if (panel) panel.innerHTML = '';
  }
  if (id === 'screen-camp') {
    const b = $('stage-banner');
    if (b) b.textContent = '';
    const dlg = $('dlg-body');
    if (dlg) dlg.textContent = '';
  }
}

export function showOverlay(id) {
  $(id)?.classList.remove('hidden');
  syncOverlayState();
}

export function hideOverlay(id) {
  $(id)?.classList.add('hidden');
  syncOverlayState();
}

/**
 * 浮层打开时把底层屏幕整体隐掉。
 *
 * 为什么不能只靠"压暗遮罩"：改成纸面之后，底层与浮层都是米黄纸，
 * 半透明遮罩压不住——回响卡后面会透出选项纸条和叙事文字，看起来像渲染错乱（踩过）。
 * 这里用 body.overlay-open 让 CSS 直接隐藏非浮层屏幕，浮层关闭后自动恢复。
 */
function syncOverlayState() {
  const anyOpen = [...document.querySelectorAll('.screen.overlay')].some((s) => !s.classList.contains('hidden'));
  document.body.classList.toggle('overlay-open', anyOpen);
}

export function setTopbar(on) {
  $('topbar').classList.toggle('hidden', !on);
}

export function renderStats(state) {
  const items = [
    { k: '体力', v: state.体力, max: 100 },
    { k: '粮食', v: state.粮食, max: 20 },
    { k: '士气', v: state.士气, max: 100 },
    { k: '信念', v: state.信念, max: 100 },
    { k: '民心', v: state.民心, max: 100 },
  ];
  $('stats').innerHTML = items
    .map((it) => {
      const warn = it.v <= (it.max === 20 ? 2 : 30);
      const good = it.v >= (it.max === 20 ? 10 : 70);
      return `<span class="stat ${warn ? 'warn' : good ? 'good' : ''}">${it.k}<b>${it.v}</b></span>`;
    })
    .join('');
  const ns = $('night-stats');
  if (ns) ns.innerHTML = $('stats').innerHTML;
  const es = $('end-stats');
  if (es) es.innerHTML = $('stats').innerHTML;
}

export function renderAp(state) {
  const dots = $('ap-dots');
  if (!dots) return;
  dots.innerHTML = '';
  for (let i = 0; i < state.maxAp; i++) {
    const d = document.createElement('span');
    d.className = 'ap-dot' + (i < state.ap ? ' on' : '');
    dots.appendChild(d);
  }
  $('day-num').textContent = String(state.day);
}

export function renderCompanions(state) {
  const box = $('companion-list');
  if (!box) return;
  box.innerHTML = COMPANIONS.map((c) => {
    const key = `好感_${c.name}`;
    const aff = state[key] ?? 40;
    // 好感档位：低（<30 朱红）/ 常规 / 高（>65 金），并给无障碍标签
    const band = aff < 30 ? ' low' : aff > 65 ? ' high' : '';
    const ava = c.img
      ? `<div class="comp-ava img" style="background-image:url('${c.img}')" title="${c.name}"></div>`
      : `<div class="comp-ava">${c.ava}</div>`;
    return `<div class="comp-item" title="${c.name} · 好感 ${aff}" aria-label="${c.name}，好感 ${aff}">
      ${ava}
      <div class="comp-meta"><b>${c.name}</b><span>${c.role}</span></div>
      <div class="comp-aff${band}">${aff}</div>
    </div>`;
  }).join('');
}

export function appendCampLog(state, tag, text) {
  state.campLog.unshift({ tag, text });
  const el = $('camp-log');
  if (!el) return;
  el.innerHTML = state.campLog
    .slice(0, 12)
    .map((l) => `<div><span class="tag">${l.tag}</span>${escapeHtml(l.text)}</div>`)
    .join('');
}

export function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

export function showThinking(on) {
  $('thinking').classList.toggle('hidden', !on);
  const el = $('thinking-elapsed');
  clearInterval(showThinking._t);
  if (!on) {
    if (el) el.textContent = '';
    return;
  }
  // 真调偶发 10s+，给个秒数，避免玩家以为卡死
  const t0 = Date.now();
  if (el) el.textContent = '';
  showThinking._t = setInterval(() => {
    const s = Math.round((Date.now() - t0) / 1000);
    if (el) el.textContent = s >= 3 ? ` · ${s}s` : '';
  }, 1000);
}

export function typeText(el, text, speed = 18) {
  return new Promise((resolve) => {
    el.textContent = '';
    el.classList.add('typing');
    let i = 0;
    const t = setInterval(() => {
      el.textContent = text.slice(0, i);
      i += 1;
      if (i > text.length) {
        clearInterval(t);
        el.classList.remove('typing');
        resolve();
      }
    }, speed);
  });
}

export function flashEffects(changes) {
  if (!changes?.length) return;
  const el = document.createElement('div');
  el.className = 'fx-flash';
  el.textContent = changes.join(' · ');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

export function setAiMode(cfg) {
  const el = $('ai-mode');
  if (!cfg) {
    el.textContent = '—';
    return;
  }
  el.textContent = cfg.hasKey ? (cfg.model || 'GLM') : '未配置 Key';
  el.classList.toggle('nokey', !cfg.hasKey);
}

export function bumpAiCount(state) {
  state.aiCount = (state.aiCount || 0) + 1;
  const el = $('ai-count');
  if (el) el.textContent = String(state.aiCount);
}

export function setPortrait(name, role, ava, mood, img) {
  $('portrait-name').textContent = name;
  $('portrait-role').textContent = role;
  const art = $('portrait-art');
  if (img) {
    art.textContent = '';
    art.classList.add('has-img');
    art.style.backgroundImage = `url('${img}')`;
  } else {
    art.classList.remove('has-img');
    art.style.backgroundImage = '';
    art.textContent = ava;
  }
  $('portrait-mood').textContent = mood || '平静';
}

export function setStageBanner(text, img) {
  const b = $('stage-banner');
  if (b) b.textContent = text;
  const bg = $('stage-bg') || $('sheet-backdrop');
  if (img && bg) {
    bg.style.backgroundImage = `url('${img}')`;
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center';
  }
}

export function setStagePanel(html) {
  $('stage-panel').innerHTML = html;
}

export async function say(speaker, text, voiceId) {
  $('dlg-speaker').textContent = speaker || '';
  // 预置语音后台播，不阻塞打字与流程
  audio.speak(text, speaker || '叙事', voiceId).catch(() => {});
  await typeText($('dlg-body'), text);
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderLogs(logs) {
  const list = $('logs-list');
  $('logs-meta').textContent = `共 ${logs.length} 条调用 · source 可辨 GLM / ERROR，具体模型与推理档位见 model 字段`;
  list.innerHTML = logs
    .slice()
    .reverse()
    .map((l) => {
      const src = (l.source || '').toLowerCase();
      const cls = src.includes('glm') ? 'glm' : src.includes('error') ? 'fallback' : '';
      const narr = l.response?.narrative || l.response?.reply || l.response?.scene_text || l.response?.title || '';
      const effects = l.appliedEffects && Object.keys(l.appliedEffects).length ? JSON.stringify(l.appliedEffects) : '';
      return `<div class="log-item">
        <div class="head">
          <span class="type">${escapeHtml(l.callType || l.scene || 'decide')}</span>
          <span class="src ${cls}">${escapeHtml(l.source || '—')}</span>
          <span class="muted">${escapeHtml((l.timestamp || '').slice(11, 19))}</span>
          <span class="muted">${l.durationMs ?? '—'}ms</span>
        </div>
        ${narr ? `<div class="narr">${escapeHtml(narr)}</div>` : ''}
        ${effects ? `<div class="muted">effects: ${escapeHtml(effects)}</div>` : ''}
        ${l.rawResponse ? `<pre>${escapeHtml(String(l.rawResponse).slice(0, 400))}</pre>` : ''}
      </div>`;
    })
    .join('');
}

export async function renderFacts(allFacts, unlocked) {
  const box = $('facts-list');
  const entries = Object.entries(allFacts || {});
  if (!entries.length) {
    box.innerHTML = '<p class="muted">暂无史实数据</p>';
    return;
  }
  box.innerHTML = entries
    .map(([id, f]) => {
      const open = unlocked?.includes(id);
      return `<div class="fact-card" style="${open ? '' : 'opacity:0.45'}">
        <h3>${escapeHtml(f.title)}${open ? '' : '（未解锁）'}</h3>
        <div class="date">${escapeHtml(f.date || '')}</div>
        <div class="row"><span class="label real">真实史实</span>${escapeHtml(f.real || '')}</div>
        <div class="row"><span class="label fic">虚构互动</span>${escapeHtml(f.fiction || '')}</div>
      </div>`;
    })
    .join('');
}
