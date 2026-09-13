# 素材清单（可勾选）

> 状态标记：**已有** = 已在仓库且被引用；**占位** = 用现有素材/CSS/合成音顶着，不阻塞开发；**待生成** = 需要生图或音频模型产出。
> 生图规格与 prompt 见 [`design/asset-prompts.md`](../../design/asset-prompts.md)；音频见 [`HANDOFF-AUDIO.md`](HANDOFF-AUDIO.md)。

## 一、场景图（`public/assets/scenes/`）

### 已有（15）

| 文件 | 用途 |
|---|---|
| `depart_pano.jpg` | 开场·于都河全景（兼标题背景） |
| `xiangjiang_pano.jpg` | 一幕·湘江全景 |
| `zunyi_pano.jpg` | 二幕·遵义全景 |
| `jinsha_pano.jpg` | 三幕·金沙江渡口全景 |
| `luding_pano.jpg` | 三幕·泸定桥全景（泸定桥小游戏背景） |
| `snow_pano.jpg` | 四幕·雪山全景（第 1 日营地 + 陡坡小游戏） |
| `camp_pano.jpg` | 四幕·草地营地全景（第 2 日营地、分糖/五子棋/夜岗背景） |
| `huining_pano.jpg` | 五幕·会宁会师全景（终局背景） |
| `pond_close.jpg` | 钓鱼/分汤近景 |
| `school_close.jpg` | 夜校近景 |
| `night_fire.jpg` | 篝火夜（夜间抉择屏背景） |
| `marsh.jpg` | 过草地 |
| `path_choice.jpg` | 岔路点选 |
| `camp_evening.jpg` | 休息近景 |
| `pond.jpg` | 备用池塘景 |

### 本轮新增（占位，不阻塞）

| 文件 | 用途 | 当前占位 | 状态 |
|---|---|---|---|
| `sentry_night.jpg` | 夜岗近景（暗夜营地边缘、树线、哨位） | 已产出 1280×872，军装为灰蓝（对齐 `night_fire.jpg`），纸纹毛边到位 | ✅ 已就位（返工后，2026-09-12） |
| `sugar_close.jpg` | 分糖近景（火光下的手与三颗糖） | `camp_pano.jpg` | ✅ 已就位（2026-09-12） |
| `snow_climb.jpg` | 雪山陡坡（拉人时机） | `snow_pano.jpg` | ✅ 已就位（2026-09-12） |

> 「落盘即生效」= 按文件名放进 `public/assets/scenes/` 就会被自动用上，不用改代码。
> 完整清单（含 14 张自动生效的图）见 [`HANDOFF-ART.md`](HANDOFF-ART.md) 第四节；自检 `npm run qa:assets`。

### 后续补齐（策划案 §11.1，目标 28–32 张）

| 幕 | 待生成 |
|---|---|
| 开场 | `depart_bridge` ✅（船只+门板浮桥，夜行列队）· `depart_crowd` ✅（返工后为短打布衣 + 包头巾/斗笠，不再像长袍） |
| 一幕 | `xiangjiang_bridge` ✅（断桥无遗体）· `xiangjiang_wreck` ✅（行装与担架，严格无人物）· `xiangjiang_night` ✅（江边宿营，绑腿与八角帽） |
| 二幕 | `zunyi_room` ✅（门缝旁听，人物背对无面孔）· `map_desk` ✅（油灯地图桌，无可读文字）· `zunyi_street` ✅（雨巷空无一人） |
| 三幕 | `jinsha_ferry` ✅ · `luding_bridge` ✅（铁索压中段，适配横版小游戏）· `luding_run` ✅（湿脚印 + 丢下的草鞋 + 远处火把） |
| 四幕 | `snow_camp` ✅ · `snow_let_clothes` ✅ 均已就位（2026-09-12，返工后双手为自然肤色，红军红只留帽徽） |
| 五幕 | `lazikou_cliff` ✅（陡壁 + 藤蔓岩缝，无人物）· `huining_flag` ✅（褪色破损红旗，旗面无徽记文字）· `huining_crowd` ✅（黄土塬两路汇合，远处看面孔不可辨） |
| 通用 | `map_route` ✅（做旧路线图，虚线路标 + 空白标记框，无可读地名）· `echo_paper` ✅（纯做旧纸纹理，无主体） |

> **场景图 21/21 全部就位**（2026-09-13）。`map_route` 用作手记（回望）底图、`echo_paper` 用作史实回响卡底纹，两者都叠了一层深色渐变保证文字可读；实机截图见 `tests/e2e/artifacts/look-journal.png` 与 `look-echo.png`（`npm run qa:look` 可重跑）。

## 二、角色立绘（`public/assets/characters/`）

| 已有（4） | 说明 |
|---|---|
| `laoban.png` | 老班长（钓鱼、分汤、篝火） |
| `zhiyuan.png` | 指导员（遵义、过草地） |
| `xiaogui.png` | 红小鬼（分糖、五子棋、「我腿不软」） |
| `weisheng.png` | 卫生员 |

**待生成（按策划案 §11.2）**：老乡、母亲、船工、向导、新兵、掉队战士、宣传员、突击队长、文化教员、担架伤员。
未到位时用文字头像（`data.js` 的 `ava` 字段，如「船」「向」「新」）兜底，不影响流程。

## 三、事件图（`public/assets/events/`，6 张，已有）

`ev_rain`、`ev_night_march`、`ev_starve`、`ev_village`、`ev_loss`、`ev_river` —— 自由行军沙盘的事件图卡，映射表在 [`data/sim-visuals.json`](../data/sim-visuals.json)（由 `/api/data/sim-visuals` 下发，前端不再硬编码）。

## 四、音频

| 类别 | 现状 | 说明 |
|---|---|---|
| 环境床 | **已就位 8 条（2026-09-12，Ogg Vorbis）** | 真正的 **Ogg Vorbis**（文件头 `OggS`），单声道 44.1kHz、24.4s，体积 116–226KB（合计 1.3MB）。`qa:assets` 浏览器解码 24s 全部通过。代码的 `.ogg → .wav → 合成` 回退链保留，但当前只存在 `.ogg` |
| 操作音效 | **合成兜底** | click / cast / hook / echo / correct / wrong / march / day 等，同上 |
| 预录台词 | **已有 21 条** | `public/audio/voices/*.wav` + 索引 `public/audio/voice-lines.json` |
| 同伴反应音 | **已有 6 条** | `public/audio/reactions/*.wav`（老班长赞成/反对、卫生员担忧、红小鬼嘴硬、向导建议、新兵自责） |
| TTS 缓存 | **已就位 20 条（2026-09-12）** | `public/audio/cache/*.wav`（22050Hz 单声道，2.33MB）。清单见 [`TTS-MANIFEST.md`](TTS-MANIFEST.md)；验收 `npm run qa:tts`。真调一局实测命中 **17 次**（14 张史实卡标题 + 哨兵/泸定/分糖/篝火夜开场句） |

## 五、数据与配置（非素材，但属于交付面）

| 文件 | 说明 |
|---|---|
| `data/acts.json` | 五幕定义：热点、每日场景 `dayScenes`、强制链、对决、史实卡绑定 |
| `data/facts.json` | 史实卡 14 张（real/fiction 分栏） |
| `data/sim-visuals.json` | 沙盘事件图与标签映射 |
| `data/tts-lines.json` | 固定台词清单（TTS 生成的输入） |
| `design/asset-prompts.md` | 生图 prompt 包 |
