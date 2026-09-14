/**
 * 语音通道（voice）—— 同伴台词与史实回响。
 *
 * 命中顺序（策划案 §2.6.2）：预置 wav 目录（`voice-lines.json`）→ TTS 缓存（`POST /api/tts`）→ **静默**。
 * 只有固定台词算得上"该有声"；模型自由回复不发声（成本与可控性，见 HANDOFF-AUDIO）。
 *
 * 规矩：
 * - voiceId 必须走 ACTOR_VOICE 映射——中文角色名会被清洗成空、回落成 default，哈希对不上（踩过）。
 * - 文本必须与 `data/tts-lines.json` 逐字一致，否则文件白做；改台词要重跑 `npm run tts:manifest`。
 * - 新句打断旧句（同时只响一路人声）；批 3 再补播放期间对 BGM/环境床的闪避。
 */
import { MIX } from '../mix.js';

/** 角色显示名 → 音色 id（一人一色，与 docs/TTS-MANIFEST.md 一致） */
export const ACTOR_VOICE = {
  旁白: 'narr', 叙事: 'narr', 你: 'narr',
  老班长: 'laoban', 指导员: 'zhiyuan', 红小鬼: 'xiaogui', 卫生员: 'weisheng',
  哨兵: 'sentry', 突击队长: 'captain', 船工: 'guide', 向导: 'guide', 向导老乡: 'guide',
  老乡: 'guide', 母亲: 'guide', 宣传员: 'drummer', 文化教员: 'drummer',
};

export class VoiceChannel {
  constructor(core) {
    this.core = core;
    this.el = null;
    this.catalog = null;
    this.catalogPromise = null;
  }

  playing() { return !!(this.el && !this.el.paused && !this.el.ended); }

  describe() { return { src: this.el ? this.el.src.split('/').pop() : null, playing: this.playing() }; }

  /** 静音：停掉当前这一句（不补播——语音是"当时那句"，过后再响反而怪） */
  silence() { this.stop(); }

  reconcile() { /* no-op：语音由台词触发，不参与 desired/actual */ }

  stop() {
    if (this.el) {
      try { this.el.pause(); this.el.currentTime = 0; } catch { /* ignore */ }
      this.el = null;
    }
  }

  /**
   * 播一句台词。
   * @param {{text?:string, actorId?:string, voiceId?:string, file?:string}} line
   *   `file` 直给：已确定的音频文件（沙盘的同伴反应音这类不走目录/TTS 解析的）
   * @returns {Promise<void>} 播完/被打断/出错都会 resolve（不阻塞流程）
   */
  async speak(line = {}) {
    const { text = '', actorId = '', voiceId = '', file = '' } = line;
    if (this.core.muted) return;
    if (file) return await this._playFile(file);      // 直给文件：不过目录与 TTS
    let voice = voiceId;
    if (!voice && actorId && ACTOR_VOICE[actorId]) voice = ACTOR_VOICE[actorId];
    try {
      const hit = await this._findLine(text, voice);
      if (hit?.file) return await this._playFile(hit.file);
      if (text) {
        const url = await this._cachedTts(text, voice || 'narr');
        if (url) return await this._playFile(url);
      }
    } catch {
      /* 静默降级：没有音频不该影响流程 */
    }
  }

  /** 预置台词目录：按 id 或关键词命中；自由文本返回 null */
  async _findLine(text, voiceId) {
    const lines = await this._loadCatalog();
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

  async _loadCatalog() {
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

  /** 播一个音频文件，返回 Promise（被打断/出错都会 resolve） */
  _playFile(file) {
    this.core.ensure();
    this.stop();
    return new Promise((resolve) => {
      const el = new Audio(file);
      el.volume = MIX.voice.level;
      this.el = el;
      this.core.duck(true);                 // 台词期间压低背景（BGM 重、环境床轻）
      const done = () => {
        if (this.el === el) this.el = null;
        this.core.duck(false);
        resolve();
      };
      el.onended = done;
      el.onerror = done;
      el.play().catch(done);
      setTimeout(done, MIX.voice.maxWaitMs);
    });
  }
}
