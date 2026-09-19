/**
 * 对歌（`antiphony`）—— 同事单独开发的玩法，薄适配进我们的插件契约。
 *
 * 玩法本体在 [`src/minigames-antiphony-chat.js`](./src/minigames-antiphony-chat.js)
 * （v2 · 坐在火塘边对唱：休闲对话式，没有失败线）。
 * 本文件只做三件事，玩法逻辑一个字没动（说明同 `skim.js`）。
 *
 * 落点：第三幕 · 遵义 · 街头歌台。
 */
import * as mod from './src/minigames-antiphony-chat.js';
import { pluginFrom } from './adapter.js';

export default pluginFrom(mod, {
  id: 'antiphony',
  cardId: 'antiphony-v2',   // 同事卡片里那个带版本号的 id（槽名用我们的，见 adapter 的说明）
  kicker: '第三幕 · 遵义 · 歌台',
  stats: [['巡', '1/3'], ['接住的', 0], ['跑调的', 0]],
});
