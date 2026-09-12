# AI 调用日志审计

> 由 node scripts/audit-logs.mjs 生成 · 日志目录 logs

- 总记录：**957** 条
- 覆盖 callType：**13** 类
- 平均耗时：391ms　·　p95：2388ms　·　最慢：12340ms
- source 分布：GLM-5.1=54　MOCK_AI=903
- model 分布：glm-5.3-flash=957
- 字段缺失：**125** 条　·　FALLBACK：**0** 条
- 说明：日志按日累积，可能混入旧版本产生的记录；判断当前版本是否合规，以本轮之后新增的记录为准。

## 按 callType

| callType | 次数 | 平均耗时 | 最慢 | 字段缺失 |
|---|---:|---:|---:|---:|
| branch_judge | 184 | 906ms | 12340ms | 6 |
| quiz_generate | 135 | 733ms | 10742ms | 2 |
| quiz_answer_ai | 128 | 84ms | 2388ms | 0 |
| quiz_judge | 128 | 200ms | 5360ms | 0 |
| scene_gen | 94 | 210ms | 12118ms | 42 |
| choice_hint | 83 | 77ms | 6362ms | 36 |
| act_review | 73 | 117ms | 8559ms | 36 |
| share_judge | 45 | 0ms | 1ms | 0 |
| minigame_review | 35 | 368ms | 8759ms | 0 |
| sim_turn | 27 | 0ms | 1ms | 0 |
| ending_review | 15 | 0ms | 1ms | 0 |
| npc_chat | 8 | 3059ms | 5476ms | 1 |
| study_report | 2 | 0ms | 0ms | 2 |

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
| 06:34:23 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:34:27 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:34:31 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:34:37 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:34:55 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:35:00 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:35:01 | study_report | summary | ai-calls-2026-09-12.jsonl |
| 06:43:20 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:43:26 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:43:27 | choice_hint | hints | ai-calls-2026-09-12.jsonl |
| 06:43:29 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:43:30 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:43:31 | choice_hint | hints | ai-calls-2026-09-12.jsonl |
| 06:43:33 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:43:34 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:43:35 | choice_hint | hints | ai-calls-2026-09-12.jsonl |
| 06:43:37 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:43:38 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:43:39 | choice_hint | hints | ai-calls-2026-09-12.jsonl |
| 06:43:41 | choice_hint | hints | ai-calls-2026-09-12.jsonl |
| 06:43:42 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:43:45 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:43:46 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:44:01 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:44:03 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:44:04 | choice_hint | hints | ai-calls-2026-09-12.jsonl |
| 06:44:05 | choice_hint | hints | ai-calls-2026-09-12.jsonl |
| 06:44:07 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:44:08 | study_report | summary | ai-calls-2026-09-12.jsonl |
| 06:46:01 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:52:21 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:52:27 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:52:28 | choice_hint | hints | ai-calls-2026-09-12.jsonl |
| 06:52:29 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:52:31 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:52:32 | choice_hint | hints | ai-calls-2026-09-12.jsonl |
| 06:52:33 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:52:34 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:52:36 | choice_hint | hints | ai-calls-2026-09-12.jsonl |
| 06:52:37 | act_review | title, lines | ai-calls-2026-09-12.jsonl |
| 06:52:38 | scene_gen | title, atmosphere | ai-calls-2026-09-12.jsonl |
| 06:52:40 | choice_hint | hints | ai-calls-2026-09-12.jsonl |

## FALLBACK 明细

无。
