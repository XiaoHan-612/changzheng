# AI 调用日志审计

> 由 node scripts/audit-logs.mjs 生成 · 日志目录 logs

- 总记录：**245** 条
- 覆盖 callType：**15** 类
- 平均耗时：3535ms　·　p95：9143ms　·　最慢：12340ms
- source 分布：GLM-5.1=54　GLM=191
- model 分布：glm-5.3-flash=245
- 字段缺失：**12** 条　·　FALLBACK：**0** 条
- 说明：日志按日累积，可能混入旧版本产生的记录；判断当前版本是否合规，以本轮之后新增的记录为准。
- 已忽略历史 MOCK_AI 记录 **903** 条（本版本已移除 MOCK，如需查看加 `--all`）

## 按 callType

| callType | 次数 | 平均耗时 | 最慢 | 字段缺失 |
|---|---:|---:|---:|---:|
| branch_judge | 40 | 5591ms | 12340ms | 6 |
| scene_gen | 35 | 3162ms | 12118ms | 1 |
| quiz_generate | 30 | 4509ms | 10742ms | 2 |
| quiz_answer_ai | 24 | 1219ms | 2388ms | 0 |
| quiz_judge | 24 | 2405ms | 5360ms | 0 |
| choice_hint | 19 | 2323ms | 6362ms | 0 |
| act_review | 19 | 2991ms | 8559ms | 0 |
| minigame_review | 14 | 3527ms | 8759ms | 0 |
| npc_chat | 11 | 3065ms | 5476ms | 3 |
| sim_turn | 10 | 6300ms | 7517ms | 0 |
| share_judge | 9 | 2708ms | 3124ms | 0 |
| night_options | 3 | 3121ms | 3368ms | 0 |
| night_resolve | 3 | 2921ms | 3594ms | 0 |
| ending_review | 3 | 5660ms | 6405ms | 0 |
| study_report | 1 | 3077ms | 3077ms | 0 |

## 字段缺失明细

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

## FALLBACK 明细

无。
