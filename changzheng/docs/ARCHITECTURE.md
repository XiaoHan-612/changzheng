# 《长征·抉择》架构说明

## 定位

网页端五幕 AI 科普互动游戏。核心循环：**暮色营地探索 → 抉择/小游戏 → 大模型裁决 → 史实回响 → 启程**。
界面两条骨架：**舞台屏**（立绘 + 对白 + 抉择）与**玩法板**（小游戏：题名 + 数值签 + 玩法区）；人物在舞台交代任务，玩法在板上做，结算回舞台。

## 目录结构（工程规范）

```
changzheng/
  package.json          # scripts: start / test:* / qa:* / fonts:build / tts:manifest
  .env                  # GLM_API_KEY / GLM_MODEL / PORT（不入库；runtime-config.json 可覆盖）
  server/               # 服务端：静态托管 + AI 代理 + 契约 + 日志
    index.js            # 路由 /api/decide /api/sim /api/tts /api/config /api/logs /api/data/*
    ai.js               # VN 侧：提示词 + 真调 + 重试 + 响应契约校验
    sim.js              # 沙盘世界裁判（sim_turn）+ 同一张契约表校验
    schema.js           # 响应契约唯一真源（REQUIRED / missingFields / contractStamp）
    logger.js           # JSONL 落库（按日文件 + 会话镜像 + 契约戳记 + 8MB 轮转）
    balance.js          # 数值护栏（钳制表）
    config.js           # 双层配置 + 损坏容错
  public/               # 客户端（无构建，原生 ES Module）
    index.html          # 18 个屏；每屏一个 tpl-* 模板（由 qa:frames 强制）
    css/                # fonts → tokens（唯一值源）→ base → framework（模板+区块+动效）→ components
    js/
      kernel/           # 【新】内核：bus / contracts(事件契约) / plugins / kernel / wiring(模块清单)
                        #        / resources(显式锁) / snapshot(只读快照) / diag(事件流黑匣子)
                        #        架构与新模块怎么加见 docs/BUS.md
      modules/          # 【新】IP 模块：README + games/（交互游戏插件契约与模板）
      main.js           # 流程状态机（批 7 会拆成 modules/flow/*）（幕、营地、强制链、锁、篝火夜、玩法宿主 openBoard/mountMini）
      step.js           # 交互契约（setStep / askChoice / choiceButton / waitContinue / markMini）
      minigames.js      # 8 个玩法（本地判手感，结算走 /api/decide）
      sandbox.js        # 沙盘循环 v2（事件图卡、语音、存档、目标/记忆、模型收尾）
      state.js          # 资源/好感/附身线/行动点/失败判定（可单测）
      origin.js         # 开场出身三选一 + 出发前一问（纯本地）
      audio/            # 音频框架：index（门面）/ mix（混音表）/ fade（音量斜坡）
                        #             scene-table + sfx-table（声明表）/ core（desired-actual + reconcile）
                        #             channels/{ambient,bgm,sfx,voice}
      origin 以外的 data.js / ui.js / ai-client.js / features.js
    dev/framework.html  # 样板页：区块四态 + 7 模板缩略（qa:proof 出图）
    dev/audio.html      # 音频试听页：按通道逐个点播，标出用文件/合成兜底/缺文件
    fonts/              # 五族自托管字体（tools/build-fonts.mjs 生成）
    assets/scenes|characters|events/
    audio/ambient|sfx|cache|reactions|voices/
  data/
    acts.json           # 五幕定义（热点、dayScenes、强制链、对决）
    facts.json          # 史实卡 14 张 real/fiction
    sim-visuals.json    # 沙盘事件图与标签映射
    tts-lines.json      # 固定台词清单（改文本要重跑 tts:manifest）
  tests/
    unit/               # node --test：状态层 / 契约 / 配置层 / 减员 / 数值护栏
    e2e/                # full-run（五幕真调）/ smoke / sandbox / regressions / failure
                        # av-audit（影音）/ layout-audit（逐屏布局）/ asset-drop
    manual/             # 体检与一次性排查：qa-board / qa-motion / qa-hud / screen-sheet …
  scripts/              # audit-logs · lint-tokens · lint-frames · check-tone · check-fonts
                        # check-handoff · check-audio · check-tts · tts-manifest · reset-logs
  tools/                # build-fonts.mjs（字体子集）+ token-baseline.json（字面量基线）
  docs/                 # 本目录：交接 / 架构 / QA / 设计系统 / 评分 / 交付
  logs/                 # AI 调用 JSONL：入库只有一份样本（sample-full-run.jsonl）
                        # 运行时写 ai-calls-<日期>.jsonl（不入库、8MB 轮转）见 logs/README.md
```

## 运行时数据流

现状（分批迁移中，见 [`BUS.md`](BUS.md)）：

```
UI 事件 → main.js(withLock) → ai-client → POST /api/decide
       → server/ai.js(GLM|ERROR) → logger JSONL
       → applyEffects(state) → 史实回响(echo) → 下一屏
```

目标形态（每批往前挪一步）：

```
        ┌─────────────── kernel（bus / contracts / resources / snapshot / diag）───────────────┐
UI 事件 ─┤ kernel.emit('ai:request', …)                                                       │
        │        ↓ 谁订阅谁处理（模块在描述符里声明；订阅只在 wiring 清单里登记）                 │
        │   modules/ai ──→ POST /api/decide ──→ 契约校验 ──→ logs JSONL ──→ emit('ai:done')     │
        │   modules/state（唯一快照提供者）── emit('state:change') ──→ 订阅者按需读 snapshot    │
        └──────────────────────────────────────────────────────────────────────────────────────┘
```

## 交互契约（`public/js/step.js`）—— 全项目唯一"当前在做什么"的真相

历史上进度只存在内存（`S.busy` / `doneKeys`），DOM 里没有"当前步骤"的表示，
于是出现三类通病：残留节点被当成当前场景、每个玩法各写一套选项渲染、测试脚本必须认识每个屏的元素 id。
现在统一由 `step.js` 往 DOM 写契约，**人和自动化都读它**：

| 契约 | 含义 |
|---|---|
| `body[data-step]` / `[data-step-kind]` / `[data-step-state]` | 当前步骤 id / 类型（choice·minigame·talk·quiz·camp·cutscene·echo·end）/ 状态（awaiting·busy·done） |
| `[data-action="continue\|echo-ok\|march\|hotspot\|skip\|talk-end\|ai-retry"]` | 通用动作；**离开该屏时必须摘掉标记**，否则会误导消费方 |
| `[data-choice-index]` | 任何选项（抉择/答题/岔路/篝火菜单/夜校/夜岗…），由 `choiceButton()` 统一产出（`askChoice()` 是它的批量封装） |
| `host[data-mini]` + `[data-mini-state]` + `[data-mini-action]` | 小游戏容器/状态/可操作项；不能操作的项（已用掉的糖、已落子的格）**必须移除 action 或置 aria-disabled** |

**规则**

1. 新增玩法：实现小游戏 → `markMini(host, name)` → 控件加 `data-mini-action` → 状态变化时更新 `data-mini-state`；
   主流程 `step('<id>', 'minigame')`；测试无需改动（驱动只认契约）。
2. 选项一律用 `askChoice()`（成组、需要 resolve）或 `choiceButton()`（单个、自己接 onClick），不要再手写"渲染选项→禁用→resolve"。
3. 等模型时 `setStepState('busy')`（`callAI()` 已自动处理），消费方据此等待而不是乱点。
4. 离开屏幕时清理内容（`showScreen()` 已清舞台纸卷 `#stage-panel`/`#sheet-actions` 与玩法板 `#board-body`/`#board-stats`），并摘掉 `data-action` 标记。

## 关键设计约束

| 约束 | 实现 |
|------|------|
| AI 决策必须走指定模型 | 仅 `/api/decide`，禁止前端独立裁决算法 |
| 每次调用有日志 | 运行时 `logs/ai-calls-<日期>.jsonl` + 游戏内记录；入库样本 `logs/sample-full-run.jsonl` |
| 一局可完整通关 | 五幕 + 终局 |
| 算法对抗 | 每幕知识对决 human vs AI |
| 流程不重入 | `state.busy` + `withLock` |
| 已完成不重播 | `doneKeys[actId:key]` |
| 音频不挡流程 | 预置 wav 后台播；自由 LLM 回复静音 |

## 测试流程（提交前必跑）

```powershell
# 全流程（真调，需配好 Key）
npm run test:e2e      # 五幕真调通关（~76 次调用）+ 不重复结算等断言
npm run qa:sandbox    # 沙盘两回合 + 存档恢复 · qa:regress 沙盘回归 · qa:failure 失败线
npm run qa:av         # 影音审计：资源 404 / 立绘 / 环境床 / TTS 解码
# 局部（多数不烧 AI）
npm run test:unit     # 49 项：资源钳制 / 史实解锁 / 契约 / 配置层 / 减员 / 数值护栏
npm run qa:smoke      # 标题→营地→一次互动（含"用过的热点当场作废"断言）
npm run qa:board      # 玩法板体检 36 项（板屏壳 / 数值签 / 契约标记）
npm run qa:tokens · qa:frames · qa:tone · qa:motion   # 视觉守卫
npm run qa:audit      # 日志 schema 审计 → docs/LOG-AUDIT.md · qa:handoff 交接文档一致性
npm run tts:manifest  # 更新语音清单（改台词后必跑）
```

有 Key 时：设置里测试连通，再手玩一幕真调。
界面结构（两条骨架）与视觉约束见 [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md)。

## 配置层约定

- `runtime-config.json` 覆盖 `.env`；`RUNTIME_CONFIG` / `ENV_FILE` 环境变量可改路径（测试用）
- 设置界面写入的模型 / Key / 接口 / 推理档位会持久化到 `runtime-config.json`，重启后仍生效
- 配置文件损坏时按空配置启动并告警，不会让服务起不来
- 日志 `source` 只有 `GLM`（成功）与 `ERROR`（重试用尽）；具体模型名看 `model` 字段
- **没有 MOCK 模式**：无 Key 或调用失败一律报错并记录，不再编造叙事

## 与同类图文互动游戏的对照

| 参考 | 借鉴 | 本作落地 |
|------|------|----------|
| 80 Days | 行程可见、回望记录 | 行程缎带 + **手记（回望）** 面板 |
| Reigns | 卡牌抉择、倾向预告 | 电影事件卡 + `choice_hint` 趋势/风险 |
| 中国式家长 | 行动点取舍、关系网 | 暮色行动点 + 五同伴好感 |
| 文字 AVG | 全屏叙事、回响 | 电影卡 + 史实盖章 |
| Papers Please | 可审计记录 | 行军记录 + 答辩面板 + 研学报告 |

键盘：`1/2/3` 选项 · `J` 手记 · `Esc` 关闭浮层。
