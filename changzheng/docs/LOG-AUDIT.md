# AI 调用日志审计

> 由 node scripts/audit-logs.mjs 生成 · 日志目录 logs

- 总记录：**3877** 条（带契约戳记 3874 条）
- 覆盖 callType：**24** 类
- 平均耗时：2810ms　·　p95：5866ms　·　最慢：25509ms
- source 分布：GLM=3876　ERROR=1
- model 分布：glm-5.3-flash=3339　glm-5.1=538
- 字段缺失（**本版本**，带戳记）：**8** 条　·　FALLBACK：**0** 条
- 字段缺失（历史，无戳记）：**3** 条 —— 详见文末「历史记录」，成因已逐条可解释，不拦当前版本。

**账怎么算**：`contractOk` 戳记由 `server/logger.js` 在落库时盖（用 `server/schema.js` 的同一张表判定）。
带戳记 = 本版本产生的记录，一有不合规就是红灯（脚本 exit 1）；不带戳记 = 本仓库入库样本之外的旧记录，只会出现在本机遗留的日志目录里，不会由当前代码产生。
历史上不带戳记的违约一共 14 条，成因三类：旧标注 `GLM-5.1`（本版本只写 `GLM`，模型看 `model`）、守卫上线（2026-09-13 09:38）前"只解析不校验"、以及"代码已更新、进程还是旧的"窗口期写入的数组响应——相关旧日志已移出仓库（本机在 `logs/archive/`，历史版本在 git 里）。
服务端的拦截在调用点：`server/ai.js` 与 `server/sim.js` 解析完都过同一张表，缺必需字段就当次失败并重试，不落 `source=GLM` 的记录；入库样本见 `logs/sample-full-run.jsonl`（说明在 `logs/README.md`）。
样本里若出现已删功能的调用（例如沙盘 `sim_turn`），那是当时真调的留档、不是当前能力——本版本已删该模式。
想把某一局单独看清，用空目录跑：`LOG_DIR=<临时目录> npm start` + `LOG_DIR=<临时目录> node scripts/audit-logs.mjs`（报告会写进那个目录）。

## 按 callType

| callType | 次数 | 平均耗时 | 最慢 | 缺失（本版本） | 缺失（历史） |
|---|---:|---:|---:|---:|---:|
| scene_gen | 910 | 3450ms | 25509ms | 0 | 0 |
| branch_judge | 446 | 2653ms | 8565ms | 0 | 0 |
| choice_hint | 417 | 2063ms | 12060ms | 0 | 0 |
| quiz_generate | 314 | 2628ms | 8359ms | 0 | 0 |
| quiz_answer_ai | 300 | 1187ms | 4308ms | 0 | 0 |
| quiz_judge | 295 | 1676ms | 4395ms | 0 | 0 |
| act_review | 286 | 2926ms | 7459ms | 0 | 0 |
| minigame_review | 259 | 3005ms | 6163ms | 0 | 0 |
| share_judge | 184 | 3122ms | 10453ms | 0 | 0 |
| npc_chat | 85 | 2347ms | 4568ms | 0 | 0 |
| ending_review | 68 | 6430ms | 16199ms | 0 | 0 |
| night_options | 67 | 3001ms | 6310ms | 0 | 0 |
| night_resolve | 61 | 2903ms | 5375ms | 0 | 0 |
| sim_turn | 49 | 6423ms | 8951ms | 0 | 0 |
| study_report | 49 | 4046ms | 8116ms | 0 | 0 |
| gomoku_move | 35 | 1591ms | 3937ms | 8 | 0 |
| school_quiz | 16 | 8024ms | 13162ms | 0 | 0 |
| candy_scene | 9 | 1922ms | 2300ms | 0 | 1 |
| school_lesson | 9 | 6548ms | 8090ms | 0 | 0 |
| failure_review | 6 | 3975ms | 5310ms | 0 | 0 |
| antiphony_reply | 6 | 2790ms | 7134ms | 0 | 1 |
| skim_throw | 3 | 3532ms | 7527ms | 0 | 1 |
| weave_note | 2 | 2977ms | 3032ms | 0 | 0 |
| cipher_draft | 1 | 578ms | 578ms | 0 | 0 |

## 字段缺失明细（本版本，带戳记）

| 时间 | callType | 缺字段 | 来源文件 |
|---|---|---|---|
| 12:49:42 | gomoku_move | pick | ai-calls-2026-09-17.jsonl |
| 15:16:03 | gomoku_move | pick | ai-calls-2026-09-17.jsonl |
| 15:16:54 | gomoku_move | pick | ai-calls-2026-09-17.jsonl |
| 15:16:57 | gomoku_move | pick | ai-calls-2026-09-17.jsonl |
| 15:16:59 | gomoku_move | pick | ai-calls-2026-09-17.jsonl |
| 15:17:03 | gomoku_move | pick | ai-calls-2026-09-17.jsonl |
| 15:17:09 | gomoku_move | pick | ai-calls-2026-09-17.jsonl |
| 15:17:20 | gomoku_move | pick | ai-calls-2026-09-17.jsonl |

> 上面 `gomoku_move` 缺 `pick` 的那些是 **2026-09-17 契约变更前的过渡记录**：
> 那天之前提示词让模型返回 `{"move":"h8"}`，而游戏读的是 `pick`（候选序号）——两边对不上，
> 模型的落子其实**从来没被采纳过**（每次都被引擎兜底顶掉）。两边改齐之后新记录都会带 `pick`。

## 历史记录（无戳记）

共 3 条历史记录，其中 **3** 条不满足现契约（本版本不会再产生）：

| 时间 | callType | 缺字段 | 来源文件 |
|---|---|---|---|
| 12:52:53 | candy_scene | (整体不是对象) | ai-calls-2026-09-17.jsonl |
| 11:11:41 | skim_throw | pick | ai-calls-2026-09-18.jsonl |
| 11:11:53 | antiphony_reply | reply | ai-calls-2026-09-18.jsonl |

成因逐类如下（都不必再追，也不影响当前版本）：
1. `source=GLM-5.1` 这个标注本版本已废弃——现在只写 `GLM`，具体模型看 `model` 字段（2026-09-13 改）；
2. 2026-09-13 09:38 之前，`server/ai.js` 只解析、不校验字段；
3. 同日 11:18 那条 `(整体不是对象)` 来自"代码已更新、进程还是旧的"那段窗口（stale 进程，现已由 `tests/e2e/lib/server.mjs` 的 codeStamp 比对掐掉）；
4. 18:46 那条 `sim_turn` 是 `/api/sim` 漏接了契约表——已补上校验（见 `docs/HANDOFF-CODE.md` 第 17 条）。

## FALLBACK 明细

无。
