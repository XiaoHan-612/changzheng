/**
 * 只读快照 —— 跨模块读数据走这里，不许去翻别人的内部状态。
 *
 * 为什么：现在 HUD 靠"调用方按顺序手工调 renderStats"更新（`applyEffects` 之后必须紧跟 `renderStats`，
 * 十几处这样配对），READ 与 WRITE 混在一起、顺序就是正确性。改成总线后：
 * 谁改了状态就发 `state:change`，订阅者自己来读**只读快照**渲染。
 *
 * 规矩：
 * - 快照**只有一份提供者**（将来是 state 模块；批 4 接上），别的模块只能读。
 * - 快照是冻结的浅拷贝：拿到手改不动（想改就发事件走 action）。
 * - 还没接提供者时 `get()` 返回空对象——分批迁移期不会炸。
 */

export function createSnapshot() {
  let provider = null;
  let cached = null;
  let cacheKey = 0;
  let version = 0;

  return {
    /** 唯一提供者登记（模块 ready 里调一次） */
    provide(fn) {
      if (provider && provider !== fn) console.warn('[kernel] 快照提供者被替换了——只应有一个（state 模块）');
      provider = fn;
      version += 1;
      cached = null;
    },

    has: () => !!provider,

    /**
     * 取只读快照。浅冻结：顶层字段改不动，嵌套对象请自行约定"只读"
     * （游戏状态是简单结构，不做深拷贝——每次 HUD 渲染都深拷贝不值得）。
     */
    get() {
      if (!provider) return Object.freeze({});
      if (cached && cacheKey === version) return cached;
      const raw = provider() || {};
      cached = Object.freeze({ ...raw });
      cacheKey = version;
      return cached;
    },

    /** 状态变了：作废缓存（state 模块在 `state:change` 之后调） */
    invalidate() {
      version += 1;
      cached = null;
    },

    /** 诊断用 */
    info() {
      return { hasProvider: !!provider, version, keys: cached ? Object.keys(cached) : [] };
    },
  };
}
