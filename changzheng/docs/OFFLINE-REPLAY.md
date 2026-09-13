# 离线回放方案（备选）

> **状态：备选方案 · 暂不开发 · 触发条件见 §1。**
> 本文只描述设计与实施步骤，**当前代码里没有任何回放能力**：断网就是 `source=ERROR` + 界面重试提示。
> 现场已确认是「有网 Windows 笔记本」，所以默认按在线真调设计与演示；本文是风险预案，不排进当前迭代。

## 1. 状态与触发条件

**只有**下列三种情况之一发生时，才启用本方案：

1. 演示现场无外网；
2. GLM 网关不可达（DNS／代理／企业防火墙拦截）；
3. 账号额度耗尽，当天又无法充值。

启用前必须先做一次「录制局」——在**联网且额度正常**时完整跑一遍演示路径，把真实响应录下来（§3）。没有录制局就没有回放包，本方案不成立。

**这不是恢复 MOCK。** 本项目已按需求彻底删除 `mockDecision`／`mockSim`，回放不是"模型挂了就编一段"。两者最根本的区别：MOCK 凭空生成内容，回放只重放**真实调用过的模型输出**，且全程标注来源为回放（§2）。

## 2. 三条红线

1. **不编造未录制的响应**。回放命中失败时，返回错误并走既有的「重试／跳过」交互，绝不生成看似合理的替代文案。
2. **不冒充真调**。回放期间：日志 `source=REPLAY`（与 `GLM`／`ERROR` 并列，可在 `npm run qa:audit` 里一眼分辨）；顶栏 `mode-tag` 显示「离线回放」并换成警示色；终局研学报文同样加标注。
3. **未命中必须显式提示**。文案明确写「这段没有录制」，并说明可切回联网重试，而不是静默降级。

## 3. 回放包怎么来

回放包由**已有日志**离线转换得到，录制期间不需要改动任何运行时代码——这是选这个方案的关键理由。

- 构建脚本（实施时才写）：`scripts/build-replay.mjs`
- 输入：运行时日志 `logs/ai-calls-*.jsonl` 或入库样本 `logs/sample-full-run.jsonl`，只取 `source === 'GLM'` 且 `response` 存在的记录
- 输出：`data/replay/pack-<YYYY-MM-DD>.json`
- 每条记录保留：`key`（§4）、`callType`、`scene`、`response`、`recordedAt`、`model`

日志现成字段已足够支撑转换：`callType / scene / situation / options / operation / prompt{system,user} / rawResponse / response / model / timestamp`。

## 4. 匹配键

```
key = sha1(callType | scene | situation | options.join('|'))
```

**刻意不包含 `stateSnapshot` 数值**：五维资源每次都不一样，一旦入键，命中率会趋近于零。代价是"同一场景在不同资源状态下回放同一段文本"——对演示可接受，且比 miss 好。

已知取舍与边界：

- `npc_chat` 的 `situation` 含玩家自由输入，只有**预设的三个快捷问句**能命中；自由输入在离线时明确提示未录制，不按场景乱回。
- `quiz_generate` 的题目由模型现场生成，同一 `scene` 每次不同；录制局里出现的题目会被回放，题目顺序与选项一致，因而答题结果可复现。
- 资源数值不同导致 `applyEffects` 的结果与录制时不一致属于正常现象，回放只保证**文本与结构**一致。

## 5. 运行时接入点（未来实施时）

- **拦截层放在服务端**，不动前端 `public/js/ai-client.js`：客户端继续按原样请求，命中与否由服务端决定。
- 需要同时覆盖两个端点：`POST /api/decide`（主线，16 类 callType 里的 15 类）与 `POST /api/sim`（沙盘 `sim_turn`）。
- 开关来自 `runtime-config.json` 的 `REPLAY_MODE`（值为回放包文件名，缺省关闭），并在「设置」面板暴露只读状态，避免现场临时改文件。
- 命中：返回录制的 `response`，写日志 `source=REPLAY`，`durationMs` 记为 0，附带 `replayOf`（原记录 id）。
- 未命中：返回与真调失败同形的错误（前端 `decide()` 已按 `ok:false` 抛错），触发既有「重试／跳过」，不新增任何前端分支。
- 关机／清空设置时自动退回在线模式，不做隐式降级。

## 6. 覆盖率门槛

一份"可用"的回放包必须满足：

- 覆盖完整演示路径上的全部 16 类 callType：`scene_gen`、`choice_hint`、`npc_chat`、`share_judge`、`minigame_review`、`branch_judge`、`quiz_generate`、`quiz_answer_ai`、`quiz_judge`、`night_options`、`night_resolve`、`ending_review`、`act_review`、`failure_review`、`study_report`、`sim_turn`（清单与 `server/schema.js` 的 `REQUIRED` 表同源）。
- 按演示路径重跑时 **命中率 ≥ 95%**，且未命中的必须都是可跳过的可选内容。
- 自查命令（实施时提供）：`node scripts/build-replay.mjs --verify <pack>`，输出命中率与 miss 清单。

## 7. 实施清单与估时

| 工作项 | 估时 | 验收 |
|---|---|---|
| `scripts/build-replay.mjs`（转换 + `--verify`） | 0.5 天 | 能从现有日志产出回放包，verify 输出命中率与 miss 清单 |
| 服务端拦截 + `REPLAY_MODE` 开关 + 日志 `source=REPLAY` | 0.5 天 | 关掉网络仍能完整跑通主线；日志可分辨回放与真调 |
| 界面标注（顶栏 mode-tag、研学报文） | 0.25 天 | 全程可见「离线回放」标识 |
| 录制一局 + 按 miss 清单补录 | 0.5 天 | 命中率 ≥95% |

合计约 **2 天**（不含录制局需要的额度）。验收标准一句话：**拔网线跑完整局，无一屏空白、无一处伪装真调。**

## 8. 明确不做

- 不伪造未录制的响应，不用固定文案顶替模型输出。
- 不为离线改变玩法、状态机或数据结构。
- 不把回放包提交进 git：`data/replay/` 加入 `.gitignore`（或随发布包外置），避免"排练稿"混进源码历史。
- 不在 README 顶部或面向评审的材料里宣传离线能力，直到它真的被开发并验收。
