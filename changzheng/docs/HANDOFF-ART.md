# 交接说明 · 美术（给生图模型）

> 你只负责**产图**，不需要改代码。产出后落盘到指定路径、更新 `ASSETS.md` 状态列即可。
> 逐行 prompt 见 [`design/asset-prompts.md`](../../design/asset-prompts.md)（已含统一前缀与负面词）。
> 清单与现状见 [`ASSETS.md`](ASSETS.md)。

## 一、必须遵守的风格锁

**统一前缀**（所有图都要带，来源：策划案 §0.4）

```
Chinese watercolor historical illustration, aged paper texture, muted palette #E8DCC8 #2C2416 #8B2E2E #C4A35A, no text, no watermark, no modern objects
```

**负面词**

```
photorealistic, 3d render, neon, cyberpunk, lens flare, text, letters, watermark, logo, signature, modern clothing, modern vehicles, oversaturated colors, gore, heroic poster pose, anime
```

**色板**：纸黄 `#E8DCC8` · 墨 `#2C2416` · 红军红 `#8B2E2E` · 金 `#C4A35A` · 青灰 `#5C6B73`。

**时段光线**：整套图统一「暮色 / 侧光」，雪山用冷灰蓝、营火用暖橙点缀，避免正午顶光。

## 二、规格与落盘

| 类别 | 生成 | 导出 | 路径 |
|---|---|---|---|
| 全景 `*_pano` | 1536×1024 | 1280 宽 JPEG **q82** | `changzheng/public/assets/scenes/` |
| 近景 `*_close` / 事件图 | 1536×1024 | 1280 宽 JPEG q82 | `changzheng/public/assets/scenes/`（沙盘事件图放 `assets/events/`） |
| 立绘 | 1024×1024 | **280×280 PNG**，脸心居中偏上 | `changzheng/public/assets/characters/` |
| UI 底纹 | 1024×1024 | PNG/JPEG | `changzheng/public/assets/scenes/` |

命名**必须**与 `design/asset-prompts.md` 表格一致（小写下划线），前端按文件名直接引用。

## 三、本轮优先级

| 顺序 | 文件 | 说明 |
|---|---|---|
| P0 | `sentry_night.jpg` | 夜岗小游戏，当前用 `camp_pano.jpg` + CSS 暗角占位 |
| P0 | `sugar_close.jpg` | 分糖小游戏，当前用 `camp_pano.jpg` 占位 |
| P0 | `snow_climb.jpg` | 雪山陡坡（拉人时机），当前用 `snow_pano.jpg` 占位 |
| P1 | `snow_camp.jpg`、`snow_let_clothes.jpg` | 把第四幕雪山日做扎实 |
| P1 | `luding_bridge.jpg`、`jinsha_ferry.jpg` | 泸定桥小游戏与渡口 |
| P2 | 其余 13 张场景 + 10 张立绘 | 按 ASSETS.md 清单推进 |

## 四、落盘即生效（不用改代码）

前端对下列文件做了「存在就用、不存在退回占位图」的探测（`sceneImage()`，boot 时预热）。
**把文件按表格里的名字放进 `public/assets/scenes/`，刷新页面就生效**，不需要任何代码改动：

| 文件名 | 生效位置 |
|---|---|
| `sentry_night.jpg` | 夜岗小游戏 / 夜哨热点 |
| `sugar_close.jpg` | 分糖小游戏 |
| `snow_climb.jpg` | 雪山陡坡（拉人）与「扶他一把」抉择 |
| `snow_camp.jpg` | 第四幕第 1 日（雪山日）营地全景 |
| `snow_let_clothes.jpg` | 幕前「让棉衣」抉择 |
| `luding_bridge.jpg` | 飞夺泸定桥小游戏 |
| `luding_run.jpg` | 第三幕过场第二帧（`acts.json` 的 `cutAlt`） |
| `depart_crowd.jpg` | 开场过场第二帧（`cutAlt`）+ 于都河「母亲」交谈 |
| `xiangjiang_night.jpg` | 第一幕过场第二帧（`cutAlt`） |
| `xiangjiang_wreck.jpg` | 湘江「沉默的老兵」交谈（热点 `img` 字段） |
| `zunyi_room.jpg` | 遵义「小楼门口」交谈（热点 `img` 字段） |
| `map_route.jpg` | 手记（回望）面板底图，叠在手记上（会压一层深色渐变保证可读） |
| `echo_paper.jpg` | 史实回响面板底纹，叠在回响卡上（同上） |
| `jinsha_ferry.jpg` | 「今夜能不能渡」抉择 |
| `map_desk.jpg` | 「往哪里走」抉择 |
| `depart_bridge.jpg` | 开场「怎么过河」抉择 |
| `lazikou_cliff.jpg` | 「腊子口怎么打」抉择 |
| `huining_flag.jpg` | 「会师」抉择 |
| `xiangjiang_bridge.jpg` | 「护送伤员过封锁」抉择 |
| `zunyi_street.jpg` | 「一封密信」抉择 |
| `huining_crowd.jpg` | 会宁「数一数熟面孔」 |

其余 13 张（`depart_crowd`、`xiangjiang_wreck`、`xiangjiang_night`、`zunyi_room`、`luding_run`、`snow_climb` 之外的雪山图、`map_route`、`echo_paper` 等）落盘后**需要一行代码接入**，位置见 `HANDOFF-CODE.md` 的模块地图。

**立绘同样落盘即生效**：`public/assets/characters/` 下按约定名放就能自动替换文字头像（`main.js` 的 `PORTRAIT_FILE` 映射 + 启动预热）：
`mother`（母亲）· `xianggui`（老乡）· `guide`（向导）· `boatman`（船工）· `recruit`（新兵）· `straggler`（掉队战士）· `drummer`（宣传员）· `captain`（突击队长）· `teacher`（文化教员）· `wounded`（担架伤员）——10 张已接线，规格 280×280 PNG、脸心居中偏上。

### 自检命令（产图后跑一次）

```powershell
cd changzheng
npm run qa:assets
```

输出会列出：已就位图片 / 待生成图片 / 已就位环境床 / 合成兜底环境床，并验证已就位的图浏览器能解码。**只要某张图出现在「已就位」里，它就已经在游戏里生效了。**

## 五、质量红线（必检）

1. **图内不得出现任何文字/字母/水印/签名**（这是被反复强调的红线，JPEG 上也别留相机水印）。
2. 人物服装必须是 1934–1936 红军灰布军装：八角帽、绑腿、草鞋；**不出现现代织物、拉链、塑料、表、眼镜反光**。
3. 不描绘具体可辨认的真实历史人物面孔；不出现夸张英雄姿态与海报式构图。
4. 不出现血腥伤口；伤员用绷带与姿态表达。
5. 水的表现统一为"淡彩湿边"，不要玻璃质感或写实高光。
6. 全景图四周留 6% 安全区（热点是百分比定位，贴边会与 HUD 重叠）。

## 六、验收方式

1. 打开 `changzheng`，`npm start`，进入对应幕，确认背景加载且无拉伸/错位。
2. 检查浏览器控制台无 404。
3. 立绘：在对话屏看头像是否居中（`object-position: center top`，280×280）。
4. 全屏截图与既有图放在一起，色温/笔触应肉眼可分不出作者差异。
5. 跑 `npm run qa:assets`，确认新图出现在「已就位」里。
6. 在 `ASSETS.md` 把该行状态改为 ✅ 并注明日期。

## 七、可用脚本

```powershell
# 列出所有被代码引用的素材路径（确认命名一致）
cd changzheng
node -e "const fs=require('fs');const s=fs.readFileSync('public/index.html','utf8')+fs.readFileSync('public/js/main.js','utf8');console.log([...new Set(s.match(/\/assets\/[A-Za-z0-9_\-\/\.]+/g)||[])].join('\n'))"
```

> 图片本身不做版本管理以外的处理；如需批量压缩，**统一用 1280 宽、q82**，不要逐张调参数，否则风格会漂。
