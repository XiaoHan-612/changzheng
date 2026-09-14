# games/ —— 交互游戏（小游戏）插件

> 这里是"玩家要动手玩"的那些东西：钓鱼、弯针、夜校、分糖、夜岗、五子棋、泸定桥、陡坡……
> **新增一个玩法 = 加一个文件 + 在 `index.js` 的 GAMES 里加一行**，不需要改内核、也不需要改流程代码。
> 玩法宿主（玩法板）由 `screens/board` 模块提供，它负责：开板屏 → 写题名 → 写板头数值签 →
> 声明自动化契约（`data-mini` / `data-mini-action`）→ 回收。

## 一、写一个玩法：复制 `_template.js`

```js
export default {
  game: {
    id: 'example',                    // ★ 必须与 [data-mini="example"] 一致；自动化与体检按它认
    title: '示例玩法',                 // 玩法板题名（板头 blk-title）
    kicker: '玩法',                   // 板头小标题（可省，默认用幕次+日）
    bg: '/assets/scenes/camp_pano.jpg',// 板屏背景（可省）
    stats: [['进度', '0/3']],          // 板头数值签初值：['标签', '值'] 或 ['标签', '值', 'warn|good|off']
    actions: ['do'],                  // ★ 本玩法会用到的 data-mini-action 值（体检与驱动核对）
    async mount(host, ctx) {
      // host：玩法区容器（随便用 DOM 搭你的界面）
      // ctx：{ stats, sfx, progress, board }
      //   stats(labels)  → 更新板头数值签，返回句柄对象（要频繁改的数就只改句柄，别重写整行 HTML）
      //   sfx(name)      → 播音效（名字见 audio/sfx-table.js）
      //   progress(text) → 更新板头「状况」那格
      //   board          → { onExit() } 退出前清理自己的定时器/rAF
      // 返回统一形状：
      return { score: 1, detail: {}, summary: '一句话结果（会交给模型复盘）' };
    },
  },
};
```

**必须遵守的三条**（都有原因，踩过）：

1. **`id` 与 `data-mini` 一致**：`qa:board` 与 e2e 驱动靠 `[data-mini]` 认"现在在玩哪个"，
   写错就变成"体检说没这个玩法"。
2. **可操作的元素必须声明 `data-mini-action="xxx"`**，用掉了就 `delete el.dataset.miniAction`
   或 `aria-disabled="true"`——否则"当前可交互项"会撒谎，自动化会卡死（2026-09-13 实锤过）。
3. **离开即回收**：`mount` 里起的 `requestAnimationFrame` / `setTimeout` 必须在
   `ctx.board.onExit()` 里停掉（或每帧检查 `document.body.contains(host)`）——
   否则你去玩别的玩法时，上一个还在后台跑（批五抓过：数值签被上一局的定时器串写）。

## 二、宿主会替你做掉的事（别自己重复做）

| 宿主做的事 | 你不用管 |
|---|---|
| 开板屏、切回舞台屏 | `showScreen('screen-board')` 的时序 |
| 板头题名 / 数值签容器 | 区域与样式（`blk-title` / `blk-stat`） |
| `markMini(host, id)` 与 `data-mini-state` | 自动化契约的声明 |
| 把 `{score, detail, summary}` 交给模型复盘 | `/api/decide` 的调用与资源结算 |

## 三、自动化怎么认你的玩法（不许改的地方）

- `[data-mini="<id>"]` 容器 + `[data-mini-state="..."]`（`idle|awaiting|window|player|ai|done` …）
- `[data-mini-action="<动作名>"]` 可操作项（写进描述符的 `actions` 里，体检会核对）
- 玩法板体检：`npm run qa:board`（会逐个把玩法摆到板上，验板屏壳、数值签、契约标记、第一步可点、离开清空）
- **写完先跑 `npm run dev:check`**：约 6 秒、0 次真调，它会把两个代表玩法（needle / sentry）摆到板屏上点一下。
  想让它查自己那个：`npm run dev:check -- --mins=你的id,grab`；八个玩法全量体检仍是 `qa:board`
- 回归驱动：`tests/e2e/lib/driver.mjs` 的 `applyMiniAction()` —— 新动作名要在那里加一条策略

## 四、迁移状态

批 1 只有这页契约与模板（**现有 8 个玩法还在 `main.js` 里**）：批 5 会把玩法宿主做成
`screens/board` 服务、把现有玩法逐个改造成本形状（行为与契约不变）。在那之前，
新玩法若急着上，可以照模板先写、再按 `docs/BUS.md` 的批 5 流程接进去。
