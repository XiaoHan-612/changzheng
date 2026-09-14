/**
 * 事件总线 —— 模块之间**唯一**的通信方式（SoC 里的那根总线）。
 *
 * 为什么要有它：现在模块之间是"直接互相调用"——`main.js` 一个文件里塞了 26 个职责块，
 * UI 切屏时会去清别人（舞台/玩法区/对白区）的 DOM，锁用 `S.busy` 静默 return 表达，
 * 时序靠注释维持。这些耦合看不见、也测不到。改成总线后：**谁想听什么，写在 wiring.js 一张表里**；
 * 模块只管发事件，不知道也不关心谁在听。
 *
 * 设计取舍（写死，不许随意改）：
 * - **同步派发**：`emit()` 返回时所有订阅者已执行完。可预测、便于时序推理；重活由订阅者自己丢微任务。
 * - **按优先级排序**：同一事件内数值大的先执行（例如"先切音频再改 UI"）。
 * - **一个订阅者抛错不影响别人**：捕获后记进诊断与 console.error。**总线不允许把游戏搞崩**
 *   （同音频那条"任何声音都不允许阻塞流程"的口径）。
 * - **不认识的订阅者不算错**：`wiring.js` 里写了模块但模块还没注册时（分批迁移期的常态），
 *   记一条 `wiring-miss` 诊断即可，不报错——这样每一步都能跑。
 */

/**
 * @param {{ onEvent?: (e: object) => void }} [opts] onEvent：每处理一条事件调一次（诊断用）
 */
export function createBus({ onEvent } = {}) {
  /** @type {Map<string, Array<{ id: number, fn: Function, priority: number, once: boolean }>>} */
  const handlers = new Map();
  let seq = 0;

  const listOf = (name) => {
    if (!handlers.has(name)) handlers.set(name, []);
    return handlers.get(name);
  };
  const sortByPriority = (arr) => arr.sort((a, b) => b.priority - a.priority || a.id - b.id);

  function on(name, fn, { priority = 0, once = false } = {}) {
    if (typeof fn !== 'function') throw new TypeError(`bus.on(${name}) 需要一个函数`);
    const entry = { id: (seq += 1), fn, priority, once };
    listOf(name).push(entry);
    sortByPriority(handlers.get(name));
    return () => off(name, fn);
  }

  function once(name, fn, opts = {}) {
    return on(name, fn, { ...opts, once: true });
  }

  function off(name, fn) {
    const arr = handlers.get(name);
    if (!arr) return false;
    const i = arr.findIndex((h) => h.fn === fn);
    if (i < 0) return false;
    arr.splice(i, 1);
    return true;
  }

  /**
   * 派发一条事件。同步执行全部订阅者。
   * @returns {{ handled: number, errors: number }} 被处理的订阅者数与抛错数（诊断用）
   */
  function emit(name, payload) {
    const arr = handlers.get(name);
    let handled = 0;
    let errors = 0;
    if (arr && arr.length) {
      // 复制一份再遍历：订阅者在回调里 off/on 自己不该打乱本次派发
      for (const h of [...arr]) {
        if (h.once) off(name, h.fn);
        try {
          h.fn(payload, name);
          handled += 1;
        } catch (err) {
          errors += 1;
          // 一个订阅者坏了不许拖垮流程（总线是基础设施，不是业务）
          console.error(`[bus] 订阅者处理「${name}」时抛错（已忽略，不影响其它订阅者）：`, err);
          onEvent?.({ kind: 'subscriber-error', event: name, message: String(err && err.message || err) });
        }
      }
    }
    onEvent?.({ kind: 'emit', event: name, handled, errors, payload });
    return { handled, errors };
  }

  return {
    on,
    once,
    off,
    emit,
    /** 某事件有几个订阅者（诊断与体检用） */
    count: (name) => (handlers.get(name) || []).length,
    /** 已登记订阅的事件名 */
    subscribed: () => [...handlers.entries()].filter(([, a]) => a.length).map(([n]) => n).sort(),
    /** 清空（测试用） */
    clear: () => { handlers.clear(); },
  };
}
