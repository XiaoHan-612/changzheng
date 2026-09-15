/**
 * 飞夺泸定桥 —— 玩法插件（契约与 ctx 见 ./README.md）
 *
 * ⚠ **占位实现**：内部逻辑仍是旧版。同事重做的正式版到位后，把本文件整体替换掉即可——
 *   接口不变、清单那一行也不用改（这就是批 5"玩法变插件"要的效果）。
 */
import { runLuding } from '../../minigames.js';   // ⚠ 临时：正式版到位后与 minigames.js 一起删

export default {
  game: {
    id: 'luding',
    title: '飞夺泸定桥',
    bg: '/assets/scenes/luding_bridge.jpg',
    stats: [["时间","—"]],
    actions: ["left","right","jump"],
    mount(host, ctx) {
      return runLuding(host, ctx);
    },
  },
};
