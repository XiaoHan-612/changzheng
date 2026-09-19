/**
 * flow/modes —— 标题页模式的后半段：择点穿行 + 连贯行军。
 *
 * 连贯行军的口径（用户确认）：
 *   **只自动「进入」任务点**（不用手点营地光点）；
 *   对白、抉择、史实回响、小游戏操作、启程确认 —— **原来该怎样还怎样**，全部仍由玩家完成。
 *
 * 赛制口径（不变）：智能判断一律 `/api/decide` 真调 + JSONL；本文件不替代模型决策。
 *
 * 模式 id：
 *   march        行军模式（手动）
 *   march_auto   连贯行军（自动进入下一个任务点）
 *   select       择点穿行（自选幕次与任务）
 */
import { $, showScreen, showOverlay, hideOverlay, toast, escapeHtml, setTopbar } from '../ui.js';
import { setAutoPlay } from '../step.js';
import { kernel } from '../kernel/index.js';
import {
  S, hasS, st, step, getActsData, setActsData, currentActDef, withLock, cinemaApi,
} from './kit.js';
import { dayScene, apPerDay } from '../state.js';
import { sceneImage, renderJourney } from './view.js';
import { runQuiz } from './quiz.js';
import { fetchActs } from '../ai-client.js';
// 运行时再取 act 的导出（与 act.js 动态 import modes 对称，避免模块环）
import * as actApi from './act.js';

const enterCampDay = (...a) => actApi.enterCampDay(...a);
const onHotspot = (...a) => actApi.onHotspot(...a);
const hotspotSpent = (...a) => actApi.hotspotSpent(...a);
const markDone = (...a) => actApi.markDone(...a);
const isDone = (...a) => actApi.isDone(...a);

export const MODE_LABEL = {
  march: '行军模式',
  march_auto: '连贯行军',
  auto: '连贯行军',
  select: '择点穿行',
};

export function isAutoMode(mode) {
  const m = mode || (hasS() ? S.mode : '');
  return m === 'march_auto' || m === 'auto';
}

/* ───────────── 择点穿行 ───────────── */

/** 一幕里可选的任务（热点按天去重 + 强制链补全 + 对决） */
export function collectActTasks(act) {
  const out = [];
  const seen = new Set();
  const days = Math.max(1, Number(act?.apDays) || 1);
  for (let d = 1; d <= days; d++) {
    const hs = dayScene(act, d).hotspots || [];
    for (const h of hs) {
      if (!h || h.kind === 'march') continue;
      const key = h.action || h.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        type: 'hotspot',
        key,
        day: d,
        label: h.label || key,
        sub: h.sub || h.kind || '',
        kind: h.kind,
        hotspot: { ...h, day: d },
      });
    }
  }
  for (const fid of act?.forced || []) {
    if (!fid || seen.has(fid)) continue;
    seen.add(fid);
    out.push({
      type: 'forced',
      key: fid,
      day: days,
      label: `节点 · ${fid}`,
      sub: '幕末强制链',
      kind: fid,
      hotspot: { id: fid, action: fid, kind: fid, label: `节点 · ${fid}`, sub: '幕末强制链' },
    });
  }
  if (act?.quiz) {
    out.push({ type: 'quiz', key: 'quiz', day: days, label: '知识对决', sub: act.theme || 'quiz', kind: 'quiz' });
  }
  return out;
}

/**
 * 打开选关面板：**只开 UI，不占流程锁、不重开局**。
 * 点了任务再 start + 进幕——这样「点标题按钮」一定能看见列表。
 */
export async function openSelectMode() {
  try {
    setAutoPlay(false);
    // 幕次数据未进内存时现场拉一次（boot 正常会 setActsData，这里兜底）
    if (!getActsData()?.order?.length) {
      const data = await fetchActs();
      if (data) setActsData(data);
    }
    renderSelectList();
    const scr = document.getElementById('screen-select');
    if (scr) {
      scr.classList.remove('hidden');
      scr.style.zIndex = 'var(--z-overlay)';
    }
    showOverlay('screen-select');
    bindSelectChrome();
    toast('择点穿行：选择一幕中的任务点', 2400);
    return true;
  } catch (err) {
    console.error('[modes] openSelectMode 失败', err);
    toast(`择点穿行打不开：${err?.message || err}`, 3200);
    return false;
  }
}

function renderSelectList() {
  const box = $('select-list');
  if (!box) {
    toast('界面缺少 #select-list，请硬刷新（Ctrl+Shift+R）', 4000);
    return;
  }
  const data = getActsData();
  if (!data?.order?.length) {
    box.innerHTML = '<p class="muted">幕次数据未加载。请硬刷新后再试；若仍失败请检查服务是否在跑。</p>';
    return;
  }
  box.innerHTML = '';
  let n = 0;
  for (const id of data.order) {
    const act = data.acts[id];
    if (!act) continue;
    const tasks = collectActTasks(act);
    if (!tasks.length) continue;
    n += tasks.length;
    const sec = document.createElement('section');
    sec.className = 'select-act';
    // 幕次头图：用已有 acts.json pano，不新生成素材
    const thumbSrc = act.pano || act.cutAlt || '';
    const thumbHtml = thumbSrc
      ? `<img class="select-thumb" src="${escapeHtml(thumbSrc)}" alt="" loading="lazy" />`
      : '<span class="select-thumb is-empty" aria-hidden="true"></span>';
    sec.innerHTML = `<header class="select-act-head">${thumbHtml}<div>
        <h3 class="blk-title sm">${escapeHtml(act.title)} · ${escapeHtml(act.subtitle || '')}</h3>
        <p class="muted sm">${escapeHtml(act.date || '')}${act.theme ? ` · ${escapeHtml(act.theme)}` : ''}</p>
      </div></header>`;
    const list = document.createElement('div');
    list.className = 'select-tasks';
    for (const t of tasks) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-card';
      b.dataset.selectTask = `${act.id}:${t.key}`;
      b.innerHTML = `<b>${escapeHtml(t.label)}</b><span>${escapeHtml(t.sub || t.kind || '')}</span>`;
      b.onclick = () => { launchSelectTask(act, t); };
      list.appendChild(b);
    }
    sec.appendChild(list);
    box.appendChild(sec);
  }
  if (!n) box.innerHTML = '<p class="muted">没有可选任务（幕次数据异常）。</p>';
}

export function bindSelectChrome() {
  const back = $('btn-select-back');
  if (back) {
    back.onclick = () => {
      hideOverlay('screen-select');
      showScreen('screen-title');
      setTopbar(false);
    };
  }
}

/** 进入选中的任务：这里才开局 + 占锁；进幕后触发该点（与手动 onHotspot 同一条真调路径） */
async function launchSelectTask(act, task) {
  return withLock(async () => {
    try {
      hideOverlay('screen-select');
      setAutoPlay(false);
      const data = getActsData();
      const order = data?.order || [];
      let idx = order.indexOf(act.id);
      if (idx < 0) idx = 0;
      st().start('select');
      setTopbar(true);
      st().set('actIndex', idx, `择点穿行 ${act.id}`);
      const day = Math.max(1, task.day || 1);
      st().enterDay({ day, ap: apPerDay(act), maxAp: apPerDay(act) });
      renderJourney();
      toast(`择点穿行：${act.title} · ${task.label}`, 2800);
      await cinemaApi()?.play('act-intro', {
        ctx: {
          act,
          idx,
          prev: null,
          review: null,
          mapImg: sceneImage('/assets/scenes/map_route_deep.jpg', '/assets/scenes/map_route.jpg'),
        },
      });
      enterCampDay(act, day);
      if (task.type === 'quiz') {
        await withLock(async () => {
          if (!isDone(act.id, 'quiz')) {
            await runQuiz(act);
            markDone(act.id, 'quiz');
          }
        }, { from: 'flow', label: '择点·对决' });
        return;
      }
      const h = task.hotspot;
      setTimeout(() => {
        onHotspot(act, h).catch((e) => {
          console.error('[modes] 择点任务失败', e);
          toast(`任务启动失败：${e?.message || e}`, 3000);
        });
      }, 400);
    } catch (err) {
      console.error('[modes] launchSelectTask 失败', err);
      toast(`进入任务失败：${err?.message || err}`, 3200);
    }
  }, { from: 'user', label: '择点穿行' });
}

/* ───────────── 连贯行军：自动推进 ───────────── */

let autoTimer = 0;
let autoRunning = false;

export function stopAutoAdvance() {
  autoRunning = false;
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }
  setAutoPlay(false);
}

export function startAutoMode() {
  return withLock(async () => {
    stopAutoAdvance();
    st().start('march_auto');
    // 不打开 autoPlay 旗：对白/抉择/继续/回响全部保持原交互
    setAutoPlay(false);
    setTopbar(true);
    toast('连贯行军：自动进入任务点；语音与抉择按原节奏，不打断台词', 3600);
    await cinemaApi()?.play('prologue-open', {
      ctx: { mapImg: sceneImage('/assets/scenes/map_route_deep.jpg', '/assets/scenes/map_route.jpg') },
    });
    const { runOrigin } = await import('./act.js');
    await runOrigin();
    await cinemaApi()?.play('prologue-farewell');
    const { runActIntro } = await import('./act.js');
    await runActIntro();
  }, { from: 'user', label: '连贯行军' });
}

/** 进营地后由 act.js 调用：等流程空闲后自动进入下一个任务点 */
export function scheduleAutoAdvance(act, delay = 900) {
  if (!isAutoMode()) return;
  autoRunning = true;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(() => { runAutoAdvance(act).catch(() => {}); }, delay);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 人声是否还在响（经 audio 模块问框架；业务不直接摸 Audio 元素） */
function voicePlaying() {
  try {
    return !!kernel.api('audio')?.isPlaying?.('voice');
  } catch { return false; }
}

function overlayVisible(id) {
  const el = document.getElementById(id);
  return !!(el && !el.classList.contains('hidden') && el.offsetParent !== null);
}

/** 过场/回响还在屏上，或流程锁被占 → 还不能进下一点 */
function sceneStillBusy() {
  return overlayVisible('screen-echo')
    || overlayVisible('screen-cutscene')
    || kernel.resources.isHeld('flow');
}

/**
 * 等到人声自然播完（不是速过）。
 * 上一句没说完就进下一点，`speak()` 会打断旧句——连贯行军只负责「进入任务点」，
 * 绝不能抢语音。超时则放行，避免异常音频把推进卡死。
 */
function waitVoiceIdle(timeoutMs = 25000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (!voicePlaying() && !sceneStillBusy()) { resolve(true); return; }
      if (Date.now() - t0 > timeoutMs) { resolve(false); return; }
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function runAutoAdvance(act) {
  if (!isAutoMode() || !hasS() || !act) return;
  if (!autoRunning) return;

  // 玩家还在操作，或语音/过场/回响未完 → 等下一拍，绝不抢点、不打断台词
  if (sceneStillBusy() || voicePlaying()) {
    scheduleAutoAdvance(act, 450);
    return;
  }

  const scene = dayScene(act, S.day || 1);
  const list = scene.hotspots || [];
  const open = list.filter((h) => h && h.kind !== 'march' && !hotspotSpent(act, h));
  const meaningful = open.filter((h) => h.kind !== 'fire' && h.kind !== 'rest');
  const pool = meaningful.length ? meaningful : open.filter((h) => h.kind === 'rest');

  if (S.ap <= 0 || !pool.length) {
    const marchH = list.find((h) => h.kind === 'march') || { kind: 'march', label: '启程', sub: '' };
    try { st().pushCampLog('行军', '暮色将尽，准备启程'); } catch { /* ignore */ }
    await onHotspot(act, marchH);
    await waitVoiceIdle();
    await sleep(1000);
    return;
  }

  pool.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  const target = pool[0];
  // 进点前：给上一句语音起播/收尾留时间，确认已歇再进
  await sleep(500);
  await waitVoiceIdle();
  await sleep(700);
  if (!autoRunning || sceneStillBusy() || voicePlaying()) {
    scheduleAutoAdvance(act, 400);
    return;
  }
  // 不每次 toast「进入xxx」——做完任务再喊一声会很吵；只记营地日志
  try {
    st().pushCampLog('行军', `自动进入：${target.label || target.id || target.kind}`);
  } catch { /* 无局状态时忽略 */ }
  try {
    // 只负责「进入」；里面对白/抉择/玩法/回响与行军模式完全相同
    await onHotspot(act, target);
  } catch (err) {
    toast(`这一棒没走完：${err?.message || err}`, 2600);
  }
  // 结算后：先给语音一点起播时间（say 的 voice:say 是异步的），再等它自然播完
  await sleep(900);
  await waitVoiceIdle();
  await sleep(1400);
  if (isAutoMode() && autoRunning) scheduleAutoAdvance(act, 400);
}
