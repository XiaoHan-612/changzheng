/**
 * 音频：环境床 + 质感音效 + 预制台词语音
 * 规则：只播 public/audio/voices 预生成 wav；大模型自由回复不播语音。
 */

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

/**
 * 环境床文件映射（音频模型按 docs/HANDOFF-AUDIO.md 的表把 ogg 放进
 * public/audio/ambient/，落盘即生效；没有就用 WebAudio 合成兜底）。
 */
const AMBIENT_FILE = {
  depart: '/audio/ambient/depart_river.ogg',
  xiangjiang: '/audio/ambient/xiangjiang_wind.ogg',
  zunyi: '/audio/ambient/zunyi_rain.ogg',
  river: '/audio/ambient/jinsha_rapids.ogg',
  luding: '/audio/ambient/luding_iron.ogg',
  snow: '/audio/ambient/snow_wind.ogg',
  camp: '/audio/ambient/grass_fire.ogg',
  huining: '/audio/ambient/huining_low.ogg',
};

class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.ambientGain = null;
    this.sfxGain = null;
    this.voiceGain = null;
    this.ambientNodes = [];
    this.currentAmbient = null;
    this.voiceEl = null;
    this.catalog = null;
    this.catalogPromise = null;
    this._cache = new Map();
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.75;
      this.master.connect(this.ctx.destination);
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.8;
      this.ambientGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.85;
      this.sfxGain.connect(this.master);
      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = 1.0;
      this.voiceGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on) {
      this.stopAmbient();
      this.stopVoice();
    }
  }

  async loadCatalog() {
    if (Array.isArray(this.catalog)) return this.catalog;
    if (!this.catalogPromise) {
      this.catalogPromise = fetch('/audio/voice-lines.json')
        .then((r) => (r.ok ? r.json() : { lines: [] }))
        .then((j) => {
          this.catalog = Array.isArray(j) ? j : Array.isArray(j?.lines) ? j.lines : [];
          return this.catalog;
        })
        .catch(() => {
          this.catalog = [];
          return this.catalog;
        });
    }
    this.catalog = await this.catalogPromise;
    return Array.isArray(this.catalog) ? this.catalog : [];
  }

  /** 仅预置台词：按 id 或关键词命中；自由文本返回 null */
  async findLine(text, voiceId) {
    const lines = await this.loadCatalog();
    if (!Array.isArray(lines) || !lines.length) return null;
    if (voiceId) {
      const hit = lines.find((l) => l && l.id === voiceId);
      if (hit) return hit;
    }
    if (!text) return null;
    const t = String(text).replace(/\s/g, '');
    for (const l of lines) {
      if (!l || !Array.isArray(l.match)) continue;
      if (l.match.some((m) => t.includes(String(m).replace(/\s/g, '')))) return l;
    }
    return null;
  }

  stopVoice() {
    if (this.voiceEl) {
      try {
        this.voiceEl.pause();
        this.voiceEl.currentTime = 0;
      } catch { /* ignore */ }
      this.voiceEl = null;
    }
  }

  /**
   * 播预置语音。无匹配文件则静默返回（不调用浏览器 TTS）。
   * @param {string} text
   * @param {string} [voiceId] 强制指定预置 id
   */
  /** 播一个音频文件，返回 Promise（被打断/出错都会 resolve） */
  _playFile(file) {
    this.ensure();
    this.stopVoice();
    return new Promise((resolve) => {
      const el = new Audio(file);
      el.volume = 0.95;
      this.voiceEl = el;
      const done = () => {
        if (this.voiceEl === el) this.voiceEl = null;
        resolve();
      };
      el.onended = done;
      el.onerror = done;
      el.play().catch(done);
      setTimeout(done, 12000);
    });
  }

  /** 查 TTS 缓存：命中返回 url，未命中返回 null（不阻塞流程） */
  async _cachedTts(text, voiceId) {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId, actorId: voiceId }),
      });
      if (!res.ok) return null;
      const j = await res.json();
      return j?.url || null;
    } catch {
      return null;
    }
  }

  /**
   * 播语音。支持 speak({text, voiceId, actorId}) 或 speak(text, actorId, voiceId)。
   * 命中顺序：预置 wav → TTS 缓存 → 静默（策划案 §2.6.2）。
   */
  async speak(text, actorId, voiceId) {
    if (text && typeof text === 'object') {
      ({ text, actorId, voiceId } = text);
    }
    if (!this.enabled) return;
    try {
      const line = await this.findLine(text, voiceId);
      if (line?.file) return await this._playFile(line.file);
      if (text) {
        const url = await this._cachedTts(text, voiceId || actorId || 'narr');
        if (url) return await this._playFile(url);
      }
    } catch {
      /* 静默降级 */
    }
  }

  stopAmbient() {
    if (this.ambientEl) {
      try {
        this.ambientEl.pause();
        this.ambientEl.currentTime = 0;
      } catch { /* ignore */ }
      this.ambientEl = null;
    }
    for (const n of this.ambientNodes) {
      try { n.stop?.(); n.disconnect?.(); } catch { /* ignore */ }
    }
    this.ambientNodes = [];
    this.currentAmbient = null;
  }

  playAmbient(kind) {
    if (!this.enabled) return;
    if (this.currentAmbient === kind) return;
    this.stopAmbient();
    this.currentAmbient = kind;
    if (!kind || kind === 'none') return;
    // 优先用 public/audio/ambient/<file>.ogg（音频模型产出的真实环境床）；
    // 文件不存在/播放失败 → 回落到 WebAudio 实时合成，流程不受影响。
    const file = AMBIENT_FILE[kind];
    if (file) {
      this._playAmbientFile(kind, file);
      return;
    }
    this._playAmbientSynth(kind);
  }

  /** 音频文件版环境床：循环播放，失败自动回落合成 */
  _playAmbientFile(kind, file) {
    try {
      let fell = false;
      const fallback = () => {
        if (fell) return;          // 只回落一次，避免合成链生成两份
        fell = true;
        if (this.currentAmbient !== kind) return;
        this.ambientEl = null;
        this._playAmbientSynth(kind);
      };
      const el = new Audio(file);
      el.loop = true;
      el.volume = 0.32;
      this.ambientEl = el;
      el.onerror = fallback;
      el.play().catch(fallback);
      // 文件 404 时部分浏览器不触发 error，用 fetch 兜一次
      fetch(file, { method: 'HEAD' })
        .then((r) => { if (!r.ok) fallback(); })
        .catch(fallback);
    } catch {
      this._playAmbientSynth(kind);
    }
  }

  _playAmbientSynth(kind) {
    const ctx = this.ensure();
    if (!ctx) return;

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
    g.connect(this.ambientGain);
    g.gain.linearRampToValueAtTime(params.level, ctx.currentTime + 1.8);
    this.ambientNodes.push(g);

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
    this.ambientNodes.push(src);

    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = params.lfo;
    lg.gain.value = params.level * 0.35;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start();
    this.ambientNodes.push(lfo);

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
      this.ambientNodes.push(o, mod);
    }

    if (params.crackle) this._scheduleCrackle(kind, g);
    if (params.cricket) this._scheduleCricket(g);
  }

  _scheduleCrackle(kind, dest) {
    const ctx = this.ctx;
    const tick = () => {
      if (!this.enabled || this.currentAmbient !== kind) return;
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
      setTimeout(tick, 400 + Math.random() * 1400);
    };
    setTimeout(tick, 600);
  }

  _scheduleCricket(dest) {
    const ctx = this.ctx;
    const tick = () => {
      if (!this.enabled || this.currentAmbient !== 'night') return;
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
      setTimeout(tick, 1800 + Math.random() * 2500);
    };
    setTimeout(tick, 1200);
  }

  _tone({ freq, dur = 0.25, type = 'sine', vol = 0.08, attack = 0.02, detune = 0 }) {
    if (!this.enabled) return;
    const ctx = this.ensure();
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
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noiseHit({ dur = 0.15, vol = 0.05, cut = 800, type = 'bandpass', q = 1 }) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.3);
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = type;
    f.frequency.value = cut;
    f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  playSfx(name) {
    if (!this.enabled) return;
    switch (name) {
      case 'click':
        this._noiseHit({ dur: 0.04, vol: 0.035, cut: 1800, q: 2 });
        break;
      case 'cast':
        this._noiseHit({ dur: 0.18, vol: 0.03, cut: 2400, q: 0.8 });
        setTimeout(() => this._noiseHit({ dur: 0.25, vol: 0.055, cut: 350, type: 'lowpass' }), 90);
        this._tone({ freq: 140, dur: 0.2, vol: 0.035, attack: 0.03 });
        break;
      case 'hook':
        this._tone({ freq: 280, dur: 0.12, vol: 0.045, attack: 0.01, type: 'triangle' });
        this._tone({ freq: 420, dur: 0.18, vol: 0.035, attack: 0.02, detune: 6 });
        break;
      case 'splash':
        this._noiseHit({ dur: 0.35, vol: 0.06, cut: 500, type: 'lowpass' });
        break;
      case 'echo':
        this._tone({ freq: 196, dur: 0.7, vol: 0.055, attack: 0.04, type: 'sine' });
        this._tone({ freq: 294, dur: 0.9, vol: 0.03, attack: 0.08, detune: -4 });
        break;
      case 'correct':
        this._tone({ freq: 392, dur: 0.35, vol: 0.045, attack: 0.03 });
        this._tone({ freq: 587, dur: 0.55, vol: 0.035, attack: 0.08 });
        break;
      case 'wrong':
        this._tone({ freq: 160, dur: 0.4, vol: 0.04, attack: 0.04, type: 'triangle' });
        break;
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
        this._tone({ freq: 400, dur: 0.08, vol: 0.025, attack: 0.01 });
    }
  }
}

export const audio = new GameAudio();

function unlock() {
  audio.ensure();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
