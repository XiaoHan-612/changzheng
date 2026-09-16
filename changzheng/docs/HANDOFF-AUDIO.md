# 交接说明 · 音频与语音（给音频/TTS 模型）

> 你只负责**产音频**。三条产线：**① 环境床 ogg ② 操作音效 ③ 固定台词 TTS**。
> 固定台词的**精确文本、哈希文件名、音色建议**已在 [`TTS-MANIFEST.md`](TTS-MANIFEST.md) 里列好，照表产出即可。
> 代码侧接口已就绪，不需要改代码：`POST /api/tts` + 音频框架（`public/js/audio/`，见 [`AUDIO-SYSTEM.md`](AUDIO-SYSTEM.md)）。

## 一、三层架构（策划案 §2.6.1）

| 层 | 内容 | 触发 | 目标形态 |
|---|---|---|---|
| 环境床 | 风、篝火噼啪、江水、雪风、夜虫 | 进场景自动 crossfade | 循环 ogg，15–30s；**文件响度按 −24 LUFS 左右出**（代码侧的元素音量已按实测抬到 0.7，见 `docs/AUDIO-SYSTEM.md` §六——素材若更轻，听起来会像"没有声音"） |
| 操作音效 | 点击热点、抛竿、起竿、翻页、回响盖章、答对/答错、行军鼓点 | 本地即时 | ≤0.4s，wav/mp3，音量 0.5–0.8 |
| 人声 TTS | 同伴关键台词、史实回响标题句、新玩法开场句 | 模型/固定文本后异步播放 | 单声道 wav，16k/22.05kHz，≤80 字 |

**当前状态**（2026-09-13）：**8 条环境床全部就位**（真正的 Ogg Vorbis，24.4s 可循环，见 `ASSETS.md` 第四节）；操作音效仍是 WebAudio 合成（`public/js/audio.js`，能听但质地粗糙）；预录台词 21 条 + 反应音 6 条；**TTS 缓存 20 条全部就位**。整仓 55 个音频文件逐个通过体检（`npm run qa:audio` → `AUDIO-REPORT.md`），运行时另由 `qa:av` 复核（0 资源失败、环境床 8/8 真的 `play()` 成功、TTS 全部可解码）。

**唯一还没做的产线是 BGM（§六）**——需求与规格已写死，等额度恢复后产出即可。

## 二、产线 ① 环境床（ogg）

### 落盘即生效（不用改代码）

代码里有 `kind → 文件` 的映射（`public/js/audio.js` 的 `AMBIENT_FILE`）：
**把文件按下面第二列的名字放进 `public/audio/ambient/`，刷新页面就生效**。
回退链是 **`.ogg`（首选，体积约 WAV 的 1/10）→ 同名 `.wav` → WebAudio 合成**：
模型只产出 WAV 也能直接播（放在同一目录、用同名 `.wav`），但**交付首选 Ogg Vorbis**；
容器必须与扩展名一致，否则服务器会发出错误 MIME。`.wav` 已被 `.gitignore` 忽略，避免仓库被 10 倍体积占掉。
文件不存在或播放失败会自动回落到合成，流程完全不受影响。
目录已建好（含 `.gitkeep`）。自检：`npm run qa:assets`（会列出「已就位环境床 / 合成兜底环境床」）。

| 游戏内场景 | 落盘路径（文件名固定） | 说明 | 时长 |
|---|---|---|---|
| 开场·于都河 | `public/audio/ambient/depart_river.ogg` | 河水 + 夜虫，克制 | 20–30s 可循环 |
| 一幕·湘江 | `public/audio/ambient/xiangjiang_wind.ogg` | 远炮闷响（很轻）+ 风 + 江水 | 20–30s |
| 二幕·遵义 | `public/audio/ambient/zunyi_rain.ogg` | 雨声 + 室内静（可加极轻木楼吱呀） | 20–30s |
| 三幕·金沙江 | `public/audio/ambient/jinsha_rapids.ogg` | 急流 | 20–30s |
| 三幕·泸定桥 | `public/audio/ambient/luding_iron.ogg` | 铁索风 + 对岸火力余响 | 20–30s |
| 四幕·雪山日 | `public/audio/ambient/snow_wind.ogg` | 雪风，高频风声 | 20–30s |
| 四幕·草地日 | `public/audio/ambient/grass_fire.ogg` | 风 + 火，水汽感 | 20–30s |
| 五幕·会宁 | `public/audio/ambient/huining_low.ogg` | 低人流嘈杂 + 远号，**不抢人声** | 20–30s |
| 兜底（幕轴上找不到的场景） | `public/audio/ambient/wind.ogg` | 通用风床：新场景还没配声音时的底噪，**别太有辨识度**（它会被用在意料之外的地方） | 20–30s |

要求：首尾各留 200ms 静音便于循环；无音乐性旋律（避免情绪过载）；响度 -24 LUFS 左右。

## 三、产线 ② 操作音效

**落盘即生效（批 3 起）**：`public/audio/sfx/<name>.ogg` 按名字放进目录就自动顶替合成音，
**不用改任何代码**（`.wav` 也认得，按同名约定）。现有名字与用途：`click` 点击 · `cast` 抛竿 ·
`hook` 起竿 · `splash` 入水 · `echo` 回响盖章 · `correct` 答对 · `wrong` 答错 · `march` 行军鼓点 ·
`day` 新的一日。缺文件时走合成兜底（能听但粗糙），`npm run qa:audio` 会列出"还在用合成"的有哪些；

现有合成音效名（保持一致，替换时同名覆盖即可）：`click`、`cast`（抛竿入水）、`hook`（起竿）、`splash`、`echo`（回响盖章）、`correct`、`wrong`、`march`（行军鼓点）、`day`。

新增建议：`sentry_step`（脚步由远及近）、`sentry_growl`（野兽低吼）、`chain_clank`（铁索）、`snow_step`（踩雪）。

要求：短促、不卡通滑稽；音量做峰值归一（-3dBFS 峰值）；不要带混响尾巴（场景音床已有空间感）。

## 四、产线 ③ 固定台词 TTS

**清单**：[`TTS-MANIFEST.md`](TTS-MANIFEST.md)（20 条，含精确文本与目标文件名；改台词后以 `npm run tts:manifest` 的产物为准）。

**命名规则**（必须严格一致，否则不会被命中）：

```
文件名 = sha1(voiceId + "|" + text) 取前 16 位  +  "_" + voiceId + ".wav"
落盘   = changzheng/public/audio/cache/
```

改了文本就重跑：`cd changzheng && npm run tts:manifest`（会更新状态列与哈希）。

**⚠ 两条必须遵守的对接规则**（都踩过）：

1. **台词文本必须与代码里 `say()` 的字符串逐字一致**。清单里的文本是前端真实会说的句子；
   如果代码改了句子而清单没跟着改，文件会生成但永远命中不到（实测曾出现 21/24 条白做；现在 `qa:handoff` 会拦住清单不同步）。
2. **音色由 `voiceId` 决定，不能用中文角色名**。前端 `audio.speak()` 会用 `ACTOR_VOICE` 映射表把
   「突击队长 → captain」这类对应关系补齐；清单里的 `voiceId` 就是最终哈希用的那个值。
   验收：`npm run qa:tts` 会逐条 POST `/api/tts` 确认命中，并检查文本是否真的能在代码里找到。

**音色映射（全项目固定，角色不换音色）**

| 角色 | voiceId | 气质 | 参考台词 |
|---|---|---|---|
| 旁白 / 史实回响 | `narr` | 克制、像翻史书 | 「你刚经历的，和真实发生过的，往往只隔着一层时间。」 |
| 老班长 | `laoban` | 低、慢、少话有力 | 「漂相看真了再起竿。晃是假的，沉才是口。」 |
| 指导员 | `zhiyuan` | 讲理、耐心 | 「宁可多走十里，也别把人陷进去。」 |
| 红小鬼 | `xiaogui` | 倔、快、心软（少年声） | 「我腿不软。就是夜里冷。」 |
| 卫生员 | `weisheng` | 轻、稳 | 「先按住伤口，别动。」 |
| 哨兵 | `sentry` | 压着嗓子、警觉 | 「后半夜归你。听不清就再听一遍。」 |
| 突击队长 | `captain` | 短促、有劲 | 「桥板被人抽了，铁索还在。」 |
| 船工 / 老乡 | `guide` | 热、土、谨慎（可轻微方言） | 「夜里能渡，跟着我的桨声走。」 |
| 宣传员 | `drummer` | 清亮、不喊口号 | 「前面就是江，过了就是路。」 |

## 五、代码侧接口（已实现，无需改动）

```text
POST /api/tts
  body: { text, voiceId, actorId }
  resp: { ok:true, url:"/audio/cache/<hash>_<voiceId>.wav", source:"CACHE" }
      | { ok:true, url:null, source:"NONE", reason:"no-cached-voice" }   ← 没生成就静默降级
```

```js
// 前端调用（已接好）：命中顺序 = 预录 wav → TTS 缓存 → 静默
audio.speak({ text: '……', voiceId: 'laoban', actorId: 'laoban' })
```

**已存在的预录台词**（21 条，`public/audio/voices/` + 索引 `voice-lines.json`）：老班长 hello/hook/soup、指导员 hello/path/grass、红小鬼 hello/home、卫生员 care、文化教员 school、船工 night、向导 lazikou、母亲 bye、湘江老兵 xj、新兵 msg，以及旁白 `narr_act_open/narr_echo/narr_night/narr_quiz/narr_rally/narr_snow`。这些不用重做。

### 五点半、语音的"回声"与控制（批 A，2026-09-15）

语音通道现在会把自己在干什么**发到总线上**，不再"发射后不管"（细节见 [`AUDIO-SYSTEM.md`](AUDIO-SYSTEM.md) §六点一）：

```text
voice:start    {durationMs}       开始出声（0 = 元数据还没到）
voice:progress {t, duration}      约 10Hz；t = 已播毫秒 ← 终局升华逐字跟读的唯一时钟
voice:ended    {interrupted}      播完 / 被打断 / 出错三条路都发
voice:stop     （反向请求）        跳过升华时连音频一起停
```

对配音侧只有一句要求：**音频多长都行，流程一定跟着它走**。等待上限按 `时长 × 1.2 + 3s` 自适应
（硬顶 90s），所以整段朗诵几十秒不会被截断；**音频缺失时逐字退化成固定节奏**，红线「不放音频也不阻塞流程」照旧。

另外修了一处静默故障：没有音色时前端回落算的 id 与服务端 `/api/tts` 的默认曾是两个值（`'narr'` vs `'default'`），
缓存名（`sha1('音色|文本')`）会分岔、永远命不中——现在 `qa:audio` 会核对这两处。

## 六、产线 ④ BGM（章节/场景各不同）——**已就位 8 首（2026-09-16）**

> 需求（用户 2026-09-13 确认）：不只是台词有声音，整体要有背景音乐，且不同章节、不同场景不一样。

**文件与命名**（与 `AMBIENT_FILE` 的 key 对齐，便于按幕切换，落盘即生效）：

```text
public/audio/bgm/depart_bgm.ogg     开场·于都河（告别、克制、弦乐长音）
public/audio/bgm/xiangjiang_bgm.ogg 一幕·湘江（低沉、行进、暗流）
public/audio/bgm/zunyi_bgm.ogg      二幕·遵义（雨夜、思索、室内感）
public/audio/bgm/jinsha_bgm.ogg     三幕前·金沙江（水流、紧张但克制）
public/audio/bgm/luding_bgm.ogg     三幕后·泸定桥（鼓点式紧张，铁索质感）
public/audio/bgm/snow_bgm.ogg       四幕·雪山（风声、寒冷、稀疏）
public/audio/bgm/grass_bgm.ogg      四幕·草地（泥沼、疲惫、缓慢）
public/audio/bgm/huining_bgm.ogg    五幕·会宁（汇合、暖调、收束）
```

**规格**：Ogg Vorbis 立体声 44.1kHz，**60–120 秒且可无缝循环**（环境床是 20–30 秒，BGM 太短会听出重复）；单条 1–2MB 以内。
**混音**：BGM 音量应低于环境床（建议 0.18 vs 环境床 0.32）；人声播放时自动闪避（duck 到 40%，300ms 淡入淡出）。
**红线**：无版权素材或已授权；**不含人声**（避免与台词抢）；不用强节奏与打击乐重音；整体克制，符合历史题材。

**代码侧已就绪（批 2，2026-09-14）**：`public/js/audio/channels/bgm.js` 的 `BGM_FILE` 已按上面的名字建好，
场景表（`public/js/audio/scene-table.js`）已把每一幕/每个场景指向对应曲名，`public/audio/bgm/` 已纳入
`npm run qa:audio` 的扫描与"缺曲记账"。
**你只要把 `.ogg` 按上面的名字放进 `public/audio/bgm/` 就自动生效**（代码无需改动）；放之前该场景
只放环境床、不会报错——`qa:audio` 的提示段会列出"还没有 BGM 文件（N 首）：…"。当前缺这 8 首。

## 六点五、产线 ⑤ 终局升华的诗（可选：有则更完整，无则照演）

终局成败结算之后有一屏**升华**（诗题/作者 → 八句逐字 → 钤印落款）。诗与落款的唯一真源是
[`../data/poem.json`](../data/poem.json)，音频有两条路，**两条都不走也照样能演**（按 poem.json 的 `pace` 逐字走，
约 15s；流程不阻塞、不报错）。

**路线 ① 逐句配音（推荐：与现有 TTS 同一条产线）**

- 跑 `npm run poem:manifest` → 产出 [`POEM-TTS.md`](POEM-TTS.md)：8 句的精确文本 + 目标文件名 + 当前状态；
- 按表把 8 个单句 wav 放进 `public/audio/cache/`（与其它台词同一个目录，`/api/tts` 自动命中）；
- 规格与台词一致：单声道 wav、16k/22.05kHz、静音裁首尾；**一句一个文件**（句间停顿交给屏幕）；
- 语气：克制、不喊口号，与史实回响同一档。

**路线 ② 整段朗诵录音（已就位，2026-09-15）**

- 文件：`public/audio/poem/qilv-changzheng.mp3`（《七律·长征(朗诵版)》，**59.3 秒**，44.1kHz 立体声）；
  **该目录不入库**（`.gitignore` 挡着）——换机器演示要把它一起拷过去，怎么放见该目录的 `README.md`；
- `data/poem.json` 的 `audio.full` 已指向它，八句的 `startMs/endMs` **是量出来的**，不是估的：
  在浏览器里 `decodeAudioData` 拿 PCM → 20ms 窗算 RMS 包络 → 按静音分段。
  实测（阈值 = 峰值 6%）：59.25s 里有声段 16 个，用 800ms 合并窗口得到 10 段 = 报题 2 段
  （「七律·长征」「毛泽东」，2.3–7.4s）+ **八句**（每句 3.5–4.8s，句前都有 1.2s 以上的停顿），
  于是：第 1 句 11.4–15.2s、第 2 句 16.7–20.8s、第 3 句 23.5–27.0s、第 4 句 28.3–32.2s、
  第 5 句 34.5–38.3s、第 6 句 39.5–43.8s、第 7 句 46.9–50.4s、第 8 句 51.5–56.3s；
- 逐字**按挂钟推**（不逐帧读音频位置）：口径是「估个量、文字比音频略早 `POEM_LEAD_MS`（500ms）」——
  用户定的口径是**不必精确对齐，宁可字先出、别让人等**；音频只是并行的背景轨，响没响都不影响字幕节奏。
  逐帧读音频位置那一版踩过三类脏数据（旧元素残留的 `currentTime` 让整首两秒读完、音频中途停住则永不结束、
  别的句子的回声漏进来），见 HANDOFF-CODE 坑 55；
  **换音频就要重新量**：分段是一次性探针（浏览器解码 + 静音分段）跑出来的，量完把数字写回 `poem.json`。

**格式**：`.ogg` / `.wav` / `.mp3`（2026-09-15 起 mp3 按需放开：素材是外找的 mp3，而“只认两种容器”
这条本来是为了防扩展名与内容不一致，mp3 没有那层歧义——见 `scripts/lib/audio-info.mjs` 的说明）。
**守卫**：`qa:audio` 会核对"放进来的文件有没有被 `poem.json` 指到"（漏填 `audio.full`、或命名不符 `poem_<句号>.ogg` 就报错），
并在提示段给出 `逐句配音 x/8 · 整段录音 y 个` 的就位状态；`tests/unit/poem.test.js` 守诗的形制（八句七字、两句一联、
标点、节奏上限 25s、整段路线必须有时间轴）。

**字体**：`逶`/`迤`/`礴` 原先不在字符集里（逐字显现时会缺字），2026-09-15 已补进
`tools/font-charset.txt` 并重跑 `npm run fonts:build`（产物入库）。

## 七、红线与验收

**红线**：不夸张译制腔；不当背景音乐用（人声只配"有立绘的同伴"与"史实回响标题"）；不给人声加回声/电音；**任何音频都不允许阻塞流程**（放不出来必须静默）。

**验收**

1. 进任意全景 2 秒内能听出环境床；点热点有 click 音。
2. 老班长对话至少 1 句有声且音色与上表一致；说完流程不卡。
3. 断网/无 Key 时全程静音也能通关。
4. `npm start` → 浏览器控制台无音频 404。
5. 产出后更新 `ASSETS.md` 第四节的表格状态。
6. 跑 `npm run qa:assets`，确认新音频出现在「已就位环境床」里（出现即在游戏内生效）。
7. 跑 `npm run qa:audio`，确认逐个文件「可解码 + 被代码路径引用」；报告见 `docs/AUDIO-REPORT.md`。
