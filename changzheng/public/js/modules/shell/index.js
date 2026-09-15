/**
 * shell 模块 —— 外壳（顶栏 / 全局提示 / **模型调用的进度**）对事件的反应。
 *
 * 为什么它必须存在：静音图标与"ctx 挂起"提示过去是 main.js 手工接的（`audio.onSuspended(toast)` 这类
 * 回调注入、点击里直接读 `audio.muted`）。改成总线后，**状态归 audio 模块所有**，UI 只对事件做反应——
 * 但这个"反应"总得有人负责，它不该塞回 main.js（那里 26 个职责块），也不该塞进 audio（音频不许碰 UI）。
 * 于是单开一个薄薄的模块：**外壳对事件的反应集中在这里**。
 *
 * 批 6 起它还负责**模型调用的进度 UI**（原先在 main.js 的 `callAI()` 里，于是 50 个调用点各自
 * 手工写 `showThinking(true)` / `finally { showThinking(false) }`）：
 *   ai:start → 显示「思考中」（标签带调用类型；秒数由 ui.js 的 showThinking 自己走）
 *   ai:done  → 收起
 *   ai:fail  → 收起 + 在当前屏挂「重试 / 跳过」，并把玩家的裁决用 `ai:verdict` 回给 ai 模块
 * `data-action="ai-retry" / "ai-skip"` 这两个契约标记保持不变——自动化与体检脚本靠它们。
 */
import { $, toast, showThinking, actionHost } from '../../ui.js';

export default {
  name: 'shell',
  note: '外壳对事件的反应：顶栏静音图标、全局提示、模型调用的进度与重试键',
  subscriptions: {
    'audio:muted': 'onMuted',
    'audio:suspended': 'onSuspended',
    'resource:blocked': 'onBlocked',
    'ai:start': 'onAiStart',
    'ai:done': 'onAiDone',
    'ai:fail': 'onAiFail',
  },

  init(kernel) {
    this.kernel = kernel;
  },

  ready() {
    // 首次进入时同步一次图标（不弹提示——那不是"玩家刚关了声音"）。
    // 读音频状态走 kernel.api（模块之间不直接 import 别人的实现）
    const btn = $('btn-mute');
    if (btn) btn.textContent = this.kernel.api('audio')?.state?.().muted ? '🔇' : '🔊';
  },

  onMuted(p) {
    const btn = $('btn-mute');
    if (btn) btn.textContent = p.on ? '🔇' : '🔊';
    toast(p.on ? '声音已关' : '声音已开');
  },

  onSuspended(p) {
    toast(p.message, 4000);
  },

  /** 流程锁被别人占着：玩家刚点的那一下没生效，给个交代（不再由每个调用点各写一遍提示） */
  onBlocked(p) {
    if (p.name !== 'flow') return;              // 目前只有流程锁需要提示
    toast('上一步还在进行…', 1200);
  },

  /* ── 模型调用的进度 UI（批 6）── */

  onAiStart(p) {
    const el = $('thinking-label');
    if (el) el.textContent = `${p.label || p.callType || '模型'} · 正在书写…`;
    showThinking(true);
  },

  onAiDone() {
    showThinking(false);
  },

  /**
   * 失败（重试用尽）：收起「思考中」，在当前屏挂出「重试／跳过」，等玩家点。
   * 裁决用 `ai:verdict` 发回 ai 模块——**ai 模块不知道 UI 长什么样，UI 也不碰调用细节**。
   */
  onAiFail(p) {
    showThinking(false);
    const host = actionHost();
    if (!host) { this.kernel.emit('ai:verdict', { id: p.id, retry: false }); return; }
    host.querySelectorAll('#ai-retry-row').forEach((n) => n.remove());
    const row = document.createElement('div');
    row.id = 'ai-retry-row';
    row.className = 'blk-actions';    // 区块；与内容的间距由 #ai-retry-row 一条规则给（components.css）
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn primary';
    retryBtn.textContent = '重试这一次调用';
    retryBtn.dataset.action = 'ai-retry';
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn ghost';
    skipBtn.textContent = '跳过（本次不留叙事）';
    skipBtn.dataset.action = 'ai-skip';
    const tip = document.createElement('div');
    tip.className = 'muted sm';
    tip.style.width = '100%';
    tip.textContent = `失败原因：${p.error || '未知'}`;
    const answer = (retry) => {
      row.remove();
      this.kernel.emit('ai:verdict', { id: p.id, retry });
    };
    retryBtn.onclick = () => answer(true);
    skipBtn.onclick = () => answer(false);
    row.append(tip, retryBtn, skipBtn);
    host.appendChild(row);
  },
};
