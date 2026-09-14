/**
 * 音频核心 —— 框架层。
 *
 * 心脏是一句话：**分清楚「该响什么」（desired）和「现在在响什么」（actual）。**
 * 所有入口（进屏/换幕、静音、用户手势、标签页可见性、元素被外部暂停）都只做一件事：
 * 改 desired 或调用 reconcile()，让 actual 追上 desired。这样就不存在"某条路忘了恢复声音"——
 * 老实现里"静音后环境床再也不回来"正是因为没有这一层（见 docs/AUDIO-SYSTEM.md §五）。
 *
 * 三条不变量（守卫与体检会核对）：
 *   ① 同一通道最多一个句柄在播（防叠音）
 *   ② 未静音且 desired 非空 → actual 必须在播（防"静音后不回来"）
 *   ③ 切走的场景不留定时器（循环由通道自己管，stop 时清掉）
 */
import { MIX } from './mix.js';

export class AudioCore {
  constructor() {
    this.ctx = null;
    this.buses = null;                    // { master, ambient, bgm, sfx, voice }
    this.channels = {};                   // 由 index.js 注入：{ ambient, sfx, voice, [bgm] }
    this.desired = { ambient: null, bgm: null };   // 该响什么（意图，静音不动它）
    this.muted = false;                   // 游戏内静音（setMuted 改它）
    this._booted = false;
    this._hintShown = false;
    this._onSuspendedHint = null;         // 由 index.js 注入（弹一次提示，避免 core 依赖 UI）
  }

  /** 建 ctx 与四条总线（只建一次）；ctx 被挂起时顺手恢复 */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      const mk = (level, dest) => {
        const g = this.ctx.createGain();
        g.gain.value = level;
        g.connect(dest);
        return g;
      };
      const master = mk(MIX.master, this.ctx.destination);
      this.buses = {
        master,
        ambient: mk(MIX.bus.ambient, master),
        bgm: mk(MIX.bus.bgm, master),
        sfx: mk(MIX.bus.sfx, master),
        voice: mk(MIX.bus.voice, master),
      };
    }
    // 被自动播放策略/休眠挂起：能自己恢复就恢复；恢复不了（缺用户手势）就提示一次
    if (this.ctx.state !== 'running') {
      this.ctx.resume().then(() => { /* 恢复了 */ }).catch(() => this.hintSuspended());
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') this.hintSuspended();
    }
    return this.ctx;
  }

  /** ctx 起不来时提示一次（同一会话只提示一次） */
  hintSuspended() {
    if (this._hintShown) return;
    this._hintShown = true;
    try { this._onSuspendedHint?.(MIX.suspendedHint); } catch { /* 提示失败不影响声音 */ }
  }

  /** 通道注册（index.js 建好通道后调一次） */
  register(name, channel) {
    this.channels[name] = channel;
    return channel;
  }

  /** 「该响什么」的唯一写入口：改完立刻 reconcile */
  desire(name, kind) {
    this.desired[name] = kind ?? null;
    this.reconcile();
  }

  /** 让 actual 追上 desired。安好时只做几次布尔比较，随便调 */
  reconcile() {
    if (this.muted) return;
    for (const [name, ch] of Object.entries(this.channels)) {
      if (typeof ch.reconcile === 'function') ch.reconcile(this.desired[name] ?? null);
    }
  }

  /** 游戏内静音：停声但**保留意图**，取消时按意图恢复 */
  setMuted(on) {
    const was = this.muted;
    this.muted = !!on;
    if (this.muted) {
      for (const ch of Object.values(this.channels)) ch.silence?.();
    } else if (was) {
      this.ensure();
      this.reconcile();
    }
  }

  /** 某条通道现在是否真的在响（测试与调试用；不看实现细节） */
  isPlaying(name) {
    return !!this.channels[name]?.playing?.();
  }

  /** 调试快照（= window.__czAudio.state()）：一眼分清"没恢复"还是"被静音" */
  state() {
    return {
      muted: this.muted,
      ctx: this.ctx ? this.ctx.state : null,
      desired: { ...this.desired },
      actual: Object.fromEntries(Object.entries(this.channels).map(([n, ch]) => [n, ch.describe?.() ?? ch.playing?.() ?? false])),
    };
  }

  /**
   * 挂自愈触发点（幂等）。
   * 覆盖三类"声音被外部停掉"：浏览器自动播放策略、标签页转后台/被系统挂起、
   * 以及环境床元素被浏览器暂停（元素自己的 pause 事件由通道转发到 core.reconcile）。
   */
  boot() {
    if (this._booted) return;
    this._booted = true;
    const heal = () => { this.ensure(); this.reconcile(); };
    // 任意手势：既解锁 AudioContext，也把被外部停掉的声音接回来
    window.addEventListener('pointerdown', heal);
    window.addEventListener('keydown', heal);
    // 回到前台
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') heal();
    });
    // 低频健康检查（10s 一次，代价是几次布尔比较）：覆盖"没有交互、也没切前台"的挂起
    setInterval(() => { if (this.desired.ambient || this.desired.bgm) this.reconcile(); }, 10000);
  }
}
