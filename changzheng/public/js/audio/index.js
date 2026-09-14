/**
 * 音频门面 —— 全项目**唯一**的音频调用面。
 *
 *   import { audio } from './audio/index.js';
 *
 *   audio.boot();                            // 首次手势解锁 + 挂自愈触发点（import 时已自动挂，可再调）
 *   audio.ambient.play('camp');              // 关键时机①：进屏/换幕（批 2 起改由 audio.scene('camp') 声明）
 *   audio.sfx('click');                      // 关键时机②：交互
 *   await audio.speak({ text, actorId });    // 关键时机③：台词（预置 → TTS 缓存 → 静默）
 *   audio.setMuted(true);                    // 关键时机④：静音开关（取消即按意图恢复）
 *
 * 硬规矩（由 scripts/check-audio.mjs 强制）：`public/js/` 里除 `audio/` 之外，
 * 不许出现 `new Audio(` / `new AudioContext` / `volume =` / `gain.value =`，
 * 也不许再出现旧 API 名（playAmbient / playSfx / setEnabled / stopAmbient）。
 *
 * 结构见 docs/AUDIO-SYSTEM.md：mix（值）→ core + channels（框架）→ scene/sfx 表（声明，批 2/3 落）。
 */
import { AudioCore } from './core.js';
import { AmbientChannel, AMBIENT_FILE } from './channels/ambient.js';
import { SfxChannel, SFX_NAMES } from './channels/sfx.js';
import { VoiceChannel, ACTOR_VOICE } from './channels/voice.js';

export class Audio {
  constructor() {
    this.core = new AudioCore();
    this.ambient = this.core.register('ambient', new AmbientChannel(this.core));
    this.sfxChannel = this.core.register('sfx', new SfxChannel(this.core));
    this.voice = this.core.register('voice', new VoiceChannel(this.core));
    this.core.boot();
  }

  /* ── 门面调用面 ── */

  /** 幂等；import 时已自动挂好监听，显式调用用于"进游戏时再解锁一次" */
  boot() { this.core.boot(); this.core.ensure(); }

  /** 音效：名字见 channels/sfx.js 的 SFX_NAMES（批 3 起提供同名文件覆盖） */
  sfx(name) { this.sfxChannel.play(name); }

  /** 台词：命中顺序 = 预置 wav → TTS 缓存 → 静默 */
  speak(line) { return this.voice.speak(line); }

  /** 游戏内静音（顶栏 🔊）：停声、保留意图，取消即恢复 */
  setMuted(on) { this.core.setMuted(on); }
  get muted() { return this.core.muted; }
  /** 兼容旧读法（旧代码里写的是 audio.enabled） */
  get enabled() { return !this.core.muted; }

  /** ctx 被自动播放策略挂起时的提示回调，由 main.js 注入 toast */
  onSuspended(fn) { this.core._onSuspendedHint = fn; }

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

export { AMBIENT_FILE, SFX_NAMES, ACTOR_VOICE };
