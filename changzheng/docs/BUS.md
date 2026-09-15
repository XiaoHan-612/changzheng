# 总线架构（内核 + IP 模块）

> **一句话**：模块之间不直接调用，全部挂在一条事件总线上；谁听什么写在模块自己的描述符里，
> 内核负责接线；跨模块读数据走只读快照。加模块/加玩法**不需要改内核，也不需要改别人的文件**。
>
> 状态：**批 1–4 已落地**（内核地基；audio 与 shell；去越界 + 锁显式化；state 成唯一持有者 + HUD 订阅）。
> 后续批次把 state / screens / games / ai / flow 逐个迁进来，顺序见 §六。**迁移期间游戏始终可运行**。

---

## 一、为什么改（现状的病）

| 现象（重构前） | 后果 |
|---|---|
| `main.js` 2411 行、26 个职责块，是所有模块的唯一调用者 | 改一处要看整文件；新人无从下手 |
| `ui.showScreen()` 会去清**别人**的 DOM（舞台正文 / 玩法区 / 对白区） | 越界清理；`openBoard` 甚至得用 `cloneNode` 换节点来躲它 |
| `S.busy` + `withLock` 忙时**静默 return**；另有一套 `body[data-step-state]` | 两套状态机语义重叠；两处"手工置 false 解锁"靠注释维持 |
| HUD 靠"`applyEffects` 之后必须紧跟 `renderStats`"的调用顺序维持正确 | 顺序就是正确性，十几处手工配对 |
| 模型调用的 `showThinking` 由调用方手工成对写（50 处） | 漏一个 finally 就永久转圈 |

## 二、结构

```
public/js/kernel/          内核（不含业务，业务不许写进来）
  bus.js                   事件总线：同步派发、优先级、单个订阅者抛错不拖垮别人
  contracts.js             【唯一真源】事件名 + 必需字段
  plugins.js               模块描述符的形状与校验（加模块的规矩在这）
  kernel.js                注册 / 拓扑排序 / 接线 / ready / 诊断
  wiring.js                【模块清单】有哪些模块（不写订阅关系——那在各模块自己那里）
  resources.js             显式资源：claim/release（取代"忙就静默 return"）
  snapshot.js              只读快照（唯一提供者是 state 模块）
  diag.js                  事件流黑匣子：dump() / toJsonl() / problems()
  index.js                 门面（模块只从这一个文件 import 内核）

public/js/modules/         IP 模块（业务）
  README.md                怎么加一个模块
  games/                   交互游戏插件（README + _template.js，同事照这个写）
```

## 三、六条硬规矩（`npm run qa:bus` 强制，不是靠自觉）

1. **模块之间不许 import**（只许 `kernel/`）：要协作走事件或 `kernel.api('模块名')`。
2. **订阅只写在描述符里**：模块内不许出现 `bus.on(...)`——接线集中，一眼看清谁听什么。
3. **事件名先登记**：发/听的名字必须在 `kernel/contracts.js` 里，否则记契约违规（console.error + 诊断）。
4. **模块必须在清单里**：`kernel/wiring.js` 的 `MODULES` 是"系统里有哪些模块"的唯一真相。
5. **状态写入只能发生在 `modules/state`**：别处只读（`S.x = …` / `S.x.push(…)` / `S.体力 = …` /
   把整个 `S` 交给别的函数如 `applyOrigin(S, …)` 都会被拦——最后这条是 2026-09-15 补的，
   它当时真实漏网过：改状态不广播，HUD 停在旧数字）。
6. **调 `state.js` 的纯函数必须先 import**（或走 `st()` 动作）：批次重构搬调用点、名字对不上时
   静态就能认出来（既没 import、也没定义，却出现调用——`addLoss(S, …)` 就是这么漏的）。

外加一条（批 3 已落地）：**屏只能清自己的 DOM**——`showScreen` 只广播 `screen:hide`，各屏宿主用
`kernel.api('screens').own(屏id, 清理函数)` 登记自己的清理（渲染与清理住在一起）。详 §三点五。

> 每条规则都要**用负向用例证明它还活着**（故意写一行违规，看它红不红）。教训见 `HANDOFF-CODE.md` 坑 39：
> 第 5 条曾经因为正则里的 `\b` 被写成字面退格符而**从未生效**，却一直报 ✓。

### 三点五、锁与屏：批 3 收口的两个语义

**① 状态只有一条写路（批 4）**

```js
const st = () => kernel.api('state');
st().applyEffects(result.effects);      // 语义动作：内部走 state.js 的纯函数 + 钳制表
st().spendAp(1, h.label);               // 花行动点
st().pushCampLog('粮荒', '断粮，体力 −10');
st().remember('nightChoice', choice.label);
// 复杂场景：st().apply('说明', (s) => { ...多字段... }, ['字段A','字段B'])
```

写完自动：**作废快照 → 广播 `state:change` → 存档**（`saveState` 不再需要调用方记得）。
读数据：其它模块用 `kernel.snapshot.get()`（冻结副本）；渲染器要读嵌套字段用 `st().raw()`（约定只读）。
`qa:bus` 静态规则拦"绕过 store 写状态"（`S.x = …` / `S.x.push(…)` / `applyEffects(S, …)`），
所以 `main.js` 里的 `S` 现在只是**只读别名**。

**② 流程锁（内核资源 `flow`）只占在"用户入口"**

```js
// 用户入口（点热点 / 启程 / 篝火菜单）：占不到就明说 —— 广播 resource:blocked，shell 模块提示
await withLock(fn, { from: 'user', label: '启程' });
// 流程内部（幕末强制链、快速模式）：既可能是第一棒、也可能是被嵌套，占不到就直接跑（占着的一定是自己这条流程）
await withLock(fn, { from: 'flow', label: '幕末流程' });
```

于是原来那两处"手工把 `S.busy` 置 false 再进流程"的补丁**结构性消失**（那是不可重入锁逼出来的，
顺序错了还静默失效）。同时 `busy` 从**存档状态**搬进**运行时资源**——它本来就不该写进玩家存档
（`state.js` 的 `busy` 字段已删，单测同步）。

**② 屏的清理归属**

```js
kernel.api('screens').own('screen-board', clearBoard);   // 谁渲染这屏，谁登记它的清理
```

`showScreen()` 现在只做两件事：切可见性 + 放入场动效，然后广播 `screen:hide`（离开的屏）与
`screen:show`（进入的屏）。**它不再碰任何屏内部的容器**——`openBoard()` 因此可以自己清自己的容器，
不必再用 `cloneNode` 换节点、也不必保证"先 showScreen 再挂 host"的时序。

## 四、模块之间怎么协作（三条正道）

```js
kernel.emit('sfx:play', { name: 'click' });        // ① 通知/命令（推荐）
const s = kernel.snapshot.get(); if (s.体力 <= 20) // ② 只读取数
kernel.api('audio')?.sfx?.('click');               // ③ 取接口（同步调用，慎用）
```

事件清单见 `kernel/contracts.js`（那张表本身就是文档）；当前 21 条，分五组：
`boot:*` · `screen:*`/`scene:*`/`flow:*` · `state:*`/`hotspot:*`/`choice:*`/`line:*` · `ai:*` · `sfx:*`/`voice:*`/`audio:*` · `resource:*`。

### 已挂上总线的模块（批 2–3）

| 模块 | 订阅 | 说明 |
|---|---|---|
| `modules/audio` | `flow:act-enter` · `scene:enter` · `sfx:play` · `voice:say` · `audio:toggle-mute` | **声音的唯一入口**：把事件翻译成 `public/js/audio/` 框架的调用（场景表/通道/静音模型都在框架里）。业务代码从此不认识音频 API |
| `modules/shell` | `audio:muted` · `audio:suspended` · `resource:blocked` | 外壳对事件的反应：顶栏静音图标、ctx 挂起的提示、**"上一步还在进行…"的提示**（过去每个调用点各写一遍 toast） |
| `modules/state` | （不订阅别人） | **游戏状态的唯一持有者**：写只有一条路——语义动作或 `apply(label, mutator, keys)`，写完自动**作废快照 → 广播 `state:change` → 存档**；`ready` 里把自己登记为只读快照的唯一提供者 |
| `modules/hud` | `state:change` | **状态读数渲染**：顶栏五维 / 行动点 / 同伴好感 / 营地手记 / AI 计数。以前这些靠调用方手工配对（`renderStats` 18 次、`renderCompanions` 8 次、`renderAp` 6 次），漏一处就是"数字没更新" |
| `modules/screens` | `screen:show` · `screen:hide` | **屏的生命周期归属**：各屏宿主用 `own(screenId, onHide)` 登记自己的清理；离开时只调那一屏自己登记的清理函数（取代 `showScreen` 越界清别人容器的做法，见 §三点五） |

**发声音就发事件**（别再调音频门面——`qa:audio` 会拦）：

```js
kernel.emit('sfx:play', { name: 'click' });                       // 音效（名字见 audio/sfx-table.js）
kernel.emit('voice:say', { text, actorId: '老班长' });             // 台词（预置 → TTS 缓存 → 静默）
kernel.emit('scene:enter', { name: 'sandbox' });                  // 独立场景：title/sandbox/luding/ending
kernel.emit('flow:act-enter', { actId: 'act4', day: 2, label: '草地' });  // 幕轴上的场景（含第四幕分日）
```

## 五、诊断与体检

| 入口 | 用途 |
|---|---|
| `__czKernel.state()` | 已注册模块、每个模块订阅了什么、锁被谁占着、快照状态、契约违规 |
| `__czKernel.diag.dump()` / `.toJsonl()` | 事件流（黑匣子）。答辩时可以演示"一个动作如何驱动多个模块" |
| `npm run qa:bus` | 静态六条 lint + 运行时体检（内核启动、事件在流、契约无违规、JSONL 可导出） |
| `npm run dev:check` | **加完模块/玩法立刻跑这个**：约 6 秒、0 次真调。它断言"清单里的模块都真的注册上了""契约违规 0""快照已冻结"，还会把一个玩法摆到板屏上点一下——`wiring.js` 路径写错、事件没登记、描述符导出成坏形状，都在这里当场红 |

## 六、迁移顺序（每批一个提交，可运行 + 守卫全绿）

| 批 | 内容 | 状态 |
|---|---|---|
| 1 | 内核地基（本文档 + 内核七件套 + 契约 + 模块/玩法契约 + 四条 lint + `qa:bus`） | ✅ 已完成 |
| 2 | **audio 挂总线**（声音总入口）+ shell（外壳对事件的反应） | ✅ 已完成 |
| 3 | **去越界**（`screen:hide` 各屏自清）+ **锁显式化**（`resources` 收编 `S.busy`） | ✅ 已完成 |
| 4 | **state 挂总线** + 只读快照 + HUD 订阅渲染（消掉"绕纯函数直改字段"与"手工 render 配对"） | ✅ 已完成 |
| 5 | screens / games / sandbox 挂总线（玩法宿主变服务，现有 8 个玩法改成插件形状） | ⏳ |
| 6 | ai 挂总线 + registry/run 重写（每类预算、预取、`qa:ai` 度量）+ 50 处手工 `showThinking` 收编 | ⏳ |
| 7 | `main.js` → `flow/*` 拆分；`__czScreens` 由内核供出；同步三个源码扫描脚本（check-handoff / av-audit / check-tts） | ⏳ |

## 七、怎么加东西（两个最常见）

**加一个模块**：读 [`modules/README.md`](../modules/README.md) —— 写一个描述符 + 在 `wiring.js` 清单加一行，完事。
（清单里的 `path` 写成"相对 `public/js/`"，内核加载时按 `import.meta.url` 解析——**踩过**：直接 `import(item.path)`
会去找 `kernel/modules/…`，模块静默加载失败，只有冒烟测试才发现它。`qa:bus` 现在会断言"清单里的模块都真的注册了"。）

写描述符时的两条：**订阅处理器写在描述符上没问题**（那是方法），但**不许往描述符里塞数据**——
那会变成"模块偷偷带状态"，正是老代码里 `S` 满天飞的翻版（守卫会报"既不是规定字段也不是方法"）。

**加一个交互游戏**：读 [`modules/games/README.md`](../modules/games/README.md) —— 复制 `_template.js`，填 `id/title/stats/actions/mount`，
在 `games/index.js` 的 GAMES 里加一行。宿主（玩法板）会替你开屏、写题名、写数值签、声明自动化契约。

## 八、暂时搁置（接口已预留）

电影化的开场/幕间过渡、终局结算电影、诗朗诵逐字——它们是挂在这套总线上的后续模块
（`flow:act-enter`、`ai:request`、`voice:say` + 内核时钟）；届时的做法是新增 `modules/cinema/`，
不改现有模块。设计稿留在对话与 `docs/AUDIO-SYSTEM.md` 的思路里，待发话再上。
