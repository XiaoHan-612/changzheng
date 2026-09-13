# 交接说明 · 音频与语音（给音频/TTS 模型）

> 你只负责**产音频**。三条产线：**① 环境床 ogg ② 操作音效 ③ 固定台词 TTS**。
> 固定台词的**精确文本、哈希文件名、音色建议**已在 [`TTS-MANIFEST.md`](TTS-MANIFEST.md) 里列好，照表产出即可。
> 代码侧接口已就绪，不需要改代码：`POST /api/tts` + `public/js/audio.js`。

## 一、三层架构（策划案 §2.6.1）

| 层 | 内容 | 触发 | 目标形态 |
|---|---|---|---|
| 环境床 | 风、篝火噼啪、江水、雪风、夜虫 | 进场景自动 crossfade | 循环 ogg，15–30s，音量 0.25–0.4 |
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

要求：首尾各留 200ms 静音便于循环；无音乐性旋律（避免情绪过载）；响度 -24 LUFS 左右。

## 三、产线 ② 操作音效

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

## 六、产线 ④ BGM（章节/场景各不同）——**唯一待产线，等额度恢复后执行**

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

**代码侧（必须先做，否则文件放进去不会被加载）**：加 `BGM_FILE` 映射 + `audio.playBgm(kind)` / `stopBgm()`，与 `playAmbient` 同一套回退约定（文件缺失就静音，不影响流程）；同时把 `public/audio/bgm/` 加进 `scripts/check-audio.mjs` 的扫描目录，并在 `qa:av` 增加"每幕 BGM 播放成功"的断言。这一步约半天，不依赖音频模型，可随时先做。

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
