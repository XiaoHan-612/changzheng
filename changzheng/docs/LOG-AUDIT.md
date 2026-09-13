# AI 调用日志审计

> 由 node scripts/audit-logs.mjs 生成 · 日志目录 logs

- 总记录：**2848** 条（带契约戳记 11 条）
- 覆盖 callType：**16** 类
- 平均耗时：2507ms　·　p95：4842ms　·　最慢：12933ms
- source 分布：GLM-5.1=54　GLM=2794
- model 分布：glm-5.3-flash=2848
- 字段缺失（**本版本**，带戳记）：**0** 条　·　FALLBACK：**0** 条
- 字段缺失（历史，无戳记）：**14** 条 —— 详见文末「历史记录」，成因已逐条可解释，不拦当前版本。
- 已忽略历史 MOCK_AI 记录 **903** 条（本版本已移除 MOCK，如需查看加 `--all`）

**账怎么算**：`contractOk` 戳记由 `server/logger.js` 在落库时盖（用 `server/schema.js` 的同一张表判定）。
带戳记 = 本版本产生的记录，一有不合规就是红灯（脚本 exit 1）；不带戳记 = 本版本之前的旧记录（旧标注 `GLM-5.1`、旧进程写入的数组响应等），后续再跑多少局都不会新增。
服务端的拦截在调用点：`server/ai.js` 与 `server/sim.js` 解析完都过同一张表，缺必需字段就当次失败并重试，不落 `source=GLM` 的记录。
想只看本版本，用空目录单独跑一局：`LOG_DIR=<临时目录> npm start` + `LOG_DIR=<临时目录> node scripts/audit-logs.mjs`（报告会写进那个目录）。

## 按 callType

| callType | 次数 | 平均耗时 | 最慢 | 缺失（本版本） | 缺失（历史） |
|---|---:|---:|---:|---:|---:|
| scene_gen | 537 | 2875ms | 12118ms | 0 | 1 |
| branch_judge | 388 | 2756ms | 12340ms | 0 | 6 |
| choice_hint | 341 | 1939ms | 6362ms | 0 | 0 |
| quiz_generate | 268 | 2356ms | 10742ms | 0 | 2 |
| act_review | 256 | 2790ms | 8559ms | 0 | 1 |
| quiz_answer_ai | 247 | 1114ms | 4833ms | 0 | 0 |
| quiz_judge | 247 | 1580ms | 5826ms | 0 | 0 |
| minigame_review | 182 | 2964ms | 8759ms | 0 | 0 |
| share_judge | 129 | 2762ms | 6499ms | 0 | 0 |
| npc_chat | 74 | 2216ms | 5476ms | 0 | 3 |
| sim_turn | 52 | 6238ms | 12933ms | 0 | 1 |
| night_options | 33 | 2930ms | 3888ms | 0 | 0 |
| night_resolve | 33 | 2998ms | 4894ms | 0 | 0 |
| ending_review | 32 | 5495ms | 8011ms | 0 | 0 |
| study_report | 26 | 3379ms | 5140ms | 0 | 0 |
| failure_review | 3 | 4010ms | 4672ms | 0 | 0 |

## 字段缺失明细（本版本，带戳记）

无。带戳记的记录全部满足对应 callType 的必需字段。

## 历史记录（无戳记）

共 2837 条历史记录，其中 **14** 条不满足现契约（本版本不会再产生）：

| 时间 | callType | 缺字段 | 来源文件 |
|---|---|---|---|
| 03:13:19 | quiz_generate | answer_index | ai-calls-2026-09-12.jsonl |
| 03:19:58 | branch_judge | effects, scene_text|narrative | ai-calls-2026-09-12.jsonl |
| 03:23:08 | quiz_generate | question, options, answer_index | ai-calls-2026-09-12.jsonl |
| 03:29:14 | branch_judge | effects, scene_text|narrative | ai-calls-2026-09-12.jsonl |
| 04:10:22 | branch_judge | effects, scene_text|narrative | ai-calls-2026-09-12.jsonl |
| 05:10:11 | npc_chat | reply | ai-calls-2026-09-12.jsonl |
| 05:33:41 | branch_judge | effects, scene_text|narrative | ai-calls-2026-09-12.jsonl |
| 05:34:59 | branch_judge | effects, scene_text|narrative | ai-calls-2026-09-12.jsonl |
| 06:46:01 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 07:59:35 | branch_judge | effects, scene_text|narrative | ai-calls-2026-09-12.jsonl |
| 10:43:33 | npc_chat | reply | ai-calls-2026-09-12.jsonl |
| 10:43:37 | npc_chat | reply | ai-calls-2026-09-12.jsonl |
| 03:18:30 | act_review | (整体不是对象) | ai-calls-2026-09-13.jsonl |
| 10:46:56 | sim_turn | (整体不是对象) | ai-calls-2026-09-13.jsonl |

成因逐类如下（都不必再追，也不影响当前版本）：
1. `source=GLM-5.1` 这个标注本版本已废弃——现在只写 `GLM`，具体模型看 `model` 字段（2026-09-13 改）；
2. 2026-09-13 09:38 之前，`server/ai.js` 只解析、不校验字段；
3. 同日 11:18 那条 `(整体不是对象)` 来自"代码已更新、进程还是旧的"那段窗口（stale 进程，现已由 `tests/e2e/lib/server.mjs` 的 codeStamp 比对掐掉）；
4. 18:46 那条 `sim_turn` 是 `/api/sim` 漏接了契约表——已补上校验（见 `docs/HANDOFF-CODE.md` 第 17 条）。

## FALLBACK 明细

无。
