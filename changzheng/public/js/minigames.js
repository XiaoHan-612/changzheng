/**
 * 小游戏：钓鱼/识字/分糖/夜岗/五子棋/弯针/泸定桥
 * 规则：本地只做手感判定，结算一律交 /api/decide。
 * 统一返回 { score: 0..1, detail: {...}, summary?: string }
 */
import { audio } from './audio.js';

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

function mount(parent, root) {
  if (parent) {
    parent.innerHTML = '';
    parent.appendChild(root);
  }
  return root;
}

/**
 * 钓鱼：漂相三档，空格/点击起竿
 * @returns {Promise<{score:number, detail:object}>}
 */
export function runFishing(container) {
  return new Promise((resolve) => {
    const W = 420;
    const H = 240;
    container.innerHTML = `
      <p class="hint">漂相三档：<b>晃</b>=假口 · <b>沉</b>=真口 · <b>黑漂</b>=大物。看到真口/黑漂时按【空格】或点「起竿」。共 3 竿。</p>
      <canvas class="mini" id="fish-canvas" width="${W}" height="${H}"></canvas>
      <div style="text-align:center;margin-bottom:8px">
        <span id="fish-status" class="muted">点「抛竿」开始</span>
      </div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button type="button" class="btn primary" id="fish-cast" data-mini-action="cast">抛竿</button>
        <button type="button" class="btn" id="fish-hook" data-mini-action="hook" disabled>起竿 (空格)</button>
      </div>
    `;
    const canvas = container.querySelector('#fish-canvas');
    const ctx = canvas.getContext('2d');
    const status = container.querySelector('#fish-status');
    const btnCast = container.querySelector('#fish-cast');
    const btnHook = container.querySelector('#fish-hook');
    container.dataset.miniState = 'idle';

    const TOTAL = 3;
    let castIndex = 0;
    let hits = [];
    let phase = 'idle';
    let floatY = 120;
    let floatTarget = 120;
    let biteType = null;
    let biteStart = 0;
    let windowMs = 0;
    let raf = 0;
    let wave = 0;
    let resolved = false;

    function draw() {
      wave += 0.04;
      floatY += (floatTarget - floatY) * 0.12;
      if (phase === 'window' && biteType === 'shake') {
        floatTarget = 120 + Math.sin(performance.now() / 60) * 6;
      }

      ctx.clearRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 80, 0, H);
      g.addColorStop(0, '#1e3a44');
      g.addColorStop(1, '#152820');
      ctx.fillStyle = g;
      ctx.fillRect(0, 80, W, H - 80);
      ctx.strokeStyle = 'rgba(200,220,210,0.08)';
      for (let i = 0; i < 5; i++) {
        const y = 100 + i * 28;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) {
          const yy = y + Math.sin(x * 0.03 + wave + i) * 2;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#2a2418';
      ctx.fillRect(0, 70, W, 14);
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, 60);
      ctx.lineTo(180, 40);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(232,220,200,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(180, 40);
      ctx.lineTo(260, floatY);
      ctx.stroke();
      ctx.fillStyle = biteType === 'black' && phase === 'window' ? '#e07a5f' : '#e8dcc8';
      ctx.beginPath();
      ctx.arc(260, floatY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8b2e2e';
      ctx.fillRect(257, floatY - 14, 6, 10);

      if (phase === 'done') {
        ctx.fillStyle = 'rgba(10,12,14,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#c4a35a';
        ctx.font = '16px serif';
        ctx.textAlign = 'center';
        ctx.fillText('三竿结束', W / 2, H / 2);
      }
      raf = requestAnimationFrame(draw);
    }

    function resetFloat() {
      floatY = 120;
      floatTarget = 120;
      biteType = null;
      phase = 'idle';
      btnHook.disabled = true;
      btnCast.disabled = castIndex >= TOTAL;
      container.dataset.miniState = castIndex >= TOTAL ? 'done' : 'idle';
      status.textContent = castIndex >= TOTAL ? '三竿结束' : `第 ${castIndex + 1}/${TOTAL} 竿 — 点「抛竿」`;
    }

    function scheduleBite() {
      const delay = 1000 + Math.random() * 1600;
      setTimeout(() => {
        if (phase !== 'waiting' || resolved) return;
        const r = Math.random();
        biteType = r < 0.35 ? 'shake' : r < 0.8 ? 'sink' : 'black';
        biteStart = performance.now();
        if (biteType === 'shake') {
          windowMs = 900;
          floatTarget = 128;
          status.textContent = '漂在晃——像是小鱼闹窝';
          phase = 'window';
        } else if (biteType === 'sink') {
          windowMs = 1300;
          floatTarget = 150;
          status.textContent = '漂缓缓下沉——真口！起竿！';
          phase = 'window';
        } else {
          windowMs = 800;
          floatTarget = 175;
          status.textContent = '黑漂！急沉！快起竿！';
          phase = 'window';
        }
        btnHook.disabled = false;
        container.dataset.miniState = 'window';
        setTimeout(() => {
          if (phase === 'window' && !resolved) {
            hits.push({ type: biteType, result: 'miss', score: 0.1 });
            status.textContent = '错过了…';
            resetFloat();
            afterCast();
          }
        }, windowMs + 100);
      }, delay);
    }

    function finishResolve() {
      if (resolved) return;
      resolved = true;
      phase = 'done';
      container.dataset.miniState = 'done';
      btnCast.disabled = true;
      btnHook.disabled = true;
      const best = hits.reduce((m, h) => Math.max(m, h.score), 0);
      const avg = hits.length ? hits.reduce((s, h) => s + h.score, 0) / hits.length : 0;
      const score = Math.min(1, Math.max(best, avg * 0.7));
      cancelAnimationFrame(raf);
      resolve({ score, detail: { casts: hits, best } });
    }

    function afterCast() {
      castIndex += 1;
      if (castIndex >= TOTAL) {
        status.textContent = '起竿结束，结算中…';
        setTimeout(finishResolve, 400);
        return;
      }
      status.textContent = `第 ${castIndex + 1}/${TOTAL} 竿 — 点「抛竿」`;
    }

    function hook() {
      if (phase !== 'window' || resolved) return;
      audio.playSfx('hook');
      const elapsed = performance.now() - biteStart;
      phase = 'hooked';
      btnHook.disabled = true;
      let score = 0.2;
      let msg = '';
      if (biteType === 'shake') {
        score = 0.15;
        msg = '空竿——是晃，不是口。';
      } else if (biteType === 'sink') {
        if (elapsed < windowMs * 0.35) {
          score = 0.55;
          msg = '起早了，小鱼脱钩。';
        } else if (elapsed > windowMs * 0.85) {
          score = 0.5;
          msg = '稍晚，鱼吐钩了。';
        } else {
          score = 0.92;
          msg = '正口！一条鲫鱼出水！';
        }
      } else if (biteType === 'black') {
        if (elapsed < 180) {
          score = 0.6;
          msg = '太急，竿空了。';
        } else if (elapsed > windowMs * 0.8) {
          score = 0.55;
          msg = '大物跑了。';
        } else {
          score = 1;
          msg = '漂亮！大黑漂正口！';
        }
      }
      hits.push({ type: biteType, result: msg, score, elapsed: Math.round(elapsed) });
      status.textContent = msg;
      resetFloat();
      afterCast();
    }

    btnCast.addEventListener('click', () => {
      if (phase !== 'idle' || castIndex >= TOTAL || resolved) return;
      audio.playSfx('cast');
      phase = 'waiting';
      btnCast.disabled = true;
      status.textContent = '抛竿…盯住漂';
      floatTarget = 122;
      scheduleBite();
    });
    btnHook.addEventListener('click', hook);
    const onKey = (e) => {
      if (!document.body.contains(container)) { window.removeEventListener('keydown', onKey); return; }
      if (e.code === 'Space') {
        e.preventDefault();
        hook();
      }
    };
    window.addEventListener('keydown', onKey);
    const _cleanup = () => window.removeEventListener('keydown', onKey);
    const origResolve = resolve;
    resolve = (v) => {
      _cleanup();
      origResolve(v);
    };

    draw();
  });
}

/** 夜校识字：3 小关 */
export function runNightSchool(container) {
  return new Promise((resolve) => {
    const rounds = [
      {
        q: '看这个字：「志」——它表示什么？',
        opts: ['志向、意志', '只是语气词', '地名', '数量单位'],
        a: 0,
        tip: '沙地上用树枝描红。',
      },
      {
        q: '「同志」指的是——',
        opts: ['志同道合的人', '只指军官', '老乡', '陌生人'],
        a: 0,
        tip: '同志，因共同志向走到一起。',
      },
      {
        q: '今晚口令是出发的地方。请选出：',
        opts: ['瑞金', '南昌', '长沙', '遵义'],
        a: 0,
        tip: '把口令拼进心里——夜岗会用到。',
      },
    ];
    let idx = 0;
    let correct = 0;

    function render() {
      if (idx >= rounds.length) {
        const score = correct / rounds.length;
        container.innerHTML = `
          <div class="float-result">
            <div class="big">${correct} / ${rounds.length}</div>
            <div class="score">口令「瑞金」已写入营地记忆</div>
          </div>`;
        resolve({ score, detail: { correct, total: rounds.length, password: '瑞金' } });
        return;
      }
      const r = rounds[idx];
      container.innerHTML = `
        <p class="hint">夜校 · 第 ${idx + 1}/${rounds.length} 关 · ${r.tip}</p>
        <p style="font-family:var(--font);font-size:17px;margin:12px 0 16px">${r.q}</p>
        <div class="choices" id="school-opts"></div>`;
      const box = container.querySelector('#school-opts');
      r.opts.forEach((t, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn choice';
        // 契约：此前这一屏没有任何 data-* 标记，自动化只能干等（交接文档里记的债）
        b.dataset.miniAction = 'answer';
        b.innerHTML = `<b>${String.fromCharCode(65 + i)}. ${t}</b>`;
        b.onclick = () => {
          if (i === r.a) correct += 1;
          idx += 1;
          render();
        };
        box.appendChild(b);
      });
    }
    render();
  });
}

/**
 * 红小鬼 · 分糖（移植自原型 runCandy）
 * 点一颗糖 → 点一个人给出；也能「自己收好」。
 */
export function runCandy(container) {
  return new Promise((resolve) => {
    const root = h('div');
    mount(container, root);
    root.appendChild(h('div', { class: 'mg-title', text: '分糖' }));
    root.appendChild(h('div', {
      class: 'mg-hint',
      text: '三颗糖。点一颗糖，再点一个人给出；也可以「自己收好」。',
    }));

    const targets = [
      { id: 'shangyuan', name: '伤员', desc: '腿伤化脓，两天没正经吃东西' },
      { id: 'xinbing', name: '倔强的新兵', desc: '说「谁稀罕」，却一直看你口袋' },
      { id: 'xiaohaoshou', name: '小号手', desc: '十六岁，夜里偷偷抹眼睛' },
    ];
    const given = { shangyuan: 0, xinbing: 0, xiaohaoshou: 0, self: 0 };
    let left = 3;
    let pickIdx = null;

    const tray = h('div', { class: 'candy-tray' });
    const candies = [];
    for (let i = 0; i < 3; i++) {
      const c = h('div', { class: 'candy', text: '糖', role: 'button', tabindex: '0' });
      c.dataset.miniAction = 'candy';
      c.dataset.idx = String(i);
      const pick = () => {
        if (c.classList.contains('used')) return;
        candies.forEach((x) => (x.style.outline = ''));
        pickIdx = Number(c.dataset.idx);
        c.style.outline = '2px solid var(--gold)';
        audio.playSfx('click');
      };
      c.addEventListener('click', pick);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      candies.push(c);
      tray.appendChild(c);
    }

    const row = h('div', { class: 'target-row' });
    const cards = {};
    for (const t of targets) {
      const card = h('div', { class: 'target-card', role: 'button', tabindex: '0' });
      card.dataset.miniAction = 'target';
      card.appendChild(h('div', { class: 't-name', text: t.name }));
      card.appendChild(h('div', { class: 't-desc', text: t.desc }));
      const cnt = h('div', { class: 't-count', text: '0 颗' });
      card.appendChild(cnt);
      cards[t.id] = { el: card, cnt };
      const give = () => {
        if (pickIdx == null) return;
        const candy = candies[pickIdx];
        if (!candy || candy.classList.contains('used')) return;
        candy.classList.add('used');
        candy.style.outline = '';
        candy.setAttribute('aria-disabled', 'true');
        delete candy.dataset.miniAction;   // 契约要如实反映"这颗糖已经给出去了"
        given[t.id] += 1;
        left -= 1;
        cards[t.id].cnt.textContent = `${given[t.id]} 颗`;
        leftLabel.textContent = `还剩 ${left} 颗`;
        pickIdx = null;
        confirmBtn.disabled = false;
        audio.playSfx('click');
      };
      card.addEventListener('click', give);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); give(); } });
      row.appendChild(card);
    }

    const selfBtn = h('button', { class: 'btn ghost', type: 'button', text: '自己收好（不给）' });
    selfBtn.dataset.miniAction = 'self';
    const confirmBtn = h('button', { class: 'btn primary', type: 'button', text: '就这样' });
    confirmBtn.dataset.miniAction = 'confirm';
    confirmBtn.disabled = true;
    const leftLabel = h('div', { class: 'score-line', text: '还剩 3 颗' });

    root.appendChild(tray);
    root.appendChild(row);
    root.appendChild(h('div', { class: 'mg-row' }, [selfBtn, confirmBtn]));
    root.appendChild(leftLabel);

    selfBtn.onclick = () => {
      if (left > 0) {
        given.self += left;
        left = 0;
        candies.forEach((c) => c.classList.add('used'));
        candies.forEach((c) => { c.setAttribute('aria-disabled', 'true'); delete c.dataset.miniAction; });
        leftLabel.textContent = '你把剩下的糖收回兜里';
        confirmBtn.disabled = false;
        selfBtn.disabled = true;
      }
    };

    confirmBtn.onclick = () => {
      const parts = [];
      for (const t of targets) if (given[t.id]) parts.push(`${t.name}×${given[t.id]}`);
      if (given.self) parts.push(`自留×${given.self}`);
      resolve({
        score: given.self === 0 ? 0.9 : given.self >= 2 ? 0.35 : 0.6,
        detail: { ...given },
        summary: `分糖：${parts.join('，') || '一颗没给'}`,
      });
    };
  });
}

/**
 * 哨兵 · 夜岗（移植自原型 runSentry）
 * 5 个信号，判断后处置；若在夜校学过口令，这里会用上。
 * @param {string} knownPassword 今晚口令（可空）
 */
export function runSentry(knownPassword, container) {
  return new Promise((resolve) => {
    const root = h('div');
    mount(container, root);
    root.appendChild(h('div', { class: 'mg-title', text: '夜岗' }));
    root.appendChild(h('div', {
      class: 'mg-hint',
      text: '五个信号。判断后选择处置。若在夜校学过口令，这里会用到。',
    }));

    const box = h('div', { class: 'sentry-box' });
    const sig = h('div', { class: 'sentry-signal' });
    box.appendChild(sig);
    root.appendChild(box);

    const row = h('div', { class: 'mg-row' });
    const btnA = h('button', { class: 'choice-btn', type: 'button' });
    const btnB = h('button', { class: 'choice-btn', type: 'button' });
    const btnC = h('button', { class: 'choice-btn', type: 'button' });
    [btnA, btnB, btnC].forEach((b) => { b.dataset.miniAction = 'answer'; });
    row.append(btnA, btnB, btnC);
    root.appendChild(row);
    const prog = h('div', { class: 'score-line', text: '信号 1 / 5' });
    root.appendChild(prog);

    const events = [
      {
        type: '脚步',
        main: '左前方，远，慢——两点，间歇。',
        options: ['自己人巡逻', '可疑，低姿观察', '不理会'],
        correct: 1,
      },
      {
        type: '口令',
        main: knownPassword
          ? `黑影低喝：「口令？」今晚口令：${knownPassword}`
          : '黑影低喝：「口令？」你脑子一空。',
        options: knownPassword
          ? [knownPassword, '记不清，端枪', '喊「谁」']
          : ['硬编一个', '端枪不答，等对方先说', '大声喊人'],
        correct: knownPassword ? 0 : 1,
      },
      {
        type: '光点',
        main: '右侧树线外，一点暗红，明灭两次。',
        options: ['烟头，自己人', '可疑信号，准备', '星光错觉'],
        correct: 1,
      },
      {
        type: '兽',
        main: '低吼，草丛窸窣，渐远。',
        options: ['开枪', '不理会，继续观察', '叫醒全班'],
        correct: 1,
      },
      {
        type: '静默',
        main: '很长一段时间，什么都没有。',
        options: ['换位置走动', '原地不动，扫视', '打个盹'],
        correct: 1,
      },
    ];

    let idx = 0;
    let hits = 0;
    const log = [];

    function showEvent() {
      if (idx >= events.length) {
        resolve({
          score: hits / events.length,
          detail: { hits, total: events.length, signals: log, passwordUsed: !!knownPassword },
          summary: `夜岗 ${hits}/${events.length} 处置得当`,
        });
        return;
      }
      const ev = events[idx];
      prog.textContent = `信号 ${idx + 1} / ${events.length}`;
      sig.innerHTML = '';
      sig.appendChild(h('div', { class: 'sig-type', text: ev.type }));
      sig.appendChild(h('div', { class: 'sig-main', text: ev.main }));
      sig.appendChild(h('div', { class: 'dir-arrows', text: idx % 2 === 0 ? '←  ·  →' : '·  ↑  ·' }));

      const opts = [btnA, btnB, btnC];
      ev.options.forEach((label, i) => {
        opts[i].textContent = label;
        opts[i].onclick = () => {
          const ok = i === ev.correct;
          if (ok) hits += 1;
          log.push({ type: ev.type, choice: label, ok });
          audio.playSfx(ok ? 'correct' : 'wrong');
          idx += 1;
          showEvent();
        };
      });
    }

    showEvent();
  });
}

/** 弯针成钩（钓鱼线铺垫，无 AI 调用） */
export function runBendNeedle(container) {
  return new Promise((resolve) => {
    const root = h('div');
    mount(container, root);
    root.appendChild(h('div', { class: 'mg-title', text: '弯针成钩' }));
    root.appendChild(h('div', { class: 'mg-hint', text: '缝衣针在火上烤过，沿三点弯出钩形。' }));
    const label = h('div', { class: 'mg-hint', text: '1. 针眼端固定' });
    const bar = h('div', { class: 'score-line', text: '进度 □□□' });
    const btn = h('button', { class: 'btn primary', type: 'button', text: '弯折 1/3' });
    btn.dataset.miniAction = 'bend';
    root.append(label, btn, bar);
    let i = 0;
    const steps = ['1. 针眼端固定', '2. 中段支点', '3. 弯出钩尖'];
    btn.onclick = () => {
      i += 1;
      audio.playSfx('hook');
      bar.textContent = '进度 ' + '■'.repeat(i) + '□'.repeat(3 - i);
      if (i >= 3) {
        btn.disabled = true;
        label.textContent = '钩弯好了。很硬，能用。';
        setTimeout(() => resolve({ score: 1, detail: { steps: 3 }, summary: '弯针成钩' }), 400);
      } else {
        label.textContent = steps[i];
        btn.textContent = `弯折 ${i + 1}/3`;
      }
    };
  });
}

/** 泥地石子五子棋（9×9，简易对手） */
export function runGomoku(container) {
  return new Promise((resolve) => {
    const N = 9;
    const board = Array.from({ length: N }, () => Array(N).fill(0)); // 0 空 1 你 2 小鬼
    let turn = 1;
    let over = false;
    let moves = 0;

    const root = h('div');
    mount(container, root);
    root.appendChild(h('div', { class: 'mg-title', text: '泥地五子棋' }));
    root.appendChild(h('div', {
      class: 'mg-hint',
      text: '你执深色石子，小鬼执浅色。连成五子为胜。平局也算你们打了个平手。',
    }));
    const status = h('div', { class: 'score-line', text: '你先手' });
    const grid = h('div', { class: 'wzq-grid' });
    root.appendChild(status);
    root.appendChild(grid);
    container.dataset.miniState = 'player'; // 你先手

    const cells = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const c = h('button', { class: 'wzq-cell', type: 'button' });
        c.dataset.miniAction = 'cell';
        c.dataset.x = String(x);
        c.dataset.y = String(y);
        c.onclick = () => play(x, y, 1);
        grid.appendChild(c);
        cells.push(c);
      }
    }

    const idx = (x, y) => y * N + x;

    function setStone(x, y, who) {
      board[y][x] = who;
      const c = cells[idx(x, y)];
      c.classList.add(who === 1 ? 'p1' : 'p2');
      c.disabled = true;
      moves += 1;
    }

    function checkWin(x, y, who) {
      const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
      for (const [dx, dy] of dirs) {
        let n = 1;
        for (const s of [1, -1]) {
          let i = 1;
          for (;;) {
            const nx = x + dx * i * s;
            const ny = y + dy * i * s;
            if (nx < 0 || ny < 0 || nx >= N || ny >= N || board[ny][nx] !== who) break;
            n += 1;
            i += 1;
          }
        }
        if (n >= 5) return true;
      }
      return false;
    }

    function finish(result, note) {
      over = true;
      status.textContent = note;
      container.dataset.miniState = 'done';
      audio.playSfx(result === 'win' ? 'correct' : result === 'draw' ? 'echo' : 'wrong');
      const score = result === 'win' ? 1 : result === 'draw' ? 0.55 : 0.25;
      setTimeout(() => {
        resolve({ score, detail: { result, moves }, summary: `五子棋：${note}` });
      }, 700);
    }

    function play(x, y, who) {
      if (over || turn !== who || board[y][x] !== 0) return;
      setStone(x, y, who);
      if (checkWin(x, y, who)) {
        finish(who === 1 ? 'win' : 'lose', who === 1 ? '你连成了五子' : '小鬼连成了五子');
        return;
      }
      if (moves >= N * N) {
        finish('draw', '平局');
        return;
      }
      turn = 2;
      status.textContent = '小鬼在想…';
      container.dataset.miniState = 'ai';
      setTimeout(kidMove, 380 + Math.random() * 400);
    }

    function kidMove() {
      if (over) return;
      // 简易棋力：优先成五、其次封堵，再者为邻近空位
      let best = null;
      let bestScore = -1;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (board[y][x] !== 0) continue;
          let s = Math.random() * 0.3;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny < 0 || nx < 0 || ny >= N || nx >= N) continue;
              if (board[ny][nx] === 1) s += 0.8;
              if (board[ny][nx] === 2) s += 1.2;
            }
          }
          board[y][x] = 2;
          if (checkWin(x, y, 2)) s += 100;
          board[y][x] = 1;
          if (checkWin(x, y, 1)) s += 80;
          board[y][x] = 0;
          if (s > bestScore) {
            bestScore = s;
            best = { x, y };
          }
        }
      }
      if (!best) {
        finish('draw', '平局');
        return;
      }
      setStone(best.x, best.y, 2);
      if (checkWin(best.x, best.y, 2)) {
        finish('lose', '小鬼连成了五子');
        return;
      }
      if (moves >= N * N) {
        finish('draw', '平局');
        return;
      }
      turn = 1;
      status.textContent = '轮到你了';
      container.dataset.miniState = 'player';
    }
  });
}

/**
 * 飞夺泸定桥：横版过桥（A/D 或 ←/→ 移动，空格跳缺口）
 * 45s 限时；第一次跌落由战友拉住（体力 −10），第二次跌落走"付出代价仍过桥"。
 * 返回 { score, detail:{ cleared, falls, hits, zeroFalls } }
 */
export function runLuding(container) {
  return new Promise((resolve) => {
    const W = 460;
    const H = 220;
    const GROUND = 150;
    const GOAL = 420;
    const TIME_LIMIT = 45;

    container.innerHTML = `
      <p class="hint">A / D 或 ← → 移动，空格跳过缺口。对岸火力会扫过桥面——被扫中要低头硬扛。45 秒内过桥。</p>
      <canvas class="mini" id="luding-canvas" width="${W}" height="${H}"></canvas>
      <div class="luding-hud">
        <span id="luding-status" class="muted">按 A / D 开始</span>
        <span class="muted" id="luding-time">45.0s</span>
      </div>
      <div class="luding-pad">
        <button type="button" class="btn sm" id="luding-left">←</button>
        <button type="button" class="btn sm" id="luding-jump">跳</button>
        <button type="button" class="btn sm" id="luding-right">→</button>
      </div>`;

    const canvas = container.querySelector('#luding-canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = container.querySelector('#luding-status');
    const timeEl = container.querySelector('#luding-time');

    const gaps = [
      { x: 120, w: 34 },
      { x: 214, w: 38 },
      { x: 318, w: 34 },
    ];
    const fires = [
      { x: 180, w: 40, period: 2.2, dur: 0.6, offset: 0 },
      { x: 366, w: 36, period: 1.8, dur: 0.5, offset: 0.9 },
    ];

    let px = 24;
    let py = GROUND;
    let vy = 0;
    let onGround = true;
    let dead = false;
    let over = false;
    let falls = 0;
    let hits = 0;
    let hitCooldown = 0;
    let t0 = performance.now();
    let elapsed = 0;
    let raf = 0;
    let resolved = false;
    const keys = new Set();
    let last = performance.now();

    function inGap(x) {
      return gaps.some((g) => x > g.x && x < g.x + g.w);
    }

    function fireHot(now) {
      return fires.some((f) => {
        const t = (now / 1000 + f.offset) % f.period;
        return t < f.dur;
      });
    }

    function finish(cleared, note) {
      if (resolved) return;
      resolved = true;
      over = true;
      cancelAnimationFrame(raf);
      cleanup();
      const timeLeft = Math.max(0, TIME_LIMIT - elapsed);
      let score;
      if (!cleared) score = 0.2;
      else score = Math.min(1, 0.6 + (timeLeft / TIME_LIMIT) * 0.25 + (falls === 0 ? 0.15 : 0) - hits * 0.05);
      statusEl.textContent = note;
      setTimeout(() => {
        resolve({
          score: Math.max(0, score),
          detail: { cleared, falls, hits, timeLeft: Math.round(timeLeft), retry: falls > 0 },
          summary: `泸定桥：${note}`,
        });
      }, 600);
    }

    function draw(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!over) elapsed = (now - t0) / 1000;

      // 输入
      if (!over) {
        const speed = 108;
        if (keys.has('left')) px = Math.max(8, px - speed * dt);
        if (keys.has('right')) px = Math.min(W - 30, px + speed * dt);
        vy += 900 * dt;
        py += vy * dt;
        if (py >= GROUND) {
          py = GROUND;
          vy = 0;
          onGround = true;
        }
        // 站在缺口上 → 跌落
        if (py >= GROUND - 1 && onGround && inGap(px)) {
          falls += 1;
          audio.playSfx('wrong');
          if (falls >= 2) {
            finish(false, '第二次跌落，队伍付出代价才过桥');
          } else {
            statusEl.textContent = '战友一把拉住你（体力 −10）';
            px = Math.max(8, (gaps.find((g) => px > g.x && px < g.x + g.w)?.x ?? px) - 16);
            py = GROUND;
            vy = 0;
            onGround = true;
          }
        }
        // 火力
        hitCooldown = Math.max(0, hitCooldown - dt);
        if (fireHot(now) && hitCooldown <= 0 && fires.some((f) => px > f.x - 10 && px < f.x + f.w + 10)) {
          hits += 1;
          hitCooldown = 0.8;
          audio.playSfx('wrong');
        }
        if (px >= GOAL) finish(true, hits === 0 && falls === 0 ? '干净利落过桥' : '过桥了');
        if (elapsed >= TIME_LIMIT) finish(false, '时间到了');
      }

      // ── 画面 ──
      ctx.clearRect(0, 0, W, H);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#161c26');
      sky.addColorStop(1, '#0b0f14');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // 江水
      ctx.fillStyle = 'rgba(60,110,130,0.35)';
      ctx.fillRect(0, GROUND + 22, W, H - GROUND - 22);

      // 桥面木板
      for (let x = 0; x < W - 30; x += 18) {
        if (inGap(x) || inGap(x + 12)) continue;
        ctx.fillStyle = '#4a3524';
        ctx.fillRect(x, GROUND, 16, 8);
      }
      // 铁索
      ctx.strokeStyle = 'rgba(180,180,170,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND - 26);
      ctx.lineTo(W, GROUND - 26);
      ctx.stroke();

      // 火力预警
      fires.forEach((f) => {
        const hot = fireHot(now);
        ctx.fillStyle = hot ? 'rgba(230,90,60,0.55)' : 'rgba(230,90,60,0.14)';
        ctx.fillRect(f.x, GROUND - 60, f.w, 60);
      });

      // 角色
      ctx.fillStyle = '#e8dcc8';
      ctx.beginPath();
      ctx.arc(px, py - 26, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8b2e2e';
      ctx.fillRect(px - 5, py - 20, 10, 20);

      // 终点旗
      ctx.fillStyle = '#c23a2e';
      ctx.fillRect(GOAL + 6, GROUND - 52, 3, 52);
      ctx.fillStyle = 'rgba(194,58,46,0.85)';
      ctx.fillRect(GOAL + 9, GROUND - 52, 20, 12);

      if (!over) {
        timeEl.textContent = `${Math.max(0, TIME_LIMIT - elapsed).toFixed(1)}s`;
        if (statusEl.textContent.startsWith('按')) statusEl.textContent = '过桥中…';
      }
      raf = requestAnimationFrame(draw);
    }

    const onKeyDown = (e) => {
      if (!document.body.contains(container)) { cleanup(); return; }
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') { keys.add('left'); e.preventDefault(); }
      if (k === 'd' || k === 'arrowright') { keys.add('right'); e.preventDefault(); }
      if (e.code === 'Space') {
        e.preventDefault();
        jump();
      }
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') keys.delete('left');
      if (k === 'd' || k === 'arrowright') keys.delete('right');
    };
    function jump() {
      if (over || !onGround) return;
      vy = -340;
      onGround = false;
      audio.playSfx('click');
    }
    function press(dir) {
      keys.add(dir);
      setTimeout(() => keys.delete(dir), 140);
    }
    const btnLeft = container.querySelector('#luding-left');
    const btnRight = container.querySelector('#luding-right');
    const btnJump = container.querySelector('#luding-jump');
    btnLeft.dataset.miniAction = 'left';
    btnRight.dataset.miniAction = 'right';
    btnJump.dataset.miniAction = 'jump';
    container.dataset.miniState = 'player';
    btnLeft.onclick = () => press('left');
    btnRight.onclick = () => press('right');
    btnJump.onclick = jump;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    function cleanup() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    }
    void dead;

    t0 = performance.now();
    last = t0;
    raf = requestAnimationFrame(draw);
  });
}

/**
 * 陡坡 · 拽住同伴：0.8s 量级的时机操作，三次机会。
 * 返回 { score, detail:{ hits, tries, bestMiss } }
 */
export function runGrab(container) {
  return new Promise((resolve) => {
    const TRIES = 3;
    const WIN = 16; // 窗口宽度（百分比）

    const root = h('div');
    mount(container, root);
    root.appendChild(h('div', { class: 'mg-title', text: '拽住他' }));
    root.appendChild(h('div', {
      class: 'mg-hint',
      text: '他滑脱的那一下只有很短的时间。光标扫进高亮区时按空格（或点「抓住」）。三次机会。',
    }));
    const track = h('div', { class: 'grab-track' });
    const zone = h('div', { class: 'grab-zone' });
    const marker = h('div', { class: 'grab-marker' });
    track.append(zone, marker);
    const status = h('div', { class: 'score-line', text: `第 1 / ${TRIES} 次` });
    const btn = h('button', { class: 'btn primary', type: 'button', text: '抓住（空格）' });
    btn.dataset.miniAction = 'grab';
    root.append(track, h('div', { class: 'mg-row' }, [btn]), status);

    let zonePos = 22 + Math.random() * 46;
    let pos = 0;
    let dir = 1;
    const speed = 86; // %/s
    let tries = 0;
    let hits = 0;
    let sum = 0;
    let over = false;
    let last = performance.now();
    let raf = 0;
    zone.style.left = `${zonePos}%`;
    zone.style.width = `${WIN}%`;

    function paint() {
      marker.style.left = `${pos}%`;
    }

    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!over) {
        pos += dir * speed * dt;
        if (pos >= 100) { pos = 100; dir = -1; }
        if (pos <= 0) { pos = 0; dir = 1; }
        paint();
        raf = requestAnimationFrame(tick);
      }
    }

    function grab() {
      if (over) return;
      const center = zonePos + WIN / 2;
      const half = WIN / 2;
      const d = Math.abs(pos - center);
      const inZone = d <= half;
      const v = inZone ? 1 - (d / half) * 0.35 : 0.15;
      sum += v;
      if (inZone) hits += 1;
      tries += 1;
      audio.playSfx(inZone ? 'hook' : 'wrong');
      status.textContent = inZone
        ? `抓住了！（第 ${tries}/${TRIES} 次）`
        : `手空了……（第 ${tries}/${TRIES} 次）`;
      if (tries >= TRIES) {
        over = true;
        cancelAnimationFrame(raf);
        cleanup();
        setTimeout(() => {
          resolve({
            score: Math.min(1, sum / TRIES),
            detail: { hits, tries: TRIES },
            summary: `陡坡拉人 ${hits}/${TRIES}`,
          });
        }, 500);
        return;
      }
      zonePos = 20 + Math.random() * 50;
      zone.style.left = `${zonePos}%`;
    }

    const onKey = (e) => {
      if (!document.body.contains(container)) { window.removeEventListener('keydown', onKey); return; }
      if (e.code === 'Space') { e.preventDefault(); grab(); }
    };
    window.addEventListener('keydown', onKey);
    function cleanup() { window.removeEventListener('keydown', onKey); }
    btn.onclick = grab;

    last = performance.now();
    raf = requestAnimationFrame(tick);
  });
}
