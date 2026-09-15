# 素材 Prompt 包（交给生图模型）

> 用途：按行复制 prompt 生图 → 裁水印 → 按「尺寸」列导出 → 放到「落盘路径」。
> 生成完把 [`changzheng/docs/ASSETS.md`](../changzheng/docs/ASSETS.md) 对应行改成 ✅。

## 0. 全局规则（每张图都必须遵守）

**统一前缀**（所有 prompt 前面都要加这一段，来源：策划案 §0.4）：

```
Chinese watercolor historical illustration, aged paper texture, muted palette #E8DCC8 #2C2416 #8B2E2E #C4A35A, no text, no watermark, no modern objects
```

**负面词（Negative prompt）**：

```
photorealistic, 3d render, neon, cyberpunk, lens flare, text, letters, watermark, logo, signature, modern clothing, modern vehicles, oversaturated colors, gore, gory wounds, heroic poster pose, anime
```

**规格**

| 类别 | 生成尺寸 | 导出 | 备注 |
|---|---|---|---|
| 全景 pano | 1536×1024 | **1280 宽 JPEG q82** | 热点用百分比坐标，构图四周留 6% 安全区 |
| 近景 close | 1536×1024 | 1280 宽 JPEG q82（可 1024） | 与全景同一光线方向 |
| 立绘 | 1024×1024 | **280×280 PNG**（脸心） | 半身，浅底，头部居中偏上 |
| UI 底纹 | 1024×1024 | 1024 PNG/JPEG | 无主体，可平铺 |

**统一约束**：侧光/暮光；人物服装为 1934–1936 红军灰布军装（草鞋、绑腿、八角帽为主）；不出现具体可辨认的真实历史人物面孔；不出现现代物件、电线、塑料、玻璃幕墙。

---

## 1. 当前轮（第 2 轮 · 2026-09-15）：3 张图 + 16 条音频

> 为什么还要这三张：不是缺图，而是"现有图能顶、产出了明显更好"。三张都已接上「落盘即生效」——
> **按文件名放进 `changzheng/public/assets/scenes/`，刷新页面就生效，不用改任何代码**
> （`sceneImage()` 会探测新图，没探测到就退回现在用的那张）。
> 音频那批优先级更高：8 首 BGM 是**唯一还没产出的产线**，落盘即生效（见 `HANDOFF-AUDIO.md` §六）。

### 1.1 图（3 张）

| 文件名 | 用途 | 中文描述 | 完整 prompt（前缀 + 主体） | 尺寸 | 验收 |
|---|---|---|---|---|---|
| `map_route_deep.jpg` | 序章题字之后 + 每幕幕间的「路线图」那一拍（全片出现 7 次，**性价比最高的一张**） | 油灯下的行军路线图：做旧纸面但**整体压暗**（以墨色为主调），山峦用浓淡墨块，河流淡青灰，一条朱红虚线路线自左下蜿蜒到右上；四角留空白标记框；油灯暖光自左上斜照，四周明显暗角 | `...prefix..., a campaign route map under oil-lamp light: aged paper darkened to deep ink tones, mountains as layered ink washes, rivers in pale blue-grey, one vermilion dotted route winding from lower-left to upper-right, blank cartouches at the corners, warm lamp glow from the upper-left, heavy vignette, deliberately low-key and dark so pale text can sit on top, no place names, no letters, no compass rose` | 1536×1024 → 1280 宽 JPEG q82 | 中央压得住白字（不许出现大片高亮纸面）；无文字/数字/印章；四周留 6% 安全区 |
| `huining_dusk.jpg` | 终章升华的收束空镜（**全片最后一眼**） | 会宁城外黄土塬与残城墙，暮色低角度暖光，画面**空无一人**（或极远处几个不可辨剪影），上方大面积低对比天空（要压诗句），安静、克制 | `...prefix..., wide empty loess plateau before the low ruined earthen walls of Huining at dusk, long warm low-angle light raking across dry grass, no people or only a few unreadable distant silhouettes, large quiet sky occupying the upper half for text overlay, restrained elegiac mood, deep soft shadows` | 1536×1024 → 1280 宽 JPEG q82 | 无人脸、无文字；上部约 40% 是低对比天空（压得住白字） |
| `poem_paper.jpg` | 诗页底纹（给升华那屏一点纸/墨的呼吸，现在是纯黑场） | 极淡的宣纸纹理 + 画面下缘一线远山淡影，近乎单色、**整体偏暗**（诗是白字），无主体 | `...prefix..., extremely subdued rice-paper texture with the faintest suggestion of distant mountain ridges along the bottom edge, almost monochrome dark ink wash, no subject, no figures, evenly dark enough for pale text, subtle fibre grain, no borders` | 1536×1024 → 1280 宽 JPEG q85 | 整体亮度低（白字要立得住）；无文字；拉伸平铺都不露接缝 |

### 1.2 音频（8 首 BGM + 8 个操作音效）

**BGM**：Ogg Vorbis 立体声 44.1kHz、**60–120 秒且可无缝循环**、单条 1–2MB；
落盘路径 `changzheng/public/audio/bgm/<文件名>`（**放进目录即生效**，代码无需改动）；
红线：**不含人声**、不用强节奏与打击乐重音、整体克制（都是"夜里行军"的音量）。

| 文件名 | 场景 / 情绪 | 给音频模型的提示词 |
|---|---|---|
| `depart_bgm.ogg` | 开场·于都河：告别、克制、向前 | 低音弦乐长音铺底，一支箫偶尔一句短动机；约 60 BPM；不写"悲壮"，写"不舍但要走"；无打击乐 |
| `xiangjiang_bgm.ogg` | 一幕·湘江：代价、暗流、压抑 | 低音提琴持续音 + 极轻的鼓皮（稀疏、像远处闷响）；不做旋律高潮；音量始终压在环境床之下 |
| `zunyi_bgm.ogg` | 二幕·遵义：雨夜、思索、室内 | 雨声之外的室内感：钢琴/扬琴单音点缀 + 低音持续，留大量空白；不煽情 |
| `jinsha_bgm.ogg` | 三幕前·金沙江：水流、紧张但克制 | 弦乐长音浮在水声之上，节奏靠水流而不是鼓；不写"追击感" |
| `luding_bgm.ogg` | 三幕后·泸定桥：铁索、紧张度最高 | 金属摩擦质感 + 低鼓点式脉冲（心跳感），**不打重拍、不做爆炸**；紧张靠密度不靠音量 |
| `snow_bgm.ogg` | 四幕·雪山：冷、稀疏、留白 | 高频空灵音色 + 低音嗡鸣，风声留白；音符越少越好 |
| `grass_bgm.ogg` | 四幕·草地：泥泞、疲惫、缓慢 | 低音铺底 + 轻微不规则的脉冲（像踩进泥里）；速度感最慢的一条 |
| `huining_bgm.ogg` | 五幕·会宁：汇合、暖调、收束 | 弦乐 + 极轻的铜管长音，调性转暖；**不喊口号、不做进行曲**，像"终于站到一起" |

**操作音效**：≤0.4 秒、干声、克制、**不带音高旋律**（避免与 TTS 抢）；
落盘 `changzheng/public/audio/sfx/<名>.ogg`（同名文件自动顶替现在的 WebAudio 合成音）。
现在走合成、够用；预录只是音质升级，属于可选项：

| 文件名 | 用途 | 提示词 |
|---|---|---|
| `click.ogg` | 点热点/按钮 | 一声极轻的木质轻叩（像指尖敲桌），不刺耳 |
| `cast.ogg` | 钓鱼抛竿 | 竹竿挥出的风声 + 极轻的线入水 |
| `hook.ogg` | 钓鱼提竿 | 竿梢绷紧的一声"嗒" + 短促水花 |
| `echo.ogg` | 史实回响翻开 | 一张老纸被翻动的沙沙声（0.3s 内） |
| `correct.ogg` | 答对 | 两枚木质音（上行，无旋律），克制 |
| `wrong.ogg` | 答错 | 一声闷的木质低音，不刺耳、不"惩罚感" |
| `march.ogg` | 启程/换幕鼓点 | 一记低鼓 + 两步草鞋落地，短促 |
| `day.ogg` | 进入新的一日 | 一声远的号音（单音，无旋律）+ 轻微环境扬起 |

> **不需要**：诗的逐句配音。终章升化用的是一整段真人朗诵（`public/audio/poem/qilv-changzheng.mp3`，
> 已带量好的逐句时间轴），逐句 TTS 那条路只是备份，不必为此花额度。

## 2. 第 1 轮（**已完成**，2026-09-12 / 09-13）：场景 21 张 + 立绘 14 张

下列三节是本轮之前的产图任务，**产出已全部就位并接线**（清单与生效位置见
[`changzheng/docs/ASSETS.md`](../changzheng/docs/ASSETS.md) 与 `HANDOFF-ART.md` §四），保留在此供返工时对齐风格。

### 2.1 本轮必需（3 张，新玩法用）

| 文件名 | 用途 | 中文描述 | 完整 prompt（前缀 + 主体） | 尺寸 | 验收 |
|---|---|---|---|---|---|
| `sentry_night.jpg` | 夜岗小游戏 / 夜哨热点 | 暗夜营地边缘的哨位，树线剪影，一名年轻战士持枪侧身，远处一点将熄的火光 | `Chinese watercolor historical illustration, aged paper texture, muted palette #E8DCC8 #2C2416 #8B2E2E #C4A35A, no text, no watermark, no modern objects` + `, a lone young Red Army sentry standing at the dark edge of a camp, silhouetted treeline, faint dying campfire glow far behind, deep night blues and warm ember accents, heavy vignette, quiet tension, 1935 Sichuan grassland` | 1280 宽 JPEG q82 | 无文字水印；暗部不糊成一团；能看出"哨位+树线" |
| `sugar_close.jpg` | 分糖小游戏 | 火光下摊开的手掌里三颗包着纸的糖，背景两名年轻战士虚影 | `...prefix..., close-up of an open young soldier's palm holding three small paper-wrapped candies, warm campfire rim light from below, two blurred young comrades watching in the background, shallow depth of field, tender restrained mood` | 1280 宽 JPEG q82 | 糖纸不出现文字；手部不畸形 |
| `snow_climb.jpg` | 雪山陡坡（拉人时机） | 暴风雪中的陡雪坡，一只手下探抓住另一只手腕，风雪横吹 | `...prefix..., steep snow slope in a blizzard, one soldier reaching down to grip another's wrist, wind-blown snow streaking sideways, pale grey-white palette with a single dark red armband accent, no faces in focus` | 1280 宽 JPEG q82 | 手部结构合理；无血腥 |

### 2.2 后续补齐 · 场景（18 张，策划案 §11.1）

| 文件名 | 用途 | 中文描述 | 完整 prompt（前缀 + 主体） | 尺寸 |
|---|---|---|---|---|
| `depart_bridge.jpg` | 开场·浮桥 | 于都河上的门板浮桥，队伍夜里过河 | `...prefix..., a pontoon bridge made of wooden door planks across the Yudu river at night, a column of soldiers crossing silently, lantern light on water` | 1280 宽 JPEG q82 |
| `depart_crowd.jpg` | 开场·送别 | 岸边送别的老乡剪影，草鞋与斗笠 | `...prefix..., silhouettes of villagers seeing the column off at the riverbank, straw sandals and bamboo hats, dawn mist` | 1280 宽 JPEG q82 |
| `xiangjiang_bridge.jpg` | 一幕·浮桥 | 湘江上被炸毁的浮桥，急流 | `...prefix..., a broken pontoon bridge over the fast Xiang river, splintered planks, cold grey water, distant smoke` | 1280 宽 JPEG q82 |
| `xiangjiang_wreck.jpg` | 一幕·残骸 | 江滩散落的行装与担架 | `...prefix..., abandoned packs and a wooden stretcher on a riverbank, grey pebbles, thin cold mist, no bodies` | 1280 宽 JPEG q82 |
| `xiangjiang_night.jpg` | 一幕·夜色宿营 | 江边宿营，湿柴与背靠背的战士 | `...prefix..., night camp by the river, damp firewood, soldiers sitting back to back, exhausted blue-grey palette` | 1280 宽 JPEG q82 |
| `zunyi_room.jpg` | 二幕·门缝室内 | 透过门缝看到的灰砖小楼室内，油灯 | `...prefix..., a grey brick town house interior seen through a slightly open door, oil lamp glow, wooden table, no identifiable faces` | 1280 宽 JPEG q82 |
| `map_desk.jpg` | 二幕·地图桌 | 油灯下摊开的行军地图与铅笔 | `...prefix..., an oil lamp over a spread-out hand-drawn campaign map on a wooden desk, pencil and compass, warm pool of light, illegible map lines` | 1280 宽 JPEG q82 |
| `zunyi_street.jpg` | 二幕·雨巷 | 遵义的青石雨巷，屋檐滴水 | `...prefix..., narrow rain-soaked stone alley in Zunyi, tiled eaves dripping, wet flagstones reflecting lantern light, empty` | 1280 宽 JPEG q82 |
| `jinsha_ferry.jpg` | 三幕·木筏 | 金沙江渡口，木筏与竹篙 | `...prefix..., a wooden raft at the Jinsha river crossing, bamboo poles, churning green-brown water, early morning` | 1280 宽 JPEG q82 |
| `luding_bridge.jpg` | 三幕·铁索桥面 | 泸定桥面，缺失的木板与铁索 | `...prefix..., the deck of the Luding iron-chain bridge, many planks missing, heavy chains, cold mist over the gorge below` | 1280 宽 JPEG q82 |
| `luding_run.jpg` | 三幕·急行军 | 山道上一串湿脚印与草鞋 | `...prefix..., a steep mountain trail at night with wet footprints and a discarded straw sandal, torch flicker far ahead` | 1280 宽 JPEG q82 |
| `snow_camp.jpg` | 四幕·雪线营地 | 雪线以上背风的营地，帐篷剪影 | `...prefix..., a wind-sheltered camp above the snow line, felt tent silhouettes, thin smoke, pale blue-grey snow light` | 1280 宽 JPEG q82 |
| `snow_let_clothes.jpg` | 四幕·让棉衣 | 一件棉衣递到发抖的战士手里 | `...prefix..., close view of a padded cotton jacket being handed to a shivering young soldier, snow on shoulders, restrained gesture, faces out of frame` | 1280 宽 JPEG q82 |
| `lazikou_cliff.jpg` | 五幕·侧崖 | 腊子口侧面的陡崖与藤蔓 | `...prefix..., a sheer cliff beside the Lazikou pass, vines and rock ledges, narrow gorge, dawn` | 1280 宽 JPEG q82 |
| `huining_flag.jpg` | 五幕·红旗 | 会宁城头一面红旗特写 | `...prefix..., close-up of a weathered red flag on a wooden pole against a pale sky, frayed edge, no emblem detail` | 1280 宽 JPEG q82 |
| `huining_crowd.jpg` | 五幕·队伍汇合 | 两支部队在黄土塬上汇合的人流 | `...prefix..., two columns of soldiers merging on a loess plateau, dust and low sun, seen from a distance, faces indistinct` | 1280 宽 JPEG q82 |
| `map_route.jpg` | 通用·路线大地图 | 做旧的川黔滇长征路线图（无文字） | `...prefix..., an aged hand-drawn campaign map of western China mountain terrain, rivers and a dotted route line, blank cartouches where labels would be` | 1024 PNG |
| `echo_paper.jpg` | 通用·回响底纹 | 做旧纸张纹理，边缘焦黄 | `...prefix..., plain aged rice paper texture with foxed edges and faint fiber grain, no subject` | 1024 JPEG q85 |

### 2.3 后续补齐 · 立绘（14 张）

统一句式：`...prefix..., half-body portrait of <角色描述>, three-quarter view, soft side light, plain parchment background, calm expression, 1935 Red Army uniform`

| 文件名 | 角色 | 补充描述 |
|---|---|---|
| `laoban.png` | 老班长 | a lean 42-year-old cook, weathered face, quiet steady eyes （已有，可重出统一风格） |
| `zhiyuan.png` | 指导员 | a composed political instructor in his early 30s, thin frame, patient gaze |
| `xiaogui.png` | 红小鬼 | a stubborn 16-year-old boy, oversized uniform, chin slightly lifted |
| `weisheng.png` | 卫生员 | a calm young medic, rolled bandages in the breast pocket |
| `xianggui.png` | 老乡 | a sun-darkened middle-aged peasant, felt hat, wary but kind |
| `mother.png` | 母亲 | a tired rural mother in her 40s, blue cotton headscarf |
| `boatman.png` | 船工 | a river boatman with a bamboo pole, bare feet, rope-burned palms |
| `guide.png` | 向导 | a mountain guide in a sheepskin vest, carrying a short stick |
| `recruit.png` | 新兵 | a very young recruit, uniform too new, nervous eyes |
| `straggler.png` | 掉队战士 | an exhausted soldier, snow on shoulders, hollow cheeks |
| `drummer.png` | 宣传员 | a bright-eyed young propagandist, mouth open mid-sentence, no megaphone |
| `captain.png` | 突击队长 | a wiry assault captain, cotton bandage on one forearm |
| `teacher.png` | 文化教员 | a soft-spoken teacher holding a twig, chalk dust on fingers |
| `wounded.png` | 担架伤员 | a wounded soldier half-sitting on a stretcher, leg wrapped in cloth |

## 3. 交付检查

- [ ] 全部图片**无文字、无字母、无水印**
- [ ] 色调与色板一致（纸黄 / 墨 / 红军红 / 金 / 青灰），无霓虹与过饱和
- [ ] 全景 1280 宽 JPEG q82；立绘 280×280 PNG
- [ ] 文件名与表格完全一致，落盘到 `changzheng/public/assets/scenes/` 或 `.../characters/`
- [ ] 更新 `changzheng/docs/ASSETS.md` 状态列
