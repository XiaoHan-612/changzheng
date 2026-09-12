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

## 四、质量红线（必检）

1. **图内不得出现任何文字/字母/水印/签名**（这是被反复强调的红线，JPEG 上也别留相机水印）。
2. 人物服装必须是 1934–1936 红军灰布军装：八角帽、绑腿、草鞋；**不出现现代织物、拉链、塑料、表、眼镜反光**。
3. 不描绘具体可辨认的真实历史人物面孔；不出现夸张英雄姿态与海报式构图。
4. 不出现血腥伤口；伤员用绷带与姿态表达。
5. 水的表现统一为"淡彩湿边"，不要玻璃质感或写实高光。
6. 全景图四周留 6% 安全区（热点是百分比定位，贴边会与 HUD 重叠）。

## 五、验收方式

1. 打开 `changzheng`，`npm start`，进入对应幕，确认背景加载且无拉伸/错位。
2. 检查浏览器控制台无 404。
3. 立绘：在对话屏看头像是否居中（`object-position: center top`，280×280）。
4. 全屏截图与既有图放在一起，色温/笔触应肉眼可分不出作者差异。
5. 在 `ASSETS.md` 把该行状态改为 ✅ 并注明日期。

## 六、可用脚本

```powershell
# 列出所有被代码引用的素材路径（确认命名一致）
cd changzheng
node -e "const fs=require('fs');const s=fs.readFileSync('public/index.html','utf8')+fs.readFileSync('public/js/main.js','utf8');console.log([...new Set(s.match(/\/assets\/[A-Za-z0-9_\-\/\.]+/g)||[])].join('\n'))"
```

> 图片本身不做版本管理以外的处理；如需批量压缩，**统一用 1280 宽、q82**，不要逐张调参数，否则风格会漂。
