/**
 * 插件描述符 —— 一个"IP 模块"长什么样。
 *
 * 设计的要害：**模块集合不写死**。内核里没有任何模块的名字，新增/替换模块只做两件事：
 *   ① 在 `wiring.js` 的 MODULES 清单里加一行（这是"有哪些模块"的唯一真相）
 *   ② 写模块自己的描述符（它订阅什么、提供什么，写在模块自己文件里）
 * 加模块不需要改内核、不需要改别的模块的文件——这正是"随时能引入新模块"的意思。
 *
 * 描述符形状（全部可选，除 name）：
 *   {
 *     name: 'audio',                       // 唯一名；诊断、wiring 清单、kernel.api() 都用它
 *     note: '环境床 / BGM / 音效 / 语音',     // 一句话说明（给人和诊断看）
 *     requires: ['state'],                 // 依赖的模块名（内核按拓扑序 init，缺依赖会报错）
 *     subscriptions: { 'screen:show': 'onScreenShow' },  // 订阅：事件名 → 本模块的方法名（可用字符串或函数）
 *     api: { ... },                        // 提供给别的模块用的接口（别人用 kernel.api('audio') 拿）
 *     init(kernel) {},                     // 注册后调用一次（此时别的模块可能还没就绪）
 *     ready(kernel) {},                    // 全部模块 init 完成后调用（这时可以放心用别人的 api）
 *     dispose() {},                        // 卸载（测试与热替换用）
 *   }
 *
 * 规矩（`npm run qa:bus` 强制）：
 * - 模块**不许 import 其它模块**（只许 import kernel/ 与 contracts/）；要协作就用事件或 {@link kernel.api}。
 * - 模块**不许直接 `bus.on(...)`**：订阅一律写进描述符的 `subscriptions`，由内核接上。
 * - 订阅与发出的每个事件名都必须在 `kernel/contracts.js` 里登记过。
 */

export const DESCRIPTOR_KEYS = ['name', 'note', 'requires', 'subscriptions', 'api', 'init', 'ready', 'dispose'];

/**
 * 校验一个描述符。返回错误清单（空 = 通过）。内核注册时调用；
 * `qa:bus` 也会用它，保证"同事照着模板写的模块"第一次就能被接上。
 */
export function validateDescriptor(d, { knownEvents } = {}) {
  const errs = [];
  if (!d || typeof d !== 'object') return ['描述符不是对象'];
  if (!d.name || typeof d.name !== 'string') errs.push('缺少 name');
  if (d.subscriptions && typeof d.subscriptions !== 'object') errs.push('subscriptions 必须是对象');
  for (const [evt, handler] of Object.entries(d.subscriptions || {})) {
    if (knownEvents && !knownEvents.has(evt)) errs.push(`订阅了未登记的事件「${evt}」（先去 kernel/contracts.js 登记）`);
    if (typeof handler !== 'string' && typeof handler !== 'function') {
      errs.push(`订阅「${evt}」的处理器必须是方法名或函数`);
    }
  }
  for (const k of Object.keys(d)) {
    if (!DESCRIPTOR_KEYS.includes(k)) errs.push(`描述符里有不认识的字段「${k}」（避免随手塞状态进去）`);
  }
  if (d.requires && !Array.isArray(d.requires)) errs.push('requires 必须是数组');
  return errs;
}
