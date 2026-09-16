/**
 * 适配器 —— 把同事那条线的一支玩法装成我们的插件（描述符 + mount）。
 *
 * 背景：同事的小游戏是**单独开发**的（`src/minigames-*.js`，他们自己的契约与写法），
 * 而我们的玩法契约是 `{ game: { id, title, kicker, bg, stats, actions, mount(host, ctx) } }`。
 * 两边差的只有四处**固定缝合点**（音频 / 数值签 / 模型 / 收尾），已由
 * `tools/intake-minigames.mjs` 在源码里开好口子，这里负责在装配时把宿主能力**注入**进去：
 *
 *   sfx     音效 → 宿主转成总线事件 `sfx:play`（玩法不认识音频框架）
 *   stats   数值签 → 宿主唯一实现（返回句柄，玩法只改 <b>）
 *   decide  需要模型时由**流程层**注入（玩法自己不发请求 → 预算/账目/重试都归 modules/ai）
 *
 * 为什么用适配器而不是把 14 支各自的描述符抄一遍：**单一真源**。
 * 卡片的 id/title/actions/act 只在他们的源码里写一份，这里读它、不抄它；
 * 同事更新玩法（换动作词、加状态）时，`qa:board` 的三方对账会立刻发现对不上。
 *
 * 收尾由适配器统一兜住（这一点比自己写更硬）：
 *   · 玩家中途离开板屏 → `ctx.board.onExit` 回调把 Promise settle 成"没打完"，
 *     流程层不会 `await` 悬死（他们那边的自清是"检测容器断开"，但不 settle Promise）；
 *   · 玩法抛错 → 记日志 + settle 成"没完成"，不让一局崩掉整条流程。
 */
import { kernel } from '../../kernel/index.js';

/** 在模块导出里找"卡片数组"（形如 `export const XXX_MINIGAMES = [{ id, run, … }]`） */
function cardOf(mod, id) {
  for (const v of Object.values(mod || {})) {
    if (!Array.isArray(v) || !v.length || typeof v[0] !== 'object' || !v[0]) continue;
    const hit = v.find((c) => c && c.id === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {object|object[]} mod 玩法模块的命名空间，或它们的数组
 *   （夜校那种"入口 + 两支子玩法"的支要传三个模块：**注入要覆盖每个模块**，
 *     否则子玩法那一支的 `bindHost` 收不到宿主能力）
 * @param {{id: string, cardId?: string, kicker?: string, bg?: string, stats?: any[]}} opts
 *   `id` 是我们的槽名（= `manifest.js` 的键 = `data-mini`）；
 *   `cardId` 是卡片里的 id，仅当两者不同时给（夜校：槽 `nightschool` / 卡片 `nightschool-entry`）
 * @returns {{game: object}} 我们的插件描述符
 */
export function pluginFrom(mod, { id, cardId = id, kicker = '', bg = '', stats } = {}) {
  const mods = Array.isArray(mod) ? mod : [mod];
  const host = mods.find((m) => cardOf(m, cardId)) || mods[0];
  const card = cardOf(host, cardId);
  if (!card) {
    // 编程错误就明说：静默装一个空玩法会让 qa:board 报出一堆看不懂的错
    console.error(`[games] 适配器在模块里找不到 id=「${id}」的玩法卡片（卡片里的 id 与 manifest 的键要一致）`);
    return { game: { id, title: id, kicker, bg, stats: [], actions: [], mount: async () => ({ score: 0, detail: { error: 'no-card' } }) } };
  }
  return {
    game: {
      id: card.id,
      title: card.title || card.id,
      kicker: kicker || card.act || '',
      bg,
      // 数值签**初值**：宿主挂载时就渲染它（等玩法第一帧再写会有一瞬空白，
      // qa:board 的"数值签"断言就是查这个）——所以由插件给，卡片没写就用传进来的
      stats: stats || card.stats || [],
      actions: card.actions || [],
      // 卡片声明"纯铺垫、不产生复盘调用"→ 流程层据此**跳过 minigame_review**（省一次真调），
      // 改用固定效果（见 flow/games-flow.js 的 reviewOrFixed）。字段名与他们的注册表口径一致。
      noAi: !!card.noAi,
      mount(mountHost, ctx) {
        // 注入宿主能力（对应源码里的 bindHost；见 tools/intake-minigames.mjs 的说明）。
        // 多模块时逐个注入——入口拉起子玩法时用的是**子模块自己**的那份 bindHost。
        for (const m of mods) m.bindHost?.({ sfx: ctx.sfx, stats: ctx.stats, decide: ctx.params?.decide });
        // id 传**我们的槽名**：玩法据此写 data-mini（qa:board / e2e 都按它认玩法）
        const run = Promise.resolve().then(() => card.run(mountHost, { ...ctx.params, id }));
        return new Promise((resolve) => {
          ctx.board.onExit(() => resolve({ score: 0, detail: { aborted: true }, summary: '这一局没有打完' }));
          run.then(
            (r) => resolve({ score: 0, detail: {}, summary: '', ...(r || {}) }),
            (err) => {
              console.error(`[games] 玩法「${card.id}」抛错（这一局按没完成处理）：`, err);
              kernel.emit('sfx:play', { name: 'wrong' });
              resolve({ score: 0, detail: { error: String((err && err.message) || err) }, summary: '这一局没有完成' });
            },
          );
        });
      },
    },
  };
}
