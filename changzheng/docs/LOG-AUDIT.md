# AI 调用日志审计

> 由 node scripts/audit-logs.mjs 生成 · 日志目录 logs

- 总记录：**96** 条（带契约戳记 96 条）
- 覆盖 callType：**16** 类
- 平均耗时：2467ms　·　p95：4999ms　·　最慢：6705ms
- source 分布：GLM=96
- model 分布：glm-5.3-flash=96
- 字段缺失（**本版本**，带戳记）：**0** 条　·　FALLBACK：**0** 条

**账怎么算**：`contractOk` 戳记由 `server/logger.js` 在落库时盖（用 `server/schema.js` 的同一张表判定）。
带戳记 = 本版本产生的记录，一有不合规就是红灯（脚本 exit 1）；不带戳记 = 本仓库入库样本之外的旧记录，只会出现在本机遗留的日志目录里，不会由当前代码产生。
历史上不带戳记的违约一共 14 条，成因三类：旧标注 `GLM-5.1`（本版本只写 `GLM`，模型看 `model`）、守卫上线（2026-09-13 09:38）前"只解析不校验"、以及"代码已更新、进程还是旧的"窗口期写入的数组响应——相关旧日志已移出仓库（本机在 `logs/archive/`，历史版本在 git 里）。
服务端的拦截在调用点：`server/ai.js` 与 `server/sim.js` 解析完都过同一张表，缺必需字段就当次失败并重试，不落 `source=GLM` 的记录；入库样本见 `logs/sample-full-run.jsonl`（说明在 `logs/README.md`）。
想把某一局单独看清，用空目录跑：`LOG_DIR=<临时目录> npm start` + `LOG_DIR=<临时目录> node scripts/audit-logs.mjs`（报告会写进那个目录）。

## 按 callType

| callType | 次数 | 平均耗时 | 最慢 | 缺失（本版本） | 缺失（历史） |
|---|---:|---:|---:|---:|---:|
| scene_gen | 17 | 2964ms | 5414ms | 0 | 0 |
| branch_judge | 14 | 2669ms | 4999ms | 0 | 0 |
| choice_hint | 13 | 1696ms | 2284ms | 0 | 0 |
| minigame_review | 9 | 2688ms | 3857ms | 0 | 0 |
| act_review | 8 | 2642ms | 3885ms | 0 | 0 |
| quiz_generate | 7 | 1862ms | 2363ms | 0 | 0 |
| quiz_answer_ai | 7 | 882ms | 1067ms | 0 | 0 |
| quiz_judge | 7 | 1447ms | 1880ms | 0 | 0 |
| share_judge | 5 | 2801ms | 2973ms | 0 | 0 |
| sim_turn | 3 | 6468ms | 6705ms | 0 | 0 |
| npc_chat | 1 | 1638ms | 1638ms | 0 | 0 |
| night_options | 1 | 3070ms | 3070ms | 0 | 0 |
| night_resolve | 1 | 2712ms | 2712ms | 0 | 0 |
| ending_review | 1 | 5293ms | 5293ms | 0 | 0 |
| study_report | 1 | 3213ms | 3213ms | 0 | 0 |
| failure_review | 1 | 3054ms | 3054ms | 0 | 0 |

## 字段缺失明细（本版本，带戳记）

无。带戳记的记录全部满足对应 callType 的必需字段。

## 历史记录（无戳记）

无：这个日志目录里的记录都带戳记（本版本产生）。

## FALLBACK 明细

无。
