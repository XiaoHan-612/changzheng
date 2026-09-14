# 长征 · 抉择

> 赛道二 AI 游戏 · 指定模型智谱 GLM（默认 `glm-5.3-flash`，可用 `glm-5.1` 替代）
> 网页端五幕 AI 科普互动游戏：暮色营地探索 → 抉择/小游戏 → 大模型裁决 → 史实回响 → 启程

玩家以「过客」视角走进 1934–1936 年的长征关键节点：在营地画面里点光点附身，
替他们做完手头那件事——抉择、对弈、辨路、观察与分配全部提交大模型裁决，
每次调用落 JSONL 日志（含响应、耗时与来源，可审计；明细见 `changzheng/logs/README.md`）。

## 快速开始

> **团队协作（拉取 / 提交 / 推送 / 配置提交身份）见 → [`CONTRIBUTING.md`](CONTRIBUTING.md)。**
> 本仓库是**私有**的，新人需先被加为 collaborator 才能克隆。

```powershell
git clone https://github.com/XiaoHan-612/changzheng.git   # 首次
cd changzheng/changzheng                                  # 仓库根 → 可运行工程

npm install
npm start          # http://localhost:3001
```

已经克隆过的，这里等价于在仓库根执行 `cd changzheng`。每轮开工先 `git pull --rebase`，收工 `git push`。

- 密钥：写进 `changzheng/.env`（`GLM_API_KEY=...`），或在游戏内「设置」里填后点「测试连通」；
  `.env` 与 `runtime-config.json` 已加入 `.gitignore`，不会入库
- **没有 MOCK 模式**：所有智能判断都走真调。未配置 Key 或调用失败会**明确报错**（界面给原因与「重试」键，
  日志记 `source=ERROR`），**不编造任何兜底文案**；演示前务必先用「设置 → 测试连通」确认

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
npm run qa:board      # 玩法板体检：8 个玩法逐屏摆上板（板屏壳 / 数值签 / 契约标记）
npm run test:e2e      # 五幕真调通关（约 76 次调用）+「不重复结算」等回归断言
npm run qa:sandbox    # 自由行军沙盘：两回合 + 存档恢复
npm run qa:regress    # 沙盘监听泄漏 / 存档回合错位
npm run qa:av         # 影音审计：资源 404 / 立绘 / 环境床 / TTS 解码
npm run qa:tokens · qa:frames · qa:tone · qa:motion   # 视觉守卫
npm run qa:bus        # 总线守卫：模块化规则（四条）+ 内核运行时体检
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
| `CONTRIBUTING.md` | **团队协作规范：git 工作流 / 提交身份 / 冲突处理 / 给 AI agent 的规矩** |
| `changzheng/README.md` | 玩法与交互要点 |
| `changzheng/docs/ARCHITECTURE.md` | 架构、运行时数据流、设计约束 |
| `changzheng/docs/HANDOFF.md` | 已完成 / 已知缺口 / **每轮收尾清单** / 接力建议 |
| `changzheng/docs/HANDOFF-CODE.md` | **代码接手主文档**：模块地图 / 状态机 / 契约 / 29 条踩过的坑 |
| `changzheng/docs/DESIGN-SYSTEM.md` | 视觉体系（模板 / 区块 / 动效）与逐批打磨进度 |
| `changzheng/docs/AUDIO-SYSTEM.md` | 音频系统框架（混音表 / 通道 / 场景声明表 / 三层静音） |
| `changzheng/docs/BUS.md` | **前端架构**：内核 + 事件总线 + IP 模块；**加模块 / 加交互玩法的唯一入口** |
| `changzheng/docs/SCORING.md` | 评分对照与路演讲法 |
| `changzheng/docs/QA.md` | 测试清单（每条命令的通过标准） |
| `_archive/README.md` | 归档内容与新旧路径对照 |
