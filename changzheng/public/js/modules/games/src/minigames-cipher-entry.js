/**
 * 《译电》· **难度选择入口**（单独开发，未接线）
 *
 * ── 为什么要这一层 ──
 *   用户原话：「你做一个接口，就是对于一码这里，就是对于那些想玩儿比较简单的玩家，
 *   可以让他保留原功能。然后对于一些比较想挑战的玩家，就是让他可以选择现在做的这个。」
 *
 *   译电现在有两版，两版的"译"根本不是一回事：
 *     · **简单档（v2）**：规则一句话 —— 报上每个密组在密本上查一个字，同一封报只能用一本。
 *       **两句读法是现成摆着的**，玩家要做的是定本 + 判谎，考的是**判断**。
 *     · **挑战档（v3）**：四码 / 韵目代日 / 地支代月 / 锁匙加减 —— **锁匙要自己试出来、
 *       六个码组要自己逐组查成字**，考的是**真译一遍 + 判断**。
 *   两版都成立，只是"要不要亲手译"的差别。硬留一版都会丢掉另一批玩家，
 *   所以这一层把它们并成**开局的一个选择**，选完直接进对应的那一版。
 *
 * ── 这一层刻意做得很薄 ──
 *   它**只负责问一句"怎么玩"**，不含任何译电规则；两支本体一个字没动，仍然各自独立、各自可跑。
 *   接线时主线调 `runCipherEntry` 即可，两档一起接上；detail 里带 `mode` 给结算/统计认档。
 *
 * ── 契约 ──
 *   `dataset.mini` 先进 `'cipher-entry'`、`miniState` 先 `'choose'`；
 *   选定后**交给子玩法接管**（它会把自己的 id 写回 `mini`），额外留 `dataset.miniEntry='cipher-entry'`
 *   和 `dataset.miniMode` 认档。返回的 `{score, detail, summary}` 是子玩法原样的，只多一个 `detail.mode`。
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

import { runCipher } from './minigames-cipher.js';
import { runCipherCode } from './minigames-cipher-code.js';

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

function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

/* ══════════════ 两档 ══════════════ */

export const MODES = [
  {
    id: 'easy',
    title: '简单 · 照着译',
    run: (host, o = {}) => runCipher(host, o),
    lines: [
      '报上的每个密组，在密本上查一个字；同一封报只能用一本。',
      '<b>两句读法是现成摆着的</b> —— 你要做的是判断该用哪一本、这句话是不是谎话。',
      '天亮前 3 刻：翻材料一刻一份，回报也要一刻，<b>三份全翻就天亮了</b>。',
    ],
    tagline: '考判断',
  },
  {
    id: 'hard',
    title: '挑战 · 真译一遍',
    run: (host, o = {}) => runCipherCode(host, o),
    lines: [
      '报头写「午支」不写日子 —— <b>地支代月 + 韵目代日</b>，自己翻墙上的表。',
      '明码逐位加减一个数再发出（<b>锁匙加减变法</b>），缴获的密文上没写是几 —— <b>转旋钮去试</b>。',
      '<b>六个码组要自己逐组查成字</b>；换过本之后同一串码配的是不同的字，所以两本各成一句。',
    ],
    tagline: '考真译 + 判断',
  },
];

/* ══════════════ 样式 ══════════════ */

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const ink = cssVar('--ink', '#f0e4cf');
  const s = document.createElement('style');
  s.textContent = `
.smini22-wrap{position:relative;z-index:2;font-size:14px;line-height:1.7;color:${ink}}
.smini22-desk{border-radius:10px;padding:14px 16px 16px;
  background:linear-gradient(180deg,#241d17 0%,#1b1510 60%,#150f0b 100%);
  box-shadow:0 10px 30px rgba(0,0,0,.5),inset 0 0 60px rgba(255,180,90,.07);
  border:1px solid rgba(255,190,120,.14)}
.smini22-head{font-size:12px;letter-spacing:3px;color:#e7c894;margin-bottom:3px}
.smini22-sub{font-size:12.5px;color:#bda486;margin:0 0 13px;line-height:1.65}
.smini22-cards{display:flex;gap:11px;flex-wrap:wrap}
.smini22-card{flex:1 1 250px;text-align:left;cursor:pointer;border-radius:9px;padding:12px 14px;
  background:rgba(255,225,180,.06);border:1px solid rgba(255,190,120,.22);color:#f2e0bd;
  font-family:inherit;transition:.15s}
.smini22-card:hover{background:rgba(255,225,180,.16);border-color:rgba(255,205,140,.5)}
.smini22-card .ttl{display:block;font-size:16px;font-weight:700;color:#ffd79a;letter-spacing:.5px}
.smini22-card .tag{display:inline-block;font-size:11px;color:#2a1e12;background:rgba(255,200,130,.75);
  border-radius:3px;padding:1px 7px;margin-bottom:8px}
.smini22-card ul{margin:0;padding-left:16px}
.smini22-card li{font-size:12.5px;line-height:1.7;color:#dcc9a8;margin-bottom:4px}
.smini22-card li b{color:#ffd79a}
.smini22-foot{margin-top:12px;font-size:11.5px;color:#a4907a;line-height:1.65}
`;
  document.head.appendChild(s);
}

/* ══════════════ 入口 ══════════════ */

export function runCipherEntry(container, opts = {}) {
  ensureStyle();

  let chosen = '';
  let done = false;

  container.dataset.mini = 'cipher-entry';
  container.dataset.miniEntry = 'cipher-entry';
  container.dataset.miniState = 'choose';
  container.dataset.miniMode = '';

  const wrap = h('div', { class: 'smini22-wrap' });
  const desk = h('div', { class: 'smini22-desk' }, [
    h('div', { class: 'smini22-head', text: '译 电' }),
    h('p', {
      class: 'smini22-sub',
      text: '同一封缴获的敌报，两种译法。选一种 —— 选完就进局，中途不改。',
    }),
  ]);

  const cards = h('div', { class: 'smini22-cards' });
  MODES.forEach((m) => {
    const card = h('button', {
      class: 'smini22-card',
      'data-mini-action': `mode-${m.id}`,
    }, [
      h('span', { class: 'ttl', text: m.title }),
      h('span', { class: 'tag', text: m.tagline }),
      h('ul', {}, m.lines.map((t) => h('li', { html: t }))),
    ]);
    card.addEventListener('click', () => pick(m));
    cards.appendChild(card);
  });
  desk.appendChild(cards);
  desk.appendChild(h('div', {
    class: 'smini22-foot',
    text: '简单档考的是"判断"（读法摆着，看你能不能看穿这是谎话）；'
      + '挑战档多一步"真译"（锁匙、四码、代月代日都要你自己来）。'
      + '两档的题眼是同一个：译得准，不等于情报准。',
  }));

  wrap.appendChild(desk);
  container.innerHTML = '';
  container.appendChild(wrap);

  /* 只在这里赋一次 resolver（子玩法那边的坑：别在任何回调里再 new 一个 Promise 去覆盖它）。 */
  let resolveFn = null;
  const promise = new Promise((r) => { resolveFn = r; });

  function pick(m) {
    if (done) return;
    done = true;
    chosen = m.id;
    container.dataset.miniMode = m.id;
    container.dataset.miniState = 'enter';
    // 摘掉入口自己的操作标记，免得和子玩法的一起被数进去
    cards.querySelectorAll('[data-mini-action]').forEach((el) => {
      el.removeAttribute('data-mini-action');
    });
    // 交棒：子玩法会 mount(container)，把自己的 id 写回 dataset.mini
    m.run(container, opts).then((res) => {
      const r = res || { score: 0, detail: {}, summary: '' };
      resolveFn({
        score: r.score,
        detail: { ...(r.detail || {}), mode: chosen },
        summary: r.summary,
      });
    }).catch(() => {
      resolveFn({ score: 0, detail: { mode: chosen }, summary: '' });
    });
  }

  return promise;
}

/* ══════════════ 调试台规格 ══════════════ */

export const CIPHER_ENTRY_MINIGAMES = [
  {
    id: 'cipher-entry',
    title: '译电 · 选难度',
    family: '入口 · 两档',
    act: 'act3 · 金沙江（待接线）',
    note: '用户原话：「做一个接口，对于想玩儿比较简单的玩家可以保留原功能，'
      + '对于想挑战的玩家让他可以选择现在做的这个」。<br>'
      + '这一层**只负责问一句"怎么玩"**，不含任何译电规则；两支本体一个字没动，仍各自独立可跑。<br>'
      + '<b>简单档（cipher · v2）</b>：规则一句话 —— 报上每个密组在密本上查一个字，同一封报只能用一本；'
      + '<b>两句读法是现成摆着的</b>，玩家做的是<b>定本 + 判谎</b>，考<b>判断</b>。<br>'
      + '<b>挑战档（cipher-v3）</b>：四码 / 韵目代日 / 地支代月 / 锁匙加减 —— '
      + '<b>锁匙自己试、六个码组自己逐组查成字</b>，考<b>真译一遍 + 判断</b>。<br>'
      + '选定后交棒给子玩法（它会把自己的 id 写回 `dataset.mini`），'
      + '返回值是子玩法原样，只在 `detail` 里多一个 `mode` 用于认档。'
      + '接线时主线调 `runCipherEntry`，两档一起接上。<br>'
      + '<span style="opacity:.75">注：简单档仍会在后台预取一封新题面（`cipher_draft`，约四成成功率、'
      + '不占玩家时间）；挑战档<b>游戏内 0 次模型调用</b>。</span>',
    states: ['choose', 'enter'],
    actions: ['mode-easy', 'mode-hard'],
    noAi: false,
    run: (host, o = {}) => runCipherEntry(host, o),
  },
];
