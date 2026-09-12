# 归档区（只读参考）

这里存放历史版本与旧素材，**不要在此目录开发**。正式工程在 `../changzheng/`。

## 新旧路径对照

| 现路径 | 原路径 | 说明 |
|--------|--------|------|
| `demo-v1/` | `demo/` | 中间版本样品（783 行 `main.js`），已被 `changzheng/` 取代 |
| `sample/` | `竞赛题目，请完成，高要求/` | 赛题原文（`SUBMIT.md`）+ 最初演示样品（524 行 `main.js`） |
| `tests-artifacts/` | `tests/` | 根目录遗留的逐屏审查截图（旧版 UI） |
| `assets/scenes/*.png` | 同名 | 旧场景原画（现役素材已换为 `changzheng/public/assets/` 下的 jpg） |

## 版本管理范围

- **入库**：各快照的代码与文档（`*.js` / `*.mjs` / `*.html` / `*.css` / `*.json` / `*.md`）
- **不入库**：归档区的位图与音频（约 65MB）。它们已被 `changzheng/` 的素材取代，留在磁盘备查即可；
  需要纳管就删掉根 `.gitignore` 里 `_archive/**/*.png|jpg|jpeg|wav` 那四行
- 各快照里的 `node_modules/` 同样被忽略，不会入库

## 已清理

- 空目录 `client/`、`server/`、`logs/`、`assets/ui/`、`assets/characters/`、`sample/public/assets/chars/` 已删除
- 根目录 4 张 `generated-*.png` 与 `assets/scenes/` 下命名文件 SHA256 逐字节相同，冗余副本已删，原件保留在 `assets/scenes/`
- 赛题原文与样品代码里出现的 `demo/`、`竞赛题目，请完成，高要求/` 路径按当时结构书写，未回改
