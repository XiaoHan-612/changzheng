# games/ —— 交互游戏（小游戏）插件

> **状态（2026-09-19）**：宿主（`./index.js`）与插件接口已冻结，**目录里的 14 支全部是正式实现**
> （"有哪些玩法"以 `./manifest.js` 为唯一真相）。旧版的 `public/js/minigames.js`（1121 行 / 8 个玩法）**已删除**。
>
> 加一个玩法 = **加一个文件（本体放 `src/`，插件放这一层）+ 在 `./manifest.js` 加两行**（import 一行、GAMES 一行）。
> 要改的只有这两处——`main.js`、内核、别的模块都不碰。

## 一、写一个玩法：复制 `_template.js`

描述符就是**一个对象**（`export default { game: {...} }`），字段如下（都有默认值，只有 `id` 与 `mount` 必需）：

| 字段 | 说明 |
|---|---|
| `id` ★ | **必须与容器上的 `[data-mini="<id>"]` 一致**。宿主用这个 id 建容器并声明契约；`qa:board` 与 e2e 驱动靠它认"现在在玩哪个"。建议 id 与文件名同名 |
| `title` | 板头题名（`#board-title`）。体检按它核对，改标题要同步 `qa-board.mjs` 的 `specs` |
| `kicker` | 板头小标题，可省；默认「第 N 日」 |
| `bg` | 板屏背景图，可省；给相对路径如 `/assets/scenes/camp_pano.jpg` |
| `stats` | 板头数值签**初值**：`['标签', '值']` 或 `['标签', '值', 'warn'\|'good'\|'off']`。挂载前板头就不是空的 |
| `actions` ★ | 本玩法会用到的**全部** `data-mini-action` 值。`qa:board` 拿它和页面上真实出现的对账 |
| `mount(host, ctx)` ★ | 建界面、返回 `{ score: 0..1, detail, summary }`。`summary` 会交给模型复盘（一行中文） |

### `ctx` 里有什么（宿主注入，别自己去 import 这些能力）

| 字段 | 用途 |
|---|---|
| `ctx.stats(items)` | **更新**板头数值签。返回句柄：频繁变化的数只改句柄里的 `<b>`，别整行重写 HTML |
| `ctx.progress(text)` | 板头「状况」那格（与 `stats()` 共用一行，互不覆盖） |
| `ctx.sfx(name)` | 播音效（名字见 `audio/sfx-table.js`）；走总线，玩法不必知道音频框架 |
| `ctx.params` | 这一局的参数（如夜岗的 `{ password: '瑞金' }`），由流程层传进来 |
| `ctx.board.onExit(fn)` | **收尾登记**：自己起的定时器/rAF 在这里停（见"三条必须"第 3 条） |
| `ctx.board.host()` | 拿回玩法区容器（一般用不到，`host` 参数就是它） |

### 三条必须（都有原因，都踩过）

1. **`id` 与 `data-mini` 一致**：写错就变成"体检说没这个玩法"（宿主替你声明契约，id 由你给）。
2. **可操作的元素必须带 `data-mini-action="xxx"`，用掉就摘掉**（`delete el.dataset.miniAction`
   或 `el.disabled = true` / `aria-disabled="true"`）——否则"当前可交互项"会撒谎，自动化会卡死
   （2026-09-13 实锤：用过的一次性热点没摘标记，驱动在原地点了 40 秒）。
3. **离开即回收**：`mount` 里起的 `requestAnimationFrame` / `setTimeout` 必须在 `ctx.board.onExit()`
   里停掉，或每帧检查 `document.body.contains(host)`——否则去玩别的玩法时上一个还在后台跑
   （批五抓过：数值签被上一局的定时器串写）。

## 二、宿主替你做掉的事（别自己重复做）

| 宿主做的事 | 你不用管 |
|---|---|
| 开板屏 / 收尾清理 / 登记屏自清（`screens.own('screen-board')`） | `showScreen('screen-board')` 的时序、离开时谁来清 |
| 板头题名 / 小标题 / 背景 / 数值签容器与样式 | `blk-title` / `blk-stat` 怎么摆 |
| 建 `[data-mini]` 容器 + `data-mini-state` 的声明 | 契约声明（id 由描述符给，状态你在玩法里自己写） |
| 按描述符写数值签**初值** | 挂载前板头空白 |
| 广播 `game:start` / `game:end`（带 id 与结果分） | 想挂成就/统计/彩蛋的人不必改你的玩法 |
| 把你返回的 `{score, detail, summary}` 交给流程层去做模型复盘 | `/api/decide` 的调用与资源结算 |

**别做的三件事**：① 别在玩法里调模型（结算是流程层的事，玩法只做手感判定）；
② 别去动别的屏的 DOM（屏自清契约）；③ 别自己拼数值签 HTML（样式只有一份，见 `DESIGN-SYSTEM.md`）。

## 三、插一个玩法的检查单（照着跑，机器会告诉你缺哪一步）

```powershell
# 1. 复制 _template.js 改名，改 id / title / stats / actions / mount
# 2. ./manifest.js 里加两行：import 一行 + GAMES 一行
# 3. tests/manual/qa-board.mjs 的 specs 里加一行（id: {title, stat, kick, after}）
#    ↑ 不加这一行，第 4 步会报"体检表覆盖了清单里的每个玩法 ✗"
npm run dev:check           # 约 16 秒、0 真调：能挂上 / 契约标记齐 / 无报错
npm run qa:board            # 逐屏摆上板屏点一下；含"清单 ↔ 体检表 ↔ 动作声明"三方对账
node tests/e2e/layout-audit.mjs            # 新界面过了就顺手跑：1280 无溢出/控件出界
node tests/e2e/layout-audit.mjs --width 820
```

报错对号入座：

| 报什么 | 说明 |
|---|---|
| `清单里没有玩法「x」` | `manifest.js` 的 GAMES 里少了这一行，或 import 的名字与 id 不一致 |
| `体检表覆盖了清单里的每个玩法 ✗` | 新玩法还没在 `qa-board.mjs` 的 `specs` 里登记 |
| `xx：页面用到的动作都在描述符里声明 ✗` | `actions` 里少写了页面上真实出现的 `data-mini-action` |
| `xx：契约标记 ✗` | `mount` 后玩法区里没有任何 `data-mini-action` 元素 |
| `xx：点一下有反应 ✗` | 点了第一步之后，`after` 那个契约元素没出现（交互没接上或报错挂掉） |
| `xx 8 秒内没摆上来`（dev:check） | 板屏没打开 / 数值签没数 / 描述符缺字段 |

## 四、现在有哪些支 / 换一版 / 加一支

`manifest.js` 的 `GAMES` 就是清单（当前 **14 支**）：`bendhook` · `goldenhook` · `nightschool` ·
`candy-share` · `sentry-watch` · `mud-gomoku` · `luding-chain` · `snow-grab` · `pontoon-night` ·
`rally-river` · `skim` · `weave` · `antiphony` · `cipher`。

1. **换一版**（拿到新实现）：新源码覆盖进 `src/`（或替换这一层对应的插件文件）→
   `npm run intake:minigames` 重接缝合点（幂等）→ 核 `id` / `actions` 有没有变
   （变了就同步描述符、`qa-board.mjs` 的 `specs` 与 `driver.mjs` 的 `case`）→ `npm run qa:board`。
2. **加一支**：接线口径（插槽表 / 四处缝合点 / 欠账）以
   [`../../../docs/MINIGAMES-INTAKE.md`](../../../docs/MINIGAMES-INTAKE.md) 为准——玩法平台里"加一支"只需
   `manifest.js` 两行；要进**主线**还得在流程层（`flow/games-flow.js`）按槽接一次。

**不用改**：`modules/games/index.js`（宿主）、`kernel/`、内部装配清单。
