# modules/ —— IP 模块目录

> 这里是"业务模块"（IP）的家。**内核在 `../kernel/`，业务不许写进内核。**
> 想知道整体怎么运转，先读 [`../../docs/BUS.md`](../../docs/BUS.md)。
> 想加一个**交互游戏**（小游戏），直接看 [`games/README.md`](games/README.md) 与 [`games/_template.js`](games/_template.js)。

## 一、一个模块长什么样

每个模块是一个目录，`index.js` 里 `export default` 一个**描述符**：

```js
// modules/example/index.js
export default {
  name: 'example',                 // 唯一名（也用于 kernel.api('example')）
  note: '一句话说明这个模块是干什么的',
  requires: ['state'],             // 可选：依赖哪些模块（内核按拓扑序 init）
  subscriptions: {                 // 订阅：事件名 → 本模块的方法名（写在自己这里，加模块不用改内核）
    'screen:show': 'onScreenShow',
    'state:change': 'onStateChange',
  },
  api: {                           // 提供给别的模块用的接口（别人用 kernel.api('example') 拿）
    doSomething(arg) { /* ... */ },
  },
  init(kernel) {},                 // 注册后调用一次（别的模块可能还没就绪）
  ready(kernel) {},                // 全部模块 init 完成后调用（可以用别人的 api 了）
  dispose() {},                    // 卸载（测试用）

  // ── 订阅的处理方法（名字要与 subscriptions 里写的一致）──
  onScreenShow(payload, name, kernel) { /* this 指向本描述符 */ },
  onStateChange(payload, name, kernel) {},
};
```

然后在 [`../kernel/wiring.js`](../kernel/wiring.js) 的 `MODULES` 清单里加一行：

```js
{ name: 'example', path: './modules/example/index.js', note: '一句话说明' },
```

**就这两步。** 内核、别的模块的文件都不需要动。

## 二、硬规矩（`npm run qa:bus` 会拦）

| 规矩 | 为什么 |
|---|---|
| 模块**不许 import 其它模块**（只许 `kernel/` 与 `contracts`） | 一旦允许直接 import，模块就又开始互相缠在一起；要协作走事件或 `kernel.api()` |
| 模块**不许直接 `bus.on(...)`** | 订阅一律写进描述符的 `subscriptions`：接线集中、一眼看清谁听什么 |
| 发/听的事件名必须先在 `kernel/contracts.js` 登记 | 防止"发了没人接"或"名字拼错悄悄不生效" |
| 读别人的数据走 `kernel.snapshot.get()` | 只读；改数据走事件 + action，别去改别人的内部状态 |
| 独占资源用 `kernel.resources.claim/release` | 取代"忙就静默 return"的隐式锁（谁占着、占多久，诊断里看得见） |

## 三、模块之间怎么协作（三条正道）

```js
// ① 通知 / 命令：广播出去，谁关心谁接（推荐）
kernel.emit('sfx:play', { name: 'click' });

// ② 只读取数：跨模块读数据
const s = kernel.snapshot.get();
if (s.体力 <= 20) { /* ... */ }

// ③ 取别人的接口：同步调用，适合"问一次就完"（慎用，会重新引入直接依赖的味道）
kernel.api('audio')?.sfx?.('click');
```

## 四、现在的迁移状态

批 1 立了地基；**批 2 起业务模块开始挂上来**，清单里已有两个可以照抄的样板：

| 模块 | 看点 |
|---|---|
| [`audio/`](audio/index.js) | 最标准的订阅者：把总线事件翻译成 `public/js/audio/` 框架的调用；`api` 里给诊断/体检留了只读查询 |
| [`shell/`](shell/index.js) | 最薄的一层：外壳对事件的反应（静音图标、ctx 挂起提示）；示范"读别人状态走 `kernel.api`" |
| [`screens/`](screens/index.js) | **屏的生命周期归属**：宿主用 `own(屏id, 清理函数)` 登记自己的清理，离开时只清自己的容器（取代 `showScreen` 越界清别人）；示范"状态放模块级变量，不挂描述符" |

后续批次（state / screens / games / ai / flow）的迁移顺序与范围见 `../../docs/BUS.md` §六。
