/**
 * 泥地五子棋 —— 玩法插件（契约与 ctx 见 ./README.md）
 *
 * ⚠ **占位实现**：内部逻辑仍是旧版。同事重做的正式版到位后，把本文件整体替换掉即可——
 *   接口不变、清单那一行也不用改（这就是批 5"玩法变插件"要的效果）。
 */
import { runGomoku } from '../../minigames.js';   // ⚠ 临时：正式版到位后与 minigames.js 一起删

export default {
  game: {
    id: 'gomoku',
    title: '泥地五子棋',
    bg: '/assets/scenes/camp_pano.jpg',
    stats: [["手数","0"],["局面","进行中"]],
    actions: ["cell"],
    mount(host, ctx) {
      return runGomoku(host, ctx);
    },
  },
};
