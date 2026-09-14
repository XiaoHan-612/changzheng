/**
 * 事件契约 —— 全项目事件名与载荷的**唯一真源**（地位等同于服务端的 server/schema.js）。
 *
 * 规矩（由 `npm run qa:bus` 静态校验 + 内核运行时校验共同保证）：
 * 1. 想发/想听一条事件，**先在这里登记**；没登记的名字发出去会被记成契约违规（console.error + 诊断）。
 * 2. `fields` 是这个事件**必须带**的字段（只校验"有没有"，不校验类型——够用且不啰嗦）。
 *    可选字段写在 note 里，别塞进 fields。
 * 3. 契约表里每条事件都必须在 `wiring.js` 里有位置（哪怕暂时没人订阅）——**防止"发了没人接"悄悄发生**。
 *
 * 这份表同时是给人看的文档：想知道"系统里有哪些事在流动"，读这一张。
 */
export const EVENTS = {
  // ── 内核自身 ──
  'boot:ready': { note: '内核启动完成（所有已注册模块的 init 都跑过）', fields: ['at'] },

  // ── 屏与流程 ──
  'screen:show': { note: '切到某屏。各屏自己订阅 screen:hide 清理自己的 DOM（不许越界清别人）', fields: ['id'] },
  'screen:hide': { note: '离开某屏（由 showScreen 广播）', fields: ['id'] },
  'flow:act-enter': { note: '进入某一幕（营地日会带 day）', fields: ['actId'], optional: ['day', 'title'] },
  'flow:act-finish': { note: '一幕收尾（幕间总评之后）', fields: ['actId'] },

  // ── 游戏状态 ──
  'state:change': { note: '游戏状态变更。keys 是这次动了哪些字段（HUD 据此重渲染）', fields: ['keys'] },
  'hotspot:used': { note: '营地热点被用掉（一次性）', fields: ['actId', 'key'] },
  'choice:made': { note: '玩家做了一次抉择（写手记/日志用）', fields: ['label'], optional: ['actId', 'mood', 'trend'] },
  'line:done': { note: '附身线点亮（第四幕五条线，篝火夜门槛用）', fields: ['key'] },

  // ── 模型调用 ──
  'ai:request': { note: '发起一次模型调用（业务侧只发这个，不直接调 ai-client）', fields: ['callType', 'scene'], optional: ['situation'] },
  'ai:start': { note: '调用开始等待（UI 据此显示「思考中」，不再由调用方手工成对写）', fields: ['callType'] },
  'ai:done': { note: '调用成功返回', fields: ['callType', 'ms'], optional: ['source', 'usage'] },
  'ai:fail': { note: '调用失败（重试用尽）', fields: ['callType', 'error'] },

  // ── 声音 ──
  'sfx:play': { note: '播一个音效（名字见 audio/sfx-table.js）', fields: ['name'] },
  'voice:say': { note: '播一句台词', fields: ['text'], optional: ['actorId', 'voiceId', 'file'] },

  // ── 内核资源（把 S.busy 这类"独占"提成可观测的东西）──
  'resource:claim': { note: '申请独占资源；已被占则失败（调用方自行决定等还是提示）', fields: ['name', 'who'] },
  'resource:release': { note: '释放独占资源', fields: ['name', 'who'] },
};

/** 事件是否已登记 */
export function isEvent(name) {
  return Object.prototype.hasOwnProperty.call(EVENTS, name);
}

/**
 * 轻量载荷校验：返回"缺哪些必需字段"（空数组 = 通过）。
 * 未登记的事件返回 ['(未登记)']——调用方据此报契约违规。
 */
export function checkPayload(name, payload) {
  const spec = EVENTS[name];
  if (!spec) return ['(未登记)'];
  const p = payload || {};
  return spec.fields.filter((f) => p[f] === undefined || p[f] === null);
}
