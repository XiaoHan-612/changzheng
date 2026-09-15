# 交接说明 · 代码（给下一个代码 agent）

> 你接手的是《长征·抉择》的**唯一可运行工程** `changzheng/`。
> 历史版本在 `../_archive/`（`sample/` 是最初的营地四线原型、`demo-v1/` 是五幕中间版），**只读参考，不要在那里开发**。
> 素材与音频分别交给生图/音频模型，见同目录 `HANDOFF-ART.md`、`HANDOFF-AUDIO.md`。

## 一、30 秒上手

```powershell
cd changzheng
npm install
npm start                 # http://localhost:3001
npm run test:unit         # 58 项：状态层 / 契约 / 配置层 / 减员 / 数值护栏 / 同伴一致 / 诗形制
npm run test:e2e          # 五幕**真调**通关（含快速模式：node tests/e2e/full-run.mjs --quick）
npm run qa:smoke          # 标题→营地→一次互动
npm run qa:audit          # 日志 schema 审计 → docs/LOG-AUDIT.md
npm run tts:manifest      # 生成 docs/TTS-MANIFEST.md（音频模型对照表）
npm run poem:manifest     # 生成 docs/POEM-TTS.md（终局升华那首诗：8 句 + 目标文件名 + 时间轴）
```

**没有 MOCK 模式**：所有智能判断都真调。`GLM_MODEL` 默认 `glm-5.1`（赛制指定），本机在 `.env` 用 `glm-5.3-flash` 替代；`GLM_REASONING_EFFORT` 默认 `low`（必须设，否则「始终思考」的模型会把 token 用在推理上、`content` 返回空）。

## 二、模块地图

| 文件 | 职责 | 改动注意 |
|---|---|---|
| `public/js/main.js` | 主线状态机：五幕、营地日、强制链、对决、失败/终局、篝火夜；**玩法宿主** `openBoard()` + `mountMini()` | 最大的文件；热点用 `HOTSPOT_HANDLERS` 映射表分发，**加玩法只加一行**；玩法一律挂板屏（见第 27 条） |
| `public/js/kernel/` | **内核**（新）：`bus`（事件总线）/ `contracts`（事件契约唯一真源）/ `plugins`（模块描述符）/ `kernel`（注册·接线·ready·诊断）/ `wiring`（模块清单）/ `resources`（显式锁）/ `snapshot`（只读快照）/ `diag`（事件流黑匣子） | 架构与规矩见 [`BUS.md`](BUS.md)；**模块集合不写死**——加模块只动 `wiring.js` 清单与模块自己的文件 |
| `public/js/modules/` | **IP 模块**（新）：已挂 `audio`（声音总入口）/ `shell`（外壳反应）/ `screens`（屏生命周期归属）/ **`state`（状态唯一持有者：写走动作并广播）/ `hud`（订阅 state:change 渲染读数）**；`games/` 是交互游戏插件契约 + 模板；`cinema/` 是**电影化三处的播放器**（拍子 `beats.js` + 编排 `sequences.js` + 播放 `player.js`，见坑 52 与 [`BUS.md`](BUS.md) §八） | 批 2 起逐个迁入；**业务发声音只发事件**（`sfx:play`/`voice:say`/`scene:enter`/`flow:act-enter`），`qa:audio` 会拦直接 import 音频门面的写法 |
| `public/js/step.js` | **交互契约**：`step()` / `askChoice()` / **`choiceButton()`（选项唯一构建处）** / `waitContinue()` / `markMini()` | 新增玩法只要声明契约，测试与自动化无需改动；详见 ARCHITECTURE 的「交互契约」 |
| `public/js/minigames.js` | **8 个玩法**：钓鱼/弯针/夜校识字/分糖/夜岗/五子棋/泸定桥/陡坡 | 统一返回 `{score, detail, summary?}`，本地只判手感，结算走 `/api/decide`；状态经 `stats(host, [...])` 写进板头数值签 |
| `public/js/state.js` | 资源/好感/附身线/行动点/每日场景/失败判定 | 纯函数、可单测；新增资源维度要同时改 `applyEffects` 的钳制表 |
| `public/js/origin.js` | 开场设定：出身三选一 + 出发前一问（纯数据 + 纯函数） | 三条出身的收益刻意对称（各 +5/−2），别加出唯一最优解；问答必须留在本地题库，开局第一屏不能依赖网络 |
| `public/js/audio/` | **音频框架**（批 1 重写）：`index`（门面）/ `mix`（混音表）/ `core`（desired-actual + reconcile）/ `channels/*` | 见坑 28；调用一律从 `index.js` 进，`qa:audio` 的框架一致性段强制 |
| `public/js/ui.js` | DOM 渲染与浮层 | 模型返回的文本一律走 `escapeHtml`；`showScreen()` 负责按模板选入场动效、并在离开舞台/板屏时清空内容 |
| `server/ai.js` | VN 侧提示词 + 真调 + 重试 | 每个 callType 的返回 schema 必须与前端读取字段一致 |
| `server/schema.js` | 响应契约唯一真源（`REQUIRED` / `missingFields` / `contractStamp`） | 改字段只改这里；`audit-logs.mjs` 与单测同源 |
| `server/logger.js` | JSONL 落库（按日文件 + 会话镜像 + 契约戳记 + 8MB 轮转） | 落库只有这一处，新增字段在这里加 |
| `server/balance.js` | 数值护栏（单维单次上限 / 单次最多 3 维 / 信念只在关键抉择正向） | 改数值要同时改提示词与单测（第 25 条） |
| `public/css/` | fonts → tokens（唯一值源）→ base → framework（模板 + 区块 + 动效）→ components | 页面不写样式（`qa:frames` 拦）；颜色/字号/圆角不许写死（`qa:tokens` 拦） |
| `server/index.js` | 路由 + 静态 + gzip + 缓存头 | 新增数据文件要在 `DATA_FILES` 白名单里加名字（别写成任意文件名：那是目录穿越） |
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

`operation.type` 约定：`fishing` / `soup` / `sugar` / `sentry` / `gomoku` / `luding` / `grab` / `path` / `rest`。

## 五、已知坑（都踩过）

1. **嵌套 withLock 会静默失效** —— 锁内调用带锁函数前先 `S.busy = false`。
2. **日志 source 不要写死模型名** —— 旧代码把 `glm-5.3-flash` 的调用标成 `GLM-5.1`，审计时说不清；现在 source 只标 `GLM`，模型看 `model`。
3. **`applyEffects` 键必须存在于 state** —— 例如旧的 `安全感` 字段会被静默丢弃；新增维度要同步改钳制表。
4. **模型返回下标/字段不可信** —— 答题下标用 `normIdx()` 夹取，夜间选项不足 2 个用兜底。
6. **测试别污染用户配置** —— e2e 会写 `runtime-config.json`，跑完要还原（已内置 snapshot/restore）。
7. **改台词文本会让 TTS 哈希文件名变化** —— 重跑 `npm run tts:manifest`。
8. **空 JSON 的根因是推理吃 token** —— 实测 54 次真调里 8 次返回 `{}`，耗时 9.6–12.3 秒。根因是 glm-5.3-flash「始终思考」：不设 `reasoning_effort` 时 token 全用在推理上。现在默认 `reasoning_effort=low` + `max_tokens` 2000（sim 2400），实测 1.2 秒、21 tokens 就返回合规 JSON；空对象仍按失败处理。
   `check-glm.mjs` 早先没带 `reasoning_effort` 且只给 64 tokens，结果自检报"失败"而游戏其实是好的——现已与服务端请求体对齐（默认 `reasoning_effort=low`、`max_tokens=256`），并在 `finish=length` 时直接提示"是参数太紧，不是接口坏了"。
   2026-09-13 实测同一网关：`glm-5.3-flash` 2.6s / 37 tokens 正常返回；`glm-5.1` **不认 `reasoning_effort=low`**，要 `max_tokens≥2000` 才吐 content，单次 ~11s。也就是说 glm-5.1 在这里能真调，但慢一个数量级——答辩前若要用指定模型，务必按 11s/次估时。
9. **真调可能等 10 秒以上** —— 「思考中」指示器会显示秒数；失败会弹出原因与「重试」键（不再有兜底文案）。
10. **日志审计按 id 去重、按契约戳记分账** —— 同一条调用会同时写进「按日文件」和 `session-full.jsonl`，`audit-logs.mjs` 已去重；记录再按 `contractOk`（`server/logger.js` 落库时盖）分出「本版本」与「入库样本之外的旧记录」两拨，前者违约才红灯。**日志不入库**：仓库里只有一份真实全程样本 `logs/sample-full-run.jsonl`（96 条、15 类、见 `logs/README.md`），运行时的 `ai-calls-<日期>.jsonl` 被 .gitignore 挡住——早先逐日入库，结果 diff 被日志噪音冲烂、8MB 轮转还把当天最早的记录裁掉（2026-09-13 改）。想把某一局单独看清：`LOG_DIR=<临时目录> npm start` 跑一局，再 `LOG_DIR=<临时目录> node scripts/audit-logs.mjs`（报告写进那个目录）。
11. **素材是「探测式」接入** —— 图片走 `sceneImage(新图, 占位图)`（`main.js` 顶部 + boot 里的 `preloadScenes()`），音频走 `AMBIENT_FILE` 映射（`audio.js`）。生图/音频模型把文件按约定名字落盘就自动生效，**不需要改代码**；加新素材时同步更新 `preloadScenes()` 与 `AMBIENT_FILE` 两张表即可。自检：`npm run qa:assets`。
12. **静态资源找不到必须 404** —— SPA 兜底只对页面路由生效（`server/index.js` 里排除了 `/assets`、`/audio`、`/css`、`/js`）。如果让缺图回 index.html（200），前端的素材探测和 `qa:assets` 都会被骗过。
13. **契约标记要随状态撤销** —— 过场按钮是静态 DOM，结束后必须 `delete dataset.action`；已用掉的糖/已落子的格必须移除 `data-mini-action` 或置 `aria-disabled`，否则"当前可交互项"会撒谎（这几条都是踩过的坑）。
14. **自动化只认契约** —— `tests/e2e/full-run.mjs` 的驱动按 `body[data-step]` + `data-action`/`data-choice-index`/`data-mini-*` 操作，不认识任何中文标签或屏内元素 id。新增玩法时先声明契约，别再改驱动。
15. **TTS 缓存靠"逐字一致"命中** —— 哈希是 `sha1(voiceId|text)`，所以：① 代码里 `say()` 的文本改了，就要同步改 `data/tts-lines.json` 并重跑 `npm run tts:manifest`，否则文件白做（曾 21/24 条不可达）；② `speak()` 的 voiceId 必须走语音通道的 `ACTOR_VOICE` 映射（`public/js/audio/channels/voice.js`）（中文角色名会被清洗成 `default`，哈希对不上）；③ 史实回响会念 `facts.json` 的标题，标题即 TTS 文本。验收：`npm run qa:tts` + 跑一局看 `ttsHits`（E2E 已断言 ≥5）。
16. **立绘兜底不能反过来写** —— 旧代码 `comp.img || portraitImage(npc)` 里的 `comp` 是 `COMPANIONS.find(...) || COMPANIONS[0]`，于是任何**非同伴 NPC**（母亲、船工、宣传员、向导、新兵）都长出老班长的脸，10 张新立绘里 5 张永远不会出现（2026-09-13 修）。现在统一走 `showNpc(npc, { role, mood })`：专属立绘 → 同伴立绘 → 文字头像。热点/抉择集想立谁，就写 `npc` 字段（`acts.json` 的 `wounded`、`CHOICE_SETS.snow_help` 是样例）。回归用例在 `tests/e2e/asset-drop.mjs`（点开「母亲」热点，断言立绘必须是 `mother.png`）。
17. **响应契约只有一张表** —— `server/schema.js` 的 `REQUIRED` 是唯一真源：`server/ai.js` 每次解析完就校验（缺必需字段 = 当次失败 → 走既有重试），`scripts/audit-logs.mjs` 用同一张表审计。别在别处再抄一份。起因是 2026-09-13 事故：模型把 `answer_index` 的键名写坏成 `",answer_index"`，由于只解析不校验，界面拿到"没有正确答案的题"照样往下跑 —— 只有日志审计能看出来，事后很难查。判定规则与回归用例见 `tests/unit/schema.test.js`。
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

38. **测试分层：三层，别拿真调档当日常** —— `dev:check`（~6s，0 真调，改一处就扫）→ `verify:fast`（~30s，提交前）→ `verify:full`（分钟级、真调，推送与交付前）。改代码的节奏快过验收的节奏，混在一起的结果就是"懒得跑"；但**快档不能替代真调档**：动效/流程类检查可以绕开模型，`source=GLM`、15 类 callType 覆盖、断网报错这些证据只有真调才拿得到。

39. **批次重构要按"分支"补测试：e2e 走的是研学模式，行军专属分支它碰不到** —— 2026-09-14 抓到的一条真 bug：批 4 把状态收归模块时，`doChoice` 里那句 `addLoss(S, …)` 漏改（`S` 已只是只读别名、`addLoss` 也不再导入），于是**行军模式一进高风险抉择就抛 `ReferenceError`，界面原地卡死**（湘江护送那一步）。它躲过了 e2e、smoke、board、av——因为这些都走研学模式，只有 `qa:loss`（注入断粮后走行军高风险抉择）和 `qa:failure` 会经过那条路。三条教训：

   - **改状态/抉择/失败线之后，`npm run qa:loss` 与 `npm run qa:failure` 必跑**（研学模式覆盖不到行军分支）；
   - **守卫要按"有没有真跑过违规"来验收**：同一天还发现总线守卫的第 ⑤ 条（"状态只能在 store 里写"）**从写下那天起就是死的**——四条正则里的 `\b` 被写成了字面退格符、字段名又用 `\w` 匹配不上中文（`S.体力 = …` 一个都抓不到），它却一直报 ✓。故意写一行 `S.体力 = 99` 才发现。现在六条规则都做过负向用例（跨模块 import / 事件未登记 / 写 S / 裸调 state 函数各来一次，全都能红）；
   - **报错行号要对**：剥注释改成"注释换等长空格、换行保留"后，规则报的行号与真源码一致（早先按剥离后的下标报行号，能偏十几行）。


    - `e.target` 是 `INPUT`/`TEXTAREA`/`SELECT`/`contentEditable` → 不抢；
    - `e.isComposing`（输入法组字中）→ 不抢。**这条是中文项目特有的**：拼音输入时数字/字母是候选选择键，抢了玩家连字都打不完。同理，Esc 也要分两种：组字中的 Esc 是"取消组字"（不抢），平时是"关浮层"（**要抢**——那是浏览器惯例，在输入框里也该能关掉设置）。
    - 另有组合键（`ctrl/meta/alt`）一律放行，别抢复制粘贴。
    - 修法：`ui.js` 的 `isTypingTarget(e)` + `step.js` 的 `activateChoice(n)`（"哪些元素算选项"的契约知识归契约层，别再在 main.js 里手拼选择器）。回归断言在 `dev:check` 的「输入框不吃快捷键」。

41. **模型没返回内容时，界面不许摆空壳** —— 2026-09-15 审查出的两条，都在"最容易被看见"的位置：

    - **终局**：`runEnding` 直接 `end.title / end.paragraphs`，而 `callAI` 在玩家点「跳过」后返回的是 `{_error:true}` —— 终局页只剩一个标题、没有正文、没有说明、没有重试。现在照 `runFailure` 的样子明说 + 给「重新结算」键（`data-action="end-retry"`），并把本局资源/关系照旧渲染（那部分不依赖模型）。
    - **知识对决**：出题失败时原代码会拿「题目 /（题目选项缺失）」当真题继续走，玩家答一道不存在的题、**还要再烧 3 次调用**（两个 AI 作答 + 判分）。现在是"本题跳过、双方不计分 + 继续"，一次调用都不多花。
    - 连带的坑：**交互行插错地方 = 看得见、点不到**。屏的背景层（`.end-bg`/`.pano-img`…）是 `position:absolute; inset:0`，`actionHost()` 的兜底分支以前把「重试／跳过」直接插进 `<section class="screen">`，终局那两键就被背景层盖住了——玩家会永远卡在"结算中…"。现在落到 `contentFace(screen)`（`ui.js`），并且 `dev:check` 的「终局失败也不空屏」会用 `elementFromPoint` 断言那个键**真的在该点上最上层**。
    - 终局失败那句说明用正常墨色：`.muted`(#8d8474) 在纸面上只有约 **2.9:1**，是给暗底 HUD 的次要标注用的，放正文里看不清（`#end-report` 里几处 `.muted` 同样偏淡，属已知设计项，未擅自改）。

42. **好感维度不许"看不见"** —— 2026-09-15 审查发现：`state.js` 里一直有 `好感_老乡`（模型能改、日志里有、研学报文也带着），而 `data.js` 的 `COMPANIONS` 只有四位——HUD 同伴栏、终局关系面板都不显示它，玩家做对做错都得不到反馈，等于白算一个维度（策划案 `DESIGN.md §同伴` 本来就写着五人）。已补第五位（立绘现成：`老乡 → xianggui.png`）。守卫是 `tests/unit/companions.test.js`：**每个 `好感_*` 维度必须有同伴位显示它、每位同伴必须有对应维度与立绘文件**，漂了就在 `test:unit` 里红。

43. **策划案的初始数值由机器对账** —— 同一次审查还发现 `design/make-docx.js` 里的「初始属性/初始关系」与代码漂了：策划案写 `体力75/信念65`、代码早已调成 `72/58`，五项好感也全对不上（评委是拿策划案对着游戏看的）。现在 `npm run qa:handoff` 会解析策划案源里的这两行与 `createState()` 逐项比对（解析不到就报错，不静默通过），改完数值记得 `node design/make-docx.js` 重新生成 docx。

44. **次要文字不能随手用 `.muted`：它是暗底色，落在纸上只有 1.86:1** —— 2026-09-15 审查发现研学报告里两行说明句发虚（「可以带孩子重点看腊子口与草地两段的减员记录」）。修法**不是逐处改颜色**，而是让材料负责：`framework.css` 里纸面材料把 `--muted` 重定义为 `--ink-note`（约 5.3:1），墨纱（`.ink-surface`）重定义为 `--paper-dim`——调用点照旧写 `.muted`、将来新写的也自动对，嵌套时由**最内层材料**决定（与 `.blk-stat` 落在纸面自动换浅纱是同一套思路）。三条连带教训：

   - **测量脚本自己也会骗人**：我第一版量出"2.9:1"，其实是解析 `rgba(196,183,156,0.92)` 的 alpha 时只写了 `\d+`，把 `0.92` 切成 `0` 与 `92`，于是以为那层纸是透明的、一路算到深色背景上；正确值 1.86:1（对 `--paper-veil`）。**报数之前先质疑自己的量法**（同族教训：剥注释把行号算偏，见坑 39）。
   - **层级感交给字号，别靠把颜色调淡**：说明句与列表项现在同为 5.3:1，主次由 12/13/16px 分开。
   - 守卫落在 `qa:tone`（"字可读"本来就归它管）：算 `--ink-note`/`--ink-2`/`--muted` 对纸面与暗底的比值，并**断言那条材料覆盖真的写在 CSS 里**——删掉它，纸面上的 `.muted` 会静默退回发虚（故意删过，守卫会红）。顺带被 `qa:tokens` 教育一次：注释里写色值字面量也算违规，组件层注释只写变量名。

45. **玩法宿主变服务：玩法只是清单里的一行（批 5）** —— 以前"开板屏 → 写题名/背景 → 建 host → 声明 `data-mini*` → 收尾清理"这套样板在 8 个 `doXxx()` 里各抄一遍，dev 钩子还再抄一张映射表；同事加玩法要改 `main.js` 三处。现在：宿主在 `modules/games/index.js`（开屏、题名/背景、数值签、`[data-mini]` 契约、清理登记、`game:start/end` 事件），玩法是 `modules/games/<id>.js` 一个描述符，**加玩法只动 `manifest.js` 两行 + `qa-board` 的 specs 一行**。三条经验：

   - **契约要能自证**：`qa:board` 新增"玩法清单 ↔ 体检表 ↔ 描述符声明的 actions"三方对账（故意删掉一个 `actions` 值验证过会红）——同事插新玩法时，报错直接告诉他是少了体检行还是动作没声明。
   - **占位实现要标清楚**：现有 8 个玩法内部还是旧版（同事在重做），所以它们只是薄薄一层 wrapper + 一句临时 import，文件头写明"正式版到位后整体替换"。**别把要丢弃的实现重构得很漂亮**。
   - **别急着把全局换成"组合根订阅"**：`main.js` 想听 `ai:feed` 时发现内核门面没有 `on()`（订阅只许写描述符，见 §三）——正解是把"调用流"搬进 `modules/ai`（谁的数据谁持有），而不是给组合根开后门。

46. **别让"每个调用点都要记得配一句"的样板存在**（批 6：AI 调用收编） —— 原来 `main.js` 的 `callAI()` 一个人管四件事（发请求、思考提示、记账、重试交互），于是 **50 个调用点各自**写 `showThinking(true)` / `finally { showThinking(false) }`、24 处 `st().bumpAiCount()`、每处 `setStepState('busy')`。现在：`modules/ai` 是唯一入口（`ask()`），进度用事件广播（`ai:start/done/fail`），UI 在 `modules/shell`，每类预算在 `modules/ai/registry.js` 一张表里。三条经验（前两条是我自己踩的）：

   - **机械替换要"按块配对"，不能只删分隔符**：删掉 `try` 的 `finally` 会留下**孤儿 `try`**（`try { … }` 不合法）。第一次我就这么把文件改坏了；正确做法是按缩进找配对、判定 finally 正文，只含指示器的**整块解包**、夹着 `catch` 的（那行 `} finally {` 同时是 catch 的收尾）只摘子句。`node --check` 是唯一真判据——我写的"空 finally 计数"这类启发式正则自己误报了两次。
   - **描述符上的方法不在 `api` 对象上**：`api.ask()` 里写 `this.onFeed()` 会炸（`onFeed` 是描述符的方法，不随 `api` 出去）。要共用的逻辑抽成模块内函数（`appendFeed`），订阅入口与 `ask` 各调它——两条调用路径别混用一套 `this`。
   - **失败交互用"事件往返"而不是回调注入**：`ai` 模块广播 `ai:fail`，`shell` 挂出「重试／跳过」并用 `ai:verdict` 把裁决发回来（带 `id` 配对）。于是模块不碰 DOM、UI 不碰调用细节，而且**没人听时**也不会悬着（`waitVerdict` 的兜底 + 契约里写清 `id`）。

47. **拆大文件：机械搬迁的四条硬规矩**（批 7 把 `main.js` 2216 行拆成 `flow/*`，踩了三处） ——

   - **块的结尾按"花括号深度"判定，别按空行**：函数体里本来就有空行。第一版拿"遇到空行"当结尾，一下就切坏了两个文件（大括号少了/多了）。按深度数才对。
   - **搬过去的声明要带 `export`**：整段剪来的是 `function xxx(`，那边 `import { xxx }` 会报 "does not provide an export named"——两轮一共补了 58 处。搬迁脚本里"导出检查"应该是标配。
   - **动手前先写一个"缺 import 检查器"**：按各文件真实导出表列出"用到了但没 import、也没本地定义"的名字。靠"跑测试→看页面报错→补一个"太慢（一跑 20 秒）。这个检查器还顺手抓出一处**会成环**的依赖（`doFishing → doSoup`，而 `doSoup` 当时在 `act` 里）：破环靠"把互相咬合的东西放进同一个文件"（营地与幕推进合成 `flow/act.js`）或"钩子注入"（`withLock` 需要的按钮刷新走 `kit.setMarchUpdater`）。
   - 附带：**扫描脚本别假设文件内部的结构**。`check-handoff` 的立绘映射原来靠"表在函数之前"切片，搬完顺序一变就得到**空切片**——而空切片会让检查**静默变绿**。现在只取表本身，找不到就报"扫描失败"。

48. **"发射后不管"的音频 Promise 会静默死等，`stop()` 必须让它落地**（批 A 重写语音通道时挖出来的） —— `VoiceChannel._playFile` 原来是这样：被新句顶替时 `done()` 里第一件事就是 `if (this.el !== el) { resolve(); return; }`，看着没问题；但 `stop()`（打断、静音、切场景都走它）把 `this.el` 一置 null 就什么也不做——**那个句柄的 `resolve` 从此再也不会被调用**。之所以一直没炸，是因为调用点全是 `speak()` 不 await（audio 模块 `.catch(() => {})` 发射后不管）。终局升华要 `await` 一句朗诵、还要跟它逐字对齐，这条就会立刻变成"点跳过之后界面不动"。现在的规矩：
    - 通道把"落地口"存成 `this._settle`，`stop()` 一定调它，并补发 `voice:ended {interrupted:true}`——**收尾三路（播完/打断/出错）都要发，消费方才敢只等一条事件**。
    - 与它配对的是"框架 → 总线"的出口 `core.onReport`（`modules/audio` 注入）：通道不认识总线，回执只能从这一个口出，**别在别处再开一条手工通道**（`onSuspended` 那套的形状）。`qa:av` 现在断言 `voice:start/progress/ended` 真的在流、`ended` 不落单。
49. **同一个哈希算法写在两处，就是等着分岔**（审查没发现、我自己比对时撞见的） —— `/api/tts` 的缓存名 = `sha1('音色|文本') + 音色`，所以"没指定音色时算哪个 id"是**双方约定**：服务端默认 `'default'`、前端 `voice.js` 里回落写的是 `'narr'`、连 `scripts/check-audio.mjs` 自己算参照集时也硬写 `'narr'`——三处各写一遍，谁改一处都不报错，只是缓存永远命中不了（听感上"这句没声"，排查起来像见鬼）。现在前端 `DEFAULT_VOICE` 是导出常量、`qa:audio` 把两处抠出来比对，**并且检查自己的正则还能不能匹配上**（抠不出来就报错，守卫不许静默失效——与坑 47 的最后一条同源）。
50. **内核会"捕获并跳过"模块抛的错：功能静默少一块，而不是当场炸**（批 A 自己踩的，值得单列） —— 新加的"框架 → 总线"回执 `audio.onReport(fn)` 我写在了 `AudioCore` 上，而调用方 `modules/audio` 的 `ready()` 里写的是**门面** `audio.onReport(fn)`——`TypeError: audio.onReport is not a function`。内核把这条吞成 `ready-error` 诊断，于是：**声音照响**（通道没问题）、**事件一条不发**（回执没接上），游戏看起来一切正常，只有未来靠这些事件的逐字跟读会"永远不动"。是"拿真页面跑一次探针"才挖出来的（探针当时还是我临时写的）。
    - 教训一：**"内核不崩"的设计必须配一条"别让它静默变残"的守卫**。`dev:check` 现在断言 `init-error / ready-error / subscriber-error` 为 0（以前只查契约违规、坏描述符、模块没注册），负向测试验过会红。新增模块的 `ready()` 里接了事件/回调的，这条会替你看着。
    - 教训二：**新通道上线前拿真页面验一次"回声"**，别只验"声音在响"（`isPlaying` 为真不等于事件在流）。验的时候记得先等 `__czKernel.state().booted === true`——`__czKernel` 在模块加载前就挂上了，等它就是不等启动（第一版探针正是这么误判的，看到的"没反应"其实是探针太早）。

51. **写死了文件清单的测试命令，会让新加的守卫文件"永远不跑"**（批 B 顺手挖出来的，代价可能已经付过一次） —— `package.json` 里 `test:unit` 一直是手列文件：`node --test tests/unit/state.test.js tests/unit/config.test.js …`（6 个）。上一轮加的 `companions.test.js`（好感维度一致性守卫）**没有被任何命令跑到**——`verify:fast` 走 `npm run test:unit`、`dev:check` 走通配符，于是"本机快检绿、提交前的验收也绿"，而那条守卫一次都没执行过（跟坑 47 最后一条同一个病：**守卫静默失效比没有守卫更坏**）。
    - 改成 `node --test "tests/unit/*.test.js"`：加文件不用改命令，数字也对得上（49 → 58 项）。
    - **别写成 `node --test tests/unit/`**：Node 24 在 Windows 上会把目录当测试文件，报 `MODULE_NOT_FOUND`（试过）。通配符形式两个平台都稳。
    - 同类自查：凡"新加东西要记得登记进某个列表"的地方（测试文件、扫描脚本的目录清单、允许的事件名），一律改成按目录/模式发现；确实必须手列时，就加一条断言"清单里的文件都存在"，让漏登记当场变红。

52. **"报告成功但没干活"的守卫最坏：它让你以为有防护**（批 C 挖出来的，已静静绿了三个提交） —— `tests/e2e/layout-audit.mjs` 原本会把标题/序章/营地/抉择/回响/手记/玩法板逐屏摆出来体检；**批 7 的一次机械改动把它从 241 行切成 110 行**，`main()` 里只剩"打开标题页 → 关浏览器"，而 `shot()`/`probe()` 都还在文件里（所以读代码不觉得少东西）。它照样打印 `✓ 1280px 宽逐屏无横向溢出/控件出界/点按区过小`，`docs/QA.md` 也照着这句话宣传"逐屏 0 处问题"。
    - **怎么发现的**：把它的输出当证据读——只有一行 `shot 01-title`，而文档说它巡屏。**退出码 0 什么都没证明**（那是这批的第二重问题：有 defects 时它也不带非零码返回）。
    - 现在的三道自保：① 页数打印出来（`共 17 屏`）；② 脚本里写死一张"**必到的屏**"清单（`REQUIRED`）并对账，少跑一屏就计入问题、非零退出；③ 有 defects 就 `process.exitCode = 1`。
    - 更一般的教训：**机械重构之后，验收脚本要"跑一次并读它的输出形状"**，不能只看绿不绿。同类信号：条数从 N 变成 M、少了一屏、少了一个"检查了 x 个文件"的计数——本项目已经吃过三次（坑 47 的"空切片换绿"、坑 51 的"手列清单漏文件"、这一条）。所以凡体检脚本，**必须打印它体检了几样东西**，并对自己有个下限断言。
53. **对"可能不在的元素"用默认超时的 `page.click` 会让快检慢 4 倍**（批 C 顺手修掉） —— 序章上线后，`dev:check` 的"开局到营地"从 1.4s 变成 31.9s。原因不是序章慢，而是那一步里有一句历史遗留的 `page.click('#btn-cut-skip')`：`passOrigin` 已经把过场都清掉了，按钮此时**不可见**，Playwright 会按默认 **30s** 死等可交互性，超时抛错后被 `.catch(() => {})` 吞掉——于是"什么都没做，但花了 30 秒"。
    - 规矩：**对"可能不存在/可能不可见"的元素，要么先判 `count()/isVisible()`，要么显式给 `{ timeout: 1500 }`**。快检的每一秒都是开发者耐心，别把它花在等一个注定超时的点击上。

## 六、下一步建议（按价值排序）
0. **电影化三处还剩两批**（2026-09-15）：序章已完成（批 C，`modules/cinema`）。**批 D** = 幕间过渡把 `flow/act.js` 的 `runCutscene` 换成 `cinema.play('act-break', {act})`（旧实现删除，`marchTransition` 降级为拍子之间的连接件）；**批 E** = 终局升华（`poem` 逐字跟 `voice:progress` 的已播毫秒 + `seal` 钤印，自动播/可跳过/1x·1.5x，失败分支不演）。诗的音频两条路都还没素材（逐句配音清单在 `docs/POEM-TTS.md`，整段录音放 `public/audio/poem/` 并在 `data/poem.json` 填 `audio.full`）——**没有音频也能演**（按 `pace` 逐字）。
1. **真调验证已全覆盖**（2026-09-13）：标准模式一局 76 次调用全 `source=GLM`、无 ERROR；`failure_review` 由 `npm run qa:failure` 单独覆盖（注入"断粮+体力见底"走失败线，断言真调 1 次且渲染出标题/段落/史实要点）。15 类 callType 全部有真调记录。
2. **契约扩散（部分完成）**：夜校小游戏的内层选项已补 `data-mini-action="answer"`（2026-09-13，此前那一屏没有任何 `data-*` 标记，自动化只能干等）。仍待办：`runQuiz` 的「让两个 AI 对答」按钮与 `#quiz-auto` 靠 `data-choice-index` 兼职，建议走 `askChoice`；`runRest` 只有一个「继续」，可直接 `waitContinue`。
3. **数值平衡（进行中）**：测量口径已建好 —— `npm run qa:playtest` 按人类节奏跑局，输出时长/分幕耗时/五维终值/AI 调用数，结果表落 `docs/PLAYTEST.md`。热点已是一次性（第 20 条）；行军模式失败条件是「体力≤0」或「粮食=0 且体力≤30」，调参待做。
4. **素材已全清**（2026-09-13）：场景图 21/21、立绘 14/14、环境床 8 条 Ogg、TTS 缓存 20 条全部就位，**14 张立绘全部在用**（`xianggui.png` 由第三幕「老乡 · 问渡」热点接上）。
5. **音频剩余项**：操作音效仍是 WebAudio 合成（click/hook/echo 等），是否需要预录由路演音质要求决定。
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
- [ ] unit 53/53
- [ ] 标准模式与 `--quick` 均 E2E FULL PASS，无 pageerror
- [ ] 日志里 candy/sentry/gomoku/luding 各恰好 1 次，夜间 `night_options`+`night_resolve` 各 1 次
      （gomoku 只靠可选营地热点触发，偶尔落空——失败信息会带「营地历次热点 apN:[…]」）
- [ ] 玩法板体检全 ✓（板屏壳 / 数值签 / 契约标记 / 离开清空）
- [ ] 视觉守卫全绿；改了页面则出 1280/820 联系表
- [ ] 页面上没有"用了但 CSS 里没定义"的类（`.choice-btn` 那类事故，见第 27 条）
- [ ] 无 Key 时给出明确错误提示（不再静默、不编造内容）
