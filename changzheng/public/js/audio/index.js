/**
 * 音频门面 —— 全项目**唯一**的音频调用面。
 *
 *   import { audio } from './audio/index.js';
 *
 *   audio.boot();                            // 首次手势解锁 + 挂自愈触发点（import 时已自动挂，可再调）
 *   audio.scene({ act, label });             // 关键时机①：进屏/换幕（按声明表起停环境床与 BGM）
 *   audio.scene('title' | 'luding' | 'ending')   // 不在幕轴上的独立场景
 *   audio.sfx('click');                      // 关键时机②：交互（名字见 sfx-table.js；同名文件落盘即覆盖合成音）
 *   await audio.speak({ text, actorId });    // 关键时机③：台词（预置 → TTS 缓存 → 静默）
 *   audio.voiceStop();                       // 关键时机③b：停当前台词（跳过时连音频一起停）
 *   audio.setMuted(true);                    // 关键时机④：静音开关（取消即按意图恢复）
 *
 * 语音的"回声"（开播/进度/收尾）不是回头去问门面，而是 `modules/audio` 把它转成
 * `voice:start / voice:progress / voice:ended` 事件——逐字跟读就是订阅这三条做的（见 kernel/contracts.js）。
 *
 * 硬规矩（由 scripts/check-audio.mjs 强制）：`public/js/` 里除 `audio/` 之外，
 * 不许出现 `new Audio(` / `new AudioContext` / `volume =` / `gain.value =`，
 * 也不许再出现旧 API 名（playAmbient / playSfx / setEnabled / stopAmbient）。
 *
 * 结构见 docs/AUDIO-SYSTEM.md：mix（值）→ core + channels（框架）→ scene/sfx 表（声明，批 2/3 落）。
 */
import { AudioCore } from './core.js';
import { MIX } from './mix.js';
import { AmbientChannel, AMBIENT_FILE } from './channels/ambient.js';
import { BgmChannel, BGM_FILE } from './channels/bgm.js';
import { SfxChannel } from './channels/sfx.js';
import { SFX_TABLE, SFX_NAMES, sfxFile } from './sfx-table.js';
import { VoiceChannel, ACTOR_VOICE, DEFAULT_VOICE } from './channels/voice.js';
import { ACT_SOUNDS, DAY_SOUNDS, SCENE_SOUNDS, FALLBACK_SOUNDS, soundsFor } from './scene-table.js';

export class Audio {
  constructor() {
    this.core = new AudioCore();
    this.ambient = this.core.register('ambient', new AmbientChannel(this.core));
    this.bgm = this.core.register('bgm', new BgmChannel(this.core));
    this.sfxChannel = this.core.register('sfx', new SfxChannel(this.core));
    this.voice = this.core.register('voice', new VoiceChannel(this.core));
    this.core.boot();
  }

  /* ── 门面调用面 ── */

  /** 幂等；import 时已自动挂好监听，显式调用用于"进游戏时再解锁一次" */
  boot() { this.core.boot(); this.core.ensure(); }

  /**
   * 切场景：按声明表（scene-table.js）起停环境床与 BGM。
   * @param {string|{act?:object, day?:number, label?:string}} spec
   */
  scene(spec) {
    const s = soundsFor(spec);
    this.core.desire('ambient', s.ambient);
    this.core.desire('bgm', s.bgm);
  }

  /** 音效：名字见 channels/sfx.js 的 SFX_NAMES（批 3 起提供同名文件覆盖） */
  sfx(name) { this.sfxChannel.play(name); }

  /** 台词：命中顺序 = 预置 wav → TTS 缓存 → 静默 */
  speak(line) { return this.voice.speak(line); }
  /** 停当前台词（终局升华的"跳过"：一跳到底要连音频一起停）；没在播时无副作用 */
  voiceStop() { this.voice.stop(); }
  /** 语音通道状态快照（cinema 播放器与体检读它；业务别拿它做逻辑判断，那是事件的活） */
  voiceState() { return this.voice.describe(); }
  /** 可选语速档位（终局升华的 1x/1.5x）——值在 mix.js，别在业务里再抄一份 */
  voiceRates() { return MIX.voice.rates.slice(); }

  /**
   * 量一条音频的**真实时长**（ms）；拿不到就返回 0，绝不抛错、绝不阻塞。
   *
   * 为什么归门面：`new Audio(...)` 只有音频框架能碰（qa:audio 的框架一致性守卫按这条查）。
   * 目前只有终局升华用它——朗诵文件若比 `data/poem.json` 标定的时间轴更长，
   * 逐字就要按真实长度拉长，否则收尾的 `voice:stop` 会在朗读没完时掐断（用户反馈过）。
   * 只读 metadata：不占通道、不进混音、不改任何播放状态。
   */
  durationOf(url, timeoutMs = 4000) {
    return new Promise((resolve) => {
      if (!url || typeof document === 'undefined') { resolve(0); return; }
      const el = new Audio();
      let done = false;
      const fin = (ms) => {
        if (done) return;
        done = true;
        el.onloadedmetadata = null;
        el.onerror = null;
        try { el.src = ''; } catch { /* 已释放 */ }
        resolve(ms);
      };
      el.preload = 'metadata';
      el.onloadedmetadata = () => fin(Math.round((Number(el.duration) || 0) * 1000));
      el.onerror = () => fin(0);
      setTimeout(() => fin(0), timeoutMs);
      el.src = url;
    });
  }

  /** 游戏内静音（顶栏 🔊）：停声、保留意图，取消即恢复 */
  setMuted(on) { this.core.setMuted(on); }
  get muted() { return this.core.muted; }
  /** 兼容旧读法（旧代码里写的是 audio.enabled） */
  get enabled() { return !this.core.muted; }

  /** ctx 被自动播放策略挂起时的提示回调，由 main.js 注入 toast */
  onSuspended(fn) { this.core._onSuspendedHint = fn; }

  /**
   * 语音回声的出口：把框架内发生的事（`voice:start/progress/ended`）交给总线。
   * 由 `modules/audio` 在 ready 时接线——**通道不认识总线**，回执只能从这一个口出。
   * （漏接这行的症状很隐蔽：声音照响，只是没人收得到开播/进度/收尾，逐字跟读永远不动。）
   */
  onReport(fn) { this.core.onReport(fn); }

  /* ── 查询与调试（测试、体检、现场排查用） ── */
  isPlaying(name) { return this.core.isPlaying(name); }
  state() { return this.core.state(); }
}

export const audio = new Audio();

// import 即自动挂好自愈与解锁监听（与旧实现等价：不需要任何调用点配合）
audio.boot();

// 调试句柄：声音出问题时控制台敲 __czAudio.state() 一眼看清
// （muted / ctx / desired 该响什么 / actual 现在在响什么）
window.__czAudio = audio;

export { AMBIENT_FILE, BGM_FILE, SFX_TABLE, SFX_NAMES, sfxFile, ACTOR_VOICE, DEFAULT_VOICE };
export { ACT_SOUNDS, DAY_SOUNDS, SCENE_SOUNDS, FALLBACK_SOUNDS, soundsFor };
