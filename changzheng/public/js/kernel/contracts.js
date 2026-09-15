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
  'flow:act-enter': { note: '进入某一幕（营地日带 day 与分日标签 label，如第四幕的「雪山/草地」）', fields: ['actId'], optional: ['day', 'label', 'title'] },
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
  'ai:fail': { note: '调用失败（重试用尽）——UI 据此挂「重试／跳过」', fields: ['callType', 'error'] },
  'ai:verdict': { note: 'UI 对失败的裁决：ai 模块等它决定要不要再发一次。事件往返，所以模块不碰 DOM、UI 不碰调用细节', fields: ['id', 'retry'] },

  // ── 声音（audio 模块订阅：业务只发事件，不直接调音频门面）──
  'scene:enter': { note: '进入一个独立场景（title / sandbox / luding / ending —— 幕轴上的场景走 flow:act-enter）', fields: ['name'] },
  'sfx:play': { note: '播一个音效（名字见 audio/sfx-table.js）', fields: ['name'] },
  'game:start': { note: '玩法板开了一局（games 模块广播；要挂成就/统计/彩蛋的模块听它，不必改玩法）', fields: ['id'], optional: ['title'] },
  'game:end': { note: '玩法结束（带结果分；玩法内部规则仍归玩法自己）', fields: ['id'], optional: ['score', 'ms'] },
  'ai:feed': { note: '一条调用摘要（答辩面板的调用流）：谁发起调用谁发它，列表与渲染在别处——数据源唯一', fields: ['entry'] },
  'voice:say': { note: '播一句台词；text 与 file 至少给一个（file 直给时跳过目录与 TTS 解析）；rate 是语速档位（见 audio 模块 api 的 voiceRates()）', fields: [], optional: ['text', 'actorId', 'voiceId', 'file', 'rate'] },
  'voice:start': { note: '语音开始出声。durationMs 为 0 = 还没读到元数据（以 voice:progress 里的 duration 为准）；起播就失败或没播完就被停掉的，不会有 start，直接给 ended', fields: ['durationMs'] },
  'voice:progress': { note: '语音播放进度（约 10Hz 节流）：t = 已播毫秒。逐字跟读全项目只认这一个时钟（不自造第二个）', fields: ['t', 'duration'] },
  'voice:ended': { note: '语音收尾：自然播完 / 被打断 / 出错三条路都发（interrupted 区分后两者），消费方以它为准收尾，别等 start 配对', fields: [], optional: ['interrupted'] },
  'voice:stop': { note: '请求停当前台词（跳过终局升华要连音频一起停）；没在播时无副作用', fields: [] },
  'audio:toggle-mute': { note: '请求切换静音（状态由 audio 模块持有，UI 不自己记）', fields: [] },
  'audio:muted': { note: '静音状态变了（audio 模块回执；UI 据此更新图标与提示）', fields: ['on'] },
  'audio:suspended': { note: 'AudioContext 被浏览器策略挂起、需要用户点一下（UI 提示一次）', fields: ['message'] },

  // ── 内核资源（把 S.busy 这类"独占"提成可观测的东西）──
  'resource:claim': { note: '申请独占资源；已被占则失败（调用方自行决定等还是提示）', fields: ['name', 'who'] },
  'resource:release': { note: '释放独占资源', fields: ['name', 'who'] },
  'resource:blocked': { note: '申请独占资源失败（别人占着）——UI 据此给反馈，别再在每个调用点各写一遍提示', fields: ['name', 'who'], optional: ['holder'] },
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
