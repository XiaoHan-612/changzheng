/**
 * 语音通道（voice）—— 同伴台词与史实回响，也是终局升华那句朗诵的出口。
 *
 * 命中顺序（策划案 §2.6.2）：预置 wav 目录（`voice-lines.json`）→ TTS 缓存（`POST /api/tts`）→ **静默**。
 * 只有固定台词算得上"该有声"；模型自由回复不发声（成本与可控性，见 HANDOFF-AUDIO）。
 *
 * 规矩：
 * - voiceId 必须走 ACTOR_VOICE 映射——中文角色名会被清洗成空、回落成 default，哈希对不上（踩过）。
 * - 没解析出音色时用 `DEFAULT_VOICE`，**必须与服务端 server/index.js 的默认一致**（见那里的默认参数）。
 * - 文本必须与 `data/tts-lines.json` 逐字一致，否则文件白做；改台词要重跑 `npm run tts:manifest`。
 * - 新句打断旧句（同时只响一路人声）；播放期间对 BGM 重闪避、环境床轻闪避。
 * - **所有出声都经 `_playFile`**，它是 `voice:start / progress / ended` 的唯一来源：
 *   逐字跟读要的时间基准（已播毫秒）只从这里出，别在别处自造第二个时钟。
 */
import { MIX } from '../mix.js';

/**
 * 既没给 voiceId、也映射不出音色时的兜底 id。
 * 服务端 `/api/tts` 的默认是 `'default'`，两处必须一致——否则同一个 sha1 会算出两个文件名，
 * 缓存永远命中不了（守卫 scripts/check-audio.mjs 会核对这两处，别再各写一个字符串）。
 */
export const DEFAULT_VOICE = 'default';

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
    this._rateVal = 1;        // 当前这句的语速档位（1 = 原速）
    this._settle = null;      // 当前这句的 Promise 落地口（stop 也要能落地，别让人死等）
    this._progressTimer = null;   // 补齐 timeupdate 的 ~10Hz 进度定时器（只在播的时候活着）
    this._waitTimer = null;       // 兜底等待（防"放不完也不 ended"把流程挂住）
  }

  playing() { return !!(this.el && !this.el.paused && !this.el.ended); }

  describe() {
    const el = this.el;
    return {
      src: el ? el.src.split('/').pop() : null,
      playing: this.playing(),
      durationMs: durationMs(el),
      positionMs: el && Number.isFinite(el.currentTime) ? Math.round(el.currentTime * 1000) : 0,
      rate: this._rateVal,
    };
  }

  /** 静音：停掉当前这一句（不补播——语音是"当时那句"，过后再响反而怪） */
  silence() { this.stop(); }

  reconcile() { /* no-op：语音由台词触发，不参与 desired/actual */ }

  /**
   * 停当前这句（被打断、静音、切场景、收到 `voice:stop` 时调）。
   *
   * 它**一定**让上一次 `speak()` 的 Promise 落地，并发一条 `voice:ended {interrupted:true}`——
   * 老实现里被顶替的那句永远不 resolve（当时没人 await 才没暴露），谁 await 谁死等（踩过）。
   */
  stop() {
    const el = this.el;
    if (!el) return;
    this.el = null;
    this._rateVal = 1;
    this._disarm();
    detach(el);
    try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
    this.core.duck(false);
    this.core.report('voice:ended', { interrupted: true });
    this._settle?.();
    this._settle = null;
  }

  /**
   * 播一句台词。
   * @param {{text?:string, actorId?:string, voiceId?:string, file?:string, rate?:number}} line
   *   `file` 直给：已确定的音频文件（不走目录/TTS 解析的）
   *   `rate` 语速档位：只认 MIX.voice.rates 里列出的值（终局升华的 1x / 1.5x）
   * @returns {Promise<void>} 播完/被打断/出错都会 resolve（不阻塞流程）
   */
  async speak(line = {}) {
    const { text = '', actorId = '', voiceId = '', file = '', rate } = line;
    if (this.core.muted) return;
    if (file) return await this._playFile(file, { rate });      // 直给文件：不过目录与 TTS
    let voice = voiceId;
    if (!voice && actorId && ACTOR_VOICE[actorId]) voice = ACTOR_VOICE[actorId];
    try {
      const hit = await this._findLine(text, voice);
      if (hit?.file) return await this._playFile(hit.file, { rate });
      if (text) {
        const url = await this._cachedTts(text, voice || DEFAULT_VOICE);
        if (url) return await this._playFile(url, { rate });
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

  /**
   * 播一个音频文件，返回 Promise（被打断/出错都会 resolve）——**唯一**的出声实现，也是
   * `voice:start / progress / ended` 三条事件的唯一来源。
   *
   * 三条事件（契约见 kernel/contracts.js）：
   *   voice:start {durationMs}      开始出声（元数据还没到时为 0）
   *   voice:progress {t,duration}   ~10Hz；t = 已播毫秒，逐字跟读只认这一个时钟
   *   voice:ended {interrupted}     播完 / 被打断 / 出错三条路都发
   *
   * 打断语义：新句开场先停旧句（同时只响一路人声）。注意 `done` 里**只有当前这句**才解除闪避——
   * 否则旧句的收尾回调会把新句的闪避一起解掉（背景在台词中间突然变响，踩过）。
   */
  _playFile(file, opts = {}) {
    this.core.ensure();
    this.stop();                       // 先停旧句（会替它补一条 voice:ended）
    return new Promise((resolve) => {
      const el = new Audio(file);
      const rate = acceptedRate(opts.rate);
      el.volume = MIX.voice.level;
      if (rate !== 1) { try { el.playbackRate = rate; } catch { /* 老的/不支持的：忽略，照常原速 */ } }
      this.el = el;
      this._rateVal = rate;
      this._settle = resolve;
      this.core.duck(true);                 // 台词期间压低背景（BGM 重、环境床轻）

      const done = () => {
        if (this.el !== el) return;         // 已被新句顶替：清理与新句无关，什么都别动
        this.el = null;
        this._rateVal = 1;
        this._settle = null;
        this._disarm();
        detach(el);
        this.core.duck(false);
        this.core.report('voice:ended', { interrupted: false });
        resolve();
      };

      // 进度：timeupdate 本身太疏，配一个定时器补到 ~10Hz；两者共用一个节流刻度，重复的自动丢
      let bucket = -1;
      const tick = () => {
        if (this.el !== el) return;
        const t = Math.round((el.currentTime || 0) * 1000);
        const b = Math.floor(t / MIX.voice.progressMs);
        if (b === bucket) return;
        bucket = b;
        this.core.report('voice:progress', { t, duration: durationMs(el) });
      };
      this._progressTimer = setInterval(tick, MIX.voice.progressMs);

      // 兜底等待：读到真实时长后重算一次（长句按自己的长度等；硬顶防"放不完也不 ended"挂住流程）
      const arm = () => {
        clearTimeout(this._waitTimer);
        this._waitTimer = setTimeout(done, waitMs(el.duration));
      };
      arm();

      el.onloadedmetadata = () => { if (this.el === el) arm(); };
      el.ontimeupdate = tick;
      el.onended = done;
      el.onerror = done;
      el.play()
        .then(() => { if (this.el === el) this.core.report('voice:start', { durationMs: durationMs(el) }); })
        .catch(done);
    });
  }

  /** 收掉本条的两个定时器（stop 与 done 共用；通道不留定时器，core 不变量③） */
  _disarm() {
    clearInterval(this._progressTimer);
    clearTimeout(this._waitTimer);
    this._progressTimer = null;
    this._waitTimer = null;
  }
}

/** 元素时长（毫秒）；未知/流式返回 0（消费方以 voice:progress 里的 duration 为准） */
function durationMs(el) {
  const d = el && Number(el.duration);
  return Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : 0;
}

/** 等待上限：已知时长按「时长 × waitRatio + waitPadMs」自适应（整段朗诵不会被 12s 硬顶截断），
 *  未知用兜底值，最后再套一个硬顶——红线是"任何音频都不允许阻塞流程" */
function waitMs(seconds) {
  const d = Number(seconds);
  if (!Number.isFinite(d) || d <= 0) return MIX.voice.maxWaitMs;
  return Math.min(MIX.voice.waitCeilingMs, Math.round(d * 1000 * MIX.voice.waitRatio + MIX.voice.waitPadMs));
}

/** 语速档位：只认混音表列出的档，别的值一律回落到原速（免得业务随手传个没验过的 1.3） */
function acceptedRate(rate) {
  const n = Number(rate);
  return MIX.voice.rates.includes(n) ? n : 1;
}

/** 摘掉句柄上的回调：暂停/切走之后还会飘来的事件不该再进通道 */
function detach(el) {
  el.onended = null;
  el.onerror = null;
  el.onloadedmetadata = null;
  el.ontimeupdate = null;
}
