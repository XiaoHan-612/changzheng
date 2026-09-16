# 小游戏总览 · 《长征·抉择》（重做批次）

> 这份文档回答一个问题：**这个项目现在一共有哪些小游戏、它们各自算什么游戏、代码在哪、
> 怎么单独跑、怎么接回主线。**
> 逐支的完整交接包在 `docs/HANDOFF-<NAME>.md`；玩法开发流程与坑位在 `docs/MINIGAMES.md`。

---

## 一、三条线（先说清楚"哪些进了主线、哪些没有"）

| 线 | 文件 | 进主线？ | 说明 |
|---|---|---|---|
| **主线注册表** | `public/js/minigames-registry.js` → `public/js/minigames.js` | ✅ 是 | 8 支。`main.js` 按注册表装载，`acts.json` 的 hotspot 指向它。 |
| **未接线新玩法** | `public/js/minigames-story.js` | ❌ 否 | 5 支（`bridge` / `stretcher` / `sandtable` / `soup` / `roster`）。自带 `h/mount/stats/cssVar`，导出 `STORY_MINIGAMES`。 |
| **精修·单独开发** | `public/js/minigames-<name>.js` 各一支 | ❌ 否 | 逐支重做的"真游戏"版。**新 id**（不复用主线 id），验收满意后才按各 HANDOFF 的 §六 接线。 |

**铁律**：精修版在用户点头之前，**不改** `acts.json` / `main.js` / `minigames.js` / 注册表。

---

## 二、全清单（27 支）

> 「决策」= 玩家的选择落在哪；「失败」= 输了是什么样。
> 这是验收的唯一尺子：**答不出这两行，就不算游戏，只是点一下播个动画。**

### act0 · 于都河（出发）

| 题名 | id | 版本 | 决策 | 失败 | 文件 |
|---|---|---|---|---|---|
| 搭浮桥（旧） | `bridge` | 新玩法·未接线 | 限时点门板 | 限时到 / 落板失败 | `minigames-story.js` |
| 夜搭浮桥（重做） | `pontoon-night` | 重做·待接线 | 5 条船下在哪几段 · 掐稳流窗下锚 · **攒够加固料再点「部队上桥」** · 报警时花 2 板加固 · 天亮前拆完 | 桥被冲开 2 次沉物资 / 拂晓没拆完暴露 | `minigames-pontoon.js` |

### act1 · 湘江（血战）

| 题名 | id | 版本 | 决策 | 失败 | 文件 |
|---|---|---|---|---|---|
| 担架急送（旧） | `stretcher` | 新玩法·未接线 | 前进 / 卧倒两键 | 被扫中 / 伤员没撑住 | `minigames-story.js` |
| 担架急送（重做） | `stretcher-run` | 重做·待接线 · **已被取代** | 抬着走（快·颠·失血快）还是放低（慢·稳）· 弹坑 · 换肩时机 | 伤员失血满 / 天亮才到渡口 | `minigames-stretcher.js` |
| **湘江东岸 · 收拢（重做）** | `rally-river` | 重做·待接线 · **取代 `stretcher-run`** | 读线索 → 这一刻搜一处还是渡一趟 · 有敌情那处**派人进去（两刻全接回）**还是**在外面喊（一刻只回一半）** | 8 刻用完天就亮 / 贪搜不渡**一个人也没过去** / 不做排除法硬扫，稳定掉到 **12/18** | `minigames-rally.js` |

> act1 原本的 `stretcher-run`（抬着人跑）被**否掉**了：这一章已经有一支"抬着人跑"的热点
> （`escort` 担架队）和一支 `stretcher`，再补一个就是第三遍同一件事。
> `rally-river` 换成这一章真正的问题——subtitle 是「代价」、theme 是「队伍为何还在」，
> 于是做**判断 × 时间账**。`stretcher-run` 文件保留可对照，**接线时接 `rally-river`**。

### act2 · 遵义（转兵）

| 题名 | id | 版本 | 决策 | 失败 | 文件 |
|---|---|---|---|---|---|
| 沙盘推演（旧） | `sandtable` | 新玩法·未接线 | 沙盘上选路线 | （原版是选择关） | `minigames-story.js` |
| 沙盘推演 · 往哪里走 | `wargame` | 重做·待接线 | 两个侦察兵只能探两处 · 主力往哪条路 | 行军点用尽 / 主力打光 | `minigames-sandtable.js` |
| 夜校 · 两条路（入口） | `nightschool-entry` | 重做·待接线 | 今晚认字还是竞答 —— 入口即决策 | （入口屏） | `minigames-school-entry.js` |
| 夜校识字 · 一灯油 | `nightschool` | 重做·待接线 · **需模型** | 一灯油只够认真教两个字，砍哪个 | 三个字都没教会 | `minigames-school.js` |
| 夜校识字 · 知识竞答 | `nightschool-quiz` | 重做·待接线 · **需模型** | 14 秒香头里认不认得出来 | 答错（会被当成对的记住） | `minigames-school-quiz.js` |

### act3 · 大渡河（飞夺）

| 题名 | id | 版本 | 决策 | 失败 | 文件 |
|---|---|---|---|---|---|
| 飞夺泸定桥（旧） | `luding` | 主线现行 | 缺口木板桥 + 跳缺口 | 掉下桥 | `minigames.js` |
| 飞夺泸定桥 · 攀链（重做） | `luding-chain` | 重做·待接线 | 攀一环 · 预警就贴铁链 · 走残存桥板（快但传不了贴链） | 中弹 3 次坠江 / 40 分钟表走完火封桥 | `minigames-luding.js` |

### act4 · 雪山草地

| 题名 | id | 版本 | 决策 | 失败 | 文件 |
|---|---|---|---|---|---|
| 金色的鱼钩（旧） | `fishing` | 主线现行 | 漂相三档判读 + 起竿时机 | 断线 / 脱钩 / 超时 | `minigames.js` |
| 金色的鱼钩（重做·第一人称） | `goldenhook` | 重做·待接线 | 漂相判读 + 起竿（甜区·断线·脱钩） | 断线 / 脱钩 / 超时 | `minigames-fishing.js` |
| 弯针成钩（旧） | `needle` | 主线现行 | 针弯成什么弧度 | 弯裂 | `minigames.js` |
| 弯针成钩（重做） | `bendhook` | 重做·待接线 | 针弯成什么弧度 | 弯裂 | `minigames-needle.js` |
| 夜校识字（旧） | `school` | 主线现行 · 需模型 | 分光 | 教不完 | `minigames.js` |
| 分糖（旧） | `candy` | 主线现行 · 需模型 | 糖给谁 | 自留 ≥2 / 最需要的人没拿到 | `minigames.js` |
| 分糖 · 红小鬼的三颗糖 | `candy-share` | 重做·待接线 | 2 次打听打听谁 · 3 颗糖给谁 | 自留 ≥2 / 最需要的人一颗没拿到 | `minigames-candy.js` |
| 夜岗（旧） | `sentry` | 主线现行 · 需口令 | 五个信号选一个 | （原版无失败） | `minigames.js` |
| 夜岗 · 五个信号 | `sentry-watch` | 重做·待接线 | 惊动 vs 漏 · 唯一的马灯照哪一条 | 惊动 ≥4 / 漏 ≥3 | `minigames-sentry.js` |
| 泥地五子棋（旧） | `gomoku` | 主线现行 | 五连 | 被连成五 | `minigames.js` |
| **泥地五子棋（重做）** | `mud-gomoku` | 重做·待接线 | 接不接让子 · 渗水怎么用来封线 | 被连成五子（平局算活着） | `minigames-gomoku.js` |
| 陡坡（旧） | `grab` | 主线现行 | 一根横条 + 三次空格 | 三次全空也有分 | `minigames.js` |
| **陡坡 · 拽住他（重做）** | `snow-grab` | 重做·待接线 | 解绑腿拧布绳（1.4s）还是徒手 · 出手长短 · 踩不踩踏脚孔 | 三次机会用完 / 张力满 / 他跌进雪槽 | `minigames-grab.js` |
| 分汤 | `soup` | 新玩法·未接线 | 一锅汤分给谁、分多匀 | （选择关） | `minigames-story.js` |

### act5 · 会宁（会师）

| 题名 | id | 版本 | 决策 | 失败 | 文件 |
|---|---|---|---|---|---|
| 花名册点名 | `roster` | 新玩法·未接线 | 点到最后你就知道了（回响关） | 无 | `minigames-story.js` |

**标记「重做·待接线」的一共 14 支**：本批（2026-09-15/16）完成 **6 支**，更早批次完成 8 支。

- **本批 6 支**：`mud-gomoku`（泥地五子棋）、`snow-grab`（陡坡 · 拽住他）、
  `luding-chain`（飞夺泸定桥 · 攀链）、`pontoon-night`（夜搭浮桥）、
  `stretcher-run`（担架急送）、`rally-river`（湘江东岸 · 收拢）。
  > ⚠️ 其中 **`rally-river` 是 2026-09-16 的替改**（详见上面 act1 表的说明）：
  > 它顶掉的是 `stretcher-run` 的位置，`stretcher-run` 文件保留可对照。
  > 也就是说本批实际交付 5 + 1 = 6 支，其中 1 支是替换。
- **更早批次 8 支**：`goldenhook`（金色的鱼钩）、`bendhook`（弯针成钩）、
  `nightschool` / `nightschool-quiz` / `nightschool-entry`（夜校三支）、
  `candy-share`（分糖）、`sentry-watch`（夜岗）、`wargame`（沙盘推演）。
  交接包分别在 `HANDOFF-FISHING.md` / `HANDOFF-NEEDLE.md` / `HANDOFF-SCHOOL.md` /
  `HANDOFF-CANDY.md` / `HANDOFF-SENTRY.md` / `HANDOFF-SANDTABLE.md`。

> **点名与分汤不动**：用户明确要求 `roster`（花名册点名）与 `soup`（分汤）保持原样，
> 本批未改 `minigames-story.js`（`git status` 可证）。

---

## 三、一支玩法长什么样

### 3.1 四点硬契约（缺一条自动化就没法驱动它）

1. **签名**：`runXxx(container, opts) -> Promise<{ score: 0..1, detail: object, summary?: string }>`
2. **状态**：`container.dataset.mini = '<id>'`、`container.dataset.miniState = '<局内状态>'`
3. **操作**：所有可点/可键元素带 `[data-mini-action="<verb>"]`
4. **自清**：离开板屏后动画 / 定时器 / `window` 监听必须自己停（`setInterval` 里查 `container.isConnected`）

时序类玩法还要额外暴露内部状态（`dataset.miniAim` / `miniShell` / `miniPos` …），
否则脚本没法对时——契约只强制 `mini`/`miniState`，其余是"能自动化的前提"。

### 3.2 自包含文件模式（重做版统一照这个写）

```js
import { audio } from './audio.js';           // 只依赖音频
function h(tag, attrs, kids) { … }            // 自带小工具，不 import minigames.js
function mount(container, node) { … }
function stats(host, rows) { … }
export function mulberry32(seed) { … }
export const <NAME>_MINIGAMES = [{ id, title, family, act, note, states, actions, noAi, run }];
{ const css = `…`; /* 前缀 sminiN- 防串味，运行时注入 */ }
```

**为什么自包含**：重做版要先能单独跑、单独调、单独验收；
`minigames.js` 那条线一行不动，接线时才好回退。

### 3.3 AI 政策（10 秒窗口）

- 玩法**默认 0 次模型调用**（`noAi: true`）。本批 6 支全是 0 次。
- AI 只活在主线 `minigame_review` 结算里；需要 AI 的玩法（夜校三支）走 `decideWithin` 的 10 秒窗口，
  超时/失败就用本地兜底，**绝不让玩家等模型**。

---

## 四、怎么单独跑一支

| 工具 | 地址 | 用途 |
|---|---|---|
| **玩法平台**（本轮新增） | `/dev/playground.html` | 27 支全在一页，按幕分组、可筛选、点开就玩。每张卡写着「决策 / 失败」。深链 `?id=snow-grab`。 |
| **玩法调试台** | `/dev/minigame-lab.html` | 单支细调：实时契约面板、局内观测量、契约自检、reduced-motion 下真点击。 |
| **QA 脚本** | `tests/manual/qa-<name>.mjs` | 逐支自动化验收（机制 / 打法分叉 / 契约 / 像素 / 截图）。 |

```bash
npm start                        # 起服务（localhost:3001）
npm run qa:gomoku                # 泥地五子棋
npm run qa:grab                  # 陡坡 · 拽住他
npm run qa:luding                # 飞夺泸定桥 · 攀链
npm run qa:pontoon               # 夜搭浮桥
npm run qa:stretcher             # 担架急送
npm run qa:rally                 # 湘江东岸 · 收拢（QA 42 项）
npm run sim:rally                # 收拢的难度模拟（8 套打法 × 4 种子，不烧模型）
```

> 浏览器类用例硬编码 `channel:'chrome'`，而很多机器**没有 Google Chrome**。
> 未抽出统一 launch 帮助函数前，临时办法见 `docs/MINIGAMES.md` / `docs/QA.md`
> （`--import` 预载模块拦 `chromium.launch` 注入本机 Chromium 路径）。

**跑法纪律（2026-09-16 定的，别踩）**：

1. **看日志里的汇总行（`【全绿】`/`【有红】`），不要看退出码。**
   本机 `node + Playwright` 的进程退出不稳定（同一段收尾代码有时秒退、有时挂住），
   外层 `timeout` 会因此报 `EXIT=124` —— 那是**假挂**，用例其实早就跑完了。
2. **长跑一律丢后台**（前台 bash 超 ~3 分钟会被 SIGTERM 且丢输出）。
3. 推荐用"**看到汇总行就收工**"的方式串跑四支，别傻等 timeout：
   ```bash
   node tests/manual/qa-$f.mjs >> log 2>&1 & P=$!
   # 轮询 log 里有没有 【全绿】/【有红】/【看门狗】，有就 kill $P，再跑下一支
   ```
   单支真实用时约 **50–120 秒**（不是十几分钟）。
4. 每支都带**看门狗**（到点 `process.exit(3)` 并打印 `【看门狗】`）—— 真挂死时靠它收尾，
   担架急送要跑 5 局完整对局，看门狗放宽到 14 分钟。
5. **计数要跟玩法本体对齐，别抄**：`A7` 那种"起手有几个作用元素"最容易抄错（浮桥 15 不是 3：
   12 个桥段各自也是作用元素）。断言失败时**先怀疑断言**，再去动玩法。
6. **驱动不能"点空一次就放弃"**（2026-09-16 浮桥踩到）：材料/冷却类玩法里，某一刻点下去可能是
   **合法空操作**。写死顺序 + 单次点击 + 见不对就 `break` 的驱动，会把一个健康的玩法表现成
   六处同时红。驱动一律**自适应**：每轮重看状态，够就点、不够就等。
   判据看**状态序列**——序列缺哪一环，就往哪一环的上游找。

**断言纪律（2026-09-16 加的，比跑法更值钱）**：

7. **观测窗口比一次 Playwright 往返还短的量，必须整段搬进页面里。**
   往返一趟 ≈ 一次 `page.click`（可见/稳定/可点三项检查，板上有入场动画时会等好几帧）
   ＋ 一次 `page.evaluate`，实际几十到几百毫秒。
   陡坡那支的张力条 **13/s × 100 点 → "低位"窗口只有 1~2 秒**，用往返取样本，
   等看到 `phase==='pull'` 时张力已经 86 —— 高低两个样本全落在红段上，
   断言变成"恒等于红"，连红四轮。把驱动 + 取样 + 等待**整段写进一次 `page.evaluate`**（零往返），
   低位样本实得 36~52，色差 74，一次就绿。
   同类高危量：0.16s 的释放判定、`BEAT_EVERY = 0.72s` 的亮窗、任何 10/s 级的进度条。
8. **"元素变灰了"这种断言要写清楚它排除了哪一种错。**
   只断言"灰了"，那么"因为别的原因灰的"也会绿。冷却/禁用类机制必须两头都验：
   **该灰的时段灰（含硬直结束之后仍在冷却）、该亮的时点亮**。
   担架那支原来的 `C5` 只验"点完 150ms 内 disabled" —— 1 秒硬直本来就够它变灰，
   所以 `SWAP_CD` 那个"常量声明了却从没赋值"的缺陷从它眼皮底下过去了。
9. **"玩法看着有画面"不等于在跑。** 渲染路径抛一次错 → rAF 不再排 → 永久冻在起点，
   dataset 上一点都看不出来。所以每支 QA 都要收 `pageerror` 并断言 **0 条**。
10. **写完断言要临时撤掉修复跑一遍，确认它真会红** —— 不然你只是在给"已经对的东西"盖章。
    推而广之：**还要证伪"这条断言测的是不是它该测的东西"**。收拢那支的 `F2` 本来数"画面左侧的暖亮像素"，
    看着是绿，其实**数的是画作四边的撕纸边**（`x<6%`），不是画里那堆火（真实位置 `x≈45%`）——
    用 PIL 把像素分布打出来才发现，改成只在火光窗口 `x∈[40%,56%] × y∈[42%,95%]` 计数才算数。

---

## 五、本轮实跑验收（2026-09-15/16）

**本轮五支重做玩法全部全绿**（`run6` 跑 stretcher/grab/luding，`run7` 跑修完报警节奏的 pontoon，
收拢单独一轮）：

| 用例 | 结论 | 关键数字 |
|---|---|---|
| `qa:gomoku` | 全绿 40 项 | B 段四打法分叉 1.00 / 0.12 / 0.72 / 0.20 |
| `qa:grab` 陡坡·拽住他 | **全绿 27 项** | 徒手完美 0.84 / 布绳 0.74 / 三把全空 0.15（分叉 0.69）· D5 张力条 低位(张力 52) r−b=21 vs 高位(84) r−b=95 |
| `qa:luding` 飞夺泸定桥·攀链 | **全绿 24 项** | 稳爬 0.877 / 不躲 0.2（坠江）/ 只躲不爬 0.25（火封桥）· 残板 r−b=68.8 vs 河水 −31.3 |
| `qa:pontoon` 夜搭浮桥 | **全绿 31 项** | 正确 0.85 / 不加固 0.15（`sunk`，报警 2 次）/ 不搭不拆 0.2（`exposed`）· 正确打法**确定报 3 次警** |
| `qa:stretcher` 担架急送 | **全绿 32 项** | 稳 0.771 / 贪 0.15（`died` 失血 103%）/ 只放低 0.2（`dawn`）· 换肩冷却 0.15s 灰 / 1.5s 仍灰 / 6.8s 放开 |
| `qa:rally` 湘江东岸·收拢 | **全绿 42 项** | 记线索找全 **18/18** / 不做排除法硬扫稳定 **12/18** / 贪搜不渡 **0/18**（`crossed=0`）· `sim:rally` 8 套打法 × 4 种子 · 火光窗口像素 >1500 |

五支共同的硬断言：**整局 `/api/decide` = 0 次**、**结算后 `[data-mini-action]` = 0**、
**整轮 0 次未捕获页面异常**（`pageerror`）、**`reducedMotion: 'reduce'` 下不带 `force` 的真点击**。

### 画面路线：画作当场景（本批 6 支中 3 支已切过去）

重做版最初都是**自绘 SVG**（陡坡 v2 的雪山、泸定 v1 的桥，都被用户否掉）。
本批把其中 3 支改成**引用现成油画当场景**——板屏底图直接用该幕的过场画，**一个像素都不重画**：

| 玩法 | 画作 | 怎么用 |
|---|---|---|
| `snow-grab` | `assets/scenes/snow_climb.jpg` | 放大 152.4% 再负偏移裁切（`overflow:hidden`） |
| `luding-chain` | `assets/scenes/luding_bridge.jpg` | 原样铺底，覆盖层是弹幕 / 铁链 / 桥板 |
| `rally-river` | `assets/scenes/xiangjiang_night.jpg` | 取 `y∈[290,872]` 一条横带（`CROP`），其余全是覆盖层（方向灯 / 渡口 / 留在东岸的人） |

另 3 支（`mud-gomoku` / `pontoon-night` / `stretcher-run`）仍是**自绘**路线——
棋盘、江面船阵、雪地急送，本来就没有对得上的画。
**新增玩法先查 `ASSETS.md` 有没有现成的画**：有就引用（省一次作画、且色调天生统一），没有才自绘。

---

## 六、怎么新增一支（照抄这条线）

1. 先查证史实（`WebSearch`）。落点、年份、归属、原话出处都要能写进 `HANDOFF-<NAME>.md`。
2. 写 `public/js/minigames-<name>.js`（自包含，**新 id**，前缀 `sminiN-`）。
3. 在 `public/dev/minigame-lab.html` 加一栏（HTML 面板 + import + ALL + `isXxx` + `fillList` + `select` 列表）。
4. 写 `tests/manual/qa-<name>.mjs` 五段（机制 / 打法分叉 / 契约 / 像素 / 截图），
   在 `package.json` 加 `qa:<name>`。
5. **跑它**。写完断言后**临时撤掉修复再跑一遍**，确认断言真的会红（否则等于没写）。
6. 把 27 支清单与 `playground.html` 的 `DECIDES` 补上这一支。
7. 写 `docs/HANDOFF-<NAME>.md`（旧实现薄在哪 / 文件清单 / 机制 / 史实 / 验收 / 接线 / 欠账）。
8. **给用户玩**。点头之后才按 §六 接线（改 `acts.json` + 注册表 + `main.js`，删旧 `runXxx`）。

---

## 七、已知欠账 / 下一步

- **14 支重做版全部未接线**（本批 6 支 + 更早批次 8 支）。接线是一次性动作
  （每支一处：注册表 + `acts.json` hotspot + 删旧函数），但**要等玩家逐支点头**。
- **`main.js` 的 `doXxx` 壳仍在写第 9 份样板**（32–45 行/个）。抽 `playMinigame` 公共壳是接线前的第一件事。
- **判定逻辑抽纯函数 + 单测**：`minigames.js` 1133 行至今零单测；重做版各自把纯函数导出了
  （如 `mulberry32`、常量表），但还没建 `tests/unit/minigames-*.test.js`。
- **画面只有 canvas 截图**，没有逐帧录屏；时序手感仍靠 QA 里的"真按键 + 真点击"覆盖。
