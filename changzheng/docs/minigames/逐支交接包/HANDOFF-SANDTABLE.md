# 《沙盘推演 · 往哪里走》交接包（act2 遵义）

> 生成于 2026-09-15。把这份文档整段粘进新对话，对方就能直接接手，**不需要再翻旧聊天**。
> 总纲见 `MINIGAME-REFORM.md`；这一支的细节看本文。

---

## 一、这是什么

项目是《长征·抉择》（Web 叙事游戏），可运行工程只有一处：`changzheng/`。

本次在做的事：把 **act2 遵义** 那一幕的「地图桌 · 辨路抉择」重做成一个**真的沙盘推演**。

**状态：原型完成，尚未接入主线。等用户验收后才接线。**

这是"14 个玩法逐个重做"里的第 2 个（第 1 个是钓鱼 `goldenhook`）。

---

## 二、文件清单

| 文件 | 作用 |
| --- | --- |
| `changzheng/public/js/minigames-sandtable.js` | 玩法本体，约 700 行，**自包含**（自带 h/stats/cssVar/palette，不 import 主线 `minigames.js`），导出 `SANDTABLE_MINIGAMES`，id = `wargame` |
| `changzheng/public/dev/minigame-lab.html` | 调试台，第 4 栏「精修玩法 · 沙盘推演」→ 点它单独跑 |
| `changzheng/tests/manual/qa-sandtable.mjs` | 验收脚本：三组打法对照 + 减动效可点性 + 契约自检 + 截图 |
| `changzheng/tests/e2e/artifacts/sandtable/` | 截图与日志（已被 .gitignore 排除） |
| `changzheng/data/acts.json` | act2 已有 `map`（地图桌·辨路抉择）与 `oillamp`（油灯下的地图）两个热点，接线时挂上去 |
| `changzheng/data/facts.json` | 史实文案：`h_zunyi`（遵义会议）、`h_chishui`（四渡赤水，现写的是"未做独立关卡"） |

---

## 三、怎么跑起来

```bash
cd "D:/HuaweiMoveData/Users/86196/Desktop/长征 - 副本/长征/changzheng"
node server/index.js
# 浏览器打开
http://localhost:3001/dev/minigame-lab.html
```
调试台用 `?v=Date.now()` 动态 import 防缓存，改完 JS 刷新就是最新。

**怎么玩**：点沙盘上亮起的纸旗 = 行军（花 1 格行军点）；点下面的牌子 = 派侦察兵（拨开沙，露出敌情）；
撞上封锁线/重兵会弹出「强攻 · 折损 N 个主力」与「后撤 · 白费 1 个行军点」二选一。
走到长江边的渡口（宜宾渡／泸州渡／江津渡）就算出去。

---

## 四、机制数值（都是调过的，别随手改）

| 项 | 值 |
| --- | --- |
| 行军点 | 9 格（走一步 1 格、后撤 1 格） |
| 侦察兵 | 2 个（探一处 1 个，不可再生） |
| 主力 | 3 个（结算分的主要来源，也是失败线之一） |
| 敌情 0/1/2/3 | 空档 / 前卫（免费打散）/ 封锁线（强攻折 1）/ 重兵（强攻折 2） |
| 计分 | 过江：`0.55 + 主力/3×0.25 + 余点/9×0.20`；没过：`0.10 + 最北到过的地方×0.14 + 主力/3×0.06` |
| 失败 | 行军点用尽未过江（`stuck`）／主力打到 0（`broken`） |

**每局重掷**：松坎 35%→封锁线、江津渡 30%→重兵、茅台 35%→空档、二郎滩 35%→封锁线、古蔺 25%→封锁线；
土城永远重兵、泸州渡永远封锁线。**所以"哪条路软"每局不一样，侦察兵才有用。**

两条路的结构：**东路** 遵义→娄山关→桐梓→松坎→綦江→江津渡（5 步，两道封锁线，末端是刘湘门户）；
**西路** 遵义→仁怀→{茅台 | 土城}→二郎滩→古蔺→叙永→{宜宾渡 | 泸州渡}（6 步，多半是空档）。

---

## 五、对照实测（三种打法，同一份代码）

```
node tests/manual/qa-sandtable.mjs
```

| 打法 | 结局 | 分 | 主力 | 余行军点 |
| --- | --- | --- | --- | --- |
| 先探后走（探 2 处，探到西路是空档） | crossed | **0.87** | 3 | 3 |
| 不探硬闯土城 → 后撤 → 绕茅台 | crossed | 0.66 | 1 | **1** |
| 不探，一路强攻（6 遍） | crossed ×5 | 0.72 | 1 | 4 |
| 不探，一路强攻（6 遍里的 1 遍） | **broken** | **0.22** | 0 | 4 |

地图每局重掷（4 处瓶颈概率化），所以绝对分有 ±0.1 浮动；**稳定的是排序和档位**。
一路强攻 6 次里约 1–2 次打光：娄山关 + 松坎 + 江津渡三道封锁线连打要折 4 个主力，而手上只有 3 个。

减动效可点性（`prefers-reduced-motion: reduce`）：`elementFromPoint` 命中纸旗自己、不带 `force` 的真点击把局面从遵义推到娄山关 → **通过**。
同批：`node --test tests/unit/*.test.js` 49/49 通过；`node scripts/lint-tokens.mjs` 0 处字面量。

---

## 六、契约

1. 签名 `runSandTableGame(container, opts) -> Promise<{score, detail, summary?}>`
2. `container.dataset.mini = 'wargame'`、`dataset.miniState` = `move | contact | crossed | stuck | broken`
3. 可交互元素带 `[data-mini-action]`：`visit`（行军，附 `data-node`）/ `scout` / `storm` / `withdraw` / `back`
4. 离开板屏自清：`AbortController` + 每帧 `document.body.contains(container)` 检查

额外可观测状态（时序/自动化靠它）：
`miniMarch / miniScouts / miniTroops / miniAt / miniFoe / miniPath / miniPhase`

---

## 七、画面（这一版的重点）

- 夜里的屋子，只有右上角一盏油灯（灯罩 + 火苗 + 落在沙上的暖光），越往左下越暗
- 木托盘里是**沙**：颗粒、耙痕、深浅不匀的几处；山是堆起来的沙脊（迎光略亮、背光压暗、带等高圈）；
  河道和路都是手指划出来的沟（迎光一边亮、背光一边暗）
- 地名是插在沙里的**小纸旗**（楷体、微微歪着、底下有杆影）；「长江」「赤水河」直接写在沙上
- 未侦察的敌情 = 沙上鼓起的一个**小土包**；侦察兵拨开沙、扬起一撮沙，底下的敌旗才升起来
- 我们走的路线是留在沙上的沟痕（回撤也留着 —— 四渡赤水那种来回走）
- 主力 = 沙上插的**红旗 + 三枚木棋子**；打掉一个主力，沙盘上就少一枚棋子（不是数值条在动）
- 静态底（沙粒/沙脊/河道/路）一次性画进离屏 canvas 缓存，每帧只贴图 + 画会动的部分

---

## 八、已完成 / 还没做

**已完成**
- 三条决策线（探哪里 / 走哪条 / 撞上以后强攻还是后撤）、两条失败线
- 地图每局重掷，逼侦察而不是背地图
- 沙盘画面全套（见 §七）、侦察扬沙动画、敌旗升起、棋子随损失减少
- 修掉"同一个关卡收两次折损"（`n.cleared`），以及"打光了却标着已打通"的自相矛盾
- 修掉"自己站的城市底下还画着'敌情不明'的沙包"（到达即视为已知，出发地 `kind:'start'` 也算已知）
- 调试台支持 `?mini=<id>` 直接打开某个玩法（`/dev/minigame-lab.html?mini=wargame`）

**没做 / 待定**
- 未接主线（用户验收后才接）
- 音效只用了 `audio.js` 的 `click / thud`，可加"行军/涉水"之类
- 移动端触屏：纸旗按钮本身可点，但没专门适配小屏
- 玩家看不到"自己还剩几步能到最近的渡口"的提示 —— 可能需要在验收反馈里补

---

## 九、验收通过后怎么接线

> **2026-09-15 更正（原先写错了）**：本节原来写"act2 已经有 `map`/`oillamp` 两个热点，挂上去即可"。
> 复核后不成立——这两个热点**已经被文字抉择占用了**，`map`→`CHOICE_SETS.direction`（forced，必做），
> `oillamp`→`CHOICE_SETS.oillamp`，都是模型判的 3 选 1。**要挂玩法就得替换掉其中一个，不是"挂上去即可"。**
> 另：act2 目前**唯一**能进的小游戏是 `school`（夜校识字），玩法 `wargame` 全文只出现在 docs / 调试台 /
> 自检脚本里，`acts.json`、`main.js`、注册表**零引用** —— 也就是说它现在在游戏里根本点不进去。

1. **落点选 `oillamp`，不要选 `map`。**
   - `map`（地图桌·辨路抉择）是 `forced:["direction"]` 的主抉择，3 个选项是**立场题**
     （「开个会定方向」/「听上面的就行」/「我只想知道明天往哪走」）——它是这一幕的立意，**不该被玩法替换**。
   - `oillamp`（油灯下的地图·看清路再走）的 3 个选项是**情报信度题**
     （「照着地图找渡口」信图 /「出门问当地的老乡」信活人 /「按原路折回一段」）——
     跟沙盘里的**侦察/情报机制是同一个主题**，换上去是同题升级，不突兀。
2. `data/acts.json`：把 `oillamp` 那条热点从 `kind:"choice", action:"oillamp"` 改成 `kind:"wargame"`；
   同时在 `main.js` 的 `HOTSPOT_HANDLERS` 加一行 `wargame: (act) => doWargame(act)`（新增玩法只加一行，不动主流程）。
   **注意 `hotspotSpent`**：热点用一次就置灰。若替掉 `oillamp`，那一幕就少一个文字抉择，需决定是
   "直接替换"还是"先给 `oillamp` 抉择、抉择完再进沙盘"。
3. `public/js/minigames-registry.js` 加一行：
   ```js
   {
     id: 'wargame',
     title: '沙盘推演 · 往哪里走',
     family: '决策',
     run: (host, opts = {}) => runSandTableGame(host, opts),
     states: ['move','contact','crossed','stuck','broken'],
     actions: ['visit','scout','storm','withdraw','back'],
     act: 'act2 · 遵义',
     note: '……',
   }
   ```
   再在顶部 `import { runSandTableGame } from './minigames-sandtable.js';`
4. `main.js` 加 `doWargame`（引入对白 / 结算叙事 / 契约标记 / 埋史实）——
   建议顺手做 `MINIGAMES.md` §三 说的 `playMinigame` 公共壳，别再抄第 9 份样板。
5. 老的 `runSandTable`（`minigames-story.js`）是否删除，**要问用户**。

### 接线前还要确认的事（跟史实绑在一起）

- act2 的 `date` 是 **1935年1月**；act3 是 **1935年5月**。**2 月–4 月整三个月没有幕**，
  而那三个月正是四渡赤水（1/29–3/21）、南渡乌江（3/31）、威逼贵阳、进军云南。
- 所以 v1 沙盘"从遵义一路推到长江边"不但时间错位，**落点本身也悬空**：
  act2 若要接沙盘，只能是"1 月底那一次判断"（青杠坡那一刻），
  而"四渡赤水"更适合做**填这三个月真空的独立一幕/独立玩法**，且它天然是 act3「金沙江」的前一幕。

---

## 十、这位用户的协作偏好（务必遵守）

1. **改完一版立刻给他看**，不要先跑长流程验证（他明确嫌慢）。语法过一遍就行。
2. **单独开发、验收后再接线**：新玩法先放独立文件 + 调试台分区。**不要直接改 `acts.json` / `main.js` /
   `minigames.js` / 注册表。**
3. **要"真"**：他评价"这是游戏还是只是点一下播个动画"。必须答得出"玩家的决策在哪、失败条件是什么"；
   画面要符合史实，不要抽象示意图。
4. **给证据**：要具体数字和结论（本支给的是最新一轮 0.87 / 0.66 / 0.72 / 0.22 那张对照表，
   并注明地图重掷导致的浮动范围）。

---

## 十一、这个仓库的几个坑

- **同一文件不要并行发多个 Edit**：会互相覆盖，只有最后一个生效（真踩过，表现为"文件一半新一半旧"）。
- **`npm` 在这个 bash shim 里跑不了**（`/usr/bin/env: bash: No such file or directory`）：
  直接调脚本，如 `node --test tests/unit/*.test.js`、`node scripts/lint-tokens.mjs`。
  shim 还缺 `ls/tail/head/dirname`，用 `node -e` 代替。
- **浏览器缓存**：静态资源 `max-age=3600`，调试台已加时间戳；主线页面要 Ctrl+Shift+R。
- **本机没有 Google Chrome**：Playwright 用例硬编码 `channel:'chrome'`，要跑得手动指定
  `%LOCALAPPDATA%\ms-playwright\chromium-1223\chrome-win64\chrome.exe`。本支的脚本已经自动找。
- **截图脚本结尾 `browser.close()` 偶发被 SIGTERM**：截图与日志其实已完整，不影响。
- **CSS 层序**：屏内 `*-bg` 是 `position:absolute`，会盖住 static 内容盒；
  带背景层的新屏必须给内容盒 `position/z-index`，否则 `prefers-reduced-motion: reduce` 下全点不动。
- **板屏测试别用 `click({force:true})`**：会把"元素被遮挡"整类缺陷屏蔽掉。
- **配置层**：`runtime-config.json` 覆盖 `.env`（见 `server/config.js:40-53`）。
