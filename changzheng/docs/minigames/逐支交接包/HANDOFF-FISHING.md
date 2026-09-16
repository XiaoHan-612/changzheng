# 《金色的鱼钩》钓鱼玩法 · 交接包

> 生成于 2026-09-15。把这份文档整段粘进新对话，对方就能直接接手，**不需要再翻旧聊天**。

---

## 一、这是什么

项目是《长征·抉择》（Web 叙事游戏），可运行工程只有一处：`changzheng/`。

本次在做的事：给 **act4「雪山·草地」→「池塘边 · 钓鱼」** 做一个**真钓鱼小游戏**（第一人称视角）。

**状态：原型已完成，尚未接入主线。等用户验收后才接线。**

---

## 二、文件清单

| 文件 | 作用 |
| --- | --- |
| `changzheng/public/js/minigames-fishing.js` | 玩法本体，约 1560 行，**自包含**（自带 h/mount/stats/cssVar/palette，不 import 主线 `minigames.js`），导出 `HOOK_MINIGAMES` |
| `changzheng/public/dev/minigame-lab.html` | 玩法调试台，最下面一栏「精修玩法 · 单独开发」→ 金色的鱼钩 |
| `changzheng/public/js/minigames-story.js` | 上一批 5 个未接线的玩法（搭浮桥/担架急送/沙盘推演/分汤/花名册点名） |
| `changzheng/public/js/minigames-registry.js` | 主线玩法注册表，第 48 行起；现有 `id:'fishing'` 条目指向老玩法 `runFishing` |
| `changzheng/data/acts.json` | 章节数据，act4 草地热点 `{"id":"pond","kind":"fishing"}` **已经存在** |
| `changzheng/data/facts.json` | 史实文案：`h_fishhook`（弯针钓鱼）、`h_grassland`（松潘草地） |
| `changzheng/.fish-shots/` | Playwright 截图脚本 `shot2.mjs`（跑三竿）/ `smoke.mjs`（冒烟） |

---

## 三、怎么跑起来

```bash
cd "D:/HuaweiMoveData/Users/86196/Desktop/长征 - 副本/长征/changzheng"
node server/index.js
# 浏览器打开
http://localhost:3001/dev/minigame-lab.html
```

调试台已加时间戳防缓存（`?v=Date.now()` 动态 import），改完 JS 刷新就是最新。

**怎么玩**：按住空格（或「按住抛竿」）蓄力→松手甩出→盯漂（晃=假口，沉/黑漂=真口）→起竿→按住收线搏鱼。

---

## 四、玩法机制（数值都是调过的，别随手改）

**搏鱼三层**——这是"它是游戏不是动画"的根据：

| 项 | 值 | 含义 |
| --- | --- | --- |
| 张力甜区 | 45–82 | 收线效率 100%；<45 只有 72%，<18 只有 34% |
| 断线 | 张力到 100 撑 0.55 秒 | 鱼挣扎时硬拉 → ×2.4 飙升 |
| 脱钩 | 张力掉到 8 撑 1.4 秒 | 松手太久 |
| 磨线 | 长时间贴 92 以上 | `wear` 累积，影响最终分数 |
| 时间上限 | 45 秒 | 超时算 `timeout` 耗脱 |
| 力竭 | 鱼力气耗尽后空档变长 | 收线效率 ×2.2，这时猛收 |

- 漂相三档：`晃`(假口，起竿必空) / `沉`(真口) / `黑漂`(大物)
- 鱼会**游到饵边打转**才给漂相；中鱼后**会跳出水面**，离水那下线会松（`jumpSlack 14`），是脱钩高危
- 三竿一局，篓里有几条算几条

**鱼种**（按史实改过，水泡子里只有小鱼）：
泥鳅 0.13m / 小鲫鱼 0.19m / 小鲤 0.33m / 老鲤 0.47m，按远近分区（近岸浅水 → 远处深水）。

---

## 五、画面（草地史实版，2026-09-14 重做过）

考据：`acts.json` act4「雪山·草地」·池塘边；`facts.json` h_fishhook / h_grassland = **松潘草地 1935 年 8 月、沼泽遍布、粮食断绝、弯针钓鱼**。

- 天：铅灰厚云压顶，**没有太阳、没有鸟**，天地之间压一层湿雾
- 水：四十米宽的**沼泽水泡子**，泥炭水浑黄发黑（不是大河）
- 对岸：枯草甸 + 一丛丛草墩（塔头），**没有一棵树**；雾里 132 米处有宿营帐篷、人影、一缕青烟
- 天气：斜雨丝 + 雨点打在水面一圈圈化开 + 冷调罩 + 暗角（`drawWeather`）
- 近景：脚下会晃的泥炭草墩、被雨压弯的枯黄苔草、握着树枝做的竿的手
- **题眼**：整幅画冷灰，唯一的金色是那枚**弯针磨成的鱼钩**（中鱼时会发光）
- HUD：左上「松潘草地 · 八月 · 冷雨 · 干粮已断」，右上「篓 x · 够一碗汤」；入篓文案「够给伤员煮一口汤」

---

## 六、契约（与主线玩法一致，见 `public/js/step.js` 顶部）

1. 签名 `runXxx(container, opts) -> Promise<{score, detail, summary?}>`
2. 容器 `dataset.mini`（= `goldenhook`）/ `dataset.miniState`
3. 可交互元素带 `[data-mini-action]`：`cast / recast / hook / reel`
4. 离开板屏自清动画与监听（`AbortController` + `document.body.contains` 检查）

额外可观测状态（自动化靠它们判断何时该按）：
`miniRod / miniTension / miniDist / miniStamina / miniStruggle / miniBite / miniPower / miniFish / miniJump`

---

## 七、已完成 / 还没做

**已完成**
- 第一人称透视（针孔模型：`HORIZON=148 / FOCAL=900 / EYE_H=1.2`，鱼按米算距离）
- 蓄力抛竿控落点（5.2–15 米，落点决定够得着谁）
- 漂相三档、假口惩罚、跳鱼、入篓动画（鱼被拎出水面朝镜头飞）
- 草地史实版画面（雨/雾/泥炭水/宿营剪影）
- 上一版 bug：一竿收尾后 `toIdle()` 没清 `tension`，竿僵在上一竿的弯度——已修（`toIdle` 全量归零 + `tensionView` 缓动回直）

**没做 / 待定**
- 未接主线（用户验收后才接）
- 音效用 `audio.js` 的 `cast / hook / click / wrong`，可选
- 移动端触屏未专门适配（目前是 pointerdown/up + 按钮）

---

## 八、验收通过后怎么接线（最小改动 = 一处）

`data/acts.json` 的 `pond` 热点 `kind:"fishing"` 已经存在，**不用动**。
只需改 `public/js/minigames-registry.js` 第 50 行的 `fishing` 条目：

```js
{
  id: 'fishing',
  title: '金色的鱼钩',
  family: '时机',
  run: (host, opts = {}) => runGoldenHook(host, opts),   // ← 换成新玩法
  states: ['idle','charge','cast','wait','window','fight','landed','broken','done'],
  actions: ['cast','recast','hook','reel'],
  act: 'act4 · 草地',
  note: '……',
}
```
再在文件顶部 `import { runGoldenHook } from './minigames-fishing.js';`（连同老 `runFishing` 是否保留要问用户）。

---

## 九、这位用户的协作偏好（务必遵守）

1. **改完一版立刻给他看**，不要先跑长流程验证（他明确嫌慢）。语法过一遍就行。
2. **单独开发、验收后再接线**：新玩法先放独立文件 + 调试台分区，他玩过说合格才进主线。**不要直接改 `acts.json` / `main.js` / `minigames.js` / 注册表。**
3. **要"真"**：他评价"这是游戏还是只是点一下播个动画"。做玩法必须答得出"玩家的决策在哪、失败条件是什么"；画面要符合史实，不要抽象示意图。
4. **给证据**：要具体数字和结论，不要只说"已完成"。
5. 他认可的好例子：真透视、真鱼会游、鱼会跳、收线是鱼一点点变大变近——不是数值条在动。

---

## 十、这个仓库的几个坑

- **同一文件不要并行发多个 Edit**：会互相覆盖，只有最后一个生效（真踩过，表现为"文件一半新一半旧"）。分散改动就先 Read 全文再 Write 重写。
- **浏览器缓存**：静态资源 `max-age=3600`，改了 JS 不刷新会看到旧版。调试台已加时间戳，主线页面要 Ctrl+Shift+R。
- **本机没有 Google Chrome**：Playwright 用例硬编码 `channel:'chrome'`，要跑得手动指定
  `%LOCALAPPDATA%\ms-playwright\chromium-1223\chrome-win64\chrome.exe`。
- **bash shim 缺 coreutils**：`ls/tail/head/dirname` 都没有，用 `node -e` 或绝对路径 node 代替。
- **截图脚本 `shot2.mjs` 结尾 `browser.close()` 偶发挂起**被 SIGTERM，截图其实已完整，不影响。
- 配置层：`runtime-config.json` 会覆盖 `.env`（见 `server/config.js:40-53`），排查接口问题时先看它。
