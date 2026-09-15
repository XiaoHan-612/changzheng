# AI 调用日志审计

> 由 node scripts/audit-logs.mjs 生成 · 日志目录 logs

- 总记录：**2510** 条（带契约戳记 2510 条）
- 覆盖 callType：**16** 类
- 平均耗时：2485ms　·　p95：4273ms　·　最慢：12060ms
- source 分布：GLM=2510
- model 分布：glm-5.3-flash=2510
- 字段缺失（**本版本**，带戳记）：**0** 条　·　FALLBACK：**0** 条

**账怎么算**：`contractOk` 戳记由 `server/logger.js` 在落库时盖（用 `server/schema.js` 的同一张表判定）。
带戳记 = 本版本产生的记录，一有不合规就是红灯（脚本 exit 1）；不带戳记 = 本仓库入库样本之外的旧记录，只会出现在本机遗留的日志目录里，不会由当前代码产生。
历史上不带戳记的违约一共 14 条，成因三类：旧标注 `GLM-5.1`（本版本只写 `GLM`，模型看 `model`）、守卫上线（2026-09-13 09:38）前"只解析不校验"、以及"代码已更新、进程还是旧的"窗口期写入的数组响应——相关旧日志已移出仓库（本机在 `logs/archive/`，历史版本在 git 里）。
服务端的拦截在调用点：`server/ai.js` 与 `server/sim.js` 解析完都过同一张表，缺必需字段就当次失败并重试，不落 `source=GLM` 的记录；入库样本见 `logs/sample-full-run.jsonl`（说明在 `logs/README.md`）。
样本里若出现已删功能的调用（例如沙盘 `sim_turn`），那是当时真调的留档、不是当前能力——本版本已删该模式。
想把某一局单独看清，用空目录跑：`LOG_DIR=<临时目录> npm start` + `LOG_DIR=<临时目录> node scripts/audit-logs.mjs`（报告会写进那个目录）。

## 按 callType

| callType | 次数 | 平均耗时 | 最慢 | 缺失（本版本） | 缺失（历史） |
|---|---:|---:|---:|---:|---:|
| scene_gen | 511 | 2933ms | 7552ms | 0 | 0 |
| branch_judge | 340 | 2457ms | 8565ms | 0 | 0 |
| choice_hint | 314 | 1858ms | 12060ms | 0 | 0 |
| act_review | 211 | 2676ms | 5658ms | 0 | 0 |
| quiz_generate | 203 | 2256ms | 5959ms | 0 | 0 |
| minigame_review | 192 | 2827ms | 4873ms | 0 | 0 |
| quiz_answer_ai | 190 | 1157ms | 4308ms | 0 | 0 |
| quiz_judge | 190 | 1435ms | 4302ms | 0 | 0 |
| share_judge | 141 | 2673ms | 3858ms | 0 | 0 |
| sim_turn | 49 | 6423ms | 8951ms | 0 | 0 |
| npc_chat | 49 | 2080ms | 4489ms | 0 | 0 |
| night_options | 33 | 3081ms | 4714ms | 0 | 0 |
| night_resolve | 32 | 2730ms | 5271ms | 0 | 0 |
| ending_review | 31 | 6049ms | 8982ms | 0 | 0 |
| study_report | 18 | 3800ms | 6325ms | 0 | 0 |
| failure_review | 6 | 3975ms | 5310ms | 0 | 0 |

## 字段缺失明细（本版本，带戳记）

无。带戳记的记录全部满足对应 callType 的必需字段。

## 历史记录（无戳记）

无：这个日志目录里的记录都带戳记（本版本产生）。

## FALLBACK 明细

无。
