# 手工 QA 脚本

这些是开发期用的**一次性可视化排查脚本**，不会被 `npm test` 调用。
运行前需要先起服务（`npm start`，默认 http://localhost:3001），且机器上装有 Chrome（Playwright `channel: 'chrome'`）。

| 脚本 | 用途 |
|------|------|
| `framework-proof.mjs` | `npm run qa:proof` — 把区块四态 + 7 个整页模板 + 亮度对照渲成 `framework-proof.png`，改框架时看这一张 |
| `screen-sheet.mjs` | `npm run qa:screens -- <批次>` — 按批把页面截成统一尺寸并拼成 `screen-sheet-<n>.png`，同时写逐页纸面占比；加 `--width 820` 出窄屏版（`screen-sheet-<n>-820.png`，不写占比） |
| `qa-hud.mjs` | `npm run qa:hud` — 顶栏 3 倍特写 + 逐元素量字体/字号/颜色/对比度，排查数值与顶栏排版 |
| （页面）`public/dev/audio.html` | 浏览器打开 `http://127.0.0.1:3001/dev/audio.html` — **音频试听页**：按通道列出环境床/BGM/音效/台词，每行显示它现在用文件还是合成兜底，可逐个点播、顺序试听、切静音，并实时回显 `__czAudio.state()`（人耳验收声音的第一入口） |
| `win-ocr.ps1` | `powershell -File tests/manual/win-ocr.ps1 -Path <图> -Out <txt>` — **截图 OCR（带坐标）**：Windows 自带 OCR，输出每行文字 + 位置（`y= x= w= | 文字`），给"平台把图省略掉"的 agent 当眼睛用；读 GitHub 页面/报错弹窗/游戏界面这类**文字截图**够用，也能判断元素靠左还是靠右 |
| `audio-listen.mjs` | `node tests/manual/audio-listen.mjs [--keep-open]` — **音频试听驱动**：开一个可见的 Chrome，按 ①标题静音 ②营地环境床 ③点热点音效 ④台词语音 ⑤静音 3 秒 ⑥取消静音立即恢复 的顺序放一遍并打印状态，给有耳朵的人逐个确认（无头浏览器没有音频输出，听感只能靠人；`--keep-open` 放完不关窗） |
| `qa-board.mjs` | `npm run qa:board` — 玩法板体检：8 个玩法逐屏摆到板屏上，验板屏壳（题名/数值签）、玩法关键元素、契约标记与"第一步能不能点"，离开板屏是否清干净 |
| `qa-motion.mjs` | `npm run qa:motion` — 动效体检：量计算样式，确认五个标准效果真的挂上、逐条入场延迟正确、减动效偏好下位移关掉 |
| `qa-screens.mjs` | 逐屏截图 + 量各屏边界，排查布局溢出 |
| `diag-av-stall.mjs` | 影音审计卡死现场诊断：跑同一套驱动，卡住时 dump 可见屏 / 热点状态 / 行动点 / toast，用来分清"是界面状态没跟着变"还是"驱动走错了路"（2026-09-13 热点一次性化后用上过） |
| `qa-quiz.mjs` | 单独渲染「知识对决」屏，检查选项排版 |
| `qa-end.mjs` | 单独渲染终局面板，检查信息密度 |
| `qa-css.py` | 历史补丁脚本（用于批量改写上面脚本的路径），已用完，保留备查 |

截图输出到 `tests/e2e/artifacts/`。
