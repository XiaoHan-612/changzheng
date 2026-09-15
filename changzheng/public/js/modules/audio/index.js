/**
 * audio 模块 —— 总线上的第一个 IP：**游戏里所有声音的入口**。
 *
 * 它自己不产生声音：内部还是调用 `public/js/audio/` 那套框架（混音表 / 通道 / 场景声明表 / 静音模型）。
 * 这个模块的职责只有一个：**把总线上的事件翻译成音频框架的调用**，并把音频框架的回执（静音状态、
 * ctx 挂起）翻译回事件。于是：
 *   · 业务代码（main / ui / minigames / flow）再也不用认识音频 API，只发事件；
 *   · "谁在什么时候放了什么声音"在诊断里是一条条事件，能回看；
 *   · 将来加 BGM 之外的通道、加新场景，都只动音频框架与场景表，不动业务。
 *
 * 事件 ↔ 调用 的对应（契约见 kernel/contracts.js）：
 *   flow:act-enter {actId,day,label} → audio.scene({act:{id},label})   幕轴上的场景（含第四幕分日）
 *   scene:enter    {name}            → audio.scene(name)               独立场景 title/luding/ending
 *   sfx:play       {name}            → audio.sfx(name)
 *   voice:say      {text,actorId,…}  → audio.speak({…})
 *   audio:toggle-mute                → audio.setMuted(!muted) → 回执 audio:muted
 *   （audio:suspended 由音频框架的 onSuspended 回调转出：ctx 起不来时提示用户点一下）
 */
import { audio, ACT_SOUNDS, DAY_SOUNDS, SCENE_SOUNDS, SFX_NAMES, BGM_FILE } from '../../audio/index.js';

export default {
  name: 'audio',
  note: '声音总入口：环境床 / BGM / 音效 / 语音（订阅事件，内部走 audio 框架）',
  subscriptions: {
    'flow:act-enter': 'onActEnter',
    'scene:enter': 'onSceneEnter',
    'sfx:play': 'onSfx',
    'voice:say': 'onVoice',
    'audio:toggle-mute': 'onToggleMute',
  },

  api: {
    /** 诊断与体检用：某条通道现在是否真的在响（业务不该用它做逻辑判断） */
    isPlaying: (channel) => audio.isPlaying(channel),
    /** 音频框架的内部状态快照（debug 面板与 qa:av 用） */
    state: () => audio.state(),
    /** 场景表（给"想知道这一幕该放什么"的模块，例如将来的过场/电影模块） */
    scenes: () => ({ ACT_SOUNDS, DAY_SOUNDS, SCENE_SOUNDS, BGM_FILE, sfx: SFX_NAMES }),
  },

  init(kernel) {
    this.kernel = kernel;
  },

  ready(kernel) {
    // ctx 被自动播放策略挂起：音频框架给回调，这里转成事件，由 UI 决定怎么提示
    // （以前是 main.js 注入 toast 回调用，那条"手工通道"就此取消）
    audio.onSuspended((message) => kernel.emit('audio:suspended', { message }));
  },

  /** 幕轴上的场景：进营地/换幕时发（第四幕按天带 label：雪山 / 草地） */
  onActEnter(p) {
    // 场景表要的是 { act, label }：act 只用到 id，label 用来区分第四幕的两天
    audio.scene({ act: { id: p.actId }, label: p.label });
  },

  onSceneEnter(p) {
    audio.scene(p.name);
  },

  onSfx(p) {
    audio.sfx(p.name);
  },

  onVoice(p) {
    audio.speak({ text: p.text, actorId: p.actorId, voiceId: p.voiceId, file: p.file }).catch(() => {});
  },

  onToggleMute() {
    audio.setMuted(!audio.muted);
    // 回执：UI 据此更新图标与提示（状态只在这里持有，UI 不自己记）
    this.kernel.emit('audio:muted', { on: audio.muted });
  },
};
