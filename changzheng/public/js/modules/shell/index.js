/**
 * shell 模块 —— 外壳（顶栏 / 全局提示）对外界事件的反应。
 *
 * 为什么它必须存在：静音图标与"ctx 挂起"提示过去是 main.js 手工接的（`audio.onSuspended(toast)` 这类
 * 回调注入、点击里直接读 `audio.muted`）。改成总线后，**状态归 audio 模块所有**，UI 只对事件做反应——
 * 但这个"反应"总得有人负责，它不该塞回 main.js（那里已经 26 个职责块），也不该塞进 audio（音频不许碰 UI）。
 * 于是单开一个薄薄的模块：**外壳对事件的反应集中在这里**。
 *
 * 现在只有两件小事（都是原来 main.js 里的）：
 *   audio:muted     → 更新顶栏静音图标与提示（状态从事件来，UI 不自己记）
 *   audio:suspended → 提示用户点一下页面（浏览器自动播放策略把 AudioContext 挂起了）
 *
 * 批 5 会把 screens 迁进来后，这里再收编"顶栏显示/隐藏、行程缎带"等外壳职责。
 */
import { $, toast } from '../../ui.js';

export default {
  name: 'shell',
  note: '外壳对事件的反应：顶栏静音图标、全局提示',
  subscriptions: {
    'audio:muted': 'onMuted',
    'audio:suspended': 'onSuspended',
    'resource:blocked': 'onBlocked',
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
};
