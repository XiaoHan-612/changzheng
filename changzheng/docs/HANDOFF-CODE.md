# 交接说明 · 代码（给下一个代码 agent）

> 你接手的是《长征·抉择》的**唯一可运行工程** `changzheng/`。
> 历史版本在 `../_archive/`（`sample/` 是最初的营地四线原型、`demo-v1/` 是五幕中间版），**只读参考，不要在那里开发**。
> 素材与音频分别交给生图/音频模型，见同目录 `HANDOFF-ART.md`、`HANDOFF-AUDIO.md`。

## 一、30 秒上手

```powershell
cd changzheng
npm install
npm start                 # http://localhost:3001
npm run test:unit         # 13 项，状态层 + 配置层
npm run test:e2e          # 五幕 MOCK 通关（含快速模式：node tests/e2e/full-run.mjs --quick）
npm run qa:smoke          # 标题→营地→一次互动
npm run qa:sandbox        # 自由行军沙盘
npm run qa:regress        # 沙盘监听泄漏 / 存档回合错位
npm run qa:audit          # 日志 schema 审计 → docs/LOG-AUDIT.md
npm run tts:manifest      # 生成 docs/TTS-MANIFEST.md（音频模型对照表）
```

无 Key 自动进 MOCK，全流程可跑通；`GLM_MODEL` 默认 `glm-5.1`（赛制指定），本机可在 `.env` 覆盖成 `glm-5.3-flash`。

## 二、模块地图

| 文件 | 职责 | 改动注意 |
|---|---|---|
| `public/js/main.js` | 主线状态机：五幕、营地日、强制链、对决、失败/终局、篝火夜 | 最大的文件；热点用 `HOTSPOT_HANDLERS` 映射表分发，**加玩法只加一行** |
| `public/js/minigames.js` | 7 个小游戏：钓鱼/弯针/识字/分糖/夜岗/五子棋/泸定桥/陡坡 | 统一返回 `{score, detail, summary?}`，本地只判手感，结算走 `/api/decide` |
| `public/js/state.js` | 资源/好感/附身线/行动点/每日场景/失败判定 | 纯函数、可单测；新增资源维度要同时改 `applyEffects` 的钳制表 |
| `public/js/sandbox.js` | 自由行军沙盘（世界裁判 + 存档） | 表单监听只绑一次（`bindSandboxFormOnce`），别改回 `addEventListener` |
| `public/js/audio.js` | 环境床/SFX 合成 + 预录 wav + TTS 缓存 | `speak()` 命中顺序：预录 → TTS 缓存 → 静默 |
| `public/js/ui.js` | DOM 渲染与浮层 | 模型返回的文本一律走 `escapeHtml` |
| `server/ai.js` | VN 侧提示词 + MOCK + FALLBACK | 每个 callType 的返回 schema 必须与前端读取字段一致 |
| `server/sim.js` | 沙盘世界裁判 | 同上 |
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
                        热点 → HOTSPOT_HANDLERS[kind] → 小游戏/对话 → /api/decide → 史实回响
                        「启程」→ 天数用尽 → runForcedChain（强制链 + 对决）
   → finishAct（幕间总评 → 第四幕追加 runNightChoice → actIndex++ → 粮荒/失败结算）
   → 终局 runEnding（ending_review + 研学报告 study_report）
```

**附身线门控**：`state.linesDone` 记 5 条营地线（fishing/candy/sentry/school/gomoku），`canNight()` ≥3 才解锁篝火夜；手记面板显示 `N/5`。

**防重入**：`S.busy` + `withLock`。注意历史约定：在锁内要调用 `runForcedChain` 时先手动 `S.busy = false`（见 `onHotspot` 的 march 分支与 `runQuickAct`），否则嵌套 `withLock` 会静默 return。

**幂等**：`S.doneKeys[actId:key]` 记录已完成的强制步骤，热点做过的不重播。

## 四、AI 契约（每个 callType 的必需字段）

`source ∈ {GLM, MOCK_AI, FALLBACK}`，具体模型看日志 `model` 字段。校验脚本：`npm run qa:audit`。

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
6. **测试别污染用户配置** —— e2e 会切 MOCK，跑完要还原 `runtime-config.json`（已内置）。
7. **改台词文本会让 TTS 哈希文件名变化** —— 重跑 `npm run tts:manifest`。
8. **真调会偶发空 JSON** —— 实测 54 次真调里 8 次返回 `{}`，且耗时都在 9.6–12.3 秒（token 上限被推理占满）。现已把 `max_tokens` 提到 2000（sim 2400），并把空对象当失败处理：重试一次，仍失败就走 FALLBACK，玩家不会再看到空白叙事。真调后跑 `npm run qa:audit` 复查 `docs/LOG-AUDIT.md` 的「字段缺失明细」。
9. **真调可能等 10 秒以上** —— 点「思考中」的指示器会显示已等待秒数；若现场网络差，直接切 MOCK 演示。
10. **日志审计要按 id 去重** —— 同一条调用会同时写进「按日文件」和 `session-full.jsonl`；`audit-logs.mjs` 已去重。`docs/LOG-AUDIT.md` 里的「字段缺失」混有旧版本历史记录；想只看当前版本，用 `LOG_DIR=<临时目录>` 单独跑一局再审计（当前版本 MOCK 全流程字段缺失为 0）。

## 六、下一步建议（按价值排序）

1. **真调验证**：本轮新增/补齐的 8 条契约（`share_judge(sugar)`、`minigame_review(sentry/gomoku/luding/grab)`、`night_options`、`night_resolve`、`ending_review`、`study_report`、`failure_review`、`sim_turn`）只在 MOCK 下跑过；真调一局后跑 `npm run qa:audit` 看缺失与 FALLBACK。
2. **数值平衡**：行军模式的失败条件现在是「体力≤0」或「粮食=0 且体力≤30」；建议真人试 3 局记录曲线。
3. **场景图补齐**：按 `HANDOFF-ART.md` 生成 3 张本轮必需 + 18 张后续，落盘后热点背景即可升级。
4. **音频升级**：环境床从 WebAudio 合成换成 ogg，TTS 缓存按 `TTS-MANIFEST.md` 产出。
5. **移动端专项**：目前只有 820/900px 两个断点，未逐屏验证 375 宽。

## 七、验收清单

```powershell
npm run test:unit && npm run test:e2e && npm run qa:sandbox && npm run qa:regress && npm run qa:audit
```

- [ ] unit 13/13
- [ ] 标准模式与 `--quick` 均 E2E FULL PASS，无 pageerror
- [ ] 日志里 candy/sentry/gomoku/luding 各恰好 1 次，夜间 `night_options`+`night_resolve` 各 1 次
- [ ] `style.css` 无死类残留，全站无乱码注释
- [ ] 断网/无 Key 可完整演示（日志 `source=MOCK_AI`）
