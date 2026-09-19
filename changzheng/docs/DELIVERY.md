# 封装交付方案（路演/答辩）

> 目标形态：**一个文件，双击就跑，不装 Node、不装浏览器、不连开发机**。
>
> **现状：已落地。** 封装在 [`../../packaging/`](../../packaging/README.md)，产出两件：
> ① 便携版目录 `dist/长征-抉择/`（整个文件夹拷走即用）② **单文件版 `dist/长征-抉择-单文件版.exe`**（对外只发这一个）。
> 操作口径（怎么出成品、怎么验收）以 `packaging/README.md` 为准；**本文记录为什么这么做、封装改了什么、发布口径是什么。**
>
> 历史：早期还写过一条「便携文件夹 + 便携 Node + `start.bat`」的路线，脚本留档在
> [`../tools/build-portable.mjs`](../tools/build-portable.mjs)。**它不是现行交付形态**（那条路仍要求目标机器有浏览器，
> 窗口也还是网页的样子）；两种路线的取舍见 §二。

## 一、跑起来到底需要什么

| 项 | 源码态 | 说明 |
|---|---|---|
| 运行时 | Node ≥ 18 | **封装后不需要**：Electron 自带 Node 与 Chromium，玩家只要一个 exe |
| 依赖包 | `express`（+ 开发期 `playwright`） | 封装包只带生产依赖，不含 playwright |
| 静态资源 | `public/` 约 27MB（字体 / 音频 / 场景 / 立绘 / 事件图 / 代码） | 全部本地文件，无 CDN；五族中文字体随包分发，换机器字形不变 |
| 配置 | `.env` → `runtime-config.json` → 环境变量（后者覆盖前者） | 源码态在项目根；**封装后在 `user-data/`**：便携版是 exe 同级的 `user-data/`，单文件版是 `%LOCALAPPDATA%\长征-抉择\user-data\`。设置界面写入 `runtime-config.json`（明文存 Key，本机文件）。**发布包里不含任何 Key**，见 §三 第 4 条 |
| 端口 | `CONFIG.PORT`，默认 3001 | 源码态被占用会起不来；**封装后由外壳先挑一个空闲端口**再拉起服务，不会撞端口 |
| 日志 | `logs/ai-calls-<日期>.jsonl` + 8MB 轮转（运行产物，不入库） | 封装后落在 `user-data/logs/`；仓库里另有一份入库样本 `logs/sample-full-run.jsonl` 供离线查看 |
| 网络 | **必需** | AI 调用走网关；已删 MOCK，断网即报错并写 `source=ERROR` |

## 二、三种封装形态与实测结论

| 方案 | 产物 | 结论 |
|---|---|---|
| A. 便携文件夹（便携 Node + `start.bat`） | `星火微光…/` ＝ `node.exe` + `server/` + `public/` + `data/` + `start.bat` | **未采用**。改素材最方便，但形态仍是"网页"：要开浏览器、有地址栏、窗口不像软件。脚本留档在 [`../tools/build-portable.mjs`](../tools/build-portable.mjs) |
| **B. Electron 桌面包（现行）** | 便携目录 `dist/长征-抉择/` + 单文件版 `dist/长征-抉择-单文件版.exe` | **采用**。自带 Chromium：双击即软件、无地址栏菜单、F11 全屏、窗口/任务栏图标与单实例都是桌面软件该有的行为。代价是体积（≈400MB，其中约 350MB 是 Chromium） |
| C. Docker 镜像 | `docker run` | 未采用：现场要装 Docker，答辩机上有风险 |
| （早期评估）pkg / Node SEA 单文件 exe | 一个 exe | 未采用：静态资源要重做路径解析（工程全靠 `__dirname` 相对定位），收益远小于踩坑成本。**现在的"单文件版"不是这条路**——它是「启动器 + 内嵌 zip」，见 §五 |

一句话结论：**换壳（Electron）比"把工程塞进一个 exe"划算**——工程一行不改，素材照旧落盘即生效，
只是把"浏览器的窗口"换成"软件的窗口"。

## 三、封装落地清单（每条对应 `packaging/` 里的实现）

1. **启动器**：`packaging/main.js` 同进程 `import` `changzheng/server/index.js`（不用解析子进程 stdout 猜端口、也不会多出一个黑窗口）；
   `packaging/launcher.cs` 是单文件版的外壳（首次展开 + 拉起游戏）。
2. **端口**：外壳先挑一个空闲端口，**再**设 `PORT` / `ENV_FILE` / `RUNTIME_CONFIG` / `LOG_DIR` 并 import 服务端
   —— 这四个值 `server/config.js` 在模块加载时就读走了，必须赶在 import 之前设。
3. **写盘位置**：配置与日志放 exe 同级的 `user-data/`；该目录不可写（例如装进 `C:\Program Files\`）时退回 `%APPDATA%`。
   删掉 `user-data/` ＝ 恢复出厂。
4. **Key 策略：包内一把 Key 都不带**。打包**故意跳过** `changzheng/.env`，`build.mjs` 里还有一条硬断言
   ——包内一旦出现 `.env` 就直接中止打包；`resources/app/changzheng/` 里只放 `.env.example` 这份**Key 为空**的模板。
   玩家第一次打开在游戏内「设置」里填自己的 Key（写进 `user-data/runtime-config.json`），或自己往 `user-data/.env` 写一行。
   没填之前 AI 裁决会明确报错并给「重试」（没有 MOCK 兜底）。这样无论包发给谁、传到哪，都不会泄漏你的 Key（见 [`HANDOFF.md`](HANDOFF.md) §七点七）。
5. **离线兜底**：**仍然没有**（项目彻底删除了 MOCK）。风险预案见 [`OFFLINE-REPLAY.md`](OFFLINE-REPLAY.md)，**未开发**。
6. **依赖裁剪**：包内只含生产依赖（express），不含 playwright。
7. **验收**：`packaging/verify-fast.mjs`（成品与仓库工程逐文件 sha256 相等 + 起得来 + 资源齐 + 前端与调用链通）
   与 `packaging/verify-packaged.mjs`（发布级，慢一些）；`--single --fresh` 用真实的"首次双击"验单文件版。

## 四、发布口径

- **对外只发单文件版**：`dist/长征-抉择-单文件版.exe` 作为 **GitHub Releases 的附件**。
  产物**不入仓库**（`dist/` 被 `.gitignore` 挡），仓库里只保留脚本与说明。
- **附件里没有 Key**（`build.mjs` 的硬断言保证）：首次运行必须由使用者自己填 Key；发布说明里要写明这一点。
- 便携版目录与 zip 是**内部/现场**用：现场演示直接双击 `dist/长征-抉择/长征-抉择.exe`，不依赖解压工具。
- **没有代码签名**：首次运行 Windows SmartScreen 会拦一下（「更多信息 → 仍要运行」），这写在成品里的 `使用说明.txt`。
- **素材来路的红线对成品同样成立**：包里的 BGM / 音效 / 朗诵是外部素材，**对外发布前要换**（见 [`HANDOFF.md`](HANDOFF.md) §七点二）。

## 五、成品长什么样

```
dist/长征-抉择/
  长征-抉择.exe          Electron 运行时（由 electron.exe 改名；图标已换）
  *.dll *.pak locales/   Chromium 运行时，全部自带
  长征-抉择.ico            图标（代码画的红星，见 make-icon.mjs）
  使用说明.txt            给玩家/评委看的一页纸（含 SmartScreen 提示）
  user-data/             运行时才写：配置、日志、审计 JSONL（删掉 = 恢复出厂）
  resources/app/
    main.js              外壳（起服务 / 开窗口 / 定端口 / 指配置目录）
    package.json         Electron 入口声明
    icon.png             窗口与任务栏图标
    changzheng/          原工程照搬：server / public / data / package.json / node_modules
                         （另有 .env.example 模板，Key 为空；.env 永不入包）

dist/长征-抉择-单文件版.exe   一个约 290KB 的启动器（launcher.cs）+ 上面那套目录的 zip + 16 字节尾巴
```

单文件版首次运行会展开到 `%LOCALAPPDATA%\长征-抉择\app\`，玩家数据留在 `%LOCALAPPDATA%\长征-抉择\user-data\`；
换新版 exe 覆盖过去时会按数据指纹**自动重新展开**，`user-data` 不会被冲掉。

> 体积：打包目录 ≈ 400MB（其中约 350MB 是 Chromium）；单文件 exe ≈ 185MB。
> 都是 `.gitignore` 之外的东西，不进仓库。

## 六、顺序建议（历史结论，已兑现）

素材 → 数值与内容打磨 → **再封装**。
理由：封装不改变玩法，但会把"改文件即生效"的便利换成"重新打包"，所以它应该是最后一步。
现状正是如此：`changzheng/` 的内容仍在迭代，**改完重跑一次 `node build.mjs`（和/或 `build-singlefile.mjs`）即可**，
封装脚本本身不用动（要换 Electron 版本或图标才动 `build.mjs` / `make-icon.mjs`）。
