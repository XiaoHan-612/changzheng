# 交接说明（Handoff）

> ⚠️ **本文件是总览。分工交接请看：**
> [`HANDOFF-CODE.md`](HANDOFF-CODE.md)（代码 agent）· [`HANDOFF-ART.md`](HANDOFF-ART.md)（生图模型）· [`HANDOFF-AUDIO.md`](HANDOFF-AUDIO.md)（音频/TTS 模型）· [`ASSETS.md`](ASSETS.md)（素材清单）· [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md)（视觉体系与逐批进度）

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
4. **人工完整玩一遍的路线**：标题 → 研学模式 → 出身三选一 → 过场 → 营地（点光点：交谈一次、抉择一次）
   → 启程 → 知识对决 → 五幕走完。单局 **20–25 分钟**；赶时间选「快速演示」（约 18 分钟），
   或「自由行军沙盘」（自由输入，模型当世界裁判）。
   重点看这几处：**热点用过即作废**（变灰「已看过」）· 玩法都在**玩法板**上（题名 + 数值签）·
   每步都有**史实回响**（你经历的 / 真实发生过的 / 虚构边界）· 第四幕幕末的**篝火夜**（需点亮 ≥3 条附身线）·
   终局的**研学报告**。
5. **坏了先看哪儿**：
   - 界面弹「模型调用失败」→ 点「重试」；连续失败看「设置 → 测试连通」和「记录」里那条 `source=ERROR` 的原因；
   - 一次真调 1.2–6 秒属正常（若换回赛制指定的 `glm-5.1` 约 11 秒/次）；**没有离线能力**，断网即报错（备选方案见 `OFFLINE-REPLAY.md`）；
   - 没声音 → 顶栏喇叭是否静音、浏览器是否拦了自动播放；
   - 想单独复现某一屏 → 打开「设置 → 展示」后用 `window.__czScreens`（`show / mini / quiz / night / end / logs / defense`，见 `HANDOFF-CODE.md` 第 27 条）；顶栏的「记录 / 答辩」也要打开这个开关才显示。
6. **交接前实测过的形态**：干净克隆 + 复制 `.env` + `npm install --omit=dev` + `node server/index.js` 就能玩
   （首页与静态资源/字体/音频/acts 全 200，连通测试真调成功）——这也是便携包的最小形态（见 `DELIVERY.md`）。

## 一、项目现状

**《长征·抉择》** — 网页端长征主题 AI 科普游戏，两种核心玩法并存：

| 玩法 | 入口 | 核心循环 | 状态 |
|------|------|----------|------|
| 五幕主线（VN） | 标题「研学模式 / 行军模式 / 快速演示」 | 暮色营地探索 → 决策 → 模型裁决 → 史实回响 → 启程 | 完整可通关 |
| 自由行军沙盘 | 标题「自由行军」 | 自由输入行动 → 模型当世界裁判 → 世界推进 + NPC 反应 | 可玩（v2，含存档） |

## 二、已完成

### 引擎与服务端
- `/api/decide`：**16 类** callType（scene_gen / choice_hint / npc_chat / share_judge / minigame_review /
  branch_judge / quiz_generate / quiz_answer_ai / quiz_judge / night_options / night_resolve /
  act_review / ending_review / failure_review / study_report / sim_turn）
- `/api/sim`：沙盘单次调用完成「裁判 + 世界更新 + NPC 反应」
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
- 沙盘：世界面板（人/粮/士气/体力/情报）、自由输入、语音输入（Web Speech）、建议行动、事件图卡、同伴语音

### 视觉（纸墨设计系统，逐批打磨 25 页）
- **25 页 6 批已全部完成**：框架（7 模板 + 区块 + 5 标准动效 + 守卫 + 样板页）与批 1–6
  （标题/怎么玩/设置/过场；营地/手记/史实/岔路/回响；舞台对话/抉择/裁决/篝火菜单；
  `tpl-board` 板屏 + 8 个玩法；五子棋/泸定桥/陡坡/沙盘；答题/夜间/终局/记录与答辩）
- 每批的联系表在 `tests/e2e/artifacts/screen-sheet-<n>.png`（820 档同名前缀 `-820`）；
  逐批做了什么、修了哪些事故记在 [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) §五
- 进度表、每批交付口径与守卫命令都在 DESIGN-SYSTEM §五；改界面先读 §三 组件规范与 §二点五 区块表，
  别在页面里新写样式（`qa:frames` 会拦）

### 日志与证据
- 仓库里入库一份**真实全程样本** `logs/sample-full-run.jsonl`（96 条、覆盖 16/16 类、零违约），
  运行时的按日日志不入库（见 [`../logs/README.md`](../logs/README.md)）
- `npm run qa:audit` → `docs/LOG-AUDIT.md`：本版本字段缺失 0、FALLBACK 0

### 测试（当前全绿）
```powershell
# 全流程（真调，需配好 Key）
npm run test:e2e     # 五幕真调通关：unit 之外的总验收（~76 次调用），含不重复结算等回归断言
npm run qa:sandbox   # 沙盘两回合 + 建议行动      · npm run qa:regress  沙盘监听泄漏/存档错位
npm run qa:failure   # 行军模式失败线（failure_review 真调）
npm run qa:av        # 影音运行时审计：资源 404 / 立绘 / 环境床 / TTS 解码
# 局部（多数不烧 AI，随时可跑）
npm run test:unit    # 49 项：状态层 / 契约 / 配置层 / 减员 / 数值护栏
npm run qa:smoke     # 标题→营地→一次互动→回设置
npm run qa:board     # 玩法板体检 57 项（8 个玩法的板屏壳 / 数值签 / 契约标记 / 离开清空）
npm run qa:tokens · qa:frames · qa:tone · qa:motion   # 视觉守卫：字面量 / 模板 / 纸面 / 动效
npm run qa:handoff   # 交接文档与代码契约是否一致
```

当前结果：unit 49/49 · smoke PASS · board 57/57 · motion 16/16 · e2e FULL PASS ·
sandbox / regress / failure PASS · av AUDIT PASS · tokens/frames/tone/handoff 全绿 ·
`layout-audit --width 820` 与 1280 均零布局缺陷

## 三、还没做 / 已知缺口（按优先级）

| 优先级 | 缺口 | 说明 |
|--------|------|------|
| P1 | 契约还差两处 | `runQuiz` 的「让两个 AI 对答」按钮与 `#quiz-auto` 靠 `data-choice-index` 兼职（建议走 `askChoice`）；`runRest` 只有一个「继续」，可直接 `waitContinue` |
| P1 | 数值平衡未调 | 测量口径已建（`npm run qa:playtest` → `docs/PLAYTEST.md`），调参待做 |
| P1 | ~~视觉批 6~~ | ~~答题/夜间/终局/记录与答辩~~ 已完成；视觉侧只剩「新增内容时按框架补」 |
| P2 | 移动端不做 | 窄屏只保证到 **820**（已逐屏体检）；375 手机档明确不在交付范围 |
| P2 | 沙盘多智能体偏轻 | NPC 有 goal 与 3 条记忆，但没有「目标推进」的主动事件 |
| P2 | 操作音效仍是合成 | click/hook/echo 等由 WebAudio 合成；是否预录看路演音质要求 |
| P2 | 封装未定型 | 一键启动（`start.bat` + 便携 Node）见 [`DELIVERY.md`](DELIVERY.md)，演示前收口 |
| P3 | 离线回放（备选） | 现场无网/额度耗尽的风险预案，见 [`OFFLINE-REPLAY.md`](OFFLINE-REPLAY.md)，**未开发** |

## 四、接着干的话，从哪儿下手

1. **批五**（五子棋 / 泸定桥 / 陡坡 / 沙盘）：照批四的模板收，欠账清单已在 DESIGN-SYSTEM §五 列明。
2. **补两处契约**（`runQuiz` / `runRest`）——顺手就能做，做完 `test:e2e` 复验。
3. **数值平衡**：`qa:playtest` 跑几局看 `docs/PLAYTEST.md` 的曲线，按 HANDOFF-CODE 第 25 条同时改三处
   （钳制表 / 提示词 / 单测）。
4. 想再上一台阶：让沙盘 NPC 的 goal 驱动主动事件（老班长因反对而私下行动）。

## 五、关键文件

```
server/
  index.js      路由（/api/decide /api/sim /api/config /api/logs）
  ai.js         VN 侧：提示词 + 真调 + 重试 + 契约校验
  sim.js        沙盘侧：世界裁判提示词 + 真调 + 重试 + 契约校验
  schema.js     响应契约唯一真源（REQUIRED / missingFields / contractStamp）
  logger.js     JSONL 落库（按日文件 + 会话镜像 + 契约戳记）
  config.js     .env / runtime-config.json 双层配置
public/js/
  main.js       主线状态机（幕、营地、强制链、失败结算、玩法宿主 openBoard/mountMini）
  step.js       交互契约（step/askChoice/choiceButton/waitContinue/markMini）
  minigames.js  8 个玩法（本地只判手感，结算走 /api/decide）
  sandbox.js    沙盘循环 v2（事件图卡、语音、存档、目标/记忆、模型收尾）
  ui.js         渲染与浮层（showScreen 按模板选入场动效、板屏清空）
  state.js      资源/好感/失败判定/粮荒（可单测）
  audio.js      环境床 + SFX + 预置语音
public/css/     fonts → tokens（唯一值源）→ base → framework（模板+区块+动效）→ components
data/acts.json  五幕定义（热点、dayScenes、强制链、对决）
data/facts.json 史实卡（real / fiction 分栏）
logs/           入库样本 + 运行时日志（见 logs/README.md）
tests/          unit / e2e（Playwright）/ manual（一次性排查与体检脚本）
```

## 六、每轮收尾清单（**每轮结束都做，做到随时能移交**）

1. **跑验收**：改动涉及的层级按 §二 的命令跑一遍；服务端改动后必须看到测试输出 `restarted`
   （否则跑的是旧进程，绿灯是假的）。
2. **更新文档**（缺一项都算没做完）：
   - 本轮改动 → `HANDOFF-CODE.md`（坑与规矩，编号往后加）与 `README.md` / `QA.md` 的命令表；
   - 界面改动 → `DESIGN-SYSTEM.md` §五 批次表 + §三 组件表 + 模板表；
   - **策划案**（`../DESIGN.md` 与 `../design/make-docx.js` → `长征-抉择-设计方案.docx`）如涉及
     玩法、界面结构、调用点、技术形态的变化，一并在本轮改掉并重新生成 docx；
   - 本文件 §二 的结果行与 §三 缺口表同步（缺口解决了就划掉）。
3. **刷新生成物**：`qa:audit`（LOG-AUDIT）、`tts:manifest`（TTS-MANIFEST）、涉及素材时 `qa:assets`。
4. **交付图**：涉及页面的批次，出 1280 与 820 联系表（`qa:screens`）。
5. **提交并推送**：一个批次一个提交，信息里写清"做了什么 + 验收结果 + 遗留"
   （格式与推送流程见 [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) §二 / §四）。
   **改完必须 `git push`** —— 留在工作区的改动对其他人和下一个接手的 agent 等于不存在。

## 七、注意事项

- 密钥只在 `.env` 与 `runtime-config.json`，永不进前端
- 小游戏手感判定算本地逻辑，**智能判断一律走 API**，答辩时按这条口径回答
- 预置语音只覆盖固定台词；模型自由回复不发声（有意为之，避免成本与不可控）
- **合作与场景口径不进界面**：对外只按"一款普通的长征叙事游戏"呈现。玩家可见的一切
  （界面文案、页面 `meta`、可复制的研学报告、模型生成内容）不写合作方名称与行业场景，
  这些口径统一放 [`PITCH.md`](PITCH.md) 与 [`SCORING.md`](SCORING.md)，答辩时口头讲。
- 日志是运行产物、不入库（只留样本）；要留全量证据就先归档当天的运行日志再只跑那一局
- 任何"看起来能点但点了没反应"的界面状态都当缺陷修——它会让自动化卡死（2026-09-13 踩过两次）
