/**
 * 《夜校识字 · 一灯油》（**重做版 · 单独开发，未接入主线**）
 *
 * ── 它取代的是什么 ──
 *   旧版（minigames.js 的 runNightSchool，58 行）：三道写死的单选题，
 *   **三道的正确答案都是 A**（`a: 0`）——一路点 A 就是 3/3 满分；
 *   "口令"也写死成 `'瑞金'`。玩家没有决策、没有代价、没有输的可能。
 *   模型全程只在末尾写一段旁白，一处决策都没做。
 *
 * ── 这一版是什么 ──
 *   历史锚点（data/facts.json · h_nightschool）：
 *   "红军强调官兵识字，以树枝当笔、大地当纸，用**具名、地名、口令**作课本。"
 *
 *   于是这一局只有两件事：
 *     ① **模型定课本**（开局一次调用）：它读你这一局实际走过的路，
 *        定下今晚教哪三个字、每个字一句解释、以及今晚的口令是什么。
 *     ② **你只有一灯油**：一盏马灯、一片光圈、22 秒油。
 *        三个字的总学费是 22 × 0.95 秒 —— 瞄准不差分毫才勉强教得完三个，
 *        手一抖就只够教两个。取舍是被迫发生的，不是我给你出的题。
 *
 * ── 玩家的决策在哪 ──
 *   · **先教哪个**：口令今晚夜岗就要用（刚性）、地名明天行军要用、人名管关系与士气。
 *     三个都想要，油只够两个 —— 必须砍掉一个。而砍哪个是你的事：
 *     木牌上只写着"口令 / 地名 / 人名"，**具体是哪个字、什么解释，要照上去才看得见**。
 *   · **怎么分油**：光圈中心离字心越近，这个字涨得越快。总吞吐恒为 1 秒/秒、
 *     按距离劈给各字 —— 落在两个字中间就是一份光劈两半，谁都不够。
 *   · **什么时候收灯**：灯烧得越久，远处草坡上的黑影越多。
 *
 * ── 失败条件（三种收场都算数）──
 *   · `taught` 照透了   → 这个字真教出去了
 *   · `half`   照了一半 → **传下去会走样**（模型会写出它变成了什么字）
 *   · `none`   一点没照到 → 今晚没教
 *   口令那一项没教成 → `detail.passwordOk = false`：今晚哨位只能硬扛。
 *   **最坏的不是"没教"，是"全教歪了"**：三个字都半懂时得分比只教成一个还低（见 gradeOutcome）。
 *
 * ── 与下游《夜岗》的接口 ──
 *   `detail.password` 就是模型今晚定的口令。接线时写进 `S.tonightPassword`，
 *   夜岗那条"未学过口令只能硬扛"的分支（main.js:1632）就会按实际情况分叉。
 *
 * ── 模型参与了两处（不是一处文案）──
 *   1. `school_lesson`（server/ai.js 的提示词）——**定课本**：三个字、三个解释、今晚口令。
 *      客户端 `gateLesson()` 是纯字符串闸：from 必须在候选池里、ch 必须真出现在 from 里、
 *      三种 kind 各一。不合格就重试，再不合格落备课本（且界面**明说是备课本**）。
 *   2. `minigame_review` + `operation.type='school'` ——**判你这三个字教成什么样**：
 *      照透的会传下去、照一半的会变成别的字。
 *
 * ── 独立到什么程度 ──
 *   不 import minigames.js；不进 minigames-registry.js；不写 acts.json。
 *   自带 stats / cssVar / sfx / clamp；样式运行时注入（前缀 smini3-）。
 *   外部依赖只有 audio.js 与 ai-client.js（薄 fetch 封装），调用处全包了 try。
 *
 * ── 契约（与主线玩法完全一致，见 public/js/step.js 顶部）──
 *   1. 签名  runXxx(container, opts) -> Promise<{ score: 0..1, detail, summary? }>
 *   2. 容器  container.dataset.mini / container.dataset.miniState
 *   3. 操作  所有可交互元素带 [data-mini-action]（本支：stage=aim、按钮 begin/douse）
 *   4. 自清  离开板屏后动画 / 定时器 / 监听自行停止
 *
 * ── 额外可观测状态（自动化靠它们驱动，见 tests/manual/qa-school.mjs）──
 *   miniOil     剩余油 0–100
 *   miniFocus   光圈罩在第几个字（-1 = 一个都没罩到）
 *   miniTaught  三个字的完成度 "0.62,1.00,0.00"
 *   miniNeeds   三个字各需要多少秒 "8.90,2.88,8.90"
 *   miniOutcome 结局词：all | two | wrong-all | pw-missing | partial | nothing
 *
 * 玩法 id：`nightschool`
 */

// 模型窗口：夜校的两处调用（开局定课本 / 局末复盘）都套 10 秒上限——
// 网关挂起时不能把玩家停在"教员合上本子……"上（见 ai-window.js）。
import { decideWithin } from './ai-window.js';

/* ── 宿主注入（我们的架构：玩法不碰音频门面、数值签归宿主）────────────────
 * 这一段由 tools/intake-minigames.mjs 插入；要改缝合方式请改工具，别手改这里。
 * 宿主（modules/games/adapter.js）在装配这一支时调 bindHost({sfx, stats, decide})：
 *   sfx(name)     音效：宿主转成总线事件 sfx:play（玩法不认识音频框架）
 *   stats(items)  数值签：宿主唯一实现，返回句柄（{标签: <b>元素}）
 *   decide(payload) 需要模型时由流程层注入（玩法自己不发请求，见 docs/MINIGAMES-INTAKE.md）
 */
let SFX = () => {};
let STATS = (items) => items;
let DECIDE = null;
export function bindHost(h = {}) {
  if (h.sfx) SFX = h.sfx;
  if (h.stats) STATS = h.stats;
  if (h.decide) DECIDE = h.decide;
}

/* ── 小工具（与 minigames.js / minigames-needle.js 同名同义，故意不共享） ── */

function stats(_host, items) { return STATS(items); }

function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function sfx(name) {
  try { SFX(name); } catch { /* 单独搬走没有音频模块也不该炸 */ }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** 确定性随机：星点、草丛、远处草坡的黑影，每局位置一样，画面才稳 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── 一局的骨架 ──
   设计坐标 720×430；k = 实际宽 / 720。位置与尺寸跟着 k 走，
   **字始终按屏幕 px 定死** —— 就是"文字发糊"那一轮学到的：
   设计 px ≠ 屏幕 px（玩法板内容宽只有 570，缩放 0.79）。 */
const DW = 720, DH = 430;
const BOARD = { x: 118, y: 30, w: 344, h: 330 };
const CELL = BOARD.h / 3;              // 每格高 —— 光圈大小全部以它为单位
const GLYPH_BOX = CELL * 0.92;
const ROW_PAD = 22;

/* 光圈：以"格"为单位，与布局无关。
   R_OUT (=93.5) 小于相邻两格的中心距 (=110)，所以**正对着一个字时，隔壁那个一点光都分不到**。
   注意吞吐是**归一化**的（见 step()：prog += dt·raw/Σraw），于是"把光停在两个字中间"
   = 各拿一半速率，合起来仍是一次专攻的速度 —— 实测那是一条**保守打法**（QA 的 S5：0.800/two），
   不是失误。真正有成本的是"三个都要"：总学费 20.9 秒，油只有 22 秒，余量 1.1 秒。 */
const R_IN = 0.55 * CELL;
const R_OUT = 0.85 * CELL;

const OIL_SECONDS = 22;
/** 三个字的总学费：0.95 是故意的 —— 瞄准不差分毫才勉强教得完三个（22 秒里只剩 1.1 秒余量），
 *  手一抖、把光停在两个字中间，第三个字就保不住。取舍因此是被迫发生的。 */
const NEED_BUDGET = OIL_SECONDS * 0.95;

const LEVEL_MUL = { 生字: 1.7, 半熟字: 0.55 };

/** 三种字：位置固定（口令 / 地名 / 人名 从上到下），玩家才记得住该往哪儿照。
 *  hint 是格子里那行小标签，**必须短** —— 信息列只有 ~147px 宽，长了就被省略号吃掉。 */
const KINDS = [
  { kind: '口令', weight: 0.50, hint: '夜岗要用' },
  { kind: '地名', weight: 0.30, hint: '行军认路' },
  { kind: '人名', weight: 0.20, hint: '关系士气' },
];

const POOLS = {
  草地: ['松潘', '毛儿盖', '班佑', '若尔盖', '巴西', '草地', '夹金山', '雪山', '泸定桥',
    '金沙江', '皎平渡', '腊子口', '瑞金', '于都', '遵义', '赤水', '湘江',
    '老班长', '小号手', '指导员', '卫生员', '红小鬼', '同志', '战友', '司务长'],
  遵义: ['遵义', '瑞金', '于都', '湘江', '乌江', '赤水', '娄山关', '桐梓', '泸定桥',
    '金沙江', '草地', '腊子口', '老班长', '指导员', '卫生员', '红小鬼', '司务长',
    '宣传员', '小号手', '同志', '战友'],
};

const PLACE_NAME = {
  草地: '松潘草地 · 1935 年 8 月 · 宿营地的马灯',
  遵义: '遵义老城 · 1935 年 1 月 · 深夜的油灯',
};

/** 备课本：模型不可用时用，界面会明说这是备课本，不假装是模型给的 */
const FALLBACK = {
  草地: {
    teacher_line: '今晚照木牌认三个字。一个是今晚的口令，一个是我们脚下这块地方，一个是身边的人。',
    password: '瑞金',
    chars: [
      { ch: '瑞', kind: '口令', from: '瑞金', gloss: '我们从那儿走出来的地方。今晚哨位上，先问这两个字。', level: '半熟字' },
      { ch: '松', kind: '地名', from: '松潘', gloss: '这片水草地叫松潘。往北走，都是这样的水。', level: '生字' },
      { ch: '班', kind: '人名', from: '老班长', gloss: '班长是夜里给人掖被子的那个人。记住这个字。', level: '生字' },
    ],
  },
  遵义: {
    teacher_line: '今晚照木牌认三个字。一个是今晚的口令，一个是我们刚进的这座城，一个是身边的人。',
    password: '瑞金',
    chars: [
      { ch: '瑞', kind: '口令', from: '瑞金', gloss: '我们从那儿走出来的地方。今晚哨位上，先问这两个字。', level: '半熟字' },
      { ch: '遵', kind: '地名', from: '遵义', gloss: '脚下这座城。往后说到"转折"，都从这两个字起头。', level: '生字' },
      { ch: '导', kind: '人名', from: '指导员', gloss: '指导员念信、念命令。念到"导"字，就是他在念。', level: '生字' },
    ],
  },
};

/* ── 样式（运行时注入；画面自己的色写在 JS 里，不碰项目 CSS） ── */
function ensureStyle() {
  if (document.getElementById('school-mini-style')) return;
  const s = document.createElement('style');
  s.id = 'school-mini-style';
  s.textContent = `
.smini3-wrap { display: flex; flex-direction: column; gap: 9px; align-items: center; width: 100%; }
.smini3-stage { position: relative; width: 100%; max-width: 720px; margin: 0 auto; overflow: hidden;
  border-radius: 6px; border: 1px solid var(--rule-strong, rgba(0,0,0,.2)); background: #05080b;
  cursor: crosshair; touch-action: none; user-select: none; }
.smini3-layer { position: absolute; inset: 0; pointer-events: none; }

.smini3-night { background:
  radial-gradient(140% 96% at 50% 112%, #1b2a34 0%, #101a21 44%, #070d12 78%, #04070a 100%); }
.smini3-star { position: absolute; width: 2px; height: 2px; border-radius: 50%;
  background: rgba(214,228,238,.62); }
.smini3-hill { position: absolute; left: 0; right: 0; bottom: 21%;
  height: 32%; background: #0a1116; clip-path: polygon(0 78%, 9% 52%, 18% 66%, 27% 40%,
  38% 60%, 47% 34%, 58% 56%, 68% 38%, 79% 62%, 88% 46%, 100% 70%, 100% 100%, 0 100%); }
.smini3-ground { position: absolute; left: 0; right: 0; bottom: 0; height: 24%;
  background: linear-gradient(#0b1013, #06090b); }
.smini3-grass { position: absolute; bottom: 0; width: 3px; border-radius: 2px 2px 0 0;
  background: #16201d; transform-origin: bottom center; }
.smini3-watch { position: absolute; border-radius: 50% 50% 42% 42%;
  background: #04070a; opacity: 0; }

.smini3-beam { position: absolute; height: 1px; transform-origin: 0 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(255,206,130,.30), rgba(255,206,130,0)); }

.smini3-board { position: absolute; border-radius: 3px;
  background: linear-gradient(178deg, #cdae7c 0%, #c2a173 52%, #b0905f 100%);
  box-shadow: inset 0 0 0 3px #7c5f39, inset 0 0 0 5px #9c7c4e; }
.smini3-lit { position: absolute; inset: 0; }
.smini3-row { position: absolute; display: flex; align-items: center; min-width: 0; }
.smini3-glyph { flex: none; text-align: center; color: #150e05; line-height: 1;
  font-family: var(--font-kai, "KaiTi", serif);
  /* 墨要够深：亮木牌（#cdae7c 起）上的 #2a2015 是"糊"的 —— 和弯针那轮同一个毛病。
     再补一道极浅的顶影，让字看着像刻进木头，而不是浮在木头上。 */
  text-shadow: 0 1px 0 rgba(255,246,226,.36), 0 -0.5px 0 rgba(58,38,16,.34); }
/* 解释（模型的 gloss）**不放格子里**：20–40 字塞进 1/3 个格子只能挤成两行小字，
   还会跟下面那行类名打架 —— 先前那版就是这里重叠的。改到舞台底部的读字条去（.smini3-foot）。 */
.smini3-info { flex: 1 1 auto; min-width: 0; position: relative; height: 100%; }
.smini3-from { position: absolute; margin: 0; color: #5e4a2a; white-space: nowrap;
  line-height: 1.4; overflow: hidden; text-overflow: ellipsis; }

.smini3-dark { position: absolute; inset: 0; pointer-events: none; }
.smini3-glow { position: absolute; inset: 0; pointer-events: none; }
.smini3-bars { position: absolute; inset: 0; pointer-events: none; }
.smini3-bar { position: absolute; }
.smini3-kind { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.smini3-kind .k-label { flex: 1 1 auto; min-width: 0; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.smini3-kind .k-val { flex: none; }
.smini3-mk { width: 100%; height: 5px; border-radius: 3px; background: rgba(238,232,212,.17);
  overflow: hidden; margin-top: 3px; }
.smini3-mk > i { display: block; height: 100%; width: 0%;
  background: linear-gradient(90deg, rgba(233,193,110,.45), #e9c16e); }
.smini3-mk.done > i { background: linear-gradient(90deg, #e9c16e, #f6e3ad); }

.smini3-lamp { position: absolute; }
.smini3-boy { position: absolute; }
.smini3-say { position: absolute; padding: 2px 8px; border-radius: 10px; white-space: nowrap;
  background: rgba(12,18,22,.88); border: 1px solid rgba(233,193,110,.45); color: #e9c16e;
  opacity: 0; transition: opacity .18s ease; }
/* 读字条。舞台是**夜**，所以这里的字色全部写死浅色 ——
   用 --ink-0/--ink-2 会拿到浅色主题的深墨（#241d14 / #6a5a42），
   在黑底上等于没写（先前那版底下那行提示就是这样消失的）。 */
.smini3-foot { position: absolute; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  padding: 4px 14px; background: rgba(6,10,13,.80);
  border-top: 1px solid rgba(233,193,110,.16); }
.smini3-read { margin: 0; width: 100%; color: #cdc6b4; line-height: 1.42; text-align: center;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.smini3-read .r-ch { color: #f0d59a; }
.smini3-read .r-from { color: #9d9078; }

.smini3-hud { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 720px; }
.smini3-oil { flex: 1 1 auto; height: 9px; border-radius: 5px; background: rgba(120,104,80,.3);
  overflow: hidden; border: 1px solid rgba(196,183,156,.24); }
.smini3-oil > i { display: block; height: 100%; width: 100%;
  background: linear-gradient(90deg, #f0d59a, #d8a94e); transition: width .1s linear; }
.smini3-oil.low > i { background: linear-gradient(90deg, #dd9a78, #b8543a); }
.smini3-status { margin: 0; text-align: center; font-size: 14px; line-height: 1.7; min-height: 24px;
  color: var(--ink-0); font-family: var(--font-kai, var(--font)); }
.smini3-status .warn { color: var(--seal); }
.smini3-status .good { color: var(--gold); }
.smini3-hint { margin: 0; text-align: center; font-size: 12px; color: var(--ink-2); line-height: 1.6; }
.smini3-hint b { color: var(--ink-0); font-weight: 400; }
.smini3-actions { display: flex; gap: 10px; justify-content: center; min-height: 34px; align-items: center; }
`;
  document.head.appendChild(s);
}

/* ══ 内容闸 + 计分（导出成纯函数，方便单测） ══ */

/**
 * 模型给的字必须落在候选词池里。
 * 为什么要有这道闸：quiz_generate 那条线吃过"模型把 answer_index 写坏"的亏
 * （main.js:2093 至今挂着 normIdx 兜底）。教材同理 —— 模型编一个今天没出现过的字，
 * 玩家就会看到一本跟今天毫无关系的课本，而且"口令喂给夜岗"那条线会断。
 * 纯字符串校验，零成本、可复现。
 *
 * @returns {{lesson:object|null, notes:string[]}}
 */
export function gateLesson(raw, pool) {
  const notes = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { lesson: null, notes: ['返回不是对象'] };
  const one = /^[\u3400-\u4dbf\u4e00-\u9fff]$/;
  const inPool = (s) => typeof s === 'string' && pool.includes(s);

  const seen = new Set();
  const chars = [];
  let passed = 0;                 // 模型自己通过闸的字有几个
  for (const c of (Array.isArray(raw.chars) ? raw.chars : [])) {
    if (!c || typeof c !== 'object') continue;
    const ch = String(c.ch || c.char || '').trim();
    // 字段别名：实测模型很爱写 type / word / source 而不是 kind / from。
    // 提示词里已经写明用 kind/from，但多认几个同义词能少落几次备课本（闸本身不放宽）。
    const from = String(c.from || c.word || c.source || '').trim();
    const kind = String(c.kind || c.type || '').trim();
    if (!one.test(ch)) { notes.push(`"${ch}"不是单个汉字`); continue; }
    if (!inPool(from)) { notes.push(`来源词"${from}"不在候选池`); continue; }
    if (!from.includes(ch)) { notes.push(`"${ch}"并不出现在"${from}"里`); continue; }
    if (!KINDS.some((k) => k.kind === kind)) { notes.push(`未知 kind "${kind}"`); continue; }
    if (seen.has(kind)) { notes.push(`${kind}重复了`); continue; }
    seen.add(kind);
    passed += 1;
    chars.push({
      ch, from, kind,
      gloss: String(c.gloss || '').slice(0, 60),
      level: LEVEL_MUL[c.level] ? String(c.level) : '生字',
    });
  }
  // **模型的三个字一个都没过闸** → 直接判这节课不成立。
  // 不能悄悄用池子补满三个就算了：那样界面会标"课本由模型所定"，
  // 而实际上模型一个字都没贡献 —— 宁可老实落备课本（界面会明说）。
  if (passed === 0) {
    return { lesson: null, notes: [...notes.slice(0, 3), '模型的三个字一个都没通过闸'] };
  }
  // 只过了一两个：缺哪种就从池子里补一个能用的（notes 里如实记着补了哪个）
  for (const k of KINDS) {
    if (seen.has(k.kind)) continue;
    for (const w of pool) {
      if (chars.some((x) => x.ch === w[0])) continue;
      chars.push({ ch: w[0], from: w, kind: k.kind, gloss: '', level: '生字' });
      seen.add(k.kind);
      notes.push(`${k.kind} 由客户端补位：${w}`);
      break;
    }
  }
  if (chars.length < 3) return { lesson: null, notes: [...notes, '凑不齐三个字'] };

  const ordered = KINDS.map((k) => chars.find((c) => c.kind === k.kind)).filter(Boolean).slice(0, 3);
  const pw = ordered.find((c) => c.kind === '口令');
  let password = String(raw.password || '').trim();
  if (!inPool(password)) { notes.push(`口令"${password}"不在候选池，改用「${pw.from}」`); password = pw.from; }
  // 口令必须就是"口令字"的来源词，否则今晚的暗号和木牌上的字对不上
  if (password !== pw.from) { notes.push(`口令与口令字不一致，改用「${pw.from}」`); password = pw.from; }

  return {
    lesson: {
      teacher_line: String(raw.teacher_line || '').slice(0, 120),
      password,
      chars: ordered,
    },
    notes,
  };
}

/** "生字/半熟字" → 秒，并归一化到总预算 */
export function needsOf(chars) {
  const raw = chars.map((c) => LEVEL_MUL[c.level] || LEVEL_MUL.生字);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((r) => (r / sum) * NEED_BUDGET);
}

/** 半懂算几成 —— 0.4 是故意的：低于"地名+人名全教成"(0.5)，
 *  「三个字都只教了一半」必须严格差于「放弃一个、另两个教全」。 */
const HALF_CREDIT = 0.4;
/** 进度超过这个比例才算"照到了一半"，否则等于没照 */
const HALF_AT = 0.42;

/**
 * 纯函数计分：q = 0（没教）/ 0.4（半懂）/ 1（教成）。
 * 权重和 = 1.0，三个字全教成 = 1.0（对外封顶 0.98）。
 * 实测分层（同一份代码，不同打法）：
 *   0.98 三个都教成 ｜ 0.80 口令+地名 ｜ 0.70 口令+人名
 *   0.50 砍掉口令但另两个教全 ／ 只教成口令 ｜ 0.40 三个都半懂 ｜ 0.00 乱照
 */
export function gradeOutcome(prog, needs) {
  const q = prog.map((t, i) => {
    const f = needs[i] > 0 ? t / needs[i] : 0;
    return f >= 0.999 ? 1 : f >= HALF_AT ? HALF_CREDIT : 0;
  });
  const score = KINDS.reduce((a, k, i) => a + k.weight * q[i], 0);
  const words = q.map((v) => (v === 1 ? 'taught' : v === HALF_CREDIT ? 'half' : 'none'));
  const nFull = words.filter((w) => w === 'taught').length;
  const nHalf = words.filter((w) => w === 'half').length;
  let outcome;
  if (nFull === 3) outcome = 'all';
  else if (nFull === 2) outcome = 'two';
  else if (nHalf === 3) outcome = 'wrong-all';
  else if (nFull === 0 && nHalf === 0) outcome = 'nothing';
  else if (words[0] !== 'taught') outcome = 'pw-missing';
  else outcome = 'partial';
  return { score: clamp(score, 0, 0.98), q, words, outcome };
}

/* ── 画面零件（静态 SVG，只建一次） ── */
function lampSvg() {
  return `<svg viewBox="0 0 56 70" width="100%" height="100%">
    <path d="M20 9 h16 M28 9 v7" stroke="#6d6a60" stroke-width="2" fill="none"/>
    <path d="M13 21 q15 -12 30 0 z" fill="#4c4a44"/>
    <rect x="13" y="20" width="30" height="5" rx="2" fill="#6d6a60"/>
    <path d="M16 25 h24 l-3 30 h-18 z" fill="#3c3f42"/>
    <path d="M18.4 27.5 h19.2 l-2.4 25 h-14.4 z" fill="#f6d489" opacity=".92"/>
    <ellipse cx="28" cy="40" rx="6" ry="9" fill="#fff3cc"/>
    <rect x="13" y="55" width="30" height="7" rx="2.5" fill="#6d6a60"/>
    <path d="M10 62 h36" stroke="#6d6a60" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M25 55 v-9 M31 55 v-9" stroke="#3c3f42" stroke-width="1.2"/>
  </svg>`;
}

function boySvg() {
  return `<svg viewBox="0 0 150 190" width="100%" height="100%">
    <g fill="#070b0e">
      <path d="M46 50 q29 -23 58 0 q8 9 5 21 h-68 q-3 -12 5 -21 z"/>
      <path d="M38 44 q37 -32 74 0 q-37 -13 -74 0 z"/>
      <path d="M58 70 q17 13 34 0 l10 42 h-54 z"/>
      <path d="M58 112 h34 l7 54 h-48 z"/>
      <path d="M70 166 h-13 l-2 22 h17 z M92 166 h13 l2 22 h-17 z"/>
      <path d="M92 76 q26 10 38 34 q4 8 -4 11 q-9 2 -13 -7 q-8 -18 -25 -24 z"/>
    </g>
    <g fill="#6a7280" opacity=".42">
      <rect x="62" y="33" width="26" height="7" rx="3"/>
      <circle cx="70" cy="27" r="6"/><circle cx="80" cy="27" r="6"/>
    </g>
  </svg>`;
}

/* ══════════════════════════════════════════════════════════════════
   主入口
   ══════════════════════════════════════════════════════════════════ */

/**
 * @param {HTMLElement} container 玩法区
 * @param {{stats?:HTMLElement, id?:string, place?:'草地'|'遵义', pool?:string[],
 *          lesson?:object, log?:string[], state?:object, seed?:number,
 *          noReview?:boolean, onLesson?:(info:object)=>void}} [opts]
 */
export function runNightSchoolOil(container, opts = {}) {
  ensureStyle();
  const place = PLACE_NAME[opts.place] ? opts.place : '草地';
  const pool = Array.isArray(opts.pool) && opts.pool.length ? opts.pool : POOLS[place];

  return new Promise((resolve) => {
    let alive = true;
    let raf = 0, last = 0, guard = 0, sayTimer = 0;
    let phase = 'loading';
    let burnt = 0;                 // 已烧掉的秒数（= 时间轴）
    let result = null;
    let ro = null, lastW = -1;
    let lx = 76, ly = 368;         // 光圈中心（设计坐标）；开局在灯那儿 = 还没照到木牌上
    let focus = -1;

    const rnd = mulberry32(0x5c4001 + (opts.seed || 0));

    /* ── 骨架 ── */
    container.innerHTML = '';
    container.dataset.mini = opts.id || 'nightschool';
    const wrap = el('div', 'smini3-wrap');
    const stage = el('div', 'smini3-stage');
    stage.dataset.miniAction = 'aim';
    const bars = el('div', 'smini3-bars');
    const hud = el('div', 'smini3-hud');
    const oilBar = el('div', 'smini3-oil');
    const oilFill = el('i');
    oilBar.appendChild(oilFill);
    hud.append(el('span', 'smini3-hint', '一灯油'), oilBar);
    const statusEl = el('p', 'smini3-status');
    const hintEl = el('p', 'smini3-hint');
    const actions = el('div', 'smini3-actions');
    wrap.append(stage, hud, statusEl, hintEl, actions);
    container.appendChild(wrap);

    const night = el('div', 'smini3-layer smini3-night');
    for (let i = 0; i < 46; i++) {
      const st = el('div', 'smini3-star');
      st.style.left = (rnd() * 100).toFixed(2) + '%';
      st.style.top = (rnd() * 44).toFixed(2) + '%';
      st.style.opacity = (0.22 + rnd() * 0.6).toFixed(2);
      night.appendChild(st);
    }
    const mid = el('div', 'smini3-layer');           // 远景 + 黑影 + 草丛
    mid.appendChild(el('div', 'smini3-hill'));
    const watches = [];
    for (let i = 0; i < 5; i++) {
      const w = el('div', 'smini3-watch');
      const left = 7 + rnd() * 82, hh = 8.5 + rnd() * 7;
      w.style.left = left.toFixed(1) + '%';
      w.style.bottom = (16.5 + rnd() * 5).toFixed(1) + '%';
      w.style.width = (hh * 0.46).toFixed(1) + '%';
      w.style.height = hh.toFixed(1) + '%';
      w.style.transform = 'translateX(-50%)';
      watches.push({ node: w, at: 0.42 + i * 0.13 });
      mid.appendChild(w);
    }
    for (let i = 0; i < 34; i++) {
      const g = el('div', 'smini3-grass');
      g.style.left = (rnd() * 100).toFixed(2) + '%';
      g.style.height = (5 + rnd() * 9).toFixed(1) + '%';
      mid.appendChild(g);
    }
    const ground = el('div', 'smini3-ground');
    stage.append(night, mid, ground);

    /* 木牌 + 三个字（在暗层之下：不照就看不见 —— 模型写的那句解释也一样） */
    const board = el('div', 'smini3-board');
    const lit = el('div', 'smini3-lit');
    board.appendChild(lit);
    const lamp = el('div', 'smini3-lamp');
    lamp.innerHTML = lampSvg();
    const boy = el('div', 'smini3-boy');
    boy.innerHTML = boySvg();
    const beam = el('div', 'smini3-beam');
    const say = el('div', 'smini3-say');
    stage.append(beam, board, lamp, boy, say);

    /* 光洞 / 暖光 / 进度（后两层在暗层之上：认字靠光，做决定靠这三条） */
    const dark = el('div', 'smini3-dark');
    const glow = el('div', 'smini3-glow');
    const foot = el('div', 'smini3-foot');
    const footRead = el('p', 'smini3-read');
    foot.appendChild(footRead);
    stage.append(dark, glow, bars, foot);

    const charEls = [];
    for (let i = 0; i < 3; i++) {
      const row = el('div', 'smini3-row');
      const glyph = el('div', 'smini3-glyph', '');
      const info = el('div', 'smini3-info');
      const from = el('p', 'smini3-from', '');
      info.append(from);
      row.append(glyph, info);
      lit.appendChild(row);

      const bar = el('div', 'smini3-bar');
      const kind = el('div', 'smini3-kind');
      const kL = el('span', 'smini3-hint k-label', '');
      const kV = el('span', 'smini3-hint k-val', '');
      const mk = el('div', 'smini3-mk');
      const mkI = el('i');
      mk.appendChild(mkI);
      kind.append(kL, kV);
      bar.append(kind, mk);
      bars.appendChild(bar);

      charEls.push({ row, glyph, from, bar, kL, kV, mk, mkI });
    }

    /* ── 布局：设计坐标 → px（字用屏幕 px，不跟着缩） ── */
    let k = 1;
    function layout() {
      const w = stage.clientWidth || DW;
      k = w / DW;
      stage.style.height = Math.round(DH * k) + 'px';

      const bx = BOARD.x * k, by = BOARD.y * k, bw = BOARD.w * k, bh = BOARD.h * k, cl = CELL * k;
      Object.assign(board.style, { left: bx + 'px', top: by + 'px', width: bw + 'px', height: bh + 'px' });
      Object.assign(lamp.style, { left: 50 * k + 'px', top: 342 * k + 'px', width: 56 * k + 'px', height: 70 * k + 'px' });
      Object.assign(boy.style, { left: 488 * k + 'px', top: 62 * k + 'px', width: 150 * k + 'px', height: 190 * k + 'px' });
      foot.style.height = Math.max(44, 54 * k) + 'px';

      const pad = ROW_PAD * k, gb = GLYPH_BOX * k, gap = 13 * k;
      const infoX = bx + pad + gb + gap;
      const infoW = bw - pad * 2 - gb - gap;
      /* 格子右下角那三行（出自 / 类名 / 进度条）**按屏幕 px 定死**，不跟着 k 缩 —— 缩了就糊。
         坐标系有两个，别混（混了就是先前那个 P0）：
           · 进度条挂在舞台上的 bars 层 → 用**舞台坐标** (cy + bot - barH)。
           · 三个字挂在木牌里的 lit 层 → 定位父级是木牌，只能用**木牌坐标** (pad / i*cl)。
             先前这里写的是 bx+pad / cy，都是舞台坐标，于是每个字都被多推了一个木牌偏移
             （实测 93px）到木牌右外侧 —— 玩家把光打在**看得见的字**上，判定中心却在 190px 处，
             一个字也教不动（B 段六种打法全 0.000 就是这个）。
         barH 是这块信息的实高（类名行 ≈17 + 进度条 5 + 间距 3 + 余量）。 */
      const barH = 28;
      const bot = cl * 0.95;
      const FROM_LH = 16;                       // .smini3-from 的 line-height:1.4 × 11px
      charEls.forEach((c, i) => {
        Object.assign(c.row.style, {
          left: pad + 'px', top: (i * cl) + 'px', width: (bw - pad * 2) + 'px', height: cl + 'px',
        });
        c.glyph.style.width = gb + 'px';
        c.glyph.style.fontSize = Math.round(gb * 0.76) + 'px';
        c.from.style.fontSize = '11px';
        c.from.style.left = '0px';
        c.from.style.maxWidth = infoW + 'px';
        c.from.style.top = Math.max(1, bot - barH - FROM_LH - 3) + 'px';
        const cy = by + i * cl;
        Object.assign(c.bar.style, { left: infoX + 'px', top: (cy + bot - barH) + 'px', width: infoW + 'px' });
        c.kL.style.fontSize = '12px';
        c.kV.style.fontSize = '12px';
      });
      footRead.style.fontSize = '12.5px';
    }

    /* ── 内容 ── */
    let lesson = null;
    let chars = [];            // [{ch,kind,gloss,level,need,prog,done,cx,cy}]
    let needs = [];
    let prog = [];

    function recountCenters() {
      chars.forEach((c, i) => {
        c.cx = BOARD.x + ROW_PAD + GLYPH_BOX * 0.5;
        c.cy = BOARD.y + i * CELL + CELL * 0.5;
      });
    }

    function fillLesson(L, note) {
      lesson = L;
      needs = needsOf(L.chars);
      chars = L.chars.map((c, i) => ({ ...c, need: needs[i], prog: 0, done: false, cx: 0, cy: 0 }));
      prog = chars.map(() => 0);
      charEls.forEach((ce, i) => {
        const c = chars[i];
        const kd = KINDS.find((x) => x.kind === c.kind) || {};
        ce.glyph.textContent = c.ch;
        ce.from.textContent = `出自「${c.from}」`;
        ce.kL.textContent = `${kd.kind}·${kd.hint}`;
        ce.kV.textContent = c.level;
        ce.kL.style.color = c.kind === '口令' ? '#e9c16e' : 'rgba(238,232,212,.7)';
      });
      hintEl.innerHTML = note
        ? `<span class="warn">${note}</span>`
        : `教员念三个字，木牌上各占一格。<b>口令</b>今晚夜岗就要用 —— 三个字，油只够认真教两个。`;
      readStrip(null);
    }

    function setState(s) {
      phase = s;
      try { container.dataset.miniState = s; } catch { /* 拆了就算了 */ }
    }

    function syncData() {
      try {
        container.dataset.miniOil = (100 * (1 - burnt / OIL_SECONDS)).toFixed(1);
        container.dataset.miniFocus = String(focus);
        container.dataset.miniTaught = chars.length
          ? chars.map((c, i) => (c.need ? (prog[i] / c.need).toFixed(2) : '0')).join(',') : '';
        container.dataset.miniNeeds = needs.map((n) => n.toFixed(2)).join(',');
      } catch { /* 同上 */ }
    }

    /* ── 教学逻辑 ──
       总吞吐恒为 1 秒/秒，按距离分配。
       所以"落在两个字中间"= 一份光劈成两半，谁都不够；
       "正对一个字"= 隔壁在 R_OUT 之外，一点都分不到（R_OUT < 格高是关键）。 */
    function step(dt) {
      burnt += dt;
      if (burnt >= OIL_SECONDS) { burnt = OIL_SECONDS; finish('oil-out'); return; }

      const raw = chars.map((c, i) => {
        if (prog[i] >= c.need - 1e-9) return 0;
        const d = Math.hypot(lx - c.cx, ly - c.cy);
        return clamp((R_OUT - d) / (R_OUT - R_IN), 0, 1);
      });
      const S = raw.reduce((a, b) => a + b, 0);
      focus = -1;
      if (S > 0) {
        let best = -1;
        chars.forEach((c, i) => {
          if (raw[i] <= 0) return;
          if (best < 0 || raw[i] > raw[best]) best = i;
          prog[i] = Math.min(c.need, prog[i] + dt * raw[i] / S);
          if (!c.done && prog[i] >= c.need - 1e-9) { c.done = true; sfx('correct'); cheers(i); }
        });
        focus = best;
      }
    }

    /** 字教成的时候，旁边那个小鬼跟着念一声 */
    function cheers(i) {
      const c = chars[i];
      if (!c) return;
      say.textContent = `${c.ch} ——`;
      say.style.left = (BOARD.x + BOARD.w - 22) * k + 'px';
      say.style.top = (BOARD.y + i * CELL + CELL * 0.30) * k + 'px';
      say.style.fontSize = '13px';
      say.style.opacity = '1';
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => { if (alive) say.style.opacity = '0'; }, 900);
    }

    /* 读字条：光落在哪个字上，就念哪个字的解释。
       为什么要从格子里搬到这里：模型写的解释有 20–40 字，塞进 1/3 个格子只能挤成两行小字，
       还得跟类名行抢地方（那版就是重叠的）。舞台底下这条横幅是整行宽，一次只念一个字的解释，
       顺带把"光落到哪儿，才知道那块木头上是什么字"这层意思做实了。
       stripKey 缓存住上一次的内容 —— 不然 60fps 每帧重写 innerHTML，字会闪。 */
    let stripKey = '\u0000';
    function readStrip(c) {
      const key = c ? c.ch : '';
      if (key === stripKey) return;
      stripKey = key;
      if (!c) {
        footRead.innerHTML = '<span class="r-from">木牌上只有三个字 —— 光不照上去，它就是黑的</span>';
        return;
      }
      footRead.innerHTML = `<span class="r-ch">${esc(c.ch)}</span>`
        + `<span class="r-from">（${esc(c.kind)}，出自「${esc(c.from)}」）</span>　`
        + esc(c.gloss || '这个字今晚没顾上讲。');
    }

    /* ── 画面 ── */
    function paint() {
      const lr = R_OUT * k;
      const r = (v) => Math.round(v * 10) / 10;
      const px = lx * k, py = ly * k;
      dark.style.background =
        `radial-gradient(circle at ${r(px)}px ${r(py)}px,` +
        ` rgba(4,7,10,0) 0px, rgba(4,7,10,0) ${r(lr * 1.15)}px,` +
        ` rgba(4,7,10,.55) ${r(lr * 1.6)}px, rgba(4,7,10,.93) ${r(lr * 2.3)}px,` +
        ` rgba(4,7,10,1) ${r(lr * 3.0)}px)`;
      glow.style.background =
        `radial-gradient(circle at ${r(px)}px ${r(py)}px,` +
        ` rgba(255,206,130,.26) 0px, rgba(255,186,96,.11) ${r(lr * 1.1)}px,` +
        ` rgba(255,170,80,0) ${r(lr * 2.0)}px)`;

      // 灯到光圈之间的一道浅痕：交代"这点光是从这盏灯来的"
      const lcx = (50 + 28) * k, lcy = (342 + 12) * k;
      const dx = px - lcx, dy = py - lcy;
      const dist = Math.hypot(dx, dy);
      beam.style.left = lcx + 'px';
      beam.style.top = lcy + 'px';
      beam.style.width = dist.toFixed(1) + 'px';
      beam.style.transform = `rotate(${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2)}deg)`;
      beam.style.opacity = dist > 24 ? '1' : '0';

      const oilPct = 100 * (1 - burnt / OIL_SECONDS);
      oilFill.style.width = clamp(oilPct, 0, 100).toFixed(1) + '%';
      oilBar.classList.toggle('low', oilPct < 34);

      charEls.forEach((ce, i) => {
        const c = chars[i];
        if (!c) return;
        const f = c.need ? prog[i] / c.need : 0;
        const d = Math.hypot(lx - c.cx, ly - c.cy);
        const inlight = clamp((R_OUT * 1.6 - d) / (R_OUT * 0.95), 0, 1);
        ce.mkI.style.width = clamp(f * 100, 0, 100).toFixed(1) + '%';
        ce.mk.classList.toggle('done', f >= 0.999);
        ce.kL.style.opacity = String(0.34 + 0.66 * inlight);
        ce.kV.style.opacity = String(0.34 + 0.66 * inlight);
        ce.row.style.opacity = String(0.72 + 0.28 * inlight);
      });

      // 读字条跟着光走（照到哪个字念哪句）；光照在空处就退回提示
      readStrip(focus >= 0 ? chars[focus] : null);

      const frac = burnt / OIL_SECONDS;
      for (const w of watches) w.node.style.opacity = String(clamp((frac - w.at) / 0.12, 0, 0.95));
    }

    /* ── 主循环 ── */
    function loop(t) {
      if (!alive) return;
      if (!container.isConnected) { teardown(); return; }
      if (!last) last = t;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (phase === 'play') step(dt);
      paint();
      syncData();
      raf = requestAnimationFrame(loop);
    }

    /* ── 操作：光圈跟着指针，落在哪儿就照哪儿 ── */
    function onMove(e) {
      if (phase !== 'play' && phase !== 'intro') return;
      const r0 = stage.getBoundingClientRect();
      if (!r0.width || !r0.height) return;
      lx = clamp((e.clientX - r0.left) / r0.width * DW, 0, DW);
      ly = clamp((e.clientY - r0.top) / r0.height * DH, 0, DH);
      paint();
    }
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerdown', onMove);

    function renderActions() {
      actions.innerHTML = '';
      if (phase === 'intro') {
        const b = el('button', 'btn primary', '点上灯');
        b.type = 'button';
        b.dataset.miniAction = 'begin';
        b.onclick = () => { sfx('click'); startPlay(); };
        actions.appendChild(b);
      } else if (phase === 'play') {
        const b = el('button', 'btn ghost', '收灯（今晚就到这儿）');
        b.type = 'button';
        b.dataset.miniAction = 'douse';
        b.onclick = () => { sfx('click'); finish('doused'); };
        actions.appendChild(b);
      }
    }

    function startPlay() {
      setState('play');
      renderActions();
      recountCenters();
      last = 0;
      if (!raf) raf = requestAnimationFrame(loop);
      statusEl.innerHTML = '灯点上了。<span class="good">油在烧</span> —— 光圈落在哪个字上，哪个字才开始教。';
    }

    /* ── 结算 ── */
    function finish(why) {
      if (phase === 'done' || phase === 'review') return;
      setState('review');
      renderActions();
      const g = gradeOutcome(prog, needs);
      const oilLeft = Math.max(0, 100 * (1 - burnt / OIL_SECONDS));
      const pwIdx = chars.findIndex((c) => c.kind === '口令');
      const late = oilLeft < 26;
      const detail = {
        why,
        place,
        password: g.words[pwIdx] === 'taught' ? lesson.password : '',
        passwordRemembered: g.words[pwIdx] !== 'none',
        passwordOk: g.words[pwIdx] === 'taught',
        chars: chars.map((c, i) => ({
          ch: c.ch, kind: c.kind, from: c.from, level: c.level,
          state: g.words[i], pct: Math.round((prog[i] / c.need) * 100),
        })),
        oilLeft: Math.round(oilLeft),
        burnt: Math.round(burnt * 10) / 10,
        late,
        outcome: g.outcome,
        fromModel: !opts.lesson && !lesson._fallback,
      };
      const label = (i) => (g.words[i] === 'taught' ? '教成' : g.words[i] === 'half' ? '半懂' : '没教');
      hintEl.innerHTML = chars.map((c, i) => `${c.ch}（${label(i)}）`).join('　')
        + `　·　烧了 ${detail.burnt}s，剩油 ${detail.oilLeft}%`;
      const tail = why === 'oil-out' ? '<span class="warn">灯芯烧到底了。</span>'
        : why === 'doused' ? '你主动收了灯。' : '';
      const warn = late ? '<span class="warn">营地外草坡上站着两三个影子，看不清是谁。</span>' : '';
      statusEl.innerHTML = [tail, warn].filter(Boolean).join(' ');
      if (g.words.some((w) => w === 'half')) sfx('wrong');

      result = { score: g.score, detail, summary: '' };
      paint();
      if (opts.noReview) { doneOut(); return; }
      reviewAndResolve(detail);
    }

    async function reviewAndResolve(detail) {
      statusEl.innerHTML = '教员合上本子……';
      let out = null;
      try {
        out = await decideWithin(DECIDE, {
          scene: `夜校识字 · ${place}`,
          callType: 'minigame_review',
          situation: `一灯油教三个字：${detail.chars.map((c) => `${c.kind}"${c.ch}"→${c.state}`).join('；')}；烧了 ${detail.burnt}s，剩油 ${detail.oilLeft}%`,
          state: opts.state || {},
          operation: { type: 'school', ...detail },
        });
      } catch (err) {
        out = { _error: true, message: String(err?.message || err) };
      }
      if (!alive) { doneOut(); return; }
      if (out && !out._error) {
        result.summary = String(out.narrative || '');
        result.detail.effects = out.effects || {};
        result.detail.choice = out.choice || '';
        result.detail.reason = out.reason || '';
        statusEl.innerHTML = esc(result.summary || '教员合上了本子。');
      } else if (!out) {
        // 10 秒没答上来（不是出错）：走固定收束，别把"没等到"说成"调用失败"
        statusEl.textContent = '教员合上了本子。';
        result.detail.reviewFallback = true;
      } else {
        statusEl.innerHTML = `<span class="warn">结算调用失败：${esc(String(out?.message || '未知')).slice(0, 60)}</span>`;
        result.detail.reviewError = true;
      }
      doneOut();
    }

    function doneOut() {
      try { container.dataset.miniOutcome = result.detail.outcome; } catch { /* 已拆 */ }
      paint();
      setState('done');
      renderActions();
      try { opts.onLesson?.({ lesson, detail: result.detail }); } catch { /* 回调炸了不影响 resolve */ }
      teardown();
      resolve(result);
    }

    function esc(s) {
      return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function teardown() {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(sayTimer);
      clearInterval(guard);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerdown', onMove);
      try { ro?.disconnect(); } catch { /* 已断 */ }
      window.removeEventListener('resize', layout);
    }

    /* ── 开局：先请模型定课本 ── */
    async function askLesson() {
      const ctx = [`今晚在${place}宿营。`,
        opts.log?.length ? `今天做过的事：${opts.log.join('；')}。` : ''].filter(Boolean).join('');
      for (let attempt = 0; attempt < 2; attempt++) {
        let raw = null;
        try {
          raw = await decideWithin(DECIDE, {
            scene: `夜校识字 · ${place}`,
            callType: 'school_lesson',
            situation: '定今晚夜校要教的三个字（口令 / 地名 / 人名 各一个），以及今晚的口令',
            state: opts.state || {},
            extraContext: `${ctx}\n【今晚可选的词】${pool.join('、')}\n`
              + '只能从上面的词里取 from；ch 必须是该词里真实出现的一个汉字。',
            operation: { type: 'school_lesson', attempt: attempt + 1 },
          });
        } catch (err) {
          return { lesson: null, note: `模型调用失败：${String(err?.message || err).slice(0, 50)}` };
        }
        if (raw && !raw._error) {
          const { lesson: L, notes } = gateLesson(raw, pool);
          if (L) return { lesson: { ...L, _model: true }, note: '' };
          if (attempt === 1) return { lesson: null, note: `模型给的字没过闸：${notes.slice(0, 2).join('；')}` };
        } else if (raw === null) {
          // 10 秒没答上来：不再重试第二遍（那会让学生干等 20 秒），直接翻备课本
          return { lesson: null, note: '模型没答上来（10 秒），教员翻出了备课本。' };
        } else if (attempt === 1) {
          return { lesson: null, note: `模型调用失败：${String(raw?.message || '未知').slice(0, 50)}` };
        }
        if (!alive) return { lesson: null, note: '' };
      }
      return { lesson: null, note: '' };
    }

    async function boot() {
      setState('loading');
      renderActions();
      statusEl.textContent = '教员蹲下来，把本子摊在膝盖上……';
      hintEl.textContent = '（在等模型根据今天的经历定课本）';
      syncData();

      let L = opts.lesson || null;
      let note = '';
      if (!L) {
        const asked = await askLesson();
        L = asked.lesson; note = asked.note;
      }
      if (!alive) return;
      if (!L) {
        L = { ...FALLBACK[place], _fallback: true };
        note = note || '模型没给出能用的课本，教员翻出了备课本。';
      }
      fillLesson(L, note);
      recountCenters();
      setState('intro');
      renderActions();
      statusEl.textContent = L.teacher_line || '跟着念。认得一个字，就能传给下一个人。';
      last = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    }

    /* 宽窄变化：位置全部重算（字的大小不跟着缩） */
    try {
      ro = new ResizeObserver(() => {
        if (lastW === stage.clientWidth) return;      // 早退，防自激
        lastW = stage.clientWidth;
        layout(); paint();
      });
      ro.observe(stage);
    } catch { /* 老浏览器没有就算了 */ }
    window.addEventListener('resize', layout);

    layout();
    recountCenters();
    boot();

    /* 兜底：容器被拆掉时别把 Promise 永远挂着 */
    guard = setInterval(() => {
      if (!alive || !container.isConnected) {
        clearInterval(guard);
        if (alive) { teardown(); resolve(result || { score: 0, detail: { why: 'detached', outcome: 'nothing' }, summary: '' }); }
      }
    }, 500);
  });
}

export const SCHOOL_MINIGAMES = [
  {
    id: 'nightschool',
    title: '夜校识字 · 一灯油',
    family: '判读',
    run: (host, opts = {}) => runNightSchoolOil(host, opts),
    states: ['loading', 'intro', 'play', 'review', 'done'],
    actions: ['aim', 'begin', 'douse'],
    act: 'act2 · 遵义 / act4 · 草地',
    note: '模型按今天的经历定课本（三个字 + 口令）；一灯油只够认真教两个',
  },
];
