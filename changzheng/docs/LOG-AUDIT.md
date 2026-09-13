# AI 调用日志审计

> 由 node scripts/audit-logs.mjs 生成 · 日志目录 logs

- 总记录：**3381** 条
- 覆盖 callType：**16** 类
- 平均耗时：2441ms　·　p95：4671ms　·　最慢：12933ms
- source 分布：GLM-5.1=54　GLM=3327
- model 分布：glm-5.3-flash=3381
- 字段缺失：**16** 条　·　FALLBACK：**0** 条
- 说明：日志按日累积，可能混入旧版本产生的记录；判断当前版本是否合规，以本轮之后新增的记录为准。
- 自 2026-09-13 起，`server/schema.js` 的同一张表已在**服务端**逐次校验：缺必需字段会当次失败并重试，因此新记录不应再出现字段缺失。
- 已忽略历史 MOCK_AI 记录 **903** 条（本版本已移除 MOCK，如需查看加 `--all`）

## 按 callType

| callType | 次数 | 平均耗时 | 最慢 | 字段缺失 |
|---|---:|---:|---:|---:|
| scene_gen | 597 | 2862ms | 12118ms | 1 |
| branch_judge | 429 | 2738ms | 12340ms | 6 |
| choice_hint | 378 | 1916ms | 6362ms | 0 |
| npc_chat | 306 | 1923ms | 5476ms | 4 |
| quiz_generate | 303 | 2337ms | 10742ms | 3 |
| act_review | 284 | 2797ms | 8559ms | 1 |
| quiz_answer_ai | 277 | 1096ms | 4833ms | 0 |
| quiz_judge | 277 | 1573ms | 5826ms | 0 |
| minigame_review | 197 | 2973ms | 8759ms | 0 |
| share_judge | 142 | 2775ms | 6499ms | 0 |
| sim_turn | 53 | 6182ms | 12933ms | 1 |
| night_options | 35 | 2903ms | 3587ms | 0 |
| night_resolve | 35 | 2968ms | 4894ms | 0 |
| ending_review | 34 | 5437ms | 8011ms | 0 |
| study_report | 28 | 3364ms | 5140ms | 0 |
| failure_review | 6 | 3974ms | 4672ms | 0 |

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
| 01:31:28 | quiz_generate | answer_index | ai-calls-2026-09-13.jsonl |
| 01:59:11 | npc_chat | reply | ai-calls-2026-09-13.jsonl |
| 03:18:30 | act_review | (整体不是对象) | ai-calls-2026-09-13.jsonl |
| 10:46:56 | sim_turn | (整体不是对象) | ai-calls-2026-09-13.jsonl |

## FALLBACK 明细

无。
