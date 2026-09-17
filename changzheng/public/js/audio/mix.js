/**
 * 混音表 —— 音频系统的「值」层，全项目唯一允许写音量/时长数字的地方。
 *
 * 对应视觉那套的 tokens.css：tokens.css 回答"颜色/字号是多少"，
 * 这里回答"多大音量、多长淡入淡出、闪避多少"。
 *
 * 规矩（由 scripts/check-audio.mjs 的「框架一致性」段强制）：
 * 除 audio/ 目录外，代码里不许出现 `new Audio(` / `new AudioContext` / `volume =` / `gain.value =`；
 * 除本文件外，audio/ 里不许再写通道音量数字（合成配方的频率/时长不在此列，那是"音色"不是"混音"）。
 */
export const MIX = {
  /** 总音量。要整体压低就只动这一个数 */
  master: 1.0,

  /** 四条通道的电平（相对 master）。sfx 那一档直接引用下面 sfx.level，避免两处各写一个数 */
  bus: {
    ambient: 0.80,
    bgm: 0.80,      // BGM 的"低"由下面 bgm.level 决定，总线保持平直
    sfx: 0.85,      // 与 sfx.level 同源（见下）
    voice: 1.00,
  },

  ambient: {
    /** 环境床文件元素的音量。雨声等偏吵，整体再压一档 */
    level: 0.55,
    fadeInMs: 1800,
    fadeOutMs: 600,
    /** 合成兜底的起播淡入（与 fadeInMs 独立：合成是节点级的） */
    synthRampMs: 1800,
    /** 文件缺失/解码失败 → 合成兜底；这一层兜底会在 qa:audio 里显式列为「正在兜底」 */
    allowSynthFallback: true,
  },

  bgm: {
    level: 0.14,          // 低于环境床；再压一档，避免叠上雨声后吵
    fadeInMs: 1200,
    fadeOutMs: 900,
    /** 语音播放时闪避到多少（1 = 不闪避） */
    duckWhenVoice: 0.35,
  },

  sfx: {
    /** 音效总电平（就是总线上那一档；配方里只写相对量，别再乘一次） */
    level: 0.85,
    /** 同名音效在该窗口内不重复播（防连点糊成一片） */
    throttleMs: 60,
  },

  voice: {
    level: 0.95,
    /** 语音播放期间，环境床的轻闪避（与 BGM 的重闪避配合） */
    duckAmbient: 0.75,
    /** **时长未知**时的单句最长等待（超了就当它放完了，别卡住流程） */
    maxWaitMs: 12000,
    /** 已知时长时的自适应等待：cap = duration × waitRatio + waitPadMs
     *  （整段朗诵几十秒，用 12s 硬顶会被截断——长句必须按自己的长度等） */
    waitRatio: 1.2,
    waitPadMs: 3000,
    /** 自适应结果的硬顶：再长也不能把流程挂住（红线的最后一道闸） */
    waitCeilingMs: 90000,
    /** 进度事件节流：约 10Hz 够逐字跟读；timeupdate 本身太疏，配一个定时器补齐 */
    progressMs: 100,
    /** 可选语速档位（终局升华的 1x / 1.5x）；不在表里的值一律回落到 1 */
    rates: [1, 1.5],
  },

  /** 首次发现 AudioContext 被挂起（自动播放策略）时，提示一次「点一下页面恢复声音」 */
  suspendedHint: '点一下页面恢复声音',
};
