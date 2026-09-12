# 手工 QA 脚本

这些是开发期用的**一次性可视化排查脚本**，不会被 `npm test` 调用。
运行前需要先起服务（`npm start`，默认 http://localhost:3001），且机器上装有 Chrome（Playwright `channel: 'chrome'`）。

| 脚本 | 用途 |
|------|------|
| `qa-screens.mjs` | 逐屏截图 + 量各屏边界，排查布局溢出 |
| `qa-quiz.mjs` | 单独渲染「知识对决」屏，检查选项排版 |
| `qa-end.mjs` | 单独渲染终局面板，检查信息密度 |
| `qa-css.py` | 历史补丁脚本（用于批量改写上面脚本的路径），已用完，保留备查 |

截图输出到 `tests/e2e/artifacts/`。
