/**
 * 陡坡 · 拽住他 —— 玩法插件（契约与 ctx 见 ./README.md）
 *
 * ⚠ **占位实现**：内部逻辑仍是旧版。同事重做的正式版到位后，把本文件整体替换掉即可——
 *   接口不变、清单那一行也不用改（这就是批 5"玩法变插件"要的效果）。
 */
import { runGrab } from '../../minigames.js';   // ⚠ 临时：正式版到位后与 minigames.js 一起删

export default {
  game: {
    id: 'grab',
    title: '陡坡 · 拽住他',
    bg: '/assets/scenes/snow_climb.jpg',
    stats: [["机会","—"],["抓住","0"]],
    actions: ["grab"],
    mount(host, ctx) {
      return runGrab(host, ctx);
    },
  },
};
