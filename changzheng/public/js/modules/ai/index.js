/**
 * ai 模块 —— 大模型调用的**唯一入口与唯一账目**（批 6：registry + run + 事件化）。
 *
 * 它替掉的四份手工劳动（原来散在 main.js 的 `callAI()` 与 50 个调用点里）：
 *   ① 每处 `showThinking(true/false)` 成对写 → 改为广播 `ai:start` / `ai:done` / `ai:fail`，
 *      由 `modules/shell` 负责那两下 UI；
 *   ② 每处 `st().bumpAiCount()` → 成功时在这里统一记；
 *   ③ 每处 `setStepState('busy'/'awaiting')` → 这里统一置（自动化契约照旧）；
 *   ④ 失败时的「重试／跳过」交互 → 这里广播 `ai:fail`，等 UI 回一条 `ai:verdict`（事件往返，
 *      所以模块自身不碰 DOM，UI 也不必知道调用细节）。
 *
 * 对外只有两个口子：
 *   `kernel.api('ai').ask(payload)`      —— 业务侧唯一的调用方式（返回模型结果，形状与老 `callAI` 一致）
 *   `kernel.api('ai').metrics()`         —— 每类的次数/耗时（qa:ai 与答辩面板用）
 * 事件见 `kernel/contracts.js` 的 `ai:request` / `ai:start` / `ai:done` / `ai:fail` / `ai:verdict` / `ai:feed`。
 *
 * 想改"某类调用怎么跑"（预算、温度、要不要预取）→ 只改 `registry.js`，别动这里。
 */
import { kernel } from '../../kernel/index.js';
import { setStepState } from '../../step.js';
import { policyOf, knownCallTypes } from './registry.js';
import { invoke, feedEntry } from './run.js';
import { escapeHtml } from '../../ui.js';

const MAX_FEED = 30;
let feed = [];                    // 调用流（答辩面板）
let pending = null;               // 正在等 UI 决定的那次失败 { id, resolve }
let seq = 0;
const metrics = new Map();        // callType → { n, ok, fail, ms, tokens }

const inspectorBody = () => document.getElementById('ai-ins-body');
const inspectorVisible = () => {
  const el = document.getElementById('ai-inspector');
  return !!el && !el.classList.contains('hidden');
};

function render() {
  const box = inspectorBody();
  if (!box) return;
  box.innerHTML = feed
    .map((e) => `<div class="ai-item">
        <span class="tag">${escapeHtml(e.callType || '')}</span>
        <span class="src-glm">${escapeHtml(e.model || 'GLM')}</span>
        <span class="muted">${e.ms}ms</span>
        <div>${escapeHtml(e.error || e.snippet || e.scene || '')}</div>
      </div>`)
    .join('');
}

/** 收一条调用摘要（订阅入口与 ask() 共用这一份——描述符上的方法不在 api 对象上，
 *  所以 ask 里不能写 this.onFeed，那是两种调用路径混用） */
function appendFeed(entry) {
  if (!entry) return;
  feed.unshift(entry);
  if (feed.length > MAX_FEED) feed.pop();
  if (inspectorVisible()) render();
}

function note(callType, ok, ms) {
  const m = metrics.get(callType) || { n: 0, ok: 0, fail: 0, ms: 0 };
  m.n += 1;
  m[ok ? 'ok' : 'fail'] += 1;
  m.ms += ms;
  metrics.set(callType, m);
}

/** 等 UI 给出「重试／跳过」。UI 不在（或没人听）时按"跳过"处理，绝不让流程悬着 */
function waitVerdict(id) {
  return new Promise((resolve) => {
    pending = { id, resolve };
  });
}

export default {
  name: 'ai',
  note: '大模型调用的唯一入口：registry 定策略、run 发请求、事件广播进度、账目归这里',
  subscriptions: {
    'ai:feed': 'onFeed',        // 外部（如沙盘的文本流）也能上报一条调用摘要
    'ai:verdict': 'onVerdict',  // UI（modules/shell 的重试面板）对失败做的裁决
  },

  onFeed(p) {
    appendFeed(p?.entry);
  },

  /** UI 说"重试"就再来一次；说"跳过"就把错误交给调用方 */
  onVerdict(p) {
    if (!pending || (p?.id && p.id !== pending.id)) return;
    const { resolve } = pending;
    pending = null;
    resolve(!!p?.retry);
  },

  api: {
    /**
     * 唯一调用入口。
     * @param {object} payload { callType, scene, situation, state, options, agent, extraContext, operation, … }
     * @param {{quiet?: boolean}} [opts] quiet = 后台调用：不发「思考中」进度事件、失败也不弹「重试／跳过」
     *        （结果只填界面角落里的一行字、或调用方自己吞错）。预算、账目、计数**照走**——
     *        quiet 只影响进度 UI，不影响记账。营地氛围、选项预告、沙盘收尾这类就属这一类。
     * @returns {Promise<object>} 模型返回；失败（玩家选择跳过）时返回 `{ _error: true, message }`（与老行为一致）
     */
    async ask(payload = {}, { quiet = false } = {}) {
      const callType = payload.callType || 'decide';
      const policy = policyOf(callType);
      for (;;) {
        const id = `ai_${++seq}`;
        const t0 = Date.now();
        kernel.emit('ai:request', { callType, scene: payload.scene || '' });
        if (!quiet) kernel.emit('ai:start', { callType, id, label: policy.label });
        setStepState('busy');                      // 自动化契约：等模型时"先别点"
        let result = null;
        let error = '';
        try {
          result = await invoke(payload, policy);
        } catch (err) {
          error = String(err?.message || err);
        } finally {
          setStepState('awaiting');
        }
        const ms = Date.now() - t0;

        if (!error) {
          if (!quiet) kernel.emit('ai:done', { callType, id, ms });
          note(callType, true, ms);
          appendFeed(feedEntry({ callType, scene: payload.scene, ms, result }));
          kernel.api('state')?.bumpAiCount();       // 计数归这里，调用点不再各写一遍
          return result;
        }

        // 失败：先记账，再问 UI（重试＝再来一轮；跳过＝把错误交回业务侧）。
        // quiet 的后台调用不问 UI——调用方本来就 `catch { /* 静默 */ }`，弹面板反而打扰玩家。
        note(callType, false, ms);
        appendFeed(feedEntry({ callType, scene: payload.scene, ms, error }));
        if (quiet) return { _error: true, message: error };
        kernel.emit('ai:fail', { callType, id, error });
        const retry = await waitVerdict(id);
        if (!retry) return { _error: true, message: error };
      }
    },

    /** 每类的次数与耗时（qa:ai、答辩面板、试玩统计都读它） */
    metrics() {
      return Object.fromEntries([...metrics.entries()].map(([k, v]) => [k, { ...v, avgMs: v.n ? Math.round(v.ms / v.n) : 0 }]));
    },
    /** 预算表（体检脚本用它和 server/schema.js 的 16 类对账） */
    policies: () => Object.fromEntries([...knownCallTypes()].map((t) => [t, policyOf(t)])),
    recent: (n = MAX_FEED) => feed.slice(0, n),
    clear: () => { feed = []; metrics.clear(); render(); },
    render,
  },
};
