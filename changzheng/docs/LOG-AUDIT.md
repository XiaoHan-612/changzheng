# AI 调用日志审计

> 由 node scripts/audit-logs.mjs 生成 · 日志目录 logs

- 总记录：**946** 条
- 覆盖 callType：**16** 类
- 平均耗时：2720ms　·　p95：6277ms　·　最慢：12340ms
- source 分布：GLM-5.1=54　GLM=892
- model 分布：glm-5.3-flash=946
- 字段缺失：**13** 条　·　FALLBACK：**0** 条
- 说明：日志按日累积，可能混入旧版本产生的记录；判断当前版本是否合规，以本轮之后新增的记录为准。
- 自 2026-09-13 起，`server/schema.js` 的同一张表已在**服务端**逐次校验：缺必需字段会当次失败并重试，因此新记录不应再出现字段缺失。
- 已忽略历史 MOCK_AI 记录 **903** 条（本版本已移除 MOCK，如需查看加 `--all`）

## 按 callType

| callType | 次数 | 平均耗时 | 最慢 | 字段缺失 |
|---|---:|---:|---:|---:|
| scene_gen | 182 | 2951ms | 12118ms | 1 |
| branch_judge | 121 | 3562ms | 12340ms | 6 |
| quiz_generate | 103 | 2731ms | 10742ms | 3 |
| choice_hint | 96 | 2042ms | 6362ms | 0 |
| quiz_answer_ai | 92 | 1131ms | 3605ms | 0 |
| quiz_judge | 92 | 1791ms | 5826ms | 0 |
| act_review | 87 | 2781ms | 8559ms | 0 |
| minigame_review | 54 | 3312ms | 8759ms | 0 |
| share_judge | 36 | 2847ms | 4549ms | 0 |
| npc_chat | 22 | 2771ms | 5476ms | 3 |
| sim_turn | 20 | 6159ms | 7517ms | 0 |
| night_options | 10 | 2870ms | 3368ms | 0 |
| night_resolve | 10 | 3027ms | 4380ms | 0 |
| ending_review | 10 | 5427ms | 6405ms | 0 |
| study_report | 8 | 3249ms | 3714ms | 0 |
| failure_review | 3 | 3938ms | 4218ms | 0 |

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

## FALLBACK 明细

无。
