# 《长征·抉择》架构说明

## 定位

网页端五幕 AI 科普互动游戏。核心循环：**暮色营地探索 → 抉择/小游戏 → 大模型裁决 → 史实回响 → 启程**。

## 目录结构（工程规范）

```
changzheng/
  package.json          # scripts: start / test / test:unit / test:e2e
  .env                  # GLM_API_KEY / MODEL / PORT（不入库）
  runtime-config.json   # 设置界面写入，可覆盖 .env
  server/               # 服务端：静态托管 + AI 代理 + 日志
    index.js
    ai.js               # callGlm51：MOCK / 真调 / FALLBACK
    config.js
    logger.js
  public/               # 客户端（无构建，ES Module）
    index.html
    css/style.css       # 基础组件
    css/cinema.css      # 暮色营地 / 电影卡 / 回响（覆盖旧样式）
    js/
      main.js           # 流程状态机（幕、强制链、锁定）
      state.js          # 资源/好感/effects（可单测）
      data.js           # 同伴、路径热区
      acts.json 所在 data/ 服务端下发
      audio.js          # 环境床 + SFX + 预置语音
      minigames.js
      ui.js
      ai-client.js
    audio/voices/       # 预生成角色台词 wav
    assets/scenes|characters/
  data/
    acts.json           # 五幕定义（热点、强制链、对决）
    facts.json          # 史实卡 real/fiction
  tests/
    unit/state.test.js  # node --test
    e2e/full-run.mjs    # 五幕通关
    e2e/smoke.mjs       # 冒烟
    e2e/artifacts/      # 截图
  docs/
    ARCHITECTURE.md
    QA.md
  logs/                 # AI 调用 JSONL
```

## 运行时数据流

```
UI 事件 → main.js(withLock) → ai-client → POST /api/decide
       → server/ai.js(GLM|MOCK|FALLBACK) → logger JSONL
       → applyEffects(state) → 史实回响(echo) → 下一屏
```

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
npm run test:e2e      # 五幕 MOCK 通关
npm run qa:sandbox    # 沙盘两回合 + 存档恢复
npm run qa:regress    # 沙盘监听泄漏 / 存档回合错位
```

有 Key 时：设置里测试连通，再手玩一幕真调。

## 配置层约定

- `runtime-config.json` 覆盖 `.env`；`RUNTIME_CONFIG` / `ENV_FILE` 环境变量可改路径（测试用）
- 设置里点过「MOCK 模式」会写入 `MOCK_AI: true`，**重启后仍然 MOCK**；填新 Key 会自动解除
- 配置文件损坏时按空配置启动并告警，不会让服务起不来
- 日志 `source` 只标 `GLM` / `MOCK_AI` / `FALLBACK`；具体模型名看 `model` 字段

## 与同类图文互动游戏的对照

| 参考 | 借鉴 | 本作落地 |
|------|------|----------|
| 80 Days | 行程可见、回望记录 | 行程缎带 + **手记（回望）** 面板 |
| Reigns | 卡牌抉择、倾向预告 | 电影事件卡 + `choice_hint` 趋势/风险 |
| 中国式家长 | 行动点取舍、关系网 | 暮色行动点 + 五同伴好感 |
| 文字 AVG | 全屏叙事、回响 | 电影卡 + 史实盖章 |
| Papers Please | 可审计记录 | 行军记录 + 答辩面板 + 研学报告 |

键盘：`1/2/3` 选项 · `J` 手记 · `Esc` 关闭浮层。
