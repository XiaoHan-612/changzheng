# 交接说明（Handoff）

> ⚠️ **本文件是总览。分工交接请看：**
> [`HANDOFF-CODE.md`](HANDOFF-CODE.md)（代码 agent）· [`HANDOFF-ART.md`](HANDOFF-ART.md)（生图模型）· [`HANDOFF-AUDIO.md`](HANDOFF-AUDIO.md)（音频/TTS 模型）· [`ASSETS.md`](ASSETS.md)（素材清单）

> 给接力的模型/同学：这份文档说明**已经做完什么、还差什么、怎么验证**。
> 目前所有自动化测试均为绿色，可以直接在现有基础上继续。

## 一、项目现状

**《长征·抉择》** — 网页端长征主题 AI 科普游戏，两种核心玩法并存：

| 玩法 | 入口 | 核心循环 | 状态 |
|------|------|----------|------|
| 五幕主线（VN） | 标题「研学模式 / 行军模式」 | 暮色营地探索 → 决策 → 模型裁决 → 史实回响 → 启程 | 完整可通关 |
| 自由行军沙盘 | 标题「自由行军」 | 自由输入行动 → 模型当世界裁判 → 世界推进 + NPC 反应 | 可玩（首版） |

## 二、已完成

### 引擎与服务端
- `/api/decide`：12 类 call_type（scene_gen / choice_hint / npc_chat / share_judge /
  minigame_review / branch_judge / quiz_generate / quiz_answer_ai / quiz_judge /
  night_options / night_resolve / act_review / ending_review / failure_review / study_report）
- `/api/sim`：沙盘单次调用完成「裁判 + 世界更新 + NPC 反应」
- 两态日志：`GLM`（成功，具体模型看 `model` 字段）/ `ERROR`（重试用尽，附原因），每次调用落 JSONL；**没有 MOCK**
- `/api/config` 读写模型与 Key，`/api/config/test` 连通测试，`/api/logs/clear` 重置

### 客户端
- 暮色营地（提灯跟随 + 行动点越少越暗）、电影事件卡、史实回响盖章
- 行程缎带、手记（回望）、键盘 `1/2/3` 选、`J` 手记、`Esc` 关浮层
- 行军模式：体力归零 → 掉队失败结算；断粮幕间扣体力；高风险抉择可能留下一个人
- 答辩面板（按 call_type 聚合）、评委演示模式（右侧实时调用流）
- 沙盘：世界面板（人/粮/士气/体力/情报）、自由输入、语音输入（Web Speech）、建议行动

### 测试
```powershell
npm run test:unit    # 5 项，资源钳制 / 史实解锁 / 失败判定
npm run qa:smoke     # 标题→营地→一次互动
npm run test:e2e     # 五幕真调通关（~57 次调用）+ 重复结算回归断言
npm run qa:sandbox   # 沙盘两回合 + 建议行动
npm run qa:regress   # 沙盘监听泄漏 / 存档回合错位回归
```

当前结果：unit 9/9 · smoke PASS · e2e FULL PASS · sandbox PASS · regress PASS

## 三、还没做 / 已知缺口（按优先级）

| 优先级 | 缺口 | 说明 |
|--------|------|------|
| P0 | ~~沙盘真调未验证~~ | 已解决：`qa:sandbox` 与 `qa:regress` 都跑真调并通过 |
| P0 | 沙盘无持久化 | ~~已解决~~ localStorage 存档，刷新可续上，`重开沙盘`可清 |
| P0 | 沙盘无模型化收尾 | ~~已解决~~ 中断/走出时调 `ending_review` 写小结 |
| P1 | 失败条件偏少 | 只有「体力≤0」触发失败；断粮有扣体力但无专属失败叙事 |
| P1 | 损失事件只覆盖 1 幕 | 仅第一幕 escort 定义了 `loss`，其余四幕待补 |
| P1 | 数值平衡未调 | 行军模式难度未实测，可能出现必败或过于轻松 |
| P1 | 沙盘无环境音 | ~~已解决~~ 进入沙盘播放 `camp` 环境床 |
| P2 | 移动端未验证 | 沙盘与主线的窄屏布局未逐项检查 |
| P2 | 沙盘多智能体偏轻 | ~~部分解决~~ NPC 有 goal 与 3 条记忆，会随回合更新；但没有「目标推进」的主动事件 |

## 三·五、沙盘 v2 新增能力（本轮）

- **事件图卡**：模型返回 `visual` 标签（rain/night_march/starve/village/loss/river/march/camp），
  每回合在纪事里插入一张现场照片卡（带标签），右上角另有全局场景标签
- **同伴语音**：NPC 反应按「角色+立场」播放预生成 wav（老班长反对/支持、卫生员担忧、
  红小鬼嘴硬、向导指路、新兵自责）；模型自由句静默
- **人物目标与记忆**：`people[].goal` / `people[].memory[]` 由模型随回合更新，面板可见
- **存档**：`localStorage` 键 `czjc_sandbox_world_v2`，每回合自动存；刷新续上
- **模型化收尾**：沙盘中断或走出时调 `ending_review` 写小结

## 四、接力的建议切入点

1. **先把沙盘接真调并跑一局**（设置→测试连通→自由行军→连做 5～8 回合），
   记录 schema 失败率；必要时在 `server/sim.js` 的 system 里收紧字段约束。
2. 给其余四幕补 `loss` 定义，并做一次行军模式通盘平衡。
3. 想再上一台阶：让 NPC 的 goal 驱动主动事件（老班长因反对而私下行动），
   而不只是反应玩家。
4. 移动端逐项检查沙盘与主线窄屏布局。

## 五、关键文件

```
server/
  index.js      路由（/api/decide /api/sim /api/config /api/logs）
  ai.js         VN 侧：提示词 + 真调 + 重试
  sim.js        沙盘侧：世界裁判提示词 + 真调 + 重试
  config.js     .env / runtime-config.json 双层配置
public/js/
  main.js       主线状态机（幕、强制链、失败结算、锁定）
  sandbox.js    沙盘循环 v2（事件图卡、语音、存档、目标/记忆、模型收尾）
  state.js      资源/好感/失败判定/粮荒（可单测）
  audio.js      环境床 + SFX + 预置语音
data/acts.json  五幕定义（热点、强制链、对决）
data/facts.json 史实卡（real / fiction 分栏）
data/sim-visuals.json  沙盘事件图与语音映射
public/assets/events/  事件场景图（rain/night_march/starve/village/loss/river）
public/audio/reactions/  同伴反应语音
```

## 六、注意事项

- 密钥只在 `.env` 与 `runtime-config.json`，永不进前端
- 小游戏手感判定算本地逻辑，**智能判断一律走 API**，答辩时按这条口径回答
- 预置语音只覆盖固定台词；模型自由回复不发声（有意为之，避免成本与不可控）
- **合作与场景口径不进界面**：对外只按"一款普通的长征叙事游戏"呈现。玩家可见的一切
  （界面文案、页面 `meta`、可复制的研学报告、模型生成内容）不写合作方名称与行业场景，
  这些口径统一放 [`PITCH.md`](PITCH.md) 与 [`SCORING.md`](SCORING.md)，答辩时口头讲。
- 改动后请跑 `npm run test:unit && npm run qa:smoke && npm run test:e2e && npm run qa:sandbox`
