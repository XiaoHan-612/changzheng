# 《长征·抉择》· 交接包

> 打包日期：2026-09-16 ｜ 共 **443 个文件 / 约 39.9 MB**（解压后）
> **文档 + 可直接运行的完整游戏源码，都在这一个文件夹里。** 先读这一份，再按需翻子目录。

---

## 30 秒上手

```bash
cd 08-游戏源码/changzheng
npm install        # 依赖没打进来，必须先装（生产只需 express；playwright 仅测试用）
npm start          # http://localhost:3001
```

**密钥要自己填**：`.env` 没打进包（里面有 Key）。把 `08-游戏源码/changzheng/.env.example`
复制成 `.env`，填上 `GLM_API_KEY`；或启动后在游戏内「设置」里填并点「测试连通」。

装完开这三个页面（**必须走服务**，直接双击 html 会白屏——它要取 `/js/...`、`/css/...`）：

| 页面 | 地址 | 用途 |
|---|---|---|
| **玩法平台** | `/dev/playground.html` | 27 支小游戏一页全玩，按幕分组、可筛选，每张卡写着「决策 / 失败」。深链 `?id=snow-grab` |
| **玩法调试台** | `/dev/minigame-lab.html` | 单支细调：实时契约面板、局内观测量、契约自检、减动效下真点击。深链 `?mini=mud-gomoku` |
| **游戏本体** | `/` | 标题 → 研学模式 → 五幕主线（单局 20–25 分钟） |

---

## 目录里都是什么

```
README.md                        ← 你正在看的这份（索引）

01-总览与说明/                    ← 先看这两份
  HANDOFF.md                      交接说明（总览：已完成 / 缺口 / 怎么验证 / 收尾清单）
  MINIGAMES-GUIDE.md              小游戏总览（27 支清单 + 怎么单独跑 + 怎么接线）
  README.md                       仓库根上的项目说明

02-玩法平台-网页/                  ← 两个页面的源码（08 里也有同一份，这里方便单看）
  playground.html                 玩法平台
  minigame-lab.html               单支调试台

03-本批重做-逐支交接包/            ← 2026-09-15/16 完成的 6 支，每支一份完整交接包
  HANDOFF-GOMOKU.md               泥地五子棋（mud-gomoku）
  HANDOFF-GRAB.md                 陡坡 · 拽住他（snow-grab）
  HANDOFF-LUDING.md               飞夺泸定桥 · 攀链（luding-chain）
  HANDOFF-PONTOON.md              夜搭浮桥（pontoon-night）
  HANDOFF-STRETCHER.md            担架急送（stretcher-run）——已被收拢取代，留作对照
  HANDOFF-RALLY.md                湘江东岸 · 收拢（rally-river）★ 本支

04-更早批次重做-逐支交接包/         ← 之前批次完成的 8 支（6 份文档）
  HANDOFF-FISHING.md              金色的鱼钩（goldenhook）
  HANDOFF-SANDTABLE.md            沙盘推演 · 往哪里走（wargame）※ 用户已叫停放投入
  HANDOFF-NEEDLE.md               弯针成钩（bendhook）
  HANDOFF-SCHOOL.md               夜校三支（nightschool / -quiz / -entry）
  HANDOFF-CANDY.md                分糖 · 红小鬼的三颗糖（candy-share）
  HANDOFF-SENTRY.md               夜岗 · 五个信号（sentry-watch）

05-收拢-源码与验收/                 ← 收拢这一支的三件套（08 里也有同样三份）
  minigames-rally.js              玩法本体（自包含、无 AI 调用）
  qa-rally.mjs                    专项验收脚本（42 项，约 40 秒）
  sim-rally.mjs                   难度模拟（8 套打法 × 4 种子，不烧模型）

06-工作记忆/                        ← 给下一次接手用的"底稿"（4 天全带）
  MEMORY.md                       项目长期备忘（铁律、口径、关键数字）
  2026-09-14.md / 15.md / 16.md   逐日工作日志（过程、踩坑的完整经过）

07-其他分工交接/                    ← 01/HANDOFF.md 顶部引用的那几份
  HANDOFF-CODE.md / HANDOFF-ART.md / HANDOFF-AUDIO.md

08-游戏源码/                        ← ★ 仓库根的镜像（下面这段照着真实目录写）
  changzheng/                      可运行工程本体（412 文件 / 39.3 MB）
    server/                        express 服务、/api/decide、契约表、JSONL 日志、二层配置
    public/js/                     主工程 + 16 个 minigames-*.js（含 14 支重做玩法）
    public/css/                    fonts → tokens → base → framework → components（纸墨设计系统）
    public/dev/                    playground.html + minigame-lab.html
    public/assets/                 56 个文件 / 11 MB（油画场景 + 立绘 + UI 底纹）
    public/audio/                  58 个文件 / 8.8 MB（ogg + wav）
    public/fonts/                  112 个文件 / 6.9 MB
    data/                          acts.json（五幕定义）、facts.json（史实卡）等
    tests/                         49 文件：unit(49 项) / e2e(Playwright) / manual(逐支 QA)
    scripts/                       13 个体检脚本（tokens / fonts / tone / handoff / assets …）
    docs/                          35 份工程文档（HANDOFF-* / ASSETS / DESIGN-SYSTEM / QA …）
    logs/                          只留 README.md + sample-full-run.jsonl（入库样本）
    tools/                         5 个美术/音频辅助脚本
    .env.example                   密钥模板（**.env 本身没打进包**）
  design/                          生图 prompt 链（asset-prompts.md、make-docx.js 等，4 文件）
  _archive/                        归档区只读参考 —— 只带了 README.md + grab-v1-2026-09-16/
                                   （收拢 v1 的 4 张截图 + 旧 minigames-grab.v1.js，留作对照）
  DESIGN.md                        策划案（markdown）
  README.md                        仓库根项目说明
  .gitignore / .gitattributes      仓库随附
  长征-抉择-设计方案.docx            策划案（Word，对外交付版）

09-策划与设计/                      ← 08 根上那两份的副本，方便单看
  DESIGN.md
  长征-抉择-设计方案.docx
```

> `02/`、`05/`、`09/` 都是**方便单看的副本**，权威来源在 `08/`。
> 这样安排是因为文档里用了相对路径（例如 `changzheng/docs/ASSETS.md` 引 `../../design/asset-prompts.md`、
> `changzheng/README.md` 引 `../长征-抉择-设计方案.docx`），把 `08/` 做成仓库根镜像后，
> **这些引用在包内照样点得开**。

---

## 关键数字（都以代码实测为准）

- **小游戏共 27 支** = 主线现行 8 + 未接线新玩法 5 + **重做·待接线 14**。
- **重做 14 支全部未接线**。其中 **本批完成 6 支**（见 `03/`），更早批次 8 支（见 `04/`）。
- **画作当场景**：本批 6 支里 **3 支**已从"自绘 SVG"切成"引用现成油画当底图"——
  `snow-grab`←`snow_climb.jpg`、`luding-chain`←`luding_bridge.jpg`、`rally-river`←`xiangjiang_night.jpg`。
- **AI 政策**：重做玩法**游戏内 0 次模型调用**（每支都是 `noAi: true`）。
  AI 只活在主线 `minigame_review` 的结算里；需要 AI 的玩法走 `decideWithin(payload, 10000)` 的 10 秒窗口，
  超时或失败就用本地固定内容。**用户定的口径：AI 不许影响体验，超过 10 秒就用作者写好的固定内容。**

---

## 怎么接着干

1. **想玩**：进 `08-游戏源码/changzheng`，`npm install` 后 `npm start`，开 `/dev/playground.html`。
2. **想细看某一支**：`/dev/minigame-lab.html?mini=<id>`，再配它那份 `HANDOFF-<NAME>.md`。
3. **想接线**（把重做版换进主线）：每支的 `HANDOFF-<NAME>.md` 里都有一节「接线」，
   典型是**一处改注册表 + 一处改 `acts.json` hotspot + 删旧的 `runXxx`**。
   **铁律：用户逐支点头之前，不要改 `acts.json` / `main.js` / `minigames.js` / 注册表。**
4. **想验收**：`npm run qa:<name>`（如 `qa:rally`）。命令清单见 `08-游戏源码/changzheng/docs/QA.md`。
5. **想改"玩法台账"**：要**三处一起改**——`public/dev/playground.html`（加 import + `DECIDES` 一行）、
   `docs/MINIGAMES-GUIDE.md`（清单与计数）、`docs/HANDOFF.md`（进度）。

---

## 这个包**有意没装**什么

| 排除了 | 规模 | 为什么 / 怎么补回来 |
|---|---|---|
| `node_modules/`（含 `_archive` 各快照里的） | 2664 文件 / **52.1 MB** | 依赖可重装，换机器还会不兼容 → `npm install` |
| `tests/e2e/artifacts/` | 262 文件 / **239.3 MB** | 历次 QA 的截图证据（PNG，压不动）→ 跑 `npm run qa:screens` / 各支 `qa:*` 会重新生成 |
| `logs/` 里的运行日志 | 10 文件 / **17.6 MB** | 运行产物，不入库；只留入库样本 `logs/README.md` + `sample-full-run.jsonl` |
| `_archive/` 的旧素材与旧快照 | 119 文件 / **66.2 MB** | `demo-v1/`、`sample/`、`assets/scenes/*.png`、`tests-artifacts/` 已被 `changzheng/` 取代，且**仓库自己的 `.gitignore` 就不要它们入库**；只留 `grab-v1-2026-09-16/` 快照 |
| **`.env`** | 2 文件 | **里面有 API Key，不能外带**。用 `.env.example` 填自己的 |
| **`runtime-config.json`** | 同上 | 同上（游戏内「设置」填的 Key 会落这里） |

加起来约 **375 MB** 被有意排除——这就是"整个仓库几百 MB、包只有 40 MB"的全部原因。

### 这个包**做过**一致性校验（2026-09-16）

- 把 `08-游戏源码/` 与仓库根**逐文件比对**：**413 个文件，大小不一致 0、内容不一致 0、包内多余 0**。
- 点名确认在场：`server/ai.js`、`public/js/minigames-registry.js`、`public/dev/playground.html`、
  `public/dev/minigame-lab.html`、`data/acts.json`、`docs/MINIGAMES-GUIDE.md`、`docs/HANDOFF.md`、
  `docs/QA.md`、`.env.example`、`design/asset-prompts.md`、`DESIGN.md`、`长征-抉择-设计方案.docx`、
  `_archive/grab-v1-2026-09-16/minigames-grab.v1.js` —— **全部 OK**。
- `minigames-*.js` 共 **16 支**：14 支重做玩法 + `minigames-registry.js` + `minigames-story.js`，全在。
- 泄漏扫描：包内**无** `.env`、**无** `runtime-config.json`、**无** `node_modules/`、**无** `artifacts/`。

---

## 注意事项

- **路径含中文和空格**，命令行里记得加引号（本机 `Remove-Item` 在中文路径上会失败，用
  `[System.IO.File]::Delete()` 或 `rm` 替代）。
- 本包里的 `playground.html` / `minigame-lab.html` 能单独读源码，但要跑就得放回
  `08-游戏源码/changzheng/public/dev/`。
- `06-工作记忆/MEMORY.md` 做过一次瘦身（46.5 KB → 18 KB）：**只留"下次必须照做"的规则与数字**，
  被压掉的逐日经过在 `2026-09-1x.md` 和各自的 `HANDOFF-<NAME>.md` 里，没有丢。
- **已知文档漂移（未修）**：`docs/MINIGAME-REFORM.md` 那份早期"总纲"的进度与现在的
  `MINIGAMES-GUIDE.md` 口径已不一致，**以 `MINIGAMES-GUIDE.md` 为准**。
- **仓库里有两个遗留目录**：`changzheng/.fish-shots/`（10 文件 / 1.6 MB）与
  `changzheng/.story-shots/`（5 文件 / 2.1 MB）——早期会话的 Playwright 截图/探针产物
  （`docs/HANDOFF-FISHING.md` 里提到 `.fish-shots/` 放着钓鱼的截图脚本）。
  **为了"镜像不缺件"，这次一并带上了**；它们不算项目内容，要不要从仓库里清掉由你定。
