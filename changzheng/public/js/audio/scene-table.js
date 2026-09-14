/**
 * 场景声明表 —— 音频的「声明」层：**一个场景该放什么，只在这里回答一次**。
 *
 * 屏上的代码不再自己拼 kind（原先 `main.js` 有 `ambientFor()`、沙盘里硬编码 `'camp'`），
 * 一律写 `audio.scene(...)`：换场景的写法收敛成一行，**新增场景 = 往这张表加一行**。
 *
 * 约定：
 * - `ambient` / `bgm` 的 kind 必须能在 `channels/ambient.js` 的 `AMBIENT_FILE` 与
 *   `channels/bgm.js` 的 `BGM_FILE` 里找到对应文件；`qa:audio` 会逐条核对（写错 kind 会被拦住）。
 * - `null` = 这一场景不放（标题页安静、沙盘不配乐）。
 * - BGM 文件还没产出时只放环境床，**不报错不阻塞**（决策：BGM 有文件就放，落盘即生效）。
 */

/** 幕 → 声音（营地和过场共用同一套「这一幕在哪儿」） */
export const ACT_SOUNDS = {
  act0: { ambient: 'depart', bgm: 'depart' },
  act1: { ambient: 'xiangjiang', bgm: 'xiangjiang' },
  act2: { ambient: 'zunyi', bgm: 'zunyi' },
  act3: { ambient: 'river', bgm: 'jinsha' },     // 环境床是"急流"，BGM 曲名是 jinsha
  act4: { ambient: 'wind', bgm: null },          // 兜底：第四幕实际按"雪山/草地"分，见 DAY_SOUNDS
  act5: { ambient: 'huining', bgm: 'huining' },
};

/** 第四幕按天分（`dayScenes[].label`） */
export const DAY_SOUNDS = {
  雪山: { ambient: 'snow', bgm: 'snow' },
  草地: { ambient: 'camp', bgm: 'grass' },        // 环境床是营地火（camp），BGM 曲名是 grass
};

/** 独立场景（不挂在幕轴上） */
export const SCENE_SOUNDS = {
  title: { ambient: null, bgm: null },            // 标题页：安静
  sandbox: { ambient: 'camp', bgm: null },        // 自由行军：只铺环境床，不配乐
  luding: { ambient: 'luding', bgm: 'luding' },   // 飞夺泸定桥玩法
  ending: { ambient: null, bgm: 'huining' },      // 终局：只留 BGM
};

/** 幕轴上找不到时的声音（保证任何场景都有底噪，不会"静得可疑"） */
export const FALLBACK_SOUNDS = { ambient: 'wind', bgm: null };

/**
 * 把「场景」解析成 { ambient, bgm }。
 * @param {string|{act?:object, day?:number, label?:string}} spec
 *   - 字符串：SCENE_SOUNDS 里的场景名（`'title'` / `'sandbox'` / `'luding'` / `'ending'`）
 *   - 对象：`{ act, label }`，label 是 `dayScene()` 给的"雪山/草地"这类分日标签（可省）
 */
export function soundsFor(spec) {
  if (typeof spec === 'string') {
    const hit = SCENE_SOUNDS[spec];
    if (hit) return hit;
    console.warn(`[audio] 场景表里没有「${spec}」——可用：${Object.keys(SCENE_SOUNDS).join(' / ')}`);
    return FALLBACK_SOUNDS;
  }
  const { act, label } = spec || {};
  if (label && DAY_SOUNDS[label]) return DAY_SOUNDS[label];
  const hit = act && ACT_SOUNDS[act.id];
  if (hit) return hit;
  if (act) console.warn(`[audio] 幕「${act.id}」不在场景表里，用兜底声音`);
  return FALLBACK_SOUNDS;
}
