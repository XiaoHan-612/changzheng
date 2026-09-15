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
  // 批 2 起逐个挂上来（迁移顺序见 docs/BUS.md）。
  { name: 'audio', path: './modules/audio/index.js', note: '声音总入口：环境床 / BGM / 音效 / 语音' },
  { name: 'shell', path: './modules/shell/index.js', note: '外壳对事件的反应：顶栏静音图标、ctx 挂起提示' },
  { name: 'state', path: './modules/state/index.js', note: '游戏状态唯一持有者：写走动作并广播 state:change' },
  { name: 'hud', path: './modules/hud/index.js', note: '状态读数渲染：订阅 state:change，顶栏五维/行动点/同伴/手记' },
  { name: 'screens', path: './modules/screens/index.js', note: '屏的生命周期归属：宿主登记自己的清理，离开只清自己的容器' },
  { name: 'games', path: './modules/games/index.js', note: '玩法宿主服务：开板屏/题名/数值签/契约声明/清理；玩法只是清单里的插件' },
  { name: 'ai', path: './modules/ai/index.js', note: '大模型调用的观测与账目：收 ai:feed、渲染答辩面板调用流（批 6 再长 registry/run）' },
  { name: 'cinema', path: './modules/cinema/index.js', note: '电影化：拍子播放器（序章 / 幕间过渡 / 终局升华），过场屏归它自清' },
];

/** 内核启动阶段（boot 编排）：需要插在某个阶段之间的模块，用 stage 字段声明 */
export const STAGES = ['register', 'init', 'wired', 'ready'];
