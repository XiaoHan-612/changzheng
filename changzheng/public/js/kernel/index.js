/**
 * 内核门面 —— 模块只从这一个文件 import 内核（与 `audio/index.js` 同一套规矩）。
 *
 *   import { kernel } from '../kernel/index.js';
 *   kernel.emit('sfx:play', { name: 'click' });     // 通知（谁听谁负责）
 *   kernel.snapshot.get().体力                      // 只读取数
 *   const audio = kernel.api('audio');              // 要别人的接口（同步调用，慎用）
 *
 * 启动：`main.js` 的 boot() 里调一次 `kernel.boot()`（幂等）。
 * 模块清单在 `wiring.js`，模块契约在 `plugins.js`，事件契约在 `contracts.js`。
 */
import { createKernel } from './kernel.js';
import { MODULES } from './wiring.js';

export const kernel = createKernel();

/**
 * 按清单加载模块并注册。**加载失败不影响启动**（分批迁移期清单里可能列着还没写的模块）：
 * 记一条诊断即可，游戏照跑。
 * @returns {Promise<string[]>} 成功注册的模块名
 */
export async function loadModules(list = MODULES) {
  const loaded = [];
  for (const item of list) {
    try {
      // 清单里的 path 写成"相对 public/js/"（如 './modules/audio/index.js'，可读），
      // 但 import() 的相对说明符是相对**本文件**解析的——所以这里显式拼成模块根再 load。
      // （踩过：直接 import(item.path) 会去找 kernel/modules/…，模块静默加载失败。）
      const url = new URL(`../${String(item.path).replace(/^\.\//, '')}`, import.meta.url).href;
      const mod = await import(url);
      const descriptor = mod.default || mod.descriptor;
      if (!descriptor) throw new Error('模块没有 export default 描述符');
      if (descriptor.name !== item.name) {
        console.warn(`[kernel] 清单里写的是「${item.name}」，模块自称「${descriptor.name}」——以模块为准`);
      }
      kernel.register(descriptor);
      loaded.push(descriptor.name);
    } catch (err) {
      kernel.diag.record({ kind: 'module-load-error', module: item.name, path: item.path, message: String(err && err.message || err) });
      console.warn(`[kernel] 模块「${item.name}」加载失败（跳过）：`, err && err.message);
    }
  }
  return loaded;
}

// 调试句柄：和 __czAudio 同级。事件流、已注册模块、契约违规、锁的持有者，一眼看清。
// 排错入口：`__czKernel.state()` / `__czKernel.diag.dump()` / `__czKernel.diag.toJsonl()`
if (typeof window !== 'undefined') {
  window.__czKernel = kernel;
  window.__czModules = MODULES;   // 体检用：核对「清单里的模块都真的注册上了」
}

export { EVENTS, isEvent, checkPayload } from './contracts.js';
export { MODULES } from './wiring.js';
export default kernel;
