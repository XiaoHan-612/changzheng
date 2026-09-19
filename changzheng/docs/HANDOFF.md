# 交接说明（Handoff）

> ⚠️ **本文件是总览。分工交接请看：**
> [`HANDOFF-CODE.md`](HANDOFF-CODE.md)（代码 agent）· [`HANDOFF-ART.md`](HANDOFF-ART.md)（生图模型）· [`HANDOFF-AUDIO.md`](HANDOFF-AUDIO.md)（音频/TTS 模型）· [`ASSETS.md`](ASSETS.md)（素材清单）· [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md)（视觉体系与逐批进度）· **小游戏这条线看 [`MINIGAMES-INTAKE.md`](MINIGAMES-INTAKE.md)**（插槽表 / 四处缝合点 / 怎么加一支 / 欠账）

> 给接力的模型/同学：这份文档说明**已经做完什么、还差什么、怎么验证、怎么接着干**。
> 所有自动化测试与守卫当前均为绿色；任何时刻停下都能按 §六 的清单移交。

## 零、接手第一步（5 分钟跑起来）

> 前提：先按 [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) **克隆仓库并配好提交身份**；每轮开工先 `git pull --rebase`。

```powershell
cd changzheng
npm install                 # 生产只要 express；playwright 只在跑测试时需要（--omit=dev 可省掉）
npm start                   # http://localhost:3001
```

1. **密钥**：`changzheng/.env` 不入库。首次接手把 `GLM_API_KEY` 写进 `.env`（模板见 `.env.example`），
   或在游戏内「设置」里填并点「测试连通」——两种都行，设置里的值会落到 `runtime-config.json`（同样不入库）。
2. **先验连通**：设置 → 测试连通，应显示耗时与 `source=GLM`。
3. **自动验收**（跑得过就说明环境对了）：`npm run test:unit && npm run qa:smoke`；
   `npm run test:e2e` 是一次完整五幕真调（约 76 次调用、5 分钟），改过代码后必跑。
4. **要动小游戏**：读 [`MINIGAMES-INTAKE.md`](MINIGAMES-INTAKE.md) —— 十支重做版已经接在**原来的位置上**
   （第一幕的浮桥、湘江东岸、夜校、分糖、夜岗、五子棋、泸定桥、陡坡、钓鱼前置）。
   加一支 / 换一版的路子：源码丢进 `public/js/modules/games/src/` → `npm run intake:minigames`
   （接四处缝合点，幂等）→ 在 `modules/games/<槽>.js` 里一行 `pluginFrom(...)` → `manifest.js` 两行
   → `qa-board` 的 specs 一行 + `driver.mjs` 一个 case → `npm run qa:board`。
5. **人工完整玩一遍的路线**：标题 → 研学模式 → 出身三选一 → 过场 → 营地（点光点：交谈一次、抉择一次）
   → 启程 → 知识对决 → 五幕走完。单局 **20–25 分钟**；赶时间选「快速演示」（约 18 分钟），
   重点看这几处：**热点用过即作废**（变灰「已看过」）· 玩法都在**玩法板**上（题名 + 数值签）·
   每步都有**史实回响**（你经历的 / 真实发生过的 / 虚构边界）· 第四幕幕末的**篝火夜**（需点亮 ≥3 条附身线）·
   终局的**研学报告**。
6. **坏了先看哪儿**：
   - 界面弹「模型调用失败」→ 点「重试」；连续失败看「设置 → 测试连通」和「记录」里那条 `source=ERROR` 的原因；
   - 一次真调 1.2–6 秒属正常（若换回赛制指定的 `glm-5.1` 约 11 秒/次）；**没有离线能力**，断网即报错（备选方案见 `OFFLINE-REPLAY.md`）；
   - **界面点了没反应、或行为像旧版本** → 先硬刷新一次（`Ctrl+Shift+R`）：浏览器可能还存着旧脚本。
     （服务端自 2026-09-14 起对页面/脚本/素材只发回源校验，不会再出现这种事；但**之前已经缓存过**的
     浏览器要硬刷新一次才认新头，实在不行换个 origin 打开，比如 `http://127.0.0.1:3001/`。）
   - 没声音 → 顶栏喇叭是否静音、浏览器是否拦了自动播放；控制台敲 `__czAudio` 看
     `wantedAmbient`（本该在响什么）/ `currentAmbient`（现在在响什么）/ `ambientEl.paused`，一眼分清是没恢复还是被静音；
   - 想单独复现某一屏 → 打开「设置 → 展示」后用 `window.__czScreens`（`show / mini / quiz / night / end / logs / defense`，见 `HANDOFF-CODE.md` 第 27 条）；顶栏的「记录 / 答辩」也要打开这个开关才显示。
6. **交接前实测过的形态**：干净克隆 + 复制 `.env` + `npm install --omit=dev` + `node server/index.js` 就能玩
   （首页与静态资源/字体/音频/acts 全 200，连通测试真调成功）——这也是便携包的最小形态（见 `DELIVERY.md`）。

## 一、项目现状

**《星火微光·我路过他们的长征》** — 网页端长征主题 AI 科普游戏，两种核心玩法并存：

| 玩法 | 入口 | 核心循环 | 状态 |
|------|------|----------|------|
| 五幕主线（VN） | 标题「研学模式 / 行军模式 / 快速演示」 | 暮色营地探索 → 决策 → 模型裁决 → 史实回响 → 启程 | 完整可通关 |
| 玩法板上的小游戏 | 主线热点 / 强制链按槽进入 | 舞台交代任务 → 板屏做题（时机/判读/对弈…）→ 回舞台结算 | **14 支已接线**（manifest 为准）：原 10 支 + skim/weave/antiphony/cipher；文档旧称「十支」以 manifest 与 `MINIGAMES-INTAKE` 更新后为准 |

交付形态两套，**跑的是同一份代码**：

| 形态 | 入口 | 说明 |
|------|------|------|
| 源码态 | `cd changzheng && npm install && npm start` | 开发、调试、自动化验收用 |
| **桌面版** | 双击 `长征-抉择.exe`（对外只发单文件版） | Electron 壳，自带 Chromium，不装 Node、不装浏览器；重建与验收见 [`../../packaging/README.md`](../../packaging/README.md) |

## 二、已完成

### 引擎与服务端
- `/api/decide`：契约表当前 **23 类** callType（唯一真源 `server/schema.js`；含主线 scene_gen /
  choice_hint / npc_chat / share_judge / minigame_review / branch_judge / quiz_* / night_* /
  act_review / ending_review / failure_review / study_report，以及玩法侧 candy_scene /
  gomoku_move / school_lesson / school_quiz / cipher_draft / skim_throw / antiphony_reply / weave_note 等。
  旧文档写「15 类」是旧口径）。
  **主线玩法收尾一律真调 `minigame_review`**（比赛口径：尽可能使用 API；卡片 `noAi` 只表示局内不调）。
- 两态日志：`GLM`（成功，具体模型看 `model` 字段）/ `ERROR`（重试用尽，附原因），每次调用落 JSONL；
  **没有 MOCK**。落库时盖 `contractOk` 契约戳记（`server/logger.js`），响应必过 `server/schema.js` 同一张表
- `/api/config` 读写模型与 Key，`/api/config/test` 连通测试，`/api/logs/clear` 重置

### 客户端
- 暮色营地（提灯跟随 + 行动点越少越暗）、电影事件卡、史实回响盖章
- **舞台屏**（立绘 + 对白 + 抉择）与**玩法板**（`tpl-board`：题名 + 数值签 + 玩法区）分工明确：
  人物在舞台交代任务 → 玩法在板上做 → 回舞台结算
- 行程缎带、手记（回望）、键盘 `1/2/3` 选、`J` 手记、`Esc` 关浮层
- 行军模式：体力归零 → 掉队失败结算；断粮幕间扣体力；高风险抉择可能留下一个人
- 答辩面板（按 call_type 聚合）、评委演示模式（右侧实时调用流）——都藏在「设置 → 展示」后面

### 视觉（纸墨设计系统，逐批打磨 25 页）
- **25 页 6 批已全部完成**：框架（7 模板 + 区块 + 5 标准动效 + 守卫 + 样板页）与批 1–6
  （标题/怎么玩/设置/过场；营地/手记/史实/岔路/回响；舞台对话/抉择/裁决/篝火菜单；
- 每批的联系表在 `tests/e2e/artifacts/screen-sheet-<n>.png`（820 档同名前缀 `-820`）；
  逐批做了什么、修了哪些事故记在 [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) §五
- 进度表、每批交付口径与守卫命令都在 DESIGN-SYSTEM §五；改界面先读 §三 组件规范与 §二点五 区块表，
  别在页面里新写样式（`qa:frames` 会拦）

### 日志与证据
- 仓库里入库一份**真实全程样本** `logs/sample-full-run.jsonl`（96 条、覆盖**当时全部 16 类**，零违约）——
  其中沙盘 `sim_turn` 属于**已删模式**（2026-09-15 删除自由行军），本版本的调用面是 **15 类**；
  样本保留原样（它是当时真调的留档，不是当前能力清单）
  运行时的按日日志不入库（见 [`../logs/README.md`](../logs/README.md)）
- `npm run qa:audit` → `docs/LOG-AUDIT.md`：本版本字段缺失 0、FALLBACK 0

### 桌面封装（2026-09-19）
- [`../../packaging/`](../../packaging/README.md)：把工程套一个**自带 Chromium 的窗口**，**不改任何游戏代码**。
  外壳只做四件事：挑一个空闲端口再起服务、开一个 1280×800 无地址栏无菜单的窗口、把会写盘的东西指到 exe 旁边的
  `user-data/`、把主进程日志写进 `user-data/启动日志.txt`。
- 出两件成品：便携版目录 `dist/长征-抉择/`（≈400MB）与**单文件版 `dist/长征-抉择-单文件版.exe`**（≈185MB
  ＝启动器 + 内嵌 zip + 版本戳；首次运行展开到 `%LOCALAPPDATA%\长征-抉择\app\`，之后双击秒开）。
- 验收：`packaging/verify-fast.mjs`（成品里的 `public/server/data` 与仓库工程**逐文件 sha256 相等** + 起得来 +
  资源齐 + 前端与调用链通）、`verify-packaged.mjs`（发布级，慢一些）；`--single --fresh` 验真实的「首次双击」。
- **产物不入库**（`dist/`、Electron 运行时与缓存都在 `.gitignore` 里）；**对外发布走 GitHub Releases 传单文件 exe**。
  外壳的具体行为、体积与签名等已知取舍见 [`../../packaging/README.md`](../../packaging/README.md)。

### 测试（当前全绿）

三层尺子（什么时候跑哪一档，见 [`QA.md`](QA.md) 开头）：

```powershell
# ① 改一处就扫一眼：约 16 秒、0 真调（总线规矩 / 单元测试 / 文档一致 / 内核启动 / 开局到营地 / 玩法板 / 输入 / 失败屏 / 升华 / 无报错）
npm run dev:check
# ② 提交前：上面那一套加动效、音频、素材、影音守卫，并行约 30 秒
npm run verify:fast
# ③ 推送与交付前：真调那一档（分钟级，需配好 Key）
npm run verify:full
```

单跑某一项时也仍然可以直接用原来的命令：

```powershell
npm run test:e2e     # 五幕真调通关：unit 之外的总验收（~76 次调用），含不重复结算等回归断言
npm run qa:failure   # 行军模式失败线（failure_review 真调）
npm run qa:av        # 影音运行时审计：资源 404 / 立绘 / 环境床 / TTS 解码
npm run test:unit    # 65 项：状态层 / 契约 / 配置层 / 减员 / 数值护栏 / 同伴一致 / 诗形制 / 玩法守卫
npm run qa:smoke     # 标题→营地→一次互动→回设置
npm run qa:board     # 玩法板体检 114 项（14 支玩法的板屏壳 / 数值签 / 契约标记 / 离开清空 / 三方对账）
npm run qa:ai        # 模型口径：策略表 ↔ 服务端 schema ↔ 日志三方对账（0 真调，读 logs/）
npm run qa:audio     # 音频逐个体检 58 个 + 场景表对账 + 诗的音频对账
npm run intake:minigames:check   # 14 支小游戏源码的缝合点还在吗（幂等检查）
npm run qa:tokens · qa:frames · qa:tone · qa:motion   # 视觉守卫：字面量 / 模板 / 纸面 / 动效
npm run qa:bus       # 总线守卫（模块化规则 + 内核运行时体检）· qa:handoff 交接文档一致性
```

当前结果（2026-09-19 复跑 `dev:check` / `test:unit` / `qa:board`）：unit **65/65** · board **114/114**（14 支）·
`dev:check` **10/10**（≈16s，0 真调）；其余为 2026-09-16 的战果：smoke PASS · motion 19/19 · bus 18/18 ·
e2e FULL PASS（真调）· failure / loss PASS · av AUDIT PASS · audio PASS · ai ✓ ·
tokens/frames/tone/handoff 全绿 ·
`layout-audit` 1280 与 `--width 820` 各 18 屏、均零布局缺陷
（**口径**：这些数字每次改完都会变，数字本身不是承诺；`npm run verify:fast` 绿才是"当前这棵树没问题"。）

## 三、还没做 / 已知缺口（按优先级）

> **v0.3 体验整改总方案见 [`V0.3-PLAN.md`](V0.3-PLAN.md)**（P0 已落地，P1/P2/P3 待做）。

| 优先级 | 缺口 | 说明 |
|--------|------|------|
| P0 | **`verify:full`（五幕真调一局）还没跑** | 14 支小游戏接完只跑到 `qa:board` + `dev:check`；"整局流程顺不顺"的最终凭据是 `npm run verify:full`（或 `npm run test:e2e`）。**接手第一条就跑它**，见 [`MINIGAMES-INTAKE.md`](MINIGAMES-INTAKE.md) §四 欠账 7 |
| P1 | **v0.3 玩法手感 P1×14** | 浮桥稳流窗 UI、陡坡 decide 冻结、钓鱼起竿窗、夜校触屏/键盘、统一放弃契约等——逐条见 `V0.3-PLAN.md` §3 |
| P1 | 玩法侧四项欠账 | 注入样式没过 token · `miniTruth` F12 可见 · `CHOICE_SETS.cross` 成死代码 · 同事 12 个 `qa-*.mjs` 还没并入 npm |
| P1 | 契约还差两处 | `runQuiz` 的「让两个 AI 对答」按钮与 `#quiz-auto` 靠 `data-choice-index` 兼职（建议走 `askChoice`）；`runRest` 只有一个「继续」，可直接 `waitContinue` |
| P1 | 数值平衡未调 | 测量口径已建（`npm run qa:playtest` → `docs/PLAYTEST.md`），调参待做；v0.3 已做 P2-4（第三次休息不调 AI） |
| P2 | v0.3 P2 其余 | 风险标签同源、营地目标 HUD、回响减负、篝火日限、quiet 覆盖等——见 `V0.3-PLAN.md` §4 |
| P2 | 移动端不做 | 窄屏只保证到 **820**（已逐屏体检）；375 手机档明确不在交付范围 |
| P2 | 操作音效仍是合成 | click/hook/echo 等由 WebAudio 合成；是否预录看路演音质要求 |
| — | ~~封装未定型~~ | **已落地（2026-09-19）**：Electron 桌面包，便携目录 + 单文件 exe，见 [`DELIVERY.md`](DELIVERY.md) 与 [`../../packaging/README.md`](../../packaging/README.md)；对外发布走 GitHub Releases 传单文件 exe |
| P3 | 离线回放（备选） | 现场无网/额度耗尽的风险预案，见 [`OFFLINE-REPLAY.md`](OFFLINE-REPLAY.md)，**未开发** |

## 四、接着干的话，从哪儿下手

1. **先跑 `npm run verify:full`**（真调一局五幕）——14 支小游戏接进来之后唯一还没验过的一档，
   也是"流程顺不顺、模块之间接得通不通"的最终凭据（欠账 7）。
2. **补两处契约**（`runQuiz` / `runRest`）——顺手就能做，做完 `test:e2e` 复验。
3. **数值平衡**：`qa:playtest` 跑几局看 `docs/PLAYTEST.md` 的曲线，按 HANDOFF-CODE 第 25 条同时改三处
   （钳制表 / 提示词 / 单测）。
4. **玩法侧欠账四项**（`MINIGAMES-INTAKE.md` §四）：注入样式过 token + 把 `qa:tokens` 扩到 JS 内联样式 ·
   `miniTruth` 用 `isDevToolsOn()` 包一层 · 删死代码 `CHOICE_SETS.cross` · 同事的 `qa-*.mjs` 改走
   `__czScreens.mini('<槽>')` 再并入 npm。

## 五、关键文件

> **架构**：前端按「内核 + 事件总线 + IP 模块」重写已完成（[`BUS.md`](BUS.md) 是接新模块/新玩法/新流程的唯一入口）：
> 批 1（内核地基）、批 2（audio + shell）、批 3（去越界 + 锁显式化）、批 4（state 唯一持有者 + HUD 订阅）、
> 批 5（玩法宿主变服务 + 玩法变插件）、批 6（ai 收编：每类预算 + 事件化 + `qa:ai`）、
> 批 7（`main.js` 2216 → **535 行组合根** + `flow/*` 九个文件；dev 门面归内核）均已完成。
> 每批一个提交、守卫全绿；`flow/*` 的模块地图与"加东西"的口径见 `BUS.md` §七 / §七点五。
>
> 音频相关（环境床 / BGM / 音效 / 语音）**正在按 [`AUDIO-SYSTEM.md`](AUDIO-SYSTEM.md) 重写成统一框架**：
> 设计稿已定、分批实施（骨架+静音模型 → 场景声明表+BGM → 注册表+试听页）。动手前先读那份。

```
server/
  index.js      路由（/api/decide /api/config /api/logs /api/tts）
  ai.js         提示词 + 真调 + 重试 + 契约校验（**调用点只有流程层，玩法不自调**）
  schema.js     响应契约唯一真源（REQUIRED / missingFields / contractStamp）
  logger.js     JSONL 落库（按日文件 + 会话镜像 + 契约戳记）
  config.js     .env / runtime-config.json 双层配置
public/js/
  kernel/       内核（bus/contracts/plugins/kernel/wiring/resources/snapshot/diag）——见 docs/BUS.md
  modules/      IP 模块（audio / shell / screens / state / hud / ai / cinema / games；见 docs/BUS.md 的模块表）
  main.js       组合根（启动、装配、内核起来之后 emit `app:ready`）——批 7 起只剩 500 余行
  flow/         流程层（act / camp / games-flow / end / quiz / night / …）：幕、营地、强制链、结算都在这儿
  modules/cinema/ 电影化演出（序章 / 幕间 / 终局升华）：player + beats + sequences
  modules/games/  玩法宿主 + 薄适配插件（每支 `pluginFrom(src, {...})`，玩法本体在 `games/src/`；清单以 `manifest.js` 为准）
  step.js       交互契约（step/askChoice/choiceButton/waitContinue/markMini）
  ui.js         渲染与浮层（showScreen 按模板选入场动效、板屏清空）
  state.js      资源/好感/失败判定/粮荒（可单测）
  audio/        音频框架（门面 / 混音表 / core / channels）——见 docs/AUDIO-SYSTEM.md
public/css/     fonts → tokens（唯一值源）→ base → framework（模板+区块+动效）→ components
public/audio/   环境床 / 音效 / BGM / TTS 缓存 / 预录台词 / 终局朗诵（poem/，随仓库走）
data/acts.json  五幕定义（热点、dayScenes、强制链、对决）
data/facts.json 史实卡（real / fiction 分栏）
data/poem.json  终局升华的诗与落款（**唯一真源**，见 docs/POEM-TTS.md）
logs/           入库样本 + 运行时日志（见 logs/README.md）
tests/          unit / e2e（Playwright）/ manual（体检脚本）；同事的 12 个玩法体检在 tests/manual/minigames/
```

> 仓库根还有两处与 `changzheng/` 平级、但**不属于工程本身**的东西：`packaging/`（桌面封装——外壳 `main.js`、
> 单文件启动器 `launcher.cs`、出成品的 `build*.mjs`、验收的 `verify*.mjs`；操作口径读它的 README）与
> `dist/`（封装产物，**不入库**）。另外 `changzheng/tools/build-portable.mjs` 是早期「便携 Node + `start.bat`」路线的
> 构建器，留档、未采用（见 [`DELIVERY.md`](DELIVERY.md) §二）。

## 六、每轮收尾清单（**每轮结束都做，做到随时能移交**）

1. **跑验收**：开工到收尾都跑 `npm run dev:check`（约 16 秒、0 真调——改一处就看一眼它绿不绿）；
   收尾时按改动涉及的层级跑 `npm run verify:fast`（提交前）与 `npm run verify:full`（推送/交付前，
   真调那一档）；服务端改动后必须看到测试输出 `restarted`（否则跑的是旧进程，绿灯是假的）。
2. **更新文档**（缺一项都算没做完）：
   - 本轮改动 → `HANDOFF-CODE.md`（坑与规矩，编号往后加）与 `README.md` / `QA.md` 的命令表；
   - 界面改动 → `DESIGN-SYSTEM.md` §五 批次表 + §三 组件表 + 模板表；
   - **策划案**（`../DESIGN.md` 与 `../design/make-docx.js` → `长征-抉择-设计方案.docx`）如涉及
     玩法、界面结构、调用点、技术形态的变化，一并在本轮改掉并重新生成 docx；
   - 本文件 §二 的结果行与 §三 缺口表同步（缺口解决了就划掉）。
3. **刷新生成物**：`qa:audit`（LOG-AUDIT）、`tts:manifest`（TTS-MANIFEST）、涉及素材时 `qa:assets`。
   **这一版要出桌面包时**再跑一次封装：`cd packaging && node build.mjs`（和/或 `build-singlefile.mjs`）→
   `node verify-fast.mjs`；通过标准是「成品里的 `public/server/data` 与仓库工程**逐文件 sha256 相等**」。
   产物不入库，对外发 GitHub Releases（见 §七点七）。
4. **交付图**：涉及页面的批次，出 1280 与 820 联系表（`qa:screens`）。
5. **提交并推送**：一个批次一个提交，信息里写清"做了什么 + 验收结果 + 遗留"
   （格式与推送流程见 [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) §二 / §四）。
   **改完必须 `git push`** —— 留在工作区的改动对其他人和下一个接手的 agent 等于不存在。

## 七、注意事项

> **本节是"口头约定落纸"**：这个项目有一部分东西是靠当面/聊天里定下来的（哪段音频是谁给的、
> 哪些包没进仓库、哪条红线不能碰）。为了让**只看仓库**的人也知道全部约定，这一节把它们全部写下来。
> 遇到本节没写、但看起来"应该有人说过"的事，按 [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) 的规矩办，
> 并把结论补回本节——**别让约定只存在于聊天记录里**。

### 七点一、密钥与仓库卫生（红线，不可协商）

- **密钥只在 `.env` 与 `runtime-config.json`，永不进前端**；也**永不进产物**——文档、报告、日志、
  提交信息里都不许出现 Key 的值（写"去设置里填 Key"可以，贴 Key 不行）。
- **不入库清单**（`.gitignore` 已挡）：`.env` · `runtime-config.json` · `node_modules/` ·
  `logs/ai-calls-*.jsonl` 与 `logs/session-full.jsonl` 运行日志 · `tests/e2e/artifacts/` ·
  `_archive/` 里的位图与音频（`**/*.png|jpg|wav|mp3|ogg`、`data/replay/`）· `_archive/handoff-minigames-*/`（两份同事交接包）·
  `_archive/audio-toolchain/`（本机音频工具链）。**朗诵音频是例外**：它 2026-09-16 起正式入库。
- **不许 `git add -f` 绕过 gitignore**——那条清单是安全边界，不是建议。
- **不许对公共分支 `git push --force`**。
- **万一密钥真的推上去了：第一动作是去智谱后台轮换（吊销）那个 Key**，然后再收拾历史。
  先改历史、后轮换的顺序是错的。
- 推送前核对作者身份：`git log origin/main..main --format='%h %an <%ae> %s'`
  （提交身份按 `CONTRIBUTING.md` 配；配错了别人 clone 下来会看到一堆陌生作者）。

### 七点二、声音与画面素材的来路（声明清楚，**对外发布要换**）

这一批素材是"找得到的现成素材 + 自产"两条路混着来的，用途是**竞赛内部演示**；
来源是**对外发布前必须处理的一件事**，所以逐类声明在这里：

| 素材 | 来路 | 对外发布怎么办 |
|---|---|---|
| 终局升华的整段朗诵 `public/audio/poem/qilv-changzheng.mp3`（59.3s） | 外部下载的《七律·长征(朗诵版)》录音（原文件名 `M500001cofo42JISSl.mp3`，备份在 `_archive/audio-poem-source/`，不入库） | 换成自有朗读，或走逐句 TTS 那条路；**只换文件 + 重新量时间轴，代码一行不用改**（步骤见该目录 `README.md` 与 [`HANDOFF-AUDIO.md`](HANDOFF-AUDIO.md) §六点五） |
| 8 首 BGM / 8 条环境床 / 8 个操作音效 | 外部素材 + 生成（"先按能下载的找"是当时的取舍：演示不卡在素材上） | 同上：文件名对齐就落盘即生效，换文件即可（见 [`ASSETS.md`](ASSETS.md)） |
| 场景图 21 / 立绘 14 / 事件图 6 | 生图模型产出（prompt 包在 [`../../design/asset-prompts.md`](../../design/asset-prompts.md)） | 属自产，可继续用；重生成走同一份 prompt 包 |

**朗诵音频已经随仓库走**（2026-09-16 起不再被 `.gitignore` 挡）：clone 下来就有、不用另外拷，
`data/poem.json` 的 `audio.full` 已指向它、八句时间轴是量出来的。
**红线照旧**：**任何音频都不允许阻塞流程**——放不出来必须静默降级（逐字按 `pace` 走），不许卡住收尾、不许弹错。

### 七点三、同事的两份玩法交接包：**不在仓库里**

- 那两份包（文档 + 完整检出，含 14 支玩法源码）是**私下交付**的 zip，归档在仓库外的
  `_archive/handoff-minigames-v1/` 与 `_archive/handoff-minigames-v2/`，**被 gitignore 挡着、不进仓库**。
- **要接的东西已经拷进工程**：玩法源码 → `public/js/modules/games/src/`；他们的说明 → [`docs/minigames/`](minigames/)；
  他们的自测脚本 → `tests/manual/minigames/`。**要看"哪支游戏接在哪"看 [`MINIGAMES-INTAKE.md`](MINIGAMES-INTAKE.md)**（插槽对照表），
  不要照 `docs/minigames/` 里的旧接线法做（那批文档是按他们那条线写的，映射以 intake 页为准）。
- 同事再给新一版：把文件覆盖进 `src/` → `npm run intake:minigames`（重接缝合点，幂等）→ 核 `id/actions` 有没有变
  （变了就同步插件、`qa-board` 的 specs 与 `driver.mjs` 的 case）。
- 他们的 `audio.js` / `data/` / 内核**一律不覆盖我们的**（那是旧分叉）；两份 dev 网页没进工程（见欠账 5）。

### 七点四、已经删掉的东西（别按旧文档去补）

- **自由行军沙盘已删**（2026-09-15，用户叫停），同伴反应音 6 条也随之撤走、归档在 `_archive/audio-reactions-sandbox/`，
  **没有任何代码路径引用它们**。
- 入库的日志样本 `logs/sample-full-run.jsonl` 里有 `sim_turn` 记录，那是**当时真调的留档、不是当前能力清单**——
  本版本的调用面是 **15 类**，`qa:ai` 里有一份 `RETIRED` 白名单专门放它过去（别把它当违约去修）。
- 旧版 `public/js/minigames.js`（1121 行、8 个玩法）已删除，玩法现在是 `modules/games/` 的插件 + `src/` 里的本体。

### 七点五、口径与说法（答辩/对外）

- **小游戏手感判定算本地逻辑，智能判断一律走 API**——答辩时按这条回答；界面上不说"这是 AI 判的"。
- **合作与场景口径不进界面**：对外只按"一款普通的长征叙事游戏"呈现。玩家可见的一切
  （界面文案、页面 `meta`、可复制的研学报告、模型生成内容）不写合作方名称与行业场景；
  这些口径统一放 [`PITCH.md`](PITCH.md) 与 [`SCORING.md`](SCORING.md)，答辩时口头讲。
- **没有 MOCK 模式**：`/api/decide` 只有 `GLM`（成功）与 `ERROR`（重试用尽）两态，每次调用落 JSONL；
  答辩要求"可审计的真调用"，`logs/` + 答辩面板就是证据（怎么取全量证据见下一条）。
- **没有离线能力**：断网即报错（备选预案见 [`OFFLINE-REPLAY.md`](OFFLINE-REPLAY.md)，**未开发**）。
- 预置语音只覆盖固定台词；模型自由回复不发声（有意为之，避免成本与不可控）。

### 七点六、演示前的机器与证据

- **演示机**：Node 18+ → `npm install` → 配 Key（写 `.env`，或在游戏内「设置」里填并点「测试连通」，
  后者落到 `runtime-config.json`）→ `npm start` → `http://localhost:3001`。素材全在仓库里，
  **不需要从别处拷任何文件**（朗诵音频 2026-09-16 起也随仓库走）。
- **日志是运行产物、不入库**（只留样本）；要留全量证据：先归档当天的 `logs/ai-calls-<日期>.jsonl`，
  再只跑那一局，让当天的日志干净可交。
- 任何"看起来能点但点了没反应"的界面状态都当缺陷修——它会让自动化卡死（2026-09-13 踩过两次）。

### 七点七、桌面版：打包、发布与分发

- **封装不改游戏代码**：`packaging/` 只做「起服务 + 开窗口 + 把会写盘的东西指到 exe 旁边」，玩法 / 数值 / 调用 /
  日志格式与源码态完全一致。改完 `changzheng/` 的东西，重跑 `cd packaging && node build.mjs`
  （和/或 `node build-singlefile.mjs`）即可，封装脚本不用动。
- **产物不入库**：`dist/`（便携目录 + zip + 单文件 exe）与 Electron 运行时 / 打包缓存
  （`packaging/electron-dist/`、`packaging/.electron-cache/`、`packaging/.npm-cache/`）都被 `.gitignore` 挡着，
  **别用 `git add -f` 塞进仓库**。对外发布走 **GitHub Releases 传单文件 exe**。
- **随包带 Key 是明文**：`.env` 会照搬进成品的 `resources/app/changzheng/`，所以拿到包的人就能看到那把 Key。
  对外分发按 §七点一 的纪律办（该轮换就轮换），别把带 Key 的包发到公开场合。
- **首次运行会弹 SmartScreen**：exe 没有代码签名，Windows 提示「未知发布者」——点「更多信息 → 仍要运行」即可；
  这一条已写进成品的 `使用说明.txt`（要彻底消掉得买签名证书）。
- **素材红线同样适用**：包里的 BGM / 音效 / 朗诵是外部素材（§七点二），**对外发布前要换**；换完重打一次包，
  代码一行不用改。
- **现场形态**：双击 `dist/长征-抉择/长征-抉择.exe`（或单文件版）就能玩，不需要 Node、不需要浏览器、
  不需要从别处拷任何文件。配置与日志在 exe 旁边的 `user-data/`（单文件版在 `%LOCALAPPDATA%\长征-抉择\user-data\`），
  演示后删掉该目录即恢复出厂。
