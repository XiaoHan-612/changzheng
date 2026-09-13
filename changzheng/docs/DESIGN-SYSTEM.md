# 设计系统 · 战地手记

> 方向：**内容层是米黄做旧纸上的墨字，界面骨架是压暗的墨色，让插画透出来**。
> 插画是水墨淡彩 + 做旧纸，所以界面用同一套材质与色温；冷灰玻璃拟态一律不再使用。
> 遵循规则由脚本强制：`npm run qa:tokens`（不许新增字面量）、`npm run qa:fonts`（零回退）。

## 一、字体（五族自托管，跨机一致）

仓库原先没有任何字体文件，全靠系统字体栈——`Songti SC` 是 macOS、`SimSun` 是 Windows、Linux 全无，
同一份代码在三台机器上是三套字形。现在五族字体随包分发，**由 `tools/build-fonts.mjs` 生成**。

| 角色 | 族名 | 字体 | 覆盖口径 |
|---|---|---|---|
| 正文叙事、史实条目 | `serif` | Noto Serif SC 400/600 | 全字符集 |
| 对白、说话人、选项、标签 | `kai` | LXGW WenKai（霞鹜文楷 SC）400 | 全字符集 |
| 幕名、章节大标题、落款 | `display` | Ma Shan Zheng（毛笔楷）400 | 自撰字符集 |
| 史实回响、档案标签 | `archive` | ZCOOL XiaoWei（明朝）400 | 自撰字符集 |
| 数字、单位、英文 | `num` | EB Garamond 400/600 | 拉丁子集 |

- **字符集**：仓库自撰文本 ∪《通用规范汉字表》一级 3500 ∪ 日志里 AI 实际用字，落到 `tools/font-charset.txt`
  （全量约 3820 字）；`tools/font-charset-authored.txt` 是界面固定文案用的自撰集（约 1270 字）。
- **零回退**：每族的 CSS 回退链第二位都是**我们自己的 `serif`**，某族偶有缺字（如霞鹜文楷没有弯引号）
  会落到自带宋体而不是系统字体。`npm run qa:fonts` 逐字校验覆盖并做浏览器端抽样。
- **豁免**：emoji 与装饰符号（← ↑ → ↓ ↕ ♥ ⚠ ✓ ✗ 🎙 🔇 🔊）由系统彩色字体渲染，明确列为豁免并单独报告。
- **体积**：110 个 woff2，约 6.9MB（正文 1.6 / 对白 4.3 / 毛笔 0.6 / 明朝 0.5 / 数字 0.03）。
- **许可**：全部 OFL，可随包分发；出处与版权见 `public/fonts/README.txt`。
- **加载**：`public/css/fonts.css` 在 CSS 链首位，`font-display: swap`；`/fonts` 长缓存 7 天。
  （字体按 unicode-range 切片，逐文件 preload 无意义，故不做 preload。）

重新生成：`npm run fonts:build`（从 jsDelivr 与 Google Fonts 按字子集接口拉取，产物提交进仓库，`npm start` 无需构建）。

## 二、Tokens（`public/css/tokens.css` 是唯一来源）

- **纸**：`paper-0/1/2`、`paper-edge`、`rule`（墨线）、`rule-strong`
- **墨**：`ink-0/1/2`（文字）、`ink-bg/ink-bg-2`（压在插画上的骨架）、`ink-line`
- **强调**：`seal`（印章朱红）、`seal-bright/deep`、`gold`（旧金）
- **语义**：`risk-low/mid/high`、`ok`、`bad`
- **材质**：`paper-tex`（复用 `echo_paper.jpg`）、`crease`（折痕）、`grain`（纸纹）、四档投影
- **间距**：`sp-1..7`＝4/8/12/16/24/32/48
- **排版阶**：`fs-display/h1/h2/h3/body/label/micro`、`lh-tight/normal/loose`、`ls-title/label`
- **层级**：`z-bg/hud/sheet/overlay/toast`
- **动效**：`dur-fast/base/slow`、`ease-out`、`ease-stamp`

## 三、组件规范（同一语义必须复用同一类）

| 类 | 用途 | 规则 |
|---|---|---|
| `.paper-surface` | 内容面（面板、纸卷、手记、回响） | 米黄纸 + 纸纹 + 折痕；文字 `ink-0` |
| `.ink-surface` | 压在插画上的骨架（HUD、顶栏） | 暖墨半透明；文字 `paper` |
| `.paper-tag` | 数值签、状态签 | 纸底墨字，2px 圆角 + 轻投影 |
| `.rule-ink` | 分隔线 | 1px `rule` |
| `.seal-mark` | 印章、钤记 | 朱红描边圆形，仅小面积 |
| `.btn` / `.btn.primary` / `.btn.ghost` | 纸片 / 印章 / 幽灵 | 纸面里的按钮用纸片态；朱红只给"确认类"动作 |

排版角色：标题位用 `display`，说话人与选项用 `kai`，长叙事用 `serif`，数字用 `num`（`tabular-nums`）。

## 四、无障碍与一致性判据

- 正文墨字对纸底对比度 ≥ 7:1，次级 ≥ 4.5:1（`qa:tokens` 与人工核对共同保证）。
- 浮层打开时隐藏底层纸面（`body.overlay-open`），只保留插画背景——否则纸压纸会糊成一片。
- 焦点环：2px 墨色描边；`prefers-reduced-motion` 下禁用位移与钤印动画。
- **一致性由 lint 强制**：颜色/字体/圆角不许写死；债务只减不增（`tools/token-baseline.json`）。

## 五、逐页打磨进度（25 页 · 6 批）

| 批 | 页面 | 状态 |
|---|---|---|
| 1 | 标题页、怎么玩、设置、过场 | ✅ 已完成（见 `screen-sheet-1.png`） |
| 2 | 营地、手记、史实、岔路 | ⏳ 待做 |
| 3 | 舞台对话、抉择、回响、篝火菜单 | ⏳ 待做 |
| 4 | 钓鱼+弯针、夜校、分糖、夜岗 | ⏳ 待做 |
| 5 | 五子棋、泸定桥、陡坡、自由行军沙盘 | ⏳ 待做 |
| 6 | 答题、夜间、终局、记录/答辩 | ⏳ 待做 |

每批交付：该批代码 + `qa:tokens` 无新增 + 1280/820 截图 + 联系表 `screen-sheet-<n>.png`。
命令：`npm run qa:screens -- <批次号>`、`npm run qa:tokens`、`npm run qa:fonts`。
