/**
 * ai 模块 —— 大模型调用的**观测与账目**（批 5 先落地"调用流"，批 6 再长 registry/run）。
 *
 * 为什么先把这一段搬进来：答辩面板那份"最近 30 次调用摘要"原来是 main.js 里的
 * `aiFeed` + `window.__pushAiFeed`——沙盘要上报就得往 window 上挂全局，跨脚本捅数据。
 * 现在统一成**一条事件**：谁发起调用谁 `emit('ai:feed', { entry })`，本模块负责收与渲染。
 *
 * 边界：
 *   · 本模块**不发**调用（那是流程与批 6 的 registry/run 的事），只记账与显示；
 *   · 渲染只写属于自己的容器（`#ai-ins-body`），看不见时不动 DOM（与屏自清同一套自律）。
 *
 * 批 6 会在这个模块里补：每类 callType 的预算与预取、`qa:ai` 度量、调用次数统计。
 */
import { kernel } from '../../kernel/index.js';
import { escapeHtml } from '../../ui.js';

const MAX = 30;
let feed = [];                 // 模块级变量：描述符上只放方法与规定字段

const inspectorBody = () => document.getElementById('ai-ins-body');
const inspectorVisible = () => {
  const el = document.getElementById('ai-inspector');
  return !!el && !el.classList.contains('hidden');
};

/** 渲染调用流（唯一实现）。判分脚本与答辩面板共用这一份。 */
function render() {
  const box = inspectorBody();
  if (!box) return;
  box.innerHTML = feed
    .map((e) => `<div class="ai-item">
        <span class="tag">${escapeHtml(e.callType || '')}</span>
        <span class="src-glm">${escapeHtml(e.model || 'GLM')}</span>
        <span class="muted">${e.ms}ms</span>
        <div>${escapeHtml(e.snippet || e.scene || '')}</div>
      </div>`)
    .join('');
}

export default {
  name: 'ai',
  note: '大模型调用的观测与账目：收 ai:feed、渲染答辩面板的调用流（批 6 再长 registry/run）',
  subscriptions: {
    'ai:feed': 'onFeed',
  },

  onFeed(p) {
    const entry = p?.entry;
    if (!entry) return;
    feed.unshift(entry);
    if (feed.length > MAX) feed.pop();
    // 面板没开就不动 DOM（和"屏只能清自己的容器"同一套自律：不做没人看的写入）
    if (inspectorVisible()) render();
  },

  api: {
    /** 最近 N 条（新到旧），给面板、截图脚本、量表用 */
    recent: (n = MAX) => feed.slice(0, n),
    clear: () => { feed = []; render(); },
    render: () => render(),
    size: () => feed.length,
  },
};
