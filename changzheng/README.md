# 《长征·抉择》

五幕 AI 科普互动游戏 · 赛道二
（赛制指定 **glm-5.1**；本机网络受限时可在 `.env` 用 `glm-5.3-flash` 替代，日志 `model` 字段如实记录）

## 快速开始

```powershell
cd changzheng
npm install
npm start
# http://localhost:3001
```

入口：**研学模式**（不会失去战友）· **行军模式**（资源见底会掉队、高风险抉择会有人留下）· **快速演示**（每幕只跑主玩法与对决，约 18 分钟）· **自由行军**（自然语言沙盘，模型当世界裁判）。
中途刷新后，标题页会出现「继续上一局」。

## 测试

三层尺子：改一处先跑 `dev:check`（约 6 秒、0 次真调），提交前 `verify:fast`，推送与交付前 `verify:full`。

```powershell
npm run dev:check     # 开发快检（批次中间随手跑）：总线规矩 / 单元测试 / 文档一致 / 内核启动 / 玩法板 / 终局失败不空屏
npm run verify:fast   # 提交前那一档：+ 动效 / 音频 / 素材 / 影音守卫，并行约 30 秒
npm run verify:full   # 推送与交付前那一档：真调（e2e / av / sandbox / regress / failure / loss / smoke）
# 单跑某一项
npm run test:e2e      # 五幕真调通关（加 --quick 跑快速模式）
npm run qa:sandbox    # 自由行军沙盘 · qa:regress 沙盘回归 · qa:failure 失败线
npm run qa:av         # 影音运行时审计（资源 404 / 立绘 / 环境床 / TTS 能否解码）
npm run test:unit     # 状态层 / 契约 / 配置层 · qa:smoke UI 冒烟
npm run qa:board      # 玩法板体检：玩法逐屏摆上板 + 清单/体检表/actions 三方对账
npm run qa:bus        # 总线守卫：模块化规则（六条）+ 内核运行时体检
npm run qa:tokens · qa:frames · qa:tone · qa:motion   # 视觉守卫（字面量/模板/纸面/动效）
npm run qa:handoff    # 交接文档与代码一致
npm run qa:ai         # AI 调用体检：预算表 ↔ 字段契约（16 类）↔ 真调日志三方对账
npm run qa:audit      # 日志 schema 审计 → docs/LOG-AUDIT.md · tts:manifest 语音清单
```
`dev:check` 9 步约 7 秒（不真调）· `test:unit` 53 项 · `qa:board` 66 项 · `qa:motion` 16 项；`test:e2e` 一次真调约 76 次。

## 玩法一句话

暮色营地里用有限行动点走近光点；抉择交给大模型，立刻对照真实史实；启程走完于都河到会宁。

## 交互要点

- 顶部**行程缎带**：于都河 → 会宁，当前位置为红点
- **手记（回望）**：这一路的抉择、已解锁史实与「附身线 N/5」（快捷键 `J`）
- 事件卡选项带**倾向预告**（体力↓ 信念↑ / 风险），选项、答题、选路都支持 `1/2/3` 数字键
- **史实回响**：你刚经历的 / 真实发生过的 / 虚构边界
- 顶栏 **答辩**：按 call_type 聚合的调用统计，路演用
- **玩法板**：小游戏都在专属板屏上玩（题名 + 数值签 + 玩法区）；人物在舞台屏交代任务，结算回舞台屏
- 小游戏：钓鱼（弯针 → 起竿 → 分汤）· 分糖 · 夜岗（夜校口令在此生效）· 夜校识字 · 五子棋 · 陡坡拉人
- **篝火夜**（第四幕幕末）：由模型生成互斥抉择，选完写「当夜之后」

## 设置

游戏内「设置」：模型（下拉 + 自定义输入）/ **推理档位**（low·high·max）/ API Key / 接口地址 / **测试连通**（用未保存的值直接测一次真调）/ 重置日志。
本项目**没有 MOCK 演示模式**：所有智能判断都走真实模型调用；调用失败会在界面提示原因并给「重试」键，同时写入 `source=ERROR` 日志。

## 文档

- **`docs/HANDOFF-CODE.md`** — 给下一个代码 agent：模块地图、状态机、callType 契约、已知坑（接手先读这份）
- **`docs/DESIGN-SYSTEM.md`** — 视觉体系与逐批打磨进度（改界面先读）· **`docs/AUDIO-SYSTEM.md`** — 音频框架（改声音先读）
- **`docs/BUS.md`** — 前端架构（内核 + 总线 + IP 模块）：**加模块 / 加交互玩法先读这份** · **`logs/README.md`** — 日志目录各文件的职责
- **`docs/HANDOFF-ART.md`** / **`docs/HANDOFF-AUDIO.md`** — 给生图 / 音频模型
- `docs/ASSETS.md` — 素材清单（可勾选）· `docs/TTS-MANIFEST.md` — 语音哈希清单
- `docs/ARCHITECTURE.md` · `docs/QA.md` · `docs/SCORING.md` · `docs/PITCH.md`
- `../design/asset-prompts.md` — 生图 prompt 包；`../长征-抉择-设计方案.docx` — 完整策划案
