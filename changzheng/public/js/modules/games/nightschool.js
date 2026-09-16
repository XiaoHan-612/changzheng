/**
 * 夜校识字（`nightschool`）—— 同事重做的"一灯油 / 知识竞答"，接成一个槽。
 *
 * 这一支是三份源码：
 *   · `src/minigames-school-entry.js`  入口：两条路二选一（`pick-lamp` / `pick-quiz`）
 *   · `src/minigames-school.js`        一灯油：识字三小关（末关口令会喂给夜岗）
 *   · `src/minigames-school-quiz.js`   知识竞答（AI 出题）
 * **入口自己会拉起选中的那一支**（`detail.dir = 'lamp' | 'quiz'`），所以这里只装入口、收尾与结算由它给出；
 * 但**宿主能力要注入三个模块**——子玩法用的是它自己那份 `bindHost`，漏了哪一份那一支的音效/数值签/模型回调就是空的。
 *
 * 落点：第二幕遵义与第四幕草地的「夜校」热点（同一支玩法在两处出现）。
 * 它需要模型（一灯油的判字、竞答的出题）：调用由**流程层**注入（`decide`），
 * 预算与账目都走 `modules/ai` 的 registry（见 `flow/games-flow.js` 的 `decideFor`）。
 */
import * as entry from './src/minigames-school-entry.js';
import * as lesson from './src/minigames-school.js';
import * as quiz from './src/minigames-school-quiz.js';
import { pluginFrom } from './adapter.js';

export default pluginFrom([entry, lesson, quiz], {
  id: 'nightschool',                 // 我们的槽名（manifest 的键、data-mini 的值）
  cardId: 'nightschool-entry',       // 卡片里的 id（入口那一张）
  kicker: '第二幕 · 遵义 / 第四幕 · 草地 · 一灯油',
  stats: [['识字', '—'], ['口令', '—']],
});
