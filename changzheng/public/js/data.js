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
];

export const PATH_ZONES = [
  { id: 'near', label: '抄近路', sub: '贴着亮水洼，快但险', x: 18, y: 48, w: 28, h: 40, score: 0.45 },
  { id: 'steady', label: '绕远走硬地', sub: '慢七里，稳', x: 40, y: 42, w: 24, h: 42, score: 0.85 },
  { id: 'far', label: '沿边缘慢慢磨', sub: '最稳，最耗体力', x: 66, y: 45, w: 28, h: 40, score: 0.7 },
];
