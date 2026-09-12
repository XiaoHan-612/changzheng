/**
 * 四个小游戏 — mount(parent) 后返回 Promise<{ score, detail, summary, extra? }>
 */

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

/** 老班长：咬钩起竿 */
export function runFishing(parent) {
  return new Promise((resolve) => {
    const root = h('div');
    mount(parent, root);
    root.appendChild(h('div', { class: 'mg-title', text: '河边 · 咬钩' }));
    root.appendChild(h('div', {
      class: 'mg-hint',
      text: '漂相三档：轻晃是假口，缓沉是真口，黑漂是大物。在下沉时起竿。空三次也能继续（去挖草根）。',
    }));

    const msg = h('div', { class: 'float-msg', text: '把钩抛进水里，等漂相…' });
    const area = h('div', { class: 'float-area' });
    area.appendChild(h('div', { class: 'float-water' }));
    const bobber = h('div', { class: 'float-bobber' });
    area.appendChild(bobber);

    const status = h('div', { class: 'score-line', text: '第 1 竿 · 最多 3 竿' });
    const btnCast = h('button', { class: 'btn primary', type: 'button', text: '抛竿' });
    const btnHook = h('button', { class: 'btn', type: 'button', text: '起竿！' });
    btnHook.disabled = true;

    root.appendChild(msg);
    root.appendChild(area);
    root.appendChild(h('div', { class: 'mg-row' }, [btnCast, btnHook]));
    root.appendChild(status);

    let attempt = 0;
    const scores = [];
    let phase = 'idle';
    let windowStart = 0;
    let windowMs = 0;
    let timers = [];

    function clearTimers() {
      timers.forEach(clearTimeout);
      timers = [];
    }

    function finish() {
      clearTimers();
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.15;
      const score = Math.max(0, Math.min(1, avg));
      resolve({
        score,
        detail: { attempts: attempt, scores },
        summary: `钓鱼 ${attempt} 竿，综合 ${score.toFixed(2)}`,
      });
    }

    function afterCastMiss(note) {
      phase = 'idle';
      bobber.classList.remove('shake', 'sink');
      bobber.style.top = '40%';
      msg.textContent = note;
      btnHook.disabled = true;
      btnCast.disabled = attempt >= 3;
      if (attempt >= 3) finish();
    }

    btnCast.onclick = () => {
      if (phase !== 'idle' || attempt >= 3) return;
      attempt += 1;
      phase = 'waiting';
      btnCast.disabled = true;
      btnHook.disabled = true;
      msg.textContent = '浮漂立在水里…';
      bobber.style.top = '40%';
      bobber.classList.remove('shake', 'sink');
      status.textContent = `第 ${attempt} 竿 · 最多 3 竿`;

      const wait = 700 + Math.random() * 1400;
      timers.push(
        setTimeout(() => {
          const roll = Math.random();
          if (roll < 0.25) {
            bobber.classList.add('shake');
            msg.textContent = '轻轻晃了一下——像是水草。';
            phase = 'window';
            windowStart = performance.now();
            windowMs = 1000;
            btnHook.disabled = false;
            timers.push(setTimeout(() => {
              if (phase === 'window') {
                scores.push(0.1);
                afterCastMiss('假口。你起竿，空的。');
              }
            }, windowMs));
          } else if (roll < 0.8) {
            bobber.classList.add('sink');
            bobber.style.top = '58%';
            msg.textContent = '缓沉——真口！快起竿！';
            phase = 'window';
            windowStart = performance.now();
            windowMs = 1300;
            btnHook.disabled = false;
            timers.push(setTimeout(() => {
              if (phase === 'window') {
                scores.push(0.25);
                afterCastMiss('慢了。鱼吐钩走了。');
              }
            }, windowMs));
          } else {
            bobber.classList.add('sink');
            bobber.style.top = '72%';
            msg.textContent = '黑漂！大物！';
            phase = 'window';
            windowStart = performance.now();
            windowMs = 750;
            btnHook.disabled = false;
            timers.push(setTimeout(() => {
              if (phase === 'window') {
                scores.push(0.2);
                afterCastMiss('脱钩了。水花溅了一脸。');
              }
            }, windowMs));
          }
        }, wait)
      );
    };

    btnHook.onclick = () => {
      if (phase !== 'window') return;
      const dt = performance.now() - windowStart;
      phase = 'idle';
      clearTimers();
      bobber.classList.remove('shake', 'sink');
      btnHook.disabled = true;

      const mid = windowMs * 0.45;
      const err = Math.abs(dt - mid);
      let s = Math.max(0.15, 1 - err / (windowMs * 0.7));
      if (windowMs < 900) s = Math.min(1, s * 1.08);
      scores.push(s);

      if (s >= 0.8) msg.textContent = '腕上一沉——鱼出水了，在火光里银亮地跳！';
      else if (s >= 0.5) msg.textContent = '起竿稍慢，一条小鱼脱了钩。';
      else msg.textContent = '太急了。空竿。';

      bobber.style.top = '40%';
      btnCast.disabled = attempt >= 3;
      if (attempt >= 3) setTimeout(finish, 600);
    };
  });
}

/** 红小鬼：分糖 */
export function runCandy(parent) {
  return new Promise((resolve) => {
    const root = h('div');
    mount(parent, root);
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
      const c = h('div', { class: 'candy', text: '糖' });
      c.dataset.idx = String(i);
      candies.push(c);
      tray.appendChild(c);
    }

    const row = h('div', { class: 'target-row' });
    const cards = {};
    for (const t of targets) {
      const card = h('div', { class: 'target-card' });
      card.appendChild(h('div', { class: 't-name', text: t.name }));
      card.appendChild(h('div', { class: 't-desc', text: t.desc }));
      const cnt = h('div', { class: 't-count', text: '0 颗' });
      card.appendChild(cnt);
      cards[t.id] = { el: card, cnt };
      row.appendChild(card);
    }

    const selfBtn = h('button', { class: 'btn ghost', type: 'button', text: '自己收好（不给）' });
    const confirmBtn = h('button', { class: 'btn primary', type: 'button', text: '就这样' });
    confirmBtn.disabled = true;
    const leftLabel = h('div', { class: 'score-line', text: '还剩 3 颗' });

    root.appendChild(tray);
    root.appendChild(row);
    root.appendChild(h('div', { class: 'mg-row' }, [selfBtn, confirmBtn]));
    root.appendChild(leftLabel);

    candies.forEach((c) => {
      c.addEventListener('click', () => {
        if (c.classList.contains('used')) return;
        candies.forEach((x) => (x.style.outline = ''));
        pickIdx = Number(c.dataset.idx);
        c.style.outline = '2px solid var(--gold)';
      });
    });

    targets.forEach((t) => {
      cards[t.id].el.addEventListener('click', () => {
        if (pickIdx == null) return;
        const candy = candies[pickIdx];
        if (!candy || candy.classList.contains('used')) return;
        candy.classList.add('used');
        candy.style.outline = '';
        given[t.id] += 1;
        left -= 1;
        cards[t.id].cnt.textContent = `${given[t.id]} 颗`;
        leftLabel.textContent = `还剩 ${left} 颗`;
        pickIdx = null;
        confirmBtn.disabled = false;
      });
    });

    selfBtn.onclick = () => {
      if (left > 0) {
        given.self += left;
        left = 0;
        candies.forEach((c) => c.classList.add('used'));
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
        given: parts.join('，') || '一颗没给',
      });
    };
  });
}

/** 哨兵：5 个信号 */
export function runSentry(knownPassword, parent) {
  return new Promise((resolve) => {
    const root = h('div');
    mount(parent, root);
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

    function showEvent() {
      if (idx >= events.length) {
        const score = hits / events.length;
        resolve({
          score,
          detail: { hits, total: events.length },
          summary: `夜岗 ${hits}/${events.length} 处置得当`,
        });
        return;
      }
      const ev = events[idx];
      prog.textContent = `信号 ${idx + 1} / 5`;
      sig.innerHTML = '';
      sig.appendChild(h('div', { class: 'sig-type', text: ev.type }));
      sig.appendChild(h('div', { class: 'sig-main', text: ev.main }));
      sig.appendChild(h('div', { class: 'dir-arrows', text: idx % 2 === 0 ? '←  ·  →' : '·  ↑  ·' }));

      const opts = [btnA, btnB, btnC];
      ev.options.forEach((label, i) => {
        opts[i].textContent = label;
        opts[i].onclick = () => {
          if (i === ev.correct) hits += 1;
          idx += 1;
          showEvent();
        };
      });
    }

    showEvent();
  });
}

/** 文化教员 */
export function runSchool(parent) {
  return new Promise((resolve) => {
    const root = h('div');
    mount(parent, root);
    root.appendChild(h('div', { class: 'mg-title', text: '夜校 · 识字与口令' }));
    root.appendChild(h('div', {
      class: 'mg-hint',
      text: '三小关。口令会记住，夜岗时用得到。',
    }));

    const board = h('div', { class: 'blackboard' });
    const sub = h('div', { class: 'sub' });
    const big = h('div', { class: 'big-char' });
    board.appendChild(big);
    board.appendChild(sub);
    root.appendChild(board);

    const blocks = h('div', { class: 'word-blocks' });
    root.appendChild(blocks);
    const scoreLine = h('div', { class: 'score-line', text: '第 1 / 3 关' });
    root.appendChild(scoreLine);

    let step = 0;
    let correct = 0;
    const password = '瑞金';

    const steps = [
      { title: '认字', prompt: '火光里这个字，念什么？', show: '志', options: ['志', '忘', '忠'], answer: 0 },
      { title: '拼音', prompt: 'ruì jīn —— 出发的地方', show: 'ruì jīn', options: ['瑞金', '遵义', '会理'], answer: 0 },
      { title: '拼口令', prompt: '点选两个字，排出今晚口令', show: '口令', options: ['金', '瑞', '同', '志'], sequence: true },
    ];

    function renderStep() {
      if (step >= steps.length) {
        const score = correct / steps.length;
        resolve({
          score,
          detail: { correct, total: steps.length, password },
          summary: `识字 ${correct}/3，口令「${password}」`,
          password,
        });
        return;
      }
      const s = steps[step];
      scoreLine.textContent = `第 ${step + 1} / 3 关 · ${s.title}`;
      sub.textContent = s.prompt;
      big.textContent = s.show;
      blocks.innerHTML = '';

      if (s.sequence) {
        let picked = '';
        const btns = s.options.map((ch) => {
          const b = h('div', { class: 'word-block', text: ch });
          b.onclick = () => {
            if (b.classList.contains('picked')) return;
            b.classList.add('picked');
            picked += ch;
            if (picked.length >= 2) {
              if (picked === '瑞金') {
                correct += 1;
                big.textContent = '瑞金';
                sub.textContent = '对了。战士们小声跟读了一遍。';
              } else {
                correct += 0.5;
                big.textContent = picked;
                sub.textContent = '顺序不对，又教了一遍——记住了。';
              }
              setTimeout(() => {
                step += 1;
                renderStep();
              }, 900);
            }
          };
          return b;
        });
        [1, 0, 2, 3].forEach((i) => blocks.appendChild(btns[i]));
      } else {
        s.options.forEach((label) => {
          const b = h('div', { class: 'word-block', text: label });
          b.style.fontSize = '16px';
          b.onclick = () => {
            if (s.options.indexOf(label) === s.answer) {
              correct += 1;
              b.classList.add('selected');
              sub.textContent = '对。';
              setTimeout(() => {
                step += 1;
                renderStep();
              }, 450);
            } else {
              sub.textContent = '再看一眼。';
            }
          };
          blocks.appendChild(b);
        });
      }
    }

    renderStep();
  });
}

/** 弯针（轻量铺垫） */
export function runBendNeedle(parent) {
  return new Promise((resolve) => {
    const root = h('div');
    mount(parent, root);
    root.appendChild(h('div', { class: 'mg-title', text: '弯针成钩' }));
    root.appendChild(h('div', { class: 'mg-hint', text: '缝衣针在火上烤过，沿三点弯出钩形。' }));
    const label = h('div', { class: 'mg-hint', text: '1. 针眼端固定' });
    const bar = h('div', { class: 'score-line', text: '进度 □□□' });
    const btn = h('button', { class: 'btn primary', type: 'button', text: '弯折 1/3' });
    root.append(label, btn, bar);
    let i = 0;
    const steps = ['1. 针眼端固定', '2. 中段支点', '3. 弯出钩尖'];
    btn.onclick = () => {
      i += 1;
      bar.textContent = '进度 ' + '■'.repeat(i) + '□'.repeat(3 - i);
      if (i >= 3) {
        btn.disabled = true;
        label.textContent = '钩弯好了。很硬，能用。';
        setTimeout(resolve, 400);
      } else {
        label.textContent = steps[i];
        btn.textContent = `弯折 ${i + 1}/3`;
      }
    };
  });
}

/** 抉择按钮组 */
export function renderChoices(parent, title, hint, options) {
  return new Promise((resolve) => {
    const root = h('div');
    mount(parent, root);
    if (title) root.appendChild(h('div', { class: 'mg-title', text: title }));
    if (hint) root.appendChild(h('div', { class: 'mg-hint', text: hint }));
    const row = h('div', { class: 'mg-row' });
    options.forEach((opt) => {
      const label = typeof opt === 'string' ? opt : opt.label;
      const sub = typeof opt === 'string' ? '' : opt.sub || '';
      const btn = h('button', { class: 'choice-btn', type: 'button' });
      btn.appendChild(document.createTextNode(label));
      if (sub) btn.appendChild(h('small', { text: sub }));
      btn.onclick = () => resolve(label);
      row.appendChild(btn);
    });
    root.appendChild(row);
  });
}

/** 泥地石子五子棋（9x9，简易对手） */
export function runGomoku(parent) {
  return new Promise((resolve) => {
    const N = 9;
    const board = Array.from({ length: N }, () => Array(N).fill(0)); // 0 empty 1 you 2 kid
    let turn = 1;
    let over = false;
    let moves = 0;

    const root = h('div');
    mount(parent, root);
    root.appendChild(h('div', { class: 'mg-title', text: '泥地五子棋' }));
    root.appendChild(h('div', {
      class: 'mg-hint',
      text: '你执深色石子，小鬼执浅色。连成五子为胜。平局也算你们打了个平手。',
    }));
    const status = h('div', { class: 'score-line', text: '你先手' });
    const grid = h('div', { class: 'wzq-grid' });
    root.appendChild(status);
    root.appendChild(grid);

    const cells = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const c = h('button', { class: 'wzq-cell', type: 'button' });
        c.dataset.x = String(x);
        c.dataset.y = String(y);
        c.onclick = () => play(x, y, 1);
        grid.appendChild(c);
        cells.push(c);
      }
    }

    function idx(x, y) { return y * N + x; }

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
          while (true) {
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
      const score = result === 'win' ? 1 : result === 'draw' ? 0.55 : 0.25;
      setTimeout(() => {
        resolve({
          score,
          detail: { result, moves },
          summary: `五子棋：${note}`,
        });
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
      setTimeout(kidMove, 380 + Math.random() * 400);
    }

    function kidMove() {
      if (over) return;
      // 简易：优先堵你、连自己，否则邻近空位
      let best = null;
      let bestScore = -1;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (board[y][x] !== 0) continue;
          let s = Math.random() * 0.3;
          // near existing
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = y + dy, nx = x + dx;
              if (ny < 0 || nx < 0 || ny >= N || nx >= N) continue;
              if (board[ny][nx] === 1) s += 0.8;
              if (board[ny][nx] === 2) s += 1.2;
            }
          }
          // try win/block
          board[y][x] = 2;
          if (checkWin(x, y, 2)) s += 100;
          board[y][x] = 1;
          if (checkWin(x, y, 1)) s += 80;
          board[y][x] = 0;
          if (s > bestScore) { bestScore = s; best = { x, y }; }
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
    }
  });
}
