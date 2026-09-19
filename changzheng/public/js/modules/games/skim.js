/**
 * 打水漂（`skim`）—— 同事单独开发的玩法，薄适配进我们的插件契约。
 *
 * 玩法本体在 [`src/minigames-skim.js`](./src/minigames-skim.js)（v3 · 第一人称甩石片，2026-09-18）。
 * 本文件只做三件事，玩法逻辑一个字没动：
 *   ① 从**卡片**（`SKIM_MINIGAMES[0]`）取 id/题名/动作词——单一真源，不抄一遍；
 *   ② 把宿主能力注入源码（`bindHost`：音效 / 数值签 / 模型回调，见 `adapter.js`）；
 *   ③ 数值签**初值**：宿主挂载时就要有内容（等玩法第一帧再写会有一瞬空白）。
 *
 * 落点：第一幕 · 于都河 · 河滩（等待渡河的一夜）。
 */
import * as mod from './src/minigames-skim.js';
import { pluginFrom } from './adapter.js';

export default pluginFrom(mod, {
  id: 'skim',
  cardId: 'skim-v3',   // 同事卡片里那个带版本号的 id（槽名用我们的，见 adapter 的说明）
  kicker: '第一幕 · 于都河 · 河滩',
  stats: [['轮', '1 / 3'], ['你', '0 跳'], ['娃', '0 跳']],
});
