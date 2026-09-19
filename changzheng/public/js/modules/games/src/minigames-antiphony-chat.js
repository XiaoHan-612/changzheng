/**
 * 《对歌》v2 · **坐在火塘边对唱**（休闲 · 对话式，无失败线）
 * （**单独开发，未接线**）
 *
 * ── 为什么整份重写 ──
 *   旧版（minigames-antiphony.js）是**三巡对歌 + 抢腔 + 气（满气 42，三句要 59.4）
 *   + 尾音时间窗 + 接不上两次就收歌**。它做得不坏，但正是用户否掉的那类：
 *   > "唱歌更倾向于就是一个对话问答，或者就是说互相对歌，就是比较休闲娱乐的玩儿法，
 *   >  并不一定要做成这种各种有按钮性的这个操作性玩法。对歌就是一个比较轻松的玩法。"
 *
 *   所以这一版把**所有压力全部拿掉**：
 *     · 没有计时窗，没有"抢腔"，没有气，没有失败线；
 *     · 形式就是**聊天**：对面唱一句，你从三句里挑一句接上去；
 *     · 接岔了大家笑一场、歌师笑着再起一句 —— **不扣任何东西，也不会输**。
 *
 * ── 唱句全部是史料原句，一个字没改 ──
 *   · 贵州群众歌谣：「太阳出来暖洋洋，红军来了不纳粮。又分钱来又分米，穷人有了救命王。」
 *   · 施秉双井苗歌：「那年红军来我家，不要鸡来不要鸭……我一斗米你一斗，红军吃了好革命。
 *     他们从不欺百姓，稻秆一铺就睡地。不要银元不抓丁，我们农民好欢欣。」
 *   · 锦屏瑶光《红军长征过瑶光》：「红军住过苗家寨，情意留在苗家心。」
 *   · 塘东苗寨：「寨边桂树花又开，老少祭奠烈士来。红军恩情千古在，苗家儿女记心怀。」
 *   · 韶霭《踩不断的石板桥》：「老鸦要叫随它叫，风吹竹子随它摇。一心跟着共产党，
 *     踩不断的石板桥。」
 *   · 剑河元兆苗寨河边崖壁快板：「各位同志笑呵呵，过去不远要上坡。上了山，再下坡，
 *     还有五里不算多。」
 *   · 被传唱至今的那句：「阳雀记得千年树，苗家记得红军恩。」
 *   · 「红军故事大家唱，革命传统永发扬。」「打双草鞋送红军，表我干人一片心。」
 *   出处：贵州省政协《长征路上开在苗乡侗寨的红色文艺之花》· 中国作家网《流淌在歌谣里的红色记忆》
 *        · 《学习时报·红军长征在贵州》· 国防部网《苗岭深处，那一抹永不褪色的红》
 *
 * ⚠️ 叙事取舍（写在文档里，不藏着）：这些歌谣大多采自**黔东南**苗乡（黎平、锦屏、剑河、施秉），
 *   本支落在**遵义城外的寨子**。红军过遵义那 12 天里宣传队上街唱歌演花灯、扩红四五千人是真的；
 *   把黔东南的歌词集中摆到这一次对歌里，是为了让玩家听到真句子。**歌是真的，台子是拼的。**
 *   虚构层零真实历史人名（项目红线）——只用"歌师""寨老""后生""老乡"。
 *
 * ── 玩法 ──
 *   三巡对歌。每巡歌师唱一句，玩家从三句答句里挑一句：
 *     · **合韵也合意**（最好）—— 接的就是尾音那个韵，答的也是人家问的那件事；
 *     · **意思对、韵跑了**（或反过来）—— 老乡的反应是"词儿不错，就是调跑了"；
 *     · **跑题** —— 大家笑作一团，歌师笑着纠正，**照样往下唱**（不是失败）。
 *   唱完可以**跟着调子拍两下碗边**，纯热闹，不拍不扣分。
 *   结算只给"气氛"高低，没有失败线。
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

/**
 * 等模型接一句，但**不能把玩法挂住**：ms 内没回来就返回 null（调用方用固定台词收场）。
 * 与五子棋/打水漂同形 —— 超时不是错误，是"他这轮没接上"。
 */
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


function play(sfx) { try { SFX(sfx); } catch { /* 音频没起来不影响玩法 */ } }

/* ══════════════ 小工具（自包含）══════════════ */

function h(tag, attrs = {}, kids = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) el.appendChild(kid);
  return el;
}

function mount(container, node) { container.innerHTML = ''; container.appendChild(node); return node; }

function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

function revealScroll(el) {
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 4) {
      const pr = p.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.bottom > pr.bottom) p.scrollTop += (er.bottom - pr.bottom) + 6;
      return true;
    }
    p = p.parentElement;
  }
  return false;
}

function stats(_host, items) { return STATS(items); }

/* ══════════════ 三巡歌（纯数据 · 唱句全为史料原句）══════════════ */

/**
 * tier: 'good' 合韵合意 / 'ok' 意思对、韵跑了（或反之）/ 'miss' 跑题
 * react: 唱出去之后老乡们的反应
 */
export const ROUNDS = [
  {
    id: 'ask',
    lead: '天擦黑，火塘边围了一圈人。歌师先起了个头 ——',
    master: '太阳出来暖洋洋，红军来了不纳粮。',
    ask: '（这是问你：红军是什么样的兵。）',
    options: [
      {
        id: 'a', tier: 'good', text: '又分钱来又分米，穷人有了救命王。',
        why: '接住了"洋/粮"那个韵，说的也正是他问的那件事。',
        react: '歌师一拍大腿，满院子的人都跟着和了一声。',
      },
      {
        id: 'b', tier: 'ok', text: '不要银元不抓丁，我们农民好欢欣。',
        why: '说的也是红军的好，可"欢欣"这个音没接住他那个韵。',
        react: '有人笑着说："词儿是好词儿，就是调跑到坡那边去了。"',
      },
      {
        id: 'c', tier: 'miss', text: '上了山，再下坡，还有五里不算多。',
        why: '这是行军路上喊的快板，人家问的是红军，你答起路来了。',
        react: '满场笑作一团。歌师摆手："我问的是兵，你给我数起路来了。"',
      },
    ],
  },
  {
    id: 'keep',
    lead: '火塘里添了柴。歌师又起一句 ——',
    master: '红军住过苗家寨，情意留在苗家心。',
    ask: '（这是说：情分留下了。）',
    options: [
      {
        id: 'a', tier: 'good', text: '阳雀记得千年树，苗家记得红军恩。',
        why: '"心"接住了，答的也正是"记得"这回事。',
        react: '寨老在边上点了点头，没说话。这一句整个寨子都在唱。',
      },
      {
        id: 'b', tier: 'ok', text: '寨边桂树花又开，老少祭奠烈士来。',
        why: '讲的是纪念，意思挨着，可"来"没接住"心"。',
        react: '有人叹了口气："这话太重了，唱得我心里发酸。"',
      },
      {
        id: 'c', tier: 'miss', text: '各位同志笑呵呵，过去不远要上坡。',
        why: '还是那句行军快板，人家在说情分，你又数起路来。',
        react: '几个人笑得直拍腿。歌师："这位同志，你是一心惦着赶路啊。"',
      },
    ],
  },
  {
    id: 'follow',
    lead: '月亮上来了。歌师把调子一转 ——',
    master: '老鸦要叫随它叫，风吹竹子随它摇。',
    ask: '（这是问你：别人怎么说，你跟不跟着走。）',
    options: [
      {
        id: 'a', tier: 'good', text: '一心跟着共产党，踩不断的石板桥。',
        why: '"摇"接住了，答的正是他问的那个"跟不跟"。',
        react: '这一句一出口，好几个后生跟着站起来了。',
      },
      {
        id: 'b', tier: 'ok', text: '红军故事大家唱，革命传统永发扬。',
        why: '意思对上了，可"扬"没接住"摇"那个调。',
        react: '有人拍拍你肩膀："是这个理，就是唱得硬了些。"',
      },
      {
        id: 'c', tier: 'miss', text: '我一斗米你一斗，红军吃了好革命。',
        why: '这是送粮时唱的，人家问你跟不跟着走，你说起捐粮。',
        react: '一位老乡乐了："粮我们早送过了，你倒是说说走不走啊。"',
      },
    ],
  },
];

const TIER_W = { good: 1, ok: 0.6, miss: 0.1 };
export const BEAT_BONUS = 0.03;   // 每巡拍一下碗边
export const MAX_BEATS = 3;

/** 纯函数：三巡的选择 → 气氛分（0..1）。没有失败线，最低也有 0.36。 */
export function moodOf(picks, beats = 0) {
  const tiers = picks.map((p) => (ROUNDS[p.round]?.options.find((o) => o.id === p.opt)?.tier) || 'miss');
  const base = tiers.reduce((s, t) => s + (TIER_W[t] ?? 0), 0) / Math.max(1, tiers.length);
  const v = 0.3 + 0.65 * base + Math.min(beats, MAX_BEATS) * BEAT_BONUS;
  return Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));
}

export function endingOf(mood) {
  if (mood >= 0.9) {
    return {
      title: '唱到月亮偏西',
      body: '歌师把最后一句也教给你了。散场的时候，有人往你兜里塞了两个热洋芋，'
        + '两个后生当场说，明早跟你们一起走。',
    };
  }
  if (mood >= 0.7) {
    return {
      title: '这后生懂我们的调',
      body: '歌师拍着你的肩说了这么一句。火塘边上的人陆续散了，'
        + '还有孩子在学着哼你刚才那两句。',
    };
  }
  return {
    title: '也算唱完了',
    body: '人家客气地送你到寨口，说"下回路过，再唱"。'
      + '调子你没接住几句，可这一夜没人当你是外人。',
  };
}

/* ══════════════ 样式 ══════════════ */

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const ink = cssVar('--ink', '#f0e4cf');
  const s = document.createElement('style');
  s.textContent = `
.smini20-wrap{position:relative;z-index:2;font-size:14px;line-height:1.7;color:${ink}}
.smini20-stage{position:relative;border-radius:10px;overflow:hidden;
  border:1px solid rgba(255,180,110,.18);box-shadow:0 10px 30px rgba(0,0,0,.5)}
.smini20-cv{display:block;width:100%;height:190px}
.smini20-cap{position:absolute;left:0;right:0;bottom:0;padding:8px 14px 9px;
  font-size:11.5px;letter-spacing:1px;color:#d9c4a1;
  background:linear-gradient(0deg,rgba(20,12,6,.85),rgba(20,12,6,0))}

.smini20-flow{padding:12px 14px 14px;
  background:linear-gradient(180deg,#241a12 0%,#1c140e 100%)}
.smini20-lead{font-size:12.5px;color:#bda486;margin:0 0 10px;line-height:1.6}
.smini20-bub{border-radius:12px;padding:10px 13px;margin-bottom:9px;max-width:88%;
  font-size:14.5px;line-height:1.75;letter-spacing:.6px}
.smini20-bub.master{align-self:flex-start;background:rgba(255,225,180,.09);
  border:1px solid rgba(255,190,120,.22);color:#f5e4c6;border-bottom-left-radius:3px}
.smini20-bub.me{margin-left:auto;background:rgba(255,170,90,.20);
  border:1px solid rgba(255,190,120,.4);color:#fff1da;border-bottom-right-radius:3px}
.smini20-bub .who{display:block;font-size:11px;letter-spacing:2px;color:#c9a97e;margin-bottom:3px}
.smini20-bub.me .who{color:#ffcd97;text-align:right}
.smini20-ask{font-size:11.5px;color:#a89076;margin:-4px 0 10px;padding-left:3px}
.smini20-react{font-size:12.5px;color:#dcc59e;background:rgba(255,225,180,.05);
  border-left:2px solid rgba(255,190,120,.4);padding:7px 11px;margin:0 0 11px;border-radius:0 6px 6px 0}
.smini20-why{display:block;font-size:11.5px;color:#a89175;margin-top:4px}

.smini20-opts{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.smini20-opt{text-align:left;cursor:pointer;border-radius:9px;padding:10px 13px;
  background:rgba(255,225,180,.06);border:1px solid rgba(255,190,120,.2);color:#f2e0bd;
  font-family:inherit;font-size:14px;line-height:1.7;letter-spacing:.5px;transition:.15s}
.smini20-opt:hover{background:rgba(255,225,180,.16);border-color:rgba(255,205,140,.45)}
.smini20-opt .no{display:inline-block;min-width:20px;color:#ffbe86;font-weight:700;margin-right:5px}

.smini20-row{display:flex;align-items:center;gap:9px;margin-top:11px;flex-wrap:wrap}
.smini20-beat{cursor:pointer;border-radius:50%;width:38px;height:38px;display:grid;place-items:center;
  font-size:17px;background:radial-gradient(circle at 35% 30%,#ffe0b0,#d7a463 60%,#a97b3c);
  border:1px solid rgba(255,220,160,.5);color:#3a2712;box-shadow:0 3px 8px rgba(0,0,0,.45)}
.smini20-beat:hover{filter:brightness(1.08)}
.smini20-beatnote{font-size:11.5px;color:#a89076}
.smini20-beatnote b{color:#ffcd97}

.smini20-end{margin-top:13px;border-radius:9px;padding:13px 15px;
  background:rgba(46,28,14,.75);border:1px solid rgba(255,190,120,.3)}
.smini20-end h4{margin:0 0 7px;font-size:15px;color:#ffd79a;letter-spacing:1px}
.smini20-end p{margin:0 0 8px;font-size:13px;line-height:1.8;color:#ecdcbe}
.smini20-end .mood{font-size:12.5px;color:#cbb08a;border-top:1px dashed rgba(255,190,120,.25);padding-top:8px}
.smini20-end .mood b{color:#ffd79a}
.smini20-hint{font-size:11.5px;color:#a4907a;margin-top:9px;line-height:1.6}
`;
  document.head.appendChild(s);
}

/* ══════════════ 火塘边的场景（canvas）══════════════ */

function drawScene(cv, t) {
  const g = cv.getContext('2d');
  if (!g) return;
  const W = cv.width, H = cv.height;
  const dpr = window.devicePixelRatio || 1;
  cv.width = W; cv.height = H;

  // 夜空
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0e1726');
  sky.addColorStop(0.55, '#1d2130');
  sky.addColorStop(1, '#2a1d13');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // 星
  g.fillStyle = 'rgba(255,240,210,.55)';
  for (let i = 0; i < 46; i++) {
    const x = ((i * 137.5) % W) | 0;
    const y = ((i * 61.7) % (H * 0.52)) | 0;
    const r = (i % 5 === 0) ? 1.4 : 0.9;
    g.globalAlpha = 0.28 + 0.5 * Math.abs(Math.sin(t * 0.0008 + i));
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;

  // 远山（两层）
  g.fillStyle = '#141b26';
  g.beginPath();
  g.moveTo(0, H * 0.62);
  for (let x = 0; x <= W; x += 8) {
    const y = H * 0.60 + Math.sin(x * 0.012) * 12 + Math.sin(x * 0.031 + 1.7) * 6;
    g.lineTo(x, y);
  }
  g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();

  g.fillStyle = '#101620';
  g.beginPath();
  g.moveTo(0, H * 0.70);
  for (let x = 0; x <= W; x += 6) {
    const y = H * 0.68 + Math.sin(x * 0.018 + 2.2) * 8;
    g.lineTo(x, y);
  }
  g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();

  // 吊脚楼剪影（左）
  g.fillStyle = '#0d1119';
  const bx = W * 0.04, by = H * 0.30;
  g.fillRect(bx, by, W * 0.20, H * 0.44);
  g.beginPath();                                  // 歇山顶
  g.moveTo(bx - 14, by); g.lineTo(bx + W * 0.10, by - 26); g.lineTo(bx + W * 0.20 + 14, by);
  g.closePath(); g.fill();
  g.fillRect(bx - 6, by + 10, W * 0.20 + 12, 5);  // 二层挑出的那道枋
  // 窗（透一点暖光）
  g.fillStyle = 'rgba(255,190,110,.5)';
  g.fillRect(bx + W * 0.04, by + H * 0.09, 11, 13);
  g.fillRect(bx + W * 0.13, by + H * 0.09, 11, 13);
  g.fillStyle = 'rgba(255,190,110,.28)';
  g.fillRect(bx + W * 0.05, by + H * 0.26, 10, 12);

  // 晒谷坝地面
  g.fillStyle = '#1a140d';
  g.fillRect(0, H * 0.78, W, H * 0.22);

  // 火塘
  const fx = W * 0.50, fy = H * 0.86;
  const flick = 0.82 + 0.18 * Math.sin(t * 0.006) + 0.08 * Math.sin(t * 0.017);
  const glow = g.createRadialGradient(fx, fy, 2, fx, fy, 116 * flick);
  glow.addColorStop(0, 'rgba(255,214,140,.72)');
  glow.addColorStop(0.30, 'rgba(255,168,80,.30)');
  glow.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(fx, fy, 116 * flick, 0, Math.PI * 2); g.fill();

  // 柴火
  g.strokeStyle = '#4a2c15'; g.lineWidth = 3.4;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.35;
    g.beginPath();
    g.moveTo(fx - Math.cos(a) * 15, fy + 5);
    g.lineTo(fx + Math.cos(a) * 15, fy + 5 - Math.sin(a) * 7);
    g.stroke();
  }
  // 火苗
  for (let i = 0; i < 3; i++) {
    const ph = t * 0.005 + i * 2.1;
    const hgt = 17 + Math.sin(ph) * 6 + i * 2;
    const gx = fx + Math.sin(ph * 1.3) * 4;
    const fg = g.createLinearGradient(gx, fy - hgt, gx, fy + 3);
    fg.addColorStop(0, 'rgba(255,240,190,.95)');
    fg.addColorStop(0.5, 'rgba(255,168,70,.85)');
    fg.addColorStop(1, 'rgba(220,90,30,.25)');
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(gx - 5 - i, fy + 3);
    g.quadraticCurveTo(gx - 3, fy - hgt * 0.55, gx, fy - hgt);
    g.quadraticCurveTo(gx + 3, fy - hgt * 0.55, gx + 5 + i, fy + 3);
    g.closePath(); g.fill();
  }

  // 围坐的人（剪影）：歌师在中间偏右，几个老乡分坐两边
  const people = [
    { x: W * 0.22, s: 1.00, lean: 0.05 },   // 老乡
    { x: W * 0.34, s: 0.92, lean: -0.04 },  // 老乡
    { x: W * 0.66, s: 1.14, lean: 0.00, master: true }, // 歌师
    { x: W * 0.80, s: 0.96, lean: 0.06 },   // 老乡
    { x: W * 0.90, s: 0.86, lean: -0.05 },  // 孩子
  ];
  people.forEach((p, i) => {
    const baseY = H * 0.845;
    const sc = p.s;
    const sw = 13 * sc, sh = 44 * sc;
    const sway = Math.sin(t * 0.0022 + i * 1.4) * 1.6;
    g.save();
    g.translate(p.x + sway, baseY);
    g.rotate(p.lean * Math.sin(t * 0.0018 + i));
    // 影子（被火光照亮的那一侧）
    g.fillStyle = 'rgba(0,0,0,.62)';
    // 身
    g.beginPath();
    g.moveTo(-sw * 0.62, 0);
    g.quadraticCurveTo(-sw * 0.50, -sh * 0.72, 0, -sh * 0.78);
    g.quadraticCurveTo(sw * 0.50, -sh * 0.72, sw * 0.62, 0);
    g.closePath(); g.fill();
    // 头
    g.beginPath(); g.arc(0, -sh * 0.90, sw * 0.44, 0, Math.PI * 2); g.fill();
    // 火塘那侧的暖边
    const side = p.x < fx ? 1 : -1;
    g.fillStyle = 'rgba(255,178,92,.30)';
    g.beginPath();
    g.moveTo(side * sw * 0.30, -sh * 0.05);
    g.quadraticCurveTo(side * sw * 0.56, -sh * 0.60, side * sw * 0.30, -sh * 0.74);
    g.quadraticCurveTo(side * sw * 0.16, -sh * 0.40, side * sw * 0.16, -sh * 0.05);
    g.closePath(); g.fill();
    // 歌师头上那块包头帕
    if (p.master) {
      g.fillStyle = 'rgba(0,0,0,.72)';
      g.beginPath();
      g.ellipse(0, -sh * 1.02, sw * 0.52, sw * 0.30, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,190,110,.34)';
      g.beginPath();
      g.ellipse(side * sw * 0.16, -sh * 1.02, sw * 0.20, sw * 0.16, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });

  // 火塘上架的锅（一点生活气）
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2;
  g.beginPath(); g.arc(fx, fy - 4, 15, Math.PI, Math.PI * 2); g.stroke();

  void dpr;
}

/* ══════════════ 玩法主体 ══════════════ */

export function runAntiphonyChat(container, opts = {}) {
  ensureStyle();
  const ctrl = new AbortController();

  let roundIdx = 0;
  const picks = [];
  let beats = 0;
  let done = false;
  let resolveFn = null;
  let picking = false;

  container.dataset.mini = 'antiphony-v2';
  container.dataset.miniState = 'sing';
  container.dataset.miniRound = '0';
  container.dataset.miniBeat = '0';

  const wrap = h('div', { class: 'smini20-wrap' });
  const stage = h('div', { class: 'smini20-stage' });
  const cv = document.createElement('canvas');
  cv.className = 'smini20-cv';
  cv.width = 720; cv.height = 190;
  stage.appendChild(cv);
  stage.appendChild(h('div', {
    class: 'smini20-cap',
    text: '遵义城外的寨子 · 火塘边 —— 唱句都是那时候真唱过的原句',
  }));
  wrap.appendChild(stage);

  const flow = h('div', { class: 'smini20-flow' });
  wrap.appendChild(flow);
  mount(container, wrap);

  /* ── 场景动画 ── */
  let raf = 0;
  const t0 = performance.now();
  function frame(now) {
    if (!document.body.contains(container)) { ctrl.abort(); return; }
    drawScene(cv, now - t0);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  ctrl.signal.addEventListener('abort', () => { if (raf) cancelAnimationFrame(raf); });

  /* ── 一巡 ── */
  function renderRound(i) {
    flow.innerHTML = '';
    container.dataset.miniRound = String(i);

    if (i >= ROUNDS.length) { finish(); return; }

    const r = ROUNDS[i];
    flow.appendChild(h('p', { class: 'smini20-lead', text: r.lead }));
    flow.appendChild(h('div', { class: 'smini20-bub master' }, [
      h('span', { class: 'who', text: '歌 师' }),
      h('span', { text: r.master }),
    ]));
    flow.appendChild(h('p', { class: 'smini20-ask', text: r.ask }));

    const optsEl = h('div', { class: 'smini20-opts' });
    r.options.forEach((o, k) => {
      const btn = h('button', { class: 'smini20-opt' }, [
        h('span', { class: 'no', text: `${k + 1}.` }),
        h('span', { text: o.text }),
      ]);
      btn.setAttribute('data-mini-action', `sing-${i}-${o.id}`);
      btn.addEventListener('click', () => choose(r, o, i));
      optsEl.appendChild(btn);
    });
    flow.appendChild(optsEl);
    play('page');
  }

  function choose(r, o, i) {
    if (done || picking) return;
    picking = true;

    picks.push({ round: i, opt: o.id, tier: o.tier });
    container.dataset.miniPicks = picks.map((p) => p.tier).join(',');

    // 玩家的那一句 + 老乡的反应
    const myBub = h('div', { class: 'smini20-bub me' }, [
      h('span', { class: 'who', text: '你' }),
      h('span', { text: o.text }),
    ]);
    // 歌师的反应：**交给模型现写一句**（原来只有固定台词）。
    // 固定那两句留着当兜底 —— 模型没接上（10 秒）就用它，玩家不会看到空场。
    const tierWord = { good: '合韵也合意', ok: '意思对、韵跑了', miss: '答岔了题' }[o.tier] || '';
    const reactText = h('span', { text: o.react });
    const react = h('p', { class: 'smini20-react' }, [
      reactText,
      h('span', { class: 'why', text: o.why }),
    ]);
    container.dataset.miniFrom = 'fixed';
    askMasterReact({ master: r.master, mine: o.text, tierWord, tier: o.tier }).then((line) => {
      if (done || !line) return;
      container.dataset.miniFrom = 'model';
      reactText.textContent = line;
    });
    const next = h('button', {
      class: 'smini20-opt', text: i + 1 >= ROUNDS.length ? '唱完了，看看这一夜' : '下一巡',
      'data-mini-action': i + 1 >= ROUNDS.length ? 'end' : 'next',
    });

    // 拍碗边
    const beatBtn = h('button', { class: 'smini20-beat', text: '碗', 'data-mini-action': 'beat' });
    const beatNote = h('span', { class: 'smini20-beatnote', html: '跟着调子拍两下碗边 <b>（不拍也不打紧）</b>' });
    beatBtn.addEventListener('click', () => {
      if (done || beats >= MAX_BEATS) return;
      beats += 1;
      container.dataset.miniBeat = String(beats);
      beatNote.innerHTML = `拍了 <b>${beats}</b> 下 —— 有人跟着你一起敲。`
        + (beats >= MAX_BEATS ? '' : ' <b>（不拍也不打紧）</b>');
      play('tap');
      if (beats >= MAX_BEATS) beatBtn.removeAttribute('data-mini-action');
      writeStats();
    });

    flow.innerHTML = '';
    flow.appendChild(h('div', { class: 'smini20-bub master' }, [
      h('span', { class: 'who', text: '歌 师' }),
      h('span', { text: r.master }),
    ]));
    flow.appendChild(myBub);
    flow.appendChild(react);
    flow.appendChild(h('div', { class: 'smini20-row' }, [beatBtn, beatNote]));
    flow.appendChild(next);

    next.addEventListener('click', () => {
      picking = false;
      roundIdx = i + 1;
      renderRound(roundIdx);
    });
    revealScroll(react);
    play(o.tier === 'good' ? 'good' : 'page');
    writeStats();
  }

  /** 请模型写歌师这一句反应（一轮一次）。返回 null 表示没接上，调用方保留固定台词。 */
  async function askMasterReact({ master, mine, tierWord, tier }) {
    const out = await decideWithin({
      scene: '遵义·街头歌台（歌师接话）',
      callType: 'antiphony_reply',
      situation: `歌师唱：「${master}」
你接：「${mine}」（这一句${tierWord}）`,
      state: opts.state || {},
      operation: { type: 'antiphony_reply', tier, master, mine },
    }, 10000);
    if (!out || out._error) return null;
    const line = String(out.reply || '').trim();
    return line ? line.slice(0, 60) : null;
  }

  function writeStats() {
    stats(opts.statsHost, [
      ['巡', `${Math.min(roundIdx + (picking ? 1 : 0), ROUNDS.length)}/${ROUNDS.length}`],
      ['接住的', picks.filter((p) => p.tier === 'good').length],
      ['跑调的', picks.filter((p) => p.tier === 'ok').length],
      ['答岔的', picks.filter((p) => p.tier === 'miss').length],
      ['拍碗', beats],
    ]);
  }

  function finish() {
    if (done) return;
    done = true;
    container.dataset.miniState = 'done';

    const mood = moodOf(picks, beats);
    const end = endingOf(mood);
    container.dataset.miniMood = String(mood);

    const good = picks.filter((p) => p.tier === 'good').length;
    const ok = picks.filter((p) => p.tier === 'ok').length;
    const miss = picks.filter((p) => p.tier === 'miss').length;

    const box = h('div', { class: 'smini20-end' }, [
      h('h4', { text: end.title }),
      h('p', { text: end.body }),
      h('p', {
        class: 'mood',
        html: `这一夜：<b>接住韵和意 ${good}</b> 巡 · 跑调 <b>${ok}</b> 巡 · 答岔 <b>${miss}</b> 巡`
          + ` · 拍碗 <b>${beats}</b> 下 —— 气氛 <b>${mood.toFixed(2)}</b>。`,
      }),
      h('p', {
        class: 'smini20-hint',
        text: '这一支没有失败线。接岔了也是唱完了 —— 那一夜本来就没人当他是外人。',
      }),
    ]);
    flow.innerHTML = '';
    flow.appendChild(h('div', { class: 'smini20-bub master' }, [
      h('span', { class: 'who', text: '歌 师' }),
      h('span', { text: '阳雀记得千年树，苗家记得红军恩。' }),
    ]));
    flow.appendChild(box);
    revealScroll(box);
    writeStats();
    play('good');

    setTimeout(() => {
      if (resolveFn) {
        resolveFn({
          score: mood,
          detail: {
            picks, beats, mood,
            good, ok, miss,
            roundCount: ROUNDS.length,
          },
          summary: `${end.title} —— ${end.body}`,
        });
      }
    }, 60);
  }

  renderRound(0);
  writeStats();

  return new Promise((resolve) => { resolveFn = resolve; });
}

/* ══════════════ 调试台规格 ══════════════ */

export const ANTIPHONY_CHAT_MINIGAMES = [
  {
    id: 'antiphony-v2',
    title: '对歌 · 火塘边',
    family: '对话 · 对唱',
    act: 'act2 · 遵义（待接线）',
    note: 'v2 整份重写（2026-09-18）。旧版是<b>三巡对歌 + 抢腔 + 气（满气 42，三句要 59.4）+ 尾音时间窗'
      + ' + 接不上两次就收歌</b>——正是用户否掉的那类操作性玩法：<br>'
      + '> "唱歌更倾向于就是一个对话问答，或者就是说互相对歌，就是比较休闲娱乐的玩儿法，'
      + '并不一定要做成这种各种有按钮性的这个操作性玩法。"<br>'
      + '这一版把<b>所有压力全部拿掉</b>：没有计时窗、没有抢腔、没有气、<b>没有失败线</b>；'
      + '形式就是<b>聊天</b>——对面唱一句，你从三句里挑一句接上去，'
      + '接岔了大家笑一场、歌师笑着纠正，<b>照样往下唱</b>。<br>'
      + '每巡三句分别是：<b>合韵也合意</b>（最好）／<b>意思对、韵跑了</b>／<b>跑题</b>（不标出来，让玩家自己品）。'
      + '唱完可以<b>跟着调子拍两下碗边</b>，纯热闹，<b>不拍不扣分</b>。<br>'
      + '唱句<b>全部是史料原句，一个字没改</b>（贵州群众歌谣 / 施秉双井苗歌 / 锦屏瑶光 / 塘东苗寨 / '
      + '韶霭《踩不断的石板桥》/ 剑河元兆崖壁快板 / 「阳雀记得千年树，苗家记得红军恩」）。<br>'
      + '结算只给"气氛"高低（全接住 0.95，全跑调 0.69，全答岔 0.36），<b>没有失败线</b>。'
      + '<b>游戏内 0 次模型调用</b>。',
    states: ['sing', 'done'],
    actions: ['sing-0-a', 'sing-0-b', 'sing-0-c',
      'sing-1-a', 'sing-1-b', 'sing-1-c',
      'sing-2-a', 'sing-2-b', 'sing-2-c',
      'beat', 'next', 'end'],
    // 2026-09-18：**收尾交给模型**（原来标 noAi，剧情里走固定效果、一句人话都没有）。
    // 局内该调的照调（见各支自己的 DECIDE）；这一次是主线的 minigame_review，写收尾叙事。
    noAi: false,
    run: (host, o = {}) => runAntiphonyChat(host, o),
  },
];
