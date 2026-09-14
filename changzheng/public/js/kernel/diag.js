/**
 * 诊断 —— 事件流的黑匣子。
 *
 * 为什么要有它：改成总线之后，"谁在什么时候收到了什么"不再是读代码就能看出来的（这正是解耦的代价）。
 * 所以总线每处理一条事件都记一笔：环形缓冲留在内存里，`window.__czKernel.diag.dump()` 随时能看，
 * `toJsonl()` 导出成与 AI 日志同源的 JSONL（将来可以落盘/回放，答辩时是"系统在怎么运转"的证据）。
 *
 * 体检口径：`npm run qa:bus` 的运行时那半会读这份缓冲，断言内核真的启动了、事件真的在流。
 */

export function createDiag({ limit = 800 } = {}) {
  const ring = [];
  let seq = 0;

  return {
    /** 记一笔。`kind` 约定：emit / subscriber-error / wiring-miss / wiring-bad / contract-violation / boot */
    record(e) {
      seq += 1;
      ring.push({ i: seq, t: Date.now(), ...e });
      if (ring.length > limit) ring.shift();
      return seq;
    },

    /** 取事件流（可按名字过滤、从某个序号之后） */
    events({ name, since = 0 } = {}) {
      return ring.filter((e) => e.i > since && (!name || e.event === name));
    },

    /** 只取某类诊断（如 wiring-miss / contract-violation），给体检与排错用 */
    problems() {
      return ring.filter((e) => e.kind && e.kind !== 'emit' && e.kind !== 'boot');
    },

    dump() {
      return [...ring];
    },

    /** 导出成 JSONL（与 logs/ai-calls-*.jsonl 同一套写法，便于同源查看） */
    toJsonl() {
      return ring.map((e) => JSON.stringify(e)).join('\n');
    },

    count() {
      return ring.length;
    },

    clear() {
      ring.length = 0;
      seq = 0;
    },
  };
}
