# QA 清单

## 自动化

| 命令 | 覆盖 | 通过标准 |
|------|------|----------|
| `npm run test:unit` | 资源钳制、史实解锁、附身线门控、行动点、每日场景、失败判定、AI 响应契约 | 22/22 通过 |
| `npm run qa:smoke` | 标题→营地→热点→回营地 | SMOKE PASS |
| `npm run test:e2e` | 五幕**真调**通关 + 五个新玩法各 1 次 + 不重复结算 | E2E FULL PASS，`source=GLM`，无 pageerror |
| `node tests/e2e/full-run.mjs --quick` | 快速模式通关 | E2E FULL PASS |
| `npm run qa:sandbox` | 沙盘两回合 + 存档恢复 | SANDBOX PASS |
| `npm run qa:regress` | 沙盘监听泄漏、存档回合 | REGRESS PASS |
| `npm run qa:failure` | 行军模式失败线（`failure_review` 真调） | MARCH FAILURE PASS，失败屏有标题/段落/史实要点 |
| `npm run qa:inspect` | 素材体检：格式/尺寸/时长/重复（含立绘） | 素材体检通过 |
| `npm run qa:handoff` | 交接文档与代码契约一致（场景/环境床/TTS/立绘） | 可以交接 |
| `node tests/e2e/layout-audit.mjs --width 820` | 逐屏布局硬伤（横向溢出/控件出界/点按区） | 820 宽 0 处横向溢出 |
| `npm run qa:audit` | 日志 schema 审计 | 字段缺失 0（新记录）、FALLBACK 0 |

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
- 预置语音仅覆盖固定台词；LLM 自由回复无声  
- 头像/场景为 AI 生成，已裁水印  
