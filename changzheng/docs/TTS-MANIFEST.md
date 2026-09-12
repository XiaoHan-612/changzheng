# 语音（TTS）清单

> 由 `node scripts/tts-manifest.mjs` 生成。把 wav 放进 `public/audio/cache/`，**文件名必须与最后一列一致**，`/api/tts` 会自动命中；没命中就静默降级，不阻塞流程。

- 台词条数：**24**
- 已就位：**0**
- 生成规则：`sha1(voiceId + "|" + text)` 取前 16 位，拼 `_<voiceId>.wav`
- 采样：单声道 wav，16k/22.05kHz，≤80 字，静音裁掉首尾

| id | 说话人 | voiceId | 场景 | 文本 | 文件名 | 状态 |
|---|---|---|---|---|---|---|
| fact_h_depart | 旁白 | narr | 史实回响·标题 | 于都出发 | `7d6ddd173db7e60e_narr.wav` | ⬜ 待生成 |
| fact_h_xiangjiang | 旁白 | narr | 史实回响·标题 | 湘江战役 | `9bedd679eb724bdf_narr.wav` | ⬜ 待生成 |
| fact_h_zunyi | 旁白 | narr | 史实回响·标题 | 遵义会议 | `0bdf512ca91f7803_narr.wav` | ⬜ 待生成 |
| fact_h_chishui | 旁白 | narr | 史实回响·标题 | 四渡赤水 | `e36b6912f178ecc9_narr.wav` | ⬜ 待生成 |
| fact_h_jinsha | 旁白 | narr | 史实回响·标题 | 巧渡金沙江 | `70f4d5951fd28cc6_narr.wav` | ⬜ 待生成 |
| fact_h_luding | 旁白 | narr | 史实回响·标题 | 飞夺泸定桥 | `8db2d78f6d2eb829_narr.wav` | ⬜ 待生成 |
| fact_h_xueshan | 旁白 | narr | 史实回响·标题 | 翻越雪山 | `c506768206bf74ac_narr.wav` | ⬜ 待生成 |
| fact_h_fishhook | 旁白 | narr | 史实回响·标题 | 金色的鱼钩 | `f819608b5d1b730d_narr.wav` | ⬜ 待生成 |
| fact_h_grassland | 旁白 | narr | 史实回响·标题 | 过松潘草地 | `bcd717776adf0ba0_narr.wav` | ⬜ 待生成 |
| fact_h_share | 旁白 | narr | 史实回响·标题 | 行军中的分享 | `1dfdfaad5acddddd_narr.wav` | ⬜ 待生成 |
| fact_h_nightschool | 旁白 | narr | 史实回响·标题 | 行军中的文化学习 | `b42f761a40e3178e_narr.wav` | ⬜ 待生成 |
| fact_h_sentry | 旁白 | narr | 史实回响·标题 | 夜间警戒与口令 | `af0b9ea8732112a8_narr.wav` | ⬜ 待生成 |
| fact_h_campfire | 旁白 | narr | 史实回响·标题 | 篝火与夜间议事 | `77520791f2e362cd_narr.wav` | ⬜ 待生成 |
| fact_h_huining | 旁白 | narr | 史实回响·标题 | 会宁会师 | `5efc4d6163d88bb3_narr.wav` | ⬜ 待生成 |
| sentry_open | 哨兵 | sentry | 夜岗·开场 | 后半夜归你。听不清就再听一遍，别急着开枪。 | `d2681b49ad1e103e_sentry.wav` | ⬜ 待生成 |
| sentry_pass_ok | 哨兵 | sentry | 夜岗·全对 | 该报的报了，不该报的忍住了。天快亮时，前哨换班，拍了拍你的肩。 | `45e6d7e1b408bd65_sentry.wav` | ⬜ 待生成 |
| sentry_pass_bad | 哨兵 | sentry | 夜岗·失误 | 你喊早了一次，又沉默得太久。全班被折腾起来，冻着挨到天亮。 | `39f488e76a9beedb_sentry.wav` | ⬜ 待生成 |
| luding_open | 突击队长 | captain | 泸定桥·开场 | 桥板被人抽了，铁索还在。跟着我，别往下看。 | `b3ad26e9ddac57fe_captain.wav` | ⬜ 待生成 |
| luding_cleared | 突击队长 | captain | 泸定桥·成功 | 过桥了。铁索在手里发烫，身后的火还没停。 | `31f34ae0e01e2360_captain.wav` | ⬜ 待生成 |
| luding_failed | 突击队长 | captain | 泸定桥·未过 | 没能过去。第二拨人把桥板一块块铺上，队伍从上面走了过去。 | `f5c4153f39052dec_captain.wav` | ⬜ 待生成 |
| candy_open | 红小鬼 | xiaogui | 分糖·开场 | 我兜里有三颗糖。你说，给谁？ | `ec48fc5cb1ca8699_xiaogui.wav` | ⬜ 待生成 |
| snow_grab_open | 你 | narr | 陡坡·开场 | 他的手在滑。前面的雪是硬的，下面是空的。 | `7a265e4242432776_narr.wav` | ⬜ 待生成 |
| roster_open | 你 | narr | 会师·清点 | 队伍汇合了，人山人海。你在人群里找那些熟悉的脸。 | `76f989326ae3df3c_narr.wav` | ⬜ 待生成 |
| night_open | 旁白 | narr | 篝火夜·开场 | 火压低了。后半夜怎么过，明天的口粮怎么带，得在火边定下来。 | `554e34ea8555b08a_narr.wav` | ⬜ 待生成 |

## 音色建议（与策划案 §2.6.3 一致）

| 角色 | 音色气质 | voiceId |
|---|---|---|
| 旁白 / 史实回响 | 克制、像翻史书，中性 | narr |
| 老班长 | 低、慢、少话有力 | laoban |
| 指导员 | 讲理、耐心 | zhiyuan |
| 红小鬼 | 倔、快、心软，少年声 | xiaogui |
| 卫生员 | 轻、稳 | weisheng |
| 哨兵 | 压着嗓子、警觉 | sentry |
| 突击队长 | 短促、有劲 | captain |
| 船工 / 老乡 | 热、土、谨慎（可带轻微方言） | guide |
| 宣传员 | 清亮、不喊口号 | drummer |

## 环境床（ogg，15–30s 可循环）

| 场景 | 文件 | 说明 |
|---|---|---|
| 于都河夜 | `public/audio/ambient/depart_river.ogg` | 河水 + 夜虫 |
| 湘江 | `public/audio/ambient/xiangjiang_wind.ogg` | 远炮闷响 + 风 + 江水 |
| 遵义雨夜 | `public/audio/ambient/zunyi_rain.ogg` | 雨声 + 室内静 |
| 金沙江 | `public/audio/ambient/jinsha_rapids.ogg` | 急流 |
| 泸定桥 | `public/audio/ambient/luding_iron.ogg` | 铁索风 + 对岸火力余响 |
| 雪山 | `public/audio/ambient/snow_wind.ogg` | 雪风 |
| 草地营火 | `public/audio/ambient/grass_fire.ogg` | 风 + 火 |
| 会宁 | `public/audio/ambient/huining_low.ogg` | 低人流嘈杂 + 远号 |

> 目前环境床由 WebAudio 实时合成兜底（`public/js/audio.js`）；ogg 到位后按上表放入即可替换。
