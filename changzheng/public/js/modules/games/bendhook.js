/**
 * 弯针成钩（`bendhook`）—— 同事重做的第四幕"钓鱼前置"玩法，接针成钩。
 *
 * 玩法本体在 [`src/minigames-needle.js`](./src/minigames-needle.js)：那是同事**单独开发**的一条线
 * （他们的写法、他们自己的音效/数值签），本文件只是把它装进我们的插件契约——
 * 四处缝合点（音频/数值签/模型/收尾）由 `tools/intake-minigames.mjs` 在源码里开口、
 * 由 [`adapter.js`](./adapter.js) 在装配时注入，**玩法逻辑一个字没动**。
 *
 * 落点：第四幕草地，钓鱼之前的铺垫关（`flow/games-flow.js` 的 `doFishing` 先拉它、再拉 `goldenhook`）。
 * 它不产生模型调用（同时长的铺垫，别把额度花在两句话的复盘上）。
 */
import * as mod from './src/minigames-needle.js';
import { pluginFrom } from './adapter.js';

export default pluginFrom(mod, {
  id: 'bendhook',
  kicker: '第四幕 · 草地 · 钓鱼之前',
  stats: [['火候', '—'], ['钩门', '—']],     // 初值；开局第一帧由玩法自己接上真数字
});
