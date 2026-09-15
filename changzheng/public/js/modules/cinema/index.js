/**
 * cinema 模块 —— **电影化三处**（序章 / 幕间过渡 / 终局升华）的总入口。
 *
 * 它只做一件事：把"演一段"这件事从流程层手里接过来，做成一个**可复用的播放器**。
 * 以前 `flow/act.js` 的 `runCutscene` 就是全部的"电影化"：切屏 + 逐字 + 点按推进三件事
 * 混在一个函数里，于是换幕与演开场是同一段代码，谁也不敢改；而终局那首诗连落脚点都没有。
 *
 * 分工（依赖方向单向，别绕回去）：
 *   flow/*（业务）  --api.play(id)-->  cinema（本模块）
 *   cinema          --事件-->          audio（voice:say / voice:stop）+ screens（own 屏自清）
 *   cinema          --读数据-->        /api/data/{acts,poem}（与业务读的是同一份数据）
 * 所以：**模块不认识流程，流程也不认识拍子**——加一处电影化 = sequences.js 加一条编排。
 *
 * 事件面（契约见 kernel/contracts.js）：
 *   订阅 voice:start / voice:progress / voice:ended → 音画同步（等这句念完再走；终章的诗逐字跟进度）
 *   发出 voice:say / voice:stop     → 配音交给 audio 模块去放（cinema 不碰音频门面）
 */
import { play, clearCutscene, current, voiceLive, onVoiceStart, onVoiceProgress, onVoiceEnd } from './player.js';
import { SEQUENCE_IDS } from './sequences.js';
import { BEAT_KINDS } from './beats.js';

export default {
  name: 'cinema',
  note: '电影化：拍子播放器（题字/路线图/空镜/诗/钤印），序章、幕间、终章升华共用一套拍子',
  requires: ['screens'],

  subscriptions: {
    'voice:start': 'onVoiceStart',
    'voice:progress': 'onVoiceProgress',
    'voice:ended': 'onVoiceEnd',
  },

  api: {
    /**
     * 演一段。**流程层唯一的电影化入口**。
     * @param {string} id 编排 id（`sequences.js`：prologue-open / prologue-farewell / …）
     * @param {{ctx?: object}} [opts] ctx 透给拍子（如幕次、幕名）
     */
    play: (id, opts) => play(id, opts),
    /** 有哪些编排、有哪些拍子（体检与文档对账用） */
    sequences: () => [...SEQUENCE_IDS],
    kinds: () => [...BEAT_KINDS],
    /** 正在播哪一条（'' = 没在播） */
    current: () => current(),
    /** 语音通道此刻在播吗（音画同步的调试与体检用） */
    voiceLive: () => voiceLive(),
  },

  /** 过场屏归本模块：离开时只清自己写进去的东西（屏自清契约，见 modules/screens） */
  init(kernel) {
    const screens = kernel.api('screens');
    if (screens?.own) screens.own('screen-cutscene', clearCutscene);
  },

  onVoiceStart(p) { onVoiceStart(p); },
  onVoiceProgress(p) { onVoiceProgress(p); },
  onVoiceEnd() { onVoiceEnd(); },
};
