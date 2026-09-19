# tools/ —— 工程辅助脚本

**没有一个会在游戏运行时被加载**——它们只在"改工程"的时候按需手工调用。
运行时该跑的东西在 `scripts/`（值守卫与生成物，挂 `npm run …`）。

| 文件 | 用途 | 什么时候动它 |
|------|------|--------------|
| `build-fonts.mjs` | **字体子集化**：按字符集从字体源裁出五族（正文宋 / 对白楷 / 标题毛笔 / 档案明朝 / 数字 Garamond），写出 `public/fonts/` 与 `public/css/fonts.css` | 界面新增了字库外的字（`qa:fonts` 报缺字）→ 跑 `npm run fonts:build` |
| `intake-minigames.mjs` | **同事玩法收料**：把 `modules/games/src/minigames-*.js` 的四处缝合点（音频→事件 / 数值签→宿主 / 模型→流程层注入 / 收尾→`onExit`）重接一遍，**幂等**；`--check` 只核不改 | 拿到新一版玩法：`npm run intake:minigames` / `npm run intake:minigames:check`（口径见 `docs/MINIGAMES-INTAKE.md`） |
| `font-charset-authored.txt` | **手工维护**的字符集（"我想要哪些字"） | 加字先改这里，再跑 `fonts:build` |
| `font-charset.txt` | 上一条 **+ 源码里扫出来的字**的并集，构建脚本的输入 | 由 `build-fonts.mjs` 生成，别手改 |
| `font-manifest.json` | 字体产物清单：字符 → 分片文件映射（运行时按需加载分片） | 由 `build-fonts.mjs` 生成，别手改 |
| `token-baseline.json` | `qa:tokens` 的**字面量基线**（颜色/字号/圆角的存量清单） | 只在**有意**改动设计令牌时手工维护（见 `docs/DESIGN-SYSTEM.md`） |
| `build-portable.mjs` | 早期「便携文件夹 + 便携 Node + `start.bat`」路线的构建器 | **未采用**，留档参考。现行交付形态是 [`../../packaging/`](../../packaging/README.md)（Electron），取舍见 [`../docs/DELIVERY.md`](../docs/DELIVERY.md) §二 |
| `patch-waitbtn.mjs` | 一次性补丁：给 `flow/games-flow.js` 里"刚说过话就该等一次确认"的位置插 `await waitBtn('继续')` | 已用完、留档；改玩法节奏时**对照它的规则**，别直接跑（它会就地改源码） |

> 约定：工具只读工程文件、只写自己的产物；产出的字体与清单**提交进仓库**（`npm start` 不需要构建步骤）。
