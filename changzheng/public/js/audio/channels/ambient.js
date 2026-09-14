/**
 * 环境床通道（ambient）—— 进场景时铺一层底噪。
 *
 * 回退链：`public/audio/ambient/<kind>.ogg` → 同名 `.wav` → **合成兜底**（WebAudio 现场合成）。
 * 前两级是音频模型产出的真素材（落盘即生效），第三级保证"缺素材也不哑"——
 * 但它是**可见状态**：`qa:audio` 会把正在兜底的 kind 显式列出来，不允许静默降级。
 *
 * 生命周期规矩（坑 #2/#3）：通道内只有一个 current 句柄；换源前必先停旧句柄（防叠音）；
 * 合成兜底的循环定时器由本通道持有，stop 时一并清掉。
 */
import { MIX } from '../mix.js';
import { fadeElement, cancelFade } from '../fade.js';

/** 环境床文件映射（音频模型按 docs/HANDOFF-AUDIO.md 的表把文件放进 public/audio/ambient/） */
export const AMBIENT_FILE = {
  depart: '/audio/ambient/depart_river.ogg',
  xiangjiang: '/audio/ambient/xiangjiang_wind.ogg',
  zunyi: '/audio/ambient/zunyi_rain.ogg',
  river: '/audio/ambient/jinsha_rapids.ogg',
  luding: '/audio/ambient/luding_iron.ogg',
  snow: '/audio/ambient/snow_wind.ogg',
  camp: '/audio/ambient/grass_fire.ogg',
  huining: '/audio/ambient/huining_low.ogg',
  wind: '/audio/ambient/wind.ogg',        // 兜底场景的通用风床（未产出时走合成兜底，qa:audio 会列出）
};

function noiseBuffer(ctx, seconds = 2) {
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

export class AmbientChannel {
  constructor(core) {
    this.core = core;
    this.ducked = false;
    this.el = null;          // 文件版：current <audio>
    this.nodes = [];         // 合成版：current 节点
    this.current = null;     // 现在在响的 kind（actual）
    this.timers = [];        // 合成版的循环定时器（stop 时清）
    this._fell = false;      // 本次起播是否已回落过（只回落一次）
  }

  /* ── 门面用的三个入口 ── */
  play(kind) { this.core.desire('ambient', kind); }
  stop() { this.core.desire('ambient', null); }

  /** 静音：停声，但意图留在 core.desired 里（取消静音时 reconcile 会接回来） */
  silence() { this._stopSound(); }

  playing() {
    if (this.el) return !this.el.paused && !this.el.ended;
    return this.nodes.length > 0 && this.current != null;
  }

  describe() {
    return {
      kind: this.current,
      src: this.el ? this.el.src.split('/').pop() : (this.nodes.length ? 'synth' : null),
      playing: this.playing(),
      volume: this.el ? +this.el.volume.toFixed(3) : null,
      ducked: this.ducked,
    };
  }

  /** 语音在播时轻闪避（让台词更清楚），结束回位 */
  duck(on) {
    this.ducked = !!on;
    if (this.el) fadeElement(this.el, MIX.ambient.level * (this.ducked ? MIX.voice.duckAmbient : 1), MIX.ambient.fadeOutMs);
  }

  /** 让 actual 追上 desired：该起的起、该停的停 */
  reconcile(kind) {
    if (!kind) { this._stopSound(); return; }
    if (this.current === kind && this.playing()) return;   // 已经在响同一条，别重起
    this._stopSound();
    this.current = kind;
    this._fell = false;
    const file = AMBIENT_FILE[kind];
    if (file) this._playFile(kind, file, false);
    else this._playSynth(kind);
  }

  /* ── 文件版 ── */
  _playFile(kind, file, isAlt) {
    try {
      const fallback = () => {
        if (this._fell) return;                       // 只回落一次，避免合成链生成两份
        this._fell = true;
        if (this.core.desired.ambient !== kind) return;   // 期间已经切走了
        this._stopSound();                            // 换源前停旧的：否则旧元素成孤儿、两条床叠着响
        this.current = kind;
        if (!isAlt && /\.ogg$/.test(file)) { this._playFile(kind, file.replace(/\.ogg$/, '.wav'), true); return; }
        if (MIX.ambient.allowSynthFallback) this._playSynth(kind);
      };
      const el = new Audio(file);
      el.loop = true;
      el.volume = 0;                                  // 起播淡入（切场景不会"啪"地一声）
      this.el = el;
      el.onerror = fallback;
      // 被外部暂停（浏览器切后台 / 系统休眠）→ 稍后自愈；我们自己静音停的不算（core.muted 时不触发）
      el.addEventListener('pause', () => {
        if (!this.core.muted && this.core.desired.ambient === kind) this.core.reconcile();
      });
      el.play()
        .then(() => fadeElement(el, MIX.ambient.level * (this.ducked ? MIX.voice.duckAmbient : 1), MIX.ambient.fadeInMs))
        .catch(fallback);
      // 文件 404 时部分浏览器不触发 error，用 fetch 兜一次
      fetch(file, { method: 'HEAD' })
        .then((r) => { if (!r.ok) fallback(); })
        .catch(fallback);
    } catch {
      if (MIX.ambient.allowSynthFallback) this._playSynth(kind);
    }
  }

  /* ── 合成版（兜底；参数是"音色"，不是混音，所以留在这里） ── */
  _playSynth(kind) {
    const ctx = this.core.ensure();
    if (!ctx) return;
    this.current = kind;
    const params = {
      camp: { cut: 420, level: 0.09, lfo: 0.07, crackle: true },
      fire: { cut: 500, level: 0.1, lfo: 0.09, crackle: true },
      river: { cut: 700, level: 0.11, lfo: 0.12, shimmer: 90 },
      snow: { cut: 280, level: 0.1, lfo: 0.05 },
      wind: { cut: 360, level: 0.08, lfo: 0.04 },
      night: { cut: 240, level: 0.07, lfo: 0.03, cricket: true },
      gorge: { cut: 300, level: 0.08, lfo: 0.06 },
      xiangjiang: { cut: 320, level: 0.09, lfo: 0.05 },
      zunyi: { cut: 260, level: 0.07, lfo: 0.03, cricket: true },
      huining: { cut: 400, level: 0.08, lfo: 0.06 },
    }[kind] || { cut: 360, level: 0.08, lfo: 0.05 };

    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.core.buses.ambient);
    g.gain.linearRampToValueAtTime(params.level, ctx.currentTime + MIX.ambient.synthRampMs / 1000);
    this.nodes.push(g);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 3);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = params.cut;
    lp.Q.value = 0.6;
    src.connect(lp);
    lp.connect(g);
    src.start();
    this.nodes.push(src);

    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = params.lfo;
    lg.gain.value = params.level * 0.35;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start();
    this.nodes.push(lfo);

    if (params.shimmer) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = params.shimmer;
      og.gain.value = 0.012;
      const mod = ctx.createOscillator();
      const mg = ctx.createGain();
      mod.frequency.value = 0.15;
      mg.gain.value = 25;
      mod.connect(mg);
      mg.connect(o.frequency);
      o.connect(og);
      og.connect(g);
      o.start();
      mod.start();
      this.nodes.push(o, mod);
    }

    if (params.crackle) this._scheduleCrackle(kind, g);
    if (params.cricket) this._scheduleCricket(g);
  }

  _scheduleCrackle(kind, dest) {
    const ctx = this.core.ctx;
    const tick = () => {
      if (this.core.muted || this.current !== kind) return;   // 停/切走即不再排下一次（循环自然终止）
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = 'triangle';
      o.frequency.value = 900 + Math.random() * 1800;
      f.type = 'bandpass';
      f.frequency.value = 1200 + Math.random() * 800;
      f.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.03, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06 + Math.random() * 0.08);
      o.connect(f);
      f.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + 0.2);
      const id = setTimeout(tick, 400 + Math.random() * 1400);
      this.timers.push(id);
    };
    this.timers.push(setTimeout(tick, 600));
  }

  _scheduleCricket(dest) {
    const ctx = this.core.ctx;
    const tick = () => {
      if (this.core.muted || this.current !== 'night') return;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 4200 + Math.random() * 400;
        g.gain.setValueAtTime(0.0001, t + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.008, t + i * 0.06 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.04);
        o.connect(g);
        g.connect(dest);
        o.start(t + i * 0.06);
        o.stop(t + i * 0.06 + 0.08);
      }
      const id = setTimeout(tick, 1800 + Math.random() * 2500);
      this.timers.push(id);
    };
    this.timers.push(setTimeout(tick, 1200));
  }

  /** 停掉当前声音（不动意图）；清定时器、断节点、停元素 */
  _stopSound() {
    if (this.el) {
      cancelFade(this.el);
      try { this.el.pause(); this.el.currentTime = 0; } catch { /* ignore */ }
      this.el = null;
    }
    for (const n of this.nodes) {
      try { n.stop?.(); n.disconnect?.(); } catch { /* ignore */ }
    }
    this.nodes = [];
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
    this.current = null;
  }
}
