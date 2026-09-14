/**
 * 元素音量斜坡 —— `<audio>` 元素的淡入/淡出/闪避共用这一处。
 *
 * 为什么不用 WebAudio 的 GainNode：环境床与 BGM 故意走 `<audio>` 元素（决策见 AUDIO-SYSTEM §十：
 * AudioContext 被自动播放策略挂起时元素照样能响，鲁棒优先）。元素的 `volume` 没有原生斜坡，
 * 所以在这里统一做——别在通道里各写一份 setInterval。
 */
const running = new WeakMap();   // el → timer，保证同一元素只有一条斜坡在跑

/**
 * 把元素音量在 ms 毫秒内线性推到 to。
 * @param {HTMLAudioElement} el
 * @param {number} to 目标音量 0..1
 * @param {number} ms 时长；<=0 直接赋值
 */
export function fadeElement(el, to, ms = 0) {
  if (!el) return;
  const target = Math.max(0, Math.min(1, to));
  const prev = running.get(el);
  if (prev) clearInterval(prev);
  if (!(ms > 0)) {
    el.volume = target;
    running.delete(el);
    return;
  }
  const from = el.volume;
  const steps = Math.max(1, Math.round(ms / 40));
  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    const k = Math.min(1, i / steps);
    try { el.volume = Math.max(0, Math.min(1, from + (target - from) * k)); } catch { /* 元素已卸载 */ }
    if (k >= 1) {
      clearInterval(timer);
      running.delete(el);
    }
  }, 40);
  running.set(el, timer);
}

/** 立刻停掉某元素的斜坡（元素要暂停/丢弃时调，别让定时器继续摸它） */
export function cancelFade(el) {
  const t = running.get(el);
  if (t) {
    clearInterval(t);
    running.delete(el);
  }
}
