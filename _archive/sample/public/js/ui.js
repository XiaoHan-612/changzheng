import { camp } from './state.js';

export function $(id) {
  return document.getElementById(id);
}

export function show(el) {
  if (typeof el === 'string') el = $(el);
  if (el) el.classList.remove('hidden');
}

export function hide(el) {
  if (typeof el === 'string') el = $(el);
  if (el) el.classList.add('hidden');
}

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  show(id);
}

export function toast(msg, ms = 2800) {
  const t = $('toast');
  t.textContent = msg;
  show(t);
  clearTimeout(t._timer);
  t._timer = setTimeout(() => hide(t), ms);
}

export function setThinking(on) {
  if (on) show('thinking');
  else hide('thinking');
}

export function renderStats() {
  const box = $('camp-stats');
  if (!box) return;
  const items = [
    ['体力', camp.体力],
    ['食物', camp.食物],
    ['药品', camp.药品],
    ['士气', camp.士气],
    ['信念', camp.信念],
    ['安全', camp.安全],
  ];
  box.innerHTML = items
    .map(([k, v]) => {
      const warn = typeof v === 'number' && v < 25 ? ' warn' : '';
      return `<div class="stat${warn}">${k}<b>${v}</b></div>`;
    })
    .join('');
}

export function setAiBadge(config) {
  const mode = $('ai-mode');
  if (!mode) return;
  if (config?.mockMode) {
    mode.textContent = '演示模式 MOCK';
    mode.classList.add('mock');
  } else {
    mode.textContent = `glm-5.1 · ${config.model || ''}`.trim();
    mode.classList.remove('mock');
  }
}

export function bumpAiCount(n = 1) {
  camp.aiCalls += n;
  const el = $('ai-count');
  if (el) el.textContent = String(camp.aiCalls);
}

/** 打字机对话 */
export function typeLine(speaker, text, { instant = false } = {}) {
  return new Promise((resolve) => {
    const sp = $('dlg-speaker');
    const body = $('dlg-body');
    const next = $('dlg-next');
    sp.textContent = speaker || '';
    body.textContent = '';
    next.textContent = instant ? '点击继续' : '…';
    next.style.opacity = '0.4';

    if (instant) {
      body.textContent = text;
      next.textContent = '点击继续';
      next.style.opacity = '1';
      bindNext(resolve);
      return;
    }

    let i = 0;
    const speed = 22;
    const timer = setInterval(() => {
      i += 1;
      body.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(timer);
        next.textContent = '点击继续';
        next.style.opacity = '1';
        bindNext(resolve);
      }
    }, speed);

    function bindNext(cb) {
      const panel = $('dialogue');
      const handler = () => {
        panel.removeEventListener('click', handler);
        document.removeEventListener('keydown', keyHandler);
        cb();
      };
      const keyHandler = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          handler();
        }
      };
      panel.addEventListener('click', handler);
      document.addEventListener('keydown', keyHandler);
    }
  });
}

export function clearDialogue() {
  $('dlg-speaker').textContent = '';
  $('dlg-body').textContent = '';
  $('dlg-next').textContent = '';
}

export function setPortrait(name, role, icon, mood, sceneUrl) {
  $('portrait-name').textContent = name || '—';
  $('portrait-role').textContent = role || '';
  const art = $('portrait-art');
  if (sceneUrl) {
    art.textContent = '';
    art.style.backgroundImage =
      `linear-gradient(180deg, rgba(10,12,14,0.12), rgba(10,12,14,0.5)), url('${sceneUrl}')`;
    art.style.backgroundSize = 'cover';
    art.style.backgroundPosition = 'center 30%';
  } else {
    art.style.backgroundImage = '';
    art.textContent = icon || '';
  }
  $('portrait-mood').textContent = mood ? `此刻 · ${mood}` : '平静';
}

export function setStageBanner(text) {
  $('stage-banner').textContent = text || '';
}

export function setStageBg(cls) {
  const bg = $('stage-bg');
  bg.className = 'stage-bg' + (cls ? ' ' + cls : '');
}

export function setPanel(html) {
  $('stage-panel').innerHTML = html;
}

export function setPanelEl(el) {
  const panel = $('stage-panel');
  panel.innerHTML = '';
  if (el) panel.appendChild(el);
}
