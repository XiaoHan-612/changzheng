/**
 * 音效通道（sfx）—— 交互的即时反馈。
 *
 * 一条音效的取用顺序：**同名文件**（`public/audio/sfx/<name>.ogg`，音频模型落盘即生效）
 * → **合成配方**（`sfx-table.js`，永远有条兜底，不会没声）。
 * 名字必须登记在表里；未登记的会告警 + 出通用音（不静默，但也别指望它像样）。
 *
 * 细节：
 * - **懒探测 + 负缓存**：第一次放某条音效时顺手探一次有没有同名文件（不阻塞这次发声，当次用合成音），
 *   探到结果就记住——之后用文件或继续合成，整场只探一次（避免反复 404）。
 * - **节流**：同名音效在 `MIX.sfx.throttleMs` 内不重复播（防连点糊成一片）。
 * - 合成音源计入 `active`（`qa:av` 用它判断"音效链路活着"）。
 */
import { MIX } from '../mix.js';
import { SFX_TABLE, sfxFile } from '../sfx-table.js';

export class SfxChannel {
  constructor(core) {
    this.core = core;
    this.active = 0;                  // 正在响的音源数（play/结束各自增减）
    this.lastAt = new Map();          // 同名节流
    this.present = new Map();         // name → true/false（同名文件在不在；懒探测，只探一次）
    this._warned = new Set();
  }

  playing() { return this.active > 0; }

  describe() {
    return {
      active: this.active,
      names: Object.keys(SFX_TABLE).length,
      withFile: [...this.present.entries()].filter(([, v]) => v).map(([k]) => k),
    };
  }

  /** 静音：音效是瞬时的，停不了也不必停（后续 play 会被 muted 挡住） */
  silence() { /* no-op：sfx 无持续声 */ }

  reconcile() { /* no-op：音效由交互直接触发，不参与 desired/actual */ }

  play(name) {
    if (this.core.muted) return;
    const now = performance.now();
    const last = this.lastAt.get(name) || 0;
    if (now - last < MIX.sfx.throttleMs) return;         // 连点节流
    this.lastAt.set(name, now);

    const entry = SFX_TABLE[name];
    if (!entry) {
      if (!this._warned.has(name)) {
        this._warned.add(name);
        console.warn(`[audio] 未登记的音效名「${name}」——请在 sfx-table.js 里加一条（现有：${Object.keys(SFX_TABLE).join(' / ')}）`);
      }
      this._tone({ freq: 400, dur: 0.08, vol: 0.025, attack: 0.01 });
      return;
    }

    // 已知有文件 → 播文件；已知没有 / 还没探过 → 先合成（零延迟），顺手探一次
    if (this.present.get(name) === true) {
      this._file(name);
      return;
    }
    if (!this.present.has(name)) this._probe(name);
    for (const op of entry.ops) this._op(op);
  }

  /** 探一次同名文件（不阻塞发声） */
  _probe(name) {
    if (this.present.has(name)) return;
    this.present.set(name, false);                       // 先当没有，探到再改（防并发重复探）
    fetch(sfxFile(name), { method: 'HEAD' })
      .then((r) => {
        this.present.set(name, r.ok);
        if (r.ok) console.info(`[audio] 音效「${name}」改用预录文件：${sfxFile(name)}`);
      })
      .catch(() => this.present.set(name, false));
  }

  /** 播预录音效（走元素，音量归混音表管） */
  _file(name) {
    const path = sfxFile(name);
    try {
      const el = new Audio(path);
      el.volume = MIX.sfx.level;
      this.active += 1;
      el.onended = () => { this.active = Math.max(0, this.active - 1); };
      el.onerror = () => {
        this.active = Math.max(0, this.active - 1);
        this.present.set(name, false);                   // 文件坏了：回落到合成配方，别再试它
        console.warn(`[audio] 音效文件播不出来（回落到合成）：${path}`);
      };
      el.play().catch(() => { /* onerror 会兜住 */ });
    } catch {
      const entry = SFX_TABLE[name];
      if (entry) for (const op of entry.ops) this._op(op);
    }
  }

  /** 执行一条合成配方（数据 → 音源） */
  _op(op) {
    const { at = 0, kind } = op;
    if (at > 0) {
      setTimeout(() => { if (!this.core.muted) this._op({ ...op, at: 0 }); }, at);
      return;
    }
    if (kind === 'tone') this._tone(op);
    else if (kind === 'noise') this._noiseHit(op);
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
