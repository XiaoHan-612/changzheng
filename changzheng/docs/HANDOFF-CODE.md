# 交接说明 · 代码（给下一个代码 agent）

> 你接手的是《长征·抉择》的**唯一可运行工程** `changzheng/`。
> 历史版本在 `../_archive/`（`sample/` 是最初的营地四线原型、`demo-v1/` 是五幕中间版），**只读参考，不要在那里开发**。
> 素材与音频分别交给生图/音频模型，见同目录 `HANDOFF-ART.md`、`HANDOFF-AUDIO.md`。

## 一、30 秒上手

```powershell
cd changzheng
npm install
npm start                 # http://localhost:3001
npm run test:unit         # 49 项：状态层 / 契约 / 配置层 / 减员 / 数值护栏
npm run test:e2e          # 五幕**真调**通关（含快速模式：node tests/e2e/full-run.mjs --quick）
npm run qa:smoke          # 标题→营地→一次互动
npm run qa:sandbox        # 自由行军沙盘
npm run qa:regress        # 沙盘监听泄漏 / 存档回合错位
npm run qa:audit          # 日志 schema 审计 → docs/LOG-AUDIT.md
npm run tts:manifest      # 生成 docs/TTS-MANIFEST.md（音频模型对照表）
```

**没有 MOCK 模式**：所有智能判断都真调。`GLM_MODEL` 默认 `glm-5.1`（赛制指定），本机在 `.env` 用 `glm-5.3-flash` 替代；`GLM_REASONING_EFFORT` 默认 `low`（必须设，否则「始终思考」的模型会把 token 用在推理上、`content` 返回空）。

## 二、模块地图

| 文件 | 职责 | 改动注意 |
|---|---|---|
| `public/js/main.js` | 主线状态机：五幕、营地日、强制链、对决、失败/终局、篝火夜；**玩法宿主** `openBoard()` + `mountMini()` | 最大的文件；热点用 `HOTSPOT_HANDLERS` 映射表分发，**加玩法只加一行**；玩法一律挂板屏（见第 27 条） |
| `public/js/kernel/` | **内核**（新）：`bus`（事件总线）/ `contracts`（事件契约唯一真源）/ `plugins`（模块描述符）/ `kernel`（注册·接线·ready·诊断）/ `wiring`（模块清单）/ `resources`（显式锁）/ `snapshot`（只读快照）/ `diag`（事件流黑匣子） | 架构与规矩见 [`BUS.md`](BUS.md)；**模块集合不写死**——加模块只动 `wiring.js` 清单与模块自己的文件 |
| `public/js/modules/` | **IP 模块**（新）：已挂 `audio`（声音总入口）/ `shell`（外壳反应）/ `screens`（屏生命周期归属）/ **`state`（状态唯一持有者：写走动作并广播）/ `hud`（订阅 state:change 渲染读数）**；`games/` 是交互游戏插件契约 + 模板 | 批 2 起逐个迁入；**业务发声音只发事件**（`sfx:play`/`voice:say`/`scene:enter`/`flow:act-enter`），`qa:audio` 会拦直接 import 音频门面的写法 |
| `public/js/step.js` | **交互契约**：`step()` / `askChoice()` / **`choiceButton()`（选项唯一构建处）** / `waitContinue()` / `markMini()` | 新增玩法只要声明契约，测试与自动化无需改动；详见 ARCHITECTURE 的「交互契约」 |
| `public/js/minigames.js` | **8 个玩法**：钓鱼/弯针/夜校识字/分糖/夜岗/五子棋/泸定桥/陡坡 | 统一返回 `{score, detail, summary?}`，本地只判手感，结算走 `/api/decide`；状态经 `stats(host, [...])` 写进板头数值签 |
| `public/js/state.js` | 资源/好感/附身线/行动点/每日场景/失败判定 | 纯函数、可单测；新增资源维度要同时改 `applyEffects` 的钳制表 |
| `public/js/origin.js` | 开场设定：出身三选一 + 出发前一问（纯数据 + 纯函数） | 三条出身的收益刻意对称（各 +5/−2），别加出唯一最优解；问答必须留在本地题库，开局第一屏不能依赖网络 |
| `public/js/sandbox.js` | 自由行军沙盘（世界裁判 + 存档） | 表单监听只绑一次（`bindSandboxFormOnce`），别改回 `addEventListener` |
| `public/js/audio/` | **音频框架**（批 1 重写）：`index`（门面）/ `mix`（混音表）/ `core`（desired-actual + reconcile）/ `channels/*` | 见坑 28；调用一律从 `index.js` 进，`qa:audio` 的框架一致性段强制 |
| `public/js/ui.js` | DOM 渲染与浮层 | 模型返回的文本一律走 `escapeHtml`；`showScreen()` 负责按模板选入场动效、并在离开舞台/板屏时清空内容 |
| `server/ai.js` | VN 侧提示词 + 真调 + 重试 | 每个 callType 的返回 schema 必须与前端读取字段一致 |
| `server/sim.js` | 沙盘世界裁判 | 同上（2026-09-13 起也过契约表：数组响应按「整体不是对象」判失败） |
| `server/schema.js` | 响应契约唯一真源（`REQUIRED` / `missingFields` / `contractStamp`） | 改字段只改这里；`audit-logs.mjs` 与单测同源 |
| `server/logger.js` | JSONL 落库（按日文件 + 会话镜像 + 契约戳记 + 8MB 轮转） | 落库只有这一处，新增字段在这里加 |
| `server/balance.js` | 数值护栏（单维单次上限 / 单次最多 3 维 / 信念只在关键抉择正向） | 改数值要同时改提示词与单测（第 25 条） |
| `public/css/` | fonts → tokens（唯一值源）→ base → framework（模板 + 区块 + 动效）→ components | 页面不写样式（`qa:frames` 拦）；颜色/字号/圆角不许写死（`qa:tokens` 拦） |
| `server/index.js` | 路由 + 静态 + gzip + 缓存头 | 新增数据文件记得加 `/api/data/*` 路由 |
| `data/acts.json` | 五幕定义：热点、`dayScenes`、强制链、对决 | 改热点等于改玩法入口 |
| `data/facts.json` | 史实卡 14 张（real/fiction 分栏） | 新增卡片要同步 `acts[].facts` |
| `data/tts-lines.json` | 固定台词清单 | 改文本会让哈希文件名变化，要重跑 `npm run tts:manifest` |

## 三、状态机与数据流

```
标题 → startRun(mode) → runActIntro
   ├─ 过场 runCutscene（点按/跳过）
   ├─ 幕前抉择 runPrelude（仅第四幕：让棉衣）
   └─ mode==='quick' ? runQuickAct（1 次交谈 + 主玩法 + 对决）
                      : enterCampDay（暮色营地，逐日）
                        热点 → HOTSPOT_HANDLERS[kind] → 小游戏（板屏）/对话（舞台）→ /api/decide → 史实回响
                        「启程」→ 天数用尽 → runForcedChain（强制链 + 对决）
   → finishAct（幕间总评 → 第四幕追加 runNightChoice → actIndex++ → 粮荒/失败结算）
   → 终局 runEnding（ending_review + 研学报告 study_report）
```

**附身线门控**：`state.linesDone` 记 5 条营地线（fishing/candy/sentry/school/gomoku），`canNight()` ≥3 才解锁篝火夜；手记面板显示 `N/5`。

**防重入**：`S.busy` + `withLock`。注意历史约定：在锁内要调用 `runForcedChain` 时先手动 `S.busy = false`（见 `onHotspot` 的 march 分支与 `runQuickAct`），否则嵌套 `withLock` 会静默 return。

**幂等**：`S.doneKeys[actId:key]` 记录已完成的强制步骤，热点做过的不重播。

## 四、AI 契约（每个 callType 的必需字段）

`source ∈ {GLM, ERROR}`，具体模型看日志 `model` 字段。校验脚本：`npm run qa:audit`。

| callType | 前端读取 | 必需字段 |
|---|---|---|
| `scene_gen` | 营地提示语 | `title`, `atmosphere` |
| `choice_hint` | 选项倾向预告 | `hints[]` |
| `npc_chat` | 对话 | `reply`（可选 `affinity_delta`/`mood`） |
| `share_judge` | 分汤/分粮/分糖 | `effects`, `narrative`, `choice`；分糖另需 `items[]` |
| `minigame_review` | 钓鱼/识字/夜岗/五子棋/泸定桥/陡坡/休息 | `effects`, `narrative` |
| `branch_judge` | 路线/战术/道德抉择 | `effects`, `scene_text`（或 `narrative`） |
| `quiz_generate` | 出题 | `question`, `options[]`, `answer_index` |
| `quiz_answer_ai` | AI 作答（human_vs_ai 与 ai_vs_ai 各一次） | `answer_index` |
| `quiz_judge` | 判分 | `human_score`, `ai_score` |
| `night_options` | 篝火夜选项 | `options[]`（≥2，否则前端用兜底两项） |
| `night_resolve` | 当夜结算 | `narrative`（`effects` 会 apply） |
| `ending_review` | 终局 | `ending_id`, `paragraphs[]` |
| `act_review` | 幕间总评 / 会师清点 | `title`, `lines[]` |
| `failure_review` | 掉队结算 | `paragraphs[]` |
| `study_report` | 研学报告 | `summary` |
| `sim_turn` | 沙盘一回合 | `narrative`, `feasible` |

`operation.type` 约定：`fishing` / `soup` / `sugar` / `sentry` / `gomoku` / `luding` / `grab` / `path` / `rest`。

## 五、已知坑（都踩过）

1. **嵌套 withLock 会静默失效** —— 锁内调用带锁函数前先 `S.busy = false`。
2. **日志 source 不要写死模型名** —— 旧代码把 `glm-5.3-flash` 的调用标成 `GLM-5.1`，审计时说不清；现在 source 只标 `GLM`，模型看 `model`。
3. **`applyEffects` 键必须存在于 state** —— 例如旧的 `安全感` 字段会被静默丢弃；新增维度要同步改钳制表。
4. **模型返回下标/字段不可信** —— 答题下标用 `normIdx()` 夹取，夜间选项不足 2 个用兜底。
5. **沙盘表单监听只绑一次** —— 反复进出沙盘会叠加处理器（`bindSandboxFormOnce`）。
6. **测试别污染用户配置** —— e2e 会写 `runtime-config.json`，跑完要还原（已内置 snapshot/restore）。
7. **改台词文本会让 TTS 哈希文件名变化** —— 重跑 `npm run tts:manifest`。
8. **空 JSON 的根因是推理吃 token** —— 实测 54 次真调里 8 次返回 `{}`，耗时 9.6–12.3 秒。根因是 glm-5.3-flash「始终思考」：不设 `reasoning_effort` 时 token 全用在推理上。现在默认 `reasoning_effort=low` + `max_tokens` 2000（sim 2400），实测 1.2 秒、21 tokens 就返回合规 JSON；空对象仍按失败处理。
   `check-glm.mjs` 早先没带 `reasoning_effort` 且只给 64 tokens，结果自检报"失败"而游戏其实是好的——现已与服务端请求体对齐（默认 `reasoning_effort=low`、`max_tokens=256`），并在 `finish=length` 时直接提示"是参数太紧，不是接口坏了"。
   2026-09-13 实测同一网关：`glm-5.3-flash` 2.6s / 37 tokens 正常返回；`glm-5.1` **不认 `reasoning_effort=low`**，要 `max_tokens≥2000` 才吐 content，单次 ~11s。也就是说 glm-5.1 在这里能真调，但慢一个数量级——答辩前若要用指定模型，务必按 11s/次估时。
9. **真调可能等 10 秒以上** —— 「思考中」指示器会显示秒数；失败会弹出原因与「重试」键（不再有兜底文案）。
10. **日志审计按 id 去重、按契约戳记分账** —— 同一条调用会同时写进「按日文件」和 `session-full.jsonl`，`audit-logs.mjs` 已去重；记录再按 `contractOk`（`server/logger.js` 落库时盖）分出「本版本」与「入库样本之外的旧记录」两拨，前者违约才红灯。**日志不入库**：仓库里只有一份真实全程样本 `logs/sample-full-run.jsonl`（96 条、16 类、见 `logs/README.md`），运行时的 `ai-calls-<日期>.jsonl` 被 .gitignore 挡住——早先逐日入库，结果 diff 被日志噪音冲烂、8MB 轮转还把当天最早的记录裁掉（2026-09-13 改）。想把某一局单独看清：`LOG_DIR=<临时目录> npm start` 跑一局，再 `LOG_DIR=<临时目录> node scripts/audit-logs.mjs`（报告写进那个目录）。
11. **素材是「探测式」接入** —— 图片走 `sceneImage(新图, 占位图)`（`main.js` 顶部 + boot 里的 `preloadScenes()`），音频走 `AMBIENT_FILE` 映射（`audio.js`）。生图/音频模型把文件按约定名字落盘就自动生效，**不需要改代码**；加新素材时同步更新 `preloadScenes()` 与 `AMBIENT_FILE` 两张表即可。自检：`npm run qa:assets`。
12. **静态资源找不到必须 404** —— SPA 兜底只对页面路由生效（`server/index.js` 里排除了 `/assets`、`/audio`、`/css`、`/js`）。如果让缺图回 index.html（200），前端的素材探测和 `qa:assets` 都会被骗过。
13. **契约标记要随状态撤销** —— 过场按钮是静态 DOM，结束后必须 `delete dataset.action`；已用掉的糖/已落子的格必须移除 `data-mini-action` 或置 `aria-disabled`，否则"当前可交互项"会撒谎（这几条都是踩过的坑）。
14. **自动化只认契约** —— `tests/e2e/full-run.mjs` 的驱动按 `body[data-step]` + `data-action`/`data-choice-index`/`data-mini-*` 操作，不认识任何中文标签或屏内元素 id。新增玩法时先声明契约，别再改驱动。
15. **TTS 缓存靠"逐字一致"命中** —— 哈希是 `sha1(voiceId|text)`，所以：① 代码里 `say()` 的文本改了，就要同步改 `data/tts-lines.json` 并重跑 `npm run tts:manifest`，否则文件白做（曾 21/24 条不可达）；② `speak()` 的 voiceId 必须走语音通道的 `ACTOR_VOICE` 映射（`public/js/audio/channels/voice.js`）（中文角色名会被清洗成 `default`，哈希对不上）；③ 史实回响会念 `facts.json` 的标题，标题即 TTS 文本。验收：`npm run qa:tts` + 跑一局看 `ttsHits`（E2E 已断言 ≥5）。
16. **立绘兜底不能反过来写** —— 旧代码 `comp.img || portraitImage(npc)` 里的 `comp` 是 `COMPANIONS.find(...) || COMPANIONS[0]`，于是任何**非同伴 NPC**（母亲、船工、宣传员、向导、新兵）都长出老班长的脸，10 张新立绘里 5 张永远不会出现（2026-09-13 修）。现在统一走 `showNpc(npc, { role, mood })`：专属立绘 → 同伴立绘 → 文字头像。热点/抉择集想立谁，就写 `npc` 字段（`acts.json` 的 `wounded`、`CHOICE_SETS.snow_help` 是样例）。回归用例在 `tests/e2e/asset-drop.mjs`（点开「母亲」热点，断言立绘必须是 `mother.png`）。
17. **响应契约只有一张表** —— `server/schema.js` 的 `REQUIRED` 是唯一真源：`server/ai.js` 每次解析完就校验（缺必需字段 = 当次失败 → 走既有重试），`scripts/audit-logs.mjs` 用同一张表审计。别在别处再抄一份。起因是 2026-09-13 事故：模型把 `answer_index` 的键名写坏成 `",answer_index"`，由于只解析不校验，界面拿到"没有正确答案的题"照样往下跑 —— 只有日志审计能看出来，事后很难查。判定规则与回归用例见 `tests/unit/schema.test.js`。
   同一天还有第二起：`server/sim.js`（沙盘）**漏接了这张表** —— 模型把整个响应包成 JSON 数组（`[{...}]`）时，`typeof === 'object'` 与非空数组的键数都过得了原来的"空 JSON"检查，于是被当合规响应落库、界面渲染出一个没有叙事的空白回合（只有审计能发现）。现已补上校验，数组一律按"整体不是对象"判失败重试。**新增任何调模型的路径，都要接同一张表**。
   审计的账也是这么分的：`server/logger.js` 落库时用同一张表盖 `contractOk` 戳记，`scripts/audit-logs.mjs` 据此把记录分成"本版本（带戳记，违约即红灯 exit 1）"与"历史（无戳记，只在报告里列成因）"两拨——否则 `logs/` 里那些守卫上线前的旧记录会永远挂成一笔说不清的账（2026-09-13 收口，14 条历史违约的成因逐类写在报告里）。
18. **失败结算不许编造** —— `runFailure()` 原本写了一段 `if (!end) { end = {...兜底文案} }`，但 `callAI()` 从不返回空值（失败时返回 `{_error:true}`），那一段是死代码；真失败时反而渲染出"只有标题、没有段落"的空结算屏。现在失败就显式写「结算未完成」并说明去哪看原因，内容一律不编造。同类"字段级中性兜底"（如 `result.narrative || ''`）保留，但**不许兜底出一段像模像样的叙事**。
19. **交谈屏的"快捷问句"也带 `data-choice-index`** —— 它们是可选话题，不是必答选项。驱动/自动化如果按"先看通用选项、再看交谈"的顺序写，就会在同一屏反复提问：实测把 API 额度烧掉 400+ 次调用且永远走不出去。正确优先级是 **`talkEnd` 先于 `choices`**（`tests/e2e/lib/driver.mjs` 的快照里单列了 `talkQuick` 就是为这个）。
20. **营地热点是一次性的（已生效）** —— `hotspotSpent()` 判定：`kind` 在 `REPEATABLE_HOTSPOTS`（只有 `fire`/`rest`）里的可反复做，其余按 `doneKeys[actId:action||id]` 用过即废；作废的热点 `disabled` + `data-hotspot-state="done"`，并把副文案换成「已看过」，行动点照旧每次 −1。两个连带教训：① **`markDone()` 之后必须重画一次 `renderHotspots()`**——否则刚用过那颗停在"看着还能点"的样子，点下去只弹「这里已经看过了」，界面与状态对不上（玩家只是困惑，自动化会在它上面反复点直到 40s 超时，2026-09-13 影音审计实锤）；② 自动化要"优先点没做过的热点"（`pickHotspot(..., { visited })`），一旦全部点过就会回退到点第一个，正好撞上那颗假可点的。
21. **回归脚本曾经"空跑营地"** —— 旧版 full-run 在营地里优先点「启程」，行动点从没花过，因此 `npc_chat` 调用为 0、夜校/分糖之外的营地内容完全没覆盖。现在营地改为「`apOn > 0` 就先点热点、花完再启程」。判断剩余行动点用 HUD 的 `#ap-dots .ap-dot.on`。
22. **图和声音坏了，流程测试是不会发现的** —— `sceneImage()` 找不到图会静默退回占位图，`audio.ambient.play()` 找不到文件会静默退回合成音，`speak()` 找不到缓存就静默不响。于是路径拼错、文件缺失、映射写反都能"通关"。所以有独立的影音审计 `npm run qa:av`：整局监听 `/assets`、`/audio` 的 4xx/5xx，核对营地全景/舞台图/立绘是否就是期望的那一张，统计环境床与语音是否**真的 play() 成功**，并逐个验证 `/api/tts` 返回的音频能解码出时长。
23. **`text-avatar` 是设计的一部分，不是缺陷** —— 没有专属立绘的 NPC（目前是「湘江老兵」）会退回文字头像，影音审计按 `PORTRAIT_FILE` 的键判断"本该有立绘"，因此不会误报；要给他补立绘时，往 `PORTRAIT_FILE` 加一行即可自动生效。
24. **测试会复用旧服务，让服务端改动"假绿"** —— 早先每个 e2e 脚本各写一份 `ensureServer()`，只判断端口上有没有服务。于是一个几小时前启动的进程会被一直复用：**服务端代码改了，测试却还在跑旧代码**，绿灯是假的（本人在数值护栏上踩过：日志里单次 +15，钳制明明写了却"没生效"）。现在统一走 `tests/e2e/lib/server.mjs`：服务端在 `/api/config` 暴露 `pid` 与 `codeStamp`（`server/*.js` 最新 mtime），测试启动前比对，代码比进程新就杀掉重启；迁移期旧服务不暴露 pid 时按端口反查监听进程。改服务端代码后跑测试，看到 `restarted` 才算真跑。
25. **数值改动要同时改三处** —— ①`server/balance.js` 的钳制表（单维单次上限 + 单次最多 3 维 + 信念只允许在 `branch_judge`/`night_resolve` 正向增长）；②`server/ai.js` 提示词里的【数值】段落；③`tests/unit/balance.test.js`。只改其一会出现"提示词说 ±8、实际还能 +15"这类不一致。实测口径：一局 AI 净变化应为体力 −20～−30、信念 +5 左右，终局落在体力 20–45 / 信念 50–85。
26. **评委/调试入口由「设置 → 展示」控制** —— `public/js/features.js` 的 `FEATURES.devTools` 是默认值（当前 false），运行时开关写在 localStorage（`czjc_devtools`）。关掉时 `body` 没有 `.dev-tools`，CSS 隐藏所有 `.dev-only` 元素：标题页「评委演示」与模型署名、顶栏「答辩」「记录」与模型标签。**答辩/路演要展示真调日志时，在设置里勾一下即可**，不必改代码。相关测试已改成不依赖这些入口（full-run 直接读 `/api/logs` 计数）。
27. **玩法都在板屏上（`tpl-board`），宿主只有一条路** —— 小游戏原先挤在舞台纸卷里（上面还顶着给对白用的人物立绘），批四给它们建了 `#screen-board`：人物在舞台屏交代任务 → 切板屏玩 → 切回舞台屏结算（`say()` 与「继续」键都在舞台）。
   新增/搬迁玩法照抄这套：`const board = openBoard({ title, bg })` + `mountMini(board, name, id)`（内部会 `markMini`），状态用区块 `.blk-stat` 经 `stats(board.stats, [...])` 写进板头；**别再回到 `setStagePanel`**，也别在玩法里自己拼标题。截图/体检用 `__czScreens.mini(name)`（玩法都在幕深处，跑一整幕太贵）；同族钩子还有 `quiz / night / end / logs / defense`——**长流程不另写渲染**：钩子起真实流程，截图脚本在中途等。
   坑：这一批陆续修掉了一串**"类名在、样式没了"**（框架重做删 `minigames.css` 时漏网，批四批五才逐个抓到）：`runSentry` 的三个处置键用 `.choice-btn`（**CSS 里根本没有这个类**，渲染成浏览器默认按钮）、五子棋石子写 `.p1/.p2` 而 CSS 里只有 `.black/.white`（棋子一直是空圈）、陡坡的 `.grab-*` 三兄弟、沙盘的 `.narr`/`.verdict`/`.sb-person`。批六又抓到两处同族（都在记录屏）：来源标签 JS 输出 `class="src glm"`（两个类）而 CSS 等的是 `.src-glm`（一个类），于是 `source=GLM` 一直是灰字；记录行第一段写 `class="head"` 而 CSS 等的是 `.row`，四段挤成一行。`npm run qa:board` 盯的就是这类事故：元素必须在屏上、契约标记必须真带 `data-mini-action`。
   另一条：e2e 的「五子棋恰好 1 次」断言只靠**可选营地热点**（两个小鬼）触发——act4 的强制链里没有它，营地里那 2 点暮色花在哪由流程决定，偶尔会落空（2026-09-13 遇到一次，重跑即过）。失败信息现在会带「营地历次热点 apN:[…]」用于定位；要稳定覆盖就在 `tests/e2e/full-run.mjs` 的营地分支里保住那条 gomoku 抢先点击。

28. **音频：一个门面、一张场景表、一份混音表（三批重写已收口，见 docs/AUDIO-SYSTEM.md）**
   - **结构**：`mix.js`（值：音量/淡入淡出/闪避的唯一处）→ `core.js`（框架：ctx + 四条总线 +
     `desired`/`actual` + `reconcile()`）/ `fade.js`（元素音量斜坡）→ `channels/{ambient,bgm,sfx,voice}.js`
     → **声明表** `scene-table.js`（场景 → 放什么）与 `sfx-table.js`（音效 → 配方/文件）
     → `index.js`（门面，唯一 import 入口）。
   - **心脏**：分清楚「该响什么」`desired` 与「现在在响什么」`actual`，所有入口（进屏/换幕、静音、
     用户手势、标签页可见性、元素被外部暂停）只改 desired 或调 `reconcile()`。
     老实现"静音后环境床再也不回来"就是因为没有这一层（2026-09-14 玩家反馈，当天重写收口）。
   - **切场景只走声明表**：`audio.scene({ act, label })` 或 `audio.scene('sandbox'|'title'|'luding'|'ending')`；
     新增场景 = `scene-table.js` 加一行。守卫核对「场景表 kind ↔ 文件映射 ↔ 磁盘文件」三层，
     **写错 kind 当场报错**（不然就是静默无声）；app 代码直调 `audio.ambient/bgm.play` 会被拦。
   - **加内容都不用改调用代码**：环境床 `public/audio/ambient/<kind>.ogg`、BGM `public/audio/bgm/<kind>_bgm.ogg`、
     音效 `public/audio/sfx/<name>.ogg` —— **落盘即生效**；缺文件时环境床走合成兜底、BGM 静默记账、
     音效回落到合成配方。账在 `qa:audio` 的提示段与 `state().actual.*.missing` 里，别以为"没报错就是有"。
   - **三层静音**：游戏内 `setMuted`（保留意图、取消即恢复，`qa:smoke` 有断言）· 浏览器/标签页静音
     （不可直接探测，由 reconcile 的手势/可见性/元素 pause 事件自愈）· 系统静音（应用层不该处理）。
   - **规矩由 `qa:audio` 的「框架一致性」段强制**：`public/js/` 里除 `audio/` 外不许出现
     `new Audio(` / `new AudioContext` / `.volume =` / `.gain.value =`，不许残留旧 API 名
     （`playAmbient`/`stopAmbient`/`playSfx`/`setEnabled`），只能从 `./audio/index.js` 进门。
     落地当天就靠这条抓出沙盘里自己 `new Audio` 的同伴反应音（现走 `audio.speak({ file })`）。
   - **不变量（`qa:av` 断言）**：**同一通道**最多一个句柄在播（按通道统计峰值：ambient ≤1 / bgm ≤1 / voice ≤1）。
     注意判据要按通道——语音叠在环境床/音乐上是正常的（2 条），全局阈值会误报。
   - **异步探测的竞态**（2026-09-14 修）：环境床的"先 HEAD 再放"是异步的，飞行期间若又切回同一场景，
     `current === kind && playing()` 拦不住（那时还没声音）→ 又发一次探测 → 两个探测各建一个 `<audio>`，
     前一个成孤儿、永远不停。现在用一个 `probing` 集合保证同一 kind 只有一次探测在飞，
     外加 `_playFile` 的幂等护栏（同一条已在播就返回）。**这就是 `qa:av` 的叠音断言存在的意义**：
     整局攒出 12 条同时播放时，只有它会喊（实测抓到）。
   - **听感这件事机器验不了**：无头浏览器没有音频输出，"元素在播"≠"你听得见"。两个入口——
     `public/dev/audio.html`（浏览器里逐个点播，标出每个声音现在用文件还是合成兜底）与
     `node tests/manual/audio-listen.mjs --measure`（可见 Chrome 里按顺序放一遍并量 RMS）。
   - 语音两条老规矩仍在：`voiceId` 必须走 `ACTOR_VOICE` 映射（中文角色名会被清洗成 default，哈希对不上）；
     文本要与 `data/tts-lines.json` 逐字一致，改台词重跑 `npm run tts:manifest`。

29. **板屏上的三件事：数值签会串写、rAF 不会自己停、点按区有门槛**（批五体检抓的）
   - **数值签串写**：上一局残留的定时器（如五子棋的 AI 落子）会往同一块 `#board-stats` 写、覆盖新一局的板头。`openBoard()` 现在**每局换一个新的数值签节点**，残留写入落在被丢弃的 DOM 上。
   - **rAF 不停**：离开板屏后容器被卸下，但钓鱼/泸定桥/陡坡的动画循环还在跑帧。三处循环都加了"`!document.body.contains(container)` 就 `cancelAnimationFrame`"的守卫（五子棋的定时器同款）——**新玩法照抄这条**。
   - **点按区 ≥32px**：五子棋格子 28×28 会被 `layout-audit --width 820` 判"手指点不准"（现 32，9×32+间隙=320 放得进 620 的板身）。
   - 另两条小的：`stats()` 返回句柄（标签 → `<b>`），倒计时这类每帧变的数值**只改文本**、别重写 HTML；`stats()` 的初始化要放在那几个状态变量声明**之后**（写在前面会踩 TDZ，抓过一次）。

30. **静态资源不发长缓存：浏览器缓存旧脚本的症状是"点哪儿都没反应"** —— 这个项目没有构建步骤、
   承诺是"改文件/换素材，刷新即生效"，所以 `server/index.js` 里页面/脚本/图片/音频一律**回源校验**
   （ETag → 304），只有 `/fonts` 保留 7 天（有意为之）。踩过的两件事：
   ① 排查音频修复时被 `max-age=1h` 骗过——改完 `audio.js` 刷新页面跑的还是缓存里的旧代码，
      一度以为修复没生效；
   ② 删掉 `public/js/audio.js` 改写框架后，`localhost:3001` 的缓存里留着旧 `main.js`（它 import 的
      `./audio.js` 已不存在）→ 模块 404 → **整个 app 的 JS 不执行**，页面显示正常、点哪儿都没反应。
   处理：**已经缓存过旧头的浏览器要硬刷新一次（`Ctrl+Shift+R`）**才认新头；急用可换个 origin
   （如 `http://127.0.0.1:3001/`，缓存键不同）。判定口诀：页面在、点了没反应 → 先硬刷新，再怀疑代码。

32. **前端架构：内核 + 总线 + IP 模块（批 1 落地，见 BUS.md）** —— 模块之间不直接调用，只走事件与只读快照；
   新增模块/玩法**不改内核、也不改别人的文件**。四条规矩由 `npm run qa:bus` 强制：
   ① 模块间不许 import（只许 `kernel/`）② 订阅只写在模块描述符里（模块内不许 `bus.on`）
   ③ 事件名先登记在 `kernel/contracts.js` ④ 模块必须在 `kernel/wiring.js` 的 MODULES 清单里。
   排错入口：`__czKernel.state()`（模块/订阅/锁/契约违规）与 `__czKernel.diag.toJsonl()`（事件流黑匣子）。
   三个**守卫/加载自己的坑**（都踩过）：① 清单提取要先剥注释——`wiring.js` 里那行"怎么加一行"的示例会被当成真清单；
   ② 模板字符串里的 `\s` 会被 JS 当成字符 s（`check-audio` 的对账正则曾因此静默失效）——守卫必须用正则字面量，
   且"解析不出东西"时要**直接报错**，不许静默通过；③ **清单里的 path 必须按模块根解析**：
   `import(item.path)` 的相对说明符是相对 `kernel/index.js` 的，写 `./modules/x/index.js` 会去找
   `kernel/modules/…` → 模块静默加载失败（只有冒烟测试才发现）。现在 `loadModules()` 显式
   `new URL('../' + path, import.meta.url)`，且 `qa:bus` 运行时断言"清单里的模块都真的注册了、无加载失败"。

33. **锁与屏：批 3 收口的两个语义（写错就出"点了没反应"或"元素残留"）**
   - **流程锁只占在"用户入口"**：`withLock(fn, { from: 'user' })` 占不到就广播 `resource:blocked`
     （shell 模块负责提示）；**流程内部**（幕末强制链 `runForcedChain`、快速模式的主玩法）用
     `{ from: 'flow' }`——既可能是第一棒、也可能是被嵌套，占不到就直接跑（占着的一定是自己这条流程）。
     这样原来那两处"手工 `S.busy = false` 再进流程"的补丁就结构性消失了。**`busy` 已从 `state.js` 删除**
     （运行时概念不该进存档），要判断"忙不忙"用 `kernel.resources.isHeld('flow')`。
   - **屏只能清自己的 DOM**：`showScreen()` 只切可见性 + 放入场动效，然后广播 `screen:hide` / `screen:show`；
     各屏宿主用 `kernel.api('screens').own(屏id, 清理函数)` 登记自己的清理（渲染与清理写在一起）。
     于是 `openBoard()` 不再依赖"showScreen 会顺手清"、也不再 `cloneNode` 换节点躲它——**自己先清自己的容器**。
   - 三个连带检查：`qa:bus` 断言"启动后无残留锁"与"屏清理已登记（stage/board）"；`qa:board` 断言
     "离开板屏后玩法区已清空"；`layout-audit` 逐屏截图（浮层与屏切换最容易在这里露馅）。
   - 模块内的状态放**模块级变量**，别挂描述符上（描述符只放方法与规定字段）——`this.owners.set is not a function`
     这个错就是总线体检当场抓到的。

34. **状态只有一条写路；HUD 靠订阅而不是靠调用顺序（批 4）**
   - **写状态**：一律 `st().动作(...)` 或 `st().apply(label, mutator, keys)`——写完自动
     **作废快照 → 广播 `state:change` → 存档**。`saveState()` 不再需要调用方记得；`main.js` 里的
     `S` 只是**只读别名**（历史读法），`qa:bus` 静态规则会拦 `S.x = …` / `S.x.push(…)` / `applyEffects(S, …)`。
   - **读状态**：其它模块用 `kernel.snapshot.get()`（冻结副本，只读）；渲染器要读嵌套字段用 `st().raw()`。
   - **HUD 不再被手工调用**：`renderStats` / `renderAp` / `renderCompanions` / 手记 / AI 计数都由
     `modules/hud` 订阅 `state:change` 自己重渲染（原来散着 32 处手工配对，漏一处就是"数字没更新"）。
     新增"要跟着状态变的读数" = 在 `modules/hud` 的 PARTS 表里加一行 + 写个渲染函数，不用去改流程代码。
   - **两个连带教训**：① 批量改代码的补丁脚本必须"要么全成功、要么不写盘"（我们的 `assert` 中止救了半途改坏，
     但也让另一处插入静默丢失——`st` 未定义就是冒烟抓到的）；② `ui.js` 里"既改状态又画界面"的函数要拆开
     （`appendCampLog` → `pushCampLog`（写）+ `renderCampLog`（画）、`bumpAiCount` → `state.bumpAiCount()` + `renderAiCount`）。

35. **加热天数必须同时补热点** —— 每幕的「可点热点数」必须 ≥ `apDays × apPerDay`，否则玩家会出现"还有行动点却无事可做"。`tests/unit/acts.test.js` 已把这条固化成断言（含坐标不重叠），改 `acts.json` 后跑 `npm run test:unit` 就会拦住。

36. **自动化里"等固定 sleep"就是随机变红（本轮两次实锤）** —— 2026-09-14 排验收时 `qa:motion` 与 `qa:board` 都出现"单跑通过、跑一轮随机失败"，成因同一条：

   - `qa:board` 的 `board(name)` 原来是 `mini(n)` + 等 400ms；而 `__czScreens.mini()` **是异步的**（内部先 await 场景对话再 `openBoard`），偶尔 400ms 还没轮到本玩法 —— 于是 `#board-stats` 里读到的是**上一个玩法的数值签**（sentry 读到 candy 的「还剩」），断言随机变红。
   - 修法一律是**等具体状态**：`qa-board` 轮询到"题名对上 **且** 数值签含本玩法的字"才断言，点第一步改成等"契约标记重新出现"；`qa-motion` 用 `waitForAnim(sel, want)` 等计算样式到位，并在失败时用 `dumpScene()` 打出场景现场（可见的屏、`body[data-step]`、元素在不在、有没有弹模型重试）。

   **三条教训**：① 断言前要等"只有成功才会出现"的那个状态，不要等时间；② 失败输出必须带现场，只报一句"实测 none"会让人查半天——`verify.mjs` 现在会把带 ✗ 的行从整张表里捞出来，因为尾部 24 行往往正好截不到它；③ 新守卫要**自己证明抓得到坏东西**：本轮对 `dev:check` 做了两个故意破坏用例（模块里加一行跨模块 `import`、往 `ui.js` 尾巴塞语法错），两次都如实变红、改回即恢复绿色。只会变绿的守卫等于没有。

37. **端口上蹲着的旧服务会给出"假绿"，dev:check 因此开工前先清场** —— 第 24 条讲的是"代码指纹比对"，但它只解决"复用旧代码"那一半：如果端口上还留着**上一轮验收**的进程，它带的是自己的 `LOG_DIR`（临时目录，多半已删）和环境变量，测试连上去看到的是别人的现场。本轮排查就撞见三个这样的残留进程，正好占着编排器要用的 `3200/3201/3202`。所以：

   - `npm run dev:check` 用**专用端口 3399**，并在起服务前按端口清掉监听进程；
   - 排查怪现象时先看一眼端口：`netstat -ano | findstr :3200`，有没有"别人的服务"；
   - 验收档仍按 `3200 + slot` 分端口；换号段时 `--port=` 与 `--jobs=` 要一起改。

38. **测试分层：三层，别拿真调档当日常** —— `dev:check`（~6s，0 真调，改一处就扫）→ `verify:fast`（~30s，提交前）→ `verify:full`（分钟级、真调，推送与交付前）。改代码的节奏快过验收的节奏，混在一起的结果就是"懒得跑"；但**快档不能替代真调档**：动效/流程类检查可以绕开模型，`source=GLM`、16 类 callType 覆盖、断网报错这些证据只有真调才拿得到。

39. **批次重构要按"分支"补测试：e2e 走的是研学模式，行军专属分支它碰不到** —— 2026-09-14 抓到的一条真 bug：批 4 把状态收归模块时，`doChoice` 里那句 `addLoss(S, …)` 漏改（`S` 已只是只读别名、`addLoss` 也不再导入），于是**行军模式一进高风险抉择就抛 `ReferenceError`，界面原地卡死**（湘江护送那一步）。它躲过了 e2e、smoke、board、av——因为这些都走研学模式，只有 `qa:loss`（注入断粮后走行军高风险抉择）和 `qa:failure` 会经过那条路。三条教训：

   - **改状态/抉择/失败线之后，`npm run qa:loss` 与 `npm run qa:failure` 必跑**（研学模式覆盖不到行军分支）；
   - **守卫要按"有没有真跑过违规"来验收**：同一天还发现总线守卫的第 ⑤ 条（"状态只能在 store 里写"）**从写下那天起就是死的**——四条正则里的 `\b` 被写成了字面退格符、字段名又用 `\w` 匹配不上中文（`S.体力 = …` 一个都抓不到），它却一直报 ✓。故意写一行 `S.体力 = 99` 才发现。现在六条规则都做过负向用例（跨模块 import / 事件未登记 / 写 S / 裸调 state 函数各来一次，全都能红）；
   - **报错行号要对**：剥注释改成"注释换等长空格、换行保留"后，规则报的行号与真源码一致（早先按剥离后的下标报行号，能偏十几行）。

## 六、下一步建议（按价值排序）

1. **真调验证已全覆盖**（2026-09-13）：标准模式一局 76 次调用全 `source=GLM`、无 ERROR；`failure_review` 由 `npm run qa:failure` 单独覆盖（注入"断粮+体力见底"走失败线，断言真调 1 次且渲染出标题/段落/史实要点）。16 类 callType 全部有真调记录。
2. **契约扩散（部分完成）**：夜校小游戏的内层选项已补 `data-mini-action="answer"`（2026-09-13，此前那一屏没有任何 `data-*` 标记，自动化只能干等）。仍待办：`runQuiz` 的「让两个 AI 对答」按钮与 `#quiz-auto` 靠 `data-choice-index` 兼职，建议走 `askChoice`；`runRest` 只有一个「继续」，可直接 `waitContinue`。
3. **数值平衡（进行中）**：测量口径已建好 —— `npm run qa:playtest` 按人类节奏跑局，输出时长/分幕耗时/五维终值/AI 调用数，结果表落 `docs/PLAYTEST.md`。热点已是一次性（第 20 条）；行军模式失败条件是「体力≤0」或「粮食=0 且体力≤30」，调参待做。
4. **素材已全清**（2026-09-13）：场景图 21/21、立绘 14/14、环境床 8 条 Ogg、TTS 缓存 20 条全部就位，**14 张立绘全部在用**（`xianggui.png` 由第三幕「老乡 · 问渡」热点接上）。
5. **音频剩余项**：操作音效仍是 WebAudio 合成（click/hook/echo 等），是否需要预录由路演音质要求决定。
6. **窄窗口已体检、手机档未适配**（2026-09-13 决策）：`node tests/e2e/layout-audit.mjs --width <宽>` 会逐屏报"页面横向溢出/控件出界/点按区<32px"。820 宽已清零（顺手修掉沙盘装饰层吃掉点击的 bug）。375 仍是已知项（横向溢出 543px、左侧 HUD 占 37% 宽、答辩面板文字出界），**故意不做手机适配**，除非演示要用手机。
7. **封装交付**：见 [`DELIVERY.md`](DELIVERY.md)，演示前把"一键启动"定型（离线能力**不存在**，别按离线规划演示）。
8. **离线回放（备选，未开发）**：现场无网／网关不可达／额度耗尽时的风险预案在 [`OFFLINE-REPLAY.md`](OFFLINE-REPLAY.md)。它从日志（运行时的 `logs/ai-calls-*.jsonl` 或入库样本 `logs/sample-full-run.jsonl`）转换出回放包，服务端按指纹命中重放真实响应，日志标 `source=REPLAY`。**当前代码里没有任何回放能力，勿当成现有功能**；断网就是 `source=ERROR` + 界面重试提示。

## 七、验收清单（每轮收尾跑这一套）

三层尺子（详见 [`QA.md`](QA.md) 开头）：改完一处先 `npm run dev:check`（6 秒、0 真调），提交前 `npm run verify:fast`，推送与交付前 `npm run verify:full`。

```powershell
# 批次中间：改一处就扫一眼（0 真调，约 6 秒）
npm run dev:check
# 提交前：一套不烧 AI 的守卫并行跑（约 30 秒）
npm run verify:fast
# 推送/交付前：真调那一档（分钟级；服务端改动后要看到测试输出 restarted，否则跑的是旧进程）
npm run verify:full
# 改台词后
npm run tts:manifest
```

- [ ] `dev:check` 7 步全 ✓（总线静态规矩 / 单元测试 / 文档一致 / 内核启动 / 开局到营地 / 玩法板 / 无报错）
- [ ] unit 49/49
- [ ] 标准模式与 `--quick` 均 E2E FULL PASS，无 pageerror
- [ ] 日志里 candy/sentry/gomoku/luding 各恰好 1 次，夜间 `night_options`+`night_resolve` 各 1 次
      （gomoku 只靠可选营地热点触发，偶尔落空——失败信息会带「营地历次热点 apN:[…]」）
- [ ] 玩法板体检全 ✓（板屏壳 / 数值签 / 契约标记 / 离开清空）
- [ ] 视觉守卫全绿；改了页面则出 1280/820 联系表
- [ ] 页面上没有"用了但 CSS 里没定义"的类（`.choice-btn` 那类事故，见第 27 条）
- [ ] 无 Key 时给出明确错误提示（不再静默、不编造内容）
