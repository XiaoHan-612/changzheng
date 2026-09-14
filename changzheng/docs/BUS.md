# 总线架构（内核 + IP 模块）

> **一句话**：模块之间不直接调用，全部挂在一条事件总线上；谁听什么写在模块自己的描述符里，
> 内核负责接线；跨模块读数据走只读快照。加模块/加玩法**不需要改内核，也不需要改别人的文件**。
>
> 状态：**批 1 已落地**（内核地基 + 契约表 + 诊断 + 守卫 + 体检）。业务模块从批 2 起逐个挂上来，
> 顺序见本文 §六。**迁移期间游戏始终可运行**（这是硬要求）。

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

## 三、四条硬规矩（`npm run qa:bus` 强制，不是靠自觉）

1. **模块之间不许 import**（只许 `kernel/`）：要协作走事件或 `kernel.api('模块名')`。
2. **订阅只写在描述符里**：模块内不许出现 `bus.on(...)`——接线集中，一眼看清谁听什么。
3. **事件名先登记**：发/听的名字必须在 `kernel/contracts.js` 里，否则记契约违规（console.error + 诊断）。
4. **模块必须在清单里**：`kernel/wiring.js` 的 `MODULES` 是"系统里有哪些模块"的唯一真相。

外加一条（批 3 落地）：**屏只能清自己的 DOM**——`showScreen` 广播 `screen:hide`，各屏自己收拾。

## 四、模块之间怎么协作（三条正道）

```js
kernel.emit('sfx:play', { name: 'click' });        // ① 通知/命令（推荐）
const s = kernel.snapshot.get(); if (s.体力 <= 20) // ② 只读取数
kernel.api('audio')?.sfx?.('click');               // ③ 取接口（同步调用，慎用）
```

事件清单见 `kernel/contracts.js`（那张表本身就是文档）；当前 17 条，分四组：
`boot:*` · `screen:*`/`flow:*` · `state:*`/`hotspot:*`/`choice:*`/`line:*` · `ai:*` · `sfx:*`/`voice:*` · `resource:*`。

## 五、诊断与体检

| 入口 | 用途 |
|---|---|
| `__czKernel.state()` | 已注册模块、每个模块订阅了什么、锁被谁占着、快照状态、契约违规 |
| `__czKernel.diag.dump()` / `.toJsonl()` | 事件流（黑匣子）。答辩时可以演示"一个动作如何驱动多个模块" |
| `npm run qa:bus` | 静态四条 lint + 运行时体检（内核启动、事件在流、契约无违规、JSONL 可导出） |

## 六、迁移顺序（每批一个提交，可运行 + 守卫全绿）

| 批 | 内容 | 状态 |
|---|---|---|
| 1 | 内核地基（本文档 + 内核七件套 + 契约 + 模块/玩法契约 + 四条 lint + `qa:bus`） | ✅ 已完成 |
| 2 | audio 挂总线（第一个 IP，最干净） | ⏳ |
| 3 | 去越界（`screen:hide` 各屏自清）+ 锁显式化（`resources` 收编 `S.busy` 与 `data-step-state`） | ⏳ |
| 4 | state 挂总线 + 只读快照（消掉"绕纯函数直改字段"） | ⏳ |
| 5 | screens / games / sandbox 挂总线（玩法宿主变服务，现有 8 个玩法改成插件形状） | ⏳ |
| 6 | ai 挂总线 + registry/run 重写（每类预算、预取、`qa:ai` 度量）+ 50 处手工 `showThinking` 收编 | ⏳ |
| 7 | `main.js` → `flow/*` 拆分；`__czScreens` 由内核供出；同步三个源码扫描脚本（check-handoff / av-audit / check-tts） | ⏳ |

## 七、怎么加东西（两个最常见）

**加一个模块**：读 [`modules/README.md`](../modules/README.md) —— 写一个描述符 + 在 `wiring.js` 清单加一行，完事。

**加一个交互游戏**：读 [`modules/games/README.md`](../modules/games/README.md) —— 复制 `_template.js`，填 `id/title/stats/actions/mount`，
在 `games/index.js` 的 GAMES 里加一行。宿主（玩法板）会替你开屏、写题名、写数值签、声明自动化契约。

## 八、暂时搁置（接口已预留）

电影化的开场/幕间过渡、终局结算电影、诗朗诵逐字——它们是挂在这套总线上的后续模块
（`flow:act-enter`、`ai:request`、`voice:say` + 内核时钟）；届时的做法是新增 `modules/cinema/`，
不改现有模块。设计稿留在对话与 `docs/AUDIO-SYSTEM.md` 的思路里，待发话再上。
