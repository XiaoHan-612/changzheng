/**
 * 玩法侧的「模型窗口」：**10 秒上限**，到点就当模型没答，玩法照常走固定内容。
 *
 * 为什么有这个文件：分糖（`minigames-candy.js`）与五子棋（`minigames-gomoku.js`）各自抄了一份
 * 同构实现，而夜校那三支是**裸 `await DECIDE(…)`**——网关一挂起，玩家已经烧完灯/答完题，
 * 状态就停在「教员合上本子……」上，永远不落地（流程锁跟着一起锁死）。
 * 这里抽一份出来给夜校用；那两支里原有的两份**保持不动**（已被实测覆盖，不为了整洁去动在跑的代码）。
 *
 * ⚠️ 只给 fetch 传 AbortSignal 不算硬上限：上限就成了「底层肯不肯听话」的赌注
 * （分糖那轮被一个无视 signal 的假接口抓到过）。这里是**计时器与请求赛跑**，谁先到算谁。
 */

/** 定下的窗口：超过 10 秒就当作"它没答"（与 candy / gomoku 的 `AI_WINDOW_MS` 同一个数） */
export const AI_WINDOW_MS = 10000;

/**
 * @param {?Function} decide 宿主注入的调用通道（玩法自己不发请求，见 docs/MINIGAMES-INTAKE.md）
 * @param {object} payload 载荷（形状与 candy / gomoku 的调用一致）
 * @param {number} [ms] 窗口毫秒数
 * @returns {Promise<any|null>} 超时 / 网络错 / 服务端失败一律 null（= 当作它没答）
 */
export async function decideWithin(decide, payload, ms = AI_WINDOW_MS) {
  if (typeof decide !== 'function') return null;      // 没注入（单独搬走这一支时）：直接走兜底
  const ac = new AbortController();
  let timer = 0;
  try {
    return await Promise.race([
      decide(payload, { signal: ac.signal }),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    ac.abort();          // 顺手把还挂着的请求掐掉（真实 fetch 会因此中止连接）
  }
}
