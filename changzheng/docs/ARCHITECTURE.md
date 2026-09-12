# 《长征·抉择》架构说明

## 定位

网页端五幕 AI 科普互动游戏。核心循环：**暮色营地探索 → 抉择/小游戏 → 大模型裁决 → 史实回响 → 启程**。

## 目录结构（工程规范）

```
changzheng/
  package.json          # scripts: start / test:* / qa:* / tts:manifest
  .env                  # GLM_API_KEY / GLM_MODEL / PORT（不入库）
  runtime-config.json   # 设置界面写入，可覆盖 .env（模型 / Key / 接口 / 推理档位）
  server/               # 服务端：静态托管 + AI 代理 + 日志
    index.js            # 路由 /api/decide /api/sim /api/tts /api/config /api/logs /api/data/*
    ai.js               # VN 侧：提示词 + 真调 + 失败重试（无兜底文案）
    sim.js              # 沙盘世界裁判（sim_turn）
    config.js           # 双层配置 + 损坏容错
    logger.js           # JSONL 落盘 + 8MB 轮转
  public/               # 客户端（无构建，ES Module）
    index.html
    favicon.svg
    css/tokens.css      # 设计变量（唯一真相）
    css/style.css       # 基础组件（旧三栏 UI 已清理）
    css/cinema.css      # 暮色营地 / 电影卡 / 回响
    css/sandbox.css     # 自由行军沙盘
    css/minigames.css   # 分糖/夜岗/五子棋/泸定桥/陡坡
    js/
      main.js           # 流程状态机（幕、每日场景、强制链、锁、篝火夜）
      state.js          # 资源/好感/附身线/行动点/失败判定（可单测）
      data.js           # 同伴、路径热区
      audio.js          # 环境床 + SFX + 预录 wav + TTS 缓存
      minigames.js      # 7 个小游戏
      sandbox.js        # 沙盘循环
      ui.js
      ai-client.js
    audio/voices|cache/ # 预生成角色台词 / TTS 缓存
    assets/scenes|characters|events/
  data/
    acts.json           # 五幕定义（热点、dayScenes、强制链、对决）
    facts.json          # 史实卡 14 张 real/fiction
    sim-visuals.json    # 沙盘事件图与标签映射
    tts-lines.json      # 固定台词清单
  tests/
    unit/               # node --test（状态层 + 配置层）
    e2e/full-run.mjs    # 五幕通关（--quick 快速模式）
    e2e/smoke.mjs       # 冒烟
    e2e/sandbox.mjs     # 沙盘
    e2e/regressions.mjs # 监听泄漏 / 存档回合
    manual/             # 开发期一次性排查脚本
  scripts/
    audit-logs.mjs      # 日志 schema 审计 → docs/LOG-AUDIT.md
    tts-manifest.mjs    # 语音哈希清单 → docs/TTS-MANIFEST.md
    reset-logs.mjs
  docs/
    ARCHITECTURE.md · QA.md · SCORING.md · PITCH.md · HANDOFF.md
    HANDOFF-CODE.md     # 给代码 agent
    HANDOFF-ART.md      # 给生图模型
    HANDOFF-AUDIO.md    # 给音频模型
    ASSETS.md           # 素材清单
    TTS-MANIFEST.md     # 生成物
    LOG-AUDIT.md        # 生成物
  logs/                 # AI 调用 JSONL（单文件 8MB 轮转）
```

## 运行时数据流

```
UI 事件 → main.js(withLock) → ai-client → POST /api/decide
       → server/ai.js(GLM|ERROR) → logger JSONL
       → applyEffects(state) → 史实回响(echo) → 下一屏
```

## 交互契约（`public/js/step.js`）—— 全项目唯一"当前在做什么"的真相

历史上进度只存在内存（`S.busy` / `doneKeys`），DOM 里没有"当前步骤"的表示，
于是出现三类通病：残留节点被当成当前场景、每个玩法各写一套选项渲染、测试脚本必须认识每个屏的元素 id。
现在统一由 `step.js` 往 DOM 写契约，**人和自动化都读它**：

| 契约 | 含义 |
|---|---|
| `body[data-step]` / `[data-step-kind]` / `[data-step-state]` | 当前步骤 id / 类型（choice·minigame·talk·quiz·camp·cutscene·echo·end）/ 状态（awaiting·busy·done） |
| `[data-action="continue\|echo-ok\|march\|hotspot\|skip\|talk-end\|ai-retry"]` | 通用动作；**离开该屏时必须摘掉标记**，否则会误导消费方 |
| `[data-choice-index]` | 任何选项（抉择/答题/岔路/篝火菜单/夜校…），由 `askChoice()` 统一产出 |
| `host[data-mini]` + `[data-mini-state]` + `[data-mini-action]` | 小游戏容器/状态/可操作项；不能操作的项（已用掉的糖、已落子的格）**必须移除 action 或置 aria-disabled** |

**规则**

1. 新增玩法：实现小游戏 → `markMini(host, name)` → 控件加 `data-mini-action` → 状态变化时更新 `data-mini-state`；
   主流程 `step('<id>', 'minigame')`；测试无需改动（驱动只认契约）。
2. 选项一律用 `askChoice()`，不要再手写"渲染选项→禁用→resolve"。
3. 等模型时 `setStepState('busy')`（`callAI()` 已自动处理），消费方据此等待而不是乱点。
4. 离开屏幕时清理内容（`showScreen()` 已清 `#stage-panel`/`#sheet-actions`），并摘掉 `data-action` 标记。

## 关键设计约束

| 约束 | 实现 |
|------|------|
| AI 决策必须走指定模型 | 仅 `/api/decide`，禁止前端独立裁决算法 |
| 每次调用有日志 | `logs/*.jsonl` + 游戏内记录 |
| 一局可完整通关 | 五幕 + 终局 |
| 算法对抗 | 每幕知识对决 human vs AI |
| 流程不重入 | `state.busy` + `withLock` |
| 已完成不重播 | `doneKeys[actId:key]` |
| 音频不挡流程 | 预置 wav 后台播；自由 LLM 回复静音 |

## 测试流程（提交前必跑）

```powershell
npm run test:unit     # 资源钳制 / 史实解锁
npm run qa:smoke      # 标题→营地→一次互动
npm run test:e2e      # 五幕真调通关（需配好 Key）
npm run qa:sandbox    # 沙盘两回合 + 存档恢复
npm run qa:regress    # 沙盘监听泄漏 / 存档回合错位
npm run qa:audit      # 日志 schema 审计（真调一局后跑，产出 docs/LOG-AUDIT.md）
npm run tts:manifest  # 更新语音清单（改台词后必跑）
```

有 Key 时：设置里测试连通，再手玩一幕真调。

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
