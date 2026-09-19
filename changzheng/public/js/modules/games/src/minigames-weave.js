/**
 * 《编草鞋》· 编一只鞋的工序（**工序 · 编一只鞋，未接入主线**）
 *
 * ── 这一版为什么重做 ──
 *   旧版（minigames-strawshoes.js）是「料往哪个部位用 + 6 段怎么分给 6 个人 + 让谁赤脚」，
 *   本质是**分配 / 配额**玩法。用户明确否掉了这个方向：
 *   「编草鞋不应该是分配给谁编、布给谁编，更应该是编一个草鞋的步骤。
 *     从最开始的草拔草到最后的成鞋，对吧？每一个步骤这样操作，这是它的重点。」
 *   所以这一版把镜头收窄到**一只鞋**：拔草 → 捶软 → 搓绳 → 绷经 → 编底编帮 → 收口成鞋，
 *   每一步都是玩家**亲手做**的工序，质量累加成「这双鞋能走多少里」。
 *
 * ── 史实锚点（从旧版文件头转抄，均为真；虚构层零真实历史人名）──
 *   · 1934-09-08《红色中华》刊《募集廿万双草鞋慰劳红军》，号召 10 月 10 日前完成 **20 万双**，
 *     原话「**不要使一个红色战士赤足作战**」。
 *   · 长征日记 / 回忆：行军七十里路甚泥泞、草鞋磨穿后**赤脚走十里**到宿营地才打新鞋；
 *     草鞋磨烂后用破布条绑脚继续走，「脚板上的血和泥混在一起」。
 *   · 工序（于都 陈罗寿家传的**草鞋耙**）：**绷在草鞋耙上的四根麻绳做"经"，
 *     稻草插进麻绳搭成的经纬格局里做"纬"**，一个人两三个小时能打一双。
 *   · 草鞋「涉水方便，爬山更能防滑」；但**稻草不耐磨、泡水就散**，麻绳结实、布条最软。
 *   · 1935 年 5 月巧渡金沙江后，追兵在皎平渡口**只看到一只红军丢下的草鞋**。
 *
 * ── 玩家的决策（每一道都是工序里的真选择，不是点按钮填表）──
 *   ① 拔草：按住蓄力、松手放绳——劲儿要匀；猛地一拽草就断（断了那一把废了）。
 *   ② 捶软：跟着鼓点捶；捶不够草还是硬的，捶过了草会碎。
 *   ③ 搓绳：先选**经绳料**（麻绳结实 / 稻草量大但泡水就散），再左右交替搓，劲儿要匀。
 *   ④ 绷经：四根经绳绷上草鞋耙，张力要**一致**；一根松整只鞋就歪。
 *   ⑤ 编底·编帮：草当纬，一道道插进经纬里；对不准的那道要**拆回去**重编。
 *   ⑥ 收口·成鞋：选**耳料**（布条最软、只有一块），按住收口，松紧到位即成鞋。
 *
 * ── 取舍（一夜只够做这么多）──
 *   「时间 / 力气」是唯一的预算（这一夜的灯油 = NIGHT）。每道工序做得越细，耗的夜越多；
 *   做得越快越糙、耗得越少。预算有限，**不能六道全做到极致**——
 *   想六道都做到满分，灯就熬干了，鞋打不完（= 有人赤脚走七十里）。
 *   材料特性也在起作用：稻草做的经，过河那一道就散了，里程直接腰斩；麻绳经结实；
 *   布条只一块，做耳最不磨脚背。
 *
 * ── 失败线（由「消耗 / 时间 / 质量」画，不由「配额」画）──
 *   项目铁律：失败的边必须由**时间**画，不能由**配额**画——配额会让
 *   「越浪费越安全」这种荒唐结论成立。本版两道失败线：
 *     · `unfinished` 灯熬干（累计耗时 > NIGHT）还没编完六道 → 这一夜没打成鞋 → 赤脚。
 *     · `worn` 编完了，但质量太低，鞋走不到七十里（里程 < 70）就在路上散了 → 后半程赤脚。
 *   只有「编完 + 里程 ≥ 70」才算 `done`。取舍与失败线都长在「一夜的工夫」上，不在配额上。
 *
 * ── 接不接 AI：不接 ──
 *   工序 + 手势操作，模型进来只会让人多等十几秒。局内 0 次模型调用；赢输之后的那句评价交给主线。
 *
 * ── 文件结构 ──
 *   设计说明 → 纯逻辑（无 DOM，可被 node 直接 import 跑，调难度 / 验最优解）
 *   → 样式 → 场景与渲染 → 六道工序的交互 → runWeave → 导出。
 *   纯逻辑到此为止 标记之后才碰 document / canvas。
 */

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

/** 等模型写一句点评，但**不能把结算挂住**：ms 内没回来就返回 null（用固定收尾）。同五子棋/打水漂口径。 */
async function decideWithin(payload, ms) {
  if (!DECIDE) return null;
  const ac = new AbortController();
  let t = 0;
  try {
    return await Promise.race([
      DECIDE(payload, { signal: ac.signal }),
      new Promise((r) => { t = setTimeout(() => r(null), ms); }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
    ac.abort();
  }
}

/**
 * 老班长瞅一眼这只鞋，说一句 —— 由模型现写（2026-09-18 加）。
 *
 * 为什么值得一次调用：这局的数据是**具体**的（六道工序各自的完成度、灯油剩多少、
 * 哪道返工过、经是麻还是稻草），本地只能把它们翻成"质量 0.72"这种数字，
 * 而"这鞋哪儿不靠谱、给谁穿"正是模型能说人话的地方 —— 也是玩家真正想听的收尾。
 * 4 秒窗口：结算屏本来就要停一下（下面 resolve 前有 1.1s 的看结果时间），
 * 等不到就用固定收尾，绝不把玩法挂住。
 */
async function keeperNote(r, s, o = {}) {
  const stepNames = ['拔草', '捶软', '搓绳', '绷经', '编底编帮', '收口'];
  const done = s.qs.map((q, i) => `${stepNames[i] || '第' + (i + 1) + '道'} ${Math.round(q * 100)}%`).join('、');
  const out = await decideWithin({
    scene: '湘江·宿营（老班长看鞋）',
    callType: 'weave_note',
    situation: `你夜里补了一只草鞋。结果：${s.outcome === 'done' ? '成鞋' : s.outcome === 'worn' ? '成了但路上会散' : '没打成'}，`
      + `能走 ${r.li} 里（队伍明天要走七十里）。`,
    state: o.state || {},
    operation: {
      type: 'weave_note', outcome: s.outcome, li: r.li, nightLeft: r.nightLeft,
      warp: s.warp, ear: s.ear, steps: done,
    },
  }, 4000);
  if (!out || out._error) return null;
  const line = String(out.note || out.reply || '').trim();
  return line ? line.slice(0, 80) : null;
}

/* ════════════════════════ 一、纯逻辑（无 DOM，可被 node import） ════════════════════════ */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;
const rnd = (a, b) => a + Math.random() * (b - a);

/* —— 画面尺寸（也供纯逻辑参考，无 DOM 依赖）—— */
export const W = 720;
export const H = 460;

/* —— 一夜的工夫（时间 / 力气预算）。一切失败线的总根。—— */
export const NIGHT = 100;

/* —— 六道工序。base = 基础耗时（决定预算消耗），weight = 占成鞋质量的权重。——
 *   base 之和 = 100，weight 之和 = 1.0；这正是「一夜只够做这么多」的刻度。 */
export const STEPS = [
  { id: 'pull',   name: '一·拔草',       base: 16, weight: 0.14,
    op: '按住「拔草」蓄力，松手放绳——劲儿要匀。猛地一拽草就断。连拔三把，凑够量。' },
  { id: 'pound',  name: '二·捶软',       base: 14, weight: 0.14,
    op: '跟着鼓点一下下捶。捶不够草还是硬的，捶过了草会碎。' },
  { id: 'twist',  name: '三·搓绳',       base: 18, weight: 0.16,
    op: '先选经绳（麻绳结实 / 稻草量大但泡水就散），再左右交替搓，劲儿要匀。' },
  { id: 'warp',   name: '四·绷经',       base: 16, weight: 0.16,
    op: '四根经绳绷上草鞋耙，张力要一致——一根松整只鞋就歪。' },
  { id: 'weave',  name: '五·编底·编帮',  base: 22, weight: 0.22,
    op: '草当纬，一道道插进经纬里。对不准的那道要拆回去重编。' },
  { id: 'finish', name: '六·收口·成鞋', base: 14, weight: 0.18,
    op: '选耳料（布条最软，只有一块），按住收口，松紧到位即成鞋。' },
];

/* —— 每道工序的耗时随质量上升而上升：做得越细越耗夜。
 *   系数刻意调成「六道全满分 = 105 > NIGHT」，即**想全做到极致就一定打不完**；
 *   但「认真而取舍得当」可以落在预算内并走完七十里。详见下方 PLAYS 自检。 */
const COST_A = 0.693;
const COST_B = 0.357;
export function stepCost(q, base) { return base * (COST_A + COST_B * clamp(q, 0, 1)); }

/* —— 材料：经绳（step3 选）与耳（step6 选）。特性直接进里程。—— */
export const WARP = {
  hemp:  { name: '麻绳', factor: 1.00, note: '结实耐磨、不怕水——草鞋耙上绷的四根经本就是麻绳' },
  straw: { name: '稻草', factor: 0.55, note: '量大，但泡水就散——拿它做经，过河那一道就完了' },
};
export const EAR = {
  cloth: { name: '布条', factor: 1.06, note: '最软，做耳不磨脚背；全班只有一块' },
  hemp:  { name: '麻绳', factor: 1.00, note: '结实，可做耳，就是偏硬' },
  straw: { name: '稻草', factor: 0.92, note: '软，但一扯就断' },
};

/* —— 质量（六道加权）、里程、过关线。—— */
export function qualityOf(qs) {
  let s = 0;
  for (let i = 0; i < STEPS.length; i++) s += STEPS[i].weight * clamp(qs[i] ?? 0, 0, 1);
  return s;
}
export function liOf(q, warp, ear) {
  const mf = (WARP[warp]?.factor ?? 1) * (EAR[ear]?.factor ?? 1);
  return Math.round(clamp(q * 100 * mf, 0, 999));
}
export const PASS_LI = 70;   // 能走完七十里泥路的最低里程
export const MAX_LI = 100;

/* —— 一份完整计划（六道质量 + 两种料）跑出结果。这是 QA / 调试台的唯一真相源。—— */
export function simulatePlan(plan) {
  const qs = plan.qs;
  const cost = STEPS.reduce((a, st, i) => a + stepCost(qs[i] ?? 0, st.base), 0);
  const unfinished = cost > NIGHT + 1e-9;
  const q = qualityOf(qs);
  const li = unfinished ? 0 : liOf(q, plan.warp, plan.ear);
  let outcome, score;
  if (unfinished) { outcome = 'unfinished'; score = 0.10; }
  else if (li < PASS_LI) { outcome = 'worn'; score = clamp(0.30 + 0.35 * (li / PASS_LI), 0.30, 0.64); }
  else { outcome = 'done'; score = clamp(0.60 + 0.40 * ((li - PASS_LI) / (MAX_LI - PASS_LI)), 0.60, 1.0); }
  return {
    outcome,
    cost: Number(cost.toFixed(2)),
    q: Number(q.toFixed(3)),
    li,
    score: Number(score.toFixed(3)),
    finished: !unfinished,
    nightLeft: Math.max(0, Number((NIGHT - cost).toFixed(2))),
  };
}

/* —— 六道参考打法（QA 钉分档；qs 顺序对应 STEPS）。—— */
export const PLAYS = {
  careful:   { qs: [1, 1, 1, 1, 1, 1],                 warp: 'hemp',  ear: 'cloth' }, // 想全满分 → 熬干
  balanced:  { qs: [0.85, 0.8, 0.85, 0.8, 0.88, 0.82], warp: 'hemp',  ear: 'cloth' }, // 认真而取舍 → done
  smart:     { qs: [0.5, 0.5, 0.7, 0.7, 1.0, 1.0],     warp: 'hemp',  ear: 'cloth' }, // 重点工序满分 → done
  rushed:    { qs: [0.35, 0.35, 0.35, 0.35, 0.35, 0.35], warp: 'hemp', ear: 'hemp' }, // 赶工 → worn
  sloppy:    { qs: [0.2, 0.9, 0.1, 0.7, 0.3, 0.5],     warp: 'hemp',  ear: 'hemp' },  // 乱做 → worn
  strawwarp: { qs: [0.85, 0.8, 0.85, 0.8, 0.88, 0.82], warp: 'straw', ear: 'cloth' }, // 稻草经 → 过河散 → worn
};

/* ══════════════════════════ 纯逻辑到此为止（下面才开始碰 DOM / canvas） ════════════════════════ */


/* ── 小工具（自包含，不 import minigames.js；与 fishing/strawshoes 同名同义，故意不共享）── */
function h(tag, attrs = {}, kids = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) {
    if (kid == null) continue;
    if (typeof kid === 'string' || typeof kid === 'number') el.appendChild(document.createTextNode(String(kid)));
    else el.appendChild(kid);
  }
  return el;
}
function mount(container, node) { container.innerHTML = ''; container.appendChild(node); return node; }
function stats(_host, items) { return STATS(items); }
function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function sfx(name) { try { SFX(name); } catch { /* 音频没起来不影响玩法 */ } }

/* 当前运行实例的态（模块级单例；一次只跑一个玩法实例，足够）。setStatus/setHint 被大量
 * 模块级步骤函数调用，必须是模块级函数，靠 _st 找到正确的 statusEl / hint。 */
let _st = null;
function setStatus(txt, cls) {
  const el = _st && _st.statusEl;
  if (!el) return;
  el.textContent = txt;
  el.className = 'smini19-status' + (cls === 'warn' ? ' warn' : cls === 'good' ? ' good' : '');
}
function setHint(txt) {
  const el = _st && _st.hint;
  if (el) el.innerHTML = txt;
}

/* ── 配色：夜色、火光、草、麻、布、木，都是这幅画自己的色（不依赖项目 token，避免被改崩）── */
const PAL = {
  nightTop: '#0a0e16', nightLow: '#05080d', wall: '#0c1019',
  flame: '#e9a23c', flameCore: '#ffd884', flameDeep: '#c2542e',
  oil: '#c79a52', oilHi: '#e3c074',
  clay: '#7a4f2c', clayDark: '#4d3018',
  wood: '#5a3f24', woodHi: '#7d5832', woodDark: '#3a2614',
  table: '#473022', tableHi: '#5d4029', tableDark: '#2c1d10',
  straw: '#c7a85f', strawHi: '#e6d094', strawDark: '#906f37',
  hemp: '#9c7640', hempHi: '#bd965a', hempDark: '#60471f',
  cloth: '#cabf9c', clothDark: '#938866',
  skin: '#bd8f5f', skinHi: '#d8ab78', skinDark: '#7c5a36',
  sleeve: '#3a2e1d', sleeveHi: '#564024',
  ink: '#f3ead4', dim: 'rgba(243,234,212,.6)',
  warn: '#e88a5f', good: '#93c68d',
};

/* ── 样式（前缀 smini19-；运行时注入，不碰项目 CSS）── */
function ensureStyle() {
  if (document.getElementById('weave-mini-style')) return;
  const s = document.createElement('style');
  s.id = 'weave-mini-style';
  s.textContent = `
.smini19-wrap { display:flex; flex-direction:column; gap:8px; align-items:center; width:100%; }
.smini19-wrap > * { position:relative; z-index:1; }
.smini19-lead { margin:0; font-family:var(--font-kai, "KaiTi", serif); font-size:13.5px; line-height:1.7;
  color:#3f3524; max-width:min(720px,100%); text-align:left; }
.smini19-lead b { color:#8c2f22; font-weight:400; }
.smini19-note { margin:6px 0 0; font-family:var(--font-kai, "KaiTi", serif); font-size:12.5px; line-height:1.7; color:#5c4f38; }
.smini19-lead .dim { display:block; margin-top:3px; color:#7a6c53; font-size:12.5px; }
.smini19-cv { background:#0a0e16; border-radius:6px; display:block; width:100%; max-width:720px; height:auto;
  box-shadow:0 1px 0 rgba(255,255,255,.14) inset, 0 0 0 1px rgba(90,80,64,.32); touch-action:none; }
.smini19-status { margin:0; min-height:22px; text-align:center; font-size:14px; color:var(--ink-0,#222);
  font-family:var(--font-kai, "KaiTi", serif); letter-spacing:.02em; }
.smini19-status.warn { color:#b5402f; }
.smini19-status.good { color:#3f7a44; }
.smini19-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; max-width:min(720px,100%); min-height:40px; }
.smini19-actions:empty { display:none; }
.smini19-btn { font:inherit; font-size:13px; padding:7px 14px; border-radius:4px; cursor:pointer;
  background:rgba(255,252,244,.92); border:1px solid rgba(120,100,70,.5); color:#2c2416; }
.smini19-btn:hover:not([disabled]) { background:#fffcf4; border-color:rgba(150,110,40,.7); }
.smini19-btn[disabled] { opacity:.4; cursor:default; }
.smini19-btn.pri { background:#3f4a34; color:#f3ecdc; border-color:#2c3424; }
.smini19-btn.sel { border-color:#8a6a1e; box-shadow:0 0 0 2px rgba(195,154,46,.4); }
.smini19-slider { display:flex; align-items:center; gap:8px; font-size:12px; color:#4b4130; }
.smini19-slider input[type=range] { width:160px; }
.smini19-hint { margin:0; text-align:center; font-size:12.5px; line-height:1.6; color:#4b4130;
  max-width:min(720px,100%); }
.smini19-hint b { color:#8c2f22; font-weight:400; }
.smini19-fb { width:100%; max-width:min(720px,100%); font-size:12.5px; line-height:1.7; color:#4b4130;
  text-align:left; min-height:20px; }
.smini19-fb .dim { color:#8a7c62; }
.smini19-card { background:rgba(255,252,244,.9); border:1px solid rgba(120,100,70,.4); border-radius:6px;
  padding:8px 12px; max-width:min(720px,100%); font-size:12.5px; line-height:1.7; color:#3a3122; }
.smini19-card b { color:#8c2f22; font-weight:400; }
@keyframes smini19-blink { 0%,100%{opacity:1} 50%{opacity:.45} }
.smini19-blink { animation:smini19-blink 1s steps(2,start) infinite; }
@media (prefers-reduced-motion: reduce) { .smini19-blink { animation:none; } }
`;
  document.head.appendChild(s);
}

/* ── 草鞋耙与鞋的几何（画布坐标，画布尺寸 720×460）── */
const RIG = { beamY: 232, beamX0: 330, beamX1: 570 };
function warpX(i) { return lerp(RIG.beamX0, RIG.beamX1, i / 3); } // 四根经绳的水平位置
const SHOE_CX = (RIG.beamX0 + RIG.beamX1) / 2;   // 450
const SHOE_CY = 300;                              // 鞋成型中心
const LAMP = { x: 120, bowlY: 206, flameY: 156 };// 油灯（画面左侧，夜里的唯一光源）

const BEAT = 0.62;       // 捶软鼓点周期
const N_BEATS = 8;       // 捶软拍数
const N_SLOTS = 8;       // 编底槽位数
const CHARGE_T = 1.15;   // 拔草 / 收口 蓄力 0→1 用时

/* ══════════════════════════ 二、场景与渲染 ══════════════════════════ */

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function strokePts(g, pts) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}
/* 麻绳的捻股纹：沿线法向画短斜杠 */
function drawTwistTex(g, pts, col, a) {
  g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = 1;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    g.beginPath(); g.moveTo(mx - nx * 3, my - ny * 3); g.lineTo(mx + nx * 3, my + ny * 3); g.stroke();
  }
  g.globalAlpha = 1;
}
/* 稻草的纤维毛刺：沿线画细斜向短丝 */
function drawFiberTex(g, pts, col, a) {
  g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = 0.8;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    g.beginPath(); g.moveTo(mx - 1.6, my); g.lineTo(mx + 1.6, my - 2.4); g.stroke();
  }
  g.globalAlpha = 1;
}

function drawBackground(g, st, t) {
  // 夜墙
  const wg = g.createLinearGradient(0, 0, 0, 260);
  wg.addColorStop(0, PAL.nightTop); wg.addColorStop(1, PAL.wall);
  g.fillStyle = wg; g.fillRect(0, 0, W, 260);
  // 远处宿营剪影（压得很暗）
  g.fillStyle = 'rgba(9,12,18,.92)';
  for (let i = 0; i < 7; i++) {
    const bx = 24 + i * 100 + Math.sin(i * 2.1) * 8;
    const bh = 18 + (i % 3) * 9;
    g.beginPath(); g.moveTo(bx - 12, 160); g.lineTo(bx, 160 - bh); g.lineTo(bx + 12, 160); g.closePath(); g.fill();
  }
  // 极远处一点窗火
  for (let i = 0; i < 3; i++) { const fx = 130 + i * 190; g.fillStyle = 'rgba(230,150,70,.16)'; g.fillRect(fx - 1, 150 - (i % 2 ? 30 : 22), 2, 3); }
  // 墙面斑驳
  g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) { const y = 38 + i * 42; g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(W / 2, y + 8, W, y - 4); g.stroke(); }
}

function drawTable(g, st, t) {
  const tg = g.createLinearGradient(0, 250, 0, H);
  tg.addColorStop(0, PAL.tableDark); tg.addColorStop(0.1, PAL.table); tg.addColorStop(1, PAL.tableHi);
  g.fillStyle = tg; g.fillRect(0, 250, W, H - 250);
  // 木纹（横向波浪）
  g.strokeStyle = 'rgba(24,14,7,.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    const y = 272 + i * 22;
    g.beginPath();
    for (let x = 0; x <= W; x += 20) { const yy = y + Math.sin(x * 0.02 + i) * 3; x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); }
    g.stroke();
  }
  g.fillStyle = 'rgba(140,98,54,.26)'; g.fillRect(0, 250, W, 2); // 桌沿高光
}

function drawRack(g, st, t) {
  // 影
  g.fillStyle = 'rgba(0,0,0,.38)';
  g.beginPath(); g.ellipse(SHOE_CX, RIG.beamY + 44, 184, 24, 0, 0, Math.PI * 2); g.fill();
  // 横梁（木板）
  const bx0 = RIG.beamX0 - 34, bx1 = RIG.beamX1 + 34;
  const bg = g.createLinearGradient(0, RIG.beamY, 0, RIG.beamY + 20);
  bg.addColorStop(0, PAL.woodHi); bg.addColorStop(0.5, PAL.wood); bg.addColorStop(1, PAL.woodDark);
  g.fillStyle = bg; roundRect(g, bx0, RIG.beamY, bx1 - bx0, 18, 5); g.fill();
  // 木纹
  g.strokeStyle = 'rgba(20,12,6,.5)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) { const y = RIG.beamY + 3 + i * 3.5; g.beginPath(); g.moveTo(bx0 + 6, y); g.quadraticCurveTo(SHOE_CX, y + 2, bx1 - 6, y); g.stroke(); }
  g.fillStyle = 'rgba(150,108,60,.4)'; g.fillRect(bx0, RIG.beamY, bx1 - bx0, 2);
  // 四齿
  for (let i = 0; i < 4; i++) {
    const x = warpX(i);
    const pegTop = RIG.beamY - 36;
    const pg = g.createLinearGradient(x - 5, 0, x + 5, 0);
    pg.addColorStop(0, PAL.woodDark); pg.addColorStop(0.45, PAL.woodHi); pg.addColorStop(1, PAL.wood);
    g.fillStyle = pg; roundRect(g, x - 5, pegTop, 10, 40, 4); g.fill();
    g.fillStyle = 'rgba(20,12,6,.5)'; g.fillRect(x + 2, pegTop + 2, 2, 36);
    g.fillStyle = 'rgba(150,108,60,.5)'; g.fillRect(x - 4, pegTop + 2, 2, 34);
    g.fillStyle = PAL.woodHi; g.beginPath(); g.arc(x, pegTop, 5, 0, Math.PI * 2); g.fill();
  }
}

/* 四根经绳，绷在草鞋耙上。warp 步里随张力拉伸；前期松弛垂下。 */
function drawWarp(g, st, t) {
  const onRack = st.stepIdx >= 3 || st.mode === 'warp';
  const pegTop = RIG.beamY - 36;
  for (let i = 0; i < 4; i++) {
    const x = warpX(i);
    const bottomY = SHOE_CY - 6;
    let tens = 50;
    if (st.mode === 'warp') tens = st.cords[i];
    else if (onRack) tens = 66;
    const sag = (1 - tens / 100) * 22;
    const quiver = tens > 88 ? Math.sin(t * 34 + i) * 1.6 : 0;       // 过紧颤动
    const overTight = tens > 90;                                      // 过紧发白
    const pts = [];
    const dy = bottomY - pegTop;
    for (let s = 0; s <= 10; s++) {
      const u = s / 10;
      const yy = pegTop + dy * u;
      const xx = x + quiver * Math.sin(u * Math.PI) + Math.sin(u * 3 + i) * sag * 0.12 + Math.sin(u * 6) * sag * 0.05;
      pts.push([xx, yy]);
    }
    let col = st.warp === 'straw' ? PAL.strawDark : PAL.hemp;
    if (overTight) col = '#d8c8a4';
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4.5; strokePts(g, pts);
    g.strokeStyle = col; g.lineWidth = 3; strokePts(g, pts);
    if (st.warp === 'straw') drawFiberTex(g, pts, PAL.strawHi, 0.5);
    else drawTwistTex(g, pts, PAL.hempHi, 0.6);
    if (overTight) { g.strokeStyle = 'rgba(255,240,200,.5)'; g.lineWidth = 1; strokePts(g, pts); }
  }
}

/* 半成品的鞋：随工序推进一点点成型 */
function shoeRows(st) {
  if (st.mode === 'weave') return st.good;
  if (st.stepIdx >= 4 || st.mode === 'finish' || st.mode === 'done') return N_SLOTS;
  return 0;
}
function drawShoe(g, st, t) {
  if (st.stepIdx < 3 && st.mode !== 'warp') return;
  const rows = shoeRows(st);
  const x0 = RIG.beamX0, x1 = RIG.beamX1;
  // 鞋底（编底完成后出现）
  if (st.stepIdx >= 4 || st.mode === 'finish' || st.mode === 'done') {
    g.strokeStyle = st.warp === 'straw' ? PAL.strawDark : PAL.hemp; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0 - 6, SHOE_CY + 18);
    g.quadraticCurveTo(SHOE_CX, SHOE_CY + 44, x1 + 6, SHOE_CY + 18);
    g.stroke();
  }
  // 纬草一道道填进去
  for (let r = 0; r < rows; r++) {
    const u = rows > 1 ? r / (rows - 1) : 0;
    const y = SHOE_CY - 14 + u * 30;
    const sx = x0 + 4, ex = x1 - 4;
    g.strokeStyle = r % 2 ? PAL.strawDark : PAL.straw; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx, y); g.quadraticCurveTo(SHOE_CX, y + 3, ex, y); g.stroke();
    drawFiberTex(g, [[sx, y], [SHOE_CX, y + 3], [ex, y]], PAL.strawHi, 0.4);
  }
  // 编错的那道：露出来一截，等拆回去
  if (st.mode === 'weave' && st.locked) {
    const mx = st.markerX;
    g.strokeStyle = PAL.warn; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(mx, SHOE_CY - 10); g.quadraticCurveTo(mx + 8, SHOE_CY - 30, mx - 6, SHOE_CY - 44); g.stroke();
    drawFiberTex(g, [[mx, SHOE_CY - 10], [mx - 6, SHOE_CY - 44]], '#f0a070', 0.5);
  }
  // 收口 / 耳（finish 及之后）
  if (st.stepIdx >= 5 || st.mode === 'finish') {
    const close = st.mode === 'finish' ? st.tension : 1;
    const earCol = st.ear === 'cloth' ? PAL.cloth : st.ear === 'straw' ? PAL.straw : PAL.hemp;
    for (const sgn of [-1, 1]) {
      const exX = SHOE_CX + sgn * ((x1 - x0) / 2) * 0.62 * (1 - close * 0.5);
      g.strokeStyle = earCol; g.lineWidth = 3.4; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(exX, SHOE_CY + 20);
      g.quadraticCurveTo(SHOE_CX + sgn * 30, SHOE_CY - 18 - close * 6, SHOE_CX + sgn * 10 * (1 - close), SHOE_CY - 22 - close * 4);
      g.stroke();
    }
    g.strokeStyle = PAL.straw; g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(SHOE_CX - 10 * (1 - close), SHOE_CY - 22 - close * 4);
    g.quadraticCurveTo(SHOE_CX, SHOE_CY - 30 - close * 6, SHOE_CX + 10 * (1 - close), SHOE_CY - 22 - close * 4);
    g.stroke();
  }
}

/* 搓绳步：左手麻绳团、右手稻草团，已选的高亮；中间两股缠绕成绳 */
function drawHemp(g, st, t) {
  if (st.mode !== 'twist') return;
  drawCoil(g, 150, 352, PAL.hemp, PAL.hempHi, st.warp === 'hemp');
  drawCoil(g, 236, 366, PAL.straw, PAL.strawHi, st.warp === 'straw');
  // 正在搓的绳（两手之间）
  const cx = 300, cy = 330;
  const seg = Math.min(22, Math.round(st.twist * 22) + 2);
  const rot = st.twistClock * 6;
  g.save(); g.translate(cx, cy);
  for (let k = 0; k < 2; k++) {
    g.strokeStyle = k ? PAL.hempHi : PAL.hemp; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= seg; i++) {
      const yy = -seg / 2 * 5 + i * 5;
      const xx = Math.sin(i * 0.7 + rot + k * Math.PI) * 10;
      i === 0 ? g.moveTo(xx, yy) : g.lineTo(xx, yy);
    }
    g.stroke();
  }
  // 劲儿不匀 → 绳上起一个疙瘩（看得见的缺陷）
  if (st.even < 0.6 && st.twist > 0.2) {
    g.fillStyle = PAL.warn; g.beginPath(); g.arc(0, 0, (1 - st.even) * 10 + 3, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
function drawCoil(g, x, y, col, hi, sel) {
  g.save(); g.translate(x, y);
  if (sel) { g.fillStyle = 'rgba(232,180,90,.18)'; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = col;
  for (let r = 14; r > 2; r -= 3) { g.beginPath(); g.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.stroke(); }
  g.strokeStyle = hi; g.lineWidth = 1;
  for (let r = 14; r > 2; r -= 3) { g.beginPath(); g.ellipse(0, -1, r, r * 0.5, 0, 0, Math.PI * 2); g.stroke(); }
  g.restore();
}

/* 草堆（左侧），拔草步里会被拉长、拔出；断了飞出 */
function drawStrawPile(g, st, t) {
  const baseX = 150, baseY = 372;
  // 散落草屑
  g.fillStyle = 'rgba(180,150,80,.5)';
  for (let i = 0; i < 10; i++) { const a = i * 2.3; g.fillRect(baseX + Math.cos(a) * 46, baseY + Math.sin(a) * 16, 2, 1); }
  // 一堆草（带纤维）
  const remain = clamp(1 - (st.mode === 'pull' ? st.pulls.length / 3 : (st.stepIdx > 0 ? 1 : 0)), 0, 1);
  const n = Math.round(8 * remain) + 2;
  g.save(); g.translate(baseX, baseY);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - n / 2) * 0.18 + Math.sin(i * 1.7 + t * 0.3) * 0.08;
    const len = 42 + (i % 3) * 12;
    const x2 = Math.cos(a) * len, y2 = Math.sin(a) * len - 8;
    g.strokeStyle = i % 2 ? PAL.strawDark : PAL.straw; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5 - 6, x2, y2); g.stroke();
    drawFiberTex(g, [[0, 0], [x2, y2]], PAL.strawHi, 0.35);
  }
  g.restore();
  // 拔草：被拉长的那一把（蓄力时形变）
  if (st.mode === 'pull') {
    const hx = 215, hy = 332;
    const stretch = st.charging ? st.tension : 0;
    for (let i = 0; i < st.pulls.length; i++) {
      const sx = 250 + i * 46, sy = 320 - i * 6;
      const brk = st.pullBroke && st.pullBroke[i];
      g.strokeStyle = brk ? PAL.warn : (st.pulls[i] > 0.85 ? PAL.strawDark : PAL.straw);
      g.lineWidth = 3.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(sx - 12, sy + 20); g.quadraticCurveTo(sx, sy, sx + 12, sy - 22); g.stroke();
    }
    const topY = hy - 30 - stretch * 40;
    g.strokeStyle = PAL.strawHi; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(baseX, baseY - 10);
    g.quadraticCurveTo((baseX + hx) / 2, baseY - 30 - stretch * 30, hx, topY);
    g.stroke();
    drawFiberTex(g, [[baseX, baseY - 10], [hx, topY]], PAL.straw, 0.4);
    // 过猛 → 断成两截飞出去
    if (st.brokenT > 0) {
      const k = 1 - st.brokenT / 0.9;
      const fx = hx + k * 120, fy = topY - k * 70 - Math.sin(k * Math.PI) * 20;
      g.strokeStyle = PAL.warn; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(fx - 10, fy + 8); g.lineTo(fx + 10, fy - 14); g.stroke();
      g.fillStyle = PAL.warn; g.font = '11px "Microsoft YaHei"'; g.textAlign = 'center';
      g.fillText('啪！断了', fx, fy - 20); g.textAlign = 'left';
    }
  }
}

/* 一双能看出在动作的手（简化带明暗的色块剪影） */
function drawHand(g, x, y, rot, s, grasp) {
  g.save();
  g.translate(x, y); g.rotate(rot); g.scale(s, s);
  // 小臂 / 袖
  g.fillStyle = PAL.sleeve;
  g.beginPath(); g.moveTo(-30, 40); g.lineTo(-14, 6); g.lineTo(14, 6); g.lineTo(30, 40); g.closePath(); g.fill();
  g.fillStyle = PAL.sleeveHi; g.fillRect(-15, 4, 30, 4);
  // 掌
  g.fillStyle = PAL.skin; g.beginPath(); g.ellipse(0, 0, 15, 13, 0, 0, Math.PI * 2); g.fill();
  // 手指
  const gr = grasp || 0;
  for (let f = 0; f < 4; f++) {
    const fx = -9 + f * 6, fy = -8 + gr * 6;
    g.fillStyle = PAL.skin; g.beginPath(); g.ellipse(fx, fy, 3, 7 - gr * 3, 0, 0, Math.PI * 2); g.fill();
  }
  // 拇指
  g.fillStyle = PAL.skin; g.beginPath(); g.ellipse(11, -2 + gr * 4, 4, 8, 0.5, 0, Math.PI * 2); g.fill();
  // 暖色轮廓光（灯在左上方）
  g.strokeStyle = 'rgba(240,200,120,.32)'; g.lineWidth = 1.4;
  g.beginPath(); g.ellipse(0, 0, 15, 13, 0, Math.PI * 0.9, Math.PI * 1.7); g.stroke();
  g.restore();
}
function drawHands(g, st, t) {
  if (st.mode === 'pull') {
    const pull = st.charging ? st.tension : 0;
    drawHand(g, 215 + pull * 34, 332 - pull * 12, -0.5, 1.1, 0.4 + pull * 0.5);
  } else if (st.mode === 'pound') {
    const contactY = 322;
    const headY = contactY - (1 - st.mallet) * 36;            // 槌头：mallet=1 落地
    // 软硬：草堆被压扁、捶过碎
    const flat = st.soft * 8;
    g.save();
    g.fillStyle = st.crushed ? 'rgba(150,120,60,.9)' : PAL.straw;
    g.beginPath();
    g.ellipse(250, contactY + 6, 26 - flat * 0.4, 12 - flat, 0, 0, Math.PI * 2); g.fill();
    if (st.crushed) { for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(120,95,45,.9)'; g.fillRect(232 + i * 5, contactY + 2 + (i % 2) * 3, 3, 2); } }
    else { drawFiberTex(g, [[226, contactY + 6], [274, contactY + 6]], st.soft > 0.6 ? PAL.strawDark : PAL.strawHi, 0.5); }
    g.restore();
    // 槌柄
    g.strokeStyle = PAL.wood; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(300, 392); g.lineTo(250, headY + 10); g.stroke();
    // 槌头
    g.fillStyle = PAL.woodDark; roundRect(g, 232, headY - 8, 36, 18, 4); g.fill();
    g.fillStyle = PAL.woodHi; g.fillRect(232, headY - 8, 36, 3);
    drawHand(g, 300, 392, 0.4, 1.0, 0.7);
    // 落槌草屑
    if (st.mallet > 0.6) {
      g.fillStyle = 'rgba(210,180,100,' + (st.mallet * 0.5) + ')';
      for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28; g.beginPath(); g.arc(250 + Math.cos(a) * 10, contactY - 4 + Math.sin(a) * 5, 1.5, 0, Math.PI * 2); g.fill(); }
    }
  } else if (st.mode === 'twist') {
    const osc = Math.sin(t * 8) * 10;
    drawHand(g, 250 + osc, 330, 0.2, 1.0, 0.6);
    drawHand(g, 360 - osc, 330, -0.2, 1.0, 0.6);
  } else if (st.mode === 'warp') {
    drawHand(g, RIG.beamX0 - 6, RIG.beamY - 44, 0.3, 0.8, 0.6);
    drawHand(g, RIG.beamX1 + 6, RIG.beamY - 44, -0.3, 0.8, 0.6);
  } else if (st.mode === 'weave') {
    const mx = st.markerX;
    drawHand(g, mx, SHOE_CY - 44, 0.1, 0.95, 0.3);
    g.strokeStyle = PAL.skin; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(mx, SHOE_CY - 40); g.lineTo(mx, SHOE_CY - 18); g.stroke();
  } else if (st.mode === 'finish') {
    const close = st.tension;
    drawHand(g, SHOE_CX - 30 - close * 8, SHOE_CY - 18, 0.5, 0.95, 0.7);
    drawHand(g, SHOE_CX + 30 + close * 8, SHOE_CY - 18, -0.5, 0.95, 0.7);
  }
}

function drawLamp(g, st, t) {
  const oil = clamp(1 - st.costSoFar / NIGHT, 0, 1);
  const fx = LAMP.x, fy = LAMP.bowlY;
  // 盏影
  g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(fx, fy + 18, 42, 10, 0, 0, Math.PI * 2); g.fill();
  // 盏身（陶土小油灯）
  g.fillStyle = PAL.clay; g.beginPath(); g.ellipse(fx, fy, 30, 13, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = PAL.clayDark; g.beginPath(); g.ellipse(fx, fy + 5, 30, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = PAL.clay; g.beginPath(); g.ellipse(fx, fy - 3, 30, 10, 0, 0, Math.PI * 2); g.fill();
  // 油面（随消耗下降）
  const oL = Math.max(0.15, oil);
  g.fillStyle = PAL.oil; g.beginPath(); g.ellipse(fx, fy - 4, 24 * oL, 6 * oL, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = PAL.oilHi; g.beginPath(); g.ellipse(fx - 4, fy - 5, 10 * oL, 2.5, 0, 0, Math.PI * 2); g.fill();
  // 灯嘴（右）
  g.fillStyle = PAL.clayDark;
  g.beginPath(); g.moveTo(fx + 26, fy - 2); g.lineTo(fx + 40, fy - 8); g.lineTo(fx + 40, fy + 2); g.lineTo(fx + 26, fy + 6); g.closePath(); g.fill();
  // 灯柄（左）
  g.strokeStyle = PAL.clayDark; g.lineWidth = 4;
  g.beginPath(); g.moveTo(fx - 26, fy); g.quadraticCurveTo(fx - 40, fy + 6, fx - 36, fy + 20); g.stroke();
  // 灯芯 + 焰
  const fs = 0.5 + oil * 0.55;
  const flick = 1 + Math.sin(t * 9) * 0.12 + Math.sin(t * 5.3) * 0.08;
  const flameH = (16 + oil * 16) * flick * fs;
  g.save(); g.globalCompositeOperation = 'lighter';
  g.fillStyle = PAL.flameDeep; flamePath(g, fx + 33, fy - 6, flameH * 1.15, 9 * fs); g.fill();
  g.fillStyle = PAL.flame;     flamePath(g, fx + 33, fy - 6, flameH, 6.5 * fs); g.fill();
  g.fillStyle = PAL.flameCore; flamePath(g, fx + 33, fy - 6, flameH * 0.6, 3.4 * fs); g.fill();
  g.restore();
}
function flamePath(g, x, y, h, w) {
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x - w, y - h * 0.5, x, y - h);
  g.quadraticCurveTo(x + w, y - h * 0.5, x, y);
  g.closePath();
}

/* 暖橙灯晕（径向渐变 + 轻微跳动），灯快枯时画面明显变暗 */
function drawGlow(g, st, t) {
  const oil = clamp(1 - st.costSoFar / NIGHT, 0, 1);
  const flick = 0.9 + Math.sin(t * 11) * 0.05 + Math.sin(t * 6.7) * 0.03;
  const R = (150 + oil * 220) * flick;
  const a = (0.09 + oil * 0.13) * flick;
  g.save(); g.globalCompositeOperation = 'lighter';
  const gl = g.createRadialGradient(LAMP.x + 20, LAMP.flameY, 10, LAMP.x + 20, LAMP.flameY, R);
  gl.addColorStop(0, `rgba(236,162,74,${a})`);
  gl.addColorStop(0.45, `rgba(198,120,50,${a * 0.5})`);
  gl.addColorStop(1, 'rgba(170,95,38,0)');
  g.fillStyle = gl; g.fillRect(0, 0, W, H);
  g.restore();
}
function drawVignette(g) {
  g.save();
  const vg = g.createRadialGradient(W / 2, H * 0.46, 150, W / 2, H * 0.46, 560);
  vg.addColorStop(0, 'rgba(3,5,9,0)');
  vg.addColorStop(1, 'rgba(2,4,8,.74)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.restore();
}

function drawNightBar(g, st) {
  const x = 14, y = 14, w = 196, hgt = 12;
  g.fillStyle = 'rgba(10,14,20,.6)'; g.fillRect(x - 4, y - 4, w + 8, hgt + 8);
  g.strokeStyle = 'rgba(243,234,212,.25)'; g.lineWidth = 1; g.strokeRect(x - 4, y - 4, w + 8, hgt + 8);
  const left = clamp(1 - st.costSoFar / NIGHT, 0, 1);
  g.fillStyle = left > 0.3 ? PAL.oilHi : PAL.warn; g.fillRect(x, y, w * left, hgt);
  g.fillStyle = PAL.dim; g.font = '11px "Microsoft YaHei"'; g.textAlign = 'left';
  g.fillText(`这一夜的灯油 ${Math.round(left * 100)}%`, x, y + hgt + 14);
  g.fillStyle = PAL.ink; g.font = '12px "Microsoft YaHei"';
  const nm = STEPS[st.stepIdx]?.name || '成鞋';
  g.fillText(`第 ${st.stepIdx + 1} / 6 道 · ${nm}`, x + w + 16, y + hgt);
}

function drawScene(g, t, st) {
  drawBackground(g, st, t);
  drawTable(g, st, t);
  drawRack(g, st, t);
  drawWarp(g, st, t);
  drawShoe(g, st, t);
  drawHemp(g, st, t);
  drawStrawPile(g, st, t);
  drawHands(g, st, t);
  drawVignette(g);
  drawGlow(g, st, t);
  drawLamp(g, st, t);
  drawNightBar(g, st);
}

/* 各工序的即时叠加层（画在场景之上） */
function drawOverlay(g, t, st) {
  if (st.mode === 'pull') drawPullOverlay(g, st);
  else if (st.mode === 'pound') drawPoundOverlay(g, st);
  else if (st.mode === 'twist') drawTwistOverlay(g, st);
  else if (st.mode === 'warp') drawWarpOverlay(g, st);
  else if (st.mode === 'weave') drawWeaveOverlay(g, st);
  else if (st.mode === 'finish') drawFinishOverlay(g, st);
  else if (st.mode === 'done') drawDoneOverlay(g, st, t);
}

function meterV(g, x, y, h, v, sweet, label) {
  g.fillStyle = 'rgba(10,14,20,.6)'; g.fillRect(x - 6, y - 6, 26, h + 12);
  if (sweet) {
    g.fillStyle = 'rgba(147,198,141,.4)';
    const sy = y + h * (1 - sweet[1]);
    g.fillRect(x, sy, 14, h * (sweet[1] - sweet[0]));
  }
  g.strokeStyle = 'rgba(243,234,212,.3)'; g.lineWidth = 1; g.strokeRect(x, y, 14, h);
  g.fillStyle = v > 0.9 ? PAL.warn : PAL.oilHi; g.fillRect(x, y + h * (1 - clamp(v, 0, 1)), 14, h * clamp(v, 0, 1));
  if (label) { g.fillStyle = PAL.dim; g.font = '10px "Microsoft YaHei"'; g.textAlign = 'center'; g.fillText(label, x + 7, y + h + 14); }
}

function drawPullOverlay(g, st) {
  const x = 40, y = 286, h = 140;
  meterV(g, x, y, h, st.tension, [0.42, 0.82], '劲');
  for (let i = 0; i < 3; i++) {
    const sx = 116 + i * 40, sy = 300;
    g.strokeStyle = i < st.pulls.length ? (st.pullBroke && st.pullBroke[i] ? PAL.warn : (st.pulls[i] > 0.85 ? PAL.strawDark : PAL.straw)) : 'rgba(243,234,212,.25)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(sx, sy + 60);
    g.quadraticCurveTo(sx + (i - 1) * 6, sy, sx, sy - (i < st.pulls.length ? 40 * st.pulls[i] + 10 : 0));
    g.stroke();
    g.fillStyle = PAL.dim; g.font = '10px "Microsoft YaHei"'; g.textAlign = 'center';
    g.fillText(`第${i + 1}把`, sx, sy + 76);
  }
}

function drawPoundOverlay(g, st) {
  const cx = 250, cy = 322;
  g.fillStyle = PAL.dim; g.font = '12px "Microsoft YaHei"'; g.textAlign = 'center';
  g.fillText('跟着鼓点捶', cx, cy - 56);
  const beatPhase = (st.beatT / BEAT) % 1;
  const r = 18 + Math.sin(beatPhase * Math.PI) * 14;
  g.strokeStyle = 'rgba(255,216,132,.5)'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy - 30, 34, 0, Math.PI * 2); g.stroke();
  g.fillStyle = Math.abs(beatPhase - 0.5) < 0.12 ? PAL.flameCore : 'rgba(194,84,46,.5)';
  g.beginPath(); g.arc(cx, cy - 30, r, 0, Math.PI * 2); g.fill();
  // 已捶次数
  for (let i = 0; i < st.tapTimes.length; i++) {
    const a = -Math.PI / 2 + (i / Math.max(1, N_BEATS)) * Math.PI * 2;
    g.fillStyle = PAL.straw; g.beginPath();
    g.arc(cx + Math.cos(a) * 50, cy - 30 + Math.sin(a) * 50, 3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = PAL.dim; g.textAlign = 'left';
}

function drawTwistOverlay(g, st) {
  // 进度条 + 匀度（与中间的手搓绳画面呼应）
  const x = 40, y = 360;
  g.fillStyle = 'rgba(10,14,20,.6)'; g.fillRect(x - 4, y - 4, 200, 30);
  g.fillStyle = PAL.oilHi; g.fillRect(x, y, 180 * clamp(st.twist, 0, 1), 12);
  g.strokeStyle = 'rgba(243,234,212,.3)'; g.strokeRect(x, y, 180, 12);
  g.fillStyle = PAL.dim; g.font = '11px "Microsoft YaHei"';
  g.fillText(`搓劲 ${Math.round(st.twist * 100)}%　匀度 ${Math.round(st.even * 100)}%`, x, y + 26);
  if (st.warp) {
    g.fillStyle = PAL.ink; g.font = '12px "Microsoft YaHei"'; g.textAlign = 'center';
    g.fillText(st.warp === 'hemp' ? '经绳：麻绳（结实·不怕水）' : '经绳：稻草（量大·泡水就散）', 300, 300);
    g.textAlign = 'left';
  }
}

function drawWarpOverlay(g, st) {
  for (let i = 0; i < 4; i++) {
    const x = warpX(i);
    g.fillStyle = 'rgba(10,14,20,.5)';
    g.fillRect(x - 10, RIG.beamY - 78, 20, 40);
    g.strokeStyle = 'rgba(243,234,212,.25)'; g.lineWidth = 1; g.strokeRect(x - 10, RIG.beamY - 78, 20, 40);
    const f = st.cords[i] / 100;
    g.fillStyle = st.cords[i] > 90 ? '#d8c8a4' : PAL.oilHi; g.fillRect(x - 10, RIG.beamY - 78 + 40 * (1 - f), 20, 40 * f);
  }
  const spread = Math.max(...st.cords) - Math.min(...st.cords);
  g.fillStyle = spread < 14 ? PAL.good : PAL.warn; g.font = '12px "Microsoft YaHei"'; g.textAlign = 'center';
  g.fillText(spread < 14 ? '四根张力一致 ✓' : `四根还差 ${Math.round(spread)}`, W / 2, RIG.beamY - 90);
  g.textAlign = 'left';
}

function drawWeaveOverlay(g, st) {
  const topY = SHOE_CY - 30;
  for (let i = 0; i < N_SLOTS; i++) {
    const x = lerp(RIG.beamX0, RIG.beamX1, i / (N_SLOTS - 1));
    g.fillStyle = st.slots[i] ? PAL.good : 'rgba(243,234,212,.22)';
    g.beginPath(); g.arc(x, topY, 4, 0, Math.PI * 2); g.fill();
  }
  const mx = st.markerX;
  g.strokeStyle = PAL.oilHi; g.lineWidth = 2;
  g.beginPath(); g.moveTo(mx, topY - 20); g.lineTo(mx, topY + 60); g.stroke();
  g.fillStyle = PAL.ink; g.font = '12px "Microsoft YaHei"'; g.textAlign = 'center';
  g.fillText(`已编 ${st.good} / ${N_SLOTS}　错 ${st.mistakes} 道`, W / 2, topY - 34);
  g.textAlign = 'left';
}

function drawFinishOverlay(g, st) {
  const cx = SHOE_CX, cy = 250;
  meterV(g, cx - 7, cy - 75, 150, st.tension, [0.42, 0.72], '紧');
  g.fillStyle = PAL.dim; g.font = '12px "Microsoft YaHei"'; g.textAlign = 'center';
  g.fillText(st.ear ? `耳料：${EAR[st.ear].name}` : '先选耳料', cx + 60, cy - 60);
  g.textAlign = 'left';
}

function drawDoneOverlay(g, st, t) {
  g.fillStyle = 'rgba(10,14,20,.45)'; g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.font = '24px "KaiTi", serif';
  g.fillStyle = st.outcome === 'done' ? PAL.good : PAL.warn;
  g.fillText(st.outcome === 'done' ? '成鞋' : (st.outcome === 'unfinished' ? '灯枯了' : '鞋散了'), W / 2, 150);
  g.font = '14px "Microsoft YaHei"'; g.fillStyle = PAL.ink;
  g.fillText(`能走 ${st.li} 里`, W / 2, 182);
  g.textAlign = 'left';
}

/* ══════════════════════════ 三、六道工序的交互 ══════════════════════════ */

/* 把运行态同步到 dataset 与 HUD（模块级，供各步骤函数调用）。HUD 宿主经 st.statsHost 传入。*/
function sync(s) {
  s.container.dataset.miniState = s.mode;
  s.container.dataset.miniStep = String(s.stepIdx + 1);
  s.container.dataset.miniNight = String(Math.round(s.costSoFar));
  s.container.dataset.miniNightLeft = String(Math.round(Math.max(0, NIGHT - s.costSoFar)));
  s.container.dataset.miniQuality = s.qs.length ? String(s.qs[s.qs.length - 1].toFixed(2)) : '0';
  s.container.dataset.miniWarp = s.warp || '';
  s.container.dataset.miniEar = s.ear || '';
  if (s.outcome) {
    s.container.dataset.miniOutcome = s.outcome;
    s.container.dataset.miniLi = String(s.li);
    s.container.dataset.miniScore = String(s.score ?? '');
  }
  const rows = [
    ['工序', `${s.stepIdx + 1} / 6`],
    ['灯油', `${Math.round(Math.max(0, NIGHT - s.costSoFar))}%`],
    ['经', s.warp ? WARP[s.warp].name : '—'],
    ['耳', s.ear ? EAR[s.ear].name : '—'],
  ];
  if (s.outcome) rows.push(['里程', `${s.li} 里`]);
  stats(s.statsHost, rows);
  // 编底工序把进度与标记位置暴露给自动化（与 fishing.js 暴露 miniTension 等同构）
  if (s.mode === 'weave') {
    s.container.dataset.miniWeaveGood = String(s.good);
    s.container.dataset.miniWeaveMiss = String(s.mistakes);
    s.container.dataset.miniMarker = String(Math.round(s.markerX));
  }
}

/* 进入第 idx 道工序：重建该步的控制 UI，重置步骤内状态。*/
function enterStep(idx, st) {
  st.stepIdx = idx;
  st.mode = STEPS[idx].id;
  st.S = {};
  // 步骤内共享瞬时态
  st.tension = 0; st.charging = false;
  st.pulls = []; st.pullBroke = [];
  st.beatT = 0; st.beatIdx = 0; st.tapTimes = []; st.elapsed = 0; st.pounding = false;
  st.mallet = 0; st.soft = 0; st.crushed = false; st.brokenT = 0;
  st.weaveFlashT = 0; st.wrongFlashT = 0;
  st.twist = 0; st.lastSide = null; st.intervals = []; st.lastTapT = 0; st.even = 0;
  st.cords = [50, 50, 50, 50];
  st.good = 0; st.mistakes = 0; st.slots = new Array(N_SLOTS).fill(false); st.markerX = RIG.beamX0; st.markerDir = 1; st.locked = false;
  st.committed = false;   // commitStep 会置 true，进下一道必须复位，否则下一道提交会被吞掉
  st.actionBtns = [];
  buildControls(st);
  setStatus(STEPS[idx].name, '');
  setHint(STEPS[idx].op);
  sync(st);
}

/* 控制 UI 容器里的按钮辅助 */
function mkBtn(st, label, action, opts = {}) {
  const b = h('button', { type: 'button', class: 'smini19-btn' + (opts.pri ? ' pri' : '') + (opts.sel ? ' sel' : ''), text: label });
  b.setAttribute('data-mini-action', action);
  if (opts.disabled) { b.disabled = true; b.removeAttribute('data-mini-action'); }
  b.addEventListener('click', () => onAction(action, st), { signal: st.signal });
  st.actionBtns.push(b);
  return b;
}

function buildControls(st) {
  const box = st.actions;
  box.innerHTML = '';
  st.actionBtns = [];
  if (st.mode === 'pull') {
    const hold = h('button', { type: 'button', class: 'smini19-btn pri', text: '按住拔草（松手放绳）' });
    hold.setAttribute('data-mini-action', 'pull-hold');
    hold.addEventListener('pointerdown', (e) => { e.preventDefault(); startCharge(st); }, { signal: st.signal });
    box.appendChild(hold);
  } else if (st.mode === 'pound') {
    const tap = h('button', { type: 'button', class: 'smini19-btn pri', text: '捶（跟着鼓点）' });
    tap.setAttribute('data-mini-action', 'pound-tap');
    tap.addEventListener('pointerdown', (e) => { e.preventDefault(); poundTap(st); }, { signal: st.signal });
    box.appendChild(tap);
    const auto = mkBtn(st, '不捶了，看结果', 'pound-end');
    box.appendChild(auto);
  } else if (st.mode === 'twist') {
    if (!st.warp) {
      box.appendChild(h('span', { class: 'smini19-hint', html: '先选<b>经绳</b>：' }));
      box.appendChild(mkBtn(st, '麻绳（结实·不怕水）', 'warp-pick-hemp', { sel: true }));
      box.appendChild(mkBtn(st, '稻草（量大·泡水就散）', 'warp-pick-straw'));
    } else {
      box.appendChild(mkBtn(st, '← 左搓', 'twist-left'));
      box.appendChild(mkBtn(st, '右搓 →', 'twist-right'));
      const done = mkBtn(st, '成绳', 'twist-done', { pri: true, disabled: st.twist < 0.85 });
      box.appendChild(done);
    }
  } else if (st.mode === 'warp') {
    const wrap = h('div', { class: 'smini19-actions' });
    for (let i = 0; i < 4; i++) {
      const sl = h('input', { type: 'range', min: '0', max: '100', value: '50', class: 'smini19-slider-inp' });
      sl.setAttribute('data-mini-action', `warp-cord-${i}`);
      sl.addEventListener('input', () => { st.cords[i] = Number(sl.value); sync(st); }, { signal: st.signal });
      wrap.appendChild(h('label', { class: 'smini19-slider' }, [`经${i + 1}`, sl]));
    }
    box.appendChild(wrap);
    box.appendChild(mkBtn(st, '绷紧收口 →', 'warp-tighten', { pri: true }));
  } else if (st.mode === 'weave') {
    const ins = h('button', { type: 'button', class: 'smini19-btn pri', text: '插草（对准时）' });
    ins.setAttribute('data-mini-action', 'weave-insert');
    ins.addEventListener('pointerdown', (e) => { e.preventDefault(); weaveInsert(st); }, { signal: st.signal });
    box.appendChild(ins);
    const undo = mkBtn(st, '拆一道（修错的）', 'weave-undo', { disabled: st.mistakes <= 0 });
    box.appendChild(undo);
  } else if (st.mode === 'finish') {
    if (!st.ear) {
      box.appendChild(h('span', { class: 'smini19-hint', html: '选<b>耳料</b>：' }));
      box.appendChild(mkBtn(st, '布条（最软·只有一块）', 'ear-pick-cloth', { sel: true }));
      box.appendChild(mkBtn(st, '麻绳', 'ear-pick-hemp'));
      box.appendChild(mkBtn(st, '稻草', 'ear-pick-straw'));
    } else {
      const hold = h('button', { type: 'button', class: 'smini19-btn pri', text: '按住收口（松手定紧)' });
      hold.setAttribute('data-mini-action', 'finish-hold');
      hold.addEventListener('pointerdown', (e) => { e.preventDefault(); startCharge(st); }, { signal: st.signal });
      box.appendChild(hold);
    }
  }
}

/* —— 拔草 / 收口：按住蓄力、松手定档 —— */
function startCharge(st) {
  if (st.charging) return;
  st.charging = true; st.tension = 0;
  sfx('click');
}
function releaseCharge(st) {
  if (!st.charging) return;
  st.charging = false;
  const t = st.tension;
  const snap = t > 0.92;
  const q = snap ? 0.05 : clamp(1 - Math.abs(t - 0.62) / 0.40, 0, 1);
  if (st.mode === 'pull') {
    st.pulls.push(q);
    st.pullBroke.push(snap);
    if (snap) { st.brokenT = 0.9; sfx('wrong'); }
    else sfx(q > 0.7 ? 'correct' : 'click');
    if (st.pulls.length >= 3) {
      const avg = st.pulls.reduce((a, b) => a + b, 0) / 3;
      commitStep(st, avg);
    } else { setStatus(`拔了 ${st.pulls.length} / 3 把`, ''); }
  } else if (st.mode === 'finish') {
    st.finishQ = q;
    sfx(snap ? 'wrong' : (q > 0.7 ? 'correct' : 'click'));
    commitStep(st, q);
  }
}

/* —— 捶软：跟着鼓点落捶 —— */
function poundTap(st) {
  if (st.mode !== 'pound') return;
  st.elapsed = st.elapsed; // 由 update 累加
  st.tapTimes.push(st.poundClock);
  st.mallet = 1;            // 槌头落地（画面）
  sfx('click');
  setStatus(`已捶 ${st.tapTimes.length} 下`, '');
}
function poundEnd(st) {
  commitStep(st, poundQuality(st));
}

function poundQuality(st) {
  if (st.tapTimes.length === 0) return 0.1;
  let sum = 0;
  for (let b = 0; b < N_BEATS; b++) {
    const bt = 0.4 + b * BEAT;
    let best = 1;
    for (const tt of st.tapTimes) best = Math.min(best, Math.abs(tt - bt));
    sum += clamp(1 - best / (BEAT * 0.45), 0, 1);
  }
  let q = sum / N_BEATS;
  if (st.tapTimes.length < N_BEATS * 0.5) q *= 0.5;       // 捶不够 → 还硬
  if (st.tapTimes.length > N_BEATS * 1.8) q *= 0.7;        // 乱捶 → 碎
  return clamp(q, 0, 1);
}

/* —— 搓绳：左右交替，劲儿要匀 —— */
function twistSide(side, st) {
  if (st.mode !== 'twist' || !st.warp) return;
  const now = st.twistClock;
  if (st.lastSide && side !== st.lastSide) {
    const iv = now - st.lastTapT;
    if (st.lastTapT > 0 && iv > 0.02) st.intervals.push(iv);
    st.lastTapT = now;
    st.twist = clamp(st.twist + 0.07, 0, 1.2);
    sfx('click');
    // 匀度：间隔的标准差越小越匀
    if (st.intervals.length >= 2) {
      const m = st.intervals.reduce((a, b) => a + b, 0) / st.intervals.length;
      const sd = Math.sqrt(st.intervals.reduce((a, b) => a + (b - m) ** 2, 0) / st.intervals.length);
      st.even = clamp(1 - sd / (m * 0.8 + 1e-6), 0, 1);
    }
  } else if (!st.lastSide) {
    st.lastTapT = now; st.twist = clamp(st.twist + 0.04, 0, 1.2);
  }
  st.lastSide = side;
  // 刷新成绳按钮可用性
  const done = st.actionBtns.find((b) => b.getAttribute('data-mini-action') === 'twist-done');
  if (done) { const ok = st.twist >= 0.85; done.disabled = !ok; if (ok) done.setAttribute('data-mini-action', 'twist-done'); else done.removeAttribute('data-mini-action'); }
  if (st.twist >= 1.0) commitStep(st, twistQuality(st));
}
function twistQuality(st) {
  const fill = clamp(st.twist, 0, 1);
  return clamp(fill * (0.55 + 0.45 * st.even), 0, 1);
}

/* —— 编底：对准时插草，错了要拆 —— */
function weaveInsert(st) {
  if (st.mode !== 'weave' || st.locked) return;
  // 找离标记最近、且未填的槽
  let bestI = -1, bestD = 1e9;
  for (let i = 0; i < N_SLOTS; i++) {
    if (st.slots[i]) continue;
    const x = lerp(RIG.beamX0, RIG.beamX1, i / (N_SLOTS - 1));
    const d = Math.abs(x - st.markerX);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  const tol = 26;
  if (bestI >= 0 && bestD < tol) {
    st.slots[bestI] = true; st.good += 1; sfx('correct'); st.weaveFlashT = 0.5;
    if (st.good >= N_SLOTS) { commitStep(st, weaveQuality(st)); return; }
  } else {
    // 对不准 → 编错一道，必须拆回去
    st.mistakes += 1; st.locked = true; sfx('wrong'); st.wrongFlashT = 0.8;
    setStatus('编错了一道——按「拆一道」拆回去重编', 'warn');
    refreshUndo(st);
  }
  sync(st);
}
function weaveUndo(st) {
  if (st.mistakes <= 0) return;
  st.mistakes -= 1; st.locked = false; sfx('click'); st.weaveFlashT = 0.5;
  setStatus('拆了一道，重新对准时插草', '');
  refreshUndo(st); sync(st);
}
function refreshUndo(st) {
  const u = st.actionBtns.find((b) => b.getAttribute('data-mini-action') === 'weave-undo');
  if (u) { const ok = st.mistakes > 0; u.disabled = !ok; if (ok) u.setAttribute('data-mini-action', 'weave-undo'); else u.removeAttribute('data-mini-action'); }
}
function weaveQuality(st) {
  return clamp(st.good / N_SLOTS - 0.18 * st.mistakes, 0, 0.98);
}

/* —— 统一的动作入口（按钮 / 键盘都走这里）—— */
function onAction(action, st) {
  switch (action) {
    case 'pull-hold': startCharge(st); break;          // 键盘也会调，等价于 pointerdown
    case 'pound-tap': poundTap(st); break;
    case 'pound-end': poundEnd(st); break;
    case 'warp-pick-hemp': st.warp = 'hemp'; buildControls(st); setHint('麻绳做经——结实耐磨。现在左右交替搓绳。'); break;
    case 'warp-pick-straw': st.warp = 'straw'; buildControls(st); setHint('稻草做经——量大，但过河就散。现在左右交替搓绳。'); break;
    case 'twist-left': twistSide('L', st); break;
    case 'twist-right': twistSide('R', st); break;
    case 'twist-done': if (st.twist >= 0.85) commitStep(st, twistQuality(st)); break;
    case 'warp-cord-0': case 'warp-cord-1': case 'warp-cord-2': case 'warp-cord-3': break; // 由 input 事件处理
    case 'warp-tighten': commitStep(st, warpQuality(st)); break;
    case 'weave-insert': weaveInsert(st); break;
    case 'weave-undo': weaveUndo(st); break;
    case 'ear-pick-cloth': st.ear = 'cloth'; buildControls(st); break;
    case 'ear-pick-hemp': st.ear = 'hemp'; buildControls(st); break;
    case 'ear-pick-straw': st.ear = 'straw'; buildControls(st); break;
    case 'finish-hold': startCharge(st); break;
  }
}

function warpQuality(st) {
  const mean = st.cords.reduce((a, b) => a + b, 0) / 4;
  const spread = Math.max(...st.cords) - Math.min(...st.cords);
  let q = clamp(1 - spread / 70, 0.05, 1) * clamp(mean / 45, 0.1, 1);
  return clamp(q, 0, 1);
}

/* —— 提交一道工序的质量，扣灯油，决定下一步 —— */
function commitStep(st, q) {
  if (st.committed) return;
  st.committed = true;
  st.qs.push(q);
  st.costSoFar += stepCost(q, STEPS[st.stepIdx].base);
  sfx(q > 0.7 ? 'correct' : (q > 0.4 ? 'click' : 'wrong'));
  // 进入下一道；若灯油熬干则这一夜没打成鞋
  if (st.stepIdx < STEPS.length - 1) {
    if (st.costSoFar > NIGHT) { st.finishGame('unfinished'); return; }
    enterStep(st.stepIdx + 1, st);
  } else {
    if (st.costSoFar > NIGHT) { st.finishGame('unfinished'); return; }
    st.finishGame(null); // 六道都编完 → 按质量判定
  }
}

/* ══════════════════════════ 四、runWeave（装配与生命周期） ══════════════════════════ */
export async function runWeave(container, opts = {}) {
  return new Promise((resolve) => {
    ensureStyle();
    const P = {
      gold: cssVar('--gold', '#b8963e'),
      seal: cssVar('--seal', '#a8322a'),
    };

    container.innerHTML = '';
    const root = h('div', { class: 'smini19-wrap' });
    const lead = h('p', { class: 'smini19-lead' });
    const cv = h('canvas', { class: 'smini19-cv' });
    const statusEl = h('p', { class: 'smini19-status' });
    const actions = h('div', { class: 'smini19-actions' });
    const hint = h('p', { class: 'smini19-hint' });
    const fb = h('div', { class: 'smini19-fb' });
    root.append(lead, cv, statusEl, actions, hint, fb);
    container.appendChild(root);

    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = '100%';
    cv.style.height = 'auto';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 开场文案（史实锚点 + 任务）
    lead.innerHTML = '湘江过去了，队伍在山坳里宿营。明天还有<b>七十里泥路</b>，还要过一条河。'
      + '《红色中华》登过号召：<b>「不要使一个红色战士赤足作战」</b>——这一夜，你替班里打一只草鞋。'
      + '<span class="dim">从拔草到成鞋，六道工序，每一步都得亲手来。'
      + '一夜的灯油有限：做得越细越耗夜，六道全做到极致就打不完——总要有人赤脚走那段路。</span>';

    const ac = new AbortController();
    const { signal } = ac;

    // 运行时态
    const st = {
      mode: 'pull', stepIdx: 0, qs: [], costSoFar: 0,
      warp: null, ear: null, finishQ: 0,
      tension: 0, charging: false, pulls: [], pullBroke: [],
      beatT: 0, tapTimes: [], elapsed: 0, poundClock: 0,
      mallet: 0, soft: 0, crushed: false, brokenT: 0,
      weaveFlashT: 0, wrongFlashT: 0,
      twist: 0, lastSide: null, intervals: [], lastTapT: 0, even: 0, twistClock: 0,
      cords: [50, 50, 50, 50],
      good: 0, mistakes: 0, slots: new Array(N_SLOTS).fill(false), markerX: RIG.beamX0, markerDir: 1, locked: false,
      outcome: null, li: 0, committed: false,
      actions, statusEl, hint, fb,
      signal, resolve,
    };
    // 让辅助函数能拿到容器与工具
    st.container = container;
    st.statsHost = opts.stats;
    _st = st;   // 模块级 setStatus/setHint 通过它找到正确的 DOM

    container.dataset.mini = 'weave-v2';

    // 全局监听（统一用 signal 自清）
    window.addEventListener('pointerup', () => { if (st.charging) releaseCharge(st); }, { signal });
    window.addEventListener('pointercancel', () => { if (st.charging) releaseCharge(st); }, { signal });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (st.mode === 'pull' && (k === ' ' || k === 'enter')) { e.preventDefault(); startCharge(st); }
      else if (st.mode === 'pound' && (k === ' ' || k === 'enter')) { e.preventDefault(); poundTap(st); }
      else if (st.mode === 'twist') {
        if (k === 'arrowleft' || k === 'a') twistSide('L', st);
        else if (k === 'arrowright' || k === 'd') twistSide('R', st);
      } else if (st.mode === 'weave' && (k === ' ' || k === 'enter')) { e.preventDefault(); weaveInsert(st); }
      else if (st.mode === 'finish' && (k === ' ' || k === 'enter')) { e.preventDefault(); startCharge(st); }
    }, { signal });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if ((k === ' ' || k === 'enter') && st.charging) { e.preventDefault(); releaseCharge(st); }
    }, { signal });

    // 主循环
    let raf = 0, last = 0;
    function loop(t) {
      if (!document.body.contains(container)) { ac.abort(); cancelAnimationFrame(raf); return; }
      const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
      last = t;
      stepGame(dt, st);
      draw(t / 1000, st);
      raf = requestAnimationFrame(loop);
    }

    function stepGame(dt, s) {
      // 蓄力
      if (s.charging) s.tension = clamp(s.tension + dt / CHARGE_T, 0, 1);
      // 拔草/收口 的 hold 由 pointerup 触发 releaseCharge
      if (s.mode === 'pound') {
        s.poundClock += dt;
        s.beatT += dt;
        s.mallet = Math.max(0, s.mallet - dt * 3.2);          // 槌头回弹
        s.soft = clamp(s.tapTimes.length / (N_BEATS * 0.55), 0, 1);
        s.crushed = s.tapTimes.length > N_BEATS * 1.7;
        if (s.poundClock > 0.4 + (N_BEATS - 1) * BEAT + 0.6) {
          // 鼓点走完，自动结算
          commitStep(s, poundQuality(s));
        }
      }
      if (s.mode === 'twist' && s.warp) {
        s.twistClock += dt;
      }
      if (s.mode === 'weave' && !s.locked) {
        // 标记来回扫动
        const x0 = RIG.beamX0, x1 = RIG.beamX1;
        s.markerX += s.markerDir * dt * 220;
        if (s.markerX > x1) { s.markerX = x1; s.markerDir = -1; }
        if (s.markerX < x0) { s.markerX = x0; s.markerDir = 1; }
      }
      if (s.mode === 'weave') {
        s.weaveFlashT = Math.max(0, s.weaveFlashT - dt);
        s.wrongFlashT = Math.max(0, s.wrongFlashT - dt);
      }
      if (s.mode === 'pull') {
        s.brokenT = Math.max(0, s.brokenT - dt);
      }
      sync(s);
    }

    function draw(t, s) {
      const g = ctx;
      drawScene(g, t, s);
      drawOverlay(g, t, s);
    }

    function finishGame(s, forced) {
      if (s.resolved) return;
      s.resolved = true;
      const plan = { qs: s.qs, warp: s.warp || 'hemp', ear: s.ear || 'hemp' };
      const r = simulatePlan(plan);
      s.outcome = forced || r.outcome;
      s.li = r.li;
      s.score = r.score;
      s.mode = 'done';
      // 结算文案
      s.fb.innerHTML = resultText(s, r);
      // 清掉控制按钮（结算后无操作元素）
      s.actions.innerHTML = '';
      setHint('');
      sync(s);
      sfx(s.outcome === 'done' ? 'correct' : 'wrong');
      // 老班长瞅一眼这只鞋 —— **等它回来再结算**（结算屏一起来 DOM 就没了，点评就写不进去了）。
      // 4 秒等不到就跳过：下面的看结果时间照旧，玩法不会因此挂住。
      s.watchSettled = false;
      s.container.dataset.miniNote = 'pending';
      keeperNote(r, s, opts).then((line) => {
        s.container.dataset.miniNote = line ? 'ok' : 'none';
        if (line) {
          s.keeperNote = line;
          if (document.body.contains(container)) {
            s.fb.insertAdjacentHTML('beforeend',
              `<p class="smini19-note">老班长瞅了瞅这只鞋：${line}</p>`);
          }
        }
      }).catch(() => { /* 点评写不出来不影响结算 */ }).finally(() => { s.watchSettled = true; });
      // 留一点时间给玩家看结果
      const t0 = performance.now();
      const watch = setInterval(() => {
        if (!document.body.contains(container)) { clearInterval(watch); ac.abort(); resolve(buildResult(s, r)); return; }
        // 等"老班长的点评"落地（或等超）——落地了就把它贴在结算文案下面
        if (performance.now() - t0 > 1100 && s.watchSettled) {
          clearInterval(watch);
          resolve(buildResult(s, r));
        }
      }, 200);
    }

    function resultText(s, r) {
      const li = r.li;
      if (s.outcome === 'unfinished') {
        return '灯枯了。天蒙蒙亮，这一夜的草鞋<b>没打成</b>——'
          + `六道只编到${s.qs.length}道。班里少了一双鞋，<b>总有人要赤脚走七十里</b>。`;
      }
      if (s.outcome === 'worn') {
        let why = '';
        if ((WARP[s.warp]?.factor ?? 1) < 0.7) why = '稻草做的经，过河那一道就散了。';
        else if (r.q < 0.6) why = '编得太糙，草鞋不经走。';
        return `鞋打成了，可只经得起 <b>${li} 里</b>——离宿营地还差一截就散了。${why}`
          + '走不完七十里的人，后半程是<b>赤着脚</b>到的。';
      }
      return `天亮时，一只草鞋躺在草鞋耙上——能走 <b>${li} 里</b>，够过泥路、够踩过那条河。`
        + '班里这一双，不用赤脚了。';
    }

    function buildResult(s, r) {
      return {
        score: s.score,
        detail: {
          outcome: s.outcome,
          li: r.li,
          quality: r.q,
          cost: r.cost,
          nightLeft: r.nightLeft,
          warp: s.warp, ear: s.ear,
          stepQuality: s.qs.map((q) => Number(q.toFixed(2))),
          keeperNote: s.keeperNote || '',
        },
        summary: s.outcome === 'done'
          ? `编草鞋：六道工序，成鞋能走 ${r.li} 里`
          : s.outcome === 'unfinished'
            ? `编草鞋：灯枯了，六道只编到 ${s.qs.length} 道，没打成鞋`
            : `编草鞋：鞋打成了，但只经得起 ${r.li} 里，路上散了`,
      };
    }

    // 启动
    st.finishGame = (forced) => finishGame(st, forced);   // 模块级 commitStep 经此回调收尾
    enterStep(0, st);
    raf = requestAnimationFrame(loop);

    // 安全网：离开板屏自清
    const guard = setInterval(() => {
      if (!document.body.contains(container)) {
        clearInterval(guard);
        ac.abort();
        cancelAnimationFrame(raf);
        if (!st.resolved) { st.resolved = true; resolve({ score: 0, detail: { outcome: 'none', why: 'detached' }, summary: '' }); }
      }
    }, 500);
  });
}

/* ══════════════════════════ 五、导出（与 minigames-registry 条目同构，但不进主线注册表） ════════════════════════ */
export const WEAVE_MINIGAMES = [
  {
    id: 'weave-v2',
    title: '编草鞋',
    family: '工序 · 编一只鞋',
    act: 'act1 湘江（待接线：宿营 night-camp）',
    note: '旧版是「料分给谁 / 6 段怎么分 / 让谁赤脚」的<b>配额</b>玩法，用户否了。'
      + '这一版把镜头收到<b>一只鞋</b>：六道工序，每一步都亲手做，质量累加成「能走多少里」。<br>'
      + '① <b>拔草</b>：按住蓄力、松手放绳，劲儿要匀，猛拽草会断（连拔三把）。'
      + '② <b>捶软</b>：跟着鼓点捶，捶不够硬、捶过了碎。'
      + '③ <b>搓绳</b>：先选经绳（麻绳结实 / 稻草量大但<b>泡水就散</b>），再左右交替搓，劲儿要匀。'
      + '④ <b>绷经</b>：四根经绳绷上草鞋耙，张力要一致。'
      + '⑤ <b>编底·编帮</b>：草当纬插进经纬，对不准的那道要拆回去。'
      + '⑥ <b>收口·成鞋</b>：选耳料（布条最软、只有一块），按住收口，松紧到位。<br>'
      + '<b>取舍</b>：一夜的灯油（NIGHT=100）是唯一预算；做得越细越耗夜，六道全满分必然熬干打不完。'
      + '<b>失败线由时间/质量画，不由配额画</b>：`unfinished` 灯枯没打成鞋；`worn` 编完但里程 &lt; 70 路上散了；'
      + '只有「编完 + 里程 ≥ 70」才 `done`。稻草经会使里程腰斩（过河散）。',
    states: ['pull', 'pound', 'twist', 'warp', 'weave', 'finish', 'done'],
    actions: ['pull-hold', 'pound-tap', 'pound-end',
      'warp-pick-hemp', 'warp-pick-straw', 'twist-left', 'twist-right', 'twist-done',
      'warp-cord-0', 'warp-cord-1', 'warp-cord-2', 'warp-cord-3', 'warp-tighten',
      'weave-insert', 'weave-undo',
      'ear-pick-cloth', 'ear-pick-hemp', 'ear-pick-straw', 'finish-hold'],
    // 2026-09-18：**收尾交给模型**（原来标 noAi，剧情里走固定效果、一句人话都没有）。
    // 局内该调的照调（见各支自己的 DECIDE）；这一次是主线的 minigame_review，写收尾叙事。
    noAi: false,
    run: (host, o = {}) => runWeave(host, o),
  },
];
