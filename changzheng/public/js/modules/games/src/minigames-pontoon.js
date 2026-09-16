/**
 * 《夜搭浮桥》（**重做版 · 单独开发，未接入主线**）
 *
 * ── 它取代的是什么 ──
 *   旧版（minigames-story.js 的 runBridgeBuild，约 230 行）：先限时点门板"卸料"（按了就涨），
 *   再 5 段各按一次"落板"停在金区。两个问题：① 材料没有代价差别 —— 门板只是分数；
 *   ② **"夜架晨拆"这个史实上最要命的时间窗完全没有**：搭完就结束，桥也不用拆，
 *   天亮、敌机、保密，一个都不存在。
 *
 * ── 史实锚点（2026-09-16 查证，出处见 docs/HANDOFF-PONTOON.md）──
 *   于都，1934 年 10 月 17–20 日。王耀南（工兵指挥员）回忆与纪念馆记载：
 *     · 河宽 600 余米、水深 1–20 米、流速快；8 个主要渡口，其中 5 个架浮桥；
 *       方法是"**木船横排、铁锚固定、绳索串连、木板铺面**"；
 *     · 800 余条船；沿岸群众把**门板、床板、瓜棚板**都拆下来送来，
 *       曾大爷连**寿材**都捐了（"红军打仗命都不要了，我拿出几块板子算什么"）；
 *     · **傍晚 5 时后架、次日凌晨 6 时半前拆**，昼拆夜搭反复 15 次 —— 为了躲敌机侦察；
 *     · 渔工出的主意：**每条船头挂一盏马灯**，夜里浮桥才架得直。
 *   → 机制全从这几句来：船是稀缺的（局内 5 条）、门板是乡亲陆续送来的（会到货）、
 *     下锚要掐水流（对位）、**马灯是真的有用**（挂上对位窗口变宽）、
 *     渡完必须**赶在天亮前拆完**，否则门板还不了、行踪暴露。
 *
 * ── 玩家的决策 ×4 ──
 *   ① **船给哪几段**：5 条船对 8 段中流 —— 剩下的中流段只能铺板排（快、省、但过部队时会被
 *       水流冲开）。岸边浅滩段用板排就够稳。**船的分配是真决策**（船铺到浅滩上 = 白浪费，
 *       中流就得多一段晃的板排）。
 *   ② **下锚掐不掐水流**：船段要对着流把船摆正 —— 掐在稳流窗里 = 稳；掐急了 = 晃，
 *       晃段过部队时会报警要加固。挂上马灯（史实那盏）窗口宽一倍。
 *   ③ **什么时候让部队上桥**（2026-09-16 加）：门板是**陆续送到**的，加固料只能从里面出。
 *       桥一搭完就把部队放上去 → 手里一块余料都没有，第一段报警只能看着它塌；
 *       再等两批门板 → 料够了，但夜色照涨，拆桥的时间被吃掉。**第三个真决策。**
 *       （原来是"搭满即自动渡河"—— 手快反而吃亏，等于没有这个决策。）
 *   ④ **拆桥的手速与顺序**：部队一过完就得拆（每段一下），拂晓的表不等人。
 *
 * ── 失败条件（两条）──
 *   · `sunk`    桥被水流冲开 ≥2 次 → 沉了物资，乡亲的门板也捞不回来。
 *   · `exposed` 拂晓（夜 100%）时桥没拆完 / 部队没过完 → 敌机看得见，门板还不了。
 *
 * ── 接不接 AI：不接（用户原话：浮桥"体验做好就行，API 无所谓"）。游戏内 0 次模型调用。
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

/* ══════════════ 小工具（自包含）══════════════ */
function h(tag, attrs = {}, kids = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) el.appendChild(kid);
  return el;
}
function mount(container, node) { container.innerHTML = ''; container.appendChild(node); return node; }
function stats(_host, items) { return STATS(items); }
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ══════════════ 常量（QA 共用）══════════════ */
export const W = 460;
export const H = 240;
export const SEGS = 12;               // 桥段：0-1、10-11 是岸浅（浅滩），2-9 是中流
export const BOATS = 5;               // 全场就 5 条船（史实 800 条，局内是配给）
export const PLANK_START = 4;
export const PLANK_ARRIVE_EVERY = 4;  // 乡亲送门板的间隔（秒）
export const PLANK_ARRIVE_N = 2;      // 每次到两块
export const PLANK_CAP = 24;
/** 材料成本：船段 1船+1板；浅滩板排 1 板；中流板排 2 板（会被水流顶，要加固）。
 *  搭满全场 15 块板（5船+3中流排+4浅滩）；加固一次 2 块。
 *
 *  ⚠️ 2026-09-16 修（原来上限 18 —— 那是把玩法修成**数学上不可能通关**）：
 *    真正会"被水冲开"的段只有中流那 3 段板排（浅滩板排稳、掐准窗下锚的船也稳），
 *    而一段只要报警**要么被加固（=R，出局）、要么过窗没加固（=塌掉，也出局）**，
 *    所以全场报警次数 ≤ 3 —— 最坏情况要 3×2 = 6 块加固料。
 *    原上限 18 − 15 = 3，只够加固一次半 → 正确打法也必沉。
 *    现在 24 − 15 = 9，够最坏情况 3 次加固还有富余；但**必须先把桥搭完、再等门板
 *    攒够才让部队上桥**（见下面「部队上桥」这个动作）—— 乱花照样没有加固料。 */
export const NIGHT_SEC = 110;        // 17:30 → 次日 06:30
export const FLOW_SPEED = 0.62;       // 对位流速（周期/秒）
export const FLOW_WIN = [42, 58];     // 稳流窗（马灯之后 [32,68]）
export const FLOW_WIN_LAMP = [32, 68];
export const CROSS_RATE = 0.092;     // 渡河进度/秒
export const CROSS_WAVE = 0.085;     // 每走 8.5% 过一遍桥 = 一次"冲开"判定
/** ⚠️ 2026-09-16 删掉了 `WOBBLE_RISK = 0.42` 这个"每次判定 42% 概率报警"，改成**每次判定必报一段**
 *  （报哪一段仍随机）。为什么非删不可：报警期间不掷骰（`alarmSeg < 0` 才掷），
 *  而一次渡河只有约 11 秒、一次"报警 + 4 秒窗口"就吃掉 4.9 秒 —— 全场只够掷 ~3 次骰，
 *  **P(至少 2 次报警) ≈ 0.38**：也就是说"**不加固**"这种打法有**六成概率照样过桥**。
 *  玩家看得见的失败条件必须确定，不能是掷骰子。
 *  现在：报警次数 = 晃段数（中流板排 3 段 + 掐窗口失败的船），账一目了然 ——
 *  3 段晃 = 3 次报警 = 6 块加固料；乱花门板 / 乱派船，晃段就比加固料多，必断。 */
export const ALARM_SEC = 4.0;         // 加固窗口
export const REINFORCE_COST = 2;
export const BREAK_MAX = 2;
export const DISMANTLE_SEC = 0.85;    // 每段拆 0.85 秒
export const isShallow = (i) => i <= 1 || i >= SEGS - 2;

/* ══════════════ 玩法本体 ══════════════ */

export function runPontoonNight(container, opts = {}) {
  return new Promise((resolve) => {
    const rnd = opts.rnd || mulberry32(opts.rndSeed || 19341017);
    const NIGHT = opts.nightSec || NIGHT_SEC;

    /* 段状态：'.' 未搭 · 'S' 船稳 · 'W' 船晃 · 'P' 板排(浅滩稳/中流晃) · 'R' 加固过 · 'D' 已拆 */
    const segs = Array.from({ length: SEGS }, () => '.');
    let phase = 'rig';               // rig → anchor → cross → dismantle → done
    let mode = 'boat';                // rig 时：boat / plank；dismantle 时无
    let boats = BOATS;
    let planks = PLANK_START;
    let arrived = 0;                  // 乡亲已送来的批次
    let lamp = false;
    let flow = 0;                     // 对位 0-100
    let flowDir = 1;
    let anchorSeg = -1;
    let cross = 0;
    let waveNext = CROSS_WAVE;
    let alarmSeg = -1;
    let alarmLeft = 0;
    let breaks = 0;
    let night = 0;                    // 0-100%
    let dismantleLeft = 0;
    let dismantleTarget = -1;
    let allBuilt = false;             // 12 段都搭好了没（只在翻转时重画一次按钮行）
    let outcome = null;               // pass / sunk / exposed
    let over = false;
    let raf = 0;
    let last = performance.now();
    let t0 = performance.now();
    const wobble = (i) => segs[i] === 'W' || (segs[i] === 'P' && !isShallow(i));

    /* ── DOM ── */
    const root = h('div', { class: 'smini11-wrap' });
    mount(container, root);
    const lead = h('p', { class: 'smini11-lead' });
    const cv = h('canvas', { class: 'smini11-cv', width: W, height: H });
    const segRow = h('div', { class: 'smini11-segs' });
    const flowBox = h('div', { class: 'smini11-flow' });
    const acts = h('div', { class: 'smini11-acts' });
    const fbEl = h('div', { class: 'smini11-fb' });
    root.append(lead, cv, segRow, flowBox, acts, fbEl);

    const ctx = cv.getContext('2d');
    const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    container.dataset.mini = opts.id || 'pontoon-night';
    sync('rig');

    function btn(label, action, cls) {
      const b = h('button', { type: 'button', class: `smini11-btn ${cls || ''}`, text: label });
      b.setAttribute('data-mini-action', action);
      return b;
    }

    function renderLead() {
      if (phase === 'rig') {
        lead.innerHTML = '入夜了，于都河上架桥：<b>木船横排、铁锚固定、绳索串连、门板铺面</b>。'
          + `船只有 <b>${boats}</b> 条，中流有 8 段 —— 剩下的只能铺板排（过部队时会被水流冲开，要加固 ${REINFORCE_COST} 块板）。`
          + '<span class="dim">桥搭完别急着上桥：乡亲的门板还在陆续送到，'
          + '先攒够加固料再让部队过 —— 可拂晓前的表不等人。</span>';
      } else if (phase === 'cross') {
        lead.innerHTML = '部队上桥了。<b>桥面每过一段，河水就顶开一段晃的</b> —— 4 秒内点「加固」（2 块门板），'
          + '慢了就断：断两次，物资和门板一起沉。';
      } else if (phase === 'dismantle') {
        lead.innerHTML = '部队过完了。<b>天亮前把桥拆完</b> —— 一段一段点，拆下来的门板要还给乡亲。';
      } else lead.innerHTML = '';
    }
    renderLead();

    function renderActs() {
      acts.innerHTML = '';
      if (phase === 'rig') {
        const b1 = btn(`下船（船 1 + 板 1）· 剩 ${boats}`, 'mode-boat', mode === 'boat' ? 'pri' : '');
        const b2 = btn('铺板排（浅滩 1 板 / 中流 2 板）', 'mode-plank', mode === 'plank' ? 'pri' : '');
        acts.append(b1, b2);
        if (!lamp) {
          const bl = btn('船工说：船头挂马灯，夜里架得直（对位窗口 ×2）', 'lamp');
          acts.append(bl);
        }
        /* 「部队上桥」—— 原来是搭满就自动渡河（2026-09-16 改）。
           为什么要有这个按钮：门板是**陆续送到**的，而加固料只能从里面出。
           自动渡河等于"手快就吃亏"：抢着把桥搭完，手里一块余料都没有，
           第一段报警就只能看着它塌。把渡河交给玩家点，这一局才有第三个决策
           ——「现在就上桥，还是再等两批门板」。桥没搭完时按钮不可点（也不挂 data-mini-action）。 */
        const bc = btn(allBuilt ? '部队上桥（桥通了）' : '部队上桥（桥还没搭完）', 'cross', allBuilt ? 'pri' : '');
        if (!allBuilt) { bc.disabled = true; bc.removeAttribute('data-mini-action'); }
        acts.append(bc);
      } else if (phase === 'anchor') {
        acts.append(btn('下锚！（掐稳流窗）', 'anchor', 'pri'));
      } else if (phase === 'cross') {
        const br = btn('加固！（2 板）', 'reinforce', 'pri');
        br.disabled = planks < REINFORCE_COST;
        acts.append(br);
      }
    }
    renderActs();

    function renderSegs() {
      // ⚠️ 段行只在**真的变了**的时候重建（2026-09-16 踩坑）：
      //    原来每帧 innerHTML='' 重建 12 个按钮，一秒换 700+ 次节点 —— 真人的点击落在
      //    指针下的活动节点上没问题，但自动化（Playwright 的 page.click）会一直拿到
      //    已经 detach 的节点、反复重试到超时，整支玩法在脚本里变成"点了没反应"。
      //    加签名守卫后节点跨帧稳定，同时省掉每秒 700 次 DOM 重建。
      const sig = `${segs.join('')}|${phase}|${alarmSeg}|${anchorSeg}`;
      if (sig === renderSegs._sig) return;
      renderSegs._sig = sig;
      segRow.innerHTML = '';
      for (let i = 0; i < SEGS; i += 1) {
        const st = segs[i];
        const b = h('button', {
          type: 'button',
          class: `smini11-seg ${st !== '.' && st !== 'D' ? 'built' : ''} ${st === 'D' ? 'gone' : ''} ${wobble(i) ? 'wob' : ''}`,
          text: st === 'D' ? '拆' : st === '.' ? (isShallow(i) ? '滩' : '段') : st,
        });
        b.dataset.seg = String(i);
        const canAct = (phase === 'rig' || phase === 'dismantle') && st !== 'D';
        if (canAct) b.setAttribute('data-mini-action', 'seg');
        else b.removeAttribute('data-mini-action');
        if (alarmSeg === i) b.classList.add('alarm');
        segRow.appendChild(b);
      }
    }

    function sync(stateWord) {
      if (stateWord) container.dataset.miniState = stateWord;
      container.dataset.miniPhase = phase;
      // 段位从"差一段"变成"搭满了"的那一刻，重画一次动作行 ——
      // 「部队上桥」要在这时候才变成可点的（只在翻转时重画，节点不抖）。
      if (phase === 'rig') {
        const n = segs.every((s) => s !== '.');
        if (n !== allBuilt) { allBuilt = n; renderActs(); }
      }
      container.dataset.miniNight = String(Math.round(night));
      container.dataset.miniBoats = String(boats);
      container.dataset.miniPlanks = String(planks);
      container.dataset.miniCross = String(Math.round(cross * 100));
      container.dataset.miniBreaks = String(breaks);
      container.dataset.miniLamp = lamp ? '1' : '0';
      container.dataset.miniSegs = segs.join('');
      container.dataset.miniAlarm = String(alarmSeg);
      container.dataset.miniFlow = String(Math.round(flow));
      container.dataset.miniAnchorSeg = String(anchorSeg);
      renderSegs();
      // 面板只在值变时重写（字宽抖动会让按钮盒永不稳定，真点击点不进去）
      const rows = [
        ['夜色', `${Math.round(night)}%`],
        ['船', `${boats}`],
        ['门板', `${planks}`],
        ['桥面', `${segs.filter((s) => s !== '.' && s !== 'D').length}/${SEGS}`],
        [phase === 'cross' ? '部队' : '断', phase === 'cross' ? `${Math.round(cross * 100)}%` : `${breaks}/${BREAK_MAX}`],
      ];
      const sig = JSON.stringify(rows);
      if (sig !== sync._sig) { sync._sig = sig; stats(opts.stats, rows); }
    }

    /* ── 动作 ── */
    function setMode(m) {
      if (phase !== 'rig') return;
      mode = m;
      renderActs();
      SFX('click');
    }
    function hangLamp() {
      if (lamp || phase !== 'rig') return;
      lamp = true;
      renderActs();
      renderLead();
      fbEl.textContent = '船头的马灯一盏接一盏亮起来，桥身看得直了。';
      SFX('correct');
    }
    function clickSeg(i) {
      if (phase === 'rig' && segs[i] === '.') {
        if (mode === 'boat') {
          if (boats < 1 || planks < 1) { fbEl.textContent = '船或门板不够了。'; return; }
          boats -= 1; planks -= 1;
          anchorSeg = i; phase = 'anchor'; flow = 0; flowDir = 1;
          renderActs(); renderLead(); sync('anchor');
          SFX('click');
        } else {
          const cost = isShallow(i) ? 1 : 2;
          if (planks < cost) { fbEl.textContent = '门板不够 —— 等乡亲下一批。'; return; }
          planks -= cost;
          segs[i] = 'P';
          SFX('thud');
          sync();
        }
      } else if (phase === 'dismantle' && segs[i] !== 'D' && dismantleLeft <= 0) {
        dismantleTarget = i;
        dismantleLeft = DISMANTLE_SEC;
        SFX('click');
      }
    }
    function doAnchor() {
      if (phase !== 'anchor') return;
      const [a, b] = lamp ? FLOW_WIN_LAMP : FLOW_WIN;
      const inWin = flow >= a && flow <= b;
      segs[anchorSeg] = inWin ? 'S' : 'W';
      phase = 'rig'; anchorSeg = -1;
      renderActs(); renderLead();
      fbEl.textContent = inWin ? '锚咬住了。船身稳下来。' : '锚下急了 —— 船头还在打晃。';
      SFX(inWin ? 'correct' : 'wrong');
      sync('rig');
      // 渡河不再自动触发 —— 见 renderActs 里「部队上桥」那段注释
    }
    function toCross() {
      phase = 'cross';
      cross = 0; waveNext = CROSS_WAVE;
      renderActs(); renderLead(); sync('cross');
    }
    function reinforce() {
      if (phase !== 'cross' || alarmSeg < 0) return;
      if (planks < REINFORCE_COST) return;
      planks -= REINFORCE_COST;
      segs[alarmSeg] = 'R';
      alarmSeg = -1;
      SFX('correct');
      fbEl.textContent = '两块门板横着别进去，水从底下走了。';
      sync();
    }

    function finish(res, why) {
      if (over) return;
      over = true;
      outcome = res;
      phase = 'done';
      acts.innerHTML = '';
      alarmSeg = -1;
      let score;
      if (res === 'pass') {
        const wobbly = segs.filter((s, i) => s !== 'D' && wobble(i)).length;
        score = Math.min(1, 0.6 + (lamp ? 0.1 : 0) + Math.max(0, 0.15 - wobbly * 0.08) - breaks * 0.1);
        SFX('correct');
      } else {
        score = res === 'sunk' ? 0.15 : 0.2;
        SFX('wrong');
      }
      fbEl.textContent = why;
      container.dataset.miniOutcome = res;
      sync('done');
      const unreturned = segs.filter((s) => s !== 'D' && s !== '.').length;
      setTimeout(() => {
        resolve({
          score: Number(Math.max(0, score).toFixed(3)),
          detail: {
            outcome: res, lamp, breaks, unreturned,
            boatsLeft: boats, usedSec: Number(((performance.now() - t0) / 1000).toFixed(1)),
          },
          summary: res === 'pass'
            ? `夜搭浮桥：${lamp ? '挂马灯' : '摸黑'}架完，部队过完，天亮前拆干净（断 ${breaks} 次）`
            : res === 'sunk' ? '夜搭浮桥：桥被冲开了两次，物资沉了' : '夜搭浮桥：拂晓了桥还没拆完',
        });
      }, 800);
    }

    /* 输入 */
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-mini-action]');
      if (!a) return;
      const act = a.getAttribute('data-mini-action');
      if (act === 'mode-boat') setMode('boat');
      else if (act === 'mode-plank') setMode('plank');
      else if (act === 'lamp') hangLamp();
      else if (act === 'cross') { if (allBuilt) toCross(); }
      else if (act === 'anchor') doAnchor();
      else if (act === 'reinforce') reinforce();
      else if (act === 'seg') clickSeg(Number(a.dataset.seg));
    });
    const onKey = (e) => {
      if (!container.isConnected) { window.removeEventListener('keydown', onKey); return; }
      if (e.code === 'Space' && e.type === 'keydown' && !e.repeat) {
        e.preventDefault();
        if (phase === 'anchor') doAnchor();
        else if (phase === 'cross') reinforce();
        else if (phase === 'rig' && allBuilt) toCross();   // 扛 Space 让部队上桥（桥没搭完不行）
      }
    };
    window.addEventListener('keydown', onKey);

    /* ── 主循环 ── */
    function frame(now) {
      if (!container.isConnected) { cancelAnimationFrame(raf); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!over) {
        const nightPrev = night;
        night = Math.min(100, ((performance.now() - t0) / (NIGHT * 1000)) * 100);
        // 乡亲的门板：每 PLANK_ARRIVE_EVERY 秒到 2 块，到了上限就不再送
        const batches = Math.floor((performance.now() - t0) / (PLANK_ARRIVE_EVERY * 1000));
        if (batches > arrived) {
          planks = Math.min(PLANK_CAP, planks + (batches - arrived) * PLANK_ARRIVE_N);
          arrived = batches;
        }
        if (phase === 'anchor') {
          flow += flowDir * FLOW_SPEED * 100 * dt;
          if (flow >= 100) { flow = 100; flowDir = -1; }
          if (flow <= 0) { flow = 0; flowDir = 1; }
        } else if (phase === 'rig') {
          // 搭满**不**自动渡河（2026-09-16 改）：渡河交给「部队上桥」这个动作，
          // 玩家才能先攒够加固料再走。这里什么都不做，时间照样走（夜色照涨）。
        }
        if (phase === 'cross') {
          cross = Math.min(1, cross + CROSS_RATE * dt);
          // 每过一段"晃"段，判定一次冲开
          // 每过一段桥面，河水就顶开一段晃的（必报，哪一段随机）——
          // 原来这里是 `rnd() < WOBBLE_RISK`，见常量区那段注释：失败线会变成掷骰子。
          if (cross >= waveNext) {
            waveNext += CROSS_WAVE;
            if (alarmSeg < 0) {
              const risky = [];
              for (let i = 0; i < SEGS; i += 1) if (wobble(i) && segs[i] !== 'D') risky.push(i);
              if (risky.length) {
                alarmSeg = risky[Math.floor(rnd() * risky.length)];
                alarmLeft = ALARM_SEC;
                SFX('thud');
              }
            }
          }
          if (alarmSeg >= 0) {
            alarmLeft -= dt;
            if (alarmLeft <= 0) {
              // 没加固 → 断
              segs[alarmSeg] = '.';         // 塌了（这段没了）
              breaks += 1;
              cross = Math.max(0, cross - 0.06);
              waveNext = Math.max(waveNext, cross + CROSS_WAVE);
              alarmSeg = -1;
              SFX('wrong');
              fbEl.textContent = '那一段被顶开了 —— 水把门板卷走，队伍退回几步重新过。';
              if (breaks >= BREAK_MAX) {
                finish('sunk', '第二次断的时候，连同扛门板的战士一起卷进了水里。天亮之前，谁也顾不上捞东西了。');
              }
            }
          }
          if (cross >= 1 && phase === 'cross') {
            // 部队过完了 → 报警作废。不清的话 alarmSeg 会一直挂着：
            // 红圈跟着进拆桥阶段（那段还会被标成"报警中"），而它的倒计时只在 cross 分支里走 → 永不结算。
            alarmSeg = -1;
            phase = 'dismantle';
            renderActs(); renderLead();
            sync('dismantle');
          }
        } else if (phase === 'dismantle') {
          if (dismantleLeft > 0) {
            dismantleLeft -= dt;
            if (dismantleLeft <= 0 && dismantleTarget >= 0) {
              segs[dismantleTarget] = 'D';
              dismantleTarget = -1;
              SFX('click');
              if (segs.every((s) => s === 'D')) {
                finish('pass', '最后一段门板抬上岸。天边刚泛白，河水里什么都没留下。');
              }
            }
          }
        }
        // 拂晓判定：夜到 100% 还没拆完 / 部队没过完
        if (night >= 100 && !over) {
          const left = segs.filter((s) => s !== 'D').length;
          finish('exposed', left > 0
            ? `天亮了。桥还有 ${left} 段在水里 —— 敌机的眼睛，比乡亲的门板先到。`
            : '天亮了。最后一段是顶着晨光拆完的，差点。');
        }
        if (night - nightPrev > 4) { /* 夜色跳变保护（暂停恢复时不误杀） */ }
        draw();
        sync();
        raf = requestAnimationFrame(frame);
      } else {
        draw();
      }
    }

    /* ══════════════ 画面 ══════════════ */
    function nightSky() {
      // 暮色(0) → 深夜(50) → 拂晓(100)
      const g = ctx;
      const dusk = [226, 178, 122]; const deep = [16, 24, 40]; const dawn = [214, 168, 140];
      const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
      const c1 = night < 50 ? mix(dusk, deep, night / 50) : mix(deep, dawn, (night - 50) / 50);
      const c2 = mix(c1, [255, 255, 255], 0.12);
      const grd = g.createLinearGradient(0, 0, 0, 110);
      grd.addColorStop(0, `rgb(${c2.join(',')})`);
      grd.addColorStop(1, `rgb(${c1.join(',')})`);
      return grd;
    }
    function draw() {
      const g = ctx;
      // 天
      g.fillStyle = nightSky(); g.fillRect(0, 0, W, 110);
      // 对岸剪影
      g.fillStyle = 'rgba(20,26,38,.6)';
      g.beginPath(); g.moveTo(0, 96); g.lineTo(80, 84); g.lineTo(190, 92); g.lineTo(320, 82);
      g.lineTo(W, 90); g.lineTo(W, 112); g.lineTo(0, 112); g.fill();
      // 河
      const riv = g.createLinearGradient(0, 108, 0, H);
      riv.addColorStop(0, '#2c4250'); riv.addColorStop(1, '#1a2b36');
      g.fillStyle = riv; g.fillRect(0, 108, W, H - 108);
      // 流水线
      g.strokeStyle = 'rgba(160,190,200,.22)'; g.lineWidth = 1;
      for (let i = 0; i < 9; i += 1) {
        const yy = 120 + i * 13;
        const off = Math.sin(t0 * 0.0008 + i * 2) * 16;
        g.beginPath(); g.moveTo(-12 + off, yy);
        g.bezierCurveTo(150 + off, yy - 3, 300 + off, yy + 3, W + 14 + off, yy);
        g.stroke();
      }
      const segW = (W - 76) / SEGS;
      // 桥段
      for (let i = 0; i < SEGS; i += 1) {
        const x = 38 + i * segW;
        const st = segs[i];
        if (st === 'D') { // 拆掉：只剩系船的绳头
          g.strokeStyle = 'rgba(150,140,120,.5)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x + 4, 112); g.lineTo(x + segW - 4, 112); g.stroke();
          continue;
        }
        if (st === '.') {
          // 未搭：虚线示意
          g.strokeStyle = 'rgba(200,210,215,.25)'; g.setLineDash([3, 5]); g.lineWidth = 1;
          g.beginPath(); g.moveTo(x + 2, 112); g.lineTo(x + segW - 2, 112); g.stroke(); g.setLineDash([]);
          continue;
        }
        // 板面
        g.fillStyle = st === 'P' ? '#7d6a4c' : '#93794f';
        g.fillRect(x + 1, 104, segW - 2, 6);
        // 加固的：两道横撑
        if (st === 'R') {
          g.fillStyle = '#b39767';
          g.fillRect(x + 3, 102, segW - 6, 3);
        }
        // 船：深棕船体在板下
        if (st === 'S' || st === 'W') {
          g.fillStyle = '#4c3b28';
          g.beginPath();
          g.moveTo(x + 4, 110);
          g.quadraticCurveTo(x + segW / 2, 122 + (st === 'W' ? Math.sin(t0 * 0.004 + i) * 3 : 1), x + segW - 4, 110);
          g.closePath(); g.fill();
          // 马灯
          if (lamp) {
            g.fillStyle = '#f0c26a';
            g.beginPath(); g.arc(x + segW / 2, 100, 2.2, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(240,194,106,.25)';
            g.beginPath(); g.arc(x + segW / 2, 100, 6, 0, Math.PI * 2); g.fill();
          }
        } else if (st === 'P' && !isShallow(i)) {
          // 板排（中流）：浮在水面，微微起伏
          g.fillStyle = 'rgba(125,106,76,.9)';
          g.beginPath();
          g.moveTo(x + 2, 112 + Math.sin(t0 * 0.003 + i) * 1.5);
          g.lineTo(x + segW - 2, 112 + Math.cos(t0 * 0.003 + i) * 1.5);
          g.lineTo(x + segW - 2, 118);
          g.lineTo(x + 2, 118);
          g.closePath(); g.fill();
        }
        // 报警的段：红圈闪
        if (alarmSeg === i) {
          g.strokeStyle = `rgba(200,60,40,${0.55 + Math.sin(t0 * 0.02) * 0.35})`;
          g.lineWidth = 2.4;
          g.beginPath(); g.arc(x + segW / 2, 108, segW / 2 + 3, 0, Math.PI * 2); g.stroke();
        }
      }
      // 两岸
      g.fillStyle = '#3d3629';
      g.fillRect(0, 104, 36, H - 104);
      g.fillRect(W - 36, 104, 36, H - 104);
      g.fillStyle = '#4a4233';
      g.fillRect(0, 100, 36, 6); g.fillRect(W - 36, 100, 36, 6);
      // 渡河中的队伍（进度映射到桥面上的小人）
      if (phase === 'cross' || phase === 'dismantle') {
        const px2 = 38 + cross * (W - 76) - 20;
        for (let i = 0; i < 5; i += 1) {
          const x = Math.max(6, px2 - i * 9);
          const y = 104 - (i % 2);
          g.fillStyle = i % 2 ? '#39424c' : '#2e363e';
          g.fillRect(x, y - 6, 3, 6);
          g.beginPath(); g.arc(x + 1.5, y - 8, 1.8, 0, Math.PI * 2); g.fill();
        }
      }
      // 夜色进度条（顶部）
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(10, 8, W - 20, 5);
      g.fillStyle = '#e8d9b0'; g.fillRect(10, 8, (W - 20) * night / 100, 5);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.strokeRect(10, 8, W - 20, 5);
      // 拂晓刻度线（危险线在 92%）
      g.strokeStyle = 'rgba(230,120,80,.9)';
      g.beginPath();
      g.moveTo(10 + (W - 20) * 0.92, 6); g.lineTo(10 + (W - 20) * 0.92, 15);
      g.stroke();
    }

    /* 自清 */
    const guard = setInterval(() => {
      if (container.isConnected) return;
      clearInterval(guard);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      if (!over) {
        over = true;
        resolve({ score: 0, detail: { outcome: 'none', why: 'detached' }, summary: '' });
      }
    }, 500);

    last = performance.now();
    raf = requestAnimationFrame(frame);
  });
}

/* ══════════════ 调试台规格 ══════════════ */
export const PONTOON_MINIGAMES = [
  {
    id: 'pontoon-night',
    title: '夜搭浮桥',
    family: '工程',
    act: 'act1 · 于都河（热点 bridge）',
    note: '旧版是"限时点门板 + 5 次金区落板"。这一版把史实整个装进来：'
      + '<b>船只有 5 条</b>（中流 8 段，剩下只能铺板排 —— 会晃、要加固）；下锚要掐稳流窗；'
      + '<b>船工那盏马灯</b>挂上对位窗口翻倍；门板是乡亲陆续送来的；'
      + '渡完必须<b>天亮前拆完</b>。失败线：断 2 次沉物资；拂晓没拆完 = 暴露。',
    states: ['rig', 'anchor', 'cross', 'dismantle', 'done'],
    actions: ['mode-boat', 'mode-plank', 'lamp', 'seg', 'anchor', 'reinforce'],
    noAi: true,
    noAiNote: '用户原话：浮桥把体验做好就行，API 无所谓。游戏内 0 次模型调用。',
    run: (host, o = {}) => runPontoonNight(host, o),
  },
];

export const CARDS = PONTOON_MINIGAMES;

/* ══════════════ 样式（前缀 smini11-）══════════════ */
{
  const css = `
.smini11-wrap { display:flex; flex-direction:column; gap:8px; align-items:center; }
.smini11-lead { margin:0; font-size:13px; line-height:1.75; color:#3f3524; max-width:600px; text-align:left; }
.smini11-lead .dim { color:#7a6c53; }
.smini11-lead b { color:#2c2416; }
.smini11-cv { background:#1a2b36; border-radius:4px; box-shadow:0 1px 0 rgba(255,255,255,.25) inset, 0 0 0 1px rgba(90,80,64,.28); }
.smini11-segs { display:flex; gap:3px; }
.smini11-seg { font:inherit; font-size:11px; padding:3px 0; width:34px; border-radius:3px; cursor:pointer;
  background:rgba(255,252,244,.75); border:1px solid rgba(120,100,70,.4); color:#2c2416; }
.smini11-seg.built { background:#93794f; color:#f7f0e0; border-color:#6b5433; }
.smini11-seg.built.wob { background:#b08a4e; }
.smini11-seg.R { background:#6d7d5c; }
.smini11-seg.gone { background:rgba(255,252,244,.4); color:#9b8f78; text-decoration:line-through; }
.smini11-seg.alarm { outline:2px solid #c23a2e; }
.smini11-seg:not([data-mini-action]) { cursor:default; }
.smini11-acts { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.smini11-btn { font:inherit; font-size:12.5px; padding:5px 12px; border-radius:3px; cursor:pointer;
  background:rgba(255,252,244,.9); border:1px solid rgba(120,100,70,.45); color:#2c2416; }
.smini11-btn:hover { background:#fffcf4; }
.smini11-btn.pri { background:#3f4a34; color:#f3ecdc; border-color:#2c3424; }
.smini11-btn[disabled] { opacity:.45; cursor:default; }
.smini11-fb { font-size:13px; line-height:1.7; color:#2c2416; min-height:22px; }
`;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}
