/**
 * 夜搭浮桥（不可再生的门板在**空间**上的配平：往哪一段投料）（`pontoon-night`）—— 同事重做的玩法，薄适配进我们的插件契约。
 *
 * 玩法本体在 [`src/minigames-pontoon.js`](./src/minigames-pontoon.js)：同事**单独开发**的那条线（他们的写法）。
 * 本文件只做三件事，玩法逻辑一个字没动：
 *   ① 从**卡片**（`XXX_MINIGAMES[0]`）取 id/题名/动作词——单一真源，不抄一遍；
 *   ② 把宿主能力注入源码（`bindHost`：音效 / 数值签 / 模型回调，见 `adapter.js`）；
 *   ③ 数值签**初值**：宿主挂载时就要有内容（等玩法第一帧再写会有一瞬空白）。
 * 四处缝合点（音频/数值签/模型/收尾）由 `tools/intake-minigames.mjs` 在源码里开口、
 * 由 `adapter.js` 在装配时注入——同事下次更新玩法，把文件丢回 `src/` 再跑一次收料工具即可。
 *
 * 落点：第一幕 · 于都河 · 夜渡。
 */
import * as mod from './src/minigames-pontoon.js';
import { pluginFrom } from './adapter.js';

export default pluginFrom(mod, {
  id: 'pontoon-night',
  kicker: '第一幕 · 于都河 · 夜渡',
  stats: [['夜色', '—'], ['船', '—']],
});
