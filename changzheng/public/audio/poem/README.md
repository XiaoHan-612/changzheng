# 终局升华的朗诵音频（整段录音）

这个目录是给**整段朗诵录音**用的（逐句配音不放这儿，那条走 `/api/tts` 的缓存，见下）。

目录里的音频文件**不入库**（`.gitignore` 挡着）——被别人录的/网上找的音频不进公开历史，
本机与演示机照常能播。放进来之后：

1. 把文件名填进 [`data/poem.json`](../../../data/poem.json) 的 `audio.full`（如 `"qilv-changzheng.ogg"`）；
2. 按录音给每句标上 `startMs` / `endMs`（毫秒；逐字跟着录音的已播时间走）；
3. 跑一次 `npm run qa:audio`——它会核对"放进来的文件有没有被 `audio.full` 指到"，漏填会红。

**格式**：`.ogg`（首选）或 `.wav`。**不要放 mp3**：`qa:audio` 只认这两种容器（它会逐个解码核对），
mp3 会被判"无法识别容器"。

**逐句配音（另一种做法，可用）**：不放这里，而是按 `npm run poem:manifest` 给出的文件名
（`docs/POEM-TTS.md` 有整张表）把 8 个单句 wav 放进 `public/audio/cache/`。与现有 TTS 台词同一条产线，
`/api/tts` 会自动命中。

**硬规矩**：**两条路都没有也能演**——屏幕按 `data/poem.json` 的 `pace` 逐字走，流程不阻塞、不报错。
任何音频都不允许把收尾卡住（见 `docs/HANDOFF-AUDIO.md` 的红线）。
