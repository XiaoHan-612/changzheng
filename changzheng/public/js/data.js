export const CHAPTER = {
  id: 'full_march',
  title: '长征',
  subtitle: '五幕',
  totalDays: 1,
  apPerDay: 2,
};

export const COMPANIONS = [
  { id: 'laoban', name: '老班长', role: '炊事班长', ava: '班', img: '/assets/characters/laoban.png' },
  { id: 'zhiyuan', name: '指导员', role: '连队指导员', ava: '指', img: '/assets/characters/zhiyuan.png' },
  { id: 'xiaogui', name: '红小鬼', role: '16岁小战士', ava: '鬼', img: '/assets/characters/xiaogui.png' },
  { id: 'weisheng', name: '卫生员', role: '卫生员', ava: '卫', img: '/assets/characters/weisheng.png' },
  // 第五位：策划案里本来就是五人（老班长 / 指导员 / 红小鬼 / 卫生员 / 老乡）。
  // 早先只有前四位，而老乡的好感一直在动（模型会改、日志里有、研学报文也带着），
  // 玩家却永远看不到——一条看不见的关系维度。2026-09-15 补齐（见 HANDOFF-CODE 坑 42）。
  { id: 'xianggui', name: '老乡', role: '带路的乡亲', ava: '乡', img: '/assets/characters/xianggui.png' },
];

// 岔路点位：坐标是整屏百分比（定位参照系由模板 .tpl-layer 提供）。
// 三列必须互不重叠——原先 18/40/66 宽度 28/24/28 会叠在一起，点位糊成一片（踩过）。
export const PATH_ZONES = [
  { id: 'near', label: '抄近路', sub: '贴着亮水洼，快但险', x: 7, y: 52, w: 26, h: 38, score: 0.45 },
  { id: 'steady', label: '绕远走硬地', sub: '慢七里，稳', x: 37, y: 44, w: 26, h: 38, score: 0.85 },
  { id: 'far', label: '沿边缘慢慢磨', sub: '最稳，最耗体力', x: 67, y: 48, w: 26, h: 38, score: 0.7 },
];
