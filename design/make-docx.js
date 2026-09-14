const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, LevelFormat, BorderStyle, WidthType,
  ShadingType, PageNumber, Footer,
} = require("docx");

const FONT = "Microsoft YaHei";
const FONT_SERIF = "SimSun";
const border = { style: BorderStyle.SINGLE, size: 1, color: "C4B8A0" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 90, bottom: 90, left: 120, right: 120 };

function h1(t) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT })] });
}
function h2(t) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT })] });
}
function h3(t) {
  return new Paragraph({
    spacing: { before: 120, after: 60 },
    children: [new TextRun({ text: t, font: FONT, size: 23, bold: true, color: "5C6B73" })],
  });
}
function p(t, o = {}) {
  return new Paragraph({
    spacing: { after: 100, line: 290 },
    children: [new TextRun({ text: t, font: FONT, size: 22, ...o })],
  });
}
function pRuns(runs) {
  return new Paragraph({
    spacing: { after: 100, line: 290 },
    children: runs.map((r) =>
      typeof r === "string" ? new TextRun({ text: r, font: FONT, size: 22 }) : new TextRun({ font: FONT, size: 22, ...r })
    ),
  });
}
function bullet(t) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 50 },
    children: [new TextRun({ text: t, font: FONT, size: 22 })],
  });
}
function br() {
  return new Paragraph({ children: [], pageBreakBefore: true });
}
function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const mk = (cells, isH) =>
    new TableRow({
      tableHeader: isH,
      children: cells.map((c, i) =>
        new TableCell({
          borders,
          width: { size: widths[i], type: WidthType.DXA },
          shading: isH ? { fill: "E8DCC8", type: ShadingType.CLEAR } : undefined,
          margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun({ text: c, font: FONT, size: 18, bold: !!isH })] })],
        })
      ),
    });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [mk(headers, true), ...rows.map((r) => mk(r, false))],
  });
}

const ch = [];

/* ═══════════ COVER ═══════════ */
ch.push(
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 1600, after: 160 },
    children: [new TextRun({ text: "《长征·抉择》", font: FONT_SERIF, size: 56, bold: true, color: "8B2E2E" })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: "完整项目策划案（可直接开发）", font: FONT, size: 30, color: "2C2416" })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: "赛道二 · AI游戏开发  |  指定模型：智谱 GLM-5.1", font: FONT, size: 20, color: "5C6B73" })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 500 },
    children: [new TextRun({ text: "五幕主线 · 全景热点 · 史实回响 · 语音对话 · 大模型裁决", font: FONT, size: 18, color: "5C6B73" })],
  }),
  p("版本：v2.1 正式开发稿　　日期：2026-09-12　　范围：于都出发 → 会宁会师全主线 + 音频沉浸层"),
  p("本文按「总则 → 系统（含音频）→ 逐幕详细设计 → 技术实现 → 排期」组织。每一幕写清：史实锚点、全景与近景图清单、热点坐标与玩法、AI 调用、语音点位、资源变化、史实卡、验收标准。开发者可按幕切片实现。"),
);

ch.push(br());

/* ═══════════ 0 总则 ═══════════ */
ch.push(h1("〇、项目总则"));
ch.push(h2("0.1 一句话"));
ch.push(p("玩家以年轻红军战士视角，从瑞金走到会宁。每一幕是一幅可点击的全景；有限行动点制造取舍；操作结果由 GLM-5.1 裁决并立刻弹出「史实回响」。"));

ch.push(h2("0.2 赛制硬约束"));
ch.push(table(
  ["约束", "实现"],
  [
    ["完整一局", "五幕 + 开场 + 终局，约 35–45 分钟；快速模式约 18 分钟"],
    ["AI 决策必须调指定模型", "所有智能判断走 POST /api/decide → GLM-5.1"],
    ["每次调用有日志", "logs/*.jsonl + 游戏内行军记录"],
    ["算法对抗", "每幕 1 次知识对决；支持 human_vs_ai 与 ai_vs_ai"],
  ],
  [2800, 6560]
));
ch.push(p("本地允许：小游戏手感判定、点选节奏、数值执行、屏显路由。禁止：用独立算法替代模型判断、写死题库冒充现场出题。"));

ch.push(h2("0.3 玩家角色设定（开局 2 分钟）"));
ch.push(table(
  ["项", "内容"],
  [
    ["身份", "瑞金出发时的新战士，约 17 岁，可自选出身标签（农家/学徒/学生）"],
    ["初始属性", "体力 75 / 粮食 6 / 士气 60 / 信念 65 / 民心 40"],
    ["初始关系", "老班长 35、指导员 40、红小鬼 30、卫生员 30、老乡 20"],
    ["命名", "可跳过；默认「你」，对话中第二人称"],
    ["开场问答 1 题", "「你为什么来当红军？」三选一，只影响初始士气/信念 ±5 与一句开场白，不锁结局"],
  ],
  [2200, 7160]
));

ch.push(h2("0.4 全项目统一规范"));
ch.push(h3("交互"));
ch.push(
  bullet("过场：点按推进（点一下补全文 / 再点下一句）；可跳过。"),
  bullet("营地/节点：全景百分比热点 + 呼吸光点；悬停显示子标题。"),
  bullet("行动点：每幕固定点数（见各幕）；用尽或点「行军」推进。"),
  bullet("史实回响：凡 result 带 factId，裁决后强制三栏卡片，确认后才继续。"),
);
ch.push(h3("资源与关系"));
ch.push(table(
  ["资源", "范围", "说明"],
  [
    ["体力", "0–100", "0 = 本局失败（走失败结局叙事，非直接黑屏）"],
    ["粮食", "0–20", "0 时每过一幕体力 −8；分享/钓鱼可回复"],
    ["士气", "0–100", "影响抉择成功率加权与对话选项数"],
    ["信念", "0–100", "低时结局偏「未竟」；夜校/牺牲加"],
    ["民心", "0–100", "影响老乡支线与借粮事件"],
    ["好感_×5", "0–100", "老班长/指导员/红小鬼/卫生员/老乡；delta 由模型返回"],
  ],
  [1800, 1400, 6160]
));
ch.push(h3("史实回响格式"));
ch.push(p("标题（史实名）｜左栏「你刚经历的」＝操作摘要+模型叙事｜右栏「真实发生过的」＝facts.real｜底栏「虚构边界」＝facts.fiction。按钮：「明白了，继续」。"));

ch.push(h3("画风与素材规格"));
ch.push(
  bullet("中国水彩淡彩 + 做旧纸；色板：纸黄 #E8DCC8、墨 #2C2416、红军红 #8B2E2E、金 #C4A35A、青灰 #5C6B73。"),
  bullet("全景：1536×1024 生成 → 裁水印 → 1280 宽 JPEG q82；热点用百分比坐标。"),
  bullet("立绘：1024 脸心胸像 → 280×280 PNG；场景近景同全景风格。"),
  bullet("禁：图内文字、水印、现代物、过饱和霓虹。"),
  bullet("统一 prompt 前缀（所有生图必须带）：「Chinese watercolor historical illustration, aged paper texture, muted palette #E8DCC8 #2C2416 #8B2E2E #C4A35A, no text, no watermark, no modern objects」。"),
);

ch.push(h3("音频与语音总则（详见第二章 §2.6）"));
ch.push(
  bullet("三层：环境床（风/火/水/雪）+ 操作音效 + 关键对话 TTS 人声。"),
  bullet("TTS 只配「同伴重要台词」与「史实回响标题句」，不全量配音，保证可控与风格统一。"),
  bullet("音色一人一色，全项目固定映射表；中文优先。"),
);

ch.push(br());

/* ═══════════ 1 总体结构 ═══════════ */
ch.push(h1("一、总体结构：五幕 + 开场 + 终局"));
ch.push(p("时间线按史实推进，一幕对应一段征途。每幕：过场 → 节点全景（行动点）→ 1 个主小游戏 → 1 次知识对决 → （可选）夜间/抉择 → 史实回响收束 → 行军。"));

ch.push(table(
  ["幕", "时间地点", "主题", "行动点", "主玩法", "对决", "目标时长"],
  [
    ["开场", "1934.10 于都河", "告别与出发", "0（线性）", "人设 + 渡河抉择", "无", "3–4 分"],
    ["第一幕", "1934.11–12 湘江", "代价与沉默", "4（2 日×2）", "封锁线突围 + 担架抉择", "对决1", "7–8 分"],
    ["第二幕", "1935.1 遵义", "方向与争论", "4", "会议旁听对话 + 密信抉择", "对决2", "7–8 分"],
    ["第三幕", "1935.5 金沙江—泸定", "速度与勇气", "4", "渡江节奏 + 飞夺泸定桥", "对决3", "8–9 分"],
    ["第四幕", "1935.6–8 雪山—草地", "牺牲与守望", "4", "让衣抉择 + 钓鱼分汤 + 过草地", "对决4", "9–10 分"],
    ["第五幕", "1935.9–10 腊子口—会宁", "胜利与传承", "3", "天险抉择 + 会师寄语", "对决5", "6–7 分"],
    ["终局", "会宁之后", "总评", "—", "ending_review", "—", "2–3 分"],
  ],
  [1000, 1800, 1400, 1200, 2000, 1000, 1000]
));

ch.push(pRuns([
  { text: "快速模式：", bold: true },
  "每幕只保留「主小游戏 + 对决」，营地日自动预设 1 次关键交谈，总时长约 18 分钟，供路演。",
]));

ch.push(pRuns([
  { text: "章节模板复用：", bold: true },
  "全景壳、热点组件、回响组件、对决组件、日志面板全项目共用；每幕只换 data 配置 + 场景图 + 小游戏模块。演示样品草地章即第四幕的实现样例。",
  "界面骨架两条：**舞台屏**（人物立绘 + 对白 + 抉择 / 裁决，纸卷从底部升起）与**玩法板**（小游戏专属：题名 + 数值签 + 玩法区）。人物在舞台交代任务，玩法在板上做，结算回舞台——别把玩法塞进对白纸卷里。",
]));

ch.push(br());

/* ═══════════ 2 系统 ═══════════ */
ch.push(h1("二、全局系统设计"));
ch.push(h2("2.1 每幕流程状态机"));
ch.push(p(
`intro（过场，点按）
  → node（全景 + 行动点循环）
       热点：talk | minigame | rest | share | special
       每次裁决结束 → echo（史实回响）→ 回 node
  → march（点行军或行动点尽）
  → duel（知识对决，含回响）
  → night?（有则模型生成夜间抉择）
  → next_act | ending`
));
ch.push(p("实现要求：runQuiz / runNight / 各 minigame 必须 await 用户完成，禁止「渲染完就 return」。"));

ch.push(h2("2.2 AI 调用清单（全项目）"));
ch.push(table(
  ["call_type", "用途", "返回 JSON 关键字段"],
  [
    ["npc_chat", "同伴/老乡/军官自由对话", "reply, affinity_delta, mood, flags"],
    ["minigame_review", "小游戏/休息结算", "effects, narrative, factId"],
    ["share_judge", "分粮/分汤/让物", "choice, reason, effects, narrative, factId"],
    ["branch_judge", "路线/战术/道德抉择", "result: success|partial|fail, effects, scene_text, factId"],
    ["npc_scene", "NPC 群像一句话（可选）", "line, speaker"],
    ["quiz_generate", "本幕出题", "question, options[4], answer_index, explain"],
    ["quiz_answer_ai", "AI 选手作答", "answer_index, confidence, reason"],
    ["quiz_judge", "判分", "human_score, ai_score, winner, explain, effects"],
    ["night_options", "夜间互斥抉择", "lead, options[2–3]"],
    ["night_resolve", "夜间结算", "effects, narrative"],
    ["ending_review", "终局总评", "ending_id, title, paragraphs, history_points, personal"],
    ["act_review", "每幕小结（可选）", "title, lines[2–3], unlocks"],
  ],
  [2000, 2800, 4560]
));

ch.push(h2("2.3 知识对决规则（每幕统一）"));
ch.push(
  bullet("出题约束：必须绑定本幕刚经历的节点；知识点写入 system 的 fact 摘要，禁止超纲编造。"),
  bullet("AI 选手人设：默认「稳健派老李」；ai_vs_ai 增加「激进派小张」。"),
  bullet("胜负：答对 +1；平局双方 +0.5 士气；玩家答对额外信念 +2。"),
  bullet("展示：玩家选项高亮绿/红；AI 答案与自信度气泡；解说 + 史实回响。"),
);

ch.push(h2("2.4 结局映射（终局 ending_review 输入）"));
ch.push(table(
  ["ending_id", "倾向条件（模型综合，非前端写死）", "气质"],
  [
    ["星火", "信念≥80 且 史实卡≥8/12 且 决对决平均正确≥3/5 且 关系均值≥55", "把故事讲给后来的人（隐藏）"],
    ["同行", "信念≥65 且 关键牺牲抉择正确 且 关系均值≥45", "你把路走成了队伍的一部分"],
    ["守望", "资源健康但关系偏浅或偏谨慎", "你活了下来，并记住了他们"],
    ["未竟", "体力长期偏低或关键失败", "路还长，火种还在"],
    ["无名", "体力归零中途失败专用", "你没能走到终点，但队伍还在走"],
  ],
  [1400, 5200, 2760]
));

ch.push(h2("2.5 史实卡总表（facts.json，12 张）"));
ch.push(table(
  ["id", "标题", "绑定幕"],
  [
    ["h_depart", "于都出发", "开场"],
    ["h_xiangjiang", "湘江战役", "一幕"],
    ["h_zunyi", "遵义会议", "二幕"],
    ["h_chishui", "四渡赤水", "二幕/三幕"],
    ["h_jinsha", "巧渡金沙江", "三幕"],
    ["h_luding", "飞夺泸定桥", "三幕"],
    ["h_xueshan", "翻越夹金山", "四幕"],
    ["h_fishhook", "金色的鱼钩", "四幕"],
    ["h_grassland", "过松潘草地", "四幕"],
    ["h_share", "行军中的分享", "全局"],
    ["h_nightschool", "行军中的文化学习", "全局"],
    ["h_huining", "会宁会师", "五幕"],
  ],
  [1800, 2800, 4760]
));
ch.push(p("每张卡字段固定：title, date, real, fiction, act_id, image?（可选）。开发时以本表为唯一史实来源。"));

ch.push(h2("2.6 音频与语音系统（沉浸层）"));
ch.push(h3("2.6.1 三层音频架构"));
ch.push(table(
  ["层", "内容", "触发", "实现"],
  [
    ["环境床", "风、篝火噼啪、江水、雪风、雨夜虫鸣", "进入对应场景自动 crossfade", "循环 ogg/mp3，音量 0.25–0.4"],
    ["操作音效", "点击热点、抛竿入水、起竿、翻页、回响「盖章」、对决答对/答错、资源变化提示", "本地即时", "短 wav/mp3 ≤0.4s，音量 0.5–0.8"],
    ["人声 TTS", "同伴关键台词、史实回响首句、过场旁白（可选）", "模型返回 reply/narrative 后异步播放", "TTS 服务生成 wav，缓存复用"],
  ],
  [1600, 3200, 2400, 2160]
));

ch.push(h3("2.6.2 TTS 使用策略（保证可控、风格统一）"));
ch.push(
  bullet("只对「有立绘的同伴」与「史实回响标题旁白」出声；选项按钮、系统提示不出声。"),
  bullet("每条 TTS 文本截断 ≤80 字；超长只读第一句 + 打字机继续全文。"),
  bullet("播放时立绘微动（scale 1.02 呼吸）+ 嘴部可选两张帧切换（有资源时）；无资源则光晕脉冲。"),
  bullet("用户点「跳过语音」或再次点击对话区：立即 stop，全文已显示。"),
  bullet("无 TTS 环境/失败：静默降级，不阻塞流程；日志记 audio=fallback。"),
  bullet("现场需联网：本项目**没有 MOCK 模式**，断网即 AI 内容全报错（source=ERROR + 界面「重试」键）；但音频本身永远不阻塞流程——放不出来就静默。风险预案（录制真实响应 + 按指纹回放）见 docs/OFFLINE-REPLAY.md，**尚未开发**。"),
);

ch.push(h3("2.6.3 角色音色映射表（全项目固定）"));
ch.push(table(
  ["角色", "音色建议", "气质", "示例台词"],
  [
    ["老班长", "白桦 / Dean（沉稳男声）", "低、慢、少话有力", "漂相看真了再起竿。"],
    ["指导员", "白桦（略正式）或茉莉偏沉", "讲理、耐心", "宁可多走十里，也别把人陷进去。"],
    ["红小鬼", "苏打 / Milo（少年声）", "倔、快、心软", "我腿不软。就是夜里冷。"],
    ["卫生员", "茉莉 / Chloe（温和女声或中性）", "轻、稳", "先按住伤口，别动。"],
    ["船工/老乡", "苏打或方言标签（四川话/赣南话可选）", "热、土、谨慎", "夜里能渡，跟着我的桨声走。"],
    ["宣传员", "冰糖 / Mia（清亮）", "有劲、不喊口号", "前面就是江，过了就是路。"],
    ["旁白/回响", "冰糖或茉莉（中性旁白）", "克制、像翻史书", "你刚经历的，和真实发生过的。"],
  ],
  [1600, 2800, 2000, 2960]
));
ch.push(p("实现：prompt 标签或 voice 字段写入 TTS 请求；同一角色全项目不换音色。方言标签仅用于船工/老乡 1–2 句，避免全篇方言难懂。"));

ch.push(h3("2.6.4 技术接口"));
ch.push(p(
`// 客户端
audio.playSfx('cast'|'hook'|'echo'|'correct'|'wrong'|'click'|'march')
audio.playAmbient('camp'|'river'|'snow'|'night'|'none')  // crossfade 1s
await audio.speak({ text, voiceId, actorId })  // 返回 Promise，可被 skip

// 服务端 POST /api/tts
{ text, voiceId, actorId } → { ok, url: '/audio/cache/<hash>_<voice>.wav', source: 'CACHE' }
                          | { ok: true, url: null, source: 'NONE', reason: 'no-cached-voice' }  // 没生成就静默降级
// 缓存文件名 = sha1(voiceId|text) 前 16 位 + _ + voiceId；改台词要重跑 npm run tts:manifest
`
));
ch.push(
  bullet("赛制：TTS 是表现层，不是「AI 决策」；决策仍只在 /api/decide。TTS 调用可另记 logs/tts-*.jsonl（非必须）。"),
  bullet("缓存：text hash + voiceId 为文件名，同句不重复生成。"),
  bullet("并发：同时只播 1 路人声；新句打断旧句。"),
);

ch.push(h3("2.6.5 各幕环境床与必播人声点"));
ch.push(table(
  ["幕", "环境床", "必播 TTS 点（最少）"],
  [
    ["开场", "河水 + 夜虫", "母亲 1 句、老班长 1 句"],
    ["一幕湘江", "远炮闷响 + 风 + 江水", "沉默老兵 1 句、护送结算叙事首句"],
    ["二幕遵义", "室内静 + 雨声（可选）", "指导员 1 句、方向抉择结果首句"],
    ["三幕", "急流 + 铁索风", "船工 1 句、泸定成功/失败首句"],
    ["四幕", "雪风 → 草地风+火", "老班长钓鱼台词、分汤结果首句"],
    ["五幕", "峡谷回声 → 会师人声嘈杂（低）", "向导 1 句、寄语对方复述 1 句"],
    ["终局", "安静 + 远号（可选）", "ending 标题句"],
  ],
  [1600, 2800, 4960]
));

ch.push(h3("2.6.6 验收"));
ch.push(
  bullet("进入全景 2s 内环境床起来；点热点有 click 音。"),
  bullet("老班长对话至少 1 句有声且音色正确；跳过后流程不卡。"),
  bullet("无 Key/无 TTS 时仍可完整静音通关。"),
);

ch.push(br());

/* ═══════════ 3 开场 ═══════════ */
ch.push(h1("三、开场 · 于都河（1934.10）"));
ch.push(h2("3.1 史实锚点"));
ch.push(p("中央红军主力 8.6 万余人从于都河等地出发长征。于都河渡口夜渡，群众拆门板、床板搭浮桥。"));

ch.push(h2("3.2 流程（线性，无行动点）"));
ch.push(table(
  ["步骤", "内容", "交互", "AI"],
  [
    ["S1", "黑场字幕：1934 年 10 月，于都河", "点按", "无"],
    ["S2", "人设三选一（农家/学徒/学生）+ 开场问答", "点选", "无（本地改属性）"],
    ["S3", "全景：渡口夜色，浮桥与队伍", "3 热点：母亲、老班长、河水", "npc_chat 可选"],
    ["S4", "主线：过浮桥抉择（快走 / 扶伤员 / 帮拆门板）", "点选 + 自由输入", "branch_judge"],
    ["S5", "史实回响 h_depart → 行军过场进一幕", "确认", "—"],
  ],
  [1000, 3600, 2400, 2360]
));

ch.push(h2("3.3 热点（全景 depart_pano.jpg）"));
ch.push(table(
  ["热点", "x%,y%", "内容", "消耗"],
  [
    ["母亲", "18,55", "告别对话；送一双草鞋（士气+5，老乡好感+5）", "0（线性必经可跳过打字）"],
    ["老班长", "48,50", "给你半个红薯（粮食+1）；说一句「路上把吃的让给更需要的人」", "0"],
    ["河水", "72,58", "观察水流；可自由输入「我能帮什么」→ branch_judge 解锁「帮拆门板」支线文本", "0"],
  ],
  [1400, 1200, 4800, 1960]
));

ch.push(h2("3.4 主抉择：怎么过河"));
ch.push(table(
  ["选项", "结果倾向", "effects 示意"],
  [
    ["跟着队伍快走", "success", "体力−3，士气+2"],
    ["扶一把崴脚的战友", "success（关系向）", "体力−6，信念+5，卫生员好感+4"],
    ["帮老乡拆最后一块门板", "success（民心向）", "体力−5，民心+8，老乡好感+5"],
    ["自由输入「我有别的主意…」", "branch_judge 裁", "按 result"],
  ],
  [2800, 2800, 3760]
));

ch.push(h2("3.5 素材与音频"));
ch.push(
  bullet("场景：depart_pano.jpg（渡口全景）、depart_bridge.jpg（浮桥近景）、depart_crowd.jpg（送别人群，过场第2帧）。"),
  bullet("立绘：mother.png、laoban.png（复用）。"),
  bullet("环境：river_night.ogg；音效：click、foot_bridge、farewell_chime。"),
  bullet("TTS：母亲 1 句、老班长 1 句。"),
);

ch.push(h2("3.6 验收"));
ch.push(bullet("3 分钟内可进入一幕；至少 1 次 npc_chat 或 branch_judge 落日志；解锁 h_depart。"));

ch.push(br());

/* ═══════════ 4 第一幕湘江 ═══════════ */
ch.push(h1("四、第一幕 · 湘江（1934.11–12）"));
ch.push(h2("4.1 史实锚点"));
ch.push(p("湘江战役是长征初期最惨烈一战。红军由 8.6 万锐减至 3 万余（含此前减员与逃散，战役损失极大）。当地有「三年不饮湘江水，十年不食湘江鱼」之说。主题：代价、沉默、队伍为何还在。"));

ch.push(h2("4.2 结构"));
ch.push(table(
  ["段", "内容", "时长"],
  [
    ["过场", "行军、敌机、浮桥、担架队剪影（点按 3 帧）", "1 分"],
    ["营地日", "江边临时宿营，2 日×2 行动点", "4 分"],
    ["主玩法", "「护送伤员过封锁」轻策略", "2 分"],
    ["对决1", "湘江史实", "2 分"],
    ["小结", "act_review 可选：弹幕式 2–3 句代价数字", "30 秒"],
  ],
  [1400, 5600, 2360]
));

ch.push(h2("4.3 全景热点（xiangjiang_pano.jpg）"));
ch.push(table(
  ["热点", "x%,y%", "类型", "内容摘要", "AI"],
  [
    ["浮桥边", "12,58", "minigame", "护送伤员：3 次时机选择（等/冲/绕）", "minigame_review"],
    ["担架旁", "35,52", "judge", "分一块干粮给担架队", "share_judge"],
    ["沉默的老兵", "58,48", "talk", "他几乎不说话；打字可问「水为什么不能喝」", "npc_chat"],
    ["宣传员", "75,45", "talk", "问「我们还剩多少人」→ 克制回答不报精确假数", "npc_chat"],
    ["背囊", "88,55", "judge", "休息", "minigame_review"],
    ["北岸小路", "90,40", "march", "行军 → 下一幕", "无"],
  ],
  [1400, 1200, 1200, 3600, 1960]
));

ch.push(h2("4.4 主玩法：护送伤员过封锁"));
ch.push(
  bullet("画面：江岸横版，3 个危险窗口（敌机影/火力点提示）。"),
  bullet("操作：每窗口 3 选 1——立刻冲 / 等烟散 / 绕浅滩；本地记录用时与选择，score 映射。"),
  bullet("结算：minigame_review；成功伤员保住（士气+），失败伤员加重（信念考验，不写羞辱）。"),
  bullet("史实回响：h_xiangjiang。"),
);

ch.push(h2("4.5 对决1 范围"));
ch.push(p("例：湘江战役发生的大致时间、红军损失的量级认知、「三年不饮湘江水」所指。由 quiz_generate 现场出，不写死题干。"));

ch.push(h2("4.6 素材与音频"));
ch.push(
  bullet("场景：xiangjiang_pano.jpg（江岸宿营）、xiangjiang_bridge.jpg（浮桥）、xiangjiang_wreck.jpg（损毁船只/残桥，过场）、xiangjiang_night.jpg（夜渡，回响背景）。"),
  bullet("立绘：老兵.png、宣传员.png、担架伤员.png；老班长/卫生员复用。"),
  bullet("环境：wind_river.ogg + 远炮闷 boom_low（低音量稀疏）；音效：plane_shadow、stretcher_step、rifle_far。"),
  bullet("TTS：老兵 1 句、护送结算首句。"),
);

ch.push(h2("4.7 验收"));
ch.push(bullet("行动点 4 点可消耗；护送玩法可完成；对决可答；h_xiangjiang 解锁；体力/士气变化落日志。"));

ch.push(br());

/* ═══════════ 5 第二幕遵义 ═══════════ */
ch.push(h1("五、第二幕 · 遵义（1935.1）"));
ch.push(h2("5.1 史实锚点"));
ch.push(p("遵义会议确立以毛泽东为代表的新的中央领导，在极端危急关头挽救了党、红军和革命。主题：方向、争论、实事求是。可自然引入四渡赤水作为「方向如何变成机动」的延伸对话。"));

ch.push(h2("5.2 结构"));
ch.push(table(
  ["段", "内容"],
  [
    ["过场", "进城、灰砖小楼、油灯（点按）"],
    ["营地日", "城边宿营 2×2：可找指导员深谈、可上夜校强化、可休息"],
    ["主玩法", "「会议旁听」对话剧：你不是委员，是守门的小战士；透过门缝与走廊听到争论，可对指导员转述你的理解"],
    ["抉择", "散会后指导员问「你听懂了什么」——三选一 + 自由输入 → branch_judge"],
    ["对决2", "遵义会议与转折"],
  ],
  [1800, 7560]
));

ch.push(h2("5.3 全景热点（zunyi_pano.jpg）"));
ch.push(table(
  ["热点", "x%,y%", "内容", "AI"],
  [
    ["小楼门口", "30,50", "旁听：打字表达你听到的关键词 → 指导员纠正/肯定", "npc_chat"],
    ["指导员", "55,48", "深谈「往哪里走」；好感高时解锁四渡赤水预告话题", "npc_chat"],
    ["油灯下的地图", "70,42", "辨路小交互：在图上点「向西还是向北」→ branch_judge 写后果", "branch_judge"],
    ["夜校摊", "18,60", "识字/口令（可选）", "minigame_review"],
    ["背囊", "85,58", "休息", "minigame_review"],
    ["出城小路", "92,45", "行军", "—"],
  ],
  [1600, 1200, 4400, 2160]
));

ch.push(h2("5.4 主抉择示例"));
ch.push(table(
  ["选项", "倾向", "说明"],
  [
    ["「要开个会，把方向定下来」", "success", "信念+，指导员好感+"],
    ["「听上面的就行」", "partial", "士气稳，信念+0"],
    ["「我只想知道明天往哪走」", "partial/success", "贴小战士视角，模型可写幽默克制"],
    ["自由输入", "branch_judge", "按语义与史实吻合度"],
  ],
  [3200, 1800, 4360]
));

ch.push(h2("5.5 素材与音频"));
ch.push(
  bullet("场景：zunyi_pano.jpg（会址外全景）、zunyi_room.jpg（门缝室内）、map_desk.jpg（地图桌）、zunyi_street.jpg（雨巷，过场可选）。"),
  bullet("立绘：指导员复用；可选「屋内剪影」不立绘只声。"),
  bullet("环境：rain_soft.ogg 或 room_quiet；音效：paper、lamp、door。"),
  bullet("TTS：指导员深谈 1–2 句、方向抉择结果首句。"),
);

ch.push(h2("5.6 验收"));
ch.push(bullet("旁听对话可完成 ≥1 轮；抉择有三档结果；h_zunyi 解锁；可触发四渡赤水话题（为第三幕铺垫）。"));

ch.push(br());

/* ═══════════ 6 第三幕金沙江泸定 ═══════════ */
ch.push(h1("六、第三幕 · 金沙江—泸定桥（1935.5）"));
ch.push(h2("6.1 史实锚点"));
ch.push(p("巧渡金沙江：在皎平渡等地靠船工昼夜摆渡，跳出敌军围追。飞夺泸定桥：红四团昼夜奔袭 240 里，22 勇士攀铁索夺桥。主题：速度、分工、把不可能做成。"));

ch.push(h2("6.2 结构"));
ch.push(table(
  ["段", "内容"],
  [
    ["过场", "急行军脚印、江声（点按）"],
    ["节点 A 金沙江", "全景渡口：船工、木筏、敌机影"],
    ["主玩法 A", "「摆渡节奏」：看浪窗口点按撑篙/靠岸，3 趟"],
    ["节点 B 泸定", "全景铁索桥：火力点、木板缺失"],
    ["主玩法 B", "「飞夺泸定桥」横向移动+闪避，限时；失败可重试 1 次并扣资源"],
    ["对决3", "金沙江/泸定/急行军史实"],
  ],
  [1800, 7560]
));

ch.push(h2("6.3 金沙江热点（jinsha_pano.jpg）"));
ch.push(table(
  ["热点", "x%,y%", "内容", "AI"],
  [
    ["老船工", "22,55", "对话：问「夜里能渡吗」；好感高时他多渡一趟", "npc_chat"],
    ["木筏", "45,58", "摆渡节奏小游戏", "minigame_review"],
    ["岸边伤员", "68,50", "让出自己位置给伤员先渡（牺牲向）", "share_judge / branch_judge"],
    ["背囊", "82,55", "休息", "minigame_review"],
  ],
  [1400, 1200, 4800, 1960]
));

ch.push(h2("6.4 泸定桥玩法规格"));
ch.push(
  bullet("横版：桥面缺口、对岸火力区提示；AD/触屏左右，空格/点跃过缺口。"),
  bullet("限时 45s；跌落 1 次可「战友拉住」重试（体力−10）；2 次失败走「付出代价仍过桥」叙事线。"),
  bullet("结算 minigame_review；史实回响 h_luding。"),
);

ch.push(h2("6.5 素材与音频"));
ch.push(
  bullet("场景：jinsha_pano.jpg（渡口）、jinsha_ferry.jpg（木筏近景）、luding_pano.jpg（桥头全景）、luding_bridge.jpg（铁索桥面）、luding_run.jpg（急行军脚印，过场）。"),
  bullet("立绘：船工.png、勇士队长.png。"),
  bullet("环境：rapids.ogg → iron_bridge_wind.ogg；音效：oar_splash、chain_clank、gunshot_far、step_run。"),
  bullet("TTS：船工 1 句、泸定成功/失败首句。"),
);

ch.push(h2("6.6 验收"));
ch.push(bullet("两个小游戏均可完成；失败线可推进；h_jinsha、h_luding 解锁；对决3 可玩。"));

ch.push(br());

/* ═══════════ 7 第四幕雪山草地 ═══════════ */
ch.push(h1("七、第四幕 · 雪山—草地（1935.6–8）"));
ch.push(h2("7.1 史实锚点"));
ch.push(p("翻越夹金山等雪山，衣单粮缺；过松潘草地，沼泽与断粮。军需处长让棉衣、老班长让鱼汤等事迹广为流传（部分为文学典型）。主题：把生的希望递出去。"));

ch.push(h2("7.2 结构（演示样品已实现草地部分，本幕在此扩展）"));
ch.push(table(
  ["段", "内容"],
  [
    ["节点 A 雪山", "全景雪坡：风、掉队者、棉衣"],
    ["主玩法 A", "「让棉衣」纯三幕抉择（看见—犹豫—让出）+ 可选拉人时机微操"],
    ["节点 B 草地", "全景营地（现有 camp_pano）：池塘/夜校/篝火/背囊/小路"],
    ["主玩法 B", "钓鱼起竿 + 分汤；过草地岔路图点选"],
    ["对决4", "雪山草地互助史实"],
  ],
  [1800, 7560]
));

ch.push(h2("7.3 雪山热点（snow_pano.jpg）"));
ch.push(table(
  ["热点", "x%,y%", "内容", "AI"],
  [
    ["掉队战士", "30,50", "他发抖；你是否让出外衣/半件", "share_judge"],
    ["拉人点", "55,45", "对方滑脱瞬间抓住（0.8s 窗口）", "minigame_review"],
    ["宣传员", "72,42", "拟一句鼓动，模型润色", "npc_chat"],
    ["行军", "88,48", "进草地", "—"],
  ],
  [1400, 1200, 4800, 1960]
));
ch.push(p("让棉衣三幕文案由 share_judge/branch_judge 生成，必须克制：写「他后来在你走不动时递了水壶」，不写羞辱、不写死名字。史实回响可挂 h_xueshan 或文学典型说明。"));

ch.push(h2("7.4 草地（与演示样品对齐）"));
ch.push(
  bullet("热点：池塘（钓鱼）、夜校、篝火（交谈/分享）、背囊（休息）、东边小路（行军）。"),
  bullet("强制：钓鱼 3 竿 → 分汤四选一 → 岔路图三选一 → 对决4。"),
  bullet("史实：h_fishhook / h_grassland / h_share / h_nightschool。"),
  bullet("行动点：雪山日 2 + 草地日 2 = 4。"),
);

ch.push(h2("7.5 素材与音频"));
ch.push(
  bullet("场景：snow_pano.jpg（雪坡全景）、snow_camp.jpg（雪线营地）、snow_let_clothes.jpg（让衣特写，回响背景）；草地沿用 camp_pano / pond_close / school_close / night_fire / marsh / path_choice。"),
  bullet("立绘：掉队战士.png、宣传员.png；老班长等复用。"),
  bullet("环境：snow_wind.ogg → grass_wind_fire.ogg；音效：step_snow、hook_cast、soup_pour。"),
  bullet("TTS：让衣结果首句、老班长钓鱼台词、分汤结果首句。"),
);

ch.push(h2("7.6 验收"));
ch.push(bullet("雪山让衣/拉人可完成；草地与现有 demo 无缝衔接；四张史实卡可解锁。"));

ch.push(br());

/* ═══════════ 8 第五幕腊子口会宁 ═══════════ */
ch.push(h1("八、第五幕 · 腊子口—会宁（1935.9–10）"));
ch.push(h2("8.1 史实锚点"));
ch.push(p("腊子口天险，红军攀崖奇袭夺隘。1935 年 10 月，中央红军到达吴起镇；1936 年 10 月，红军三大主力会宁会师，长征胜利结束。本游戏终局落在「会师与传承」。"));

ch.push(h2("8.2 结构"));
ch.push(table(
  ["段", "内容"],
  [
    ["节点 A 腊子口", "全景峡谷隘口：正面难攻、侧崖可攀"],
    ["主玩法 A", "「天险抉择」：正面佯攻 / 攀崖奇袭 / 绕道（耗粮）→ branch_judge；可附轻量「点火把时机」微操"],
    ["节点 B 会宁", "全景会师：队伍汇合、红旗、老乡"],
    ["主玩法 B", "「寄语」：对一个新兵说一句话（自由输入）→ npc_chat/ending 预热"],
    ["对决5", "腊子口与会师综合"],
    ["终局", "ending_review 四碎片 + 史实总览 + 行军记录"],
  ],
  [1800, 7560]
));

ch.push(h2("8.3 腊子口热点（lazikou_pano.jpg）"));
ch.push(table(
  ["热点", "x%,y%", "内容", "AI"],
  [
    ["隘口正面", "25,55", "观察火力点（信息）", "无或 npc_scene"],
    ["侧崖", "50,40", "攀崖奇袭抉择", "branch_judge"],
    ["向导老乡", "70,52", "问路；民心高则给捷径", "npc_chat"],
    ["行军", "90,48", "进会宁", "—"],
  ],
  [1400, 1200, 4800, 1960]
));

ch.push(h2("8.4 会宁全景（huining_pano.jpg）"));
ch.push(table(
  ["热点", "x%,y%", "内容", "AI"],
  [
    ["会师队伍", "40,50", "过场叙事 + 可点「数一数还有几张熟面孔」（读关系值）", "act_review 可选"],
    ["新兵", "60,52", "寄语对话（自由输入）", "npc_chat"],
    ["红旗", "75,45", "点按触发终局", "ending_review"],
  ],
  [1400, 1200, 4800, 1960]
));

ch.push(h2("8.5 素材与音频"));
ch.push(
  bullet("场景：lazikou_pano.jpg（峡谷隘口）、lazikou_cliff.jpg（侧崖）、huining_pano.jpg（会师全景）、huining_flag.jpg（红旗特写）、huining_crowd.jpg（队伍汇合，过场）。"),
  bullet("立绘：向导老乡.png、新兵.png；老班长/指导员复用。"),
  bullet("环境：gorge_echo.ogg → camp_cheer_low.ogg；音效：climb_scrape、horn_far、drum_soft。"),
  bullet("TTS：向导 1 句、寄语回应 1 句、终局标题句。"),
);

ch.push(h2("8.6 验收"));
ch.push(bullet("腊子口三向抉择有不同叙事；会师寄语可打字；终局四碎片之一；h_huining 解锁；全程日志完整；关键 TTS 可听。"));

ch.push(br());

/* ═══════════ 9 终局 ═══════════ */
ch.push(h1("九、终局结算页"));
ch.push(
  bullet("ending_review 输入：五幕资源轨迹摘要、关系五维、抉择史、对决比分、已解锁史实卡列表、寄语文本。"),
  bullet("输出展示：结局标题与 2–4 段；史实要点 3–5 条；个人寄语；「本局你成为了…」小结（资源曲线文字版 + 关系列表）。"),
  bullet("按钮：查看行军记录 / 史实档案 / 再来一局 / （可选）复制寄语。"),
  bullet("隐藏结局「星火」：达成条件时额外一段「你把故事讲给了…」。"),
);

/* ═══════════ 10 技术 ═══════════ */
ch.push(h1("十、技术实现（正式工程）"));
ch.push(h2("10.1 工程形态"));
ch.push(
  bullet("正式工程从演示样品扩展而来（样品现归档于 _archive/sample/ 与 _archive/demo-v1/，只读参考）；保留 Express + 静态前端，不引入重型框架（比赛演示友好）。"),
  bullet("**正式工程已定形**：前端零构建（原生 ES Module + DOM 叙事 + Canvas 小游戏），`npm start` 直接托管；无需任何打包步骤，改文件即生效。"),
  bullet("中文字体自托管（正文宋 / 对白楷 / 标题毛笔 / 档案明朝 / 数字 Garamond，全 OFL），随包分发、跨机字形一致；界面颜色与字号一律取自 `public/css/tokens.css`，由守卫脚本强制。"),
);

ch.push(h2("10.2 目录（实际工程）"));
ch.push(p(
`changzheng/
  package.json
  .env.example          # GLM_API_KEY / URL / MODEL / PORT
  server/
    index.js            # 路由 + 静态 + gzip
    ai.js               # VN 侧：提示词 / 真调 / 重试 / 契约校验
    sim.js              # 沙盘侧世界裁判
    schema.js           # 响应契约唯一真源（REQUIRED）
    logger.js           # JSONL 落库（按日文件 + 会话镜像 + 契约戳记）
    balance.js config.js
  public/
    index.html          # 18 个屏：标题/怎么玩/设置/过场/营地/舞台/玩法板/…
    css/                # fonts → tokens → base → framework（模板+区块）→ components
    js/                 # main.js（状态机）step.js（交互契约）minigames.js（8 玩法）
                        # sandbox.js / ui.js / state.js / audio.js / data.js / origin.js
    assets/scenes|characters|events/    fonts/    audio/{ambient,sfx,cache,reactions}/
  data/                 # acts.json facts.json sim-visuals.json tts-lines.json
  logs/                 # 入库样本 sample-full-run.jsonl + 运行时按日日志（不入库）
  tests/                # unit / e2e（Playwright）/ manual（体检脚本）
  docs/                 # 交接、架构、QA、设计系统、交付
`));

ch.push(h2("10.2.5 前端架构：内核 + 事件总线 + IP 模块（SoC 思路）"));
ch.push(
  bullet("模块之间**不直接调用**：通知/命令走事件总线，跨模块只读取数走只读快照，需要别人接口时走 kernel.api()。"),
  bullet("**模块集合不写死**：新增模块 = 写一个描述符 + 在模块清单里登记一行；内核与其它模块的文件都不用改。"),
  bullet("四条规矩由脚本强制（qa:bus）：模块间不许 import、订阅只写在模块描述符里、事件名先登记、模块必须在清单里。"),
  bullet("内核自带诊断（事件流黑匣子），可导出 JSONL——一次动作如何驱动多个模块，答辩时是可以演示的。"),
  bullet("新增交互玩法（小游戏）= 复制一个模板文件 + 填 id/题名/数值签/可操作项；宿主自动开屏、写板头、声明自动化契约。"),
);

ch.push(h2("10.3 数据驱动"));
ch.push(
  bullet("acts.json：每幕 id、标题、过场帧、行动点、热点列表（id/x/y/kind/action）、强制链、对决场次。"),
  bullet("hotspots/*.json：与 acts 分离，便于只调坐标不改逻辑。"),
  bullet("facts.json：12 张卡，见 §2.5。"),
  bullet("新增一幕 ≈ 加 1 张全景 + 1 份 hotspots + 1 个 minigame 模块 + facts 若干，不改核心状态机。"),
);

ch.push(h2("10.4 已知坑与规范"));
ch.push(table(
  ["坑", "规范"],
  [
    ["界面切走逻辑未完", "所有等待用户的小游戏/对决必须 Promise 化并 await"],
    ["模型返回非 JSON", "json_object + 正则抠 {} + 重试 1 次 + FALLBACK 标明"],
    ["effects 乱跳", "applyEffects 统一钳制；日志记 before/after"],
    ["键盘监听泄漏", "舞台销毁时 removeEventListener；resolve 时清理"],
    ["热点与图不对", "百分比坐标 + 换图 checklist；预留 Alt 微调写回"],
    ["密钥进前端", "只放 .env；/api/config 不回传 key"],
    ["玩法塞进对白纸卷", "玩法一律挂玩法板（openBoard），宿主与数值签各只有一处实现"],
    ["'看着能点却点不动'的状态", "用过的热点/选项必须当场改 DOM 标记，否则玩家困惑、自动化卡死"],
    ["契约校验漏接调用点", "每个调模型的路径都过 server/schema.js 同一张表；缺字段即重试"],
  ],
  [2800, 6560]
));

ch.push(h2("10.5 日志字段（固定）"));
ch.push(p("id, timestamp, model, scene, callType, agent, situation, options, operation, prompt{system,user}, rawResponse, response, appliedEffects, stateSnapshot, durationMs, source∈{GLM,ERROR}, contractOk（契约戳记：该响应是否满足必需字段）, attempt, requestId。"));
ch.push(p("source 只标「走的是真模型」，具体模型名看 model 字段；断网或重试用尽记 ERROR 并附原因，界面给「重试」键，不编造兜底文案。"));

ch.push(h2("10.6 验收脚本（每轮必跑）"));
ch.push(
  bullet("全流程（真调）：`npm run test:e2e`（五幕通关 + 不重复结算断言，一次约 76 次调用）；`qa:sandbox` / `qa:regress` / `qa:failure` / `qa:av`。"),
  bullet("局部（不烧 AI）：`npm run test:unit`（49 项）、`qa:smoke`、`qa:board`（玩法板 36 项）。"),
  bullet("视觉守卫：`qa:tokens`（不许新增颜色/字体/圆角字面量）、`qa:frames`（页面只用模板与区块）、`qa:tone`（纸面面积 ≤35%）、`qa:motion`（五个标准动效真的挂上）。"),
  bullet("文档守卫：`qa:handoff`（交接文档与代码契约一致）、`qa:audit`（日志 schema 审计）。"),
);
ch.push(br());

/* ═══════════ 11 素材总表 ═══════════ */
ch.push(h1("十一、素材总清单（场景加密 + 音频）"));
ch.push(h2("11.1 场景图（目标：全项目 28–32 张，风格锁死）"));
ch.push(table(
  ["幕", "全景 pano", "近景/过场 close", "用途"],
  [
    ["开场", "depart_pano", "depart_bridge, depart_crowd", "渡口、浮桥、送别"],
    ["一幕", "xiangjiang_pano", "xiangjiang_bridge, xiangjiang_wreck, xiangjiang_night", "宿营、浮桥、残骸、夜色"],
    ["二幕", "zunyi_pano", "zunyi_room, map_desk, zunyi_street", "会址、门缝、地图、雨巷"],
    ["三幕", "jinsha_pano, luding_pano", "jinsha_ferry, luding_bridge, luding_run", "渡口、木筏、铁索、急行军"],
    ["四幕", "snow_pano, camp_pano", "snow_camp, snow_let_clothes, pond_close, school_close, night_fire, marsh, path_choice", "雪山+草地（demo 复用 5 张）"],
    ["五幕", "lazikou_pano, huining_pano", "lazikou_cliff, huining_flag, huining_crowd", "天险、会师"],
    ["通用", "map_route", "echo_paper（回响底纹可选）", "大地图、UI"],
  ],
  [1000, 2200, 3800, 2360]
));
ch.push(p("生产：统一 prompt 前缀（§0.4）→ 裁水印 → 1280 宽 JPEG q82 → 标热点写 JSON。近景可 1024 宽以省体积。"));
ch.push(p("**实际落盘**：场景图 21 张、立绘 14 张、环境床 8 条、事件图 6 张，清单与用途见 changzheng/docs/ASSETS.md；新增图按约定命名落盘即生效（代码是探测式接入）。"));

ch.push(h2("11.2 角色立绘（脸心 280px）"));
ch.push(table(
  ["类别", "角色"],
  [
    ["核心同伴", "老班长、指导员、红小鬼、卫生员（已具备）"],
    ["幕专属", "母亲、湘江老兵、宣传员、船工、向导老乡、新兵、勇士队长、掉队战士"],
    ["可选", "担架伤员（半身）、文化教员"],
  ],
  [2000, 7360]
));

ch.push(h2("11.3 音频资产"));
ch.push(table(
  ["类型", "文件示例", "数量级", "备注"],
  [
    ["环境床", "camp_fire, river_night, wind_river, snow_wind, rapids, iron_bridge_wind, grass_wind_fire, rain_soft, gorge_echo", "8–10 条", "15–30s 可循环，ogg"],
    ["SFX", "click, cast, hook, splash, chain, step_snow, step_run, echo_stamp, correct, wrong, march, horn_far", "12–16 条", "≤0.4s wav/mp3"],
    ["TTS 缓存", "public/audio/cache/<hash>_<voice>.wav", "按需", "text hash + voiceId"],
  ],
  [1600, 3600, 1600, 2560]
));

ch.push(h2("11.4 风格锁（图 + 音）"));
ch.push(
  bullet("图：同一色板、同一水彩笔触、同一光线方向感（侧光/暮光）；禁止写实照片风与赛博风混入。"),
  bullet("音：环境床不抢人声；SFX 短促不卡通滑稽；TTS 不夸张译制腔。"),
  bullet("换人补图：必须先跑 1 张全景与现有 camp_pano 并排对比，色差明显则重出。"),
);

/* ═══════════ 12 排期 ═══════════ */
ch.push(h1("十二、开发排期（建议 4 周，含音频）— 已全部完成"));
ch.push(table(
  ["周", "游戏内容", "技术", "验收"],
  [
    ["W1", "工程壳 + 开场 + 一幕（湘江）+ 环境床框架", "acts 调度、audio 模块、/api/tts、qa", "两幕可连玩，有声"],
    ["W2", "二幕遵义 + 三幕金沙江/泸定 + TTS 接同伴", "ferry/luding、音色映射、缓存", "五分之三主线有声"],
    ["W3", "四幕雪山+草地 + 五幕 + 终局", "demo 升级、会师寄语、回响旁白", "全主线可通"],
    ["W4", "双 AI 同屏、快速模式、音频抛光、录屏", "泄漏修复、打包、答辩手册", "提交/上场"],
  ],
  [1000, 3200, 2800, 2360]
));

ch.push(p("四周排期已完成（W4 的录屏留到路演前做）。此后进入**视觉收口**：纸墨设计系统（7 模板 + 区块 + 5 标准动效 + 守卫脚本）逐批打磨 25 个页面，批 1–4 已完成、批 5–6 待做，进度见 changzheng/docs/DESIGN-SYSTEM.md §五。"));

ch.push(h1("十三、范围与风险"));
ch.push(h3("明确不做"));
ch.push(
  bullet("3D 大世界、实时漫游、Live2D、全剧情专业配音（只用 TTS 关键句）、网状多周目、在线匹配。"),
  bullet("把写死分支/题库包装成 AI；把 TTS 算作「AI 决策」。"),
);
ch.push(h3("风险对策"));
ch.push(table(
  ["风险", "对策"],
  [
    ["场景图工作量大", "一全景+二近景为最小集；近景可裁全景局部；W3 前锁风格批量生成"],
    ["TTS 风格不统一", "音色映射表写死；抽样试听 checklist；失败静默降级"],
    ["音频打断体验", "可关语音；点按跳过；同时只播 1 路人声"],
    ["史实出错", "facts 单一来源；高影响节点人工审"],
    ["模型慢", "「思考中」显示已等秒数；失败重试 2 次后记 source=ERROR 并在界面给原因与「重试」键；对话限长"],
    ["评委问 AI", "行军记录 source；成对对抗日志"],
  ],
  [2400, 6960]
));

ch.push(br());
ch.push(h1("附录 · 一局完整时间线"));
ch.push(p(
`00:00 开场于都河（人设+渡河）→ h_depart
04:00 一幕湘江：宿营行动 + 护送伤员 + 对决1 → h_xiangjiang
12:00 二幕遵义：旁听对话 + 方向抉择 + 对决2 → h_zunyi
20:00 三幕：金沙江摆渡 + 泸定桥 + 对决3 → h_jinsha/h_luding
30:00 四幕：雪山让衣/拉人 + 草地钓鱼分汤/岔路 + 对决4 → h_*
40:00 五幕：腊子口抉择 + 会师寄语 + 对决5 → h_huining
43:00 终局 ending_review + 档案 + 行军记录
`
));
ch.push(pRuns([
  { text: "定稿后第一步：", bold: true },
  "（已完成）把演示样品升级为 changzheng/ 工程，按 W1 先打通「开场 + 湘江」，再横向复制全景模板。",
]));

const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: FONT, color: "8B2E2E" },
        paragraph: { spacing: { before: 260, after: 140 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, font: FONT, color: "2C2416" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 } },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "《长征·抉择》完整策划案 v2.0  ·  第 ", font: FONT, size: 16, color: "888888" }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "888888" }),
            new TextRun({ text: " 页", font: FONT, size: 16, color: "888888" }),
          ],
        })],
      }),
    },
    children: ch,
  }],
});

const out = path.join(__dirname, "..", "长征-抉择-设计方案.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log("WROTE", out, buf.length);
});
