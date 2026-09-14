/**
 * 音效通道（sfx）—— 交互的即时反馈。
 *
 * 现状：全部由 WebAudio 现场合成（`_tone` / `_noiseHit` 两种配方组合）。
 * 批 3 会把这张 switch 换成**注册表**：一条音效 = 一条配方，或同名文件覆盖（预录后落盘即生效）。
 * 到那时"新增音效"就只是表里加一行 —— 这就是框架要留的扩展位（见 docs/AUDIO-SYSTEM.md §七）。
 *
 * 规矩：未知名字**不再静默**——控制台告警 + 仍出一个通用音（不能没声），由 qa:audio 列出。
 */
import { MIX } from '../mix.js';

export const SFX_NAMES = ['click', 'cast', 'hook', 'splash', 'echo', 'correct', 'wrong', 'march', 'day'];

export class SfxChannel {
  constructor(core) {
    this.core = core;
    this.active = 0;                  // 正在响的音源数（play/结束各自增减）
    this.lastAt = new Map();          // 同名节流
    this._warned = new Set();
  }

  playing() { return this.active > 0; }

  describe() { return { active: this.active, names: SFX_NAMES.length }; }

  /** 静音：音效是瞬时的，停不了也不必停；正在排队的下一拍由 enabled 判断自然不再播 */
  silence() { /* no-op：sfx 无持续声 */ }

  reconcile() { /* no-op：音效不参与 desired/actual（它由交互直接触发） */ }

  play(name) {
    if (this.core.muted) return;
    const now = performance.now();
    const last = this.lastAt.get(name) || 0;
    if (now - last < MIX.sfx.throttleMs) return;      // 连点节流（防糊成一片）
    this.lastAt.set(name, now);
    switch (name) {
      case 'click': this._noiseHit({ dur: 0.04, vol: 0.035, cut: 1800, q: 2 }); break;
      case 'cast':
        this._noiseHit({ dur: 0.18, vol: 0.03, cut: 2400, q: 0.8 });
        setTimeout(() => this._noiseHit({ dur: 0.25, vol: 0.055, cut: 350, type: 'lowpass' }), 90);
        this._tone({ freq: 140, dur: 0.2, vol: 0.035, attack: 0.03 });
        break;
      case 'hook':
        this._tone({ freq: 280, dur: 0.12, vol: 0.045, attack: 0.01, type: 'triangle' });
        this._tone({ freq: 420, dur: 0.18, vol: 0.035, attack: 0.02, detune: 6 });
        break;
      case 'splash': this._noiseHit({ dur: 0.35, vol: 0.06, cut: 500, type: 'lowpass' }); break;
      case 'echo':
        this._tone({ freq: 196, dur: 0.7, vol: 0.055, attack: 0.04, type: 'sine' });
        this._tone({ freq: 294, dur: 0.9, vol: 0.03, attack: 0.08, detune: -4 });
        break;
      case 'correct':
        this._tone({ freq: 392, dur: 0.35, vol: 0.045, attack: 0.03 });
        this._tone({ freq: 587, dur: 0.55, vol: 0.035, attack: 0.08 });
        break;
      case 'wrong': this._tone({ freq: 160, dur: 0.4, vol: 0.04, attack: 0.04, type: 'triangle' }); break;
      case 'march':
        [0, 140, 290].forEach((d, i) => {
          setTimeout(() => {
            this._noiseHit({ dur: 0.07, vol: 0.03 - i * 0.005, cut: 220 - i * 30, type: 'lowpass' });
            this._tone({ freq: 90 - i * 8, dur: 0.1, vol: 0.025 - i * 0.004, attack: 0.01 });
          }, d);
        });
        break;
      case 'day':
        this._noiseHit({ dur: 0.5, vol: 0.028, cut: 600, type: 'lowpass' });
        this._tone({ freq: 330, dur: 0.6, vol: 0.035, attack: 0.06 });
        break;
      default:
        // 未知名字：不静默（仍出通用音，不能没声），但必须出声告警 + 由 qa:audio 列出
        if (!this._warned.has(name)) {
          this._warned.add(name);
          console.warn(`[audio] 未注册的音效名「${name}」——请在 sfx 通道里登记（可用项：${SFX_NAMES.join(' / ')}）`);
        }
        this._tone({ freq: 400, dur: 0.08, vol: 0.025, attack: 0.01 });
    }
  }

  _tone({ freq, dur = 0.25, type = 'sine', vol = 0.08, attack = 0.02, detune = 0 }) {
    if (this.core.muted) return;
    const ctx = this.core.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    f.type = 'lowpass';
    f.frequency.value = Math.min(4000, freq * 4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.core.buses.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
    this._track(o);
  }

  _noiseHit({ dur = 0.15, vol = 0.05, cut = 800, type = 'bandpass', q = 1 }) {
    if (this.core.muted) return;
    const ctx = this.core.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noise(ctx, 0.3);
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = type;
    f.frequency.value = cut;
    f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.core.buses.sfx);
    src.start(t);
    src.stop(t + dur + 0.05);
    this._track(src);
  }

  _track(node) {
    this.active += 1;
    node.onended = () => { this.active = Math.max(0, this.active - 1); };
  }

  _noise(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }
}
