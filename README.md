# 长征 · 抉择

> 赛道二 AI 游戏 · 指定模型智谱 GLM（默认 `glm-5.3-flash`，可用 `glm-5.1` 替代）
> 网页端五幕 AI 科普互动游戏：暮色营地探索 → 抉择/小游戏 → 大模型裁决 → 史实回响 → 启程

玩家以「过客」视角走进 1934–1936 年的长征关键节点：在营地画面里点光点附身，
替他们做完手头那件事——抉择、对弈、辨路、观察与分配全部提交大模型裁决，
每次调用写入可回放的 JSONL 日志。

## 快速开始

```powershell
cd changzheng
npm install
npm start          # http://localhost:3001
```

- 未配置 Key 时自动进入 **MOCK 演示模式**，全流程仍可完整跑通（日志标明 `source=MOCK_AI`）
- 真实调用：把密钥写进 `changzheng/.env`（`GLM_API_KEY=...`），或在游戏内「设置」里填
- `.env` 与 `runtime-config.json` 已加入 `.gitignore`，不会入库

## 目录结构

| 路径 | 说明 |
|------|------|
| `changzheng/` | **可运行工程（唯一主线）** |
| `changzheng/server/` | Express：AI 代理 / 日志 / 静态托管 |
| `changzheng/public/` | 前端（无构建，原生 ES Module） |
| `changzheng/data/` | `acts.json` 五幕定义、`facts.json` 史实卡 |
| `changzheng/docs/` | 架构 / QA / 评分 / 路演 / 交接 |
| `changzheng/tests/` | unit + e2e（Playwright）；`manual/` 为一次性排查脚本 |
| `design/` | 策划文档生成（docx 工具链） |
| `_archive/` | 历史快照与旧素材（只读参考，勿在此开发） |
| `DESIGN.md` | 产品设计速览 |
| `长征-抉择-设计方案.docx` | 完整策划案 |

## 测试

```powershell
cd changzheng
npm run test:unit     # 49 项：状态层 / 契约 / 配置层 / 减员 / 数值护栏
npm run qa:smoke      # 标题 → 营地 → 一次互动（顺带断言用过的热点当场作废）
npm run qa:board      # 玩法板体检：五个玩法逐屏摆上板（板屏壳 / 数值签 / 契约标记）
npm run test:e2e      # 五幕真调通关（约 76 次调用）+「不重复结算」等回归断言
npm run qa:sandbox    # 自由行军沙盘：两回合 + 存档恢复
npm run qa:regress    # 沙盘监听泄漏 / 存档回合错位
npm run qa:av         # 影音审计：资源 404 / 立绘 / 环境床 / TTS 解码
npm run qa:tokens · qa:frames · qa:tone · qa:motion   # 视觉守卫
```

## 重新生成策划文档

```powershell
cd design
npm install           # 仅依赖 docx
node make-docx.js     # 输出 ../长征-抉择-设计方案.docx
```

## 文档索引

| 文档 | 内容 |
|------|------|
| `changzheng/README.md` | 玩法与交互要点 |
| `changzheng/docs/ARCHITECTURE.md` | 架构、运行时数据流、设计约束 |
| `changzheng/docs/HANDOFF.md` | 已完成 / 已知缺口 / **每轮收尾清单** / 接力建议 |
| `changzheng/docs/DESIGN-SYSTEM.md` | 视觉体系（模板 / 区块 / 动效）与逐批打磨进度 |
| `changzheng/docs/SCORING.md` | 评分对照与路演讲法 |
| `changzheng/docs/QA.md` | 测试清单（每条命令的通过标准） |
| `_archive/README.md` | 归档内容与新旧路径对照 |
