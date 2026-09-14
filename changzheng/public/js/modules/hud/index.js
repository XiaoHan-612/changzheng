/**
 * hud 模块 —— 把状态渲染成界面上的读数（顶栏五维、行动点、同伴好感、营地手记）。
 *
 * 它修的是"靠调用顺序维持正确"：以前 `applyEffects()` 之后**必须**紧跟 `renderStats()`，
 * 十几处手工配对（`renderStats` 18 次、`renderCompanions` 8 次、`renderAp` 6 次，散在 main.js 里），
 * 漏一处就是"数字没更新"。现在 HUD **订阅 `state:change` 自己重渲染**——写状态的人不必知道谁在看。
 *
 * 边界（与 modules/screens 的"屏自清"配套）：
 *   · 它只写**数值签类容器**（`#stats` / `#night-stats` / `#end-stats` / `#ap-dots` / `#day-num` /
 *     `#companion-list` / `#camp-log`）——这些是"同一份状态的多个展示位"，多处并存是正常的；
 *   · 它**不碰**任何屏的其它内容（叙事、选项、玩法区），也不负责清理。
 */
import { renderStats, renderAp, renderCompanions, renderCampLog, renderAiCount } from '../../ui.js';
import { kernel } from '../../kernel/index.js';

/** 哪些键变了、需要重渲染什么（一张小表，改行为只改这里） */
const PARTS = {
  stats: ['体力', '粮食', '士气', '信念', '民心', '好感_老班长', '好感_指导员', '好感_红小鬼', '好感_卫生员', '好感_老乡'],
  ap: ['ap', 'maxAp', 'day'],
  companions: ['好感_老班长', '好感_指导员', '好感_红小鬼', '好感_卫生员', '好感_老乡'],
  campLog: ['campLog'],
  aiCount: ['aiCount'],
};

export default {
  name: 'hud',
  note: '状态读数渲染：订阅 state:change，写状态的人不必知道谁在看',
  subscriptions: {
    'state:change': 'onStateChange',
  },

  init(kernelRef) {
    this.kernel = kernelRef;
  },

  ready() {
    this.renderAll('首次渲染');
  },

  onStateChange(p) {
    const keys = p.keys || [];
    const all = keys.includes('*') || !keys.length;
    const hit = (part) => all || PARTS[part].some((k) => keys.includes(k));
    if (hit('stats') || hit('companions')) this.renderAll(p.label);
    else {
      if (hit('ap')) this.renderAp();
    }
    if (hit('campLog')) this.renderCampLog();
    if (hit('aiCount')) renderAiCount(kernel.snapshot.get()?.aiCount);
  },

  renderAll() {
    const s = kernel.snapshot.get();
    if (!s || s.体力 === undefined) return;      // 还没开局：什么都不画（首屏是标题页）
    renderStats(s);
    renderAp(s);
    renderCompanions(s);
    renderAiCount(s.aiCount);
    this.renderCampLog();
  },

  renderAp() {
    const s = kernel.snapshot.get();
    if (s?.体力 !== undefined) renderAp(s);
  },

  renderCampLog() {
    const s = kernel.snapshot.get();
    if (Array.isArray(s?.campLog)) renderCampLog(s.campLog);
  },
};
