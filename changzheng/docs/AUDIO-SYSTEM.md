# 音频系统 · 框架设计稿

> **方向一句话**：一次重写，之后**所有**音频都从一个门面走；加环境床 / BGM / 音效 / 台词都只在**声明表**里加一行。
> 结构刻意与视觉那套一一对应：**值 → 框架 → 通道 → 声明表 → 守卫/体检**（见 §二）。
> 状态：**设计稿，未实现**。分批计划见 §九，待拍板的四件事见 §十。

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
| 7 | 场景↔声音的映射散落（`ambientFor(act, day)` + 沙盘里硬编码 `'camp'`） | **场景声明表**（`scene-table.js`）：一个屏一行，`audio.scene(name)` 一处调用 |
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
audio/
  index.js        # 门面：唯一 import 入口（audio.scene/sfx/speak/setMuted/boot/state）
  mix.js          # 【值】混音表
  core.js         # 【框架】ctx + 总线 + desired/actual + reconcile + 三层静音与自愈触发点
  channels/
    ambient.js    # 环境床：文件(.ogg→.wav) → 合成兜底；循环；切场景淡入淡出
    bgm.js        # BGM：文件循环；闪避；起停淡入淡出
    sfx.js        # 音效：注册表（合成配方 / 同名文件覆盖）；节流
    voice.js      # 语音：目录 → /api/tts 缓存 → 静默；打断与 ducking
  scene-table.js  # 【声明】屏 → { ambient, bgm }
  sfx-table.js    # 【声明】音效名 → 配方或文件
```

---

## 三、门面：唯一调用面（app 里就这几行）

```js
import { audio } from './audio/index.js';

audio.boot();                          // 首次手势解锁 + 挂自愈触发点（幂等，可反复调）
audio.scene('camp', { act, day });     // 关键时机①：进屏 / 换幕 → 按表起停环境床与 BGM
audio.sfx('click');                    // 关键时机②：交互（热点、选项、小游戏动作）
await audio.speak({ text, actorId });  // 关键时机③：台词（自带打断与闪避）
audio.setMuted(true);                  // 关键时机④：静音开关（取消静音自动恢复）
audio.state();                         // 调试快照（= window.__czAudio）
```

**硬规矩（lint 卡住）**：`public/js/` 里除 `audio/` 之外，**不许出现** `new Audio` / `new AudioContext` / `playAmbient` / `volume =` / `gain.value =`。
——这条是"统一"的保证：只要有人绕开框架，守卫立刻报。

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
1. 同一通道**最多一个句柄在播**（防叠音，坑 #2）；
2. `muted === false` 且 `desired.ambient/bgm` 非空 → `actual` 必须在播（防"静音后不回来"，坑 #1）；
3. 切走的场景**不留定时器/循环**（坑 #3）。

---

## 六、四条通道的规格

| 通道 | 回退链 / 策略 | 音量（mix.js 给） | 备注 |
|---|---|---|---|
| **ambient** | `.ogg → .wav → 合成兜底`；循环；切场景 800ms 淡入淡出 | ~0.32 | 兜底**在审计里显式列出**（"正在兜底"是可见状态，不是静默） |
| **bgm** | `public/audio/bgm/<kind>_bgm.ogg`；60–120s 可循环；起停 1.2s 淡入淡出 | ~0.18（低于环境床） | 语音播放时 duck 到 40%；**当前文件未产出**，落盘即生效 |
| **sfx** | 注册表：合成配方（默认）或**同名文件覆盖**（预录后自动顶替） | ~0.85 | ≤0.4s；同名 60ms 节流；未知名字告警 |
| **voice** | 预置目录 `voice-lines.json` → TTS 缓存 `/api/tts` → 静默 | 1.0 | 新句打断旧句；播放期间闪避 BGM（最大）与环境床（轻） |

---

## 七、扩展流程（**不许硬塞**：所有新增都走同一张表）

| 想加什么 | 怎么做 |
|---|---|
| 新环境床 | `scene-table.js` 加一行 + 文件按命名约定落盘（`public/audio/ambient/<kind>.ogg`）→ **落盘即生效** |
| 新 BGM | 表里加一行 + `public/audio/bgm/<kind>_bgm.ogg` → 落盘即生效 |
| 新音效 | `sfx-table.js` 加一条配方；或直接把 `<name>.ogg` 放进 `public/audio/sfx/` 覆盖合成音 |
| 新台词 / 新角色语音 | `data/tts-lines.json` 加条 + `ACTOR_VOICE` 加一行 → `npm run tts:manifest` 产出文件名交给音频模型 |
| 新屏（新场景） | `scene-table.js` 加一行；守卫会核对"每个屏都有声音声明"（漏了会报） |
| 新玩法 / 新小游戏 | 若要用自己的床：表里加一行；只加音效：直接用已注册的 sfx |

---

## 八、守卫与体检（照着视觉那套的尺子）

| 尺子 | 查什么 | 现状 |
|---|---|---|
| `qa:audio`（扩展） | 文件可解码 / 容器与扩展名一致 / **声明表里每个 kind 都有文件**（没有 → 报"正在兜底"）/ 注册表每条都有实现 / `bgm/` 纳入扫描 | 已有文件层，需补表与注册表层 |
| **混音 lint**（新，仿 `qa:tokens`） | 除 `audio/mix.js` 外不许出现 volume/gain 数字、不许 `new Audio`/`new AudioContext` | 待写 |
| `qa:smoke`（已加） | 进营地环境床在播 → 静音停 → **取消静音自动恢复** | 已加断言 ✅ |
| `qa:av`（扩展） | 每幕环境床/BGM 真的响 + **无孤儿音频在播**（同时只允许预期条数）+ 静音三态 | 已有环境床计数，需补孤儿与 BGM |
| **`public/dev/audio.html`**（新） | 试听页：按通道/kind 逐个播放，给人和音频模型对着听（对应视觉的样板页） | 待写 |

---

## 九、分批计划（每批一个提交，按 CONTRIBUTING 六步推送）

**批 1 · 骨架 + 静音模型**（行为等价搬迁，不改任何声音）
- 建 `audio/{index,mix,core}.js` + 四条通道；把现实现搬进框架（含上一版临时补丁的语义）
- `main.js` / `ui.js` / `sandbox.js` / `minigames.js` 的音频调用**全量改到门面**；删除 `public/js/audio.js`
- 混音 lint + `qa:smoke` 断言保住；`docs/AUDIO-SYSTEM.md` 从"设计稿"转"实现说明"
- 验收：`test:unit` / `qa:smoke` / `qa:av` / `test:e2e` 全绿，且听感与现状一致

**批 2 · 声明式场景表 + BGM 通道**
- `scene-table.js` + `audio.scene()` 接管所有场景切换（`ambientFor`、沙盘硬编码全部进表）
- `bgm.js`：文件循环 + 淡入淡出 + 语音闪避；`qa:audio` 扫描 `bgm/`
- 验收：缺 BGM 文件时静默不报错、落盘即生效；"每幕环境床/BGM"体检出表

**批 3 · 注册表 + 语音收口 + 试听页**
- `sfx-table.js`（配方 + 同名文件覆盖）、语音打断/闪避策略、`dev/audio.html` 试听页
- `qa:av` 补"无孤儿音频 / 静音三态"；文档与坑表收口（`HANDOFF-CODE` 的音频条目合并成一条）
- 验收：全绿 + 试听页人耳过一遍

---

## 十、待拍板的四件事（默认按推荐值走，有异议就说）

1. **BGM 默认策略**：有文件就放（**推荐**）· 只在幕间与终局放 · 默认关到路演前再开
2. **播放路径**：保持 `<audio>` 元素 + 元素级音量（**推荐**：ctx 被挂起时元素仍能响，鲁棒性优先）· 全部经 WebAudio 总线（闪避/分析更统一，但 ctx 挂起就全哑）
3. **合成兜底**：保留、但在审计里显式标"正在兜底"（**推荐**）· 缺文件就静音
4. **操作音效**：继续合成、等音频模型补预录（**推荐**）· 现在就要求预录全套
