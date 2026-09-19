/**
 * 编草鞋（`weave`）—— 同事单独开发的玩法，薄适配进我们的插件契约。
 *
 * 玩法本体在 [`src/minigames-weave.js`](./src/minigames-weave.js)（v2 · 一只鞋的六道工序）。
 * 本文件只做三件事，玩法逻辑一个字没动（说明同 `skim.js`）。
 *
 * 落点：第二幕 · 湘江 · 宿营（打了一整天，夜里补鞋）。
 */
import * as mod from './src/minigames-weave.js';
import { pluginFrom } from './adapter.js';

export default pluginFrom(mod, {
  id: 'weave',
  cardId: 'weave-v2',   // 同事卡片里那个带版本号的 id（槽名用我们的，见 adapter 的说明）
  kicker: '第二幕 · 湘江 · 宿营',
  stats: [['工序', '1 / 6'], ['灯油', '100%']],
});
