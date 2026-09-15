/**
 * 交互游戏插件模板 —— **从一个能跑的真实实现长出来**，空壳只剩下面这些。
 *
 * 用法：复制本文件改名（如 `my-game.js`）→ 改成本身玩法 → 在 `./manifest.js` 里加两行
 * （import 一行 + `GAMES` 里一行）。**不需要动宿主、内核、流程代码**。
 * 契约（必须守住的三条、ctx 每个字段的含义、落地检查单）见同目录 `README.md`。
 *
 * 这个文件不会被自动加载（`manifest.js` 的 GAMES 里没有它），留在仓库里不影响游戏。
 */
export default {
  game: {
    // ★ 必须与容器上的 [data-mini="<id>"] 一致 —— 宿主用这个 id 建容器并声明契约，
    //    qa:board / e2e 驱动靠它认"现在在玩哪个"。id 与文件名建议同名。
    id: 'example',
    title: '示例玩法',                    // 板头题名（blk-title）
    kicker: '玩法',                       // 可省；默认「第 N 日」
    bg: '/assets/scenes/camp_pano.jpg',    // 可省；板屏背景图
    // 板头数值签**初值**（挂载前板头就不会是空的）：['标签', '值'] 或 ['标签', '值', 'warn'|'good'|'off']
    stats: [['进度', '0/3'], ['得分', 0]],
    // ★ 本玩法会用到的全部 data-mini-action 值。qa:board 会拿它和页面上真实出现的对账：
    //    "做出来了却没声明"和"声明了却没做出来"都会报出来（别偷懒写空数组）。
    actions: ['do'],

    /**
     * @param {HTMLElement} host 玩法区容器（宿主建好并已声明 data-mini；从这里往下都是你的界面）
     * @param {{
     *   stats: (items: Array<[string, any, string?]>) => Record<string, HTMLElement>,
     *   progress: (text: string) => void,
     *   sfx: (name: string) => void,
     *   params: object,
     *   board: { onExit: (fn: () => void) => void, host: () => HTMLElement },
     * }} ctx
     * @returns {Promise<{ score: number, detail: object, summary?: string }>}
     *          score 0–1；summary 会交给模型复盘（一行中文，写清结果就行）
     */
    async mount(host, ctx) {
      let n = 0;
      // stats() 返回**句柄**：频繁变化的数只改句柄里的 <b>，别整行重写 HTML
      const 句柄 = ctx.stats([['进度', '0/3'], ['得分', 0]]);
      ctx.progress('准备中');                       // 板头「状况」那格（与 stats 共用一行，不互相覆盖）

      host.innerHTML = '<p class="blk-note">点「做一次」，三次就完成。</p>'
        + '<div class="blk-actions"><button type="button" class="btn primary">做一次</button></div>';
      const btn = host.querySelector('button');
      btn.dataset.miniAction = 'do';                // ★ 契约：可操作项
      host.dataset.miniState = 'ready';             // ★ 契约：当前状态（自由取词，只要一致）

      return await new Promise((resolve) => {
        // ★ 自己起的定时器/rAF 必须在 onExit 里停掉（宿主换屏/换玩法时会调它）
        // 另一种等价做法：每帧检查 document.body.contains(host)，false 就自己停
        ctx.board.onExit(() => { /* clearInterval(t) / cancelAnimationFrame(raf) */ });

        btn.onclick = () => {
          n += 1;
          ctx.sfx('click');                          // 音效走总线，别直接碰音频框架
          句柄['进度'].textContent = `${n}/3`;
          句柄['得分'].textContent = String(n * 10);
          ctx.progress(n >= 3 ? '完成' : `第 ${n}/3 次`);
          if (n < 3) return;
          btn.disabled = true;
          delete btn.dataset.miniAction;             // ★ 用掉就摘掉标记（否则"当前可交互项"会撒谎）
          host.dataset.miniState = 'done';
          resolve({ score: 1, detail: { times: n }, summary: '示例玩法：三次都做到了' });
        };
      });
    },
  },
};
