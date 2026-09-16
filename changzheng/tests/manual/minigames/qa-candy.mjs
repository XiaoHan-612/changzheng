/**
 * 《红小鬼的糖 · 分糖》专项快检 —— 只跑这支玩法，不碰全量套件。
 *
 * 五段（默认只跑前四段，**0 次真调用，约 1 分钟**）：
 *   A. 内容闸 gateFaces：好名单要过，坏名单必须被挡 + **固定池每一份都要过**
 *   B. 计分 gradeShare：六种打法必须分出档 —— 这是"决策有没有分叉"的证据
 *   C. 真点击：reduced-motion 下不打 force 点得动吗 + 契约四项 + **开局不等模型**
 *   C2. **AI 只有 10 秒机会**：两个假接口对照 —— 慢(12s)落固定、快(4s)被模型顶掉
 *   D. 【`--raw`】两条真调用的**原始耗时** —— "为什么必须有固定内容"的证据（约 100–180 秒，日常别跑）
 *   E. 【`--live`】**真网关端到端**：整条链在真模型下走一遍（约 30 秒，交付验收用）
 *
 * 用法：先起服务 node server/index.js，然后
 *   node tests/manual/qa-candy.mjs            # 日常：A/B/C/C2，42 条，0 次真调用
 *   node tests/manual/qa-candy.mjs --live     # 交付/验收：再加真网关端到端，49 条
 *   node tests/manual/qa-candy.mjs --raw      # 只在要引用那两个耗时数字时
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const LAB = 'http://localhost:3001/dev/minigame-lab.html';
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let bad = 0;
const note = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? '✓' : '✗'} ${line}`); };

/* 调试台一打开就**自动跑列表里第一个玩法**，而那个玩法会真调模型（现在一次 20–40 秒）。
   这里把 /api/decide 挡掉，让它立刻失败 —— 我们要测的是分糖，不是那一支。
   （分糖这一段是注入备名单 + noReview，本来就不需要模型。） */
async function blockLabAutoRun(p) {
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (url, init) => {
      if (String(url).includes('/api/decide')) {
        return Promise.resolve(new Response('{"ok":false,"source":"BLOCKED"}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(url, init);
    };
  });
}

/* 调试台的 select() 在 load 事件之后才跑（模块里有多个 await），它会
   bodyEl.innerHTML = '' 把 board-body 清空。**必须等它装完再注入**，
   否则注入的容器会被它当场删掉 —— 表现是"按钮解析到了却被 detach"，
   这一条骗了我一轮。 */
async function gotoLabReady(p) {
  await blockLabAutoRun(p);
  await p.goto(LAB, { waitUntil: 'load' });
  await p.waitForFunction(() => !!document.getElementById('mini-host'), null, { timeout: 20000 }).catch(() => {});
}

/* ══════════ A + B：纯函数（在页面里 import，避开 Node 侧没有 DOM 的问题）══════════ */
console.log('\n=== A. 内容闸 gateFaces（0 次调用）===');
const page = await browser.newPage();
await gotoLabReady(page);
const gate = await page.evaluate(async () => {
  const m = await import('/js/minigames-candy.js');
  const ok5 = m.FALLBACK_FACES;
  const clone = (patch) => ok5.map((f, i) => (i === patch.i ? { ...f, ...patch.v } : { ...f }));
  const cases = [
    ['备名单本身（5 人、里外齐全）', ok5, true],
    ['只有 4 个人', ok5.slice(0, 4), false],
    ['need=3 的有 3 个（惨的人过半）', ok5.map((f, i) => (i < 3 ? { ...f, need: 3 } : f)), false],
    ['最需要的人就是会分糖的人', ok5.map((f, i) => (i === 0 ? { ...f, share: 1 } : f)), false],
    ['一个会分糖的都没有', ok5.map((f) => ({ ...f, share: 0 })), false],
    ['名字重复', clone({ i: 1, v: { name: ok5[0].name } }), false],
    ['表面样子全一样', ok5.map((f) => ({ ...f, look: '面黄肌瘦' })), false],
    ['need 写成 5（越界）', clone({ i: 0, v: { need: 5 } }), false],
    ['share 写成 "yes"（非 0/1）', clone({ i: 2, v: { share: 'yes' } }), false],
    ['里子空着', clone({ i: 0, v: { truth: '' } }), false],
  ];
  return cases.map(([name, raw, want]) => {
    const got = !!m.gateFaces({ faces: raw });
    return { name, want, got, pass: got === want };
  });
});
for (const c of gate) note(c.pass, `${c.name}　闸${c.want ? '应放行' : '应拦住'} → ${c.got ? '放行' : '拦住'}`);

// 固定池：六份**每一份**都得过闸。改池子里的字或数时，这条会当场红。
const poolCheck = await page.evaluate(async () => {
  const m = await import('/js/minigames-candy.js');
  return m.FACES_POOL.map((s, i) => ({ i: i + 1, place: s.place, n: s.faces.length, shapes: s.faces.map((f) => f.need).join(''), ok: !!m.gateFaces({ faces: s.faces }) }));
});
for (const s of poolCheck) note(s.ok, `固定池第 ${s.i} 份（${s.place} · ${s.n} 人 · need=${s.shapes}）过闸`);
note(poolCheck.length >= 4, `池子里有 ${poolCheck.length} 份名单，重开一局不是换个名字重来`);
note(new Set(poolCheck.map((s) => s.shapes)).size >= 2, `池子有 ${new Set(poolCheck.map((s) => s.shapes)).size} 种不同形状（最缺的人数不一样）`);

console.log('\n=== B. 计分 gradeShare：六种打法（固定备名单，0 次调用）===');
const score = await page.evaluate(async () => {
  const m = await import('/js/minigames-candy.js');
  const F = m.FALLBACK_FACES;
  const n = F[0].name; const s = F[1].name; // 伤员老陈(need3,share0) / 扛机枪的(need3,share0)
  const sh = F[2].name; const sh2 = F[3].name; const boy = F[4].name; // 会分糖的两人 / 新兵
  const runs = [
    ['S1 打听两人：最需要的给 1 颗 + 最会分的给 2 颗', [n, sh], { [n]: 1, [sh]: 2 }, 0],
    ['S2 三颗摊给三个不太缺的（没打听，盲给）', [], { [sh]: 1, [sh2]: 1, [boy]: 1 }, 0],
    ['S3 三颗全给最需要的一个人', [n], { [n]: 3 }, 0],
    ['S4 最需要的给 1 颗，自己留 2 颗', [n], { [n]: 1 }, 2],
    ['S5 三颗全给自己', [], {}, 3],
    ['S6 全给最会分的那个人（3 颗）', [sh], { [sh]: 3 }, 0],
  ];
  return runs.map(([name, asked, given, selfKept]) => {
    const g = m.gradeShare(F, asked, given, selfKept);
    return { name, outcome: g.outcome, score: g.score, ratio: g.ratio, covered: g.covered.length };
  });
});
for (const r of score) {
  console.log(`  ${r.name}\n      分 ${r.score.toFixed(3)}　结局 ${r.outcome}　覆盖 ${r.covered} 人　need 覆盖比 ${r.ratio}`);
}
const tiers = new Set(score.map((r) => r.outcome));
note(tiers.size >= 3, `分出了 ${tiers.size} 档结局（${[...tiers].join(' / ')}）—— 决策真的分叉了`);
note(score[0].score > score[2].score + 0.3, `最优打法 ${score[0].score} 明显高于"全给一个人" ${score[2].score}`);
note(score[3].score <= 0.2 && score[3].outcome === 'selfish', `自留 2 颗被判失败（${score[3].score} / ${score[3].outcome}）`);
note(score[1].outcome === 'miss', `没打听就盲给 → 漏掉最需要的人（${score[1].outcome}）`);

/* ══════════ C. 真点击 + 契约（注入备名单，0 次调用）══════════ */
console.log('\n=== C. reduced-motion 下真点击 + 契约（0 次调用）===');
const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await gotoLabReady(page2);
const tPlay = Date.now();
await page2.evaluate(async () => {
  const m = await import('/js/minigames-candy.js');
  document.getElementById('board-body').innerHTML = '<div id="t-host"></div>';
  window.__op = m.runCandyShare(document.getElementById('t-host'),
    { id: 'candy-share', faces: m.FALLBACK_FACES, noReview: true });
});
await page2.waitForFunction(() => document.querySelector('#t-host')?.dataset?.miniState === 'play', null, { timeout: 8000 });
// 这一条是这轮改动的核心验收：**开局不等模型**。名单是固定的，进 play 应该是毫秒级。
const playMs = Date.now() - tPlay;
note(playMs < 1500, `注入 → 可操作只用了 ${playMs} ms（原先要等模型现编五个人，实测 60 秒上下）`);
const con = await page2.evaluate(() => {
  const el = document.querySelector('#t-host');
  const bb = document.getElementById('board-body').getBoundingClientRect();
  return {
    mini: el.dataset.mini, state: el.dataset.miniState,
    acts: el.querySelectorAll('[data-mini-action]').length,
    from: el.dataset.miniFacesFrom,
    faces: el.querySelectorAll('.smini6-face').length,
    board: { y: Math.round(bb.top), h: Math.round(bb.height), vh: window.innerHeight },
    cards: [...el.querySelectorAll('.smini6-face')].map((c) => {
      const r = c.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { ok: !!(hit && (c.contains(hit) || hit === c)), y: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) };
    }),
  };
});
note(con.mini === 'candy-share', `host[data-mini] = ${con.mini}`);
note(con.state === 'play', `host[data-mini-state] = ${con.state}`);
note(con.acts >= 10, `[data-mini-action] = ${con.acts} 个（5 张卡 × 问/给 + 收好 + 收场）`);
note(con.from === 'injected', `注入的名单被识别为 ${con.from}（固定池是 pool，注入是 injected —— 分开记账）`);
const cardHit = con.cards;
note(cardHit.every((c) => c.ok), `5 张卡在 reduced-motion 下都点得中（${cardHit.filter((c) => c.ok).length}/5）`);
if (!cardHit.every((c) => c.ok)) {
  console.log(`      板身 y=${con.board.y} 高 ${con.board.h} 视口 ${con.board.vh}　`
    + `卡片 y/底：${cardHit.map((c) => `${c.y}/${c.b}`).join('  ')}`);
}

// 真点击：走近一个看得见的人 → 打听次数应该 -1
await page2.locator('#t-host .smini6-face button[data-mini-action="ask"]').first().click({ timeout: 8000 });
let afterAsk = await page2.evaluate(() => {
  const el = document.querySelector('#t-host');
  return { left: Number(el.dataset.miniAsksLeft), asked: el.dataset.miniAsked, known: !!el.querySelector('.smini6-face.known') };
});
note(afterAsk.left === 1 && afterAsk.asked.length > 0 && afterAsk.known, `点"走近看看" → 打听剩 ${afterAsk.left} 次，问过「${afterAsk.asked}」，里子翻出来了`);

// 真点击：给一颗
await page2.locator('#t-host .smini6-face button[data-mini-action="give"]').first().click({ timeout: 8000 });
let afterGive = await page2.evaluate(() => {
  const el = document.querySelector('#t-host');
  return { candies: Number(el.dataset.miniCandies), given: el.dataset.miniGiven };
});
note(afterGive.candies === 2 && afterGive.given !== '一颗没给', `点"给一颗" → 糖剩 ${afterGive.candies}，${afterGive.given}`);

// 真点击：收场
await page2.locator('#t-host button[data-mini-action="keep"]').click({ timeout: 8000 });
await page2.locator('#t-host button[data-mini-action="confirm"]').click({ timeout: 8000 });
const done = await page2.waitForFunction(() => document.querySelector('#t-host')?.dataset?.miniState === 'done', null, { timeout: 8000 });
note(!!done, '点"剩下的自己收好" → "这一夜就这样" → 状态走到 done');
const res = await page2.evaluate(() => window.__op);
note(res?.detail?.outcome === 'selfish' && res.score <= 0.2,
  `收场结果：分 ${res.score}　结局 ${res.detail.outcome}　自留 ${res.detail.selfKept} 颗（把 2 颗都收了）`);

/* ══════════ C2. AI 只有 10 秒机会：慢就固定，快就用它 ══════════
   这是本轮改动的核心口径，也是用户定的：**AI 不许让玩家等；超过 10 秒就用固定内容。**
   用两个假接口分别演"慢"和"快"：
     · 慢（12 秒 > 10 秒窗口）：结算 1 秒内出来，判词是**固定文本**，12 秒后仍是固定文本；
     · 快（4 秒 < 10 秒窗口）：结算同样 1 秒内出来，4 秒后判词被**模型那版替换**。
   两条都要测：只测一条的话，"永远不用模型"和"永远等模型"都能蒙过去。

   纪律提醒：写完这条之后要**临时把 10 秒窗口去掉**（或把结算改回等模型）跑一遍，
   确认它真的会红 —— 否则它可能只是恰好为绿，等于没写。 */
console.log('\n=== C2. AI 只有 10 秒机会（假接口对照：慢 12s / 快 4s，0 次真调用）===');
const SLOW_MS = 12000, FAST_MS = 4000;
const windowMs = await page.evaluate(async () => (await import('/js/minigames-candy.js')).AI_WINDOW_MS);
console.log(`  玩法声明的窗口 = ${windowMs} ms；对照用的假接口 = 慢 ${SLOW_MS} ms / 快 ${FAST_MS} ms`);

async function fakeApiPage(delayMs) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await p.addInitScript((delay) => {
    const orig = window.fetch;
    window.fetch = async (url, init) => {
      if (String(url).includes('/api/decide')) {
        await new Promise((r) => setTimeout(r, delay));
        return new Response(JSON.stringify({
          ok: true, source: 'FAKE',
          result: {
            effects: { 士气: 1 }, choice: '假接口的结论行', reason: '假接口',
            narrative: '假接口的判词到了。', late_line: '',
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return orig(url, init);
    };
  }, delayMs);
  await p.goto(LAB, { waitUntil: 'load' });
  await p.waitForFunction(() => !!document.getElementById('mini-host'), null, { timeout: 20000 }).catch(() => {});
  return p;
}

async function playToSettle(p, hostId) {
  await p.evaluate(async (id) => {
    const m = await import('/js/minigames-candy.js');
    document.getElementById('board-body').innerHTML = `<div id="${id}"></div>`;
    window.__res = m.runCandyShare(document.getElementById(id), { id: 'candy-share', faces: m.FALLBACK_FACES });
  }, hostId);
  await p.waitForFunction((id) => document.querySelector(`#${id}`)?.dataset?.miniState === 'play', hostId, { timeout: 8000 });
  await p.locator(`#${hostId} .smini6-face button[data-mini-action="give"]`).first().click({ timeout: 8000 });
  const t = Date.now();
  await p.locator(`#${hostId} button[data-mini-action="confirm"]`).click({ timeout: 8000 });
  await p.waitForFunction((id) => document.querySelector(`#${id}`)?.dataset?.miniState === 'done', hostId, { timeout: 20000 });
  const settleMs = Date.now() - t;
  await p.evaluate(async () => { window.__d = (await window.__res).detail; });   // 已 resolve，瞬时
  const early = await p.evaluate((id) => ({
    resline: document.querySelector(`#${id} .smini6-resline`)?.textContent || '',
    judgeText: document.querySelector(`#${id} .smini6-judgeline`)?.textContent || '',
    judgeFrom: window.__d?.judgeFrom, aiPending: window.__d?.aiPending, judge: window.__d?.judge || '',
  }), hostId);
  return { settleMs, early, p };
}
const sawFake = (p, id, ms) => p.waitForFunction(
  (hid) => (document.querySelector(`#${hid} .smini6-judgeline`)?.textContent || '').includes('假接口'),
  id, { timeout: ms }).then(() => true).catch(() => false);

// ── C2a 慢：必须落到固定判词，且不许让玩家等 ──
const pSlow = await fakeApiPage(SLOW_MS);
const A = await playToSettle(pSlow, 't3a-host');
note(A.settleMs < 1500, `[慢 ${SLOW_MS}ms] 点收场 → done 只用了 ${A.settleMs} ms（假接口要 12 秒，说明**结算没在等它**）`);
note(/你把糖分了/.test(A.early.resline), `[慢] 结果行当场就有内容：「${A.early.resline}」`);
note(A.early.judgeFrom === 'fixed' && A.early.judge.length > 10,
  `[慢] 判词当场是**固定文本**（不是空白、不是"正在写"）：「${A.early.judge.slice(0, 26)}…」`);
note(A.early.aiPending === true, '[慢] aiPending=true —— 10 秒窗口还开着，接线方知道可能还有一次 onShare');
note(A.early.judgeText.length > 10, '[慢] 那行判词**真的画到屏幕上**了（不是只在 detail 里）');
const slowLate = await sawFake(pSlow, 't3a-host', SLOW_MS + 5000);
note(!slowLate, `[慢] 等到第 ${(SLOW_MS + 5000) / 1000} 秒，屏幕上**仍然是固定判词** —— 那次调用在第 ${windowMs / 1000} 秒被掐断，没有迟到覆盖`);
await pSlow.close();

// ── C2b 快：模型那版要能顶掉固定判词 ──
const pFast = await fakeApiPage(FAST_MS);
const B = await playToSettle(pFast, 't3b-host');
note(B.settleMs < 1500, `[快 ${FAST_MS}ms] 点收场 → done 只用了 ${B.settleMs} ms（同样一秒不等）`);
note(B.early.judgeFrom === 'fixed', `[快] 头一眼也是固定判词（${B.early.judgeFrom}）—— 内容是满的，不是空的`);
const fastLate = await sawFake(pFast, 't3b-host', FAST_MS + 6000);
note(fastLate, '[快] 4 秒后判词被**模型那版**顶掉了 —— "能快就用"成立');
const bDetail = await pFast.evaluate(() => window.__d);
note(bDetail?.judgeFrom === 'model' && bDetail?.aiPending === false && Object.keys(bDetail?.effects || {}).length > 0,
  `[快] detail 被补齐：judgeFrom=${bDetail?.judgeFrom}　effects=${JSON.stringify(bDetail?.effects || {})}`);
await pFast.close();

/* ══════════ D. 【--raw】真模型两条短时刻的真实耗时（2 次不掐断的调用）══════════
   这一节的**主要产出是那两个毫秒数**：它们是"为什么这个玩法必须有固定内容"的证据
   （2026-09-15 实测：28 个字的开场也要 38 秒，判词 53–64 秒）。
   成本高（两条都不掐断，约 100–180 秒），所以**只在需要引用耗时数据时**用 `--raw` 跑。
   日常快检用默认（A/B/C/C2），交付验收用 `--live`（真网关端到端，见 E 段）。 */
const RAW = process.argv.includes('--raw');
if (!RAW) {
  console.log('\n=== D. 已跳过（原始耗时：加 --raw 跑）===');
} else {
console.log('\n=== D. 真模型：开场一句 + 收尾判词的真实耗时（2 次调用）===');

// Node 侧直连，不经过被挡过的页面 fetch
const callModel = async (body) => {
  const t = Date.now();
  const res = await fetch('http://localhost:3001/api/decide', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await res.json();
  return { ms: Date.now() - t, http: res.status, source: j?.source || '',
    err: String(j?.error || '').slice(0, 160), result: j?.result ?? null };
};

// ── D1 开场一句氛围（candy_scene）：客户端非阻塞地等它，但它本身也必须是短的 ──
const d1 = await callModel({
  callType: 'candy_scene', scene: '分糖 · 草地',
  situation: '今天做过的事：钓上一条半斤的鱼；在沼泽里陷过一次；把小号手从泥里拽出来',
  state: { 体力: 46, 粮食: 1, 士气: 58, 信念: 78 },
});
console.log(`  D1 candy_scene　${d1.ms} ms　http ${d1.http}　source=${d1.source || '-'}`);
if (d1.err) console.log(`      错误：${d1.err}`);
const scene = String(d1.result?.scene || '').trim();
note(!!scene, `开场那句回来了：「${scene}」（非阻塞：回不来就用作者写的那句，不拦操作）`);
note(d1.result && d1.result.faces === undefined, '开场这条**不再编人**（faces 已从契约里撤掉，五个人固定）');
// 这里**故意不设"必须多快"的断言**：这条是"有 10 秒就用"的那一类，慢一点都不影响玩。
// 真正该守的是"开局不等它"（C 段）和"超过窗口就落到固定内容"（C2a）。
console.log(`     （真实耗时 ${d1.ms} ms；客户端窗口只有 ${windowMs} ms，所以这一条在真实游玩里基本会被掐断，玩家看到的是作者那句）`);

// ── D2 收尾判词（share_judge）：玩家真正会等的那一条，必须短且可用 ──
const demo = await page.evaluate(async () => {
  const m = await import('/js/minigames-candy.js');
  const F = m.FALLBACK_FACES;
  const asked = [F[0].name];
  const given = { [F[0].name]: 1, [F[2].name]: 2 };
  return { faces: F, asked, given, g: m.gradeShare(F, asked, given, 0), summary: m.shareSummary(F, given, 0) };
});
const d2 = await callModel({
  callType: 'share_judge', scene: '分糖 · 草地',
  situation: `分糖：${demo.summary}；玩家花 1 顿口粮打听过 ${demo.asked.join('、')}；`
    + `最后照顾到 ${demo.g.covered.join('、') || '没人'}；最需要的那个${demo.g.missedTop ? '没拿到' : '拿到了'}`,
  state: { 体力: 46, 粮食: 1, 士气: 58, 信念: 78 },
  operation: { type: 'sugar', ...demo.g, given: demo.given, selfKept: 0, cost: 1, faces: demo.faces },
});
console.log(`  D2 share_judge　${d2.ms} ms　http ${d2.http}　source=${d2.source || '-'}`);
if (d2.err) console.log(`      错误：${d2.err}`);
const nar = String(d2.result?.narrative || '');
note(d2.http === 200 && !d2.err, `判词调用通了（http ${d2.http}${d2.err ? ` · ${d2.err}` : ''}）`);
note(!!nar, `判词：「${nar.slice(0, 64)}${nar.length > 64 ? '…' : ''}」`);
note(!!(d2.result?.effects && Object.keys(d2.result.effects).length), `effects 一起给了（${Object.keys(d2.result?.effects || {}).join('/') || '空'}）`);
// 同样不设上限：这条也是"有 10 秒就用"，慢只影响判词用不用模型那版。
console.log(`     （真实耗时 ${d2.ms} ms —— 远超 ${windowMs} ms 的窗口，所以真实游玩里判词就是作者写的那四句之一）`);
console.log(`  结论行：${d2.result?.choice || '（没给）'}`);
console.log(`  第二天那句：${d2.result?.late_line || '（这局没给 —— 最需要的人拿到了糖，可以不写）'}`);
}

/* ══════════ E. 【--live】真网关端到端：整条链在真模型下走一遍 ══════════
   C2 用假接口证明"窗口逻辑对不对"；这一节用**真网关**证明"整条链在真实延迟下不崩"。
   四件事一起验：开局不等模型、收场不等模型、判词当场是固定文本、13 秒后仍是同一段
   （那次真调用在第 10 秒被客户端掐断）。
   约 30 秒；2 次真调用会被掐断（服务端那两调仍会跑完并落日志，属预期）。 */
const LIVE = process.argv.includes('--live');
if (!LIVE) {
  console.log('\n=== E. 已跳过（真网关端到端：加 --live 跑）===');
} else {
console.log('\n=== E. 真网关端到端（--live）===');
const pl = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
// 只挡调试台自己的自动跑（否则它会真调模型）；之后放开，让我们注入的这一局走真网关
await pl.addInitScript(() => {
  const orig = window.fetch;
  let blocked = true;
  window.fetch = (url, init) => {
    if (blocked && String(url).includes('/api/decide')) {
      return Promise.resolve(new Response('{"ok":false,"error":"lab-autorun-blocked"}',
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return orig(url, init);
  };
  window.__unblock = () => { blocked = false; };
});
await pl.goto(LAB, { waitUntil: 'load' });
await pl.waitForFunction(() => !!document.getElementById('mini-host'), null, { timeout: 20000 }).catch(() => {});
await pl.waitForTimeout(1500);
await pl.evaluate(() => window.__unblock());

const tLivePlay = Date.now();
await pl.evaluate(async () => {
  const m = await import('/js/minigames-candy.js');
  document.getElementById('board-body').innerHTML = '<div id="live-host"></div>';
  window.__res = m.runCandyShare(document.getElementById('live-host'), { id: 'candy-share', faces: m.FALLBACK_FACES });
});
await pl.waitForFunction(() => document.querySelector('#live-host')?.dataset?.miniState === 'play', null, { timeout: 8000 });
note(Date.now() - tLivePlay < 1500, `真网关：注入 → 可操作 ${Date.now() - tLivePlay} ms（名单固定，不等模型）`);

await pl.locator('#live-host .smini6-face button[data-mini-action="ask"]').first().click({ timeout: 8000 });
await pl.locator('#live-host .smini6-face button[data-mini-action="give"]').first().click({ timeout: 8000 });
await pl.locator('#live-host .smini6-face button[data-mini-action="give"]').nth(2).click({ timeout: 8000 });
const tLiveSettle = Date.now();
await pl.locator('#live-host button[data-mini-action="confirm"]').click({ timeout: 8000 });
await pl.waitForFunction(() => document.querySelector('#live-host')?.dataset?.miniState === 'done', null, { timeout: 20000 });
note(Date.now() - tLiveSettle < 1500, `真网关：点收场 → done ${Date.now() - tLiveSettle} ms（不等模型）`);

await pl.evaluate(async () => { window.__d = (await window.__res).detail; });
const liveEarly = await pl.evaluate(() => ({
  res: document.querySelector('#live-host .smini6-resline')?.textContent || '',
  judge: document.querySelector('#live-host .smini6-judgeline')?.textContent || '',
  from: window.__d?.judgeFrom, pending: window.__d?.aiPending, outcome: window.__d?.outcome,
}));
note(/你把糖分了/.test(liveEarly.res), `真网关：结果行当场就有：「${liveEarly.res}」`);
note(liveEarly.from === 'fixed' && liveEarly.judge.length > 10,
  `真网关：判词当场是固定文本：「${liveEarly.judge.slice(0, 26)}…」`);
note(liveEarly.pending === true, '真网关：10 秒窗口还开着（aiPending=true）');
console.log('     …… 等 13 秒，看那次真调用会不会迟到覆盖 ……');
await pl.waitForTimeout(13000);
const liveLate = await pl.evaluate(() => ({
  judge: document.querySelector('#live-host .smini6-judgeline')?.textContent || '',
  from: window.__d?.judgeFrom,
}));
note(liveLate.from === 'fixed' && liveLate.judge === liveEarly.judge,
  `真网关：13 秒后仍是同一段固定判词（judgeFrom=${liveLate.from}）—— 真调用在第 ${windowMs / 1000} 秒被掐断`);
console.log(`     （本局结局 ${liveEarly.outcome}；本次真调用会留在 logs 里，属预期）`);
await pl.close();
}

console.log(`\n=== 汇总：${bad === 0 ? '全绿' : `${bad} 条不通过`} ===`);
// ⚠️ 不要 `await browser.close()`：无头 chromium 偶发关不干净，进程会**挂着不退出** ——
// 输出早就打完了（连"全绿"都在），外面却看着像跑了 8 分钟没完，只能手动杀。
// 直接 process.exit 收工，浏览器进程交给系统回收。
browser.close().catch(() => {});
process.exit(bad === 0 ? 0 : 1);
