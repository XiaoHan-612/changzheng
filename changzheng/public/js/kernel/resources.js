/**
 * 内核资源 —— 把"独占"这件事从隐式锁提成可观测的东西。
 *
 * 现状的坑（HANDOFF-CODE 有记）：`S.busy` + `withLock` 在忙时**静默 return**，
 * 于是嵌套调用会悄悄什么都不做；为了绕开它，代码里有两处"手工把 busy 置 false 再进流程"，
 * 靠注释维持。另一套状态是 `body[data-step-state]`（自动化依赖它判断"在等模型"）。
 * 两者语义重叠但不联动——点了没反应、测试等不到，都从这儿来。
 *
 * 这里先立一个显式的容器（批 3 会把上面的两套收编进来）：
 * - `claim(name, who)` 成功/失败是**返回值**，不再靠"静默 return"表达；
 * - 每次申请与释放都发事件 → 诊断里能看到"谁在什么时候占着锁"；
 * - `onBlocked` 钩子让调用方能给玩家一个交代（现在是 toast「上一步还在进行…」）。
 */
export function createResources({ bus, onEvent } = {}) {
  /** @type {Map<string, string>} 资源名 → 持有者 */
  const held = new Map();

  return {
    /** 申请独占；返回 true = 拿到了，false = 别人正占着（调用方决定提示还是排队） */
    claim(name, who) {
      if (held.has(name)) {
        const holder = held.get(name);
        onEvent?.({ kind: 'resource-blocked', name, who, holder });
        bus.emit('resource:blocked', { name, who, holder });   // 广播：UI 给反馈（谁占着也一并带上）
        return false;
      }
      held.set(name, who);
      bus.emit('resource:claim', { name, who });
      return true;
    },

    /** 释放；返回 true = 确实释放了（重复释放是 false，不是错） */
    release(name, who) {
      if (!held.has(name)) return false;
      const holder = held.get(name);
      // 只有持有者能放（防止 A 把 B 的锁放了——正是"手工置 false 解锁"埋下的隐患）
      if (who && holder !== who) {
        onEvent?.({ kind: 'resource-release-denied', name, who, holder });
        return false;
      }
      held.delete(name);
      // 先取 holder 再 delete：反过来写，`who || held.get(name)` 永远拿到 undefined——
      // 不只是"诊断里看不出谁放的"，契约表里 who 是必需字段，内核还会记一条契约违规（2026-09-15 修）
      bus.emit('resource:release', { name, who: who || holder });
      return true;
    },

    isHeld: (name) => held.has(name),
    holder: (name) => held.get(name) || null,
    held: () => Object.fromEntries(held),
  };
}
