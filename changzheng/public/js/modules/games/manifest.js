/**
 * 玩法清单 —— **"系统里有哪些玩法"的唯一真相**，与 `kernel/wiring.js` 的模块清单同一套思路。
 *
 * 加一个玩法 = 加一个文件 + 在下面加一行：
 *   import myGame from './my-game.js';
 *   export const GAMES = { …, 'my-game': myGame };
 *
 * 需要改的只有这个文件：宿主（`./index.js`）与流程层（`main.js` 的 doXxx）都不用动。
 * 契约与检查单见同目录 `README.md`；`npm run dev:check` 会核对
 * "清单里的玩法都真的能挂上、契约标记齐全"。
 */
import bendhook from './bendhook.js';
import goldenhook from './goldenhook.js';
import nightschool from './nightschool.js';
import candyShare from './candy-share.js';
import sentryWatch from './sentry-watch.js';
import mudGomoku from './mud-gomoku.js';
import ludingChain from './luding-chain.js';
import snowGrab from './snow-grab.js';
import pontoonNight from './pontoon-night.js';
import rallyRiver from './rally-river.js';
// ↑ 同事的新玩法往这里加：import 一行 + 下面 GAMES 里一行。

export const GAMES = {
  bendhook,
  goldenhook,
  nightschool,
  'candy-share': candyShare,
  'sentry-watch': sentryWatch,
  'mud-gomoku': mudGomoku,
  'luding-chain': ludingChain,
  'snow-grab': snowGrab,
  'pontoon-night': pontoonNight,
  'rally-river': rallyRiver,
};
