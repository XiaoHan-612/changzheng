export const CHAPTER = {
  id: 'act2_grassland',
  title: '第二幕 · 草地',
  subtitle: '金色的鱼钩',
  date: '1935年8月',
  location: '松潘草地（川西北）',
  totalDays: 2,
  apPerDay: 2,
};

export const COMPANIONS = [
  { id: 'laoban', name: '老班长', role: '炊事班长', ava: '班', img: '/assets/characters/laoban.png' },
  { id: 'zhiyuan', name: '指导员', role: '连队指导员', ava: '指', img: '/assets/characters/zhiyuan.png' },
  { id: 'xiaogui', name: '红小鬼', role: '16岁小战士', ava: '鬼', img: '/assets/characters/xiaogui.png' },
  { id: 'weisheng', name: '卫生员', role: '卫生员', ava: '卫', img: '/assets/characters/weisheng.png' },
];

export const CUTSCENE = [
  {
    img: '/assets/scenes/marsh.jpg',
    text: '湘江的水声还在耳朵里，脚下的草甸却已经一踩一颤。水汽贴着地面漫上来。',
  },
  {
    img: '/assets/scenes/camp_pano.jpg',
    text: '1935年8月，松潘草地。口粮见底，前路未知。今夜，你在一个小宿营地歇脚。',
  },
  {
    img: '/assets/scenes/night_fire.jpg',
    text: '营地里有人、有火、有水塘。走近谁，就替他把手头那件事做完。',
  },
];

/**
 * 全景热点：x/y 为画面百分比（0-100）
 * kind: talk | minigame | judge | march
 */
export const HOTSPOTS = [
  {
    id: 'pond',
    label: '池塘边',
    sub: '老班长在弯针钓鱼',
    icon: '钩',
    x: 13, y: 54,
    kind: 'minigame',
    action: 'fishing',
    img: '/assets/scenes/pond_close.jpg',
  },
  {
    id: 'school',
    label: '夜校',
    sub: '灯下认字、学口令',
    icon: '字',
    x: 38, y: 50,
    kind: 'minigame',
    action: 'school',
    img: '/assets/scenes/school_close.jpg',
  },
  {
    id: 'fire',
    label: '篝火旁',
    sub: '交谈 / 分享口粮',
    icon: '火',
    x: 58, y: 48,
    kind: 'hub',
    img: '/assets/scenes/night_fire.jpg',
  },
  {
    id: 'tent',
    label: '背囊旁',
    sub: '靠着歇一会儿',
    icon: '歇',
    x: 74, y: 42,
    kind: 'judge',
    action: 'rest',
    img: '/assets/scenes/camp_evening.jpg',
  },
  {
    id: 'march',
    label: '东边小路',
    sub: '继续行军 →',
    icon: '行',
    x: 90, y: 46,
    kind: 'march',
  },
];

export const FIRE_SUB = [
  { id: 'talk', label: '找人说话', sub: '改好感与士气', action: 'talk' },
  { id: 'share', label: '分一口粮', sub: '士气 / 信念 / 好感', action: 'share' },
];

export const PATH_ZONES = [
  { id: 'near', label: '抄近路', sub: '贴着亮水洼，快但险', x: 18, y: 48, w: 28, h: 40, score: 0.45 },
  { id: 'steady', label: '绕远走硬地', sub: '慢七里，稳', x: 40, y: 42, w: 24, h: 42, score: 0.85 },
  { id: 'far', label: '沿边缘慢慢磨', sub: '最稳，最耗体力', x: 66, y: 45, w: 28, h: 40, score: 0.7 },
];
