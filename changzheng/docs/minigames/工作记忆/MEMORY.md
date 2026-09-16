# 项目长期备忘 · 《长征·抉择》

> **本文件只留"下次必须照做"的规则、铁律、口径、关键数字。**
> 逐日的经过与一次性排查过程在 `.workbuddy/memory/YYYY-MM-DD.md`；
> 逐支玩法的细节在 `changzheng/docs/HANDOFF-*.md`；玩法总览在 `docs/MINIGAMES-GUIDE.md`。

---

## 一、工程与入口
- 可运行工程只有一处：`changzheng/`。`design/` 是策划 docx 生成链，`_archive/` 只读参考。
- 工作区根 = 仓库根 = `长征 - 副本/长征`（`.gitignore` 在根上）。
- 起服务：`cd changzheng && npm start` → `http://localhost:3001`（`npm run dev` = `node --watch` 才热载）。
- 三个入口：
  - 玩法平台 `/dev/playground.html` —— 全部小游戏一页全玩，深链 `?id=snow-grab`；
  - 调试台 `/dev/minigame-lab.html` —— 单支细调（实时契约面板 / 局内观测量），深链 `?mini=mud-gomoku`；
  - 游戏本体 `/`（标题 → 研学模式 …）。
- `/dev/*` 已单独加 `no-store`（改完刷新即生效；`/` 仍是 1h 缓存）。

## 二、接口配置（2026-09-15 换成比赛网关）
- `.env`：`GLM_API_URL=http://111.32.22.35:32592/mgate/v1/chat/completions`、`GLM_MODEL=glm-5.1`、
  `GLM_REASONING_EFFORT=low`（**必须设**：同一条 prompt 不设 24.8s、设 low 8.2s）、`TIMEOUT_MS=45000`。
- `runtime-config.json` 现在是 `{}`（**不覆盖** `.env`）。在游戏内「设置」填的地址/模型/Key 会落进它并**压过 `.env`**
  → 排查"接口报错但 `.env` 明明是对的"**先看它**。
- 这把 Key **只能调 `glm-5.1`**（glm-5.3-flash / glm-4-plus / glm-4-air / glm-4-flash 全 403）。
- **`/api/decide` 成败都返回 HTTP 200**，错误只体现在响应体 `source` 与 `logs/ai-calls-<日期>.jsonl`。
  → "测试全绿但游戏卡住"就去日志里数 `source=ERROR`。
- 连通性手工命令：`npm run check:glm`。

## 三、AI 延迟真相与「10 秒窗口」（项目级口径）
- 网关地板：极小请求也要 **9s**；叙事类 prompt 19–64s；判词约 100 字 53–64s。
  **时间几乎全花在隐藏推理上，与输出长度无关** —— 压 prompt／压输出救不回来。
  `completion_tokens` 常撞 `max_tokens` → 截断 → 空 JSON → 重试翻倍。
- 用户口径：**AI 不许影响游戏体验；超过 10 秒就用作者写好的固定内容。**
  不是"不用 AI"，而是"能用就用、慢了就固定"——玩法本身必须不依赖 AI 也能完整玩。
- 落地三件套：① 名单/课本这类"内容生成"走**固定池**（手写 + 纯函数闸 + 单测守着）；
  ② 模型调用一律 `decideWithin(payload, 10000)` —— **计时器与请求 `Promise.race`**，
  只传 `AbortSignal` 不够硬（假接口会无视它，12s 的迟到响应照样把固定内容顶掉）；
  ③ 每条 AI 文本都配一份固定兜底。
- 客户端 abort 之后**服务端那一调仍会跑完并落日志** → `logs/` 里的调用数 > 玩家实际用到的数。
- **"AI 太慢"的第一嫌疑永远是僵尸请求**（别先怀疑模型）：`TIMEOUT_MS 90s × MAX_RETRIES 2 ≈ 181s`，
  而前端 10s 就放弃 → 服务端空烧；玩家一重试再叠一个 → "越用越慢"。
  真凶是 `/api/decide` **没把断连往下传**（缺 `req.on('close')`，也没把 signal 交给上游）。
  诊断三连：聚合日志算中位耗时/`source` 分布/`attempts` → 拉时间轴看并发积压与"越后越慢" → 直接打网关分离变量。

## 四、玩法（minigame）线
- **三条线**：主线注册表 `public/js/minigames-registry.js` → `public/js/minigames.js`（8 支，已进主线）；
  未接线新玩法 `public/js/minigames-story.js`（5 支）；精修·单独开发 `public/js/minigames-<name>.js`（各一支，自包含）。
- **铁律**：精修版在用户点头前**不改** `acts.json` / `main.js` / `minigames.js` / 注册表。
- **新玩法一律用新 id**（如 `snow-grab` 而不是 `grab`）—— 调试台 `specOf` 按 id 查表，撞 id 会取到旧那份。
  但**注册表里已有的 id 不要改**（`needle`/`fishing` 等被 5 个既有用例按名字找）
  → 用 `container.dataset.mini = opts.id || '<新id>'` 留口子，接线时把注册表 id 传进去。
- **四点硬契约**：① 签名 `runXxx(container, opts) -> Promise<{score, detail, summary?}>`；
  ② `container.dataset.mini` / `miniState`；③ 操作元素带 `[data-mini-action]`；
  ④ 离开板屏自清（动画/定时器/`window` 监听，`setInterval` 里查 `container.isConnected`）。
  时序类玩法另需暴露内部量（`miniAim`/`miniShell`/`miniPos`…），否则脚本没法对时。
  结算时只 `disabled` 不够，**必须 `removeAttribute('data-mini-action')`**。
- **对外观测面必须"同一时刻一齐可见"**：只在 rAF 里同步、界面却同步改 → 自动化会"读答案点上一题"/读到 `NaN`。
  → 抽 `writeDataset()`，末尾同步调一次。
- **待做前置**：① 抽 `playMinigame` 公共壳（现 9 份 32–45 行样板各写一遍）；
  ② 判定抽纯函数 + 单测（`minigames.js` 1133 行至今零单测）。

## 五、「游戏总结包」= 三份文件（2026-09-16 定的）
用户说"**总结包 / 说明**"就指这三份；**改玩法台账要三处一起改**：
1. `public/dev/playground.html` —— 玩法平台。新玩法要 import + 解构 + `push(...,'refined')` + `DECIDES` 加一行。
2. `docs/MINIGAMES-GUIDE.md` —— 小游戏总览（全清单 / 计数 / 命令表 / 验收数字 / 画面路线）。
3. `docs/HANDOFF.md` —— 交接说明（顶部指针 / §二 进度 / §五 关键文件）。
- **数字以代码实数为准**：清点一次 = playground 的 `window.__pg.CAT`。
  **2026-09-16 实测 27 支 = main 8 + story 5 + refined 14。**
- 改完跑 `npm run qa:handoff`（`scripts/check-handoff.mjs`）—— 注意它**不检查**上面这三份，
  只查 HANDOFF-ART/AUDIO/TTS/立绘与代码是否一致。三份的一致性得靠 playground 实测（起服务 + chromium 读 `__pg.CAT`）。
- **"交接包"（可下载的整个文件夹 + zip）默认要含可运行源码**，并**排除"可重生成 + 带密钥"**：
  `node_modules/` / `tests/e2e/artifacts/`（QA 截图，239 MB）/ `logs/` 运行日志 /
  **`.env` 与 `runtime-config.json`（含 Key，绝不外带）**。纯文档包必须**明说**是文档包。
  实测：`changzheng/` 310 MB → 剔完 **29.5 MB / 383 文件**。
- **落点**：仓库根 `长征-交接包/` + `长征-交接包.zip`（顶层 `README.md` 是索引）。
  **打 zip 用 Python `zipfile`** —— PowerShell 的 `Add-Type` 被安全策略拦，
  而 `Compress-Archive` 在 PS 5.1 下对中文条目名易出乱码；Python 会写 UTF-8 名并置标志位。
- **两个遗留目录**：`changzheng/.fish-shots/`、`changzheng/.story-shots/`
  （早期会话的临时截图与探针，3.7 MB）—— 已从包里排除，仓库里仍在。

## 六、重做进度与画面路线
- **14 支重做版全部未接线**。本批（2026-09-15/16）完成 **6 支**：
  `mud-gomoku` · `snow-grab` · `luding-chain` · `pontoon-night` · `stretcher-run` · `rally-river`
  （`rally-river` 顶掉 `stretcher-run`：act1 已有两支"抬着人跑"，重复）。
  更早批次 8 支：`goldenhook` / `bendhook` / `nightschool`×3 / `candy-share` / `sentry-watch` / `wargame`。
- **画面路线 = 画作当场景**。用户两次否掉自绘 SVG 后定死：**板屏底图直接用该幕的过场油画**
  （主线 `doGrab()` 早就 `openBoard({ bg: sceneImage('/assets/scenes/…') })`），
  覆盖层只允许 绳 / 标记环 / 踏脚孔 / 风雪 / 雪痕 / 暖光 / 文字。
  本批 6 支里 **3 支**已切过去：`snow-grab`←`snow_climb.jpg` · `luding-chain`←`luding_bridge.jpg` ·
  `rally-river`←`xiangjiang_night.jpg`。**新增玩法先 `ls public/assets/scenes/`（36 张）+ 查 `openBoard` 的 `bg`，再决定要不要画。**
- **四支骨架不得重复**（用户验收标准）：陡坡 v3 = 连续拉锯 · 泸定 v2 = 互斥姿态排程 ·
  浮桥 = 空间配平 · 收拢 = 离散回合判断。
- 用户节奏：**一支没收尾不要另开一支；一次只端出一支，等验收、不接线。**

## 七、玩法设计的四条铁律（都是被实测推翻过的）
1. **预算必须与最优线等长**。收拢初版 9 刻（最优线 8 刻）→ 多出的 1 刻**白送一次误判**，
   `clue` 四局全满分、失败边被抹平；收到 **8 刻**才分叉。
2. **失败的边必须由时间画，不能由配额画**。收拢初版的"小组"配额把贪搜玩家**卡住**搜不动、
   反而**被迫**去渡 —— 越浪费越安全。配额整个删掉，只留"刻"一本账。
3. **"手快只有坏处"的自动推进 = 砍掉一个决策**。浮桥原来"搭满即自动渡河"→ 玩家越手快越没余料
   → 改成玩家自己点「部队上桥」（桥没搭完 `disabled` 且**不挂** `data-mini-action`，否则"起手元素数"会漂）。
4. **设计算术要手算一遍，且下限要能算出来**。浮桥"正确打法在数学上不可能通关"：
   搭满 12 段 = 15 板、最坏要 6 块加固料，而 `PLANK_CAP` 原为 18 → 只够一次半。
   弯针同理：100° 满温一次只够弯 168°、目标 236° → 数学上必须烧两次火。
- **设计范式**：先找**两条以上互相牵制的资源**，再让"资源的再生"本身有代价
  （弯针：再次回火 +3.5 酥；收拢：搜一次耗一刻）→ 取舍是被迫发生的，不是玩家自己找的活。

## 八、视觉 / 坐标 / "画面对不对"
1. **坐标系要看"定位父级"，不看你想的那个**（夜校 P0）：`.smini3-row` 挂在木牌里的 `lit` 层，
   代码却按**舞台坐标**写 `left` → 每个字被推 93px 到木牌外，**玩家把光打在看得见的字上、
   判定中心却在别处**，六种打法全 0.000 而页面零报错。
   → 凡"绝对定位 + 多层嵌套定位父级"，都要有一条 **"看见的位置 = 判定的位置"** 的断言。
2. **CSS 作画顺序**：屏内 `*-bg` 是 `position:absolute`，会盖住 static 的内容盒 → **内容盒必须自提 position/z-index**。
   曾因 `.tpl-board .tpl-body` 漏了这行，在 `prefers-reduced-motion: reduce` 下 8 个玩法**全点不动**。
3. **canvas 上"设计 px"≠屏幕 px**：画布设计宽 720 而内容宽 570 → 缩放 0.79，写死 `10px` 只剩 **7.9px**；
   叠加 `--font-num` 的汉字落到宋体 → 笔画断 = "糊"。
   → 字高按 `fpx = 目标屏幕字号 / viewScale` 反算；小字 font stack 换 `Microsoft YaHei`/`PingFang SC`。
   交付前量一次 `ctx.measureText('火').width * viewScale`，**< 11 就是糊的**。
4. **"页面不报错 + 流程正常收尾"完全不能说明画面是对的**。定妆金消失、整根钩画到画布外 ——
   两个缺陷都是零报错、分数正常。**只有独立的画面断言能抓到。**
5. **数像素可用 `getImageData`（模型看不了截图），但同色族光靠色比分不开**：
   "金钩"与"炉火"同族；夜岗的照亮字与金涟漪同族。**判据必须"色比窗口 + 取样框"两条一起用，并配对照组。**
   （本支成品 693 个金像素 / 两组对照 0、0；缺陷在时读数 0 → **检出能力被验证过**。）
6. **别用瞬时 phase 决定"画成什么样"**：定妆跑完 phase 变 `done` → 金褪成铁。要用**持久状态**判断。
7. **canvas 坐标要分清"屏幕坐标"与"变换层里的局部坐标"**（`translate()` 之后的层再喂屏幕坐标会被叠加平移）。
8. **判"文字有没有被裁"只有两条路**：原生分辨率裁那一行，或量 `scrollWidth > clientWidth`。
   在缩放后的整屏图上看到的"缺字"是假的（那是调试台左右栏）。
9. **给"连续移动中的角色"做采样，必须先保证它在采样窗口里不会离开被测对象**
   （泸定：板落在段界前 0.1m，直起身一帧就迈过去）。修法**不是等更久，是先走到段中间**。

## 九、验证纪律（比"跑法"更值钱）
- **【红线】小改动不许重跑全量验收脚本。** 用户为此发过火，原话：
  "**你要测试的话，你自己去测试游戏，不要走里面的全量测试。**"
  → 改哪儿测哪儿；只验一件事就写**十几秒的临时脚本**，跑完即删；全量脚本**一天一次**（交接口径那次）；
  要给全量脚本加断言，**先在快检脚本里验通，再一次性贴进去**（别靠"跑全量→看红→改"调试）。
- **写完断言要临时撤掉修复跑一遍，确认它真会红**；还要**证伪"这条断言测的是不是它该测的东西"**
  （收拢 F2 数的是画作**撕纸边** `x<6%`，而画里那堆火在 `x≈45%`）。**一条永远绿的断言等于没写。**
- **"值取反"只能靠有向断言拦**（"值取错范围"靠范围断言）；且判据**要能从常量表读方向当场比对**，
  别写死某个下标 —— 排序反过来之后，同一个错法会"正好对"。
- **"元素变灰了"必须说清它排除了哪种错**：冷却类要验三段（刚点灰 / 硬直结束后仍灰 / 到点亮）。
  旧的"150ms 内灰"放过了"`SWAP_CD` 声明了却从没赋值"这个缺陷。
- **`dataset` / DOM 读出来一律是字符串**（`"0" === 0` 为 `false`）→ 先 `Number()`；
  **断言报红先怀疑断言自己。**
- **玩法"到底活没活"三条检查**：① 整轮 `pageerror` = 0；
  ② 安静对局（只 boot、不点任何键）要能推进；③ **操作行不能每帧重建**（`page.click` 会拿到 detach 节点）。
  第 ③ 条附：排查"点不到"先在页内打 `elementFromPoint` 命中结果（能命中就不是遮挡，是节点在被换）。
- **"常量声明了却从没赋值"要专门 grep 一遍**（`SWAP_CD`、`renderSegs._sig`）。
- **别用 `click({force:true})`**：它把"元素被遮挡"整类缺陷屏蔽掉。
- **观测窗口 < 一次 Playwright 往返 → 整段搬进一次 `page.evaluate`**（零往返），驱动用元素自身 `.click()`。
- **判定"能不能点"必须在真游戏流程里测**（走 `__czScreens.mini`），**不要手工注入 DOM**
  （手工注入没有入场动画的 transform 残留，会得出与真实相反的结论）。
- **计数要跟玩法本体对齐，别抄**（浮桥"起手作用元素"是 15 不是 3：12 个桥段各自也算）。
- **门禁**：`layout-audit`（820/1280 零缺陷）· `lint-tokens`（零字面量）· `lint-frames`。

## 十、驱动纪律
- **驱动一律自适应**：每轮重看状态（"还缺哪段、手里几块料"），够就点、不够就等。
  写死顺序 + 单次点击 + 见不对就 `break`，会把健康玩法表现成"六项同时红"（浮桥就是这么被误判的）。
- **判据看状态序列**：序列缺哪一环，就往哪一环的上游找
  （浮桥 C9 实得 `rig/done/anchor`，`cross` 从没出现 → 根因是桥没搭满）。
- **策略/断言自己也会错，而且长得像"这玩法太简单"**：先问"**哪些信息是玩家真的知道的**"。
- **重开一局要带令牌**（`__gBoot`），否则被拆那局的 `detached` resolve 会覆盖新局读数。
- **多步玩法**：上一题的反馈留在屏幕上**必须标出处**（"上一个（脚步）：…"），否则看起来像在说当前这个。

## 十一、环境坑
- **"取输出"的姿势每轮都可能变（别照抄旧笔记）**：2026-09-15 记的是"PowerShell 读不出 stdout → 用 bash"；
  **2026-09-16 收尾那轮反了** —— bash shim 整片坏掉（`dirname/ls/grep` 全 `command not found`，
  连它自己的 env 脚本都跑不动），PowerShell 能跑但 **stdout 不回传**。
  → **一律"写文件 + 用 Read 读文件"**（`"x" | Out-File -Encoding utf8 $p`）。
- **PowerShell `Remove-Item` 删不掉中文路径**：环境把删除接进回收站（safe-delete），
  非 ASCII 路径上 `trash` 失败并 **fail-closed**（文件原样还在）。
  → 用 **`[System.IO.File]::Delete($abs)`**（先 `[System.IO.File]::Exists`），删没删用 **Glob** 复核；
  **别用 `-ErrorAction SilentlyContinue` 吞错**（正是它让"删了其实没删"静默过了一轮）。
- **`browser.close()` 后面不能紧跟 `process.exit()`**：进程永不退出，外层报 `EXIT=124`，看着像"挂死"；
  还会叠出僵尸 node，`sim && qa && shot` 这类串联**永远走不到第二段**。两种正确收尾：
  ① 硬退定时器**注册在 `close()` 之前**：`setTimeout(finishExit, 4000); browser.close().then(finishExit, finishExit);`
  ② **干脆不 close**：`try { browser.process()?.kill('SIGKILL'); } catch {} process.exit(0);`
  （⚠️ `chromium.launch()` 返回的 `browser` **没有 `.process()`** —— 那是旧 API，临时脚本别踩。）
- **长跑一律丢后台 + 分级落日志到文件**：管道会给 node 的 stdout 做块缓冲，不到进程退出看不到任何进度
  → 极易误判成卡死。前台 bash 超 ~2–3 分钟会被 SIGTERM 且**日志为空**。
- **判"跑完没跑完"看日志里的汇总行（`【全绿】`/`【有红】`/`【看门狗】`），不要看退出码或任务状态。**
- **脚本要挂三道硬退**：看门狗 + `unhandledRejection` + `uncaughtException`。
  顶层 `await` 抛错在默认 `--unhandled-rejections=throw` 下**不走** `unhandledRejection`
  → 只挂两道时，一个 `ReferenceError` 会让整轮脚本**只剩两行表头就消失**（进程没了、日志一行错都没有）。
- 浏览器类用例硬编码 `channel:'chrome'`，**本机没有 Google Chrome** → 临时写 `--import` 预载模块拦
  `chromium.launch` 注入 `%LOCALAPPDATA%\ms-playwright\chromium-1223\chrome-win64\chrome.exe`
  （headless 用 `chromium_headless_shell-1223\…\chrome-headless-shell.exe`）。**用完即删，别留在仓库里。**
  **别在后台回归还没跑完时另起浏览器实例**（抢资源挂死）。
- `node --check` 对含 `import` 的 `.js` 会按 CJS 解析报错 → 先 `cp` 成 `.mjs` 再 check。
- `/tmp` 在 Windows 上解析成 `D:\tmp`，临时文件别写 `/tmp`。

## 十二、文档口径
- 对外只按"一款普通的长征叙事游戏"呈现；合作方与行业场景口径只放 `PITCH.md` / `SCORING.md`。
- 权威验收数在 `docs/HANDOFF.md` §二 的结果行（unit 49 · board 57 · motion 16 · e2e 76 次调用）。
- 验收命令清单 `changzheng/docs/QA.md`；每轮收尾清单 `docs/HANDOFF.md` §六；
  玩法总览 `docs/MINIGAMES-GUIDE.md`，玩法流程与坑 `docs/MINIGAMES.md`。
