# 音频系统 · 框架设计稿

> **方向一句话**：一次重写，之后**所有**音频都从一个门面走；加环境床 / BGM / 音效 / 台词都只在**声明表**里加一行。
> 结构刻意与视觉那套一一对应：**值 → 框架 → 通道 → 声明表 → 守卫/体检**（见 §二）。
> 状态：**批 1、批 2、批 3 全部落地**（骨架 + 静音模型；场景声明表 + BGM 通道 + 闪避；
> 音效注册表 + 语音收口 + 试听页）。分批计划见 §九。
> 已拍板：BGM 有文件就放 · 播放走 `<audio>` 元素（抗 ctx 挂起）· 保留合成兜底但审计显式列出 · 操作音效继续合成。

---

## 一、为什么重写：老实现的问题，新框架怎么结构性避免

| # | 踩过的坑（出处） | 新框架如何让它不可能再发生 |
|---|---|---|
| 1 | **静音后环境床不回来**——`setEnabled(false)` 顺手把"本来该放什么"也忘了，取消静音只置标志位，背景声只有切场景才回来（2026-09-14 玩家反馈，已临时修） | 「**该响什么** `desired`」与「**现在在响什么** `actual`」分离，一切入口只改 `desired` 再 `reconcile()`；静音 = `desired` 不变、只改 `muted` |
| 2 | 回退链换源时**孤儿元素叠音**（同一条环境床两个元素同时响） | 通道内**单一 current handle**，切换/重起前必先停旧句柄（写进通道不变量，守卫断言） |
| 3 | rAF / `setTimeout` 循环在离开板屏后继续跑（批五抓过） | 循环（合成床的噼啪/虫鸣）统一收在通道里，**通道 stop 时清自己的定时器**，不留全局裸定时器 |
| 4 | AudioContext 被自动播放策略/休眠挂起 → **全哑且无人知道** | `reconcile()` 恢复 ctx；首次发现 `suspended` 且已开音 → 一次性提示「点一下页面恢复声音」 |
| 5 | 音效名拼错 → 静默落到默认蜂鸣（"看着对、其实错"） | 音效走**注册表**；未知名字 → 控制台告警 + 审计列出，不再静默兜底 |
| 6 | 音量/增益是散落各处的魔法数（0.75 / 0.8 / 0.85 / 0.32 …） | **混音表唯一处**（`audio/mix.js`）+ lint：别处不许出现 volume/gain 数字 |
| 8 | 想加 BGM 得改一堆文件（现在根本没有 BGM） | BGM 是**平级通道**；加曲子 = 表里加一行 + 文件落盘 |
| 9 | TTS 命中靠"逐字一致 + voiceId 走映射"，改文本就白做 | 守卫静态核对 `tts-lines.json` / `ACTOR_VOICE` / 缓存文件（并进 §八 的守卫） |
| 10 | 语音没有打断与闪避策略（新句盖旧句、压住背景音） | 语音通道集中定义：**新句打断旧句**、播放期间 **duck** 背景（BGM 最大，环境床轻闪避） |

> 一句话：老实现不是"写错了几个函数"，而是**没有一个地方回答"现在该响什么"**。新框架的心脏就是这个问题的答案。

---

## 二、四层结构（和视觉一一对应）

| 视觉 | 音频 | 职责 |
|---|---|---|
| `tokens.css`（值） | **`audio/mix.js`** 混音表 | 总线与各通道音量、淡入淡出时长、闪避幅度、节流窗口——**唯一魔法数处** |
| `framework.css`（模板 / 区块 / 动效） | **`audio/core.js`** + `audio/channels/*` | ctx 与总线、`desired/actual` 状态机、`reconcile()`、四条通道的播放规格与回退链 |
| `components.css`（app 组件） | **`audio/scene-table.js`** + **`audio/sfx-table.js`** | 声明表：屏 → 放什么；音效名 → 配方/文件 |
| `qa:tokens / qa:frames / qa:tone`（守卫） | **`qa:audio` 扩展 + 混音 lint + `qa:smoke`/`qa:av` 断言** | 文件层 / 声明表层 / 运行时层的三道尺子 |

**目录**（`public/js/audio/`，旧的 `public/js/audio.js` 删除）

```
audio/                     ← 已落地（批 1）：旧 public/js/audio.js 已删除
  index.js                 # 门面：唯一 import 入口（boot / ambient.play·stop / sfx / speak / setMuted / isPlaying / state）
  mix.js                   # 【值】混音表（唯一允许写音量与淡入淡出的地方）
  core.js                  # 【框架】ctx + 四条总线 + desired/actual + reconcile + 三层静音与自愈触发点
  channels/
    ambient.js             # 环境床：AMBIENT_FILE 映射 + 文件(.ogg→.wav) → 合成兜底；循环
    sfx-table.js           # 【声明】音效注册表：一条音效 = 一条合成配方；同名文件落盘即覆盖
  channels/sfx.js        # 音效通道：注册表取用（文件 → 配方）+ 懒探测负缓存 + 同名节流
    voice.js               # 语音：ACTOR_VOICE + voice-lines.json 目录 → /api/tts 缓存 → 静默；支持 { file } 直给
  fade.js                  # 元素音量斜坡（淡入/闪避共用一处，别在通道里各写 setInterval）
  scene-table.js           # 【声明】场景 → { ambient, bgm }（唯一场景真相）
  channels/bgm.js          # 【批 2 已落地】BGM 通道（有文件就放，缺文件静默并记账）
```

---

## 三、门面：唯一调用面

> **批 2 起，业务代码不再直接调门面**：声音统一由总线上的 `modules/audio` 模块订阅事件后调用
> （见 [`BUS.md`](BUS.md)）。业务只写 `kernel.emit('sfx:play'|'voice:say'|'scene:enter'|'flow:act-enter')`；
> 门面（下面这几行）是**音频模块内部**用的，`qa:audio` 会拦住别的文件直接 import 音频门面。
> 例外：`public/dev/audio.html` 试听页（开发工具，逐通道试听本来就需要直接控制各通道）。

```js
// 音频模块（modules/audio）内部这么调；业务代码请发事件（见上）
import { audio } from './audio/index.js';

audio.boot();                          // 首次手势解锁 + 挂自愈触发点（幂等，可反复调）
audio.scene('camp', { act, day });     // 关键时机①：进屏 / 换幕 → 按表起停环境床与 BGM
audio.sfx('click');                    // 关键时机②：交互（热点、选项、小游戏动作）
await audio.speak({ text, actorId });  // 关键时机③：台词（自带打断与闪避）
audio.setMuted(true);                  // 关键时机④：静音开关（取消静音自动恢复）
audio.state();                         // 调试快照（= window.__czAudio）
```

**硬规矩（`npm run qa:audio` 的「框架一致性」段已强制）**：`public/js/` 里除 `audio/` 之外，
**不许出现** `new Audio(` / `new AudioContext` / `.volume =` / `.gain.value =`，也不许再出现旧 API 名
（`playAmbient` / `stopAmbient` / `playSfx` / `setEnabled`），并且**只允许从 `./audio/index.js` 进门**（深模块不外露）。

---

## 四、三层静音模型（这轮反馈的核心）

| 层 | 触发 | 应用侧怎么处理 |
|---|---|---|
| **游戏内静音** | 顶栏 🔊 / `audio.setMuted` | `muted=true` → 停声但**保留 desired**；取消 → `reconcile()` 恢复。**可自动化断言**（`qa:smoke` 已加） |
| **浏览器 / 标签页静音** | 右键标签页「静音网站」等 | **无法直接探测**，但它表现为"媒体被暂停 / ctx 被挂起 / 页面转后台"，所以由 `reconcile()` 的触发点覆盖：`visibilitychange`、`pointerdown/keydown`、环境床元素的 `pause`/`ended` 事件（300ms 后自愈）；标签页静音本身不影响元素播放（静音在输出层），无需处理 |
| **系统静音**（Windows 音量 / 耳机拔出） | 操作系统 | **应用层不可感知，也不该处理**。文档写明这条边界，以后别当 bug 查 |

补充两条：
- **ctx 挂起**（自动播放策略、休眠）：`reconcile()` 里 `resume()`；若因缺用户手势失败，弹一次「点一下页面恢复声音」（同一会话只提示一次）。
- **页面转后台**：环境床/BGM **继续播**（这是有意为之；语音不补播）。要改的话是混音表里加一个 `background: 'keep' | 'mute'` 开关。

---

## 五、心脏：`desired / actual` 与 `reconcile()`

```
desired = { ambient: 'camp'|null, bgm: 'xueshan'|null, muted: false }     // 只由「关键时机」写入
actual  = { ambient: handle|null, bgm: handle|null, voice: handle|null }  // 只由通道写入
reconcile(): 让 actual 追上 desired —— 该起的起（带淡入）、该停的停（带淡出）、
             该闪避的闪避；一切安好时它只做几次布尔比较，随便调。
```

**三条不变量**（写进守卫断言，回归时自动查）：
1. **同一通道**最多一个句柄在播（防叠音与孤儿元素；`qa:av` 按通道统计峰值——全局阈值会把
   "语音叠在环境床上"这种正常情况误报）。异步探测（HEAD → 播放）尤其要防：飞行期间重复发起会产生孤儿
   （2026-09-14 实测攒出 12 条同时播放）；
2. `muted === false` 且 `desired.ambient/bgm` 非空 → `actual` 必须在播（防"静音后不回来"，坑 #1）；
3. 切走的场景**不留定时器/循环**（坑 #3）。

---

## 六、四条通道的规格

| 通道 | 回退链 / 策略 | 音量（mix.js 给） | 备注 |
|---|---|---|---|
| **ambient** | `.ogg → .wav → 合成兜底`；循环；切场景 800ms 淡入淡出 | **0.7**（实测：0.32 时只有 −37 dBFS，比一般游戏床低一档多，听不出在不在响；0.7 ≈ −28 dBFS） | 兜底**在审计里显式列出**（"正在兜底"是可见状态，不是静默） |
| **bgm** | `public/audio/bgm/<kind>_bgm.ogg`；60–120s 可循环；起播 1.2s 淡入 | ~0.18（低于环境床） | 语音播放时 duck 到 40%；**文件未产出时该场景只放环境床**（静默、记账在 `state().actual.bgm.missing` 与 `qa:audio`），落盘即生效 |
| **sfx** | **注册表**（`sfx-table.js`）：`public/audio/sfx/<name>.ogg` 有文件就用文件，否则走合成配方；未知名字告警 + 通用音 | ~0.85 | ≤0.4s；同名 60ms 节流；文件探测**懒执行 + 负缓存**（整场只探一次） |
| **voice** | 预置目录 `voice-lines.json` → TTS 缓存 `/api/tts` → 静默 | 1.0 | 新句打断旧句；播放期间闪避 BGM（最大）与环境床（轻）；**带事件与控制**（见下） |

### 六点一、语音回声与控制（批 A，2026-09-15）

语音不再是"发射后不管"：`VoiceChannel._playFile` 是唯一出声实现，也是 `voice:*` 事件的唯一来源。

| 事件 | 载荷 | 谁在用 |
|---|---|---|
| `voice:start` | `{ durationMs, seq }`（0 = 元数据还没到；`seq` 是句序号） | 消费方按 `seq` **只认自己那一句**的回声 |
| `voice:progress` | `{ t, duration, seq }`，**约 10Hz** | 诊断与将来可能的精细同步用它；终局升华**不再逐帧读它**（见下段） |
| `voice:ended` | `{ interrupted, seq }` | 收尾一律以它为准，别等 `start` 配对 |
| `voice:stop`（反向） | — | 跳过终局升华时连音频一起停（`audio.voiceStop()`） |

三条实现要点：

1. **收尾一定落地**：`stop()` 除了停声，还会 settle 上一次 `speak()` 的 Promise 并发 `voice:ended`——
   老实现里被顶替的那句永远不 resolve，当时没人 `await` 才没暴露（坑 48）。
2. **等待上限自适应**：`duration × 1.2 + 3000ms`，再套 `waitCeilingMs = 90s` 硬顶（整段朗诵几十秒，
   12s 硬顶会截断）；**时长未知**时才用 `maxWaitMs = 12s` 兜底。
3. **语速可调**：`speak({ rate })` 落到元素的 `playbackRate`；档位表是 `mix.js` 的 `MIX.voice.rates = [1, 1.5]`，
   不在表里的值一律回落 1（业务不许随手传没验过的档）。读法走 `kernel.api('audio').voiceRates()`。

**诗的逐字怎么走**（2026-09-16 定稿）：**不逐帧读音频位置**，而是「锚点 + 挂钟 × 语速」——
逐句窗口取自 `data/poem.json`（量出来的），整体提前 500ms（**文字略早于音频**，用户口径：不追精确、别让人等）。
音频只当并行的背景轨，没响/中途停都不影响字幕，也就顺手去掉了三类脏数据特判（见 HANDOFF-CODE 坑 55）。

这条通道也是 `.gitignore` 里朗诵音频那条线的前提：**音频缺失时整套流程照走**（`voice:ended` 照发，
升华退化成固定节奏逐字），红线「任何音频都不允许阻塞流程」不因新功能破例。

---

## 七、扩展流程（**不许硬塞**：所有新增都走同一张表）

| 想加什么 | 怎么做 |
|---|---|
| 新环境床 | `scene-table.js` 加一行 + 文件按命名约定落盘（`public/audio/ambient/<kind>.ogg`）→ **落盘即生效** |
| 新 BGM | **② 已就绪**：`channels/bgm.js` 的 `BGM_FILE` 加一行 + 场景表指向它 + `public/audio/bgm/<kind>_bgm.ogg` 落盘即生效 |
| 新音效 | **③ 已就绪**：`sfx-table.js` 加一条配方（`audio.sfx('新名字')` 即可用）；**或**直接把 `public/audio/sfx/<name>.ogg` 落盘——同名文件自动顶替合成音，连表都不用改 |
| 新台词 / 新角色语音 | `data/tts-lines.json` 加条 + `ACTOR_VOICE` 加一行 → `npm run tts:manifest` 产出文件名交给音频模型 |
| 终局升华的诗（逐句或整段） | 诗与落款写进 `data/poem.json` → 逐句配音走 `npm run poem:manifest` 的对照表（落 `cache/`）；整段录音落 `public/audio/poem/` 并填 `audio.full`。**两条都没有也能演**（按 `pace` 逐字），见 HANDOFF-AUDIO §六点五 |
| 新屏（新场景） | `audio.scene('新场景名')` 或走幕轴（`{ act, label }`）→ 在 `scene-table.js` 的 `SCENE_SOUNDS` 加一行。**守卫会核对**：场景表写的 kind 必须在文件映射里存在，否则 `qa:audio` 报错（写错 kind = 静默无声） |
| 新玩法 / 新小游戏 | 若要用自己的床：表里加一行；只加音效：直接用已注册的 sfx |

---

## 八、守卫与体检（照着视觉那套的尺子）

| 尺子 | 查什么 | 现状 |
|---|---|---|
| `qa:audio`（扩展） | 文件可解码 / 容器与扩展名一致 / **声明表里每个 kind 都有文件**（没有 → 报"正在兜底"）/ 注册表每条都有实现 / `bgm/` 纳入扫描 | 已有文件层，需补表与注册表层 |
| **混音 lint**（新，仿 `qa:tokens`） | 除 `audio/mix.js` 外不许出现 volume/gain 数字、不许 `new Audio`/`new AudioContext` | 待写 |
| `qa:smoke`（已加） | 进营地环境床在播 → 静音停 → **取消静音自动恢复** | 已加断言 ✅ |
| `qa:av`（扩展） | 每幕环境床/BGM 真的响 + **无孤儿音频在播**（同时只允许预期条数）+ 静音三态 | 已有环境床计数，需补孤儿与 BGM |
| **`public/dev/audio.html`**（新） | 试听页：按通道/kind 逐个播放，给人和音频模型对着听（对应视觉的样板页） | 待写（过渡方案：`node tests/manual/audio-listen.mjs --measure` 开可见 Chrome 放一遍，并把环境床接进分析器量 RMS——**听感与能量一起验**） |

---

## 九、分批计划（每批一个提交，按 CONTRIBUTING 六步推送）

**批 1 · 骨架 + 静音模型**（行为等价搬迁，不改任何声音）
- 建 `audio/{index,mix,core}.js` + 四条通道；把现实现搬进框架（含上一版临时补丁的语义）
- 混音 lint + `qa:smoke` 断言保住；`docs/AUDIO-SYSTEM.md` 从"设计稿"转"实现说明"
- 验收：`test:unit` / `qa:smoke` / `qa:av` / `test:e2e` 全绿，且听感与现状一致

**批 2 · 声明式场景表 + BGM 通道**（✅ 已完成）
- 已落地：`scene-table.js`（幕轴 `ACT_SOUNDS` / 分日 `DAY_SOUNDS` / 独立场景 `SCENE_SOUNDS` / 兜底）+
  `audio.scene()` 接管全部场景切换（`ambientFor` 已删除、各场景进声明表）；`bgm.js` 通道（元素循环 +
  淡入 + 语音闪避 + 缺文件记账）；`fade.js` 音量斜坡；语音播放期间 BGM 重闪避／环境床轻闪避
- 守卫：`qa:audio` 增「场景表 ↔ 文件映射 ↔ 磁盘」对账 + 新增「app 代码不许直调 `audio.ambient/bgm.play`」；
  `qa:handoff` 修好（它原先还指着已删除的 `public/js/audio.js`）
- 实测：`audio-listen --measure` 里 `desired.bgm='depart'`、`actual.bgm.missing=['depart']`（缺文件按设计静默）；
  环境床淡入实测 0→0.7（中途读数 0.576）

**批 3 · 注册表 + 语音收口 + 试听页**（✅ 已完成）
- 已落地：`sfx-table.js` 注册表（9 条配方）+ 通道改为"文件优先、配方兜底、懒探测负缓存"；
  语音打断语义收口（**旧句的收尾回调不再误解除新句的闪避**）；`public/dev/audio.html` 试听页
  （按通道列出每个声音、标出"用文件 / 合成兜底 / 缺文件静默"、逐个点播 + 顺序试听 + 静音开关 +
  实时回显 `state()`；页面**只 import 门面**，听到的就是游戏里播的）
- 守卫：`qa:av` 新增**同时播放峰值 ≤1**（叠音/孤儿，对应不变量①）；4xx 分流（未产出=信息）已在批 2 落地
- 验收：全绿 + 试听页人耳过一遍（`http://127.0.0.1:3001/dev/audio.html`）

**批 4 · 语音回声与控制**（✅ 已完成 2026-09-15，动画批 A 的地基）
- 已落地：契约登记 `voice:start/progress/ended/stop`；`_playFile` 重写（时长/进度/收尾/语速/自适应等待，
  且 `stop()` 一定 settle）；`core.onReport` 作为"框架 → 总线"的唯一出口（由 `modules/audio` 接线）；
  门面补 `voiceStop()/voiceState()/voiceRates()`；修好默认音色分岔（前端 `'narr'` vs 服务端 `'default'`，
  `qa:audio` 现在会核对这两处，防再次分岔）
- 守卫：`qa:av` 断言三条事件真的在流 + `ended` 不落单 + 载荷是数字（`语音事件_*` 三行进了报告）

---

## 十、待拍板的四件事（默认按推荐值走，有异议就说）

1. **BGM 默认策略**：有文件就放（**推荐**）· 只在幕间与终局放 · 默认关到路演前再开
2. **播放路径**：保持 `<audio>` 元素 + 元素级音量（**推荐**：ctx 被挂起时元素仍能响，鲁棒性优先）· 全部经 WebAudio 总线（闪避/分析更统一，但 ctx 挂起就全哑）
3. **合成兜底**：保留、但在审计里显式标"正在兜底"（**推荐**）· 缺文件就静音
4. **操作音效**：继续合成、等音频模型补预录（**推荐**）· 现在就要求预录全套
