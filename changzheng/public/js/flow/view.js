/**
 * flow/view —— 流程层的**"看"的那一摊**：素材探测、立绘、行程、夜色与灯笼。
 *
 * 从 main.js 搬出来（批 7 二·2）。为什么单独一块：这些函数只回答"画什么/用哪张图"，
 * 不推进任何流程、不改状态（唯一的例外是 `bindLantern` 挂指针监听，也只动样式）。
 * 流程文件（camp/act/end…）都从这里取"该显示谁、该用哪张图"，于是素材口径只有一份。
 *
 * 两条既有约定在这里继续生效（别在别处另写一套）：
 *   · **素材落盘即生效**：`sceneImage()` 先探测再用，探测不到退回兜底；新图放进
 *     `public/assets/scenes/` 下一次进场景就用上，不用改代码（口径见 docs/HANDOFF-ART.md）。
 *   · **立绘优先级**：专属立绘（PORTRAIT_FILE）→ 同伴立绘 → 文字头像。顺序不能反
 *     （反了"非同伴 NPC"会一律显示老班长的脸）。
 */
import { $, setPortrait } from '../ui.js';
import { COMPANIONS } from '../data.js';
import { findOrigin } from '../origin.js';
import { S, getActsData } from './kit.js';

/* ── 素材探测 ── */
/** 探测结果缓存：true 可用 / false 没有（用兜底） */
const _imgState = new Map();

export function sceneImage(primary, fallback) {
  if (!primary) return fallback;
  // 别叫 st：外层 `st()` 是取 state 模块的助手，同名会互相遮蔽（历史上真撞过一次，改名 cached）
  const cached = _imgState.get(primary);
  if (cached === true) return primary;
  if (cached === false) return fallback;
  const img = new Image();
  img.onload = () => _imgState.set(primary, true);
  img.onerror = () => _imgState.set(primary, false);
  img.src = primary;
  _imgState.set(primary, false); // 探测完成前先用兜底，避免白屏
  return fallback;
}

/** 启动时预热候选素材，进入场景时就能立刻用上新图 */
export function preloadScenes() {
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

export const PORTRAIT_FILE = {
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

export function portraitImage(name) {
  if (!name) return undefined;
  const key = Object.keys(PORTRAIT_FILE).find((k) => String(name).includes(k));
  return key ? sceneImage(PORTRAIT_FILE[key], '') : undefined;
}

/**
 * NPC 立绘统一入口：专属立绘（PORTRAIT_FILE）→ 同伴立绘 → 文字头像。
 * 热点/抉择集只要写 npc 字段，新立绘落盘就自动生效，不用改这里。
 * 注意：同伴兜底必须放在专属立绘之后，否则"非同伴 NPC"会一律显示老班长的脸。
 */
export function showNpc(npc, { role, mood = '平静' } = {}) {
  if (!npc) { setPortrait('你', role || '年轻战士', '你', mood); return; }
  const comp = COMPANIONS.find((c) => npc.includes(c.name));
  setPortrait(npc, role || comp?.role || '同行者', comp?.ava || npc.slice(0, 1), mood,
    portraitImage(npc) || comp?.img);
}

/** 出身显示文案：手记与终局关系面板共用 */
export function originText() {
  const o = findOrigin(S?.origin);
  if (!o) return '未设定';
  return S.originQuiz ? `${o.label}（出发前一问${S.originQuiz.right ? '答对' : '答错'}）` : o.label;
}

export function updateDusk() {
  const dusk = $('dusk');
  if (!dusk || !S) return;
  const spent = Math.max(0, S.maxAp - S.ap);
  const level = Math.min(4, spent + (S.day > 1 ? 1 : 0));
  dusk.dataset.dusk = String(level);
}

export function renderJourney() {
  const el = $('journey');
  if (!el || !getActsData()) return;
  const order = getActsData().order || [];
  const now = S?.actIndex ?? 0;
  el.innerHTML = order.map((id, i) => {
    const a = getActsData().acts[id];
    const cls = i < now ? 'done' : i === now ? 'now' : '';
    const line = i < order.length - 1 ? `<div class="j-line ${i < now ? 'done' : ''}"></div>` : '';
    return `<div class="j-node ${cls}"><span class="j-dot"></span><span class="j-label">${a?.title || id}</span></div>${line}`;
  }).join('');
}

export function bindLantern() {
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

/** 角色名 → 立绘文件（约定名，落盘即生效；没有就退回文字头像） */
