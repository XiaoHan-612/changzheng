/** 小游戏：钓鱼、识字、过草地路线 — 本地手感，结算走模型 */

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
        <button type="button" class="btn primary" id="fish-cast">抛竿</button>
        <button type="button" class="btn" id="fish-hook" disabled>起竿 (空格)</button>
      </div>
    `;
    const canvas = container.querySelector('#fish-canvas');
    const ctx = canvas.getContext('2d');
    const status = container.querySelector('#fish-status');
    const btnCast = container.querySelector('#fish-cast');
    const btnHook = container.querySelector('#fish-hook');

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
      phase = 'waiting';
      btnCast.disabled = true;
      status.textContent = '抛竿…盯住漂';
      floatTarget = 122;
      scheduleBite();
    });
    btnHook.addEventListener('click', hook);
    const onKey = (e) => {
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

/** 过草地：三选一路线 */
export function runPathChoice(container) {
  return new Promise((resolve) => {
    container.innerHTML = `
      <p class="hint">前方三条路。近路贴着沼泽，稳路硬地多但绕，远路耗体力。选一条。</p>
      <div class="choices" id="path-opts"></div>`;
    const opts = [
      { key: 'near', label: '抄近路', sub: '贴着亮水洼，快但险' },
      { key: 'steady', label: '绕远走硬地', sub: '慢七里，稳' },
      { key: 'far', label: '沿边缘慢慢磨', sub: '最稳，最耗体力' },
    ];
    const box = container.querySelector('#path-opts');
    opts.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn choice';
      b.innerHTML = `<b>${o.label}</b><span>${o.sub}</span>`;
      b.onclick = () => {
        const scoreMap = { near: 0.45, steady: 0.85, far: 0.7 };
        resolve({
          score: scoreMap[o.key],
          detail: { choice: o.key, label: o.label },
          choiceLabel: o.label,
        });
      };
      box.appendChild(b);
    });
  });
}
