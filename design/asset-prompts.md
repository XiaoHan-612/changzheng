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

## 1. 本轮必需（3 张，新玩法用）

| 文件名 | 用途 | 中文描述 | 完整 prompt（前缀 + 主体） | 尺寸 | 验收 |
|---|---|---|---|---|---|
| `sentry_night.jpg` | 夜岗小游戏 / 夜哨热点 | 暗夜营地边缘的哨位，树线剪影，一名年轻战士持枪侧身，远处一点将熄的火光 | `Chinese watercolor historical illustration, aged paper texture, muted palette #E8DCC8 #2C2416 #8B2E2E #C4A35A, no text, no watermark, no modern objects` + `, a lone young Red Army sentry standing at the dark edge of a camp, silhouetted treeline, faint dying campfire glow far behind, deep night blues and warm ember accents, heavy vignette, quiet tension, 1935 Sichuan grassland` | 1280 宽 JPEG q82 | 无文字水印；暗部不糊成一团；能看出"哨位+树线" |
| `sugar_close.jpg` | 分糖小游戏 | 火光下摊开的手掌里三颗包着纸的糖，背景两名年轻战士虚影 | `...prefix..., close-up of an open young soldier's palm holding three small paper-wrapped candies, warm campfire rim light from below, two blurred young comrades watching in the background, shallow depth of field, tender restrained mood` | 1280 宽 JPEG q82 | 糖纸不出现文字；手部不畸形 |
| `snow_climb.jpg` | 雪山陡坡（拉人时机） | 暴风雪中的陡雪坡，一只手下探抓住另一只手腕，风雪横吹 | `...prefix..., steep snow slope in a blizzard, one soldier reaching down to grip another's wrist, wind-blown snow streaking sideways, pale grey-white palette with a single dark red armband accent, no faces in focus` | 1280 宽 JPEG q82 | 手部结构合理；无血腥 |

## 2. 后续补齐 · 场景（18 张，策划案 §11.1）

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

## 3. 后续补齐 · 立绘（14 张）

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

## 4. 交付检查

- [ ] 全部图片**无文字、无字母、无水印**
- [ ] 色调与色板一致（纸黄 / 墨 / 红军红 / 金 / 青灰），无霓虹与过饱和
- [ ] 全景 1280 宽 JPEG q82；立绘 280×280 PNG
- [ ] 文件名与表格完全一致，落盘到 `changzheng/public/assets/scenes/` 或 `.../characters/`
- [ ] 更新 `changzheng/docs/ASSETS.md` 状态列
