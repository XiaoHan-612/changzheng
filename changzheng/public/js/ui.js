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

/**
 * 这个按键事件是不是"正在输入"里发出的？
 *
 * 全局顺手键（1–9 选项、J 手记）必须让开输入框，否则：在设置里改 API 地址时敲到 j
 * 会弹出「手记」，敲到 1–9 甚至会点掉底下的选项；沙盘里写行动时同理。
 * 组字中（`isComposing`）也算"正在输入"——中文输入法打拼音时数字/字母是候选选择键，
 * 抢了它，玩家连字都打不完（这条是中文项目的必备判断，英文项目一般不会踩）。
 */
export function isTypingTarget(e) {
  if (e?.isComposing) return true;
  const t = e?.target;
  if (!t || !t.tagName) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
    || t.isContentEditable === true;
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
  return el.querySelector('.tpl-body, .title-card, .sheet, .panel, .journal, .echo-cinema, .cut-caption-wrap, .hud-left');
}

/**
 * 当前可见屏里适合"临时挂一行东西"的容器（重试键、提示键这类）。
 *
 * 与 contentFace() 的分工：那个回答"这一屏的内容面是哪个盒子"，这个在其之上再挑出
 * 舞台正文 / 夜间正文 / 舞台操作区这些**更具体**的落点；都没有才退回内容面。
 * 批 6 从 main.js 搬来——shell 的「重试／跳过」面板与 main.js 的提示键共用这一份。
 */
export function actionHost() {
  const visible = [...document.querySelectorAll('.screen')].find((s) => !s.classList.contains('hidden'));
  if (!visible) return document.body;
  return visible.querySelector('#night-body')
    || visible.querySelector('#stage-panel')
    || visible.querySelector('#sheet-actions')
    || contentFace(visible);
}

/**
 * 一个屏的**内容面**：能承载"临时插一行东西"的那个盒子（面板 / 纸卷 / 模板内容盒 / 世界面板…）。
 *
 * 为什么不能直接把行插进 `<section class="screen">`：屏的背景层（`.end-bg` / `.pano-img` /
 * `.quiz-bg` …）都是 `position:absolute; inset:0`，插在 section 里的东西会被它盖住——
 * **看得见、点不到**。终局屏的「重试／跳过」就这么废过：模型一失败，玩家卡在"结算中…"，
 * 连重试键都点不动（2026-09-15 用 elementFromPoint 定的性，见 HANDOFF-CODE 坑 41）。
 *
 * 与 `entranceTarget` 是两个用途、两张表，别合并：入场动效要的是"看起来该动的那一层"，
 * 这里要的是"点得到的那一层"（营地屏两者就不一样：入场动的是侧栏，插行该插在底部操作区）。
 */
const FACE = '.tpl-body, .sheet, .panel, .title-card, .arcade-wrap, .sb-world, .hud-bottom,'
  + ' .cut-caption-wrap, .path-head, .journal, .echo-cinema';
export function contentFace(screenEl) {
  if (!screenEl || !screenEl.querySelector) return screenEl || null;
  return screenEl.querySelector(FACE) || screenEl;
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
      <div class="comp-meta"><b>${escapeHtml(c.name)}</b></div>
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

/**
 * 打字机。返回 `{ promise, finish }`：`finish()` 立刻补全文（跳过剩余动画）。
 * 调用方仍可 `await typeText(...)`——对象上的 then 不存在，所以请 await `.promise`
 * 或使用下面的薄包装 `typeTextSkip`。旧调用点 `await typeText(el, t)` 会拿到
 * 非 Promise 的对象；为兼容，这里给返回值挂上 thenable。
 */
export function typeText(el, text, speed = 18) {
  let timer = 0;
  let done = false;
  let resolveFn = null;
  const promise = new Promise((resolve) => { resolveFn = resolve; });
  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    el.textContent = text;
    el.classList.remove('typing');
    resolveFn();
  };
  el.textContent = '';
  el.classList.add('typing');
  let i = 0;
  timer = setInterval(() => {
    if (done) return;
    el.textContent = text.slice(0, i);
    i += 1;
    if (i > text.length) finish();
  }, speed);
  // thenable：`await typeText(...)` 与 `await t.promise` 都能用
  return { promise, finish, then: (onF, onR) => promise.then(onF, onR) };
}

/** 当前正在打的那段字（say / 终局 / 夜间共用）：点对白区可跳过 */
let liveTyping = null;
export function skipTyping() {
  if (liveTyping) { liveTyping.finish(); liveTyping = null; return true; }
  return false;
}
/** 把一段 typeText 句柄挂到全局跳过（night 等非 say 路径用） */
export function registerLiveTyping(handle) {
  liveTyping = handle || null;
  return handle;
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
  liveTyping = typeText($('dlg-body'), text);
  try {
    await liveTyping.promise;
  } finally {
    liveTyping = null;
  }
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
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  $('logs-meta').textContent = `共 ${logs.length} 条调用 · 屏开着时每 2 秒自动刷新（本次更新 ${stamp}） · `
    + '「导出日志」下载原始 JSONL：含 prompt、模型响应、耗时与来源，模型名见 model 字段';
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
          <span class="muted">${escapeHtml(l.model || '')}</span>
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
      // 未解锁**不注入正文**：原先只降透明度，点开档案仍能读到全部史实——剧透且削弱收集感（v0.3 P0-7）
      if (!open) {
        return `<div class="fact-card locked">
          <h3>${escapeHtml(f.title)}（未解锁）</h3>
          <div class="date">${escapeHtml(f.date || '')}</div>
          <p class="muted">完成对应节点后解锁这段史实。</p>
        </div>`;
      }
      return `<div class="fact-card">
        <h3>${escapeHtml(f.title)}</h3>
        <div class="date">${escapeHtml(f.date || '')}</div>
        <div class="row"><span class="label real">真实史实</span>${escapeHtml(f.real || '')}</div>
        <div class="row"><span class="label fic">虚构互动</span>${escapeHtml(f.fiction || '')}</div>
      </div>`;
    })
    .join('');
}
