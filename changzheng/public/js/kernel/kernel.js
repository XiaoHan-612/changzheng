/**
 * 内核 —— 把"模块 + 总线 + 契约 + 资源 + 快照 + 诊断"组装成一个可启动的系统（SoC 的片上总线视角）。
 *
 * 它做四件事，别的什么都不做（**内核里不许有业务**）：
 *   1. 注册模块（描述符校验 → 依赖拓扑排序 → init）
 *   2. 接线（按模块自己声明的订阅，往总线上挂；模块不许自己 bus.on）
 *   3. ready（全部 init 之后统一调用；模块之间此时可用 {@link api} 互相取用）
 *   4. 诊断（结构化 trace：谁注册了、谁订阅了什么、事件流、契约违规）
 *
 * 模块之间怎么协作（**两条正道，别再直接 import 别人**）：
 *   · 通知/命令 → `kernel.emit('事件名', 载荷)`（先登记在 contracts.js）
 *   · 只读取数 → `kernel.snapshot.get()`（唯一提供者是 state 模块）
 *   · 需要别人的接口 → `kernel.api('模块名')`（同步调用，用于"问一次就完"的场景，比如 audio.sfx 的替代）
 */
import { createBus } from './bus.js';
import { EVENTS, checkPayload, isEvent } from './contracts.js';
import { createDiag } from './diag.js';
import { createResources } from './resources.js';
import { createSnapshot } from './snapshot.js';
import { validateDescriptor } from './plugins.js';

export function createKernel() {
  const diag = createDiag();
  const bus = createBus({ onEvent: (e) => diag.record(e) });
  const resources = createResources({ bus, onEvent: (e) => diag.record(e) });
  const snapshot = createSnapshot();

  /** @type {Map<string, { descriptor: object, api: object }>} */
  const modules = new Map();
  const offs = [];              // 接线产生的取消订阅函数（dispose 用）
  let booted = false;

  /** 统一的"摆屏"入口：截图/体检脚本靠它把任意屏摆出来（批 7 起 __czScreens 从这里出） */
  const screens = { api: null, register(fn) { this.api = fn; }, get() { return this.api; } };

  const knownEvents = new Set(Object.keys(EVENTS));

  /** 带契约校验的派发：未登记的名字/缺字段 → 记诊断 + console.error，但**不中断流程** */
  function emit(name, payload) {
    if (!isEvent(name)) {
      const msg = `[bus] 发了未登记的事件「${name}」——先在 kernel/contracts.js 登记`;
      console.error(msg);
      diag.record({ kind: 'contract-violation', event: name, message: 'unregistered-event' });
      return { handled: 0, errors: 0 };
    }
    const missing = checkPayload(name, payload);
    if (missing.length) {
      console.error(`[bus] 事件「${name}」缺少必需字段：${missing.join('、')}`);
      diag.record({ kind: 'contract-violation', event: name, message: `missing:${missing.join(',')}` });
    }
    return bus.emit(name, payload);
  }

  /** 注册一个模块（描述符形状见 kernel/plugins.js；同事照着 modules/README.md 写即可） */
  function register(descriptor) {
    const errs = validateDescriptor(descriptor, { knownEvents });
    if (errs.length) {
      console.error(`[kernel] 模块「${descriptor?.name || '?'}」描述符不合法：${errs.join('；')}`);
      diag.record({ kind: 'bad-descriptor', module: descriptor?.name, message: errs.join(';') });
      return null;
    }
    if (modules.has(descriptor.name)) {
      diag.record({ kind: 'duplicate-module', module: descriptor.name });
      console.warn(`[kernel] 模块「${descriptor.name}」重复注册（后来的覆盖先前的）`);
    }
    const entry = { descriptor, api: descriptor.api || {} };
    modules.set(descriptor.name, entry);
    diag.record({ kind: 'boot', event: 'register', module: descriptor.name, note: descriptor.note });
    return entry.api;
  }

  /** 按依赖拓扑排序（requires 指向的模块必须已注册） */
  function ordered() {
    const out = [];
    const seen = new Set();
    const visit = (name, stack) => {
      if (seen.has(name)) return;
      if (stack.includes(name)) {
        diag.record({ kind: 'dependency-cycle', module: name, stack: stack.join(' → ') });
        console.error(`[kernel] 模块依赖成环：${[...stack, name].join(' → ')}`);
        return;
      }
      const entry = modules.get(name);
      if (!entry) return;
      for (const dep of entry.descriptor.requires || []) {
        if (!modules.has(dep)) {
          diag.record({ kind: 'missing-dependency', module: name, dep });
          console.warn(`[kernel] 模块「${name}」依赖的「${dep}」还没注册（分批迁移期正常）`);
          continue;
        }
        visit(dep, [...stack, name]);
      }
      seen.add(name);
      out.push(entry);
    };
    for (const name of modules.keys()) visit(name, []);
    return out;
  }

  /** 接线：把模块自己声明的订阅挂到总线上。模块里不许出现 bus.on —— 这里是唯一接线处 */
  function wire() {
    for (const { descriptor } of ordered()) {
      for (const [evt, handler] of Object.entries(descriptor.subscriptions || {})) {
        const fn = typeof handler === 'function' ? handler : descriptor[handler];
        if (typeof fn !== 'function') {
          diag.record({ kind: 'wiring-bad-handler', module: descriptor.name, event: evt, handler: String(handler) });
          console.error(`[kernel] 模块「${descriptor.name}」声明订阅「${evt}」，但找不到方法 ${String(handler)}`);
          continue;
        }
        // 用描述符的名字做作用域：handler 里 this 指向描述符，方便模块自持状态
        offs.push(bus.on(evt, (payload, name) => fn.call(descriptor, payload, name, kernel)));
      }
      diag.record({ kind: 'boot', event: 'wire', module: descriptor.name, subs: Object.keys(descriptor.subscriptions || {}).length });
    }
  }

  const kernel = {
    bus,
    diag,
    resources,
    snapshot,
    screens,
    EVENTS,
    register,
    emit,

    /** 取别的模块的接口（模块间协作的正道；拿不到返回 null，不抛错） */
    api(name) {
      const entry = modules.get(name);
      if (!entry) {
        diag.record({ kind: 'api-miss', module: name });
        return null;
      }
      return entry.api;
    },

    list() {
      return [...modules.keys()];
    },

    /**
     * 启动：拓扑排序 → init → 接线 → ready → 发 boot:ready。
     * 幂等：重复调用只跑一次（测试会反复 boot）。
     */
    boot() {
      if (booted) return kernel.state();
      for (const { descriptor } of ordered()) {
        try {
          descriptor.init?.call(descriptor, kernel);
        } catch (err) {
          diag.record({ kind: 'init-error', module: descriptor.name, message: String(err && err.message || err) });
          console.error(`[kernel] 模块「${descriptor.name}」init 抛错（已跳过）：`, err);
        }
      }
      wire();
      for (const { descriptor } of ordered()) {
        try {
          descriptor.ready?.call(descriptor, kernel);
        } catch (err) {
          diag.record({ kind: 'ready-error', module: descriptor.name, message: String(err && err.message || err) });
          console.error(`[kernel] 模块「${descriptor.name}」ready 抛错（已跳过）：`, err);
        }
      }
      booted = true;
      diag.record({ kind: 'boot', event: 'boot:ready', modules: modules.size });
      bus.emit('boot:ready', { at: Date.now() });
      return kernel.state();
    },

    /** 诊断快照（`window.__czKernel.state()` 就是它） */
    state() {
      return {
        booted,
        modules: [...modules.entries()].map(([name, e]) => ({
          name,
          note: e.descriptor.note || '',
          requires: e.descriptor.requires || [],
          subs: Object.keys(e.descriptor.subscriptions || {}),
        })),
        wired: bus.subscribed(),
        events: bus.subscribed().length,
        resources: resources.held(),
        snapshot: snapshot.info(),
        problems: diag.problems(),
        diagCount: diag.count(),
      };
    },

    /** 卸载全部订阅（测试/热替换用；不销毁模块自身状态） */
    dispose() {
      for (const off of offs.splice(0)) off();
      for (const { descriptor } of modules.values()) descriptor.dispose?.call(descriptor);
      booted = false;
    },
  };

  return kernel;
}
