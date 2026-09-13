# 设计系统 · 战地手记

> 方向：**内容层是米黄做旧纸上的墨字，界面骨架是压暗的墨色，让插画透出来**。
> 插画是水墨淡彩 + 做旧纸，所以界面用同一套材质与色温；冷灰玻璃拟态一律不再使用。
> 遵循规则由脚本强制：`npm run qa:tokens`（不许新增字面量）、`npm run qa:fonts`（零回退）。

## 一、字体（五族自托管，跨机一致）

仓库原先没有任何字体文件，全靠系统字体栈——`Songti SC` 是 macOS、`SimSun` 是 Windows、Linux 全无，
同一份代码在三台机器上是三套字形。现在五族字体随包分发，**由 `tools/build-fonts.mjs` 生成**。

| 角色 | 族名 | 字体 | 覆盖口径 |
|---|---|---|---|
| 正文叙事、史实条目 | `serif` | Noto Serif SC 400/600 | 全字符集 |
| 对白、说话人、选项、标签 | `kai` | LXGW WenKai（霞鹜文楷 SC）400 | 全字符集 |
| 幕名、章节大标题、落款 | `display` | Ma Shan Zheng（毛笔楷）400 | 自撰字符集 |
| 史实回响、档案标签 | `archive` | ZCOOL XiaoWei（明朝）400 | 自撰字符集 |
| 数字、单位、英文 | `num` | EB Garamond 400/600 | 拉丁子集 |

- **字符集**：仓库自撰文本 ∪《通用规范汉字表》一级 3500 ∪ 日志里 AI 实际用字，落到 `tools/font-charset.txt`
  （全量约 3820 字）；`tools/font-charset-authored.txt` 是界面固定文案用的自撰集（约 1270 字）。
- **零回退**：每族的 CSS 回退链第二位都是**我们自己的 `serif`**，某族偶有缺字（如霞鹜文楷没有弯引号）
  会落到自带宋体而不是系统字体。`npm run qa:fonts` 逐字校验覆盖并做浏览器端抽样。
- **豁免**：emoji 与装饰符号（← ↑ → ↓ ↕ ♥ ⚠ ✓ ✗ 🎙 🔇 🔊）由系统彩色字体渲染，明确列为豁免并单独报告。
- **体积**：110 个 woff2，约 6.9MB（正文 1.6 / 对白 4.3 / 毛笔 0.6 / 明朝 0.5 / 数字 0.03）。
- **许可**：全部 OFL，可随包分发；出处与版权见 `public/fonts/README.txt`。
- **加载**：`public/css/fonts.css` 在 CSS 链首位，`font-display: swap`；`/fonts` 长缓存 7 天。
  （字体按 unicode-range 切片，逐文件 preload 无意义，故不做 preload。）

重新生成：`npm run fonts:build`（从 jsDelivr 与 Google Fonts 按字子集接口拉取，产物提交进仓库，`npm start` 无需构建）。

## 二、Tokens（`public/css/tokens.css` 是唯一来源）

- **纸**：`paper-0/1/2`、`paper-edge`、`rule`（墨线）、`rule-strong`
- **墨**：`ink-0/1/2`（文字）、`ink-bg/ink-bg-2`（压在插画上的骨架）、`ink-line`
- **强调**：`seal`（印章朱红）、`seal-bright/deep`、`gold`（旧金）
- **语义**：`risk-low/mid/high`、`ok`、`bad`
- **材质**：`paper-tex`（复用 `echo_paper.jpg`）、`crease`（折痕）、`grain`（纸纹）、四档投影
- **间距**：`sp-1..7`＝4/8/12/16/24/32/48
- **排版阶**：`fs-display/h1/h2/h3/body/label/micro`、`lh-tight/normal/loose`、`ls-title/label`
- **层级**：`z-bg/hud/sheet/overlay/toast`
- **动效**：`dur-fast/base/slow`、`ease-out`、`ease-stamp`

## 二点五、框架：7 个整页模板 + 一套区块

推倒重做后，CSS 只剩四层：`fonts.css`（生成）→ `tokens.css`（**只有变量**）→ `base.css`（重置与工具类）→ `framework.css`（模板 + 区块 + 动效）→ `components.css`（材质词汇 + app 组件）。
材质（`.paper-surface` / `.ink-surface` / `.rule-ink` / `.seal-mark`）定义在 `components.css` 的材质段，样板页与游戏共用同一份；
`tokens.css` 只回答"值是多少"，不回答"长什么样"（早先版本把类写在那里，与上面两处重复，已上移）。
旧的 `style.css / cinema.css / minigames.css / sandbox.css` 已删除。

| 模板 | 用于 | 纸面占比实测 |
|---|---|---|
| `tpl-title` 全屏题字 | 标题页、过场、岔路 | 0%（标题）· 9.1%（过场）· 0%（岔路） |
| `tpl-panel` 中央面板 | 怎么玩、设置、史实、记录、答辩、答题、夜间、终局 | 19.0%（怎么玩）· 33.5%（设置）· 33.5%（史实档案） |
| `tpl-stage` 舞台 + 底部纸卷 | 对白、抉择、结果 | — |
| `tpl-side` 侧栏手记 + 画面 | 营地 | 0%（营地侧栏改墨纱后不再计纸面） |
| `tpl-board` 玩法板 | **8 个玩法全在上面**（钓鱼+弯针、夜校、分糖、夜岗、五子棋、泸定桥、陡坡）。壳由 `main.js` 的 `openBoard()` 起头，玩法状态用区块 `.blk-stat` 写进板头 | 14.9% 弯针 · 29.7% 钓鱼 · 28.7% 夜校 · 21.8% 分糖 · 28.7% 夜岗 · 27.7% 五子棋 · 26.8% 泸定桥 · 15.9% 陡坡 |
| `tpl-drawer` 抽屉浮层 | 手记、史实回响、篝火菜单 | 22.4%（手记）· 33.5%（回响） |
| `tpl-world` 世界面板 | 自由行军沙盘。**主列是宽 620 的阅读列**（批五：原先铺满整屏，纸面实测 64.9% 超预算） | 19.9%（阅读列 + 贴合内容的纸面，上限 64vh） |

**定位契约（三条，都是踩过才写下来的）**

1. `tpl-title .tpl-layer`：压在插画上的整屏可点层（岔路点位这类）必须挂在这个类上，它相对**整屏**定位。
   放进 `.tpl-body` 这类居中内容盒里，`inset: 0` 的参照系会变成内容盒，整层塌成内容尺寸、百分比坐标挤成一团。
2. `.ink-surface` 声明的子树里，区块自动换纸色系（kicker 转旧金、title/body 转纸白、lead/note 转纸灰）——
   与 `blk-stat` 落在纸面上自动换浅纱是同一个思路：**面决定色，类不重复**。
3. 抽屉（`tpl-drawer`）与中央面板（`tpl-panel`）共用 `--panel-w-wide / --panel-h` 这一套面积预算。
   回响卡原先只受 `max-height: 88vh` 约束，模型文案一长纸面就飘过 35%（实测 35.2%），已并入预算。

区块（`blk-*`，样式只在 `framework.css`）：kicker / title / lead / body / choice / stat / actions / btn / note / rule / list / card / seal / portrait / progress。
`blk-stat` 是**数值签的唯一实现**（顶栏 / 夜间 / 终局 / 样板页共用）：标签走 `kai`、数字走 `num` 且 `tabular-nums`、数字比标签大一档；
默认墨纱（叠在插画上），进入 `.panel/.sheet/.journal/.echo-cinema/.paper-surface` 时自动换成极淡墨底 + 墨字；
状态只改描边与底纹（`.warn` 朱红描边 + 淡淡朱纱、`.good` 旧金描边、`.off` 降透明度），**数字恒为高对比前景色**——不允许出现五颜六色的数字。

**动效（五个标准效果 + 微视差）**：关键帧与工具类都在 `framework.css`，但"定义"不等于"接上"——每个效果的**接线位置**见下表。

| 效果 | 挂在哪 | 谁负责挂 |
|---|---|---|
| `ink-in` 墨显 | 舞台正文 `#stage-panel`、对白 `#dlg-body` | `setStagePanel()` / `say()` 调 `replayAnim()` |
| `.anim-stagger` 逐条入场 | 选项 `#ch-opts`、回响两栏、手记两列、`#facts-list` | `askChoice()` 与各列表渲染处 |
| `sheet-rise` 纸卷上滑 | `tpl-stage / tpl-board / tpl-drawer` 的内容面**真正入场**时 | `showScreen()` 按模板选（见下方第 3 条） |
| `seal-stamp` 钤印 | 回响印章 `.echo-seal` | 组件自身 CSS |
| `scene-wipe` 换幕抹擦 | 过场屏 | `runCutscene()` 调 `wipe()` |
| `ember` 余烬 | 营地热点、行程当前节点、告急启程键 | 组件自身 CSS |
| 微视差 | 封面 `.title-bg`、营地 `.pano-img` | `bindParallax()`（位移 ≤8px，只动 `transform`） |

`prefers-reduced-motion` 下**位移类全部关掉、只留淡入**（`--motion-scale` 归零），循环类（余烬、钤印）也在组件层显式关掉——
关它们的规则必须写在 `components.css`：写在 `framework.css` 会被后加载的同名声明盖掉，等于没写（2026-09-13 修，`qa:motion` 有两条断言看着）。
验收靠 `npm run qa:motion`：动效截图拍不到，只能量计算样式——animation-name 是否为预期、逐条入场延迟是否 0/60/120ms、减动效下位移与循环动画是否真的关掉。
三条踩过的坑：**居中元素必须用 `fade-in` 而不是 `ink-in`**（后者的 keyframes 把 `transform` 收成 `none`，会吃掉 `translateX(-50%)`）；
**同一元素重复渲染要重放动画必须"摘类→强制重排→挂类"**（浏览器不会因为内容变了就重启动画），实现只有 `replayAnim()` 一处；
**屏入场只在"确实从隐藏转为可见"时重放**——交谈每轮都会重渲染舞台屏，按旧写法每轮都重放一次纸卷上滑，读起来像"又换了一屏"（现在 `showScreen()` 先记 `entering` 再决定，2026-09-13 批三）。

## 二点六、色调指标（`npm run qa:tone`）

| 指标 | 要求 | 当前 |
|---|---|---|
| 墨字对纸底 | ≥7:1 | 8.41:1 |
| 纸面对插画暗部 | ≤9:1 | 7.75:1 |
| 纸面占屏（逐页） | ≤35%（1280 桌面档） | 批一：标题 0% · 怎么玩 19.0% · 设置 33.5% · 过场 9.1%　／　批二：营地 0% · 手记 22.4% · 史实 33.5% · 回响 33.5% · 岔路 0%　／　批三：交谈 29.7% · 抉择 29.7% · 裁决 29.7% · 篝火 21.2%　／　批五：五子棋 27.7% · 泸定桥 26.8% · 陡坡 15.9% · 沙盘 19.9%　／　批六：出题 33.5% · 判分 33.5% · 篝火夜 30.2% · 当夜之后 21.2% · 终局 29.7% · 记录 33.5% · 答辩 33.5% |

面积这一项的两把尺子分开存：`tone-report.json` 是 `qa:screens` 在 1280 真机上量的**逐页预算**（`qa:tone` 只认这一份），
`tone-report-templates.json` 是 `qa:proof` 量的模板缩略图估算（缩略只有 400×250，比例必然被放大，只用于模板之间横向比较）。
早先两者写同一个文件的同名键，后跑的覆盖前一个，`qa:tone` 于是成了"最后跑谁看谁"。
`qa:screens` 的逐页记录是**累加**写进 `tone-report.json` 的（不会跑完第二批就把第一批顶掉），所以 `qa:tone` 一次能看到全部已测页面。

旋钮都在 `tokens.css` 顶部注释里标了【旋钮】：纸色三档、`--paper-veil` 透度、`--panel-w/--panel-h` 面积、`--tex-opacity` 纸纹、`--motion-scale` 动效强度。

## 三、组件规范（同一语义必须复用同一类）

| 类 | 用途 | 规则 |
|---|---|---|
| `.paper-surface` | 内容面（面板、纸卷、手记、回响） | 米黄纸 + 纸纹 + 折痕；文字 `ink-0` |
| `.ink-surface` | 压在插画上的骨架（HUD、顶栏、岔路题字） | 暖墨半透明；文字 `paper`；**子树里的区块自动换纸色系**（kicker 转旧金、title/body 转纸白、lead/note 转纸灰） |
| `.blk-stat` | 数值签、状态签（唯一实现） | 标签 `kai` 11–12px + 数字 `num` 15–16px 等宽；默认墨纱，落在纸面自动换浅纱；状态只走描边与底纹 |
| `.blk-choice` | 选项、菜单项（唯一实现） | 由 `step.js` 的 `choiceButton()` 产出（结构契约写在那个函数的注释里）：序号徽章 `.ic`、主文案 + `.ch-sub`、代价预告 `.ch-extra`（`.trend` / `.risk`）、键盘序号 `.kbd-hint`。容器只负责竖排（`.choices` / `.choice-row`） |
| `.blk-rule` | 分隔线（唯一实现） | 1px `rule`；`.rule-ink` 是它的旧重复实现，已删（全仓无人引用） |
| `.blk-seal` | 印章、钤记（唯一实现） | 朱红描边圆形，仅小面积；回响页的 `.echo-seal` 只负责**放在哪儿 + 钤印动效**，长相全走这个区块（`.seal-mark` 是旧重复实现，已删） |
| `.btn` / `.btn.primary` / `.btn.ghost` | 纸片 / 印章 / 幽灵 | 纸面里的按钮用纸片态；朱红只给"确认类"动作 |
| `.panel-head` / `.panel h2` / `.panel h3` | **面板系共用件**：中央面板的标题行 / 面板大标题 / 面板小标题 | 批六定：8 个 `tpl-panel` 屏（怎么玩、设置、史实、记录、答辩、答题、夜间、终局）共用这一份，**不要再各自换成 `blk-title`**——要么全换，要么都不换；半换就是两套（`report-cols h4` 已并入 `.panel h3`） |

排版角色：标题位用 `display`，说话人 / 选项 / 数值签标签用 `kai`，长叙事用 `serif`，数字与型号用 `num`（`tabular-nums`，数值切换时不左右跳动）。
数值签是"骨架"不是"内容"：它恒为墨纱系，不因为落在纸上就变回纸片——纸面只留给要读长文的地方。
两种小标题分工：`blk-kicker` 是**区块内**的小标题（朱红 + 下划线）；`.eyebrow` 是**整屏题字**的页眉小字（旧金 + 宽字距），只用于标题页 / 过场 / 终局这类整屏页。

## 四、无障碍与一致性判据

- 正文墨字对纸底对比度 ≥ 7:1，次级 ≥ 4.5:1（`qa:tokens` 与人工核对共同保证）。
- 浮层打开时隐藏底层纸面（`body.overlay-open`），只保留插画背景——否则纸压纸会糊成一片。
- 焦点环：2px 墨色描边；`prefers-reduced-motion` 下禁用位移与钤印动画。
- **一致性由 lint 强制**：颜色/字体/圆角不许写死；债务只减不增（`tools/token-baseline.json`）。

## 五、逐页打磨进度（25 页 · 6 批）

| 批 | 页面 | 状态 |
|---|---|---|
| 框架 | 色调 + 7 模板 + 区块 + 动效 + 守卫 + 样板页 + 批次一重做 | ✅ 已完成（`framework-proof.png` + `screen-sheet-1.png`） |

| 批 | 页面 | 状态 |
|---|---|---|
| 1 | 标题页、怎么玩、设置、过场 | ✅ 已按框架重做（见 `screen-sheet-1.png`） |
| 2 | 营地、手记、史实、岔路（+ 回响作为史实链条的同伴一并收） | ✅ 已完成（见 `screen-sheet-2.png`） |
| 3 | 舞台对话、抉择、回响、篝火菜单 | ✅ 已完成（见 `screen-sheet-3.png` / `screen-sheet-3-820.png`） |
| 4 | 钓鱼+弯针、夜校、分糖、夜岗（+ 新建 `tpl-board` 板屏） | ✅ 已完成（见 `screen-sheet-4.png` / `screen-sheet-4-820.png`） |
| 5 | 五子棋、泸定桥、陡坡、自由行军沙盘 | ✅ 已完成（见 `screen-sheet-5.png` / `screen-sheet-5-820.png`） |
| 6 | 答题、夜间、终局、记录/答辩 | ✅ 已完成（见 `screen-sheet-6.png` / `screen-sheet-6-820.png`） |

每批交付：该批代码 + `qa:tokens` 无新增 + 1280/820 截图 + 联系表 `screen-sheet-<n>.png`（820 档是 `screen-sheet-<n>-820.png`）。
命令：`npm run qa:screens -- <批次号>`、`node tests/manual/screen-sheet.mjs <批次号> --width 820`、`npm run qa:tokens`、`npm run qa:fonts`、`npm run qa:motion`；
窄屏另跑 `node tests/e2e/layout-audit.mjs --width 820`（自动报横向溢出 / 控件出界 / 点按区过小）。

批三同时把「选项」收成了单一实现：区块 `.blk-choice`（样式在 `framework.css`）+ `step.js` 的 `choiceButton()`（**唯一**构建处，`askChoice` / 篝火菜单 / 交谈快捷句 / 夜校内层选项都走它）。
`.btn.choice`、`.sheet-portrait` 已删除；代价预告（`.trend` 模型倾向 + `.risk` 作者风险标注）随选项块挪进 framework，避免再长出第二套选项。篝火菜单的属性（标题 / 退回键）仍是 `.panel` 系共用件，随批六的面板一起收。

### 批四做了什么（钓鱼+弯针 / 夜校 / 分糖 / 夜岗）

**① 给玩法一个真正的板屏（`tpl-board` 从"设计稿里有、代码里没有"变成在用）**
- 新屏 `#screen-board`（`index.html`）：板头是 `blk-kicker`（幕次+日）+ `blk-title`（玩法名）+ `blk-stat-row`（数值签），板身是 `tpl-body paper-surface`（面积由模板给：`--panel-w` 宽、`--panel-h + 6vh` 高）。
- 入口唯一：`main.js` 的 `openBoard({ title, bg })` + `mountMini(board, name, id)`（后者顺手 `markMini`）。五个玩法全走它，谁也别自己拼标题与数值签。
- 节奏：人物在**舞台屏**交代任务（立绘 + 一句对白）→ 切到**板屏**玩 → 结算切回舞台屏（`say()` 叙事 + 继续键）。舞台的立绘与对白、板屏的玩法区各归各的语义。
- 数值签落地（此前无处安放）：鱼篓/咬钩/竿（钓鱼）、进度（弯针）、第 x/3 关 + 识字（夜校）、还剩 + 已给出（分糖）、信号 x/5 + 得当（夜岗）。
- 离开板屏即清空玩法区与数值签（`ui.js`，与离开舞台屏清纸卷同一个理由：残留容器既会撞 id，也会让"元素存在即当前场景"判断出错）。

**② 顺手修掉四条"类名在、样式没了"**（框架重做时删了 `minigames.css`，这几个类没搬过来）
- 夜岗三个处置键用的 `.choice-btn` **CSS 里根本不存在** → 浏览器默认按钮；现走唯一的 `choiceButton()`（`keyboard:false`，文案写进 `.ch-text b`）。
- `.mg-hint`（分糖/夜岗/弯针）→ `.blk-note`；夜校的题面内联样式 → `.blk-body`。
- `.t-desc` / `.t-count`（分糖目标卡）→ 补进 `.target-card` 段（`--fs-micro` / `--font-num`）。
- 钓鱼屏的内联 flex 行 → `.blk-actions.center`；画布配色能对上 tokens 的改读 CSS 变量（`--ink-0/--gold/--paper-0/--seal`，字体栈也从 `--font-display` 读），剩下的水色与告警红写明"是这幅画自己的色"。

**③ 装备**：`__czScreens.mini(name)` 钩子（截图/体检用，玩法都在幕深处）；`npm run qa:board` 玩法板体检（板屏壳、数值签、契约标记、第一步可点、离开是否清干净——36 项）；`screen-sheet.mjs` 的 `BATCHES[4]`；`layout-audit` 增玩法板五屏巡屏；`qa:motion` 增"玩法板入场"断言。

### 批五做了什么（五子棋 / 泸定桥 / 陡坡 / 沙盘）

**① 三个玩法收进板屏**（与批四同一套写法：`openBoard()` + `mountMini()` + `stats(board.stats, …)`）
- 板头数值签：手数/局面（五子棋）、时间/状况/跌落/中弹（泸定桥）、机会/抓住（陡坡）。泸定桥的倒计时每帧都在变，所以 `stats()` 现在**返回句柄**（标签 → `<b>`），只改文本不重写 HTML——这是本批给工具函数加的唯一能力。
- 旧类清零：`.mg-title` / `.mg-hint` / `.mg-row` / `.score-line` / `.luding-hud` / `.luding-pad` 全部从 CSS 删除（动作行走 `.blk-actions`、提示走 `.blk-note`、状态走 `.blk-stat`）。

**② 三条"静默坏掉"的类，批五抓到并修了**
- **五子棋的石子从来没有颜色**：JS 加的是 `.p1/.p2`，CSS 里只有 `.wzq-cell.black/.white` ——两个类对不上，棋子一直是空圈。现统一走 CSS 里已有的 black/white。
- **`.grab-track` / `.grab-zone` / `.grab-marker` 三个类没有样式**（同 `.choice-btn` 那类事故）：陡坡的轨道/高亮窗/游标是裸 div。现已按 tokens 补齐。
- **沙盘三个类没有样式**：`.narr`（回合叙事，行军记录里也在用）、`.verdict`（可行性裁定签）、`.sb-person`/`.st`（队伍行）；另补 `.sb-form.rec`（录音态）。

**③ 三条体检抓出来的真问题**
- **数值签串写**：上一局残留的定时器（五子棋的 AI 落子）会往同一块 `#board-stats` 里写，把新一局的板头覆盖。修法：`openBoard()` **每局换一个新的数值签节点**，残留写入落在被丢弃的 DOM 上。
- **rAF 不停**：离开板屏后，钓鱼/泸定桥/陡坡的动画循环还在跑帧。现三处循环（含五子棋的定时器）都加"容器不在文档里就停"的守卫。
- **五子棋格子 28×28**：低于触屏体检的 32px 点按区门槛（`layout-audit --width 820` 会报）。改成 32，9×32+间隙=320px，620 宽的板身放得下。

**④ 沙盘的纸面预算**：主列原先铺满整屏，1280 实测**纸面 64.9%**（预算 ≤35%）。现收成一条 620 宽的阅读列（`tpl-world` 模板里定宽），纸面按内容伸缩、上限 64vh → 19.9%；行长也从"整屏宽"变成舒服的一段。

**⑤ 顺手修的两处对比度**：会师清点的 `mg-title + paper-dim` 与篝火夜结算的 `paper-dim`——都是"给暗底准备的纸色落在浅纸面上"，改成区块后是墨字。三处写死的告警色 `#e07a5f` 换成 `.txt-bad`（`--bad`）。

### 批六做了什么（答题 / 夜间 / 终局 / 记录与答辩）

**① 答题屏：选项归位到唯一实现**
- `#quiz-opts` 改成 `blk-choice-list`，选项由 `choiceButton()` 产出（序号进 `.ic` 徽章、键盘位自动带上）；
  题面走 `.blk-body`、反馈走 `.blk-note`、「看两个 AI 对答 / 继续」进 `.blk-actions`（继续键用 `.hidden` 显隐，不再写 `style.display`）。
- 判分态是**区块状态**：`.blk-choice.correct` / `.blk-choice.wrong`（只改描边与底纹，与 `.blk-stat.warn/.good` 同一口径）。
- `.quiz-q` / `.quiz-opts` / `.quiz-opt*` / `.quiz-result` 全部删除；键盘导航的选择器跟着换成 `#quiz-body .blk-choice`。

**② 终局屏：唯一一个突破面积预算的屏**
- `.end-panel` 原先 `700 宽 × 90vh`（纸面实测 **49.3%**，全站唯一超 35% 的页）。现与夜间/答题同档：`--panel-w × --panel-h` + 内容滚动 → **29.7%**。
- 动作行 `.end-actions` → `.blk-actions`；`.stats.big` 里的 `big` 是空类（早没实现），去掉；`.report-cols h4` 并入 `.panel h3`（面板小标题只有一条规则）。

**③ 记录与答辩**
- 修掉一处**类名对接错误**：来源标签 JS 输出的是 `class="src glm"`（两个类），CSS 写的是 `.src-glm`（一个类）——对不上，所以 `source=GLM` 一直是普通灰字。现在 JS 输出 `src src-glm`（约定与 `.risk.r-low` 一致），并补上 `.type` 的排版与 `.src-fallback` 的告警色。
- 记录行的第一段原先写 `class="head"` 而 CSS 等的是 `.row`（同样对不上，四段挤成一行）——改成 `.row`；顺手删掉没人用的 `.tag`。

**④ 面板头（批六定案）**：8 个中央面板共用 `.panel-head` / `.panel h2` / `.panel h3`，**不换区块**——理由写在 §三 组件表里：要么全换要么不换，半换就是两套实现。

**批六的装备**：`__czScreens` 增 `quiz / night / end / logs / defense` 五个钩子（长流程不另写渲染：钩子起真实流程，截图脚本在中途等）；`screen-sheet.mjs` 的 `BATCHES[6]` 取七屏（出题、判分、篝火夜、当夜之后、终局、记录、答辩）。

**目标环境**：Chromium 桌面；窄屏只保证到 **820**（平板 / 展馆触屏一体机），手机（375）不在交付范围内。
