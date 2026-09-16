# 素材清单（可勾选）

> 状态标记：**已有** = 已在仓库且被引用；**备用** = 在盘但暂无接线点；**占位** = 用现有素材/CSS/合成音顶着，不阻塞开发；**待生成** = 需要生图或音频模型产出。
> 生图规格与 prompt 见 [`design/asset-prompts.md`](../../design/asset-prompts.md)；音频见 [`HANDOFF-AUDIO.md`](HANDOFF-AUDIO.md)。
> 数字对账过（2026-09-16）：`scenes = 39`、`characters = 14`、`events = 6`、`ambient = 8`、**`bgm = 8`**、
> **`sfx = 8`**、`voices = 21`、`cache = 20`、`poem = 1`（整段朗诵）。

## 一、场景图（`public/assets/scenes/`，36 张）

**36 张全部在盘并被引用**（唯一例外 `pond.jpg` 是设计内的备用图）。其中 **21 张走「落盘即生效」**
（前端 `sceneImage()` 存在就用、boot 时预热，换图不改代码）——那 21 张的完整清单与生效位置见
[`HANDOFF-ART.md`](HANDOFF-ART.md) 第四节；`npm run qa:handoff` 会逐行核对"文档承诺自动生效"与"代码确实预热"。

| 组 | 文件 | 用途 |
|---|---|---|
| 全景 | `depart_pano` · `xiangjiang_pano` · `zunyi_pano` · `jinsha_pano` · `luding_pano` · `snow_pano` · `camp_pano` · `huining_pano` | 各幕营地全景（`acts.json` 的 `pano`）；`depart_pano` 兼标题页背景、`huining_pano` 兼终局屏背景 |
| 过场空镜 | `depart_crowd` · `xiangjiang_night` · `zunyi_street`（场景图）+ `ev_river` · `ev_rain` · `ev_night_march`（事件图，见 §三） | 各幕 `cutAlt`：幕间过场"回望上一幕"那一拍用它们 |
| 近景/抉择 | `pond` · `pond_close` · `school_close` · `camp_evening` · `night_fire` · `marsh` · `path_choice` · `sentry_night` · `sugar_close` · `snow_climb` · `snow_camp` · `snow_let_clothes` · `luding_bridge` · `luding_run` · `jinsha_ferry` · `map_desk` · `zunyi_room` · `lazikou_cliff` · `huining_flag` · `xiangjiang_bridge` · `xiangjiang_wreck` · `huining_crowd` | 小游戏背景与热点/抉择横幅（`acts.json` 的 `img`、`flow/tables.js` 的 `CHOICE_SETS`） |
| 通用底纹 | `map_route` · `echo_paper` | 手记（回望）底图与史实回响底纹，都叠了一层深色渐变保证文字可读 |

> `pond.jpg` 是**备用池塘景**（在用的是 `pond_close.jpg`），保留在盘、无接线点，别当垃圾删。
> 序章与每幕幕间共用一个过场屏（`#screen-cutscene`）；其中路线图那一拍现在用 `map_route`。
> **第 2 轮三张图已就位**（2026-09-16）：`map_route_deep.jpg`（序章/幕间的暗调路线图）、
> `huining_dusk.jpg`（升华收束空镜）、`poem_paper.jpg`（诗页底纹）。三张都走「落盘即生效」——
> 流程层用 `sceneImage()` 探测，放进目录即自动顶掉旧图、**没有改一行代码**（`qa:assets` 已从
> 「待生成图片」移到「已就位」）。

## 二、角色立绘（`public/assets/characters/`，14 张）

**14 张全部就位并接线**。规格：1024×1024 生成 → 导出 **280×280 PNG**，脸心居中偏上（圆形头像框裁切安全）。

`laoban`（老班长）· `zhiyuan`（指导员）· `xiaogui`（红小鬼）· `weisheng`（卫生员）· `mother`（母亲）·
`xianggui`（老乡）· `guide`（向导）· `boatman`（船工）· `recruit`（新兵）· `straggler`（掉队战士）·
`drummer`（宣传员）· `captain`（突击队长）· `teacher`（文化教员）· `wounded`（担架伤员）

> **落盘即生效**：`flow/view.js` 的 `PORTRAIT_FILE` 映射 + `showNpc()` 统一入口；热点写 `npc` 字段就自动用上，
> 配不到专属立绘退回文字头像、不报错。两个坑：① 必须缩到 280×280 再落盘（1024 原图单张 2MB+，
> `qa:inspect` 会拦）；② 别把"老班长"当万能兜底（见 [`HANDOFF-CODE.md`](HANDOFF-CODE.md) 坑 16）。

## 三、事件图（`public/assets/events/`，6 张）

2026-09-12 产出、**2026-09-15 接线**（此前 6 张全在盘却没有任何代码引用，本节还是空的）。

| 文件 | 现在用在哪 |
|---|---|
| `ev_river.jpg` | 第三幕（金沙江·泸定）过场空镜：`data/acts.json` 的 `cutAlt`——涉水渡江 |
| `ev_rain.jpg` | 第四幕（雪山·草地）过场空镜：雨中草地行军 |
| `ev_night_march.jpg` | 第五幕（腊子口·会宁）过场空镜：月下夜行军 |
| `ev_loss.jpg` | **失败结算屏**底图（体力耗尽）：一双留在路上的旧鞋 |
| `ev_starve.jpg` | **失败结算屏**底图（断粮掉队）：火上的一口空锅 |
| `ev_village.jpg` | 备用（村落宿营空镜）：暂无接线点，留给以后的新热点 |

> 事件图**不属于**"落盘即生效"那一档：它们被 `acts.json` 的 `cutAlt` 与 `flow/end.js` 的失败屏
> 按**字面路径**引用（路径别拼字符串，否则素材对账扫不到）。换图要改数据/代码。

## 四、音频

| 类别 | 现状 | 说明 |
|---|---|---|
| 环境床 | **8 条已就位**（共 9 种 kind） | `public/audio/ambient/*.ogg`（真 Ogg Vorbis，单声道 44.1kHz、24.4s、116–226KB）。第 9 种 `wind` 是兜底场景、未产出 → 走合成兜底（`qa:audio` 会列出"正在兜底"） |
| 操作音效 | **8 个已就位**（2026-09-16） | `public/audio/sfx/{click,cast,hook,echo,correct,wrong,march,day}.ogg`——同名文件自动顶替 `sfx-table.js` 的合成配方（落盘即生效，代码没改） |
| **BGM** | **8 首已就位**（2026-09-16，唯一待产线收口） | `public/audio/bgm/<kind>_bgm.ogg` 八首齐全（`qa:audio` 报「BGM 文件齐全（8 首）」）。按幕与分日自动切换（`scene-table.js`），音量 0.18、人声时闪避——同样是落盘即生效，代码没改 |
| 预录台词 | **21 条** | `public/audio/voices/*.wav` + 索引 `voice-lines.json` |
| TTS 缓存 | **20 条** | `public/audio/cache/*.wav`（22050Hz 单声道，2.33MB）。清单 [`TTS-MANIFEST.md`](TTS-MANIFEST.md)，验收 `npm run qa:tts` |
| **终局升华的整段朗诵** | **1 条（随仓库走，949,376 字节）** | `public/audio/poem/qilv-changzheng.mp3`（《七律·长征(朗诵版)》，59.3s）。八句起止毫秒**是量出来的**、写在 `data/poem.json`；换音频要重新量、对外发布要换掉（见 [`HANDOFF-AUDIO.md`](HANDOFF-AUDIO.md) §六点五 与该目录 `README.md`）。2026-09-16 起从 gitignore 放出来：clone 下来就有，不用另外拷 |
| 同伴反应音 | **已撤**（2026-09-14） | 原先 6 条 `audio/reactions/*.wav` 随「自由行军沙盘」一起移除、归档在 `_archive/audio-reactions-sandbox/`；没有任何代码路径引用它们，**别按旧文档去补** |

## 五、数据与配置（非素材，但属于交付面）

| 文件 | 说明 |
|---|---|
| `data/acts.json` | 五幕定义：热点、每日场景 `dayScenes`、强制链路、对决、史实卡绑定、过场空镜 `cutAlt` |
| `data/facts.json` | 史实卡 14 张（real/fiction 分栏） |
| `data/tts-lines.json` | 固定台词清单（TTS 生成的输入） |
| `data/poem.json` | 终局升华的诗与落款：**诗的唯一真源**（字幕/逐字/配音都读它）+ 逐句时间轴 + 无声节奏 |
| `design/asset-prompts.md` | 生图 prompt 包（含"本轮"与历史轮次） |
