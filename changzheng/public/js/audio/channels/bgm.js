/**
 * BGM 通道（bgm）—— 章节/场景的背景音乐。
 *
 * 与视觉那套的对应关系：环境床是「插画」（场景底子），BGM 是「氛围光」——同一张表驱动，各管一层。
 * 当前**没有任何 BGM 文件**（`public/audio/bgm/` 还没产出），所以这个通道现在的作用是：
 * 把接口、混音、闪避与"文件有没有"的账都先立好——音频模型把 `.ogg` 按名字丢进 `public/audio/bgm/`
 * 就**落盘即生效**，不用改任何代码。
 *
 * 决策（AUDIO-SYSTEM §十）：
 * - 有文件就放；文件没产出 → 该场景只放环境床，**静默、不报错、不阻塞**，但账要记下来
 *   （`missing` 会在 `__czAudio.state()` 与 `qa:audio` 里列出来，不允许"以为有其实没有"）。
 * - 走 `<audio>` 元素 + 元素级音量（抗 ctx 挂起），淡入用 `fade.js`。
 * - 语音播放时闪避到 `MIX.bgm.duckWhenVoice`（压住音乐、让台词清楚），语音结束回位。
 */
import { MIX } from '../mix.js';
import { fadeElement, cancelFade } from '../fade.js';

/** BGM 文件映射（音频模型按 docs/HANDOFF-AUDIO.md §六 的表落盘即生效） */
export const BGM_FILE = {
  depart: '/audio/bgm/depart_bgm.ogg',
  xiangjiang: '/audio/bgm/xiangjiang_bgm.ogg',
  zunyi: '/audio/bgm/zunyi_bgm.ogg',
  jinsha: '/audio/bgm/jinsha_bgm.ogg',
  luding: '/audio/bgm/luding_bgm.ogg',
  snow: '/audio/bgm/snow_bgm.ogg',
  grass: '/audio/bgm/grass_bgm.ogg',
  huining: '/audio/bgm/huining_bgm.ogg',
};

export class BgmChannel {
  constructor(core) {
    this.core = core;
    this.el = null;
    this.current = null;        // 现在在响的 kind（actual）
    this.ducked = false;
    this.missing = new Set();   // 声明了但没有文件的 kind（账，给体检与排查看）
  }

  play(kind) { this.core.desire('bgm', kind); }
  stop() { this.core.desire('bgm', null); }

  /** 静音：停声，意图留在 core.desired 里（取消静音时 reconcile 接回来） */
  silence() { this._stopSound(); }

  playing() { return !!(this.el && !this.el.paused && !this.el.ended); }

  describe() {
    return {
      kind: this.current,
      src: this.el ? this.el.src.split('/').pop() : null,
      playing: this.playing(),
      volume: this.el ? +this.el.volume.toFixed(3) : null,
      missing: [...this.missing],
    };
  }

  /** 语音在播时压低（true）/ 语音结束回位（false） */
  duck(on) {
    this.ducked = !!on;
    if (this.el) fadeElement(this.el, this._target(), MIX.bgm.fadeOutMs / 2);
  }

  _target() {
    return MIX.bgm.level * (this.ducked ? MIX.bgm.duckWhenVoice : 1);
  }

  reconcile(kind) {
    if (!kind) { this._stopSound(); return; }
    if (this.current === kind && this.playing()) return;
    this._stopSound();
    if (this.missing.has(kind)) return;        // 负缓存：已知没有文件，别再探（否则每轮 reconcile 都 404）
    this.current = kind;
    const file = BGM_FILE[kind];
    if (!file) {
      console.warn(`[audio] 场景表声明了 BGM「${kind}」，但 BGM_FILE 里没有它的文件映射`);
      this.missing.add(kind);
      return;
    }
    // **先问有没有，再决定放不放**：一次 HEAD 就能定性，缺曲时不会造出一个注定失败的 <audio>，
    // 也不会在整局里反复请求同一个不存在的文件（踩过：404 被影音审计逐次记成故障）。
    fetch(file, { method: 'HEAD' })
      .then((r) => { if (r.ok) this._start(kind, file); else this._markMissing(kind); })
      .catch(() => this._markMissing(kind));
  }

  /** HEAD 说有文件：这时候才建元素、淡入播放 */
  _start(kind, file) {
    if (this.core.muted) return;               // 期间被静音了：意图还在，等 reconcile 再来
    if (this.core.desired.bgm !== kind) return; // 期间已经切走了
    try {
      const el = new Audio(file);
      el.loop = true;
      el.volume = 0;
      this.el = el;
      this.current = kind;
      const giveUp = () => this._markMissing(kind, el);
      el.onerror = giveUp;
      el.play()
        .then(() => fadeElement(el, this._target(), MIX.bgm.fadeInMs))
        .catch(giveUp);
    } catch {
      this._markMissing(kind, this.el);
    }
  }

  /** 文件没产出：静默降级（只记在账上），并在控制台说清"怎么让它生效" */
  _markMissing(kind, el) {
    if (!this.missing.has(kind)) {
      this.missing.add(kind);
      console.info(`[audio] 还没有 BGM 文件：${BGM_FILE[kind]} —— 把 .ogg 放进 public/audio/bgm/ 即自动生效（场景「${kind}」）`);
    }
    if (el && this.el === el) {
      cancelFade(el);
      try { el.pause(); } catch { /* ignore */ }
      this.el = null;
    }
  }

  _stopSound() {
    if (this.el) {
      cancelFade(this.el);
      try { this.el.pause(); this.el.currentTime = 0; } catch { /* ignore */ }
      this.el = null;
    }
    this.current = null;
  }
}
