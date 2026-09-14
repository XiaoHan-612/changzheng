/**
 * 交互游戏插件模板 —— 复制这个文件改名（如 `fishing.js`），改成你的玩法，然后在 `index.js` 的 GAMES 里加一行。
 * 详细的规矩与"宿主替你做掉的事"见同目录 `README.md`。
 *
 * 这个文件**不会被自动加载**（`index.js` 的 GAMES 清单里没有它），所以留在仓库里不会影响游戏。
 */
export default {
  game: {
    // ★ id 必须与 [data-mini="<id>"] 一致：qa:board 与 e2e 驱动按它认"现在在玩哪个"
    id: 'example',
    title: '示例玩法',
    kicker: '玩法',                      // 可省；默认为「幕次 · 第 N 日」
    bg: '/assets/scenes/camp_pano.jpg',  // 可省；板屏背景图
    // 板头数值签初值：['标签', '值'] 或 ['标签', '值', 'warn' | 'good' | 'off']
    stats: [['进度', '0/3'], ['得分', 0]],
    // ★ 本玩法会用到的 data-mini-action 值（qa:board 与驱动会核对，别漏）
    actions: ['do', 'finish'],

    /**
     * @param {HTMLElement} host 玩法区容器
     * @param {{ stats: Function, sfx: Function, progress: Function, board: { onExit: Function } }} ctx
     * @returns {Promise<{ score: number, detail: object, summary?: string }>}
     */
    async mount(host, ctx) {
      let n = 0;
      const wraps = ctx.stats(['进度', '0/3'], ['得分', 0]);   // 拿句柄：频繁变的数只改文本
      ctx.progress('准备中');                                   // 更新板头「状况」

      host.innerHTML = '<p class="blk-note">点「做一次」，做三次就完成。</p><div class="blk-actions"></div>';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn primary';
      btn.textContent = '做一次';
      btn.dataset.miniAction = 'do';            // ★ 契约：可操作项
      host.querySelector('.blk-actions').append(btn);
      host.dataset.miniState = 'ready';         // ★ 契约：当前状态

      return await new Promise((resolve) => {
        // 离开板屏要停掉自己起的东西（这里只是示范：有定时器就写进 onExit）
        ctx.board.onExit(() => { /* clearInterval(...) / cancelAnimationFrame(...) */ });

        btn.onclick = () => {
          n += 1;
          ctx.sfx('click');
          wraps['进度'].textContent = `${n}/3`;
          wraps['得分'].textContent = String(n * 10);
          ctx.progress(n >= 3 ? '完成' : `第 ${n}/3 次`);
          if (n >= 3) {
            btn.disabled = true;
            delete btn.dataset.miniAction;      // ★ 用掉就摘掉契约标记（否则"可交互项"会撒谎）
            host.dataset.miniState = 'done';
            resolve({ score: 1, detail: { times: n }, summary: '示例玩法完成' });
          }
        };
      });
    },
  },
};
