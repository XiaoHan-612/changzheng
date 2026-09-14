/**
 * 模块清单（manifest）—— **"系统里有哪些模块"的唯一真相**。
 *
 * 这里只列"有哪些模块、从哪儿加载"，**不写订阅关系**：每个模块自己在描述符里声明它订阅什么
 * （见 `kernel/plugins.js`）。这样：
 *   · 加一个新模块 = 加一个目录 + 在这个数组里加一行（内核、别的模块的文件都不用动）；
 *   · 想看"谁和谁连着" = 看各模块描述符的 subscriptions，或跑 `npm run qa:bus` 打印总览。
 *
 * 分批迁移期允许清单里的模块"还没写"或"暂时空订阅"：内核会记一条 `wiring-miss` 诊断，不报错。
 * 这正是"每一步都能跑"的保证。
 *
 * 加一行怎么写：
 *   { name: 'audio', path: './modules/audio/index.js', note: '环境床 / BGM / 音效 / 语音' }
 *   - name 与描述符里的 name 必须一致（体检会核对）；
 *   - path 相对本文件；模块用 `export default { ...描述符 }` 导出。
 */
export const MODULES = [
  // 批 1：地基先立，模块从批 2 起逐个挂上来（迁移顺序见 docs/BUS.md）。
  // 例：{ name: 'audio', path: './modules/audio/index.js', note: '环境床 / BGM / 音效 / 语音' },
];

/** 内核启动阶段（boot 编排）：需要插在某个阶段之间的模块，用 stage 字段声明 */
export const STAGES = ['register', 'init', 'wired', 'ready'];
