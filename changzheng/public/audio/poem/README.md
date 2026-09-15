# 终局升华的朗诵音频（整段录音）

这个目录是给**整段朗诵录音**用的（逐句配音不放这儿，那条走 `/api/tts` 的缓存，见下）。

目录里的音频文件**不入库**（`.gitignore` 挡着）——被别人录的/网上找的音频不进公开历史，
本机与演示机照常能播。放进来之后：

1. 把文件名填进 [`data/poem.json`](../../../data/poem.json) 的 `audio.full`（如 `"qilv-changzheng.ogg"`）；
2. 按录音给每句标上 `startMs` / `endMs`（毫秒；逐字跟着录音的已播时间走）；
3. 跑一次 `npm run qa:audio`——它会核对"放进来的文件有没有被 `audio.full` 指到"，漏填会红。

**格式**：`.ogg` / `.wav` / `.mp3` 都行（`qa:audio` 会逐个解码核对容器与时长）。

**当前放的是什么**（2026-09-15）：`qilv-changzheng.mp3` —— 一段 59.3 秒的《七律·长征(朗诵版)》
（素材自带的 ID3 标签标的就是这个）。`data/poem.json` 的 `audio.full` 已指向它，八句的起止毫秒
是**量出来的**（浏览器解码 + 静音分段），改音频就要重新量（见 docs/HANDOFF-AUDIO 第六点五节）。
这个目录不入库，**换机器演示要把文件一起拷过去**。

**逐句配音（另一种做法，可用）**：不放这里，而是按 `npm run poem:manifest` 给出的文件名
（`docs/POEM-TTS.md` 有整张表）把 8 个单句 wav 放进 `public/audio/cache/`。与现有 TTS 台词同一条产线，
`/api/tts` 会自动命中。

**硬规矩**：**两条路都没有也能演**——屏幕按 `data/poem.json` 的 `pace` 逐字走，流程不阻塞、不报错。
任何音频都不允许把收尾卡住（见 `docs/HANDOFF-AUDIO.md` 的红线）。
