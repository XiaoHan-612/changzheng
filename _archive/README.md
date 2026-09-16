# 归档区（只读参考）

这里存放历史版本与旧素材，**不要在此目录开发**。正式工程在 `../changzheng/`。

## 新旧路径对照

| 现路径 | 原路径 | 说明 |
|--------|--------|------|
| `demo-v1/` | `demo/` | 中间版本样品（783 行 `main.js`），已被 `changzheng/` 取代 |
| `sample/` | `竞赛题目，请完成，高要求/` | 赛题原文（`SUBMIT.md`）+ 最初演示样品（524 行 `main.js`） |
| `tests-artifacts/` | `tests/` | 根目录遗留的逐屏审查截图（旧版 UI） |
| `assets/scenes/*.png` | 同名 | 旧场景原画（现役素材已换为 `changzheng/public/assets/` 下的 jpg） |
| `handoff-minigames-v1/` | 仓库根的 `长征-交接包/` | 同事玩法交接包**旧版**（文档 + 单支源码）——**整目录被 `.gitignore` 挡、不进仓库** |
| `handoff-minigames-v2/` | 仓库根的 `长征-交接包(1)/长征-交接包/` | 同事玩法交接包**新版**（含 14 支源码的完整检出，413 文件）——同样**不进仓库**；要接的东西已拷进 `changzheng/public/js/modules/games/src/` 与 `changzheng/docs/minigames/`（映射见 `changzheng/docs/MINIGAMES-INTAKE.md`） |
| `audio-toolchain/` | 仓库根的 `_oggpkg/` | 本机音频生成工具链（Python whl + 脚本）——**不进仓库** |
| `audio-poem-source/` | 聊天里给的朗诵下载件 | 终局朗诵的**原始下载文件**（平台名 `M500001cofo42JISSl.mp3`）。改名为 `qilv-changzheng.mp3` 的那一份**已随仓库走**，在 `changzheng/public/audio/poem/` |
| `audio-reactions-sandbox/` | `changzheng/public/audio/reactions/` | 随「自由行军沙盘」一起撤下的同伴反应音 6 条（该模式 2026-09-15 删除，无代码引用） |

## 版本管理范围

- **入库**：各快照的代码与文档（`*.js` / `*.mjs` / `*.html` / `*.css` / `*.json` / `*.md`）
- **不入库**：归档区的位图与音频（约 65MB）。它们已被 `changzheng/` 的素材取代，留在磁盘备查即可；
  需要纳管就删掉根 `.gitignore` 里 `_archive/**/*.png|jpg|jpeg|wav` 那四行
- 各快照里的 `node_modules/` 同样被忽略，不会入库

## 已清理

- 空目录 `client/`、`server/`、`logs/`、`assets/ui/`、`assets/characters/`、`sample/public/assets/chars/` 已删除
- 根目录 4 张 `generated-*.png` 与 `assets/scenes/` 下命名文件 SHA256 逐字节相同，冗余副本已删，原件保留在 `assets/scenes/`
- 赛题原文与样品代码里出现的 `demo/`、`竞赛题目，请完成，高要求/` 路径按当时结构书写，未回改
