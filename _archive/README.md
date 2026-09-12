# 归档区（只读参考）

这里存放历史版本与旧素材，**不要在此目录开发**。正式工程在 `../changzheng/`。

## 新旧路径对照

| 现路径 | 原路径 | 说明 |
|--------|--------|------|
| `demo-v1/` | `demo/` | 中间版本样品（783 行 `main.js`），已被 `changzheng/` 取代 |
| `sample/` | `竞赛题目，请完成，高要求/` | 赛题原文（`SUBMIT.md`）+ 最初演示样品（524 行 `main.js`） |
| `tests-artifacts/` | `tests/` | 根目录遗留的逐屏审查截图（旧版 UI） |
| `assets/scenes/*.png` | 同名 | 旧场景原画（现役素材已换为 `changzheng/public/assets/` 下的 jpg） |
| `assets/raw/generated-*.png` | 根目录 `generated-*.png` | AI 原始生成图；与 `assets/scenes/` 下的命名文件**逐字节相同**（SHA256 已验证），属冗余副本，确认后可删 |

## 备注

- `assets/ui/`、`assets/characters/`、`client/`、`server/`、`logs/` 是历史残留的空目录，git 不跟踪空目录
- 各快照里的 `node_modules/` 已被根 `.gitignore` 忽略，不会入库
- 赛题原文与样品代码里出现的 `demo/`、`竞赛题目，请完成，高要求/` 路径按当时结构书写，未回改
