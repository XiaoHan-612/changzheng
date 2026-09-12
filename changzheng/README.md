# 《长征·抉择》

五幕 AI 科普互动游戏 · 赛道二（指定模型 glm-5.3-flash，可代替 glm-5.1）

## 快速开始

```powershell
cd changzheng
npm install
npm start
# http://localhost:3001
```

## 测试

```powershell
npm run test:unit    # 状态机单测
npm run qa:smoke     # UI 冒烟
npm run test:e2e     # 五幕 MOCK 通关
```

## 玩法一句话

暮色营地里用有限行动点走近光点；抉择交给大模型，立刻对照真实史实；启程走完于都河到会宁。

## 交互要点

- 顶部**行程缎带**：于都河 → 会宁，当前位置为红点
- **手记（回望）**：这一路的抉择与已解锁史实（快捷键 `J`）
- 事件卡选项带**倾向预告**（体力↓ 信念↑ / 风险），支持 `1/2/3` 键盘选择
- **史实回响**：你刚经历的 / 真实发生过的 / 虚构边界
- 顶栏 **答辩**：按 call_type 聚合的调用统计，路演用

## 设置

游戏内「设置」：切换模型 / API Key / 测试连通 / 重置日志 / MOCK。

## 文档

- `docs/ARCHITECTURE.md` — 架构、交互规范与约束  
- `docs/QA.md` — 测试清单  
- `docs/SCORING.md` — 评分对照  
- `docs/PITCH.md` — 路演与答辩  
- 根目录 `长征-抉择-设计方案.docx` — 完整策划案  
