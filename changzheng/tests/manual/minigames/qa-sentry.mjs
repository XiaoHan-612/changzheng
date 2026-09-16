/**
 * 《夜岗 · 五个信号》专项快检 —— 只跑这支玩法，不碰全量套件。
 *
 * 四段，**全程 0 次真调用**（这支玩法游戏内就 0 次模型调用，见文件头「接不接 AI」）：
 *   A. 排局与闸：每条信号恰好一个正确项；**两条"拿不准"的信号在两个真值下正确答案落在不同选项上**
 *      （否则就是支配解，等于把决策点取消了）；400 局里正确答案的位置覆盖 0/1/2 且不含三连
 *      —— 这一条直接对着旧版那个"五个信号正确答案全在中间"的病根。
 *   B. 计分 gradeWatch：六种打法必须分出档 —— 这是"决策有没有分叉"的证据。含两条失败线。
 *   C. 真点击：reduced-motion 下不打 force 点得动吗 + 契约四项 + **一次 /api/decide 都没发**。
 *   D. 视觉：把方位盘光栅化，**按"像素落在哪个扇区的角度里"分类** ——
 *      "看见的位置 = 判定的位置"最直接的证据，带四路对照组 + 一条故意错配的反证。
 *
 * 用法：先起服务 node server/index.js，然后
 *   node tests/manual/qa-sentry.mjs
 * 全程约 40 秒。**照例后台跑**（本机 bash 前台上限约 120 秒，超了被 SIGTERM 且日志是空的）。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXE = [
  process.env.CHROME_PATH,
  (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const LAB = 'http://localhost:3001/dev/minigame-lab.html';
const MOD = '/js/minigames-sentry.js';
const OUT = path.join('tests', 'e2e', 'artifacts', 'sentry-watch');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let bad = 0;
const note = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? '✓' : '✗'} ${line}`); };

/* 调试台一打开就**自动跑列表第一个玩法**，那一支会真调模型（一次 20–40 秒）。
   这里不但把 /api/decide 挡掉，还**数它被调了几次** —— 数出来是后面 C 段的主证据：
   整个夜岗一局跑完，这个计数一次都不该涨。 */
async function prepare(p) {
  await p.addInitScript(() => {
    window.__decideHits = 0;
    const orig = window.fetch;
    window.fetch = (url, init) => {
      if (String(url).includes('/api/decide')) {
        window.__decideHits += 1;
        return Promise.resolve(new Response('{"ok":false,"source":"BLOCKED"}',
          { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(url, init);
    };
  });
  await p.goto(LAB, { waitUntil: 'load' });
  // 调试台的 select() 在 load 之后才跑（模块里有多个 await），它会把 board-body 清空。
  // 不等它装完就注入，注入的容器会被当场删掉 —— 表现是"按钮解析到了却被 detach"。
  await p.waitForFunction(() => !!document.getElementById('mini-host'), null, { timeout: 20000 }).catch(() => {});
}

/* ══════════ A：排局与闸（纯函数，在页面里 import，避开 Node 侧没有 DOM）══════════ */
console.log('\n=== A. 排局与内容闸（0 次调用）===');
const page = await browser.newPage();
await prepare(page);

const shape = await page.evaluate(async () => {
  const m = await import('/js/minigames-sentry.js');

  // A1 信号表本身的形状。
  // ⚠️ "恰好一个正确项"必须**逐真值**量。第一版这里写成"tier 里出现过 right 就算一个"，
  //   于是两条"拿不准"的信号各被算成 2 个 —— 报了两条假红。
  //   （按项目里的老规矩：断言报红先怀疑断言自己。）
  const cnt = (s, truth) => s.options.filter((o) => {
    const t = o.tier;
    if (typeof t === 'string') return t === 'right';
    return t[truth] === 'right';
  }).length;
  const table = m.SIGNALS.map((s) => ({
    id: s.id, type: s.type, n: s.options.length, open: !!s.open,
    rThreat: cnt(s, 'threat'), rHarmless: cnt(s, 'harmless'),
  }));

  // A1 的反证：这条度量到底能不能检出问题 —— 改掉一个正确项 / 全改成正确项，两个方向都要动。
  const probe = (() => {
    const s = m.SIGNALS.find((x) => x.id === 'step');
    const hit = (list) => list.filter((o) => (typeof o.tier === 'string' ? o.tier === 'right' : o.tier.threat === 'right')).length;
    const killed = s.options.map((o, i) => (i === 0 ? { ...o, tier: { threat: 'over', harmless: 'over' } } : o));
    const doubled = s.options.map((o) => ({ ...o, tier: { threat: 'right', harmless: 'right' } }));
    return { before: hit(s.options), killed: hit(killed), doubled: hit(doubled) };
  })();

  // A2 两条"拿不准"的信号：两个真值下正确答案必须落在不同选项上
  const openFlip = [];
  for (const id of ['ember', 'hush']) {
    const base = m.SIGNALS.find((s) => s.id === id);
    const at = (truth) => base.options
      .map((o, i) => ({ i, t: o.tier[truth] }))
      .filter((x) => x.t === 'right').map((x) => x.i).join(',');
    openFlip.push({ id, threat: at('threat'), harmless: at('harmless'), flip: at('threat') !== at('harmless') });
  }

  // A3 400 局的正确答案位置分布
  const pos = [0, 0, 0];
  let threeInARow = 0;
  const seqs = [];
  for (let k = 0; k < 400; k += 1) {
    const plan = m.planRun({ rnd: m.mulberry32(1000 + k), password: '瑞金' });
    const idxs = plan.map((e) => e.options.findIndex((o) => o.tier === 'right'));
    idxs.forEach((v) => { pos[v] += 1; });
    for (let i = 2; i < idxs.length; i += 1) if (idxs[i] === idxs[i - 1] && idxs[i - 1] === idxs[i - 2]) threeInARow += 1;
    if (k < 3) seqs.push(idxs.join(''));
    // 每条信号必须恰好一个正确项
    if (plan.some((e) => e.options.filter((o) => o.tier === 'right').length !== 1)) return { fatal: '有信号不是恰好一个 right' };
  }

  // A4 patternOk 的**反证能力**：旧版那种形状必须被判非法
  const patternProbe = {
    oldBug: m.patternOk([1, 1, 1, 1, 1]),     // 旧版：五个全在中间 → 必须 false
    onlyTwo: m.patternOk([0, 1, 0, 1, 0]),    // 只用了两个位置 → 必须 false
    legits: [m.patternOk([0, 1, 2, 1, 0]), m.patternOk([2, 0, 1, 0, 2])],
    outOfRange: m.patternOk([0, 1, 3, 0, 1]), // 越界 → 必须 false
  };

  // A5 gatePlan：注入的局也得过闸
  const good = m.planRun({ rnd: m.mulberry32(7), password: '瑞金' });
  const clone = () => JSON.parse(JSON.stringify(good));
  const b1 = clone(); b1[1].options[1].tier = 'right';                  // 两个正确项
  const b2 = clone(); b2.pop();                                        // 少一个信号
  const b3 = clone(); b3[0].options[0].tier = 'banana';                // 非法档
  const b4 = clone(); b4[2].options.forEach((o) => { o.tier = 'right'; }); // 全是正确项
  const b5 = clone(); b5[0].options.forEach((o) => { o.tier = 'over'; });  // 没有正确项
  const b6 = clone(); b6[0].sector = '天花板上';                        // 方位不认识
  // 病根复现：把正确答案全塞到 index 1，必须被拦
  const b7 = clone();
  for (const ev of b7) {
    const r = ev.options.findIndex((o) => o.tier === 'right');
    [ev.options[1], ev.options[r]] = [ev.options[r], ev.options[1]];
    if (ev.options[1].tier !== 'right') return { fatal: '构造 b7 失败' };
  }

  // A6 资源是非对称的（漏比惊动更致命）
  const limits = { exp: m.EXP_LIMIT, miss: m.MISS_LIMIT, lamp: m.LAMP_TOTAL, n: m.TOTAL_SIGNALS };

  return {
    table, openFlip, pos, threeInARow, seqs, patternProbe, limits, probe,
    gates: {
      good: !!m.gatePlan(good), b1: !!m.gatePlan(b1), b2: !!m.gatePlan(b2),
      b3: !!m.gatePlan(b3), b4: !!m.gatePlan(b4), b5: !!m.gatePlan(b5), b6: !!m.gatePlan(b6), b7: !!m.gatePlan(b7),
    },
  };
});
if (shape.fatal) { console.log(`  ✗ 致命：${shape.fatal}`); bad += 1; }

for (const s of shape.table) {
  const label = `${s.type}（${s.id}）${s.open ? ' · 拿不准' : ''}`;
  if (s.id === 'password') {
    console.log(`  · 口令（password）　选项由运行时按"有没有学过口令"装配（见 A1b）`);
  } else if (s.open) {
    note(s.n === 3 && s.rThreat === 1 && s.rHarmless === 1,
      `${label}　三个选项；两个真值下**各**恰好一个正确项 → threat ${s.rThreat} 个 / harmless ${s.rHarmless} 个`);
  } else {
    note(s.n === 3 && s.rThreat === 1 && s.rHarmless === 1,
      `${label}　三个选项、恰好一个正确项 → ${Math.max(s.rThreat, s.rHarmless)} 个 / ${s.n} 项`);
  }
}
console.log('\n  —— A1b 口令题的两种题面（同一信号的两种装法）——');
const pwCheck = await page.evaluate(async () => {
  const m = await import('/js/minigames-sentry.js');
  const mk = (password) => m.planRun({ rnd: m.mulberry32(3), password }).find((e) => e.id === 'password');
  const k = mk('瑞金');
  const u = mk('');
  return {
    known: { hear: k.hear.slice(0, 34), read: (k.read || '').slice(0, 20), rights: k.options.filter((o) => o.tier === 'right').length, label: k.options.find((o) => o.tier === 'right').label },
    unknown: { hear: u.hear.slice(0, 34), read: (u.read || '').slice(0, 20), rights: u.options.filter((o) => o.tier === 'right').length, label: u.options.find((o) => o.tier === 'right').label },
  };
});
note(pwCheck.known.rights === 1 && pwCheck.unknown.rights === 1, '学过 / 没学过，两种题面各自恰好一个正确项');
note(/瑞金/.test(pwCheck.known.hear), `学过口令 → 题面把口令喂进来了：「${pwCheck.known.hear}…」`);
note(!/瑞金/.test(pwCheck.unknown.hear) && /口令/.test(pwCheck.unknown.hear), `没学过 → 题面是空的：「${pwCheck.unknown.hear}…」`);
console.log(`      学过时的正确处置：「${pwCheck.known.label}」`);
console.log(`      没学过时的正确处置：「${pwCheck.unknown.label}」`);

console.log('\n  —— A1c "恰好一个正确项"这条度量的反证 ——');
note(shape.probe.before === 1 && shape.probe.killed === 0 && shape.probe.doubled === 3,
  `把一个正确项改成 over → 计数 ${shape.probe.before} → ${shape.probe.killed}；全改成正确项 → ${shape.probe.doubled}（两个方向都能检出）`);

console.log('\n  —— A2 两条"拿不准"的信号：没有支配解 ——');
for (const f of shape.openFlip) {
  note(f.flip, `${f.id}：真值 threat 时正确项在 ${f.threat}，harmless 时在 ${f.harmless} —— **换了一个**，不存在"永远选那个"`);
}

console.log('\n  —— A3 400 局的正确答案位置分布（这一条对着旧版的病根）——');
const total = shape.pos.reduce((a, b) => a + b, 0);
note(shape.pos.every((v) => v > total * 0.2),
  `位置 0/1/2 各被用过 ${shape.pos.join(' / ')} 次（共 ${total} 次，最少的也占 ${(Math.min(...shape.pos) / total * 100).toFixed(0)}%）`);
note(shape.threeInARow === 0, `连续三次落在同一位置的次数 = ${shape.threeInARow}（必须 0）`);
console.log(`      前三局的正确项位置：${shape.seqs.join('  |  ')}`);

console.log('\n  —— A4 patternOk 的反证能力（这条检查本身会不会红）——');
note(shape.patternProbe.oldBug === false, '旧版的形状 [1,1,1,1,1]（五个全在中间）被判**非法** —— 检查有检出能力');
note(shape.patternProbe.onlyTwo === false, '只用了两个位置 [0,1,0,1,0] 被判非法');
note(shape.patternProbe.outOfRange === false, '位置越界 [0,1,3,0,1] 被判非法');
note(shape.patternProbe.legits.every(Boolean), '两条合法形状都能过');

console.log('\n  —— A5 gatePlan：注入的局也得过闸 ——');
note(shape.gates.good, 'planRun 排出来的局过闸');
note(!shape.gates.b1, '两个正确项 → 拦住');
note(!shape.gates.b2, '少一个信号 → 拦住');
note(!shape.gates.b3, '出现非法档位 → 拦住');
note(!shape.gates.b4, '三项全是正确项 → 拦住');
note(!shape.gates.b5, '一个正确项都没有 → 拦住');
note(!shape.gates.b6, '方位不认识 → 拦住');
note(!shape.gates.b7, '★ **把正确答案全塞到 index 1（旧版病根）→ 拦住**');

console.log('\n  —— A6 资源上限 ——');
note(shape.limits.exp > shape.limits.miss,
  `惊动上限 ${shape.limits.exp} > 漏上限 ${shape.limits.miss} —— **漏比误报更致命**，"一路保守"的路更短`);
note(shape.limits.lamp === 1, `马灯 ${shape.limits.lamp} 盏 / ${shape.limits.n} 个信号 —— 确定性是稀缺的，不是预算`);

/* ══════════ B：六种打法（固定一局，0 次调用）══════════ */
console.log('\n=== B. 计分 gradeWatch：六种打法（固定一局，0 次调用）===');
const strat = await page.evaluate(async () => {
  const m = await import('/js/minigames-sentry.js');
  const plan = m.planRun({ rnd: m.mulberry32(4242), password: '瑞金' });
  const at = (want) => plan.map((ev) => {
    const i = ev.options.findIndex((o) => o.tier === want);
    return i >= 0 ? i : ev.options.findIndex((o) => o.tier === 'right');
  });
  const rightByTier = at('right');
  const allOver = at('over');
  const allUnder = at('under');
  const lastOne = plan.map(() => 2);
  // "不举灯、只按线索读"：能读出来的照读，拿不准的两条按最坏打算（= 挑那个 label 最像升格处置的）
  const noLamp = plan.map((ev) => {
    if (!ev.open) return ev.options.findIndex((o) => o.tier === 'right');
    const i = ev.options.findIndex((o) => /按最坏的打算|摸过去|看清是谁/.test(o.label));
    return i >= 0 ? i : ev.options.findIndex((o) => o.tier === 'right');
  });
  // 灯用对了 + 另一条拿不准赌错：把那一条故意挪到错的一边
  const openIdx = plan.map((e, i) => (e.open ? i : -1)).filter((i) => i >= 0);
  const gambleLost = rightByTier.slice();
  const lost = openIdx[1];
  gambleLost[lost] = plan[lost].options.findIndex((o) => o.tier !== 'right');

  const runs = [
    ['S1 灯用在拿不准的那条 + 五处全判对（上界）', rightByTier, true],
    ['S2 灯用对了，但另一条拿不准赌错', gambleLost, true],
    ['S3 不举灯，只按线索读（拿不准的按最坏打算）', noLamp, false],
    ['S4 一路最重处置（拉栓/开枪/喊人/挪位）', allOver, false],
    ['S5 一路最轻处置（不管它/蹲回去）', allUnder, false],
    ['S6 不读内容，闭眼点最后一个', lastOne, false],
  ];
  const out = runs.map(([name, picks, lamp]) => {
    const g = m.gradeWatch(plan, picks, lamp);
    return { name, lamp, outcome: g.outcome, score: g.score, hits: g.hits, exp: g.exp, miss: g.miss };
  });
  return { out, truths: plan.map((e) => `${e.type}:${e.truth}`), order: plan.map((e) => e.options.findIndex((o) => o.tier === 'right')).join('') };
});
console.log(`  本局真值：${strat.truths.join('　')}`);
console.log(`  本局正确项位置：${strat.order}`);
for (const r of strat.out) {
  console.log(`  ${r.name}\n      分 ${r.score.toFixed(3)}　结局 ${r.outcome}　得当 ${r.hits}/5　惊动 ${r.exp}　漏 ${r.miss}　灯 ${r.lamp ? '举了' : '没举'}`);
}
const tiers = new Set(strat.out.map((r) => r.outcome));
note(tiers.size >= 4, `分出了 ${tiers.size} 档结局（${[...tiers].join(' / ')}）—— 决策真的分叉了`);
const S = (i) => strat.out[i];
note(S(0).outcome === 'clean' && S(0).score === 1, `最优打法 ${S(0).score}（${S(0).outcome}）—— 上界是 1.0`);
note(S(1).score < S(0).score && S(1).outcome === 'steady', `赌错那一条只掉一档：${S(1).score}（${S(1).outcome}）—— 惩罚是"掉一档"，不是"毁一局"`);
note(S(3).outcome === 'exposed' && S(3).score <= 0.25, `一路最重处置 → ${S(3).outcome} ${S(3).score}（惊动 ${S(3).exp} ≥ ${shape.limits.exp}）`);
note(S(4).outcome === 'breached' && S(4).score <= 0.3, `一路最轻处置 → ${S(4).outcome} ${S(4).score}（漏 ${S(4).miss} ≥ ${shape.limits.miss}）`);
note(S(3).outcome !== S(4).outcome, '两条懒路**结局不同** —— 惊动与漏不是同一个东西');
note(S(5).score < S(0).score - 0.2, `闭眼点最后一个 → ${S(5).score}（${S(5).outcome}），明显低于读得细的 ${S(0).score}`);
note(S(5).outcome !== 'clean', '闭眼点不可能拿到最好结局 —— 读内容是有回报的');

/* ══════════ C：真点击 + 契约（注入一局，0 次调用）══════════ */
console.log('\n=== C. reduced-motion 下真点击 + 契约（0 次调用）===');
const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', deviceScaleFactor: 2 });
await prepare(page2);

const hitsBefore = await page2.evaluate(() => window.__decideHits);
const tMount = Date.now();
await page2.evaluate(async ({ seed }) => {
  const m = await import('/js/minigames-sentry.js');
  const plan = m.planRun({ rnd: m.mulberry32(seed), password: '瑞金' });
  window.__plan = plan;
  document.getElementById('board-body').innerHTML = '<div id="t-host"></div>';
  window.__res = m.runNightWatch(document.getElementById('t-host'), { id: 'sentry-watch', plan, password: '瑞金' });
}, { seed: 99 });
await page2.waitForFunction(() => document.querySelector('#t-host')?.dataset?.miniState === 'play', null, { timeout: 8000 });
const playMs = Date.now() - tMount;
// 这支玩法游戏内**不该有任何模型调用**，所以"注入 → 可操作"应该是毫秒级
note(playMs < 1500, `注入 → 可操作只用了 ${playMs} ms（游戏内 0 次模型调用，没有可等的东西）`);

const con = await page2.evaluate(() => {
  const el = document.querySelector('#t-host');
  const bb = document.getElementById('board-body').getBoundingClientRect();
  const opts = [...el.querySelectorAll('[data-mini-action="answer"]')];
  return {
    mini: el.dataset.mini, state: el.dataset.miniState,
    acts: el.querySelectorAll('[data-mini-action]').length,
    from: el.dataset.miniPlanFrom, sig: el.dataset.miniSig,
    exp: el.dataset.miniExp, miss: el.dataset.miniMiss, lamp: el.dataset.miniLamp,
    sector: el.dataset.miniSector, open: el.dataset.miniOpen,
    dial: el.querySelectorAll('.smini7-dial svg').length,
    board: { y: Math.round(bb.top), h: Math.round(bb.height), vh: window.innerHeight },
    opts: opts.map((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { pick: b.dataset.miniPick, ok: !!(hit && (b.contains(hit) || hit === b)), y: Math.round(r.top), b: Math.round(r.bottom) };
    }),
  };
});
note(con.mini === 'sentry-watch', `host[data-mini] = ${con.mini}`);
note(con.state === 'play', `host[data-mini-state] = ${con.state}`);
note(con.acts >= 4, `[data-mini-action] = ${con.acts} 个（3 个处置 + 1 盏灯）`);
note(con.from === 'injected', `注入的局被识别为 ${con.from}（随机局是 random —— 分开记账）`);
note(con.dial === 1, `方位盘画出来了（svg ${con.dial} 个）`);
note(con.sector && ['front', 'right', 'back', 'left'].includes(con.sector), `观测量 miniSector = ${con.sector}，miniOpen = ${con.open}`);
note(con.exp === '0' && con.miss === '0' && con.lamp === '1', `开局资源：惊动 ${con.exp} / 漏 ${con.miss} / 灯 ${con.lamp}`);
note(con.opts.every((o) => o.ok), `三个处置键在 reduced-motion 下都点得中（${con.opts.filter((o) => o.ok).length}/3）`);
if (!con.opts.every((o) => o.ok)) {
  console.log(`      板身 y=${con.board.y} 高 ${con.board.h} 视口 ${con.board.vh}　选项 y/底：${con.opts.map((o) => `${o.y}/${o.b}`).join('  ')}`);
}

// 契约：不可操作的元素不能带 [data-mini-action]（方位盘的扇区是只读的）
const dialClean = await page2.evaluate(() => document.querySelectorAll('.smini7-dial [data-mini-action]').length);
note(dialClean === 0, `方位盘里没有 [data-mini-action]（只读元素不带操作标记）→ ${dialClean} 个`);

// 主视角落盘：玩家真正看到的画面（第 1 个信号 · 读得出来）
await (await page2.$('#t-host')).screenshot({ path: path.join(OUT, '03-play.png') });

// 真点击：举灯 → 惊动 +1、灯归零
await page2.locator('#t-host [data-mini-action="lamp"]').click({ timeout: 8000 });
const afterLamp = await page2.evaluate(() => {
  const el = document.querySelector('#t-host');
  return {
    exp: el.dataset.miniExp, lamp: el.dataset.miniLamp,
    btn: el.querySelector('[data-mini-action="lamp"]').disabled,
    lit: el.querySelectorAll('.smini7-dial svg circle[fill="#e8c073"]').length,
    heard: el.querySelector('.smini7-hear')?.textContent || '',
  };
});
note(afterLamp.exp === '1' && afterLamp.lamp === '0', `举灯 → 惊动 ${afterLamp.exp}、灯 ${afterLamp.lamp}（用掉就没了）`);
note(afterLamp.btn === true, '灯用过之后按钮禁用 —— 第二盏不存在');
note(/^照见了：/.test(afterLamp.heard), `灯把真值照出来了：「${afterLamp.heard.slice(0, 30)}…」`);
note(afterLamp.lit > 0, `方位盘切到"已照亮"配色（暖色源点 ${afterLamp.lit} 个）`);
await (await page2.$('#t-host')).screenshot({ path: path.join(OUT, '04-play-lit.png') });

// 真点击走完五题：每一题都要断言"选的就是我点的那一项"
const planFromPage = await page2.evaluate(() => window.__plan.map((e) => e.options.map((o) => ({ label: o.label, tier: o.tier }))));
const pickIdx = planFromPage.map((opts) => opts.findIndex((o) => o.tier === 'right'));   // 全判对
const seen = [];
for (let i = 0; i < pickIdx.length; i += 1) {
  const want = pickIdx[i];
  await page2.waitForFunction((n) => document.querySelector('#t-host')?.dataset?.miniSig === String(n), i, { timeout: 8000 });
  // 上一题的反馈必须**标了出处**再留在屏幕上（不然它贴着选项，看起来像在说当前这个信号）
  if (i >= 1) {
    const prevLine = await page2.evaluate(() => {
      const fb = document.querySelector('#t-host .smini7-fb');
      return { text: fb ? fb.textContent : '', cls: fb ? fb.className : '' };
    });
    const prevTier = planFromPage[i - 1][pickIdx[i - 1]].tier;
    note(/^上一个（/.test(prevLine.text) && prevLine.cls.includes(prevTier),
      `第 ${i + 1} 题的流水行标了出处：「${prevLine.text.slice(0, 26)}…」（档位 ${prevTier}）`);
  }
  // 第 2 题是"拿不准"的那一条 —— 这是这一版最要紧的新界面，单独落一张
  if (i === 1) await (await page2.$('#t-host')).screenshot({ path: path.join(OUT, '05-play-unclear.png') });
  await page2.locator(`#t-host [data-mini-action="answer"][data-mini-pick="${want}"]`).click({ timeout: 8000 });
  const got = await page2.evaluate(() => {
    const el = document.querySelector('#t-host');
    const taken = el.querySelector('.smini7-opt.taken');
    return {
      tier: el.dataset.miniLastTier, sig: el.dataset.miniSig,
      picked: taken ? taken.dataset.miniPick : null,
      pickedLabel: taken ? taken.textContent : null,
      marked: taken ? [...taken.classList] : [],
    };
  });
  seen.push({ i, want, ...got });
}
for (const s of seen) {
  note(s.picked === String(s.want) && s.tier === planFromPage[s.i][s.want].tier,
    `第 ${s.i + 1} 题：点了第 ${s.want} 项 → 标出来的就是它（pick=${s.picked}），档位 ${s.tier}，「${(s.pickedLabel || '').slice(0, 18)}」`);
}
await page2.waitForFunction(() => document.querySelector('#t-host')?.dataset?.miniState === 'done', null, { timeout: 10000 });
const fin = await page2.evaluate(async () => {
  const op = await window.__res;
  const el = document.querySelector('#t-host');
  return {
    outcome: el.dataset.miniOutcome, score: op.score, detail: op.detail,
    judge: el.querySelector('.smini7-judge')?.textContent || '',
    fb: el.querySelector('.smini7-fb')?.textContent || '',
    optsLeft: el.querySelectorAll('[data-mini-action]').length,
    decideHits: window.__decideHits,
  };
});
note(fin.outcome === 'clean' && fin.score === 1, `五题全判对 → 结局 ${fin.outcome}，分 ${fin.score}`);
note(fin.detail.hits === 5 && fin.detail.exp === 1 && fin.detail.lampUsed === true,
  `detail：得当 ${fin.detail.hits}/5　惊动 ${fin.detail.exp}（含灯那 1 点）　漏 ${fin.detail.miss}　灯 ${fin.detail.lampUsed ? '举了' : '没举'}`);
note(fin.detail.rows.length === 5 && fin.detail.rows.every((r) => r.tier === 'right'), '五题的逐条记录都在 detail.rows 里，档位全 right');
note(fin.judge.length > 20, `结算屏画出了判词：「${fin.judge.slice(0, 30)}…」`);
note(fin.optsLeft === 0, `结束后交互元素归零（${fin.optsLeft} 个）—— 不留可点的残骸`);
const decideDelta = fin.decideHits - hitsBefore;
note(decideDelta === 0, `★ 整局跑完，/api/decide 被调用 **${decideDelta}** 次 —— 游戏内 0 次模型调用`);
note(fin.detail.effects && Object.keys(fin.detail.effects).length === 0,
  '固定判词不编数值（detail.effects 是空的）—— 数值由主线那一次 minigame_review 给');

await page2.screenshot({ path: path.join(OUT, '01-board.png') });
const hostEl = await page2.$('#t-host');
if (hostEl) await hostEl.screenshot({ path: path.join(OUT, '02-host.png') });

/* ══════════ D：视觉 —— 看见的位置 = 判定的位置 ══════════ */
console.log('\n=== D. 方位盘：看见的位置 = 判定的位置（像素角度分类 + 四路对照）===');
const visual = await page.evaluate(async () => {
  const m = await import('/js/minigames-sentry.js');
  const S = 4;                       // viewBox 176 → 光栅 704
  const W = 176 * S;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = W;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const load = (svg) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('svg 光栅化失败'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const cx = W / 2; const cy = W / 2;
  const inWedge = (ang, a1, a2) => {
    const A1 = (a1 + 360) % 360; const A2 = (a2 + 360) % 360;
    const span = (A2 - A1 + 360) % 360;
    return ((ang - A1 + 360) % 360) <= span + 1.5;
  };
  const rows = [];
  const litRows = [];
  /**
   * 扫一张盘：按"每个像素离圆心多少度"分类，看它落不落在被点亮那个扇区的角度里。
   * @param lit   false = 冷态（涟漪是冷色）；true = 照亮态（涟漪是金色）
   *
   * 两种状态的色彩窗口都要**窄到只认目标元素**，两边各有一个坑：
   *   · 冷态：未激活扇区填充是 .045、激活扇区是 .20 —— 不带 alpha 会把整块扇形算成涟漪；
   *   · 照亮态：**中心那块类型字是 #f2d79a，跟金涟漪 #e8c073 同族**（r−b = 88 vs 117），
   *     窗口一宽就把它一起数进来 —— 它有一半笔画落在扇区外面，
   *     实测贡献 265–808 个假阳性，四条断言全红。所以窗口收到 r−b > 105，
   *     **并且**把圆心区排掉（见下面 dist 那条）。
   *   → 教训：同一个色族在不同状态下可能是不同的元素。窗口要按**具体元素**开，
   *     不能按"看起来是金色"开。
   */
  const scan = (sec, lit) => {
    const d = lastData;
    let total = 0; let inside = 0; let outside = 0; let mismatch = 0;
    const other = m.SECTORS[(m.SECTORS.indexOf(sec) + 2) % m.SECTORS.length];   // 对角那个扇区
    for (let y = 0; y < W; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4;
        const a = d[i + 3] / 255;
        if (a < 0.5) continue;                                        // ★ 硬条件，排除扇区填充
        const r = d[i]; const b = d[i + 2];
        const hit = lit ? (r - b > 105 && r > 200)                    // 金涟漪/源点 = #e8c073
          : (b - r > 25 && b > 200);                                  // 冷涟漪 = rgba(196,220,246,.60)
        if (!hit) continue;
        const dx = x - cx; const dy = y - cy;
        // 排掉圆心那块类型字。涟漪最内一道在 r = 34（viewBox 单位），
        // 类型字最远的角在 ~18 —— 取 22 两边都安全。
        if (Math.hypot(dx, dy) < 22 * S) continue;
        const ang = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;   // 0 = 正上，顺时针
        total += 1;
        if (inWedge(ang, sec.a1, sec.a2)) inside += 1;
        else outside += 1;
        if (inWedge(ang, other.a1, other.a2)) mismatch += 1;
      }
    }
    return { id: sec.id, label: sec.label, total, inside, outside, mismatch, other: other.label };
  };
  let lastData = null;
  for (const lit of [false, true]) {
    for (const sec of m.SECTORS) {
      g.clearRect(0, 0, W, W);
      const img = await load(m.dialMarkup(sec.id, '脚步', 3, lit));
      g.drawImage(img, 0, 0, W, W);
      lastData = g.getImageData(0, 0, W, W).data;
      (lit ? litRows : rows).push(scan(sec, lit));
    }
  }
  // 落两张特写：冷态（涟漪是冷色）与照亮态（暖色 + "已照亮"）。
  // **不走 Playwright 的元素截图** —— 那个要等"元素稳定"，实测在这里会 30 秒超时；
  // 而这里本来就是自己光栅出来的图，4× 下比元素截图还清楚。
  g.clearRect(0, 0, W, W);
  g.drawImage(await load(m.dialMarkup('left', '脚步', 3, false)), 0, 0, W, W);
  const pngCold = cv.toDataURL('image/png');
  g.clearRect(0, 0, W, W);
  g.drawImage(await load(m.dialMarkup('right', '光点', 1, true)), 0, 0, W, W);
  const pngLit = cv.toDataURL('image/png');
  return { rows, litRows, pngCold, pngLit };
});
for (const r of visual.rows) {
  // 冷态这条窗口（b−r > 25）顺带会数到**该扇区自己的标签** `#cfe0ef`（b−r = 32）——
  // 它本来就在这个扇区里，不可能造成假通过，但报出来的数要说实话：
  // 冷态 = 涟漪 + 源点 + 该扇区标签；照亮态 = 纯涟漪 + 源点（标签 #f2d79a 被 r−b > 105 挡掉了）。
  note(r.total > 200 && r.outside === 0,
    `[冷态] ${r.label}（${r.id}）被点亮时：冷色像素（涟漪+源点+本扇区标签）${r.total} 个，**${r.inside} 个落在本扇区角度内、${r.outside} 个落在外面**`);
}
for (const r of visual.litRows) {
  note(r.total > 200 && r.outside === 0,
    `[照亮] ${r.label}（${r.id}）：金色涟漪/源点像素 ${r.total} 个，**${r.inside} 个在本扇区角度内、${r.outside} 个在外面**`);
}
const anyMismatch = [...visual.rows, ...visual.litRows].reduce((s, r) => s + r.mismatch, 0);
note(anyMismatch === 0, `反证：拿对角扇区的角度去量同一张图 → 命中 ${anyMismatch} 个（必须 0）—— 说明这个度量真的能分辨方位`);
const bbox = await page.evaluate(() => {
  const svg = document.querySelector('#t-host .smini7-dial svg');
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
if (bbox) note(bbox.w > 100 && bbox.h > 100, `方位盘实际占位 ${bbox.w}×${bbox.h}（不是被压扁的示意图）`);
const writePng = (dataUrl, name) => {
  const b64 = String(dataUrl).split(',')[1] || '';
  const f = path.join(OUT, name);
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  return fs.statSync(f).size;
};
const s1 = writePng(visual.pngCold, '06-dial-cold.png');
const s2 = writePng(visual.pngLit, '07-dial-lit.png');
note(s1 > 3000 && s2 > 3000, `方位盘特写已落盘：06-dial-cold.png ${s1} B · 07-dial-lit.png ${s2} B（冷态 / 照亮态）`);

console.log(`\n=== 汇总：${bad === 0 ? '全绿' : `${bad} 条不通过`} ===`);
console.log(`截图：${OUT}/ 01-board · 02-host · 03-play · 04-play-lit · 05-play-unclear · 06-dial-cold · 07-dial-lit`);
// ⚠️ 不要 `await browser.close()`：无头 chromium 偶发关不干净，进程会**挂着不退出** ——
// 输出早就打完了（连"全绿"都在），外面却看着像跑了很久。直接 process.exit 收工。
browser.close().catch(() => {});
process.exit(bad === 0 ? 0 : 1);
