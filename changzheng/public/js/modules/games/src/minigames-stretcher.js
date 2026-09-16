/**
 * 《担架急送》（**重做版 · 单独开发，未接入主线**）
 *
 * ── 它取代的是什么 ──
 *   旧版（minigames-story.js 的 runStretcher，约 190 行）：前进/卧倒两个按钮 + 周期炮击，
 *   纸上画一条地平线、三个土包、两个箭头小人。机制其实有点意思（有代价、有失败），
 *   但**画面是示意图，而且只有"跑/趴"一件事**：担架上的伤员不会更糟，抬担架的人也不会累。
 *   用户对这类东西的判语：他问的是"这算游戏吗，还是点一下播个动画"。
 *
 * ── 史实锚点（2026-09-16 查证，出处见 docs/HANDOFF-STRETCHER.md）──
 *   湘江，1934 年 11 月 27 日–12 月 1 日。凤凰嘴是最后一个渡口：
 *     · 冬季枯水，指战员在刺骨的江水里涉行；敌机"**距离江面很近，不停扔弹，还打机关枪**"（蒋济勇回忆）；
 *     · 莫文骅（红八军团政治部宣传部长）记述："**最困难的事莫过于在飞机的扫射之下行军**"；
 *     · 干部休养连担架队女红军刘彩香：**夜里行军不能点火**，摸黑在前方探路，
 *       流弹擦过头顶烧焦了鬓角；一个人照看三四副担架，"**遇到窄沟坎路抬担架过不去，
 *       她就蹲下身，把伤员慢慢背过去**"；担架民夫大多失散负伤，担子压在少数人身上；
 *     · 姜齐贤在**担架上**给杨成武做了手术，一路给他洗伤口 —— 路越颠，伤员越快消耗。
 *   → 机制全从这几句来：夜里不能点火（所以画面只有远处火光与曳光）、
 *     敌机扫射必须把担架放低、"抬着走"颠得伤员失血加快、换肩（体力）、
 *     前头是最后一个渡口的灯火。
 *
 * ── 玩家的决策 ×3 ──
 *   ① **抬着走还是放低**：抬着走快三倍，但伤员**失血快三倍**，而且敌机扫射时躲不掉；
 *   ② **弹坑**：坑里抬着走能把人颠坏 —— 坑前放低是稳，抢时间就赌；
 *   ③ **什么时候换肩**：换肩要停 1 秒、白挨 1 秒，回 26 点体力 ——
 *      但**之后 5.5 秒按不动**（SWAP_CD，2026-09-16 前这个冷却漏了上膛，
 *      等于体力无限，决策③形同虚设，被 qa-stretcher 的 C5 拦下）；
 *      体力见底之后速度腰斩、失血翻倍，所以什么时候停下来换肩是笔账。
 *
 * ── 失败条件（两条）──
 *   · `died`  失血满 → 伤员没撑到江边（结算文案与史实一样克制：担架停下来的时候，天还没亮）。
 *   · `dawn`  时限内没到渡口 → 天亮，渡口封了。
 *
 * ── 接不接 AI：不接（用户原话：担架急送"跟浮桥一个道理"，体验优先）。游戏内 0 次模型调用。
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
    t = (t + Math.imul(t ^ (t >> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ══════════════ 常量（QA 共用）══════════════ */
export const W = 460;
export const H = 240;
export const TIME_TOTAL = 90;        // 局内 90 秒（天亮前必须到渡口）
export const SPEED_CARRY = 3.6;      // 抬着走（%/秒）
export const SPEED_DUCK = 1.15;      // 放低
export const SPEED_TIRED = 2.0;      // 体力见底、硬抬着走
export const BLEED_DUCK = 0.45;
export const BLEED_CARRY = 1.25;
export const BLEED_PIT_DUCK = 0.95;
export const BLEED_PIT_CARRY = 2.9;
export const STAM_MAX = 100;
export const STAM_DRAIN = 3.4;       // 抬着走每秒扣
export const STAM_RECOVER = 1.8;     // 放低每秒回
export const STAM_SWAP = 26;         // 换肩回一大截
export const SWAP_SEC = 1.0;         // 换肩要停这么久
export const SWAP_CD = 5.5;
export const PLANE_CYCLE = 7.4;      // 敌机周期（参考值；实际用下面两个随机）
export const PLANE_CYCLE_MIN = 4.2;  // 一次扫射过后，下次引擎声最快间隔
export const PLANE_CYCLE_RND = 2.2;  // 再随机加这么多
export const PLANE_WARN = 1.05;      // 引擎声预警
export const PLANE_SWEEP = 0.85;     // 掠过扫射
export const SWEEP_HIT = 13;         // 被扫到失血（贪着抬 = 4 次即 52%，必死）
export const PITS = [22, 41, 63, 82];// 弹坑位置（%）
export const PIT_HALF = 4.5;

/* ══════════════ 玩法本体 ══════════════ */

export function runStretcherNight(container, opts = {}) {
  return new Promise((resolve) => {
    const rnd = opts.rnd || mulberry32(opts.rndSeed || 19341201);
    const TT = opts.timeTotal || TIME_TOTAL;

    let phase = 'run';              // run → done
    let pos = 0;
    let carry = true;               // 抬着走（默认）
    let bleed = 0;
    let stam = STAM_MAX;
    let swapLeft = 0;
    let swapCd = 0;
    let plane = 'idle';             // idle → engine → sweep → idle
    let planeT = 0;
    let planeNext = 2.4 + rnd() * 1.6;
    let timeLeft = TT;
    let hits = 0;
    let swaps = 0;
    let outcome = null;
    let over = false;
    let raf = 0;
    let last = performance.now();
    let t0 = performance.now();
    let statsSig = '';              // ⚠️ 必须在首次 sync() 之前声明（TDZ）

    /* ── DOM ── */
    const root = h('div', { class: 'smini12-wrap' });
    mount(container, root);
    const lead = h('p', { class: 'smini12-lead' });
    const cv = h('canvas', { class: 'smini12-cv', width: W, height: H });
    const acts = h('div', { class: 'smini12-acts' });
    const fbEl = h('div', { class: 'smini12-fb' });
    root.append(lead, cv, acts, fbEl);

    const ctx = cv.getContext('2d');
    const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const inPit = () => PITS.some((p) => Math.abs(pos - p) <= PIT_HALF);
    container.dataset.mini = opts.id || 'stretcher-run';
    sync('run');

    function btn(label, action, cls) {
      const b = h('button', { type: 'button', class: `smini12-btn ${cls || ''}`, text: label });
      b.setAttribute('data-mini-action', action);
      return b;
    }
    function renderActs() {
      acts.innerHTML = '';
      lead.innerHTML = '夜里不能点火。<b>抬着走</b>快，但颠得伤员失血快，敌机扫射时也躲不掉；'
        + '<b>放低</b>稳，挨着地往前挪。前头是凤凰嘴渡口 —— 天亮前必须到。'
        + '<span class="dim">（A 抬着走 / S 放低 / E 换肩；敌机引擎声一起就放低）</span>';
      const b1 = btn('抬着走（快 · 颠）', 'carry', carry ? 'pri' : '');
      const b2 = btn('放低（稳 · 慢）', 'duck', carry ? '' : 'pri');
      const b3 = btn(`换肩（回体力，停 1 秒 · 之后缓 ${SWAP_CD}s）`, 'swap');
      b3.disabled = swapCd > 0 || swapLeft > 0;
      acts.append(b1, b2, b3);
    }
    renderActs();

    function sync(stateWord) {
      if (stateWord) container.dataset.miniState = stateWord;
      container.dataset.miniPhase = phase;
      container.dataset.miniPos = String(Math.round(pos * 10) / 10);
      container.dataset.miniBleed = String(Math.round(bleed));
      container.dataset.miniStam = String(Math.round(stam));
      container.dataset.miniCarry = carry ? '1' : '0';
      container.dataset.miniPlane = plane;
      container.dataset.miniPit = inPit() ? '1' : '0';
      container.dataset.miniHits = String(hits);
      container.dataset.miniLeft = String(Math.round(timeLeft));
      const rows = [
        ['推进', `${Math.round(pos)}%`],
        ['失血', `${Math.round(bleed)}%`],
        ['体力', `${Math.round(stam)}%`],
        ['敌机', { idle: '—', engine: '引擎声', sweep: '扫射中' }[plane] || '—'],
      ];
      const sig = JSON.stringify(rows);
      if (sig !== statsSig) { statsSig = sig; stats(opts.stats, rows); }
    }

    function setCarry(v) {
      if (phase !== 'run' || swapLeft > 0) return;
      carry = v;
      renderActs();
      SFX('click');
    }
    function doSwap() {
      if (phase !== 'run' || swapCd > 0 || swapLeft > 0) return;
      swapLeft = SWAP_SEC;
      /* ⚠️ 2026-09-16：原来漏了这一行 —— SWAP_CD 常量、swapCd 递减、按钮 disabled 绑定三处都在，
         唯独没人给它上膛。后果：硬直一过立刻又能换肩（+26 体力 / 1 秒），
         体力这个资源等于不存在，"什么时候换肩"这个决策也一起作废。
         真玩法 QA 的 C5 就是拦这个的：点完换肩，按钮必须真的灰住。 */
      swapCd = SWAP_CD;
      swaps += 1;
      /* 只改属性、不重建按钮：renderActs() 会把节点换掉，正在进行的这一次点击
         就有可能落到已经 detach 的旧节点上（Playwright 会重试到超时）。 */
      const b = acts.querySelector('[data-mini-action="swap"]');
      if (b) b.disabled = true;
      SFX('click');
    }

    function finish(res, why) {
      if (over) return;
      over = true;
      outcome = res;
      phase = 'done';
      acts.innerHTML = '';
      let score;
      if (res === 'pass') {
        score = Math.min(1, 0.6 + (timeLeft / TT) * 0.25 + Math.max(0, (60 - bleed) / 60) * 0.15 - hits * 0.02);
        SFX('correct');
      } else {
        score = res === 'died' ? 0.15 : 0.2;
        SFX('wrong');
      }
      fbEl.textContent = why;
      container.dataset.miniOutcome = res;
      sync('done');
      setTimeout(() => {
        resolve({
          score: Number(Math.max(0, score).toFixed(3)),
          detail: {
            outcome: res, bleed: Math.round(bleed), hits, swaps,
            usedSec: Number(((performance.now() - t0) / 1000).toFixed(1)),
          },
          summary: res === 'pass'
            ? `担架急送：${hits === 0 ? '一路没挨着' : `被扫中 ${hits} 次`}送到渡口，伤员失血 ${Math.round(bleed)}%`
            : res === 'died' ? '担架急送：伤员没撑到江边' : '担架急送：天亮了，渡口封了',
        });
      }, 800);
    }

    /* 输入 */
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-mini-action]');
      if (!a) return;
      const act = a.getAttribute('data-mini-action');
      if (act === 'carry') setCarry(true);
      else if (act === 'duck') setCarry(false);
      else if (act === 'swap') doSwap();
    });
    const onKey = (e) => {
      if (!container.isConnected) { window.removeEventListener('keydown', onKey); return; }
      if (e.type !== 'keydown' || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'a') setCarry(true);
      else if (k === 's') setCarry(false);
      else if (k === 'e') doSwap();
    };
    window.addEventListener('keydown', onKey);

    /* ── 主循环 ── */
    function frame(now) {
      if (!container.isConnected) { cancelAnimationFrame(raf); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!over) {
        timeLeft -= dt;
        // 冷却到点要重画一次按钮，否则它会一直灰着（disabled 只在渲染时写）
        if (swapCd > 0) { swapCd = Math.max(0, swapCd - dt); if (swapCd === 0) renderActs(); }
        const frozen = swapLeft > 0;
        if (frozen) {
          swapLeft -= dt;
          if (swapLeft <= 0) { stam = Math.min(STAM_MAX, stam + STAM_SWAP); renderActs(); }
        }
        // 体力
        if (!frozen) {
          if (carry) stam = Math.max(0, stam - STAM_DRAIN * dt);
          else stam = Math.min(STAM_MAX, stam + STAM_RECOVER * dt);
        }
        // 敌机
        if (plane === 'idle') {
          planeT += dt;
          if (planeT >= planeNext) { plane = 'engine'; planeT = 0; }
        } else if (plane === 'engine') {
          planeT += dt;
          if (planeT >= PLANE_WARN) { plane = 'sweep'; planeT = 0; SFX('thud'); }
        } else {
          planeT += dt;
          if (planeT >= PLANE_SWEEP) {
            // 结算这次扫射：抬着走就挨
            if (carry && !frozen) {
              hits += 1;
              bleed += SWEEP_HIT;
              pos = Math.max(0, pos - 2);
              SFX('wrong');
              fbEl.textContent = '曳光扫过来，担架抬得太高 —— 伤员闷哼了一声。';
            }
            plane = 'idle'; planeT = 0; planeNext = PLANE_CYCLE_MIN + rnd() * PLANE_CYCLE_RND;
          }
        }
        // 前进
        if (!frozen) {
          const tired = stam <= 1;
          const sp = carry ? (tired ? SPEED_TIRED : SPEED_CARRY) : SPEED_DUCK;
          pos = Math.min(100, pos + sp * dt);
        }
        // 失血
        let rate = 0;
        if (inPit()) rate = carry ? BLEED_PIT_CARRY : BLEED_PIT_DUCK;
        else rate = carry ? BLEED_CARRY : BLEED_DUCK;
        if (stam <= 1 && carry) rate *= 1.4;      // 抬不动了还硬抬 → 晃得厉害
        if (frozen) rate = 0.6;                    // 放下的那一下反而稳一点
        bleed += rate * dt;

        if (bleed >= 100) finish('died', '担架停在一块弹坑边上。卫生员摸了半天脉，没抬头。天亮之前，谁也没能把他送到江边。');
        else if (timeLeft <= 0) finish('dawn', '天边泛白的时候，你们才看见渡口 —— 浮桥已经撤了，江面上只有雾。');
        else if (pos >= 100) finish('pass', '江风带着水汽吹过来。凤凰嘴的船还在，担架抬上去了。');

        draw();
        sync();
        raf = requestAnimationFrame(frame);
      } else draw();
    }

    /* ══════════════ 画面 ══════════════ */
    const PAL = {
      skyTop: '#141a24', skyLow: '#2a2320', glow: '#c2542e',
      ground: '#2b2620', groundHi: '#3a342b', pit: '#17140f',
      stretcher: '#6b5236', hurt: '#4a4038', you: '#2f3a42', mate: '#3a4650',
      tracer: '#e8b46a', warn: '#d8563c', lamp: '#e8c07a',
    };
    const GROUND = 168;
    function draw() {
      const g = ctx;
      // 夜天 + 远处火光（湘江边烧着的辎重）
      const sky = g.createLinearGradient(0, 0, 0, GROUND);
      sky.addColorStop(0, PAL.skyTop); sky.addColorStop(1, PAL.skyLow);
      g.fillStyle = sky; g.fillRect(0, 0, W, GROUND);
      const glow = g.createRadialGradient(W - 60, GROUND - 6, 4, W - 60, GROUND - 6, 150);
      glow.addColorStop(0, 'rgba(194,84,46,.55)'); glow.addColorStop(1, 'rgba(194,84,46,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, GROUND);
      // 地
      g.fillStyle = PAL.ground; g.fillRect(0, GROUND, W, H - GROUND);
      // 弹坑
      for (const p of PITS) {
        const x = 12 + (p / 100) * (W - 40);
        g.fillStyle = PAL.pit;
        g.beginPath(); g.ellipse(x, GROUND + 6, 15, 6, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = PAL.groundHi; g.lineWidth = 1;
        g.beginPath(); g.ellipse(x, GROUND + 4, 15, 6, 0, 0, Math.PI * 2); g.stroke();
      }
      // 渡口灯火（右端，是唯一"目标"的视觉）
      const goalX = W - 18;
      g.fillStyle = 'rgba(232,192,122,.25)';
      g.beginPath(); g.arc(goalX, GROUND - 10, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = PAL.lamp;
      g.beginPath(); g.arc(goalX, GROUND - 10, 3, 0, Math.PI * 2); g.fill();
      // 曳光（敌机扫射）
      if (plane === 'sweep') {
        g.strokeStyle = PAL.tracer; g.lineWidth = 1.6;
        for (let i = 0; i < 6; i += 1) {
          const y = 20 + i * 22 + Math.sin(t0 * 0.01 + i) * 3;
          g.globalAlpha = 0.75;
          g.beginPath(); g.moveTo(0, y + 10); g.lineTo(W, y); g.stroke();
        }
        g.globalAlpha = 1;
      }
      // 敌机剪影
      if (plane !== 'idle') {
        const px2 = plane === 'engine' ? W - 20 - planeT * 40 : W - 90 + planeT * 60;
        g.fillStyle = '#0e1218';
        g.beginPath();
        g.moveTo(px2, 26); g.lineTo(px2 + 18, 30); g.lineTo(px2, 34); g.lineTo(px2 - 18, 30);
        g.closePath(); g.fill();
        if (plane === 'engine') {
          g.fillStyle = PAL.warn;
          g.font = '11px "Microsoft YaHei", sans-serif';
          g.fillText('引擎声', 12, 20);
        }
      }
      // 担架 + 两个人（抬着/放低两种高度）
      const px3 = 12 + (pos / 100) * (W - 40);
      const lift = carry ? (stam <= 1 ? 16 : 22) : 9;
      const y = GROUND - lift;
      // 担架杆
      g.strokeStyle = PAL.stretcher; g.lineWidth = 3;
      g.beginPath(); g.moveTo(px3 - 26, y); g.lineTo(px3 + 26, y); g.stroke();
      // 伤员（盖着的）
      g.fillStyle = PAL.hurt;
      g.fillRect(px3 - 18, y - 7, 36, 7);
      g.beginPath(); g.arc(px3 + 19, y - 4, 3.4, 0, Math.PI * 2); g.fill();
      // 前后两人
      for (const dx of [-24, 24]) {
        g.fillStyle = dx < 0 ? PAL.you : PAL.mate;
        g.fillRect(px3 + dx, y - 15, 5, 19);
        g.beginPath(); g.arc(px3 + dx + 2.5, y - 18, 3.6, 0, Math.PI * 2); g.fill();
      }
      // 体力见底：脚下拖影
      if (stam <= 1 && carry) {
        g.strokeStyle = 'rgba(200,200,200,.25)'; g.lineWidth = 1;
        for (let i = 0; i < 4; i += 1) {
          g.beginPath();
          g.moveTo(px3 - 30 - i * 7, GROUND + 12);
          g.lineTo(px3 - 34 - i * 7, GROUND + 15);
          g.stroke();
        }
      }
      // 失血条（担架上方的小条 = 伤员）
      const bw = 46;
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(px3 - bw / 2, y - 22, bw, 4);
      g.fillStyle = bleed > 70 ? '#c23a2e' : '#a8863f';
      g.fillRect(px3 - bw / 2, y - 22, (bw * Math.min(1, bleed / 100)), 4);
      // 夜色进度（顶部）
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(10, 8, W - 20, 5);
      g.fillStyle = PAL.lamp; g.fillRect(10, 8, (W - 20) * (1 - timeLeft / TT), 5);
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1; g.strokeRect(10, 8, W - 20, 5);
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
export const STRETCHER_MINIGAMES = [
  {
    id: 'stretcher-run',
    title: '担架急送',
    family: '救护',
    act: 'act2 · 湘江（热点 stretcher）',
    note: '旧版是"前进/卧倒 + 周期炮击"的纸上示意图。这一版：<b>抬着走快三倍、伤员失血快三倍</b>；'
      + '敌机引擎声一起必须<b>放低</b>（史实：夜里不能点火，只能摸黑听声）；<b>弹坑</b>里抬着走能把人颠坏；'
      + '<b>换肩</b>要停 1 秒但体力见底后速度腰斩、失血翻倍。'
      + '失败线：伤员失血满（没撑到江边）／天亮才到渡口（渡口封了）。',
    states: ['run', 'done'],
    actions: ['carry', 'duck', 'swap'],
    noAi: true,
    noAiNote: '用户原话：担架急送跟浮桥一个道理，体验优先。游戏内 0 次模型调用。',
    run: (host, o = {}) => runStretcherNight(host, o),
  },
];

export const CARDS = STRETCHER_MINIGAMES;

/* ══════════════ 样式（前缀 smini12-）══════════════ */
{
  const css = `
.smini12-wrap { display:flex; flex-direction:column; gap:9px; align-items:center; }
.smini12-lead { margin:0; font-size:13px; line-height:1.75; color:#3f3524; max-width:600px; text-align:left; }
.smini12-lead .dim { color:#7a6c53; }
.smini12-lead b { color:#2c2416; }
.smini12-cv { background:#141a24; border-radius:4px; box-shadow:0 1px 0 rgba(255,255,255,.2) inset, 0 0 0 1px rgba(90,80,64,.28); }
.smini12-acts { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.smini12-btn { font:inherit; font-size:12.5px; padding:5px 12px; border-radius:3px; cursor:pointer;
  background:rgba(255,252,244,.9); border:1px solid rgba(120,100,70,.45); color:#2c2416; }
.smini12-btn:hover { background:#fffcf4; }
.smini12-btn.pri { background:#3f4a34; color:#f3ecdc; border-color:#2c3424; }
.smini12-btn[disabled] { opacity:.45; cursor:default; }
.smini12-fb { font-size:13px; line-height:1.7; color:#2c2416; min-height:22px; }
`;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}
