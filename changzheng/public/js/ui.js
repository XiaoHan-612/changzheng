import { COMPANIONS } from './data.js';
import { kernel } from './kernel/index.js';

export function $(id) {
  return document.getElementById(id);
}

/**
 * 重放一次入场动效。
 *
 * 为什么需要：动画不会因为"内容换了"自己重跑——同一个元素两次渲染同一类动画时浏览器不会重启动画，
 * 所以必须"摘类 → 强制重排 → 挂类"。这是全项目唯一的重放实现，别处不要再手写一遍。
 */
export function replayAnim(el, cls) {
  if (!el || !cls) return;
  el.classList.remove(cls);
  void el.offsetWidth;      // 读一次布局，强制重排，动画才会从 0 重新开始
  el.classList.add(cls);
}

/** 屏幕入场动效：按模板选标准效果（题字/世界面板只淡入；纸卷与抽屉上滑；中央面板墨显） */
const ENTRANCE = {
  'tpl-title': 'anim-fade',
  'tpl-world': 'anim-fade',
  'tpl-side': 'anim-fade',
  'tpl-stage': 'anim-rise',
  'tpl-board': 'anim-rise',
  'tpl-drawer': 'anim-rise',
  'tpl-panel': 'anim-ink',
};

/** 该屏里"要入场"的那一层：模板内容盒，其次各屏幕自己的内容面（题字卡、纸卷、面板、抽屉、侧栏） */
function entranceTarget(el) {
  return el.querySelector('.tpl-body, .title-card, .sheet, .panel, .journal, .echo-cinema, .sb-world, .cut-caption-wrap, .hud-left');
}

/**
 * 换幕抹擦：在目标屏上铺一层横扫的墨色，动画结束自删。
 * 只用在"换幕"这种大转场，不要挂在每次 showScreen 上（否则常规切屏也在扫，很吵）。
 */
export function wipe(hostEl) {
  const host = hostEl || [...document.querySelectorAll('.screen')].find((s) => !s.classList.contains('hidden'));
  if (!host || host.dataset.wiping === '1') return;
  host.dataset.wiping = '1';
  const layer = document.createElement('div');
  layer.className = 'scene-wipe';
  host.appendChild(layer);
  const done = () => {
    layer.remove();
    delete host.dataset.wiping;
  };
  layer.addEventListener('animationend', done, { once: true });
  // 兜底：prefers-reduced-motion 下 .scene-wipe 是 display:none，animationend 永远不会来
  setTimeout(done, 1200);
}

/**
 * 微视差：插画随指针轻微位移（只动 transform，幅度 ≤ depth 像素）。
 * 尊重 prefers-reduced-motion：系统开了减动效就整段不生效。
 */
export function bindParallax(screenId, layerSel, depth = 8) {
  const screen = $(screenId);
  const layer = screen?.querySelector(layerSel);
  if (!screen || !layer) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  layer.style.willChange = 'transform';
  screen.addEventListener('pointermove', (e) => {
    const r = screen.getBoundingClientRect();
    const dx = (e.clientX - r.left) / Math.max(1, r.width) - 0.5;
    const dy = (e.clientY - r.top) / Math.max(1, r.height) - 0.5;
    layer.style.transform = `scale(1.04) translate3d(${(-dx * depth).toFixed(1)}px, ${(-dy * depth).toFixed(1)}px, 0)`;
  });
  screen.addEventListener('pointerleave', () => { layer.style.transform = 'scale(1.04)'; });
}

/**
 * 切屏。**只负责"哪一屏可见"与入场动效，不碰任何屏内部的容器。**
 *
 * 以前这里会跨模块清理（舞台正文、玩法区、对白区都归它管），于是"换屏"这一个动作统管了所有屏的
 * 内部状态，还逼得 `openBoard()` 用 cloneNode 换节点来躲它。现在改成：
 *   离开的屏 → 广播 `screen:hide`，由那一屏**自己登记的清理函数**收拾（见 modules/screens）
 *   进入的屏 → 广播 `screen:show`
 */
export function showScreen(id) {
  // 先记下"原本可见的普通屏"（浮层屏不算：它们由 showOverlay 管，可能与底屏同时可见）
  const leaving = [...document.querySelectorAll('.screen:not(.overlay)')]
    .filter((el) => !el.classList.contains('hidden') && el.id !== id)
    .map((el) => el.id);
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  const el = $(id);
  if (el) {
    // 只有"之前确实藏着"的屏才算入场：同一屏被反复 showScreen（交谈每轮都会重渲染）
    // 不该每次都重放一遍上滑，那是"换屏"的动效，不是"刷新内容"的动效。
    const entering = el.classList.contains('hidden');
    el.classList.remove('hidden');
    if (entering) {
      const tpl = [...el.classList].find((c) => c.startsWith('tpl-'));
      replayAnim(entranceTarget(el), ENTRANCE[tpl] || 'anim-fade');
    }
  }
  for (const left of leaving) kernel.emit('screen:hide', { id: left });
  kernel.emit('screen:show', { id });
}

export function showOverlay(id) {
  $(id)?.classList.remove('hidden');
  syncOverlayState();
  kernel.emit('screen:show', { id });
}

export function hideOverlay(id) {
  $(id)?.classList.add('hidden');
  syncOverlayState();
  kernel.emit('screen:hide', { id });
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
  // 数值签是区块（.blk-stat），样式只在 framework.css；这里只负责选状态与尺度。
  // 顶栏用 sm（压在一行里，与侧栏数值同档），夜间/终局面板用默认号。
  const chips = (size) => items
    .map((it) => {
      const warn = it.v <= (it.max === 20 ? 2 : 30);
      const good = it.v >= (it.max === 20 ? 10 : 70);
      const band = warn ? ' warn' : good ? ' good' : '';
      return `<span class="blk-stat${size}${band}" aria-label="${it.k} ${it.v}">${it.k}<b>${it.v}</b></span>`;
    })
    .join('');
  $('stats').innerHTML = chips(' sm');
  const ns = $('night-stats');
  if (ns) ns.innerHTML = chips('');
  const es = $('end-stats');
  if (es) es.innerHTML = chips('');
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

/**
 * 渲染营地手记（**纯渲染，不改状态**）。
 *
 * 以前叫 `appendCampLog(state, tag, text)`：既往 state.campLog 里塞，又渲染。
 * 于是"改状态"和"画界面"缠在一起，靠调用方记得调它。现在拆开：
 * 写走 state 模块的 `pushCampLog()`（会广播 state:change），画由 hud 模块订阅后调这里。
 */
export function renderCampLog(list = []) {
  const el = $('camp-log');
  if (!el) return;
  el.innerHTML = list
    .slice(0, 12)
    .map((l) => `<div><span class="tag">${escapeHtml(l.tag)}</span>${escapeHtml(l.text)}</div>`)
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

/** 渲染 AI 调用计数（纯渲染；计数由 state 模块的 bumpAiCount() 维护并广播） */
export function renderAiCount(n) {
  const el = $('ai-count');
  if (el) el.textContent = String(n ?? 0);
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
  const el = $('stage-panel');
  el.innerHTML = html;
  replayAnim(el, 'anim-ink');     // 墨显：正文换内容时重新"渗"出来
}

export async function say(speaker, text, voiceId) {
  $('dlg-speaker').textContent = speaker || '';
  replayAnim($('dlg-body'), 'anim-ink');
  // 预置语音后台播，不阻塞打字与流程
  kernel.emit('voice:say', { text, actorId: speaker || '叙事', voiceId });
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
        <div class="row">
          <span class="type">${escapeHtml(l.callType || l.scene || 'decide')}</span>
          <span class="${cls ? `src src-${cls}` : 'src'}">${escapeHtml(l.source || '—')}</span>
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
