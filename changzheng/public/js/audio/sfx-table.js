/**
 * 音效注册表 —— 音频的「声明」层（音效部分）。
 *
 * 一条音效 = **一条配方**（本地合成）或 **一个同名文件**（预录）。规矩：
 * - 想让音频模型补预录：把文件按名字放进 `public/audio/sfx/<name>.ogg`（或 .wav）即可
 *   **落盘即生效、无需改这张表**——通道按命名约定去找文件，找到了就用文件，找不到才合成。
 * - 想新增音效：在这里加一条 `{ ops: [...] }`，然后 `audio.sfx('新名字')` 就能用；
 *   未登记的会被拦（控制台告警 + 出通用音），不会静默无声。
 *
 * ops（配方）是**纯数据**，按顺序执行，`at` 是相对开始的毫秒延迟（0 可省）：
 *   { kind: 'tone',  freq, dur, vol, attack, type, detune, at? }
 *   { kind: 'noise', dur, vol, cut, type, q, at? }
 * 音量这些数字是**音色**（每个音自己的相对量），不是混音——混音只在 `mix.js` 里。
 */

/** 行军的鼓点：原先是 forEach 里按 i 递推（vol/cut/freq 逐拍衰减），这里展开成三条，读数更直白 */
const marchBeats = [
  { at: 0, vol: 0.030, cut: 220, freq: 90 },
  { at: 140, vol: 0.025, cut: 190, freq: 82 },
  { at: 290, vol: 0.020, cut: 160, freq: 74 },
].flatMap((b) => [
  { kind: 'noise', at: b.at, dur: 0.07, vol: b.vol, cut: b.cut, type: 'lowpass' },
  { kind: 'tone', at: b.at, freq: b.freq, dur: 0.1, vol: b.vol * 0.83, attack: 0.01 },
]);

export const SFX_TABLE = {
  // 交互轻响：点击、翻页
  click: { desc: '点一下', ops: [{ kind: 'noise', dur: 0.04, vol: 0.035, cut: 1800, q: 2 }] },

  // 钓鱼：抛竿入水（两段水花 + 一记低音）
  cast: {
    desc: '抛竿入水',
    ops: [
      { kind: 'noise', dur: 0.18, vol: 0.03, cut: 2400, q: 0.8 },
      { kind: 'noise', at: 90, dur: 0.25, vol: 0.055, cut: 350, type: 'lowpass' },
      { kind: 'tone', freq: 140, dur: 0.2, vol: 0.035, attack: 0.03 },
    ],
  },

  // 钓鱼：起竿（两记短音，一高一低）
  hook: {
    desc: '起竿',
    ops: [
      { kind: 'tone', freq: 280, dur: 0.12, vol: 0.045, attack: 0.01, type: 'triangle' },
      { kind: 'tone', freq: 420, dur: 0.18, vol: 0.035, attack: 0.02, detune: 6 },
    ],
  },

  splash: { desc: '入水', ops: [{ kind: 'noise', dur: 0.35, vol: 0.06, cut: 500, type: 'lowpass' }] },

  // 史实回响的盖章：一声沉、一声远
  echo: {
    desc: '回响盖章',
    ops: [
      { kind: 'tone', freq: 196, dur: 0.7, vol: 0.055, attack: 0.04, type: 'sine' },
      { kind: 'tone', freq: 294, dur: 0.9, vol: 0.03, attack: 0.08, detune: -4 },
    ],
  },

  correct: {
    desc: '答对',
    ops: [
      { kind: 'tone', freq: 392, dur: 0.35, vol: 0.045, attack: 0.03 },
      { kind: 'tone', freq: 587, dur: 0.55, vol: 0.035, attack: 0.08 },
    ],
  },

  wrong: { desc: '答错', ops: [{ kind: 'tone', freq: 160, dur: 0.4, vol: 0.04, attack: 0.04, type: 'triangle' }] },

  march: { desc: '行军鼓点', ops: marchBeats },

  day: {
    desc: '新的一日',
    ops: [
      { kind: 'noise', dur: 0.5, vol: 0.028, cut: 600, type: 'lowpass' },
      { kind: 'tone', freq: 330, dur: 0.6, vol: 0.035, attack: 0.06 },
    ],
  },
};

/** 全部音效名（门面导出给体检与调试用） */
export const SFX_NAMES = Object.keys(SFX_TABLE);

/** 预录音效的落盘约定：`public/audio/sfx/<name>.ogg`（放进去就自动顶替合成音） */
export const sfxFile = (name) => `/audio/sfx/${name}.ogg`;
