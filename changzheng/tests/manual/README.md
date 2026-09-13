# 手工 QA 脚本

这些是开发期用的**一次性可视化排查脚本**，不会被 `npm test` 调用。
运行前需要先起服务（`npm start`，默认 http://localhost:3001），且机器上装有 Chrome（Playwright `channel: 'chrome'`）。

| 脚本 | 用途 |
|------|------|
| `framework-proof.mjs` | `npm run qa:proof` — 把区块四态 + 7 个整页模板 + 亮度对照渲成 `framework-proof.png`，改框架时看这一张 |
| `screen-sheet.mjs` | `npm run qa:screens -- <批次>` — 按批把页面截成统一尺寸并拼成 `screen-sheet-<n>.png`，同时写逐页纸面占比；加 `--width 820` 出窄屏版（`screen-sheet-<n>-820.png`，不写占比） |
| `qa-hud.mjs` | `npm run qa:hud` — 顶栏 3 倍特写 + 逐元素量字体/字号/颜色/对比度，排查数值与顶栏排版 |
| `qa-board.mjs` | `npm run qa:board` — 玩法板体检：五个玩法逐屏摆到板屏上，验板屏壳（题名/数值签）、玩法关键元素、契约标记与"第一步能不能点"，离开板屏是否清干净 |
| `qa-motion.mjs` | `npm run qa:motion` — 动效体检：量计算样式，确认五个标准效果真的挂上、逐条入场延迟正确、减动效偏好下位移关掉 |
| `qa-screens.mjs` | 逐屏截图 + 量各屏边界，排查布局溢出 |
| `diag-av-stall.mjs` | 影音审计卡死现场诊断：跑同一套驱动，卡住时 dump 可见屏 / 热点状态 / 行动点 / toast，用来分清"是界面状态没跟着变"还是"驱动走错了路"（2026-09-13 热点一次性化后用上过） |
| `qa-quiz.mjs` | 单独渲染「知识对决」屏，检查选项排版 |
| `qa-end.mjs` | 单独渲染终局面板，检查信息密度 |
| `qa-css.py` | 历史补丁脚本（用于批量改写上面脚本的路径），已用完，保留备查 |

截图输出到 `tests/e2e/artifacts/`。
