import { COMPANIONS, PATH_ZONES } from './data.js';
import { createState, applyEffects, unlockFact, saveState, checkFailure, addLoss, applyStarvation,
  markLineDone, linesDoneCount, canNight, apPerDay, dayScene, loadState, resolveLoss } from './state.js';
import { ORIGINS, ORIGIN_QUIZ, applyOrigin, applyOriginQuiz, findOrigin } from './origin.js';
import { applyFeatures, setDevTools, isDevToolsOn } from './features.js';
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
  setStepState('busy');           // 契约：告诉所有人"这一步在等模型，先别点"
  let result;
  try {
    result = await decide(payload);
  } catch (err) {
    result = { _error: true, message: String(err.message || err) };
  } finally {
    setStepState('awaiting');
  }
  // 不再用兜底文案编造叙事：失败就明说，并给一个重试键
  if (result?._error) {
    const msg = result.message || '未知错误';
    toast(`模型调用失败：${msg}`, 6000);
    appendCampLog(S, '错误', `AI 调用失败：${msg}`);
    const again = await askAiRetry(result, payload);
    if (again) return callAI(payload);
    return { _error: true, message: msg };
  }
  const entry = {
    callType: payload.callType || 'decide',
    scene: payload.scene || '',
    ms: Date.now() - t0,
    model: config?.model || 'glm',
    snippet: (result.narrative || result.reply || result.scene_text || result.title || result.question || '').slice(0, 80),
  };
  aiFeed.unshift(entry);
  if (aiFeed.length > 30) aiFeed.pop();
  if (judgeMode) renderInspector();
  const label = $('thinking-label');
  if (label) label.textContent = `${entry.callType} · ${entry.model}`;
  return result;
}

/** 当前可见屏里适合挂按钮的容器 */
function actionHost() {
  const visible = [...document.querySelectorAll('.screen')].find((s) => !s.classList.contains('hidden'));
  if (!visible) return document.body;
  return visible.querySelector('#night-body')
    || visible.querySelector('#stage-panel')
    || visible.querySelector('#sheet-actions')
    || visible;
}

/** 调用失败时给「重试 / 跳过」两个明确选择（不再自动编造内容） */
function askAiRetry(info, payload) {
  return new Promise((resolve) => {
    const host = actionHost();
    host.querySelectorAll('#ai-retry-row').forEach((n) => n.remove());
    const row = document.createElement('div');
    row.id = 'ai-retry-row';
    row.className = 'blk-actions';   // 区块；与内容的间距由 #ai-retry-row 一条规则给（components.css）
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn primary';
    retryBtn.textContent = '重试这一次调用';
    retryBtn.dataset.action = 'ai-retry';
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn ghost';
    skipBtn.textContent = '跳过（本次不留叙事）';
    skipBtn.dataset.action = 'ai-skip';
    const tip = document.createElement('div');
    tip.className = 'muted sm';
    tip.style.width = '100%';
    tip.textContent = `失败原因：${info.message || '未知'}`;
    retryBtn.onclick = () => { row.remove(); resolve(true); };
    skipBtn.onclick = () => { row.remove(); resolve(false); };
    row.append(tip, retryBtn, skipBtn);
    host.appendChild(row);
    void payload;
  });
}

function renderInspector() {
  const box = $('ai-ins-body');
  if (!box) return;
  box.innerHTML = aiFeed
    .map(
      (e) => `<div class="ai-item">
        <span class="tag">${escapeHtml(e.callType)}</span>
        <span class="src-glm">${escapeHtml(e.model || 'GLM')}</span>
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
import { runFishing, runNightSchool, runCandy, runSentry, runGomoku, runBendNeedle, runLuding, runGrab } from './minigames.js';
import { bindSandbox } from './sandbox.js';
import * as UI from './ui.js';
import { setStep, setStepState, waitContinue, askChoice, markAction, markMini, choiceButton } from './step.js';
// 内核：模块注册 / 事件总线 / 契约 / 只读快照 / 诊断（架构见 docs/BUS.md）。
// 批 1 只把地基启动起来，业务模块从批 2 起逐个挂上来（见 wiring.js 的 MODULES 清单）。
import { kernel, loadModules } from './kernel/index.js';

const { $, showScreen, setTopbar, renderStats, renderAp, renderCompanions,
  appendCampLog, toast, showThinking, say, setPortrait, setStageBanner, setStagePanel,
  flashEffects, setAiMode, bumpAiCount, typeText, escapeHtml, renderLogs, renderFacts,
  showOverlay, hideOverlay, replayAnim, wipe, bindParallax } = UI;

let S = null;
let allFacts = {};
let actsData = null;
let config = { model: 'glm-5.3-flash', hasKey: false };
let echoResolve = null;
let talkPending = false;

/** 声明当前步骤：全项目统一的交互契约入口（见 step.js） */
function step(id, kind = 'choice', state = 'awaiting') {
  setStep(id, kind, state);
}

/**
 * 素材「落盘即生效」：优先用新图，探测不到就退回占位图。
 * 生图模型按 docs/HANDOFF-ART.md 的表把文件放进 public/assets/scenes/，
 * 无需改任何代码，下一次进入对应场景就会用上。
 */
const _imgState = new Map();
function sceneImage(primary, fallback) {
  if (!primary) return fallback;
  const st = _imgState.get(primary);
  if (st === true) return primary;
  if (st === false) return fallback;
  const img = new Image();
  img.onload = () => _imgState.set(primary, true);
  img.onerror = () => _imgState.set(primary, false);
  img.src = primary;
  _imgState.set(primary, false); // 探测完成前先用兜底，避免白屏
  return fallback;
}

/** 启动时预热候选素材，进入场景时就能立刻用上新图 */
function preloadScenes() {
  [
    '/assets/scenes/sentry_night.jpg', '/assets/scenes/sugar_close.jpg', '/assets/scenes/snow_climb.jpg',
    '/assets/scenes/snow_camp.jpg', '/assets/scenes/snow_let_clothes.jpg', '/assets/scenes/luding_bridge.jpg',
    '/assets/scenes/jinsha_ferry.jpg', '/assets/scenes/map_desk.jpg', '/assets/scenes/depart_bridge.jpg',
    '/assets/scenes/huining_flag.jpg', '/assets/scenes/lazikou_cliff.jpg',
    '/assets/scenes/xiangjiang_bridge.jpg', '/assets/scenes/zunyi_street.jpg', '/assets/scenes/huining_crowd.jpg',
    '/assets/scenes/luding_run.jpg', '/assets/scenes/luding_bridge.jpg', '/assets/scenes/jinsha_ferry.jpg',
    '/assets/scenes/depart_crowd.jpg', '/assets/scenes/xiangjiang_wreck.jpg',
    '/assets/scenes/xiangjiang_night.jpg', '/assets/scenes/zunyi_room.jpg',
    '/assets/scenes/map_route.jpg', '/assets/scenes/echo_paper.jpg',
    // 立绘（第三轮）：落盘即生效，见 portraitImage()
    '/assets/characters/mother.png', '/assets/characters/xianggui.png', '/assets/characters/guide.png',
    '/assets/characters/boatman.png', '/assets/characters/recruit.png', '/assets/characters/straggler.png',
    '/assets/characters/drummer.png', '/assets/characters/captain.png', '/assets/characters/teacher.png',
    '/assets/characters/wounded.png',
  ].forEach((p) => {
    const img = new Image();
    img.onload = () => _imgState.set(p, true);
    img.onerror = () => _imgState.set(p, false);
    img.src = p;
  });
}

/** 角色名 → 立绘文件（约定名，落盘即生效；没有就退回文字头像） */
const PORTRAIT_FILE = {
  老班长: '/assets/characters/laoban.png',
  指导员: '/assets/characters/zhiyuan.png',
  红小鬼: '/assets/characters/xiaogui.png',
  卫生员: '/assets/characters/weisheng.png',
  母亲: '/assets/characters/mother.png',
  老乡: '/assets/characters/xianggui.png',
  向导: '/assets/characters/guide.png',
  船工: '/assets/characters/boatman.png',
  新兵: '/assets/characters/recruit.png',
  掉队的战士: '/assets/characters/straggler.png',
  宣传员: '/assets/characters/drummer.png',
  突击队长: '/assets/characters/captain.png',
  文化教员: '/assets/characters/teacher.png',
  担架伤员: '/assets/characters/wounded.png',
};

function portraitImage(name) {
  if (!name) return undefined;
  const key = Object.keys(PORTRAIT_FILE).find((k) => String(name).includes(k));
  return key ? sceneImage(PORTRAIT_FILE[key], '') : undefined;
}

/**
 * NPC 立绘统一入口：专属立绘（PORTRAIT_FILE）→ 同伴立绘 → 文字头像。
 * 热点/抉择集只要写 npc 字段，新立绘落盘就自动生效，不用改这里。
 * 注意：同伴兜底必须放在专属立绘之后，否则"非同伴 NPC"会一律显示老班长的脸。
 */
function showNpc(npc, { role, mood = '平静' } = {}) {
  if (!npc) { setPortrait('你', role || '年轻战士', '你', mood); return; }
  const comp = COMPANIONS.find((c) => npc.includes(c.name));
  setPortrait(npc, role || comp?.role || '同行者', comp?.ava || npc.slice(0, 1), mood,
    portraitImage(npc) || comp?.img);
}

const CHOICE_SETS = {
  cross: {
    title: '怎么过河',
    callType: 'branch_judge',
    img: '/assets/scenes/depart_bridge.jpg',
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
    img: '/assets/scenes/xiangjiang_bridge.jpg',
    loss: { who: '担架上的伤员', reason: '为了抢时间冲过封锁，担架没能全部抬过去' },
    options: [
      { label: '立刻冲过去', sub: '快，但风险大', risk: 'high' },
      { label: '等烟散了再走', sub: '稳，但更耗体力', risk: 'mid' },
      { label: '绕浅滩', sub: '远一点，脚会湿', risk: 'low' },
    ],
    factId: 'h_xiangjiang',
  },
  direction: {
    title: '往哪里走',
    callType: 'branch_judge',
    img: '/assets/scenes/map_desk.jpg',
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
    img: '/assets/scenes/jinsha_ferry.jpg',
    // 抢渡是有代价的抉择：体力/粮食见底时硬渡，会有人留在江里
    loss: { who: '木筏上的战士', reason: '抢在雾散前强渡，木筏撞上暗礁，有人没能上岸' },
    options: [
      { label: '跟船工的桨声走', sub: '信老乡', risk: 'mid' },
      { label: '天亮再渡', sub: '更安全，更慢', risk: 'low' },
      { label: '分批快渡，伤员先上', sub: '分工', risk: 'mid' },
    ],
    factId: 'h_jinsha',
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
    img: '/assets/scenes/lazikou_cliff.jpg',
    // 正面强攻从来不是零代价：这是全篇最后一个"会失去人"的抉择
    loss: { who: '突击班里的战士', reason: '正面强攻腊子口，突击班没能全部下来' },
    options: [
      { label: '正面佯攻，侧崖奇袭', sub: '出其不意', risk: 'mid' },
      { label: '集中火力正面强攻', sub: '硬碰硬', risk: 'high' },
      { label: '找向导绕道', sub: '耗粮但稳', risk: 'low' },
    ],
    factId: 'h_huining',
  },
  rally: {
    title: '会师',
    callType: 'branch_judge',
    img: '/assets/scenes/huining_flag.jpg',
    options: [
      { label: '跑过去和另一路兄弟拥抱', sub: '说不出话' },
      { label: '先安顿伤员再会合', sub: '责任' },
      { label: '把红旗插到高处', sub: '让所有人都看见' },
    ],
    factId: 'h_huining',
  },
  snow_help: {
    title: '扶他一把',
    callType: 'branch_judge',
    img: '/assets/scenes/snow_climb.jpg',
    npc: '掉队的战士',
    npcRole: '雪山掉队',
    loss: { who: '掉队的战士', reason: '风雪里他没能跟上，队伍在天黑前下不了山' },
    options: [
      { label: '架起他的胳膊一起走', sub: '慢，但谁都不落', risk: 'low' },
      { label: '替他背枪，让他自己走', sub: '分担一点是一点', risk: 'mid' },
      { label: '先赶到山顶再说', sub: '保存自己', risk: 'high' },
    ],
    factId: 'h_xueshan',
  },
  message: {
    title: '一封密信',
    callType: 'branch_judge',
    img: '/assets/scenes/zunyi_street.jpg',
    options: [
      { label: '按地址送到，不问内容', sub: '守规矩' },
      { label: '先交给指导员', sub: '稳妥' },
      { label: '拆开看一眼', sub: '心里不踏实' },
    ],
    factId: 'h_zunyi',
  },
  oillamp: {
    title: '油灯下的地图',
    callType: 'branch_judge',
    img: '/assets/scenes/map_desk.jpg',
    options: [
      { label: '照着地图找渡口', sub: '信图上的墨线' },
      { label: '出门问当地的老乡', sub: '信活人' },
      { label: '按原路折回一段', sub: '稳，但多耗体力' },
    ],
    factId: 'h_zunyi',
  },
  luding_plan: {
    title: '铁索桥头',
    callType: 'branch_judge',
    img: '/assets/scenes/luding_bridge.jpg',
    options: [
      { label: '先派人试探铁索', sub: '稳，但探路的人最险', risk: 'high' },
      { label: '等天色再暗些', sub: '隐蔽，但耗时间', risk: 'mid' },
      { label: '一次冲过去', sub: '快，铁索上没处躲', risk: 'high' },
    ],
    factId: 'h_luding',
  },
};

// ─── boot ───
async function boot() {
  applyFeatures();               // 先按本机开关决定"纯游戏界面"还是含调试/答辩入口
  // 内核先启动：模块（IP）注册 → init → 按描述符接线 → ready。
  // 幂等，且模块加载失败不影响启动（分批迁移期清单里可能列着还没写的模块）。
  await loadModules();
  kernel.boot();
  config = await fetchConfig();
  setAiMode(config);
  $('title-model').textContent = config.model;
  allFacts = (await fetchFacts()) || {};
  actsData = await fetchActs();
  bindChrome();
  exposeSheetHooks();
  // 微视差：两幅整屏插画（封面与营地全景）随指针轻微位移；减动效偏好下 bindParallax 自己跳过
  bindParallax('screen-title', '.title-bg');
  bindParallax('screen-camp', '.pano-img');
  bindTitle();
  bindEcho();
  bindSettings();
  preloadScenes();
  offerResume();
  showScreen('screen-title');
  setTopbar(false);
}

/** 有未完成的局就露出「继续上一局」（状态由 sessionStorage 保存） */
function offerResume() {
  const saved = loadState();
  const btn = $('btn-continue-run');
  if (!saved || !btn || saved.actIndex == null) return;
  btn.classList.remove('hidden');
  btn.onclick = () => resumeRun(saved);
}

function resumeRun(saved) {
  S = { ...createState(), ...saved };
  setTopbar(true);
  renderStats(S);
  renderAp(S);
  renderCompanions(S);
  renderJourney();
  $('ai-count').textContent = String(S.aiCount || 0);
  const act = currentActDef();
  if (!act) {
    startRun(S.mode || 'study');
    return;
  }
  toast(`接着上一局：${act.title} · 第 ${S.day || 1} 日`, 3200);
  enterCampDay(act, S.day || 1);
}

function currentActDef() {
  const order = actsData?.order || [];
  const idx = S.actIndex || 0;
  const id = order[idx];
  return actsData?.acts?.[id] || null;
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
      if (!S) return;
      showOverlay('screen-fire');
      renderFireMenu(currentActDef());
    },
    // 答题 / 篝火夜 / 终局：都太长（要走到深幕），截图时直接跑各自的**真实流程**，
    // 由截图脚本在中途等（不另写一套渲染，理由同 fire）。
    quiz: () => { if (S) runQuiz(currentActDef()); },
    night: () => {
      if (!S) return;
      // 篝火夜的门槛是"点亮 ≥3 条附身线"；截图只需要过门槛，内容仍由模型现场生成
      S.linesDone = ['fishing', 'candy', 'sentry'];   // linesDone 是数组（markLineDone 往里 push）
      runNightChoice(currentActDef());
    },
    end: () => { if (S) runEnding(); },
    logs: () => $('btn-logs').click(),
    defense: () => $('btn-defense').click(),
    // 玩法板同理：四个玩法都在幕深处，截图/体检直接把它们摆到板屏上
    mini: (name) => {
      if (!S) return false;
      const games = {
        fishing: ['金色的鱼钩', (host, o) => runFishing(host, o)],
        needle: ['弯针成钩', (host, o) => runBendNeedle(host, o)],
        school: ['夜校识字', (host, o) => runNightSchool(host, o)],
        candy: ['分糖', (host, o) => runCandy(host, o)],
        sentry: ['夜岗', (host, o) => runSentry(S.tonightPassword, host, o)],
        gomoku: ['泥地五子棋', (host, o) => runGomoku(host, o)],
        luding: ['飞夺泸定桥', (host, o) => runLuding(host, o)],
        grab: ['陡坡 · 拽住他', (host, o) => runGrab(host, o)],
      };
      const spec = games[name];
      if (!spec) return false;
      const board = openBoard({ title: spec[0] });
      spec[1](mountMini(board, name, 'mini-host'), { stats: board.stats });
      return true;
    },
  };
  // 登记进内核的统一入口（唯一真相），再挂到 window 供脚本使用
  kernel.screens.register(() => api);
  window.__czScreens = api;
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
  screensApi?.own('screen-stage', clearStage);
  screensApi?.own('screen-board', clearBoard);

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
      const rows = [...document.querySelectorAll('.choice-row:not(.hidden) .blk-choice:not([disabled]), #stage-panel .blk-choice:not([disabled]), #fire-opts .blk-choice:not([disabled]), #quiz-body .blk-choice:not([disabled]), .path-zone')]
        .filter((el) => el.offsetParent !== null);
      if (rows[n - 1]) {
        kernel.emit('sfx:play', { name: 'click' });
        rows[n - 1].click();
      }
    }
  });
}

function openJournal() {
  if (!S) return;
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
    // 逐条入场：两栏列表各自一条条渗出来
    replayAnim($('journal-choices'), 'anim-stagger');
    replayAnim($('journal-facts'), 'anim-stagger');

  $('journal-foot').textContent =
    `出身 ${originText()}　｜　`
    + `体力 ${S.体力} · 粮食 ${S.粮食} · 士气 ${S.士气} · 信念 ${S.信念} · 民心 ${S.民心}`
    + `　｜　附身线 ${linesDoneCount(S)}/${LINES_TOTAL}`
    + `　｜　对决 ${S.quiz?.human ?? 0}:${S.quiz?.ai ?? 0}`
    + `　｜　模型 ${config.model}`;
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
  kernel.emit('sfx:play', { name: 'wrong' });
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
    { k: '平均延迟', v: avg + 'ms', n: '真调 1–8s（推理档位 low）' },
    { k: 'GLM 真调', v: glmCalls, n: `source=GLM · ${config?.model || 'glm'}` },
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
  const study = $('btn-mode-study');
  const march = $('btn-mode-march');
  if (study) study.onclick = () => startRun('study');
  if (march) march.onclick = () => startRun('march');
  const quick = $('btn-mode-quick');
  if (quick) quick.onclick = () => startRun('quick');
  const judge = $('btn-judge');
  if (judge) {
    // 只在展示开关打开时绑定：关掉后按钮不可见，也不该有任何入口能触发答辩实况
    judge.onclick = isDevToolsOn() ? () => {
      setJudgeMode(true);
      startRun('study');
    } : null;
  }
  $('btn-how').onclick = () => showOverlay('screen-how');
  $('btn-how-back').onclick = () => hideOverlay('screen-how');
  const sb = $('btn-mode-sandbox');
  if (sb) sb.onclick = () => startSandbox();
  $('btn-inspect-close') && ($('btn-inspect-close').onclick = () => setJudgeMode(false));
}

async function startSandbox() {
  setTopbar(true);
  showScreen('screen-sandbox');
  const sbLogs = $('btn-sb-logs');
  if (sbLogs) sbLogs.onclick = () => $('btn-logs')?.click();
  await bindSandbox({
    onExit: () => {
      kernel.emit('scene:enter', { name: 'title' });
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
  config = cfg;
  const sel = $('set-model');
  sel.innerHTML = (cfg.availableModels || ['glm-5.3-flash', 'glm-5.1'])
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
  $('set-url').value = cfg.apiUrl?.replace('/***', '/chat/completions') || '';
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
      config = await fetchConfig();
      setAiMode(config);
      $('title-model').textContent = config.model;
      renderSettingsStatus(config);
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
    S && (S.aiCount = 0);
    $('ai-count').textContent = '0';
    toast('调用日志已重置');
    $('set-status').textContent = '日志已清空';
  };
}

function showEcho({ title, play, real, fic }) {
  markAction($('btn-echo-ok'), 'echo-ok');
  return new Promise((resolve) => {
    kernel.emit('sfx:play', { name: 'echo' });
    // 史实回响底纹：有 echo_paper 就用它（压一层深色渐变，保证文字可读）
    const paper = sceneImage('/assets/scenes/echo_paper.jpg', '');
    const cinema = document.querySelector('#screen-echo .echo-cinema');
    if (cinema) {
      cinema.style.backgroundImage = paper
        // 同上：纸纱盖在纸纹上，保持浅底墨字
        ? `linear-gradient(160deg, rgba(244,237,223,0.9), rgba(230,218,195,0.94)), url('${paper}')`
        : '';
    }
    // 史实回响的播报点：有史实卡就念卡名（命中 14 张标题的 TTS 缓存），没有才念固定旁白
    if (title) kernel.emit('voice:say', { text: title, actorId: '旁白', voiceId: 'narr' });
    else kernel.emit('voice:say', { text: '你刚经历的，和真实发生过的，往往只隔着一层时间。', actorId: '叙事', voiceId: 'narr_echo' });
    $('echo-title').textContent = title || '刚刚发生的事';
    $('echo-play').textContent = play || '';
    $('echo-real').textContent = real || '';
    $('echo-fic').textContent = fic ? `虚构边界：${fic}` : '';
    showOverlay('screen-echo');
    // 回响两栏逐条入场（印章的钤印动效由 .echo-seal 自己的动画负责）
    replayAnim(document.querySelector('#screen-echo .echo-grid'), 'anim-stagger');
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
  if (mode === 'quick') toast('快速演示：每幕只跑主玩法与对决', 3200);
  // 快速模式按定义要短，跳过开场设定；标准/行军模式走一次出身与出发前一问
  if (mode !== 'quick') await runOrigin();
  await runActIntro();
}

/**
 * 开场设定：出身三选一 + 一道固定问答（本地题库，不调模型）。
 * 只影响起始五维，写入 S.origin / S.originQuiz，手记与终局关系面板会展示。
 */
async function runOrigin() {
  step('origin', 'choice');
  showScreen('screen-stage');
  setStageBanner('你从哪里来', sceneImage('/assets/scenes/depart_crowd.jpg', ''));
  setPortrait('你', '年轻战士', '你', '平静');
  setStagePanel('<p class="hint">队伍就要出发了。先说说你自己——这一条只决定你的起点。</p>'
    + '<div class="choices" id="origin-opts"></div>');
  const picked = await askChoice($('origin-opts'), ORIGINS.map((o) => ({ label: o.label, sub: o.sub })));
  const { origin, changes } = applyOrigin(S, ORIGINS[picked.index]?.id);
  if (!origin) return;                      // 理论上不会发生：选项由 ORIGINS 生成
  flashEffects(changes);
  renderStats(S);
  appendCampLog(S, '出发', `你是${origin.label}：${origin.sub}。`);
  logChoice({ title: '出发前' }, `出身：${origin.label}`, '设定');
  saveState(S);

  // 出发前一问：答对加信念，答错不扣（第一屏不给挫败感）
  step('origin:quiz', 'choice');
  setStagePanel(`<p class="hint">${escapeHtml(ORIGIN_QUIZ.question)}</p><div class="choices" id="origin-quiz"></div>`);
  const ans = await askChoice($('origin-quiz'), ORIGIN_QUIZ.options.map((label) => ({ label })));
  const quiz = applyOriginQuiz(S, ans.index);
  if (quiz.right) flashEffects(quiz.changes);
  setStagePanel(`<p class="hint">${quiz.right ? '答对了。' : '记住了。'}${escapeHtml(ORIGIN_QUIZ.explain)}</p>`);
  appendCampLog(S, '出发', `${quiz.right ? '答对' : '答错'}：${ORIGIN_QUIZ.explain}`);
  renderStats(S);
  saveState(S);
  await waitContinue('进入于都河');
}

/** 出身显示文案：手记与终局关系面板共用 */
function originText() {
  const o = findOrigin(S?.origin);
  if (!o) return '未设定';
  return S.originQuiz ? `${o.label}（出发前一问${S.originQuiz.right ? '答对' : '答错'}）` : o.label;
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
  step('failure', 'end');
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
  // 模型没给出结算就明说，不编造叙事（callAI 内部已给过「重试 / 跳过」）
  if (!end || end._error) {
    $('end-title').textContent = '结算未完成';
    $('end-paras').innerHTML = '<p class="muted">模型没有返回这段失败结算。原因已记入日志，可在「设置 → 测试连接」复查 Key，或翻「记录」看失败详情。</p>';
    $('end-history').innerHTML = '';
    renderStats(S);
    $('end-rel').innerHTML = renderRelations();
    $('end-personal').textContent = '';
    saveState(S);
    return;
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
  const rows = [`出身：${originText()}`]
    .concat(COMPANIONS.map((c) => `${c.name}：${S[`好感_${c.name}`] ?? 40}`));
  const lost = (S.losses || []).map((l) => `<span class="txt-bad">${escapeHtml(l.who)} · ${escapeHtml(l.reason)}</span>`);
  return rows.concat(lost).join('<br/>');
}

async function runActIntro() {
  const act = currentActDef();
  if (!act) return runEnding();
  if ($('act-tag')) $('act-tag').textContent = `${act.title} · ${act.subtitle}`;
  await runCutscene([
    { img: act.pano, text: `${act.date}。${act.subtitle}——${act.theme}。` },
    { img: sceneImage(act.cutAlt, act.pano), text: '营地在暮色里安顿下来。光点在呼吸，走近一处，把事做完。' },
  ]);
  if (act.prelude) await runPrelude(act);
  if (S.mode === 'quick') return runQuickAct(act);
  enterCampDay(act, 1);
}

/** 快速模式：跳过营地日，只跑「一次关键交谈 + 主玩法 + 对决」 */
async function runQuickAct(act) {
  S.day = 1;
  S.maxAp = 1;
  S.ap = 1;
  S.phase = 'camp';
  renderStats(S);
  renderAp(S);
  renderCompanions(S);
  renderJourney();
  const talkHotspot = (dayScene(act, 1).hotspots || []).find((h) => h.kind === 'talk');
  if (talkHotspot) {
    // 快速模式常在 finishAct 的锁内被调用：内部流转交给 withLock 的 from:'flow' 处理，不用手工解锁
    await withLock(() => doTalk(act, talkHotspot), { from: 'flow', label: '快速演示' });
    renderStats(S);
    renderCompanions(S);
    saveState(S);
  }
  await runForcedChain(act);
}

async function runCutscene(frames) {
  step('cutscene', 'cutscene');
  showScreen('screen-cutscene');
  wipe($('screen-cutscene'));     // 换幕抹擦：一层墨色横扫而过，动画结束自删
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
  markAction(nextBtn, 'continue');
  markAction(skipBtn, 'skip');
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
  // 过场结束必须摘掉契约标记：这些按钮是静态 DOM，留着会让"当前可交互项"判断出错
  delete nextBtn.dataset.action;
  delete skipBtn.dataset.action;
}

async function runPrelude(act) {
  step(`${act.id}:prelude`, 'choice');
  const pre = act.prelude;
  showScreen('screen-stage');
  setStageBanner(pre.title, sceneImage('/assets/scenes/snow_let_clothes.jpg', pre.pano));
  setPortrait('你', '年轻战士', '你', '风雪');
  setStagePanel('<p class="hint">雪线之上，有人发抖。你怎么选？</p><div class="choices" id="pre-opts"></div>');
  kernel.emit('voice:say', { text: '他接过外衣，没说谢。后来在你走不动时，递了水壶。', actorId: '叙事', voiceId: 'narr_snow' });
  const cs = CHOICE_SETS[pre.choice];
  const choice = (await askChoice($('pre-opts'), cs.options)).label;
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


function enterCampDay(act, day) {
  step(`${act.id}:camp:${day}`, 'camp');
  S.day = day;
  S.maxAp = apPerDay(act);
  S.ap = S.maxAp;
  S.restCount = 0;                 // 新的一天：休息的恢复收益重置
  S.phase = 'camp';
  S.行动日志 = [];
  const scene = dayScene(act, day);
  showScreen('screen-camp');
  $('pano-img').style.backgroundImage = `url('${sceneImage(scene.alt, scene.pano)}')`;
  $('act-title').textContent = scene.label ? `${act.title} · ${scene.label}` : act.title;
  $('day-num').textContent = String(day);
  $('day-max').textContent = String(act.apDays || 1);
  $('camp-hint').textContent = '用光照亮他们。点余烬，走进他的一夜。';
  // 进幕事件：音频（场景表决定环境床与 BGM）、将来的过场/电影、HUD 都听它
  kernel.emit('flow:act-enter', { actId: act.id, day, label: scene.label });
  kernel.emit('sfx:play', { name: 'day' });
  renderStats(S);
  renderAp(S);
  renderCompanions(S);
  renderHotspots(act, scene.hotspots);
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
  markAction(btn, 'march');
  btn.onclick = () => onHotspot(act, { kind: 'march', label: '启程' });
  updateMarchButton();
}

function updateMarchButton() {
  const btn = $('btn-march-fixed');
  if (!btn) return;
  if (kernel.resources.isHeld('flow')) {      // 忙不忙由流程锁说了算（不再看存档里的字段）
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
  kernel.emit('sfx:play', { name: 'march' });
  const flash = document.createElement('div');
  flash.className = 'march-flash';
  flash.innerHTML = `<span>${label || '启程'}</span>`;
  document.body.appendChild(flash);
  await wait(1100);
  flash.remove();
}

function renderHotspots(act, hotspots) {
  const box = $('hotspots');
  box.innerHTML = '';
  const list = hotspots || dayScene(act, S?.day || 1).hotspots;
  list.forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hotspot' + (h.kind === 'march' ? ' march' : '');
    b.style.left = h.x + '%';
    b.style.top = h.y + '%';
    markAction(b, h.kind === 'march' ? 'march' : 'hotspot');
    b.dataset.hotspot = h.kind || '';
    b.dataset.hotspotLabel = h.label || '';
    const apOut = S.ap <= 0 && h.kind !== 'march';
    const spent = hotspotSpent(act, h);
    b.dataset.hotspotState = spent ? 'done' : 'open';
    b.disabled = apOut || spent;
    b.innerHTML = `
      <span class="ember"></span>
      <span class="hs-card">
        <span class="hs-label">${h.label}</span>
        <span class="hs-sub">${spent ? '已看过' : apOut ? '暮色已尽' : (h.sub || '')}</span>
      </span>`;
    b.onclick = () => onHotspot(act, h);
    box.appendChild(b);
  });
}

/** 第四幕营地的五条附身线：点亮 ≥3 条解锁篝火夜 */
const LINE_NAMES = {
  fishing: '钓鱼分汤',
  candy: '分糖',
  sentry: '夜岗',
  school: '夜校识字',
  gomoku: '五子棋',
};
const LINES_TOTAL = Object.keys(LINE_NAMES).length;

function markLine(state, key) {
  if (!state || !LINE_NAMES[key]) return;
  if (markLineDone(state, key)) {
    appendCampLog(state, '附身线', `点亮「${LINE_NAMES[key]}」（${linesDoneCount(state)}/${LINES_TOTAL}）`);
  }
  saveState(state);
}

/** 热点种类 → 处理函数（新增玩法只加一行，不动主流程） */
const HOTSPOT_HANDLERS = {
  talk: (act, h) => doTalk(act, h),
  fishing: (act) => doFishing(act, false),
  school: () => doSchool(),
  rest: () => doRest(),
  share: (act, h) => doShare(h),
  candy: () => doCandy(),
  sentry: () => doSentry(),
  gomoku: () => doGomoku(),
  grab: () => doGrab(),
  roster: () => doRoster(),
  choice: async (act, h) => {
    await doChoice(act, h.action);
  },
};

/**
 * 可重复的热点类型。其余热点做过一次就置灰（isDone），
 * 既防"反复点同一个热点刷资源/刷模型调用"，也让玩家必须去走没走过的地方。
 * 「休息」不在其中：它是体力恢复阀，靠 restCount 递减而不是禁用。
 */
const REPEATABLE_HOTSPOTS = new Set(['fire', 'rest']);

/** 这个热点是否已经做过（走与 HOTSPOT_HANDLERS 相同的 action||id 口径） */
function hotspotSpent(act, h) {
  if (!h || h.kind === 'march' || REPEATABLE_HOTSPOTS.has(h.kind)) return false;
  return isDone(act.id, h.action || h.id);
}

async function onHotspot(act, h) {
  // 忙不忙由流程锁说了算（锁被占时 withLock 会广播 resource:blocked，由 shell 模块提示）
  // 做过一次的热点不再重复结算（不扣行动点、不重复调模型）
  if (hotspotSpent(act, h)) {
    toast('这里已经看过了', 1600);
    return;
  }
  kernel.emit('sfx:play', { name: 'click' });
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
      await runForcedChain(act);              // 同一条流程内：runForcedChain 自己知道要不要占锁
    }, { from: 'user', label: '启程' });
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
    renderHotspots(act, dayScene(act, S.day).hotspots);
    updateMarchButton();
    updateDusk();

    const handler = HOTSPOT_HANDLERS[h.kind];
    if (handler) await handler(act, h);
    // 热点与幕末强制链是同一段内容的两个入口：在营地做过的，强制链不再重播。
    // 键优先取 action（与 forced 里的 id 对齐），没有 action 就用热点 id。
    const doneKey = h.action || h.id;
    if (doneKey) markDone(act.id, doneKey);
    // 立刻按新状态重画热点：热点用一次就作废，但 DOM 若不重画就会停在"看着还能点"的样子——
    // 点下去只弹一句「这里已经看过了」，界面对不上状态（自动化会卡在这颗热点上死循环，2026-09-13 实锤）。
    renderHotspots(act, dayScene(act, S.day).hotspots);

    renderStats(S);
    renderCompanions(S);
    saveState(S);
    showScreen('screen-camp');
    const ds = dayScene(act, S.day);
    $('pano-img').style.backgroundImage = `url('${sceneImage(ds.alt, ds.pano)}')`;
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
    const b = choiceButton({
      label: f.label, sub: f.sub, icon: String.fromCharCode(65 + items.indexOf(f)), index: items.indexOf(f),
    });
    b.disabled = S.ap <= 0;
    b.onclick = async () => {
      hideOverlay('screen-fire');
      if (S.ap <= 0 || kernel.resources.isHeld('flow')) { showScreen('screen-camp'); return; }
      await withLock(async () => {
        S.ap -= 1;
        S.行动日志.push(f.label);
        renderAp(S);
        renderHotspots(act, dayScene(act, S.day).hotspots);
        updateMarchButton();
        updateDusk();
        if (f.action === 'talk') await doTalk(act, { npc: '老班长' });
        else await doShare();
        renderStats(S);
        renderCompanions(S);
        saveState(S);
        showScreen('screen-camp');
        const ds2 = dayScene(act, S.day);
        $('pano-img').style.backgroundImage = `url('${sceneImage(ds2.alt, ds2.pano)}')`;
      }, { from: 'user', label: '篝火菜单' });
    };
    box.appendChild(b);
  });
}

async function doTalk(act, h) {
  step(`${act.id}:talk`, 'talk');
  talkPending = false;
  const npcName = h.npc || '同伴';
  showScreen('screen-stage');
  // 热点可以指定自己的近景（acts.json 的 img 字段），没写就用本幕全景
  setStageBanner(`${act.title} · 交谈`, sceneImage(h.img, act.pano));
  showNpc(npcName, { role: h.sub });
  setStagePanel(`
    <div class="chat-row">
      <input id="talk-input" placeholder="对${npcName}说点什么…" autocomplete="off" />
      <button type="button" class="btn primary" id="talk-send" data-action="talk-send">说</button>
    </div>
    <div class="choices" style="margin-top:10px" id="talk-quick"></div>
    <button type="button" class="btn ghost sm" id="talk-end" data-action="talk-end" style="margin-top:14px">结束交谈</button>
  `);
  await say(npcName, npcName.includes('老班') ? '来了。坐下，别踩了水花。'
    : npcName.includes('指导') ? '坐。有话慢慢说。'
    : npcName.includes('小鬼') ? '你也睡不着？火边还有位置。'
    : npcName.includes('卫生') ? '先按住伤口。有我在。'
    : npcName.includes('老乡') ? '路我认得，跟紧些。'
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
  quick.forEach((q, i) => {
    const b = choiceButton({ label: q, index: i, action: 'talk-quick' });
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
  step('rest', 'minigame');
  showScreen('screen-stage');
  setStageBanner('休息', '/assets/scenes/camp_evening.jpg');
  setPortrait('你', '年轻战士', '你', '疲惫');
  setStagePanel('<p class="hint">靠着背囊眯一会儿。</p>');
  // 体力恢复不交给模型：实测模型很少给正体力，一局净 −152 必然归零。
  // 这里的保底让"休息"成为可控手段；同一天反复休息收益递减，避免刷体力。
  S.restCount = (S.restCount || 0) + 1;
  const heal = S.restCount === 1 ? 10 : S.restCount === 2 ? 5 : 0;
  if (heal) {
    flashEffects(applyEffects(S, { 体力: heal }));
    appendCampLog(S, '休息', `缓过来一点（体力 +${heal}）`);
  } else {
    appendCampLog(S, '休息', '再歇也缓不过来多少了。');
  }
  renderStats(S);
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

async function doShare(h = {}) {
  step('share', 'choice');
  showScreen('screen-stage');
  setStageBanner('分一口粮', '/assets/scenes/night_fire.jpg');
  // 热点带 npc 就立这个人（如"岸边伤员"），否则立玩家自己
  if (h.npc) showNpc(h.npc, { role: h.sub });
  else setPortrait('你', '年轻战士', '你', '平静');
  setStagePanel('<div class="choice-row" id="share-opts"></div>');
  const shareOpts = ['全给伤员', '全班平分，自己少一点', '先紧着小鬼和卫生员', '自己留大半'];
  const choice = (await askChoice($('share-opts'), shareOpts.map((label) => ({ label })), {
    extraOf: () => '',
  })).label;
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
  step('school', 'minigame');
  showScreen('screen-stage');
  setStageBanner('夜校识字', '/assets/scenes/school_close.jpg');
  showNpc('文化教员', { role: '夜校', mood: '耐心' });
  setStagePanel('');                                  // 玩法不在纸卷里，正文区留空
  await say('文化教员', '跟着念。认得一个字，就能传给下一个人。', 'jiaoyuan_school');
  const board = openBoard({ title: '夜校识字', bg: '/assets/scenes/school_close.jpg' });
  const op = await runNightSchool(mountMini(board, 'school', 'school-host'), { stats: board.stats });
  showScreen('screen-stage');                         // 结算回到对白屏：人物 + 叙事 + 继续
  S.tonightPassword = op.detail?.password || '瑞金';
  markLine(S, 'school');
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

/** 红小鬼 · 分糖：三颗糖，AI 逐颗判定 */
async function doCandy() {
  step('candy', 'minigame');
  showScreen('screen-stage');
  setStageBanner('分糖', sceneImage('/assets/scenes/sugar_close.jpg', '/assets/scenes/camp_pano.jpg'));
  setPortrait('红小鬼', '16岁小战士', '鬼', '倔强', '/assets/characters/xiaogui.png');
  setStagePanel('');
  await say('红小鬼', '我兜里有三颗糖。你说，给谁？');
  const board = openBoard({ title: '分糖', bg: sceneImage('/assets/scenes/sugar_close.jpg', '/assets/scenes/camp_pano.jpg') });
  const op = await runCandy(mountMini(board, 'candy', 'candy-host'), { stats: board.stats });
  showScreen('screen-stage');
  S.sugarPlan = op.detail || null;
  markLine(S, 'candy');
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: '分糖·红小鬼',
      callType: 'share_judge',
      situation: `三颗糖的分配：${op.summary}`,
      state: publicState(),
      options: [op.summary],
      operation: { type: 'sugar', ...op.detail },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
    appendCampLog(S, '分糖', op.summary);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, '行军中的分享', 'h_share');
}

/** 哨兵 · 夜岗：五信号判断，夜校口令在此生效 */
async function doSentry() {
  step('sentry', 'minigame');
  showScreen('screen-stage');
  setStageBanner('夜岗', sceneImage('/assets/scenes/sentry_night.jpg', '/assets/scenes/camp_pano.jpg'));
  setPortrait('哨兵', '夜哨', '哨', '警觉');
  setStagePanel('');
  await say('哨兵', '后半夜归你。听不清就再听一遍，别急着开枪。');
  const board = openBoard({ title: '夜岗', bg: sceneImage('/assets/scenes/sentry_night.jpg', '/assets/scenes/camp_pano.jpg') });
  const op = await runSentry(S.tonightPassword, mountMini(board, 'sentry', 'sentry-host'), { stats: board.stats });
  showScreen('screen-stage');
  S.sentryScore = op.score;
  markLine(S, 'sentry');
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: '夜岗·哨位',
      callType: 'minigame_review',
      situation:
        `五个信号处置 ${op.detail.hits}/${op.detail.total}`
        + (S.tonightPassword ? `，夜校口令「${S.tonightPassword}」用上了` : '，未学过口令只能硬扛'),
      state: publicState(),
      operation: { type: 'sentry', ...op.detail },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
    appendCampLog(S, '夜岗', op.summary);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, '夜间警戒', 'h_sentry');
}

/** 两个小鬼 · 泥地五子棋 */
async function doGomoku() {
  step('gomoku', 'minigame');
  showScreen('screen-stage');
  setStageBanner('泥地五子棋', '/assets/scenes/camp_pano.jpg');
  setPortrait('两个小鬼', '泥地上的棋', '棋', '专注', '/assets/characters/xiaogui.png');
  setStagePanel('');
  await say('红小鬼', '石子当子，泥地当盘。你要是输了，可不许说没吃饱。');
  const board = openBoard({ title: '泥地五子棋', bg: '/assets/scenes/camp_pano.jpg' });
  const op = await runGomoku(mountMini(board, 'gomoku', 'gomoku-host'), { stats: board.stats });
  showScreen('screen-stage');
  markLine(S, 'gomoku');
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: '泥地五子棋',
      callType: 'minigame_review',
      situation: op.summary || '两个小鬼下了一盘棋',
      state: publicState(),
      operation: { type: 'gomoku', ...op.detail },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || '');
    appendCampLog(S, '五子棋', op.summary || '');
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
}

/** 雪山陡坡 · 拽住同伴（时机操作） */
async function doGrab() {
  step('grab', 'minigame');
  showScreen('screen-stage');
  setStageBanner('陡坡上', sceneImage('/assets/scenes/snow_climb.jpg', '/assets/scenes/snow_pano.jpg'));
  setPortrait('你', '年轻战士', '你', '咬牙');
  setStagePanel('');
  await say('你', '他的手在滑。前面的雪是硬的，下面是空的。');
  const board = openBoard({ title: '陡坡 · 拽住他', bg: sceneImage('/assets/scenes/snow_climb.jpg', '/assets/scenes/snow_pano.jpg') });
  const op = await runGrab(mountMini(board, 'grab', 'grab-host'), { stats: board.stats });
  showScreen('screen-stage');
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: '雪山·拽住同伴',
      callType: 'minigame_review',
      situation: op.summary || '在陡坡上拉住同伴',
      state: publicState(),
      operation: { type: 'grab', ...op.detail },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || result.scene_text || '');
    appendCampLog(S, '陡坡', op.summary || '');
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, '风雪中的手', 'h_xueshan');
}

/** 会宁 · 数一数熟面孔（读关系与牺牲名单） */
async function doRoster() {
  showScreen('screen-stage');
  setStageBanner('会宁 · 数一数熟面孔', sceneImage('/assets/scenes/huining_crowd.jpg', '/assets/scenes/huining_pano.jpg'));
  setPortrait('你', '年轻战士', '你', '平静');
  setStagePanel('<p class="hint">队伍汇合了，人山人海。你在人群里找那些熟悉的脸。</p>');
  await say('你', '（你在数。有些位置，怎么数都空着。）');
  showThinking(true);
  let r = null;
  try {
    r = await callAI({
      scene: '会宁·数一数熟面孔',
      callType: 'act_review',
      situation: '会师了，清点这一路还认得出来的人',
      state: publicState(),
      extraContext:
        `关系：${COMPANIONS.map((c) => `${c.name}${S[`好感_${c.name}`] ?? 40}`).join('、')}`
        + `；没能跟上的人：${(S.losses || []).map((l) => l.who).join('、') || '无'}`,
    });
    bumpAiCount(S);
    const box = $('stage-panel');
    // 这里原先用 mg-title + 手写 style 的 paper-dim：那是"给暗底用的纸色"，落在浅墨纸卷上看不清（批五修）
    box.innerHTML = `<h3 class="blk-title sm">${escapeHtml(r.title || '这一路')}</h3>`
      + (r.lines || []).map((l) => `<p class="blk-body">${escapeHtml(l)}</p>`).join('');
    await say('叙事', (r.lines || []).join(' '));
    appendCampLog(S, '会师', (r.lines || [])[0] || '');
  } catch (err) {
    toast('清点失败：' + err.message);
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
}

/**
 * 打开玩法板（tpl-board）：题名 + 数值签 + 玩法区都由这里起头。
 *
 * 为什么要有这一屏：小游戏原先挤在舞台纸卷里（上面还顶着给对白用的人物立绘），
 * 而样板页画好的"游戏名 + 数值签 + 玩法区 + 动作区"没有地方落地。
 * 玩法自己的状态（鱼篓/咬钩、信号 x/5…）由玩法通过 `{ stats }` 写进板头，
 * 这里只负责把板摆出来 —— 各玩法别再自己拼标题与数值签（2026-09-13 批四）。
 */
function openBoard({ title = '', bg = '' } = {}) {
  showScreen('screen-board');
  const act = currentActDef();
  $('board-kicker').textContent = act ? `${act.title} · 第 ${S?.day || 1} 日` : '玩法';
  $('board-title').textContent = title;
  $('board-bg').style.backgroundImage = bg ? `url('${bg}')` : '';
  // 玩法板**自己清自己的容器**（不再指望 showScreen 顺手清、也不再 cloneNode 换节点躲它）：
  // 上一局的残留节点在这里被丢弃，即使还有旧定时器持着它的引用，写入也落在已丢弃的 DOM 上。
  clearBoard();
  return { body: $('board-body'), stats: $('board-stats') };
}

/** 舞台屏与玩法板屏各自的清理（登记给 screens 模块；渲染与清理住在一起，谁也不会忘） */
function clearStage() {
  document.querySelectorAll('#sheet-actions').forEach((n) => { n.innerHTML = ''; });
  const panel = $('stage-panel'); if (panel) panel.innerHTML = '';
  const banner = $('stage-banner'); if (banner) banner.textContent = '';
  const dlg = $('dlg-body'); if (dlg) dlg.textContent = '';
}

function clearBoard() {
  const body = $('board-body'); if (body) body.innerHTML = '';
  const stats = $('board-stats'); if (stats) stats.innerHTML = '';
}

/** 装一个玩法：板屏开好、host 就位、契约声明齐，交给 minigames.js 的 runXxx */
function mountMini(board, name, id) {
  board.body.innerHTML = `<div id="${id}"></div>`;
  return markMini($(id), name);
}

async function doFishing(act, forced) {
  step('fishing', 'minigame');
  showScreen('screen-stage');
  // 弯针 → 咬钩起竿（与报名信息一致：先做钩，再钓鱼）
  setStageBanner('金色的鱼钩 · 弯针', '/assets/scenes/pond_close.jpg');
  setPortrait('老班长', '炊事班长', '班', '专注', '/assets/characters/laoban.png');
  setStagePanel('');
  await say('老班长', '鱼钩是缝衣针弯的。手上稳着点，别掰断。');
  let board = openBoard({ title: '弯针成钩', bg: '/assets/scenes/pond_close.jpg' });
  await runBendNeedle(mountMini(board, 'needle', 'needle-host'), { stats: board.stats });
  showScreen('screen-stage');

  setStageBanner('金色的鱼钩 · 起竿', '/assets/scenes/pond_close.jpg');
  await say('老班长', '漂相看真了再起竿。晃是假的，沉才是口。', 'laoban_hook');
  board = openBoard({ title: '金色的鱼钩', bg: '/assets/scenes/pond_close.jpg' });
  const op = await runFishing(mountMini(board, 'fishing', 'fish-host'), { stats: board.stats });
  showScreen('screen-stage');
  S.fishingBest = Math.max(S.fishingBest || 0, op.score);
  markLine(S, 'fishing');
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
  step('soup', 'choice');
  showScreen('screen-stage');
  setStageBanner('煮粥分汤', '/assets/scenes/pond_close.jpg');
  setPortrait('老班长', '炊事班长', '班', '沉默', '/assets/characters/laoban.png');
  setStagePanel('<p class="hint">锅里只有几条小鱼和草根。</p><div class="choices" id="soup-opts"></div>');
  await say('老班长', '汤要分匀。伤员先喝，我们再看锅底。', 'laoban_soup');
  const soupOpts = [
    { label: '稠的全给伤员，自己喝清汤', icon: '汤' },
    { label: '全班平分', icon: '分' },
    { label: '只给病号', icon: '病' },
    { label: '自己先盛一碗', icon: '己' },
  ];
  const choice = (await askChoice($('soup-opts'), soupOpts)).label;
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
  step(`${act.id}:${actionId}`, 'choice');
  const cs = CHOICE_SETS[actionId];
  if (!cs) return;
  showScreen('screen-stage');
  setStageBanner(cs.title, sceneImage(cs.img, act.pano));
  // 抉择集写 npc 就先立当事人（如雪山上的掉队战士），让代价看得见
  if (cs.npc) showNpc(cs.npc, { role: cs.npcRole, mood: '决断' });
  else setPortrait('你', act.title, '你', '决断');
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

  const choice = (await askChoice($('ch-opts'), cs.options, {
    extraOf: (o) => {
      const h = hints[o.label];
      const trend = h?.trend ? `<em class="trend">${escapeHtml(h.trend)}</em>` : '';
      // 风险标签优先用作者标注（决定实际后果），模型给的只作补充——
      // 否则会出现"界面显示低风险、判定却按高风险减员"的不一致
      const risk = o.risk || h?.risk;
      const riskChip = risk ? `<em class="risk r-${risk}">${risk === 'high' ? '高' : risk === 'mid' ? '中' : '低'}风险</em>` : '';
      return `${trend}${riskChip}`;
    },
  })).label;
  logChoice(act, choice, hints[choice]?.trend || '');
  // 行军模式：减员由「作者标注的风险 + 当前资源」决定（见 state.js 的 resolveLoss），不可逆
  if (S.mode === 'march') {
    const loss = resolveLoss(cs, cs.options.findIndex((o) => o.label === choice), S);
    if (loss && addLoss(S, loss.who, loss.reason)) {
      showLossToast(loss.who, loss.reason);
      appendCampLog(S, '损失', `${loss.who} 没能跟上`);
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

/** 飞夺泸定桥：横版过桥（第一次跌落由战友拉住，体力 −10） */
async function doLuding(act) {
  step('luding', 'minigame');
  showScreen('screen-stage');
  setStageBanner('飞夺泸定桥', sceneImage('/assets/scenes/luding_bridge.jpg', '/assets/scenes/luding_pano.jpg'));
  kernel.emit('scene:enter', { name: 'luding' });        // 泸定桥：急流 + 该章的 BGM
  showNpc('突击队长', { role: '红四团', mood: '决绝' });
  setStagePanel('');
  await say('突击队长', '桥板被人抽了，铁索还在。跟着我，别往下看。');
  const board = openBoard({ title: '飞夺泸定桥', bg: sceneImage('/assets/scenes/luding_bridge.jpg', '/assets/scenes/luding_pano.jpg') });
  const op = await runLuding(mountMini(board, 'luding', 'luding-host'), { stats: board.stats });
  showScreen('screen-stage');
  S.ludingResult = op.detail || null;
  // 战友拉住的那一下，先落到状态里再交给模型写后果
  if (op.detail?.retry) applyEffects(S, { 体力: -10 });
  showThinking(true);
  let result;
  try {
    result = await callAI({
      scene: `${act.title}·飞夺泸定桥`,
      callType: 'minigame_review',
      situation: op.summary || '突击队过桥',
      state: publicState(),
      operation: { type: 'luding', ...op.detail },
    });
    bumpAiCount(S);
    applyEffects(S, result.effects);
    await say('叙事', result.narrative || result.scene_text || '');
    appendCampLog(S, '泸定桥', op.summary || '');
  } finally {
    showThinking(false);
  }
  await waitBtn('继续');
  await afterJudge(result, '飞夺泸定桥', 'h_luding');
}

// 「继续」统一走 step.js 的 waitContinue（带 data-action 契约标记）
const waitBtn = waitContinue;

/**
 * 流程锁（内核资源 'flow'）。语义在批 3 收口为两条：
 *
 *   ① **入口**（`from: 'user'`）：玩家动作进来的第一棒。锁被别人占着就**明说**——
 *      广播 `resource:blocked`（shell 模块负责提示），而不是悄悄 return。
 *   ② **流程内部**（`from: 'flow'`）：幕末强制链、快速模式这类"既可能是第一棒、也可能被嵌在流程里"的环节。
 *      已被占就直接跑（占着的一定是自己这条流程），没被占就自己占上。
 *
 * 这样就不需要原来那两处"手工把 S.busy 置 false 再进流程"的 hack——那是不可重入锁逼出来的补丁，
 * 而且顺序错了就静默失效。同时"忙"从**存档状态**（S.busy）变成了**运行时资源**（内核持有），
 * 这本来就是运行时概念，不该写进玩家存档。
 */
async function withLock(fn, { from = 'user', label = 'flow' } = {}) {
  const isHeld = kernel.resources.isHeld('flow');
  if (isHeld && from === 'user') {
    kernel.resources.claim('flow', label);      // 故意再申请一次：失败会广播 resource:blocked，由 shell 提示
    return;
  }
  const mine = !isHeld;
  if (mine) {
    kernel.resources.claim('flow', label);
    setStepState('busy');                      // 与 step 状态联动：自动化据此"等待"，而不是"该点却点不动"
    updateMarchButton?.();
  }
  try {
    return await fn();
  } finally {
    if (mine) {
      kernel.resources.release('flow', label);
      setStepState('awaiting');
      updateMarchButton?.();
    }
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
      else if (fid === 'candy') { await doCandy(); markDone(act.id, 'candy'); }
      else if (fid === 'sentry') { await doSentry(); markDone(act.id, 'sentry'); }
      else if (fid === 'path') { await runPathOnImage(); markDone(act.id, 'path'); }
      else if (fid === 'luding') { await doLuding(act); markDone(act.id, 'luding'); }
      else { await doChoice(act, fid); markDone(act.id, fid); }
    }
    if (act.quiz && !isDone(act.id, 'quiz')) {
      await runQuiz(act);
      markDone(act.id, 'quiz');
    }
    await finishAct(act);
    // from:'flow'：这一棒既可能是玩家点「启程」进来的（那时锁已由入口占下），
    // 也可能是快速模式/幕末链里被嵌套调用（同一条流程）。两种情况都不该互相拒绝。
  }, { from: 'flow', label: '幕末流程' });
}

/**
 * 把三个岔路点位画到图上（唯一实现：正式流程与逐页截图工具共用）。
 * 点位来自 data.js 的 PATH_ZONES，改坐标只需改那一处。
 * @param {HTMLElement} host 承载点位的容器
 * @param {(zone:object)=>void} onPick 玩家选定后回调
 */
function renderPathZones(host, onPick) {
  host.innerHTML = '';
  PATH_ZONES.forEach((z, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'path-zone';
    b.dataset.choiceIndex = String(i);
    b.style.left = z.x + '%';
    b.style.top = z.y + '%';
    b.style.width = z.w + '%';
    b.style.height = z.h + '%';
    // 选区本身不铺底色（否则三块墨底把插画压死），标签单独坐在一小片墨纱上
    b.innerHTML = `<span class="pz-chip"><b>${z.label}</b><span>${z.sub}</span></span>`;
    b.onclick = () => onPick(z);
    host.appendChild(b);
  });
}

async function runPathOnImage() {
  step('path', 'choice');
  showScreen('screen-path');
  kernel.emit('voice:say', { text: '前面岔开了三条路。你定。', actorId: '指导员', voiceId: 'zhiyuan_grass' });
  const choice = await new Promise((resolve) => renderPathZones($('path-zones'), resolve));
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
  step(`${act.id}:quiz`, 'quiz');
  showScreen('screen-quiz');
  $('quiz-bg').style.backgroundImage = `url('${act.pano}')`;
  $('quiz-score').textContent = `${S.quiz.human} : ${S.quiz.ai}`;
  const body = $('quiz-body');
  body.innerHTML = '<p class="muted">正在出题…</p>';
  kernel.emit('voice:say', { text: '停一停。刚才走过的路，你还记得多少。', actorId: '叙事', voiceId: 'narr_quiz' });
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
    <p class="blk-body">${escapeHtml(q.question || '题目')}</p>
    <div class="blk-choice-list" id="quiz-opts"></div>
    <div id="quiz-feedback" class="blk-note"></div>
    <div class="blk-actions">
      <button type="button" class="btn ghost sm" id="quiz-auto" data-action="quiz-auto">看两个 AI 对答（ai_vs_ai）</button>
      <button type="button" class="btn primary hidden" id="quiz-next" data-action="continue">继续</button>
    </div>
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
    const finish = async (humanIdx, auto = false) => {
      if (answered) return;
      answered = true;
      const ans = normIdx(q.answer_index, opts.length);
      const answerKnown = ans >= 0;
      showThinking(true);
      // ai_vs_ai：玩家这一侧由第二个 AI 人设代答
      let humanAns = humanIdx;
      if (auto) {
        try {
          const h = await callAI({
            scene: '知识对决·AI 代答（ai_vs_ai）',
            callType: 'quiz_answer_ai',
            situation: `题目：${q.question}\n选项：${opts.join(' / ')}`,
            state: publicState(),
            agent: '激进派小张',
            options: opts,
          });
          bumpAiCount(S);
          humanAns = normIdx(h.answer_index, opts.length);
        } finally {
          showThinking(false);
          showThinking(true);
        }
      }
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
      const humanRight = answerKnown && humanAns === ans;
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
          situation: `标准答案 index=${ans}。${auto ? '红方(激进派小张)' : '玩家'}=${humanAns}。蓝方(稳健派老李)=${aiAns}`,
          state: publicState(),
          agent: auto ? 'ai_vs_ai' : 'human_vs_ai',
          operation: { human: humanAns, ai: aiAns, answer_index: ans, mode: auto ? 'ai_vs_ai' : 'human_vs_ai' },
        });
        bumpAiCount(S);
        applyEffects(S, judge.effects || { 士气: humanRight ? 3 : -1 });
        kernel.emit('sfx:play', { name: humanRight ? 'correct' : 'wrong' });
        $('quiz-feedback').innerHTML = `
          <div>${auto ? '激进派小张' : '你'}：<b>${humanRight ? '正确' : '错误'}</b> · 稳健派老李：<b>${aiRight ? '正确' : '错误'}</b><br/>
          ${escapeHtml(answerKnown ? (q.explain || judge.explain || '') : '本题标准答案解析失败，双方均不计分。')}</div>
        `;
      } finally {
        showThinking(false);
      }
      [...optsBox.children].forEach((el, i) => {
        el.disabled = true;
        if (i === ans) el.classList.add('correct');
        else if (i === humanAns) el.classList.add('wrong');
      });
      const next = $('quiz-next');
      await new Promise((r) => {
        next.onclick = () => { next.onclick = null; r(); };
        next.classList.remove('hidden');
      });
      await afterJudge({
        narrative: `${auto ? '小张' : '你'}答：${opts[humanAns] ?? '（未作答）'}。标准答案：${opts[ans] ?? '（本题答案缺失）'}。${q.explain || ''}`,
      }, `知识对决 · ${act.title}`, act.facts?.[0]);
      resolveQuiz();
    };
    opts.forEach((text, i) => {
      // 选项一律走唯一的构建处（批三起的口径）：序号进徽章，键盘位自动带上
      const b = choiceButton({ label: text, icon: String.fromCharCode(65 + i), index: i });
      b.onclick = () => finish(i);
      optsBox.appendChild(b);
    });
    const autoBtn = $('quiz-auto');
    if (autoBtn) autoBtn.onclick = () => { autoBtn.disabled = true; finish(null, true); };
  });
}

/** 交给夜间的上下文：这一夜之前到底发生了什么 */
function nightContext() {
  const done = (S.linesDone || []).map((k) => LINE_NAMES[k] || k);
  return [
    `已点亮附身线：${done.join('、') || '无'}`,
    `钓鱼最佳 ${(S.fishingBest || 0).toFixed(2)}`,
    `夜岗 ${Math.round((S.sentryScore || 0) * 100)} 分`,
    S.tonightPassword ? `今晚口令「${S.tonightPassword}」` : '没上过夜校，不会口令',
    S.sugarPlan ? `分糖：${JSON.stringify(S.sugarPlan)}` : '',
  ].filter(Boolean).join('；');
}

/**
 * 第四幕幕末 · 篝火深夜：模型生成互斥抉择 → 玩家选 → 模型写「当夜之后」
 * 选项禁止写死；生成失败才用内置兜底两项。
 */
async function runNightChoice(act) {
  step('night', 'choice');
  if (isDone(act.id, 'night')) return false;
  if (!canNight(S, 3)) {
    appendCampLog(S, '系统', `附身线不足三条（${linesDoneCount(S)}/${LINES_TOTAL}），今夜没有议事。`);
    return false;
  }

  showScreen('screen-night');
  renderStats(S);
  $('night-title').textContent = '篝火 · 深夜';
  $('night-lead').textContent = '正在请模型写今夜的抉择…';
  $('night-body').innerHTML = '';

  showThinking(true);
  let gen = null;
  try {
    gen = await callAI({
      scene: `${act.title}·篝火夜`,
      callType: 'night_options',
      situation: '这一天结束了。后半夜怎么过、明天的口粮怎么带，得在火边定下来。',
      state: publicState(),
      extraContext: nightContext(),
    });
    bumpAiCount(S);
  } catch { /* 用兜底选项 */ } finally {
    showThinking(false);
  }

  const raw = Array.isArray(gen?.options)
    ? gen.options.filter((o) => o && (typeof o === 'string' || o.label))
    : [];
  const options = (raw.length >= 2 ? raw : [
    { label: '加岗并匀出口粮', sub: '安全优先，明天更苦', key: 'a' },
    { label: '按原编制休息', sub: '保留体力，伤员优先', key: 'b' },
  ]).slice(0, 3).map((o, i) => (typeof o === 'string'
    ? { label: o, sub: '', key: String(i) }
    : { label: String(o.label), sub: String(o.sub || ''), key: String(o.key ?? i) }));

  $('night-lead').textContent = gen?.lead || '火压低了。没人先开口。';
  kernel.emit('voice:say', { text: '火压低了。后半夜怎么过，明天的口粮怎么带，得在火边定下来。', actorId: '旁白', voiceId: 'narr' });
  const body = $('night-body');
  body.innerHTML = '';
  const picked = await askChoice(body, options, { extraOf: () => '' });
  const choice = picked.raw;
  logChoice(act, choice.label, '篝火夜');
  S.nightChoice = choice.label;
  markDone(act.id, 'night');

  showThinking(true);
  let res = null;
  try {
    res = await callAI({
      scene: `${act.title}·篝火夜结算`,
      callType: 'night_resolve',
      situation: `玩家选择：${choice.label}${choice.sub ? ` — ${choice.sub}` : ''}`,
      state: publicState(),
      options: [choice.label],
      operation: { choice: choice.key, label: choice.label },
      extraContext: nightContext(),
    });
    bumpAiCount(S);
    applyEffects(S, res?.effects);
    renderStats(S);
    body.innerHTML = '<p id="night-out" class="blk-body"></p>';   // 纸面用墨字，别用给暗底准备的纸色
    await typeText($('night-out'), res?.narrative || '当夜无事。');
    appendCampLog(S, '篝火夜', res?.narrative || choice.label);
  } catch (err) {
    body.innerHTML = `<p class="muted">当夜无话：${escapeHtml(err.message)}</p>`;
  } finally {
    showThinking(false);
  }
  await waitBtn('天亮了 · 继续', body);
  await afterJudge(res || { narrative: `你决定：${choice.label}` }, '篝火之夜', 'h_campfire');
  saveState(S);
  return true;
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

  // 第四幕幕末：篝火深夜（模型生成互斥抉择，一局一次）
  if (act.id === 'act4') await runNightChoice(act);

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
  step('end', 'end');
  kernel.emit('scene:enter', { name: 'ending' });
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

  // 研学报告（课后复盘用；对外不出现行业与场景口径，见 docs/PITCH.md）
  try {
    showThinking(true);
    const report = await callAI({
      scene: '研学报告',
      callType: 'study_report',
      situation: '生成可给带队者复盘的研学摘要',
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
    附身线: (S.linesDone || []).map((k) => LINE_NAMES[k] || k),
    夜岗表现: S.sentryScore || 0,
    分糖方案: S.sugarPlan || null,
    夜间抉择: S.nightChoice || '',
  };
}

void wait;
boot();
