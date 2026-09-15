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
   * 诗句逐字 —— **跟音频的已播毫秒走**（终局升华那一段）。
   *
   * 时间基准只有两个来源，都写在 `revealByClock` 里：
   *   · 有整段朗诵（`audio.full`）：跟 `voice:progress` 的 t（批 A 建立的那条时钟），逐句窗口取
   *     `lines[].startMs/endMs`（**量出来的**，见 docs/HANDOFF-AUDIO 第六点五节）；
   *   · 没有音频：按 `pace` 合成一条时间轴，用挂钟推——**没声音也照演**（红线：音频不许阻塞流程）。
   * 两条路只差"现在几点了"，逐字逻辑同一份。
   */
  poem: {
    kind: 'poem',
    holdMs: () => 2400,                 // 读完之后的一点余韵
    speeds: [1, 1.5],                   // 可加速：播放器据此露出速度键（档位值来自 audio/mix.js）
    async render(ctx, b) {
      const poem = await fetchPoem();
      if (!poem) { ctx.cap.textContent = ''; return; }
      ctx.stage.style.backgroundImage = 'none';         // 黑场：让诗自己立住
      const lines = poem.lines || [];
      const chars = (t) => [...String(t || '')];
      ctx.beat.innerHTML = `<div class="poem">
        <p class="poem-title">${escapeHtml(poem.title || '')}<span>${escapeHtml(poem.author || '')}</span></p>
        <div class="poem-body">${lines.map((l) => `<p class="poem-line" data-i="${l.i}">`
          + chars(l.text).map((ch) => `<span class="poem-ch">${escapeHtml(ch)}</span>`).join('')
          + `<span class="poem-ch">${escapeHtml(l.punct || '')}</span></p>`).join('')}</div>
      </div>`;
      const rows = [...ctx.beat.querySelectorAll('.poem-line')].map((el) => ({
        el,
        chs: [...el.querySelectorAll('.poem-ch')],
      }));
      ctx.cap.textContent = '';

      const full = poem.audio?.full;
      const plan = timelineOf(poem);                    // [{ i, startMs, endMs }]
      let clock;                                        // () => 已播毫秒
      if (full) {
        const file = `/audio/poem/${full}`;
        kernel.emit('voice:say', { file, rate: ctx.rate || 1 });
        await sleep(650);
        const v = ctx.voice();
        if (v.startedAt) {
          clock = () => ctx.voice().t;                  // 跟音频（唯一时钟）
        } else {
          ctx.cap.textContent = '（这段朗诵没放出来，改按字读）';
          clock = wallClock(ctx.rate);                 // 文件缺失/静音：退化成固定节奏
          ctx.after(1200, () => { if (!ctx.gone()) ctx.cap.textContent = ''; });
        }
      } else {
        clock = wallClock(ctx.rate);
      }
      for (const row of rows) row.chs.forEach((c) => { c.classList.remove('on'); });
      const end = plan.length ? plan[plan.length - 1].endMs : 0;
      await revealByClock(ctx, plan, rows, clock, end);
    },
  },

  /** 钤印收束：落款 + "两万五千里"（沿用回响屏那枚印章的样式，视觉口径一处管） */
  seal: {
    kind: 'seal',
    holdMs: (b) => b.holdMs ?? 3000,
    async render(ctx, b) {
      const poem = await fetchPoem().catch(() => null);
      ctx.stage.style.backgroundImage = 'none';
      const word = b.word || poem?.seal?.line || '两万五千里';
      const note = b.note || poem?.seal?.note || '';
      ctx.beat.innerHTML = `<div class="poem-seal">
        <div class="blk-seal echo-seal">${escapeHtml(word)}</div>
        ${note ? `<p class="foot-note">${escapeHtml(note)}</p>` : ''}
      </div>`;
      ctx.cap.textContent = '';
    },
  },
};

/** 有音频就用**量出来的**逐句窗口；没有就按 pace 合成一条（每条 = 字数 × msPerChar + 句间停顿） */
function timelineOf(poem) {
  const lines = poem.lines || [];
  const paced = lines.every((l) => !Number.isFinite(l.startMs) || !Number.isFinite(l.endMs));
  const msPerChar = Number(poem.pace?.msPerChar) || 210;
  const gap = Number(poem.pace?.lineGapMs) || 500;
  const hold = Number(poem.pace?.holdTitleMs) || 1400;
  let t = paced ? hold : 0;
  return lines.map((l) => {
    if (!paced) return { i: l.i, startMs: l.startMs, endMs: l.endMs };
    const dur = [...String(l.text)].length * msPerChar;
    const row = { i: l.i, startMs: t, endMs: t + dur };
    t += dur + gap;
    return row;
  });
}

/** 挂钟（无音频时的时钟）：已过毫秒 × 语速 */
function wallClock(rate) {
  const t0 = Date.now();
  return () => (Date.now() - t0) * (Number(rate) || 1);
}

/**
 * 逐字显现：**只跟时间**。每 60ms 问一次"现在几点了"，把已经该出现的字挂上 `.on`。
 * 一路走到最后一句的终点再停（音频提前断了也不至于永远转下去）。
 */
async function revealByClock(ctx, plan, rows, clock, endMs) {
  for (;;) {
    if (ctx.gone()) {
      // 点按 = "剩下的直接读完"（一次点按就把八句给全，停一拍再走）；跳过 = 立即收摊
      if (!ctx.skipped?.()) rows.forEach((r) => r.chs.forEach((c) => c.classList.add('on')));
      return;
    }
    const ms = clock() || 0;
    for (const line of plan) {
      const row = rows[line.i - 1];
      if (!row) continue;
      const span = Math.max(1, line.endMs - line.startMs);
      const n = ms <= line.startMs ? 0 : Math.ceil(Math.min(1, (ms - line.startMs) / span) * (row.chs.length - 1));
      row.chs.forEach((c, i) => { c.classList.toggle('on', i < n); });
    }
    if (ms > endMs + 700) return;
    await sleep(60);
  }
}

/** 拍子词汇的封闭列表（文档、体检、序列数据都对着它） */
export const BEAT_KINDS = Object.keys(BEATS);

/** 按 kind 取拍子；未登记就报清楚（而不是静默演一段空白） */
export function beatOf(kind) {
  const b = BEATS[kind];
  if (!b) console.error(`[cinema] 没有「${kind}」这种拍子，可用：${BEAT_KINDS.join('、')}`);
  return b || null;
}
