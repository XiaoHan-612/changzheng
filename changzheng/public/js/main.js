import { COMPANIONS, PATH_ZONES } from './data.js';
// state.js 是**纯函数层**（可单测、无副作用）；写状态一律走 state 模块（见下面的 st()）
import { apPerDay, dayScene } from './state.js';
import { ORIGINS, ORIGIN_QUIZ, applyOrigin, applyOriginQuiz, findOrigin } from './origin.js';
import { applyFeatures, setDevTools, isDevToolsOn } from './features.js';
import { decide, fetchConfig, fetchLogs, fetchFacts, fetchActs, saveConfig, testConfig, clearLogs } from './ai-client.js';

let judgeMode = false;
// 调用流（答辩面板那份"最近 30 次调用摘要"）已经搬进 `modules/ai`：这里只发事件、按需请它渲染。
// 批 5 之前是 main.js 自己存数组 + 往 window 挂 __pushAiFeed 让沙盘捅进来——全局与双数据源都没了。

// 「重试 / 跳过」面板与"思考中"提示都搬进了 modules/shell（订阅 ai:start / ai:done / ai:fail）——
// 批 6 之前是 50 个调用点各自 showThinking(true/false) 成对写，漏一处就"转圈停不下来"。
function setJudgeMode(on) {
  judgeMode = !!on;
  const el = $('ai-inspector');
  if (el) el.classList.toggle('hidden', !on);
  if (on) {
    kernel.api('ai')?.render();          // 调用流由 ai 模块持有，这里只请它重画
    toast('评委演示模式：右侧实时显示每次大模型调用', 3500);
  }
}
import * as UI from './ui.js';
import { setStep, setStepState, waitContinue, askChoice, markAction, choiceButton, activateChoice } from './step.js';
// 内核：模块注册 / 事件总线 / 契约 / 只读快照 / 诊断（架构见 docs/BUS.md）。
// 批 1 只把地基启动起来，业务模块从批 2 起逐个挂上来（见 wiring.js 的 MODULES 清单）。
import { kernel, loadModules, exposeDevFacade } from './kernel/index.js';
// 流程层的共用地基（批 7）：状态读写、模型调用、步骤契约、只读上下文、记流水
import {
  S, hasS, st, gamesApi, callAI, step, waitBtn, publicState, currentActDef,
  logChoice, logShare, markLine, markDone, isDone, LINE_NAMES, LINES_TOTAL, withLock, setMarchUpdater,
  getActsData, setActsData, getFacts, setFacts, getConfig, setConfig,
} from './flow/kit.js';
// 「看」的那一摊：素材探测 / 立绘 / 行程 / 夜色（批 7 二·2）
import {
  sceneImage, portraitImage, showNpc, preloadScenes,
  renderJourney, updateDusk, bindLantern, originText,
} from './flow/view.js';
// 史实回响（每步之后的三栏；被 20 多处调用）
import { showEcho, afterJudge, bindEcho, closeEcho } from './flow/echo.js';
// 叶子组（批 7 二·4）：数据表 / 玩法流程 / 对决 / 篝火夜
import { CHOICE_SETS, REPEATABLE_HOTSPOTS } from './flow/tables.js';
import { doSchool, doCandy, doSentry, doGomoku, doGrab, doRoster, doFishing, doLuding } from './flow/games-flow.js';
import { runQuiz } from './flow/quiz.js';
import { runArcade } from './flow/arcade.js';
import { runNightChoice, nightContext } from './flow/night.js';
// 一幕的推进（含营地）与收尾（批 7 二·5；main.js 从此只剩组合根）
import {
  startRun, resumeRun, enterCampDay, updateMarchButton, jumpToAct,
  renderFireMenu, renderPathZones,
} from './flow/act.js';
import { runEnding } from './flow/end.js';
import { openSelectMode, bindSelectChrome } from './flow/modes.js';

const { $, showScreen, setTopbar,
  toast, showThinking, say, setPortrait, setStageBanner, setStagePanel,
  flashEffects, setAiMode, typeText, escapeHtml, renderLogs, renderFacts,
  showOverlay, hideOverlay, replayAnim, wipe, bindParallax, isTypingTarget, contentFace, actionHost, skipTyping } = UI;



/** 声明当前步骤：全项目统一的交互契约入口（见 step.js） */
/**
 * 素材「落盘即生效」：优先用新图，探测不到就退回占位图。
 * 生图模型按 docs/HANDOFF-ART.md 的表把文件放进 public/assets/scenes/，
 * 无需改任何代码，下一次进入对应场景就会用上。
 */






// ─── boot ───
async function boot() {
  applyFeatures();               // 先按本机开关决定"纯游戏界面"还是含调试/答辩入口
  // 内核先启动：模块（IP）注册 → init → 按描述符接线 → ready。
  // 幂等，且模块加载失败不影响启动（分批迁移期清单里可能列着还没写的模块）。
  await loadModules();
  kernel.boot();
  setConfig(await fetchConfig());
  setAiMode(getConfig());
  $('title-model').textContent = getConfig().model;
  setFacts(await fetchFacts() || {});
  setActsData(await fetchActs());
  bindChrome();
  exposeSheetHooks();
  // 微视差：两幅整屏插画（封面与营地全景）随指针轻微位移；减动效偏好下 bindParallax 自己跳过
  bindParallax('screen-title', '.title-bg');
  bindParallax('screen-camp', '.pano-img');
  bindTitle();
  bindEcho();
  bindSettings();
  // 「启程」按钮的刷新钩子：kit 的 withLock 进出锁时要重画它（忙 → disabled），
  // 但那个按钮归 act 那一块，所以要在这里注入（见 kit.js 的 setMarchUpdater 注释）。
  // 漏了这一步的后果：锁一旦被占（例如开局那一分钟），启程键看起来还能点。
  setMarchUpdater(updateMarchButton);
  preloadScenes();
  offerResume();
  showScreen('screen-title');
  setTopbar(false);
  // 整页就绪：到这一步才是"玩家/脚本可以动手"的状态（脚本等 booted 会早于这里动手——
  // 而这里还会 showScreen('screen-title')，那一下会把刚演起来的过场顶掉，见 HANDOFF-CODE 坑 54）
  kernel.emit('app:ready', { at: Date.now() });
}

/** 有未完成的局就露出「继续上一局」（状态由 sessionStorage 保存） */
function offerResume() {
  const saved = st().load();
  const btn = $('btn-continue-run');
  if (!saved || !btn || saved.actIndex == null) return;
  btn.classList.remove('hidden');
  btn.onclick = () => resumeRun(saved);
}


/**
 * 逐页截图/打磨入口（只在「设置 → 展示」打开时挂出，正式玩法不受影响）。
 *
 * 为什么需要：逐页打磨要逐屏对比风格，但岔路、回响这类屏要走到很深的幕才出现，
 * 为了截一张图跑一整局既慢又烧模型调用。这里只暴露"把某屏摆出来"的能力，
 * 内容仍由各屏自己的渲染函数产出，不另写一套（否则迟早与正式流程漂移）。
 */
function exposeSheetHooks() {
  if (!isDevToolsOn()) return;
  // 摆屏入口的唯一真相在内核（kernel.screens），__czScreens 只是它的窗口镜像。
  // 这样批 7 把 main.js 拆成 flow/* 之后，qa:screens / qa:board / layout-audit 仍然照旧可用。
  const api = {
    show: showScreen,
    overlay: showOverlay,
    journal: () => openJournal(),
    facts: () => $('btn-facts').click(),
    pathZones: () => renderPathZones($('path-zones'), () => {}),
    // 篝火菜单只在第四幕营地的 fire 热点出现，跑一遍太贵；这里直接走它的真实渲染函数
    fire: () => {
      if (!hasS()) return;
      showOverlay('screen-fire');
      renderFireMenu(currentActDef());
    },
    // 答题 / 篝火夜 / 终局：都太长（要走到深幕），截图时直接跑各自的**真实流程**，
    // 由截图脚本在中途等（不另写一套渲染，理由同 fire）。
    quiz: () => { if (hasS()) runQuiz(currentActDef()); },
    // 「临时插一行会插到哪儿」——给体检脚本用真实现（别在脚本里再抄一份选择器：
    // 抄一份就有两个真相，改了一处另一处照旧绿；内容面的来龙去脉见 ui.js contentFace）
    face: (el) => {
      const target = el || [...document.querySelectorAll('.screen')].find((s) => !s.classList.contains('hidden'));
      return contentFace(target);
    },
    night: () => {
      if (!hasS()) return;
      // 篝火夜门槛是「营地**自愿**点亮 ≥2 条」；截图/体检要同时预置 linesDone 与 voluntaryLines
        st().set('linesDone', ['fishing', 'candy', 'sentry'], '调试：预置附身线');
        st().set('voluntaryLines', ['fishing', 'candy'], '调试：预置自愿附身线');
      runNightChoice(currentActDef());
    },
    end: () => { if (hasS()) runEnding(); },
    logs: () => $('btn-logs').click(),
    defense: () => $('btn-defense').click(),
    // 玩法板同理：四个玩法都在幕深处，截图/体检直接把它们摆到板屏上
    // 玩法清单只有一份（modules/games/manifest.js）——这里不再抄第二张表
    mini: (name) => {
      if (!hasS()) return false;
      const g = gamesApi();
      if (!g?.has?.(name)) return false;
      // 与剧情、游戏模式**同一条口径**：必须带 decide，否则玩法里的模型调用拿不到回调，
      // 一律走固定兜底内容 —— 体检脚本看不出毛病，但"模型到底在不在调"会被误判成没调
      // （我排查夜校时就先用这个钩子踩过：结论是"一次都没调模型"，实际是钩子没给回调）。
      g.play(name, {
        params: {
          password: S.tonightPassword,
          avoid: S.schoolUsed || [],
          decide: (payload = {}) => callAI({
            ...payload,
            scene: payload.scene || `玩法调试·${name}`,
            state: payload.state || publicState(),
          }),
        },
      });
      return true;
    },
  };
  // 登记进内核的统一入口（唯一真相）；window.__czScreens 这个镜像由内核供出（批 7）
  kernel.screens.register(() => api);
  exposeDevFacade();     // 注册完再挂一次：这时才有东西可镜像
}

// ── 行军记录（大模型调用日志）的实时刷新与导出 ──
// 比赛要求"随时能看到模型调用日志、并能导出文件"：屏开着时每 2 秒拉一次 /api/logs；
// 关屏自停——tick 先看屏是否还开着再决定发不发请求，Esc 与「关闭」两条路都盖得住。
let logsLiveTimer = null;
function stopLogsLive() {
  if (logsLiveTimer) {
    clearInterval(logsLiveTimer);
    logsLiveTimer = null;
  }
}
async function refreshLogs() {
  const data = await fetchLogs();
  renderLogs(data.logs || []);
  return data;
}
function startLogsLive() {
  stopLogsLive();
  logsLiveTimer = setInterval(async () => {
    if ($('screen-logs')?.classList.contains('hidden')) return stopLogsLive();
    try {
      await refreshLogs();
    } catch { /* 本地服务抖一下不打断：下一拍再试 */ }
  }, 2000);
}
/** 导出原始 JSONL（走后端白名单接口；浏览器与桌面外壳都会弹「另存为」） */
async function exportLogs() {
  let data;
  try {
    data = await fetchLogs();
  } catch {
    return toast('读日志失败：本地服务没响应');
  }
  if (!data.count) return toast('还没有调用记录，先玩一局再来导出');
  const a = document.createElement('a');
  a.href = '/api/logs/export?file=session-full.jsonl';
  a.download = 'session-full.jsonl';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('已开始导出：弹出的「另存为」里选个位置即可', 3500);
}

function bindChrome() {
  $('btn-logs').onclick = async () => {
    showOverlay('screen-logs');
    try {
      await refreshLogs();
    } catch { /* 打开时读失败也不拦：屏上列表为空，下一拍自动重试 */ }
    startLogsLive();
  };
  $('btn-logs-close').onclick = () => {
    stopLogsLive();
    hideOverlay('screen-logs');
  };
  $('btn-logs-refresh').onclick = () => refreshLogs();
  $('btn-logs-export').onclick = () => exportLogs();
  $('btn-facts').onclick = () => {
    showOverlay('screen-facts');
    renderFacts(getFacts(), S?.unlockedFacts || []);
    replayAnim($('facts-list'), 'anim-stagger');
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
  // 屏的生命周期归属：这两屏的渲染代码在 main.js 里，清理也写在它们旁边（见 modules/screens）
  const screensApi = kernel.api('screens');
  screensApi?.own('screen-stage', clearStage);      // 板屏的清理由 modules/games 自己登记（批 5）

  const muteBtn = $('btn-mute');
  if (muteBtn) {
    // 只发命令：静音状态由 audio 模块持有，图标与提示由 chrome 模块订阅 audio:muted 更新
    muteBtn.onclick = () => kernel.emit('audio:toggle-mute', {});
  }
  const defBtn = $('btn-defense');
  if (defBtn) defBtn.onclick = () => openDefense();
  const defClose = $('btn-defense-close');
  if (defClose) defClose.onclick = () => hideOverlay('screen-defense');
  const jBtn = $('btn-journal');
  if (jBtn) jBtn.onclick = () => openJournal();
  const jClose = $('btn-journal-close');
  if (jClose) jClose.onclick = () => hideOverlay('screen-journal');
  // 快捷键：1–9 选项、J 手记、Esc 关浮层。
  //
  // 两类键的规矩不一样：**Esc 是浏览器惯例**，在输入框里也得能关掉浮层
  // （只有输入法组字中的 Esc 是"取消组字"，不抢）；而 1–9 与 J 是"顺手键"，
  // 正在输入时一律不抢——否则在设置里改 API 地址敲到 j 会弹出「手记」、
  // 在沙盘里写行动敲到数字会点掉屏幕上的选项（2026-09-15 修，见 HANDOFF-CODE 坑 40）。
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (e.isComposing) return;                    // 输入法组字中：这一下是"取消组字"
      // 回响：Esc = 「明白了」（要 resolve Promise，不能只 hide）
      if (closeEcho()) return;
      ['screen-journal', 'screen-defense', 'screen-logs', 'screen-facts', 'screen-settings', 'screen-fire', 'screen-how']
        .forEach((id) => hideOverlay(id));
      return;
    }
    if (isTypingTarget(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // 组合键留给浏览器（复制/粘贴/开发者工具）
    // 空格/回车：若正在打字，先补全文（v0.3 P0-2）
    if (e.key === ' ' || e.key === 'Enter') {
      if (skipTyping()) { e.preventDefault(); return; }
    }
    if (e.key.toLowerCase() === 'j' && hasS()) { openJournal(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= 9 && activateChoice(n)) kernel.emit('sfx:play', { name: 'click' });
  });
  // 点对白区：正在打字 → 补全文（再一次点击由 waitBtn/选项自己处理）
  const dlg = $('dialogue');
  if (dlg) dlg.addEventListener('click', () => skipTyping());
}

function openJournal() {
  if (!hasS()) return;
  showOverlay('screen-journal');
  // 手记底图：有 map_route 就用它当"回望这一路"的地图底（图层压暗保证可读）
  const mapImg = sceneImage('/assets/scenes/map_route.jpg', '');
  const jPanel = document.querySelector('#screen-journal .journal');
  if (jPanel) {
    jPanel.style.backgroundImage = mapImg
      // 浅色纸纱：路线图只作水印透出来，墨字才读得清（旧版是压暗渐变，那是深色方案留下的）
      ? `linear-gradient(160deg, rgba(244,237,223,0.9), rgba(230,218,195,0.94)), url('${mapImg}')`
      : '';
  }
  const order = getActsData()?.order || [];
  const now = S.actIndex ?? 0;
  $('journal-route').innerHTML = order
    .map((id, i) => {
      const a = getActsData().acts[id];
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
          const f = getFacts()?.[id];
          return `<li><b>${escapeHtml(f?.title || id)}</b>${f?.date ? ` <span class="muted">${escapeHtml(f.date)}</span>` : ''}</li>`;
        }).join('')
      : '<li class="empty">还没有照亮史实。</li>';
    // 逐条入场：两栏列表各自一条条渗出来
    replayAnim($('journal-choices'), 'anim-stagger');
    replayAnim($('journal-facts'), 'anim-stagger');

  $('journal-foot').textContent =
    `出身 ${originText()}　｜　`
    + `体力 ${S.体力} · 粮食 ${S.粮食} · 士气 ${S.士气} · 信念 ${S.信念} · 民心 ${S.民心}`
    + `　｜　附身线 ${st().linesDone()}/${LINES_TOTAL}`
    + `　｜　对决 ${S.quiz?.human ?? 0}:${S.quiz?.ai ?? 0}`
    + `　｜　模型 ${getConfig().model}`;
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
    { k: '平均延迟', v: avg + 'ms', n: '真调 1–8s（推理档位 low）' },
    { k: 'GLM 真调', v: glmCalls, n: `source=GLM · ${getConfig()?.model || 'glm'}` },
    { k: 'ERROR', v: bySource.ERROR || 0, n: '失败已记录（可重试）' },
  ];
  Object.entries(byType).forEach(([t, n]) => {
    cards.push({ k: t, v: n, n: '环节调用' });
  });
  box.innerHTML = cards
    .map((c) => `<div class="def-card"><div class="k">${escapeHtml(c.k)}</div><div class="v">${c.v}</div><div class="n">${escapeHtml(c.n)}</div></div>`)
    .join('');
}

function bindTitle() {
  const march = $('btn-mode-march');
  if (march) march.onclick = () => startRun('march').catch((e) => toast(String(e?.message || e), 3000));
  const auto = $('btn-mode-auto');
  if (auto) auto.onclick = () => startRun('march_auto').catch((e) => toast(String(e?.message || e), 3000));
  const select = $('btn-mode-select');
  if (select) {
    // 双保险：onclick + 监听器；打开列表失败也会 toast，避免「点了没反应」
    const openSelect = () => {
      Promise.resolve(openSelectMode()).catch((e) => {
        console.error(e);
        toast(`择点穿行打不开：${e?.message || e}`, 3200);
      });
    };
    select.onclick = openSelect;
    select.addEventListener('click', openSelect);
  }
  bindSelectChrome();
  // 游戏模式：不进剧情，直接把玩法清单摆出来（见 flow/arcade.js）
  const arcade = $('btn-mode-arcade');
  if (arcade) {
    arcade.onclick = async () => {
      setTopbar(true);
      await runArcade();
      setTopbar(false);
      showScreen('screen-title');
    };
  }
  const judge = $('btn-judge');
  if (judge) {
    judge.onclick = isDevToolsOn() ? () => {
      setJudgeMode(true);
      startRun('march');
    } : null;
  }
  $('btn-how').onclick = () => showOverlay('screen-how');
  $('btn-how-back').onclick = () => hideOverlay('screen-how');
  bindTitleExtras();
  $('btn-inspect-close') && ($('btn-inspect-close').onclick = () => setJudgeMode(false));
}

/** 标题页角落：意见与反馈 + 九十周年纪念感言（本机 localStorage，不进 API/评分） */
function bindTitleExtras() {
  const open = (id) => showOverlay(id);
  const close = (id) => { hideOverlay(id); showScreen('screen-title'); };

  const fbText = $('fb-text');
  const fbStatus = $('fb-status');
  const refText = $('ref-text');
  const refStatus = $('ref-status');
  const FB_KEY = 'czjc_feedback_v1';
  const REF_KEY = 'czjc_reflection_v1';

  const loadText = (key, el, statusEl, tip) => {
    try {
      const saved = localStorage.getItem(key) || '';
      if (el) el.value = saved;
      if (statusEl) statusEl.textContent = saved ? tip : '';
    } catch { /* ignore */ }
  };
  const saveText = (key, el, statusEl, label) => {
    const v = (el?.value || '').trim();
    try {
      localStorage.setItem(key, v);
      if (statusEl) statusEl.textContent = v
        ? `${label}已保存到本机（${new Date().toLocaleString()}）`
        : `${label}已清空`;
      toast(v ? `${label}已保存` : `${label}为空`, 2200);
    } catch (e) {
      if (statusEl) statusEl.textContent = '保存失败：' + (e?.message || e);
    }
  };
  const copyText = async (el, statusEl, label) => {
    const v = el?.value || '';
    if (!v.trim()) {
      if (statusEl) statusEl.textContent = '还没有内容可复制';
      return;
    }
    try {
      await navigator.clipboard.writeText(v);
      if (statusEl) statusEl.textContent = `${label}已复制到剪贴板`;
      toast('已复制', 1800);
    } catch {
      if (statusEl) statusEl.textContent = '复制失败，请手动全选复制';
    }
  };

  const fbBtn = $('btn-feedback');
  if (fbBtn) fbBtn.onclick = () => {
    loadText(FB_KEY, fbText, fbStatus, '已读取本机上次保存的意见');
    open('screen-feedback');
  };
  $('btn-fb-close') && ($('btn-fb-close').onclick = () => close('screen-feedback'));
  $('btn-fb-save') && ($('btn-fb-save').onclick = () => saveText(FB_KEY, fbText, fbStatus, '意见'));
  $('btn-fb-copy') && ($('btn-fb-copy').onclick = () => copyText(fbText, fbStatus, '意见'));

  const refBtn = $('btn-reflection');
  if (refBtn) refBtn.onclick = () => {
    loadText(REF_KEY, refText, refStatus, '已读取本机上次保存的感想');
    open('screen-reflection');
  };
  $('btn-ref-close') && ($('btn-ref-close').onclick = () => close('screen-reflection'));
  $('btn-ref-save') && ($('btn-ref-save').onclick = () => saveText(REF_KEY, refText, refStatus, '感想'));
  $('btn-ref-copy') && ($('btn-ref-copy').onclick = () => copyText(refText, refStatus, '感想'));

  bindMarchIntro();
}

/**
 * 标题页「了解中国工农红军长征」：点击即调用指定模型生成详细介绍（JSONL 有日志）。
 * 失败时明说原因，不编造离线文案。
 */
function bindMarchIntro() {
  const bodyBox = $('march-intro-body');
  const qaOut = $('march-qa-out');
  const qaInput = $('march-qa-input');
  let qaBusy = false;

  const openIntro = async () => {
    showOverlay('screen-march-intro');
    if (!bodyBox) return;
    bodyBox.innerHTML = '<p class="muted">正在调用大模型，生成「中国工农红军长征」详细介绍…</p>';
    try {
      const r = await kernel.api('ai')?.ask({
        callType: 'march_intro',
        scene: '了解中国工农红军长征',
        situation: '标题页科普入口：请求详细介绍',
        state: {},
        extraContext: '用途：教育科普与赛制演示；输出将直接展示在界面上。',
      });
      if (!r || r._error) {
        bodyBox.innerHTML = `<p class="muted">模型未返回详细介绍：${escapeHtml(r?.message || '未知错误')}。可点「重新生成介绍」，或到设置里检查接口与 Key。</p>`;
        return;
      }
      const sections = Array.isArray(r.sections) ? r.sections : [];
      const points = Array.isArray(r.key_points) ? r.key_points : [];
      const timeline = Array.isArray(r.timeline) ? r.timeline : [];
      bodyBox.innerHTML = `
        <p class="intro-ai-note"><strong>此内容由 AI 生成</strong> · callType=march_intro · 仅供科普参考，请以权威史料为准。</p>
        <h3 class="intro-title">${escapeHtml(r.title || '中国工农红军长征')}</h3>
        <p class="intro-summary">${escapeHtml(r.summary || '')}</p>
        ${sections.map((s) => `
          <section class="intro-sec">
            <h4>${escapeHtml(s?.heading || '')}</h4>
            <p>${escapeHtml(s?.body || '')}</p>
          </section>`).join('')}
        ${points.length ? `<section class="intro-sec"><h4>要点</h4><ul class="how-list">${points.map((p) => `<li>${escapeHtml(String(p))}</li>`).join('')}</ul></section>` : ''}
        ${timeline.length ? `<section class="intro-sec"><h4>时间线</h4><ul class="how-list">${timeline.map((t) => `<li><strong>${escapeHtml(String(t?.when || ''))}</strong> — ${escapeHtml(String(t?.what || ''))}</li>`).join('')}</ul></section>` : ''}
        ${r.note ? `<p class="how-note">${escapeHtml(r.note)}</p>` : ''}
        <p class="intro-ai-note">运行态真调 · 记录见顶栏「记录」</p>
      `;
    } catch (e) {
      bodyBox.innerHTML = `<p class="muted">调用失败：${escapeHtml(String(e?.message || e))}</p>`;
    }
  };

  const askQa = async () => {
    if (qaBusy) return;
    const q = (qaInput?.value || '').trim();
    if (!q) {
      if (qaOut) qaOut.innerHTML = '<p class="muted sm">请先输入问题。</p>';
      return;
    }
    qaBusy = true;
    const askBtn = $('btn-march-qa');
    if (askBtn) { askBtn.disabled = true; askBtn.textContent = '回答中…'; }
    if (qaOut) qaOut.innerHTML = '<p class="muted">正在向模型提问，请稍候…</p>';
    try {
      const r = await kernel.api('ai')?.ask({
        callType: 'march_qa',
        scene: '长征常识问答',
        situation: q,
        state: {},
        extraContext: `【问题】${q}\n请就长征相关常识作答。`,
      });
      if (!r || r._error) {
        if (qaOut) qaOut.innerHTML = `<p class="muted">未能得到回答：${escapeHtml(r?.message || '未知错误')}。可换一种问法，或检查设置里的接口与 Key。</p>`;
        return;
      }
      const tips = Array.isArray(r.tips) ? r.tips : [];
      if (qaOut) {
        qaOut.innerHTML = `
          <p class="intro-qa-q"><strong>问：</strong>${escapeHtml(q)}</p>
          <p class="intro-qa-a">${escapeHtml(r.answer || '')}</p>
          ${tips.length ? `<ul class="how-list">${tips.map((t) => `<li>${escapeHtml(String(t))}</li>`).join('')}</ul>` : ''}
          <p class="intro-ai-note"><strong>此回答由 AI 生成</strong> · 请自行鉴别 · callType=march_qa</p>
        `;
      }
    } catch (e) {
      if (qaOut) qaOut.innerHTML = `<p class="muted">调用失败：${escapeHtml(String(e?.message || e))}</p>`;
    } finally {
      qaBusy = false;
      if (askBtn) { askBtn.disabled = false; askBtn.textContent = '提问'; }
    }
  };

  const btn = $('btn-march-intro');
  if (btn) btn.onclick = openIntro;
  const refresh = $('btn-march-intro-refresh');
  if (refresh) refresh.onclick = openIntro;
  const closeBtn = $('btn-march-intro-close');
  if (closeBtn) closeBtn.onclick = () => {
    hideOverlay('screen-march-intro');
    showScreen('screen-title');
  };
  const askBtn = $('btn-march-qa');
  if (askBtn) askBtn.onclick = askQa;
  if (qaInput) {
    qaInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); askQa(); }
    });
  }
}


// ─── settings ───
/** 设置页当前表单值（自定义模型名优先于下拉） */
function settingsForm() {
  const custom = ($('set-model-custom')?.value || '').trim();
  return {
    model: custom || ($('set-model')?.value || ''),
    apiUrl: ($('set-url')?.value || '').trim(),
    reasoningEffort: $('set-effort')?.value ?? '',
  };
}

function renderSettingsStatus(cfg) {
  $('set-key-mask').textContent =
    `当前 Key：${cfg.keyMask || '（无）'}　模型：${cfg.model}`
    + `　推理档位：${cfg.reasoningEffort || '（默认）'}`;
}

async function openSettings() {
  const cfg = await fetchConfig();
  setConfig(cfg);
  const sel = $('set-model');
  sel.innerHTML = (cfg.availableModels || ['glm-5.1', 'glm-5.3-flash'])
    .map((m) => `<option value="${m}" ${m === cfg.model ? 'selected' : ''}>${m}</option>`)
    .join('');
  const custom = $('set-model-custom');
  if (custom) {
    custom.value = '';
    custom.placeholder = `或直接输入模型名（当前：${cfg.model}）`;
  }
  const eff = $('set-effort');
  if (eff) {
    const list = ['', ...(cfg.availableReasoningEfforts || ['low', 'high', 'max'])];
    eff.innerHTML = list
      .map((e) => `<option value="${e}" ${String(cfg.reasoningEffort ?? '') === e ? 'selected' : ''}>${e || '（默认，不传）'}</option>`)
      .join('');
  }
  $('set-key').value = '';
  // 接口地址回填用**完整地址**（apiUrlFull）。掩码串 `…/chat/***` 拼不回原值：
  // 早先这里是 `cfg.apiUrl.replace('/***','/chat/completions')`，但掩码只替换了最后一段，
  // 前面的 `chat/` 还在，拼出来成了 `…/chat/chat/completions` —— 于是"打开设置页、
  // 什么都不改直接点保存"会把地址写坏，那之后每次调用都是 204 空响应（2026-09-17 修）。
  // 老服务端没有 apiUrlFull 时就留空 + 提示，绝不拿掩码猜（留空 = 保存时不改这一项）。
  const urlBox = $('set-url');
  if (urlBox) {
    urlBox.value = cfg.apiUrlFull || '';
    urlBox.placeholder = cfg.apiUrlFull ? '' : `当前：${cfg.apiUrl || '（未配置）'}（留空 = 不改这一项）`;
  }
  const devToggle = $('set-devtools');
  if (devToggle) devToggle.checked = isDevToolsOn();
  renderSettingsStatus(cfg);
  $('set-status').textContent = '';
  $('set-test-result').innerHTML = '';
  showOverlay('screen-settings');
}

function bindSettings() {
  $('btn-settings-close').onclick = () => hideOverlay('screen-settings');
  // 展示开关：评委演示 / 答辩 / 记录 / 模型标签的显隐，本机记住
  const devToggle = $('set-devtools');
  if (devToggle) {
    devToggle.onchange = () => {
      const on = setDevTools(devToggle.checked);
      toast(on ? '已显示评委演示与调试工具' : '已切回纯游戏界面');
    };
  }
  $('btn-set-save').onclick = async () => {
    const body = settingsForm();
    const key = $('set-key').value.trim();
    if (key) body.apiKey = key;
    try {
      const r = await saveConfig(body);
      setConfig(await fetchConfig());
      setAiMode(getConfig());
      $('title-model').textContent = getConfig().model;
      renderSettingsStatus(getConfig());
      $('set-status').textContent = `已保存并生效：${r.model}　推理档位 ${r.reasoningEffort || '（默认）'}${r.hasKey ? '' : '　⚠ 未配置 Key'}`;
      $('set-key').value = '';
      $('set-model-custom').value = '';
      toast('设置已保存');
    } catch (e) {
      $('set-status').textContent = '保存失败：' + e.message;
    }
  };
  $('btn-set-test').onclick = async () => {
    const f = settingsForm();
    const key = $('set-key').value.trim();
    const body = { ...f };
    if (key) body.apiKey = key;
    $('set-status').textContent = `测试中…（${body.model}${body.reasoningEffort ? ' · ' + body.reasoningEffort : ''}）`;
    $('set-test-result').innerHTML = '<p class="muted sm">正在用上面填写的配置发一次真实请求…</p>';
    try {
      const { probe } = await testConfig(body);
      if (probe.ok) {
        $('set-status').textContent =
          `✓ 连通成功　${probe.model}　${probe.latencyMs}ms　推理档位 ${probe.reasoningEffort || '（默认）'}`
          + `　JSON ${probe.jsonOk ? '正常' : '未解析'}　finish=${probe.finishReason || '—'}`;
        const u = probe.usage;
        $('set-test-result').innerHTML = `
          <div class="muted sm">回声：${escapeHtml(probe.reply || '（内容为空）')}</div>
          ${u ? `<div class="muted sm">tokens：in ${u.prompt_tokens} / out ${u.completion_tokens}</div>` : ''}
          ${probe.emptyContent ? '<div class="sm txt-bad">⚠ content 为空：多半是推理档位没设，或 max_tokens 不够</div>' : ''}`;
      } else {
        $('set-status').textContent = `✗ 失败${probe.httpStatus ? '（HTTP ' + probe.httpStatus + '）' : ''}　${probe.latencyMs}ms`;
        $('set-test-result').innerHTML = `<div class="sm txt-bad">${escapeHtml(probe.error || '未知错误')}</div>`;
      }
    } catch (e) {
      $('set-status').textContent = '连通失败：' + e.message;
    }
  };
  $('btn-set-clear-logs').onclick = async () => {
    await clearLogs();
    if (hasS()) st().set('aiCount', 0, '清零调用计数');
    $('ai-count').textContent = '0';
    toast('调用日志已重置');
    $('set-status').textContent = '日志已清空';
  };
}























/** 第四幕营地的五条附身线：点亮 ≥3 条解锁篝火夜 */

















/**
 * 打开玩法板（tpl-board）：题名 + 数值签 + 玩法区都由这里起头。
 *
 * 为什么要有这一屏：小游戏原先挤在舞台纸卷里（上面还顶着给对白用的人物立绘），
 * 而样板页画好的"游戏名 + 数值签 + 玩法区 + 动作区"没有地方落地。
 * 玩法自己的状态（鱼篓/咬钩、信号 x/5…）由玩法通过 `{ stats }` 写进板头，
 * 这里只负责把板摆出来 —— 各玩法别再自己拼标题与数值签（2026-09-13 批四）。
 */
/** 舞台屏的清理（登记给 screens 模块；渲染与清理住在一起，谁也不会忘） */
function clearStage() {
  document.querySelectorAll('#sheet-actions').forEach((n) => { n.innerHTML = ''; });
  const panel = $('stage-panel'); if (panel) panel.innerHTML = '';
  const banner = $('stage-banner'); if (banner) banner.textContent = '';
  const dlg = $('dlg-body'); if (dlg) dlg.textContent = '';
}





// 「继续」统一走 step.js 的 waitContinue（带 data-action 契约标记）












boot();
