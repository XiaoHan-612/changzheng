/**
 * games 模块 —— **玩法宿主服务 + 玩法清单**（批 5：玩法宿主变服务、玩法变插件）。
 *
 * 它解决的问题：以前"开板屏 → 写题名/背景 → 建 host → 声明 `data-mini*` → 收尾清理"这套
 * 样板在每个 `doXxx()` 里各抄一遍（8 个玩法 × 6 行），dev 钩子还把同一张映射表再抄一遍；
 * 同事想加一个玩法，得改 `main.js` 的三处（import、doXxx、钩子表）。
 *
 * 现在：所有玩法只有两个接触面——
 *   ① **清单**：`./manifest.js` 里一行（id → 描述符），加玩法只动这一行；
 *   ② **契约**：描述符 `{ game: { id, title, kicker, bg, stats, actions, mount } }`（见同目录 README）。
 * 其余全由本模块代劳（README §二 那张"宿主替你做掉的事"就是这里实现的）。
 *
 * 分工边界（批 5 定，别越界）：
 *   · 本模块**不碰**玩法内部规则、也**不调模型**——结算交给流程层（`main.js` 的 doXxx 拿到
 *     `{score, detail, summary}` 之后自己去 `callAI`）。
 *   · 流程层**不碰**板屏 DOM——题名、数值签、host、清理都是这里的事。
 *
 * 依赖：kernel/ + 共享页面件（ui.js 的 showScreen、step.js 的 markMini）——与 hud 模块同一口径：
 * **模块之间**不许互相 import（`qa:bus` 静态规则①拦的就是这个），共享工具层可以。
 */
import { kernel } from '../../kernel/index.js';
import { showScreen } from '../../ui.js';
import { markMini } from '../../step.js';
import { GAMES } from './manifest.js';

const $ = (id) => document.getElementById(id);

/** 当前这一局的现场（模块级变量：描述符上只放方法与规定字段） */
let live = null;            // { id, host, exit: [], progress: '' }
/** 数值签句柄（stats() 返回值由这里维护，progress() 与它共用一行） */
let progressText = '';

/** 板头数值签：唯一实现（原来在 minigames.js 里，每个玩法各拿一份容器自己拼 HTML） */
function renderStats(items = []) {
  const box = $('board-stats');
  if (!box) return {};
  const rows = [...items, progressText ? ['状况', progressText] : null].filter(Boolean);
  box.innerHTML = rows
    .map(([label, value, cls]) => `<span class="blk-stat ${cls || ''}">${label}<b>${value}</b></span>`)
    .join('');
  // 句柄：频繁变化的数（倒计时、手数）只改 <b>，别重写整行 HTML
  return Object.fromEntries([...box.children].map((el, i) => [rows[i][0], el.querySelector('b')]));
}

/** 收尾：先让玩法交出自己起的 rAF/定时器，再清容器（屏自清契约的另一半） */
function destroy() {
  const exit = live?.exit || [];
  live = null;
  progressText = '';
  for (const fn of exit) { try { fn(); } catch { /* 清理失败不能拖垮换屏 */ } }
  const body = $('board-body');
  if (body) body.innerHTML = '';
  const stats = $('board-stats');
  if (stats) stats.innerHTML = '';
}

export default {
  name: 'games',
  note: '玩法宿主服务：开板屏、写题名与数值签、声明自动化契约、收尾清理；玩法只是清单里的一行',
  subscriptions: {},          // 它不听别人的事；"某一局开始/结束"由 game:start / game:end 广播出去
  api: {
    /** 清单里有哪些玩法（体检脚本用它和 qa:board 的 specs 对账） */
    list: () => Object.keys(GAMES),
    has: (id) => !!GAMES[id],
    /**
     * 某个玩法的元数据（只给数据，不给函数）：体检/文档/工具用。
     * `actions` 是**声明**的交互动作；qa:board 会拿它和页面上真实出现的 `data-mini-action` 对账，
     * 所以同事插新玩法时，"声明了却没做出来"与"做出来了却没声明"都会被报出来。
     */
    describe(id) {
      const s = GAMES[id]?.game;
      if (!s) return null;
      return {
        id: s.id || id,
        title: s.title || '',
        kicker: s.kicker || '',
        bg: s.bg || '',
        stats: s.stats || [],
        actions: s.actions || [],
      };
    },
    /** 当前在玩哪个（没有则 null） */
    current: () => (live ? live.id : null),
    /**
     * 开一局。开板屏、写题名与背景、建 host、声明契约、等玩法返回结果。
     *
     * @param {string} id 清单里的玩法 id
     * @param {{params?: object, title?: string, kicker?: string, bg?: string}} [opts]
     *        params 给玩法自己的参数（如夜岗的今晚口令）；title/bg 可覆盖描述符里的默认值
     *        （同一份玩法在不同幕里换个题名，就不必复制成一个新玩法）
     * @returns {Promise<{score:number, detail:object, summary?:string}>} 玩法结果；未知 id 时返回空结果
     */
    async play(id, { params = {}, title, kicker, bg } = {}) {
      const spec = GAMES[id]?.game;
      if (!spec) {
        // 编程错误就明说，不要静默开一个空板（体检与冒烟会立刻看见）
        console.error(`[games] 清单里没有玩法「${id}」，可用：${Object.keys(GAMES).join('、')}`);
        return { score: 0, detail: {}, summary: '' };
      }
      destroy();                       // 上一局的残留（即使旧定时器还持着引用，写入也落在废弃节点上）
      const t0 = Date.now();
      showScreen('screen-board');
      const day = kernel.api('state')?.raw?.()?.day || 1;   // 只读；kicker 兜一个"第 N 日"
      $('board-kicker').textContent = kicker || spec.kicker || `第 ${day} 日`;
      $('board-title').textContent = title || spec.title || '';
      $('board-bg').style.backgroundImage = (bg || spec.bg) ? `url('${bg || spec.bg}')` : '';

      const host = document.createElement('div');
      host.id = 'game-host';
      markMini(host, id);
      $('board-body').appendChild(host);
      progressText = '';
      renderStats(spec.stats || []);                     // 描述符里的初值：挂载前板头就不是空的
      live = { id, host, exit: [] };
      kernel.emit('game:start', { id, title: title || spec.title || '' });

      const ctx = {
        /** 更新板头数值签（返回句柄，频繁变化的数只改句柄） */
        stats: (items) => renderStats(items),
        /** 板头「状况」那格（与 stats() 共用一行，不会互相覆盖） */
        progress: (text) => { progressText = String(text ?? ''); renderStats(spec.stats || []); },
        /** 播音效（走总线，音频模块负责实现；玩法不必知道音频框架） */
        sfx: (name) => kernel.emit('sfx:play', { name }),
        /** 本局参数（如 { password: '瑞金' }） */
        params,
        /** 收尾登记：自己起的 rAF/timer 必须在这里停掉（README §三条必须第 3 条） */
        board: {
          onExit: (fn) => { if (typeof fn === 'function' && live) live.exit.push(fn); },
          host: () => host,
        },
      };

      let result;
      try {
        result = await spec.mount(host, ctx);
      } catch (err) {
        // 玩法自己炸了：如实记下来，但不让整局卡死（板屏照旧可退）
        console.error(`[games] 玩法「${id}」挂载/运行出错：`, err);
        result = { score: 0, detail: { error: String(err?.message || err) }, summary: '这一局没有完成' };
      }
      const out = { score: 0, detail: {}, summary: '', ...(result || {}) };
      kernel.emit('game:end', { id, score: Number(out.score) || 0, ms: Date.now() - t0 });
      return out;
    },
  },

  /** 板屏清理登记在模块自己身上：渲染与清理住在一起，谁也不会忘（批 3 的屏自清契约） */
  init(kernelRef) {
    const screens = kernelRef.api('screens');
    if (screens?.own) screens.own('screen-board', destroy);
  },
};
