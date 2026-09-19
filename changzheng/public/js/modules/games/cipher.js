/**
 * 译电（`cipher`）—— 同事单独开发的玩法，薄适配进我们的插件契约。
 *
 * 这一支是**三份源码**（与夜校同一套办法）：
 *   · `src/minigames-cipher-entry.js`  入口：两档二选一（`mode-easy` / `mode-hard`）
 *   · `src/minigames-cipher.js`        简单档（v2）：查密本 + 定本 + 判谎
 *   · `src/minigames-cipher-code.js`   挑战档（v3）：四码 / 韵目代日 / 地支代月 / 锁匙加减
 * **入口自己会拉起选中的那一档**，所以这里只装入口、收尾与结算由它给出；
 * 但**宿主能力要注入三个模块**——子玩法用的是它自己那份 `bindHost`，漏了哪一份那一档的
 * 音效/数值签/模型回调就是空的。
 * 简单档会在后台预取一封新题面（`cipher_draft`，约四成成功率、不占玩家时间）；
 * 挑战档游戏内 0 次模型调用。
 *
 * 落点：第四幕 · 金沙江 · 电台。
 */
import * as entry from './src/minigames-cipher-entry.js';
import * as easy from './src/minigames-cipher.js';
import * as hard from './src/minigames-cipher-code.js';
import { pluginFrom } from './adapter.js';

export default pluginFrom([entry, easy, hard], {
  id: 'cipher',
  cardId: 'cipher-entry',
  kicker: '第四幕 · 金沙江 · 电台',
  stats: [['档位', '—'], ['已译', '—']],
});
