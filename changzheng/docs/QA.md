# QA 清单

## 自动化

| 命令 | 覆盖 | 通过标准 |
|------|------|----------|
| `npm run test:unit` | 资源钳制、史实解锁、附身线门控、行动点、每日场景、失败判定、AI 响应契约 | 47/47 通过 |
| `npm run qa:tokens` · `qa:frames` · `qa:tone` · `qa:motion` | 设计系统守卫：颜色/字体/圆角无新增字面量、页面只用模板与区块、纸面面积在预算内、五个标准动效真的挂上 | 全部通过（口径见 [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md)） |
| `npm run qa:screens -- <批次>` | 逐页截图 + 纸面占比 + 联系表（加 `--width 820` 出窄屏版） | 该批页面逐张出图，占比 ≤35% |
| `npm run qa:smoke` | 标题→营地→热点→回营地 | SMOKE PASS |
| `npm run test:e2e` | 五幕**真调**通关 + 五个新玩法各 1 次 + 不重复结算 | E2E FULL PASS，`source=GLM`，无 pageerror |
| `node tests/e2e/full-run.mjs --quick` | 快速模式通关 | E2E FULL PASS |
| `npm run qa:sandbox` | 沙盘两回合 + 存档恢复 | SANDBOX PASS |
| `npm run qa:regress` | 沙盘监听泄漏、存档回合 | REGRESS PASS |
| `npm run qa:failure` | 行军模式失败线（`failure_review` 真调） | MARCH FAILURE PASS，失败屏有标题/段落/史实要点 |
| `npm run qa:playtest` | 自动试玩：人类节奏下的单局时长与资源曲线（`--mode/--strategy/--runs/--speed/--doc`） | PLAYTEST DONE，`docs/PLAYTEST.md` 落表 |
| `npm run qa:loss` | 行军模式减员定点验证（注入断粮 → 走到高风险抉择 → 必须失去一个人） | LOSS CHECK PASS |
| `npm run qa:av` | **影音运行时审计**：资源 404、营地全景/舞台图/立绘是否用对、环境床与语音是否真播放、TTS 音频能否解码、音效链路、**无声率与 TTS 缺口** | AV AUDIT PASS，问题列表为空；缺口清单落 `docs/TTS-GAPS.md` |
| `npm run qa:audio` | **音频逐个体检**（55 个）：容器 vs 扩展名、HTTP 200、MIME、浏览器逐条解码、以及"能否被代码路径引用到" | AUDIO PASS，报告落 `docs/AUDIO-REPORT.md` |
| `npm run qa:inspect` | 素材体检：格式/尺寸/时长/重复（含立绘） | 素材体检通过 |
| `npm run qa:handoff` | 交接文档与代码契约一致（场景/环境床/TTS/立绘） | 可以交接 |
| `node tests/e2e/layout-audit.mjs --width 820` | 逐屏布局硬伤（横向溢出/控件出界/点按区） | 820 宽 0 处横向溢出 |
| `npm run qa:audit` | 日志 schema 审计（按 `contractOk` 戳记分「本版本 / 历史」两拨算账） | 本版本字段缺失 0、FALLBACK 0；历史违约单列并注明成因 |

## 手工（真调）

1. 设置 → 测试连通 → latency 显示、source=GLM  
2. 于都河：热点互动后点启程，**不得重播同一抉择**  
3. 钓鱼 3 竿可完成（含前置弯针）；史实回响可关  
4. 知识对决可答；点「看两个 AI 对答」可走 ai_vs_ai  
5. 第四幕：分糖 / 夜岗 / 五子棋 / 夜校 四条线至少点亮 3 条 → 幕末出现**篝火夜**（选项由模型生成）  
6. 终局四碎片之一；行军记录可打开；手记显示附身线 N/5  
7. 静音开关；设置清空日志后计数归零  
8. 刷新页面 → 标题页出现「继续上一局」  

## 已知约束

- **无 MOCK**：未配置 Key 会直接报错并写 `source=ERROR`；演示前务必先用「设置 → 测试连通」确认  
- **无离线能力（当前）**：断网即 `source=ERROR`，所有 AI 内容走「重试／跳过」。风险预案见 [`OFFLINE-REPLAY.md`](OFFLINE-REPLAY.md)——**备选方案，尚未开发**  
- **日志是运行产物、不入库**：运行时写 `logs/ai-calls-<日期>.jsonl`（单文件 8MB 轮转，超上限只留最后 2000 行——单日反复跑测试会裁掉当天最早的记录），仓库里只留 `logs/sample-full-run.jsonl` 一份真实全程样本（见 `logs/README.md`）。演示/答辩要留全量证据，就先归档当天的运行日志再只跑那一局  
- 预置语音仅覆盖固定台词；LLM 自由回复无声  
- 头像/场景为 AI 生成，已裁水印  
