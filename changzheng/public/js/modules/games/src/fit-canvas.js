/**
 * 玩法画布自适应（共用工具）。
 *
 * 为什么要它：棋/河道/担架/沙盘这类画布是**设计坐标**画的（W×H 写死），早先按 1:1 显示。
 * 玩法板的纸面放大到 --panel-w-board（960）之后，这些画布还停在 460×240 / 330×330，
 * 四周一片空 —— "点进游戏只有小小一个窗口"就是这么来的。
 *
 * 做法沿用「打铁」（minigames-needle.js）里已经跑通的那套：
 *   设计坐标不动，按可用空间算一个 viewScale，transform 用 `DPR * viewScale`，
 *   后备缓冲同步放大（所以放大了也不糊）。区别是这里**多看一眼高度**——
 *   宽度铺满很容易，但画布一高就要滚屏，玩到一半滚来滚去比小一点更难受。
 *
 * 高度预算按纸面的 `max-height` 上限算，**不按当前高度**：
 * 纸面在内容不足时会随内容收缩，若拿当前高度反推，budget 恒等于当前画布高，
 * 画布就只能缩不能放（一个常见的自反馈坑）。
 *
 * @param {HTMLCanvasElement} canvas 目标画布
 * @param {number} W 设计宽（画布坐标系）
 * @param {number} H 设计高
 * @param {object} [opts]
 * @param {(scale:number, dpr:number)=>void} [opts.onSize] 每次尺寸变化后回调，用来重设 transform
 * @param {number} [opts.maxScale] 放大上限（默认 2.2：再大就不是"看得清"而是"糊"）
 * @param {number} [opts.minScale] 缩小下限（默认 0.55）
 * @param {number} [opts.reserveH] 额外预留的竖向余量（px）
 * @returns {{ apply: () => number, scale: () => number, dpr: number, stop: () => void }}
 */
export function fitCanvas(canvas, W, H, opts = {}) {
  const { onSize = null, maxScale = 2.2, minScale = 0.55, reserveH = 8 } = opts;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let scale = 1;
  let lastKey = '';

  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

  /** 纸面（玩法板）与画布所在的玩法容器 */
  const panelOf = () => canvas.closest('.tpl-body, .sheet') || canvas.parentElement || document.body;
  const wrapOf = () => canvas.parentElement || panelOf();

  function apply() {
    const panel = panelOf();
    const wrap = wrapOf();
    const pcs = getComputedStyle(panel);
    const wcs = getComputedStyle(wrap);

    // 可用宽 = 纸面内容区（去掉左右内边距）
    const availW = Math.max(200, panel.clientWidth - num(pcs.paddingLeft) - num(pcs.paddingRight));

    // 可用高 = 纸面上限 - 「纸面里除画布以外的一切」 - 预留。
    // 除画布以外的一切 = scrollHeight - 画布高：纸面随内容长，这个差值与画布尺寸无关，
    // 所以不会自反馈（早先只累加"画布兄弟节点"，漏掉了纸面里更外层的题名与数值签 ——
    // 浮桥照那个预算放大后仍然溢出 91px）。
    const capH = num(pcs.maxHeight) || window.innerHeight;
    const othersH = Math.max(0, panel.scrollHeight - canvas.getBoundingClientRect().height);
    const availH = Math.max(120, capH - othersH - reserveH);

    const next = Math.max(minScale, Math.min(maxScale, availW / W, availH / H));
    const key = `${Math.round(next * 100)}|${dpr}`;
    if (key === lastKey) return scale;
    lastKey = key;
    scale = next;

    const cssW = Math.round(W * scale);
    const cssH = Math.round(H * scale);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    if (onSize) onSize(scale, dpr);
    return scale;
  }

  apply();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => apply()) : null;
  if (ro) ro.observe(panelOf());
  const onWin = () => apply();
  window.addEventListener('resize', onWin);

  return {
    apply,
    scale: () => scale,
    dpr,
    stop: () => { if (ro) ro.disconnect(); window.removeEventListener('resize', onWin); },
  };
}
