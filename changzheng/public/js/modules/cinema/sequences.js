/**
 * 三处编排 —— **纯数据**：哪儿放哪几拍、每拍说什么。拍子怎么演在 `beats.js`，怎么播在 `player.js`。
 *
 * 为什么把文案放在这里：序章/幕间/升华的"话"是**内容**，不是逻辑。内容集中一处，改台词不用碰代码；
 * 也让"这三处是不是一个口吻"变成一眼能看出来的事（克制、不掉书袋、不喊口号——策划案 §2.6 的基调）。
 *
 * 字段（详见 beats.js 顶部的拍子清单）：
 *   kind    拍子类型（封闭列表：title / map / photo / poem / seal）
 *   img     背景图（复用现成空镜：`/assets/scenes/*.jpg`）
 *   text    字幕（逐字；减动效下整段直显）
 *   voice   配音：`{ text, actorId, voiceId, file }`——**只发 voice:say 事件**，放不放得出由音频通道决定
 *   hold    'click' = 等玩家点；否则自动播（字走完 + 声播完 + holdMs 停留）
 *   holdMs  自动播的停留时长
 *
 * 序章为什么分两段（`prologue-open` / `prologue-farewell`）：中间夹着**出身三选一**，
 * 那一步是要玩家做选择的交互，不属于"电影"——播放器只演拍子，交互仍归流程层（`flow/act.js`）。
 */
export const SEQUENCES = {
  /** 序章上半场：黑场题字 → 路线图（在出身三选一之前） */
  'prologue-open': [
    {
      kind: 'title',
      eyebrow: '一九三四年十月',
      title: '于都河',
      sub: '八万六千人，八个渡口',
      note: '长征 · 抉择',
      holdMs: 5200,
    },
    {
      kind: 'photo',
      img: '/assets/scenes/depart_crowd.jpg',
      text: '没有人知道要走多远。',
      holdMs: 3600,
    },
    {
      kind: 'map',
      img: '/assets/scenes/map_route.jpg',
      stageClass: 'is-map',
      text: '地图上是一条线，走过去，是一年。',
      lit: 'all',
      revealMs: 380,
      holdMs: 4200,
    },
  ],

  /** 序章下半场：告别（在出身三选一与出发前一问之后，接营地之前） */
  'prologue-farewell': [
    {
      kind: 'photo',
      img: '/assets/scenes/depart_crowd.jpg',
      text: '母亲把一双新草鞋塞进你的背包，没再说别的。',
      // 预录台词（voice-lines.json 的 mother_bye）：文本要含关键词才会命中那条 wav
      voice: { text: '去吧。把草鞋穿上，脚别磨破了。', actorId: '母亲' },
      holdMs: 1400,
    },
    {
      kind: 'photo',
      img: '/assets/scenes/depart_bridge.jpg',
      text: '队伍开始移动。你回头看了一眼，没有停下。',
      // 预录台词（voice-lines.json 的 recruit_msg）
      voice: { text: '前面还长。记住今天。', actorId: '叙事' },
      holdMs: 1600,
    },
  ],

  /**
   * 幕间过渡：**回望上一幕 → 本幕空镜 → 本幕题字**，接营地。
   *
   * 一条编排管两件事，靠 ctx 区分（`flow/act.js` 的 `runActIntro` 是唯一调用点）：
   *   · 第一幕（`idx = 0`）**不演**——序章已经演过题字与全程路线图，再来一遍就是重复；
   *   · 第二幕起：`review` 是上一幕的幕间总评（模型给的 1–2 句，失败时为 null，那就只留空镜与题字）。
 *   底图由 `ctx.mapImg` 给（流程层用 `sceneImage()` 探测"有没有暗调新版"），缺省用现成的 `map_route.jpg`。
   * 原先这两处是 `marchTransition` 的一层闪白 + 一段 `runCutscene`，现在都归这里（批 D）。
   */
  'act-intro': ({ act, idx = 0, prev = null, review = null, mapImg = '/assets/scenes/map_route.jpg' }) => {
    if (!act || !idx) return [];
    const beats = [{
      kind: 'map',
      img: mapImg,                                // 流程层探测的结果（有 map_route_deep.jpg 就用它）
      stageClass: 'is-map',
      sfx: 'march',
      // ribbon 语义是 1 基「走到第几个」：lit=idx+1 → 已走 done、本幕 now
      lit: idx + 1,
      text: review?.lines?.length
        ? review.lines.join('')
        : `走出${prev?.title || '上一幕'}，队伍没有停。`,
      revealMs: 320,
      holdMs: 2800,
    }];
    beats.push({
      kind: 'photo',
      // 本幕空镜（与字幕口径一致）；回望文案在 map 拍
      img: act.cutAlt || act.pano,
      text: `${act.date}。${act.subtitle}——${act.theme}。`,
      holdMs: 3200,
    });
    beats.push({
      kind: 'title',
      eyebrow: `${act.date} · 第 ${idx + 1} 幕`,
      title: act.title,
      sub: act.subtitle,
      note: act.theme,
      holdMs: 4200,
    });
    return beats;
  },

  /**
   * 终章升华：会宁空镜 → 诗八句逐字 → 钤印落款。**只在成功收尾演**（失败分支不演，见 flow/end.js）。
   *
   * 节奏全部来自 `data/poem.json`：有整段朗诵就跟着它（逐句窗口是量出来的），没有就按 pace 走。
   * 可跳过（一跳到底）、可加速（1×/1.5×，同时作用于语音与逐字）。
   */
  'ending-poem': ({ photoImg = '/assets/scenes/huining_pano.jpg', paperImg = '' } = {}) => [
    {
      kind: 'photo',
      img: photoImg,
      text: '会宁的城墙下，三支队伍站到了一起。',
      holdMs: 1600,
    },
    { kind: 'poem', img: paperImg || undefined },
    { kind: 'seal' },
  ],

  /** 快速演示：只留题字一拍（约 18 分钟走完五幕，不能被序章吃掉时间） */
  'prologue-quick': [
    {
      kind: 'title',
      eyebrow: '一九三四年十月 · 江西于都',
      title: '于都河',
      sub: '八万六千人，八个渡口',
      note: '长征 · 抉择 · 快速演示',
      holdMs: 2200,
    },
  ],
};

/** 编排清单（体检与文档对账用） */
export const SEQUENCE_IDS = Object.keys(SEQUENCES);
