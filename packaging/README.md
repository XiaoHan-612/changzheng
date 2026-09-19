# 桌面封装（打包成双击即玩的软件）

把 `changzheng/` 那份「Express 服务 + 静态前端」的工程，套一个**自带 Chromium 的窗口**，
做成一个不依赖 Node、不依赖浏览器、双击就能玩的便携软件。

> 这里**不改任何游戏代码**。玩法、数值、AI 调用、日志格式全部沿用原工程；
> 封装只做三件事：起服务、开窗口、把会写盘的东西指到 exe 旁边。

## 出成品（三件，按需打）

```powershell
cd packaging
node build.mjs             # ① 便携版目录：../dist/长征-抉择/
node build-singlefile.mjs  # ② 单文件版：../dist/长征-抉择-单文件版.exe（内含①②的全部数据）
```

①打完若要一个**压缩包**（便于传输，可选）：

```powershell
tar -a --options "zip:hdrcharset=UTF-8" -c -f ..\dist\长征-抉择-便携版.zip -C ..\dist 长征-抉择
```

> `--options zip:hdrcharset=UTF-8` 必须带上：Windows 自带 bsdtar 默认按系统代码页（简体中文 = GBK）
> 写 zip 文件名且不打 UTF-8 标记，别的系统解开会是乱码。`build-singlefile.mjs` 里已内置同样的
> 修复与复查（它内嵌的那份 zip 如果写成 GBK，启动器会读不出中文名、报「没找到 长征-抉择.exe」——
> 这个坑实测踩过一次，脚本现在会在压缩后立刻复查首条目编码）。

| 成品 | 怎么用 | 第一次打开 |
|------|--------|------------|
| `dist/长征-抉择/长征-抉择.exe` | 整个文件夹拷走，双击 exe | 直接进入标题页 |
| `dist/长征-抉择-便携版.zip` | 解压后同上 | 同上 |
| `dist/长征-抉择-单文件版.exe` | **只发这一个文件**，双击 | 先展开到 `%LOCALAPPDATA%\长征-抉择\app\`（带进度条，几秒），之后双击秒开 |

单文件版的玩家数据（配置 / 日志 / 审计 JSONL）在 `%LOCALAPPDATA%\长征-抉择\user-data\`，
换新版 exe 覆盖过去时会**自动重新展开**（按数据指纹判定），但 user-data 不会被冲掉。

### 包里不含任何 API Key

打包**故意跳过** `changzheng/.env`（那是个 gitignore 的本机文件，装着你的真 Key），
`build.mjs` 里还有一条硬断言：一旦发现包内出现 `.env` 就**直接中止打包**——宁可失败，也不出去一份带 Key 的成品。
所以这个包**发给谁、传到哪都不会泄漏 Key**。

代价是第一次打开要自己填 Key：

1. （推荐）游戏内「设置」页填 Key → 点「测试连通」确认能通 → 保存（写进 `user-data/runtime-config.json`）；
2. 或者自己往 `user-data/.env` 写一行 `GLM_API_KEY=你的Key`。

没填之前，AI 裁决会**明确报错**并给出原因与「重试」（本项目没有 MOCK 兜底，不会编造内容）。
接口地址与模型名默认已配好（`resources/app/changzheng/.env.example` 是模板，Key 为空）。

第一次跑 `build.mjs` 会自动从 npmmirror 下载 Electron 运行时（约 150 MB，缓存在
`packaging/.electron-cache/`，解压在 `packaging/electron-dist/`），之后重建是秒级。
要换镜像：`$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"`。

## 验收

```powershell
node verify-fast.mjs              # 日常门禁（几秒~十几秒）：默认验便携版
node verify-fast.mjs --single     # 验单文件版（不重展开）
node verify-fast.mjs --single --fresh   # 真实的"首次双击"：删掉展开结果重来一次
node verify-packaged.mjs          # 发布级全量验收（慢一些）：界面点着走过一屏 + 真调
```

`verify-fast.mjs` 回答四个问题（任一不过即封装有问题）：

1. **内容一致**：成品里的 `public/server/data` 与仓库工程**逐文件 sha256 相等**（单文件版在展开后比对）；
2. **能起来**：本地服务应答、`hasKey=true`、启动日志落在 user-data、单文件版有版本戳；
3. **资源齐**：index.html / JS / 场景图 / 环境音 OGG / 字体 / `data/*.json` 全部 200 且内容像样；
4. **前端与调用链**：真浏览器打开 → 标题页 → 行军 → 营地热点与行程节点都在、无 JS 报错；
   日志屏能开、导出按钮在位；直连 `/api/decide` 真调一次，通就核对 JSONL 审计落盘
   （本机到不了网关时只提示、不算失败）；导出接口 `/api/logs/export` 能下到原始 JSONL，
   越权文件名被 400 挡掉（比赛硬性要求：随时取证）。

`verify-packaged.mjs` 是更慢的发布验收：点一个热点、走完界面流程、等真调返回、核对审计日志；
支持 `VERIFY_EXE=...` 指定别的副本（例如「换台机器 / 换个目录照样能跑」的场景）。

## 成品目录长什么样

```
长征-抉择/
  长征-抉择.exe          Electron 运行时（由 electron.exe 改名而来）
  *.dll *.pak locales/   Chromium 运行时，全部自带
  长征-抉择.ico          图标（代码画的红星，见 make-icon.mjs）
  使用说明.txt           给玩家看的一页纸
  user-data/             运行时才写：配置、日志、审计 JSONL（删掉=恢复出厂）
  resources/app/
    main.js              外壳（起服务 / 开窗口 / 定端口 / 指配置目录）
    package.json         Electron 入口声明
    icon.png             窗口与任务栏图标
    changzheng/          原工程照搬：server / public / data / package.json / node_modules
                         （外加 .env.example 这份**不含 Key** 的模板；.env 永不入包）
```

单文件版 = 一个约 290 KB 的启动器（`launcher.cs`）+ 上述目录的 zip + 16 字节尾巴。
启动器只干一件事：首开时把 zip 展开到 `%LOCALAPPDATA%\长征-抉择\app\` 并拉起游戏，之后按版本戳跳过展开。

## 外壳做了什么（`main.js`）

| 事情 | 为什么 |
|------|--------|
| 先挑一个空闲端口，再 `import` `changzheng/server/index.js` | 原工程是「import 即 listen」的 ESM 模块；同进程启动，不用解析子进程 stdout 猜端口，也不会多出一个黑窗口 |
| 启动前设 `PORT` / `ENV_FILE` / `RUNTIME_CONFIG` / `LOG_DIR` | 这四项 `server/config.js` 在模块加载时就读走了，必须在 import 之前设 |
| 用户数据放 exe 同级的 `user-data/`，不可写才退回 `%APPDATA%` | 绿色版：配置与审计日志一眼可见、可随时拷走；装到 Program Files 也不会炸 |
| 窗口内容区固定 1280×800、无地址栏无菜单 | 与策划/自动化测试时的视口一致，看起来就是个软件而不是网页 |
| F11 全屏、F12 调试、外链丢给系统浏览器、单实例 | 桌面软件该有的基本行为 |
| 放开 autoplay 限制 | Chromium 默认「没有用户手势不放声音」，演示机上被静音一次就再也解释不清了 |
| 主进程 console 同时写 `user-data/启动日志.txt` | 打包后没有黑窗口，出了问题只能靠这个文件 |

## 加/改东西

- **换游戏内容**：改 `changzheng/` 里的东西，重跑 `node build.mjs`（和/或 `build-singlefile.mjs`）。
- **换 Electron 版本**：改 `build.mjs` 里的 `ELECTRON_VERSION`（或临时 `$env:ELECTRON_VERSION=...`）。
- **换图标**：改 `make-icon.mjs`（纯代码画图，不依赖任何图像库），或把现成 PNG 换进来。

## 已知取舍

- 打包 ≈ 400 MB，其中约 350 MB 是 Chromium 运行时 —— 这是「不依赖用户装什么浏览器」的代价。
- exe 没有代码签名，首次运行 Windows SmartScreen 会拦一下（「更多信息 → 仍要运行」），
  这一点写在 `使用说明.txt` 里了。要彻底消掉得买签名证书。
- **包里没有 Key**（有意的，见上一节）：发给别人时对方要自己填一把；你自己演示用的机器
  可以先把 `user-data/.env` 或设置页配好，之后换新版 exe 覆盖过去不会冲掉 user-data。
- 便携版目录里的 exe 文件图标目前是 Electron 默认图标：改 PE 资源需要 `rcedit` 这类工具；
  窗口/任务栏图标与单文件版的外壳图标已是自带的那颗红星。
