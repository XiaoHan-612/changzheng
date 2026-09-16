# 接同事的玩法：插槽、缝合点与欠账

> **这一页是"玩法怎么进主线"的唯一入口。** 同事的小游戏是**单独开发**的一条线
> （他们自己的写法、自己的 audio.js、自己的注册表），我们把它们**薄适配**进
> [`modules/games/`](../public/js/modules/games/) 的插件契约——玩法逻辑一个字没动。
>
> 他们那两份交接包（文档 + 完整检出）归档在仓库外的 `_archive/handoff-minigames-v1｜v2/`，
> 不进 git；要接的东西已经拷进工程（见下表"源码"一列）。

## 一、插槽对照表（十支都在，`qa:board` 逐条对账）

| 我们的槽（`play(id)` 的 id = `data-mini`） | 落点（位置不变） | 源码（`modules/games/src/`） | 卡片 id | 动作词（`data-mini-action`） |
|---|---|---|---|---|
| `bendhook` | 第四幕·草地（钓鱼前置） | `minigames-needle.js` | `bendhook` | heat · bend-body · bend-tip · done |
| `goldenhook` | 第四幕·草地：钓鱼热点 + 强制链 | `minigames-fishing.js` | `goldenhook` | cast · recast · hook · reel |
| `nightschool` | 第二幕遵义 / 第四幕草地：夜校热点 | `minigames-school-entry.js` + `-school.js` + `-school-quiz.js` | `nightschool-entry` | pick-lamp · pick-quiz →（子玩法）aim · begin · douse ∥ answer |
| `candy-share` | 第四幕·草地：分糖热点 + 强制链 | `minigames-candy.js` | `candy-share` | ask · give · keep · confirm |
| `sentry-watch` | 第四幕·草地：夜岗热点 + 强制链（带口令） | `minigames-sentry.js` | `sentry-watch` | answer · lamp |
| `mud-gomoku` | 第四幕·草地：两个小鬼 | `minigames-gomoku.js` | `mud-gomoku` | level · handicap · fair · spectate · place · urge · resign · next · again · ai |
| `luding-chain` | 第三幕：强制链 `ferry → luding` | `minigames-luding.js` | `luding-chain` | start · cling · lay · cover |
| `snow-grab` | 第四幕·雪山：陡坡热点 | `minigames-grab.js` | `snow-grab` | leg · bare · throw · pull · foot0 · foot1 · foot2 |
| `pontoon-night` | 第一幕（于都河）：浮桥热点 + **强制链** `forced:["pontoon"]` | `minigames-pontoon.js` | `pontoon-night` | mode-boat · mode-plank · lamp · seg · anchor · reinforce |
| `rally-river` | 第一幕（湘江）：**新增**热点「东岸还有人」（`escort` 不动） | `minigames-rally.js` | `rally-river` | search · callout · ferry |

**唯一真源**：id / 题名 / 动作词写在**各自卡片**（`XXX_MINIGAMES[0]`）里，
我们的插件文件（`modules/games/<槽>.js`）只做三件事：读卡片、注入宿主能力、给数值签初值。
`qa:board` 的**三方对账**（清单 ↔ 体检表 ↔ 页面真实 `data-mini-action`）保证三处不漂。

## 二、四处缝合点（`npm run intake:minigames`）

同事下次更新玩法，把文件丢回 `public/js/modules/games/src/` 再跑一次收料工具即可（**幂等**）：

| # | 他们那条线原来是 | 我们要求 | 工具怎么改 |
|---|---|---|---|
| ① | `import { audio } from './audio.js'` + `audio.playSfx(name)` | 玩法不碰音频门面，声音只走总线事件 | 删 import，`playSfx(` → `SFX(`（宿主 `ctx.sfx` 注入） |
| ② | 自带 `stats(host, rows)` 往元素里写 | 数值签归宿主唯一实现 | 只换函数体 → `STATS(items)`（`ctx.stats` 注入，返回句柄） |
| ③ | `import { decide } from './ai-client.js'` 自己 POST | **模型调用归流程层**（预算/账目/重试在 `modules/ai`） | 删 import，`decide(` → `DECIDE(`（流程层注入，见 `flow/games-flow.js` 的 `decideFor`） |
| ④ | 自清靠"检测容器断开"，Promise 不 settle | 宿主 `ctx.board.onExit` + Promise 必须落地 | 工具插入 `bindHost()` 出口；`adapter.js` 在装配时接管收尾 |

`npm run dev:check` 已含 `intake:minigames:check`：谁把没接缝合点的源码丢进来，快检当场红。

## 三、模型调用（四类，都在我们的账上）

`candy_scene` · `gomoku_move` · `school_lesson` · `school_quiz`（另有 `minigame_review` 是原有类别）
——已登记在 [`modules/ai/registry.js`](../public/js/modules/ai/registry.js)（每类预算/温度）与
[`server/schema.js`](../server/schema.js)（字段契约），提示词分支在 `server/ai.js`；
`npm run qa:ai` 做三方对账。玩法那边自带 10 秒窗口与"没答就用固定内容"的兜底（见 `HANDOFF-CANDY.md`），
所以**模型慢了也不影响一局玩完**。

## 四、欠账清单（明确记着，别当没看见）

| # | 欠账 | 说明 | 建议 |
|---|---|---|---|
| 1 | **注入样式没过 token** | 每支自带 `<style>`（`sminiN-*`，含颜色字面量）——`qa:tokens`/`qa:frames` **扫不到 JS 内联样式**，等于绕过了视觉守卫 | 打磨批：把样式搬进 `components.css` 并按 tokens 改写，同时把 `qa:tokens` 的扫描扩到 JS 内联 `<style>` |
| 2 | **`miniTruth` 真值可见** | rally 把"哪个方向有人/有敌情"整条写进 `data-*`，F12 能看（那支玩法就是信息判断） | 用 `isDevToolsOn()` 包一层再写 |
| 3 | **`CHOICE_SETS.cross` 成死代码** | 浮桥改成玩法后，原来的"过河抉择"文字选项没人引用了 | 观察一局确认没回退需求后删掉 |
| 4 | **同事的 `qa-*.mjs` 还没并入 npm** | 已复制到 `tests/manual/minigames/`，但它们的入口还指着他们的调试台（`/dev/minigame-lab.html`，我们树里没有） | 逐支改成 `__czScreens.mini('<槽>')` 入口，再进 `package.json` |
| 5 | **两份 dev 网页没进工程** | `playground.html` / `minigame-lab.html` 依赖 16 个我们树里不存在的模块 | 等玩法全接完再定：改造（读我们的 manifest）或弃用 |
| 6 | **未接入** | `sandtable`（沙盘，用户已叫停）· `soup`/`roster`（不在重做清单）· `stretcher-run`（被 `rally-river` 取代）；`nightschool-entry` 的竞答分支（`pick-quiz`）随入口自动可用 ✓ | — |
| 7 | **同事文档按旧架构写** | `01/03/04` 那批说"改 `minigames-registry.js` / `main.js` 的 doXxx"，那是他们那条线的接线法；**我们的映射以本页为准** | 已归档在 [`docs/minigames/`](minigames/) |

## 五、验收（改完玩法跑这套）

```bash
cd changzheng
npm run intake:minigames:check   # 缝合点都在（幂等，也可再跑一次真正的收料）
npm run qa:board                 # 十支的板屏契约 + 三方对账（0 真调）
npm run dev:check                # 快检（含玩法板抽查，默认 bendhook / sentry-watch）
node tests/e2e/layout-audit.mjs            # 1280 逐屏（含十支玩法板）
node tests/e2e/layout-audit.mjs --width 820  # 窄屏：注意点按区 ≥32px（同事的版式偏紧）
npm run verify:fast              # 提交前
npm run verify:full              # 推送/交付前（真调一局）
```
