/**
 * 拍子词汇 —— 电影化三处（序章 / 幕间 / 终章升华）**共用的那套镜头**，封闭列表。
 *
 * 为什么要"封闭"：三处看起来像同一个人剪的，靠的就是只有这几种拍子、每种只写一次。
 * 想加新镜头 = 这里加一条 + 在 `sequences.js` 里用 + `qa:motion` 补一条断言；
 * **不要**在某个调用点手拼一段只此一处的过场——那是老过场的做法，也是"风格漂"的来源。
 *
 * 一条拍子的形状：
 *   { kind, render(ctx, beat), cleanup?(ctx), holdMs?(beat, ctx), hold?: 'click' }
 *   · `render`  往 `ctx.stage`（背景图）/ `ctx.beat`（拍子内容）上写；字幕由播放器统一写 `ctx.cap`
 *   · 需要定时器的用 `ctx.after(ms, fn)`——换拍子时播放器统一清掉，通道不留定时器
 *   · 减动效：`ctx.reduce` 为真时位移类一律不做（只留淡入），**音频照播**
 *
 * 清单：
 *   title  黑场题字 + 落款          → 序章开场、幕间幕名
 *   map    路线图点亮一段（逐节点亮）→ 序章全程、幕间本幕
 *   photo  空镜 + 字幕逐字           → 告别、幕间本幕空镜
 *   poem   诗句逐字（跟音频的已播毫秒）→ 终章升华
 *   seal   钤印收束 + 落款           → 终章升华
 *
 * 复用**现有**样式类（`.title-card` / `.eyebrow` / `.subtitle` / `.foot-note` / `.journey` 那一套）：
 * 新增 CSS 要过 `qa:tokens`（只许用 token）与 `qa:tone`（纸面预算），
 * 而这些类本来就在讲同一件事（题字、路线、字幕），不另造一套视觉语言。
 */
import { fetchActs, fetchPoem } from '../../ai-client.js';
import { kernel } from '../../kernel/index.js';
import { escapeHtml } from '../../ui.js';

/** 取标题：没有 acts 数据时不留空节点（宁可不画路线，也不画一条空线） */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const actTitles = async () => {
  try {
    const data = await fetchActs();
    const order = data?.order || [];
    return order.map((id) => data?.acts?.[id]?.title || id);
  } catch {
    return [];
  }
};

/** 路线图上的一个节点（复用营地顶栏那条行程缎带的类，视觉口径一处管） */
const ribbon = (titles, lit) => titles.map((t, i) => {
  const cls = i < lit - 1 ? 'done' : i === lit - 1 ? 'now' : '';
  const line = i < titles.length - 1 ? `<div class="j-line ${i < lit - 1 ? 'done' : ''}"></div>` : '';
  return `<div class="j-node ${cls}"><span class="j-dot"></span><span class="j-label">${escapeHtml(t)}</span></div>${line}`;
}).join('');

export const BEATS = {
  /** 黑场题字：一行小字（时间地点）+ 大字 + 副题 + 落款。没有背景图就是纯黑场 */
  title: {
    kind: 'title',
    holdMs: (b) => b.holdMs ?? 3600,
    render(ctx, b) {
      ctx.stage.style.backgroundImage = b.img ? `url('${b.img}')` : 'none';
      ctx.beat.innerHTML = `<div class="title-card ${ctx.reduce ? '' : 'anim-fade'}">
        ${b.eyebrow ? `<p class="eyebrow">${escapeHtml(b.eyebrow)}</p>` : ''}
        <h1>${escapeHtml(b.title || '')}</h1>
        ${b.sub ? `<p class="subtitle">${escapeHtml(b.sub)}</p>` : ''}
        ${b.note ? `<p class="foot-note">${escapeHtml(b.note)}</p>` : ''}
      </div>`;
      ctx.cap.textContent = '';
    },
  },

  /** 路线图：空镜底 + 一条行程缎带**逐节点亮**（`lit: 'all'` = 全程点亮） */
  map: {
    kind: 'map',
    holdMs: (b) => b.holdMs ?? 1600,
    render(ctx, b) {
      ctx.stage.style.backgroundImage = b.img ? `url('${b.img}')` : 'none';
      ctx.beat.innerHTML = `<div class="journey" id="cut-journey"></div>`;
      const box = ctx.beat.querySelector('#cut-journey');
      const stepMs = b.revealMs ?? 260;
      actTitles().then((titles) => {
        if (!box || !titles.length || ctx.gone()) return;
        const total = b.lit === 'all' || b.lit == null ? titles.length : Math.max(1, Math.min(titles.length, b.lit));
        for (let i = 1; i <= total; i++) {
          ctx.after((i - 1) * stepMs, () => { if (!ctx.gone()) box.innerHTML = ribbon(titles, i); });
        }
      });
    },
  },

  /** 空镜 + 字幕逐字（字幕与语音都由播放器管；这一拍只负责背景图） */
  photo: {
    kind: 'photo',
    holdMs: (b) => b.holdMs ?? 1500,
    render(ctx, b) {
      ctx.stage.style.backgroundImage = b.img ? `url('${b.img}')` : 'none';
      ctx.beat.innerHTML = '';
    },
  },
  /**
   * 诗句逐字 —— **按量出来的时间轴估个量，文字比音频略早**（终局升华那一段）。
   *
   * 口径（用户定的）：**不必精确对齐**，文字稍快一点没关系——宁可字先出，别让人等。
   * 所以：逐句窗口取 `data/poem.json` 里量出来的 `startMs/endMs`，整体提前 `POEM_LEAD_MS`，
   * 逐字用**挂钟**推（音频只是并行的背景轨，起播早晚、响没响都不影响字幕节奏）。
   * 这样也顺手去掉了逐帧读音频位置的三种脏数据特判（旧元素 currentTime 让整首两秒读完、
   * 音频停住则永不结束、别的句子的回声漏进来——见 HANDOFF-CODE 坑 55）。
   */
  poem: {
    kind: 'poem',
    holdMs: () => 4200,                 // 读完之后的余韵（原先 2.4s 太短，像被踢走）
    speeds: [1, 1.5],
    /** 收尾：把这首朗诵停掉——它的尾巴不该盖到钤印那一拍上 */
    cleanup() { kernel.emit('voice:stop', {}); },
    async render(ctx, b) {
      let poem = null;
      try { poem = await fetchPoem(); } catch { poem = null; }
      // 取不到数据也要演：内嵌形制与 data/poem.json 一致的骨架，避免一拍就跳走
      if (!poem || !Array.isArray(poem.lines) || !poem.lines.length) {
        poem = {
          title: '七律·长征',
          author: '毛泽东',
          pace: { msPerChar: 220, lineGapMs: 560, holdTitleMs: 1600 },
          audio: { titleMs: 2300 },
          lines: [
            { i: 1, text: '红军不怕远征难', punct: '，' },
            { i: 2, text: '万水千山只等闲', punct: '。' },
            { i: 3, text: '五岭逶迤腾细浪', punct: '，' },
            { i: 4, text: '乌蒙磅礴走泥丸', punct: '。' },
            { i: 5, text: '金沙水拍云崖暖', punct: '，' },
            { i: 6, text: '大渡桥横铁索寒', punct: '。' },
            { i: 7, text: '更喜岷山千里雪', punct: '，' },
            { i: 8, text: '三军过后尽开颜', punct: '。' },
          ],
        };
      }
      ctx.stage.style.backgroundImage = b.img ? `url('${b.img}')` : 'none';
      const lines = poem.lines || [];
      const chars = (t) => [...String(t || '')];
      // 四联横排：传统诗笺版式（不用 display 毛笔族——缺字太多，用系统宋体/serif）
      // 句序仍按音频时间轴从右到左、从上到下逐字点亮
      const pairRows = [];
      for (let i = 0; i < lines.length; i += 2) pairRows.push(lines.slice(i, i + 2));
      ctx.beat.innerHTML = `<div class="poem-scroll">
        <header class="poem-head">
          <h2 class="poem-title">${escapeHtml(poem.title || '七律·长征')}</h2>
          <p class="poem-author">${escapeHtml(poem.author || '')}</p>
        </header>
        <div class="poem-plate">${pairRows.map((pair) => `<div class="poem-pair">`
          + pair.map((l) => `<p class="poem-line" data-i="${l.i}">`
            + chars(l.text).map((ch) => `<span class="poem-ch">${escapeHtml(ch)}</span>`).join('')
            + `<span class="poem-ch">${escapeHtml(l.punct || '')}</span></p>`).join('')
          + `</div>`).join('')}</div>
      </div>`;
      const titleEl = ctx.beat.querySelector('.poem-title');
      const rows = [...ctx.beat.querySelectorAll('.poem-line')].map((el) => ({
        el,
        chs: [...el.querySelectorAll('.poem-ch')],
      }));
      ctx.cap.textContent = '';

      const rate = ctx.rate || 1;
      const plan = timelineOf(poem, rate);
      let end = plan.length
        ? plan[plan.length - 1].endMs
        : Math.max(28000, lines.length * 3200);
      ctx.beat.querySelectorAll('.poem-ch').forEach((c) => c.classList.remove('on'));
      if (titleEl) titleEl.classList.add('on');

      // 先起朗诵，再按「真实音频时长」拉长时间轴——原先只跟 poem.json 的 endMs，
      // 文件若比标定更长，cleanup 的 voice:stop 会在朗读未完时掐断（用户反馈）。
      const fileUrl = poem.audio?.full ? `/audio/poem/${poem.audio.full}` : '';
      let voiceLine = null;
      if (fileUrl) {
        const realMs = await probeAudioMs(fileUrl);
        if (realMs > end + 200) {
          const scale = realMs / end;
          for (const row of plan) { row.startMs *= scale; row.endMs *= scale; }
          end = realMs;
          console.info(`[cinema] 诗时间轴按真实音频拉长到 ${realMs}ms`);
        }
        voiceLine = ctx.say({ file: fileUrl, rate });
      }
      console.info(`[cinema] 诗 ${lines.length} 句 · 时间轴 0–${Math.round(end)}ms · ${rate}× · 题「${poem.title}」`);
      // 逐字：点按不打断（只有「跳过」会停）
      await revealByAnchor(ctx, plan, rows, performance.now(), rate, end, { ignoreTap: true });
      // 逐字走完后，若朗诵还在响，等它自然结束（上限 90s，防止挂死）
      if (voiceLine) {
        const cap = Date.now() + 90000;
        while (voiceLine.playing() && Date.now() < cap && !ctx.skipped?.()) {
          await sleep(120);
        }
      }
    },
  },

  /**
   * 钤印收束：**印章（两个字）+ 落款（"两万五千里"）+ 一行日期**。
   *
   * 别直接复用回响屏那枚 `.blk-seal`：它是 56×56 的**小圆章**（回响卡上的角标），
   * 五个字塞进去会溢出成一堆碎片（2026-09-15 联系表实拍踩到）。这里用同一套视觉语言
   * （朱红描边 + display 字体 + 静态 -8°）另做一枚大印，字只放两个。
   */
  seal: {
    kind: 'seal',
    holdMs: (b) => b.holdMs ?? 3200,
    async render(ctx, b) {
      const poem = await fetchPoem().catch(() => null);
      ctx.stage.style.backgroundImage = 'none';
      const stamp = b.stamp || poem?.seal?.stamp || '长征';
      const line = b.word || poem?.seal?.line || '两万五千里';
      const note = b.note || poem?.seal?.note || '';
      ctx.beat.innerHTML = `<div class="poem-seal">
        <div class="poem-seal-stamp">${escapeHtml(stamp)}</div>
        <p class="poem-seal-line">${escapeHtml(line)}</p>
        ${note ? `<p class="foot-note">${escapeHtml(note)}</p>` : ''}
      </div>`;
      ctx.cap.textContent = '';
    },
  },
};

/**
 * 诗的时间轴：有量好的逐句窗口就用它（**换音频要重新量**，见 docs/HANDOFF-AUDIO 第六点五节），
 * 没有就按 `pace` 合成一条（每条 = 字数 × msPerChar + 句间停顿）。
 * 单位是"音频毫秒"，按语速折算后与"挂钟 × 语速"同一刻度。
 */
/** 文字比音频早多少（估量口径：不追精确，宁可字先出——用户定的） */
const POEM_LEAD_MS = 500;

function timelineOf(poem, rate = 1) {
  const lines = poem.lines || [];
  const paced = lines.every((l) => !Number.isFinite(l.startMs) || !Number.isFinite(l.endMs));
  const msPerChar = Number(poem.pace?.msPerChar) || 220;
  const gap = Number(poem.pace?.lineGapMs) || 560;
  const hold = Number(poem.pace?.holdTitleMs) || 1600;
  const lead = (ms) => Math.max(0, ms - POEM_LEAD_MS);        // 提前，但不许负
  let t = paced ? hold : 0;
  const plan = lines.map((l) => {
    if (!paced) return { i: l.i, startMs: lead(l.startMs) / rate, endMs: lead(l.endMs) / rate };
    const dur = ([...String(l.text)].length * msPerChar) / rate;
    const row = { i: l.i, startMs: t, endMs: t + dur };
    t += dur + gap / rate;
    return row;
  });
  // 兜底：整卷至少约 22s，防止异常数据导致「一闪而过」
  const last = plan.length ? plan[plan.length - 1].endMs : 0;
  if (last < 22000) {
    const scale = 22000 / Math.max(1, last);
    for (const row of plan) { row.startMs *= scale; row.endMs *= scale; }
  }
  return plan;
}

/**
 * 逐字显现：**只跟时间**（`锚点 + 挂钟 × 语速`）。
 *
 * 一句口径：**锚点 + 挂钟 × 语速**。时间轴是"估个量"，音频只是背景轨——
 * 没响、响一半停了，逐字照走（红线"任何音频都不许阻塞流程"自然满足），
 * 也不用再特判逐帧读位置那三种脏数据（见 HANDOFF-CODE 坑 55）。
 * @param {number} anchor performance.now() 锚点（这一拍开始那一刻）
 * @param {number} rate 语速档位
 */
/**
 * 逐字显现：**只跟时间**（`锚点 + 挂钟 × 语速`）。
 * 诗专用：**不把「点按」当中断**——点屏幕不应把整首诗踢到下一拍；
 * 只有「跳过 / 换语速重来 / 换拍」才收手。
 */
async function revealByAnchor(ctx, plan, rows, anchor, rate, endMs, { ignoreTap = false } = {}) {
  const at = () => (performance.now() - anchor) * rate;
  for (;;) {
    if (ctx.skipped?.() || ctx.restarting?.()) return;
    if (!ignoreTap && ctx.gone()) {
      rows.forEach((r) => r.chs.forEach((c) => c.classList.add('on')));
      return;
    }
    const ms = at();
    for (const line of plan) {
      const row = rows[line.i - 1];
      if (!row) continue;
      const span = Math.max(1, line.endMs - line.startMs);
      const n = ms <= line.startMs ? 0 : Math.min(row.chs.length, Math.ceil((Math.min(1, (ms - line.startMs) / span)) * row.chs.length));
      row.chs.forEach((c, i) => { c.classList.toggle('on', i < n); });
    }
    if (ms > endMs + 900) {
      rows.forEach((r) => r.chs.forEach((c) => c.classList.add('on')));
      return;
    }
    await sleep(50);
  }
}

/** 量一下朗诵文件的真实时长（ms）；失败返回 0 */
function probeAudioMs(url) {
  return new Promise((resolve) => {
    const el = new Audio();
    let done = false;
    const fin = (ms) => { if (!done) { done = true; resolve(ms); } };
    el.preload = 'metadata';
    el.onloadedmetadata = () => fin(Math.round((el.duration || 0) * 1000));
    el.onerror = () => fin(0);
    setTimeout(() => fin(0), 4000);
    el.src = url;
  });
}

/** 拍子词汇的封闭列表（文档、体检、序列数据都对着它） */
export const BEAT_KINDS = Object.keys(BEATS);

/** 按 kind 取拍子；未登记就报清楚（而不是静默演一段空白） */
export function beatOf(kind) {
  const b = BEATS[kind];
  if (!b) console.error(`[cinema] 没有「${kind}」这种拍子，可用：${BEAT_KINDS.join('、')}`);
  return b || null;
}
