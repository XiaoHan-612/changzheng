// 逐页截图 + 联系表：把一批页面截成统一尺寸，拼成一张对照图，用于"逐页打磨"时比对风格。
//
// 用法：node tests/manual/screen-sheet.mjs [批次号 1-6] [--width 1280]
// 产物：tests/e2e/artifacts/screens/batch-<n>/<页名>.png 与 screen-sheet-<n>.png
//       非 1280 宽度加后缀：screens/batch-<n>-<宽>/ 与 screen-sheet-<n>-<宽>.png
// 交付口径是 1280/820 两档：1280 出联系表并写逐页纸面占比（qa:tone 只认它），
// 820 只出图（纸面占比在别的视口量出来会顶掉 1280 的记录，所以不写）。
import { chromium } from 'playwright';
import { ensureServer, BASE } from '../e2e/lib/server.mjs';
import { passOrigin } from '../e2e/lib/driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = path.join(ROOT, 'tests/e2e/artifacts');
const BATCH = Number(process.argv[2] || 1);
const wArg = process.argv.indexOf('--width');
const WIDTH = Number(wArg >= 0 ? process.argv[wArg + 1] : 0) || 1280;
const SUFFIX = WIDTH === 1280 ? '' : `-${WIDTH}`;
// 批次二以后要截深层屏（史实回响、岔路…），需要「展示开关」打开后才挂出的 __czScreens 钩子。
// 批次一是对玩家的门面，必须用默认状态截——否则会把"评委演示 / 模型署名"这些调试入口拍进交付图（踩过）。
const NEED_DEV_HOOK = BATCH >= 2;
const OUT = path.join(ART, 'screens', `batch-${BATCH}${SUFFIX}`);
fs.mkdirSync(OUT, { recursive: true });

/** 在实机页面上量纸面占比：视口内网格采样，判断该点是否落在纸面元素上 */
async function measurePaper(page) {
  return page.evaluate(() => {
    const PAPER = [[196, 183, 156], [211, 199, 171], [179, 166, 140]];   // paper-veil / paper-0 / paper-2
    const parse = (s) => {
      const m = /rgba?\(([^)]+)\)/.exec(s);
      if (!m) return null;
      const [r, g, b, a = '1'] = m[1].split(',').map((x) => parseFloat(x));
      return Number(a) < 0.5 ? null : [r, g, b];
    };
    const isPaper = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const rgb = parse(getComputedStyle(n).backgroundColor);
        if (rgb && PAPER.some(([r, g, b]) => Math.abs(rgb[0] - r) <= 4 && Math.abs(rgb[1] - g) <= 4 && Math.abs(rgb[2] - b) <= 4)) return true;
      }
      return false;
    };
    const W = window.innerWidth; const H = window.innerHeight;
    let hit = 0; let total = 0;
    for (let y = 4; y < H - 4; y += 8) {
      for (let x = 4; x < W - 4; x += 8) {
        total += 1;
        const el = document.elementFromPoint(x, y);
        if (el && isPaper(el)) hit += 1;
      }
    }
    return total ? hit / total : 0;
  });
}

/**
 * 等动画落定再截图。
 * 交付图拍到"动画中途"会被当成样式问题（实测过：#sheet 还在 sheet-rise 时纸面发虚、透明度 0.95）。
 * 无限循环的动画（余烬那类）不算在内，否则永远等不到。
 */
async function settle(page, timeout = 3000) {
  const t0 = Date.now();
  for (;;) {
    const running = await page.evaluate(() => document.getAnimations().filter((a) => {
      const it = a.effect?.getTiming?.().iterations;
      return a.playState === 'running' && it !== Infinity;
    }).length);
    if (!running) return true;
    if (Date.now() - t0 > timeout) return false;
    await page.waitForTimeout(80);
  }
}

/**
 * 每批要截的页面：{ name, setup }。setup 把页面摆到该屏，返回后立刻截图。
 *
 * 为什么是函数而不是"关键字 + if 链"：批次越往后页面越深（沙盘、终局、小游戏），
 * 关键字写法会让这个文件长成一坨 goto。函数式每条只管自己那一屏，互不干扰。
 */

/** 开局：标题 → 出身设定 → 过场 → 营地（后面所有屏都从这里出发） */
async function intoCamp(page) {
  await page.click('#btn-mode-study');
  await page.waitForTimeout(300);
  await passOrigin(page);
  await page.click('#btn-cut-skip').catch(() => {});
  await page.waitForTimeout(800);
}

/** 走一次营地热点，做到"选完 → 回响"这一步 */
async function intoEcho(page) {
  await page.locator('.hotspot').filter({ hasText: '浮桥' }).click({ force: true });
  await page.waitForTimeout(1200);
  await page.locator('#ch-opts .blk-choice').first().click({ force: true });
  for (let i = 0; i < 20; i++) {          // 等模型裁决 + 叙事打字
    if (await page.locator('#btn-continue').isVisible().catch(() => false)) break;
    await page.waitForTimeout(400);
  }
  await page.locator('#btn-continue').click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);
}

/**
 * 深层屏走不到时，用 __czScreens 直接把屏摆出来（内容仍走各屏自己的渲染）。
 * 浮层屏（overlay）由渲染函数自己 showOverlay——先 showScreen 会把底下的营地屏也一起藏掉。
 */
async function jump(page, id, prep, arg) {
  const ok = await page.evaluate(([id, prep, arg]) => {
    const api = window.__czScreens;
    if (!api) return false;
    const overlay = document.getElementById(id)?.classList.contains('overlay');
    if (overlay && prep && typeof api[prep] === 'function') api[prep](arg);
    else {
      api.show(id);
      if (prep && typeof api[prep] === 'function') api[prep](arg);
    }
    return true;
  }, [id, prep || '', arg ?? '']);
  if (!ok) throw new Error(`没有 __czScreens 钩子：把「设置 → 展示」打开后再截图（缺 ${id}）`);
  await page.waitForTimeout(400);
}

const BATCHES = {
  1: [
    { name: '01-title', setup: async (p) => { await p.waitForTimeout(300); } },
    { name: '02-how', setup: async (p) => { await p.click('#btn-how'); await p.waitForTimeout(400); } },
    {
      name: '03-settings',
      setup: async (p) => {
        await p.click('#btn-settings-close').catch(() => {});
        await p.click('#screen-how .btn, #btn-how-back').catch(() => {});
        await p.waitForTimeout(200);
        await p.click('#btn-settings2').catch(async () => { await p.click('#btn-settings'); });
        await p.waitForTimeout(400);
      },
    },
    {
      // 序章第一拍（题字）：点完模式就停在它上面，约 3.8s 后自己转下一拍
      name: '04-prologue-title',
      setup: async (p) => {
        await p.click('#btn-settings-close').catch(() => {});
        await p.waitForTimeout(150);
        await p.click('#btn-mode-study');
        await p.waitForTimeout(900);
      },
    },
    {
      // 序章第二拍（路线图）：等拍子自己走过去（不给点按，拍子本来就会自动播）
      name: '05-prologue-map',
      setup: async (p) => {
        await p.waitForTimeout(4200);        // 题字 3.8s + 一拍之隔
      },
    },
    {
      // 幕间过场：跳过序章与出身，停在第一幕的过场帧上（这一拍批 D 起也由 cinema 播）
      name: '06-act-cutscene',
      setup: async (p) => {
        await passOrigin(p);
        await p.waitForTimeout(700);
        await p.click('#btn-cut-next').catch(() => {});
        await p.waitForTimeout(400);
        await p.click('#btn-cut-next').catch(() => {});
        await p.waitForTimeout(300);
      },
    },
  ],
  2: [
    { name: '01-camp', setup: intoCamp },
    { name: '02-journal', setup: async (p) => { await jump(p, 'screen-journal', 'journal'); } },
    {
      name: '03-facts',
      setup: async (p) => {
        await p.click('#btn-journal-close').catch(() => {});
        await p.waitForTimeout(200);
        await jump(p, 'screen-facts', 'facts');
      },
    },
    {
      name: '04-echo',
      setup: async (p) => {
        await p.click('#btn-facts-close').catch(() => {});
        await p.waitForTimeout(300);
        await intoEcho(p);
      },
    },
    {
      name: '05-path',
      fresh: true,                          // 岔路屏不依赖局势，重开一页更省事（不用把回响流程走完）
      setup: async (p) => {
        await jump(p, 'screen-path', 'pathZones');
      },
    },
  ],
  3: [
    // 舞台屏三态共用 tpl-stage：交谈 → 抉择 → 裁决结果
    {
      name: '01-talk',
      setup: async (p) => {
        await intoCamp(p);
        await p.locator('.hotspot').filter({ hasText: '母亲' }).click({ force: true });
        for (let i = 0; i < 30; i++) {           // 等模型回话与"结束交谈"键
          if (await p.locator('[data-action="talk-end"]').count()) break;
          await p.waitForTimeout(400);
        }
      },
    },
    {
      name: '02-choice',
      setup: async (p) => {
        await p.locator('[data-action="talk-end"]').click({ force: true }).catch(() => {});
        await p.waitForTimeout(600);
        await p.locator('.hotspot').filter({ hasText: '浮桥' }).click({ force: true });
        for (let i = 0; i < 40; i++) {
          if (await p.locator('#ch-opts .blk-choice').count()) break;
          await p.waitForTimeout(400);
        }
      },
    },
    {
      name: '03-result',
      setup: async (p) => {
        await p.locator('#ch-opts .blk-choice').first().click({ force: true });
        for (let i = 0; i < 40; i++) {
          if (await p.locator('#btn-continue').count()) break;
          await p.waitForTimeout(400);
        }
        await p.waitForTimeout(500);             // 等把正文打完
      },
    },
    {
      name: '04-fire',
      setup: async (p) => {
        await p.click('#btn-continue', { force: true }).catch(() => {});   // 关掉回响，回到营地
        for (let i = 0; i < 20; i++) {
          if (await p.locator('#btn-echo-ok').count()) break;
          await p.waitForTimeout(300);
        }
        await p.click('#btn-echo-ok', { force: true }).catch(() => {});
        await p.waitForTimeout(600);
        await jump(p, 'screen-fire', 'fire');
      },
    },
  ],
  4: [
    // 玩法板五屏共用 tpl-board：都走 __czScreens.mini（玩法都在幕深处，跑一整幕太贵）
    { name: '01-bendhook', setup: async (p) => { await intoCamp(p); await jump(p, 'screen-board', 'mini', 'bendhook'); } },
    { name: '02-goldenhook', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'goldenhook'); } },
    { name: '03-nightschool', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'nightschool'); } },
    { name: '04-candy-share', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'candy-share'); } },
    { name: '05-sentry-watch', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'sentry-watch'); } },
    { name: '06-mud-gomoku', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'mud-gomoku'); } },
    { name: '07-luding-chain', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'luding-chain'); } },
    { name: '08-snow-grab', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'snow-grab'); } },
    { name: '09-pontoon-night', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'pontoon-night'); } },
    { name: '10-rally-river', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'rally-river'); } },
    { name: '02-fishing', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'fishing'); } },
    { name: '03-school', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'school'); } },
    { name: '04-candy', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'candy'); } },
    { name: '05-sentry', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'sentry'); } },
  ],
  5: [
    // 玩法板三屏（同一块板）
    { name: '01-gomoku', setup: async (p) => { await intoCamp(p); await jump(p, 'screen-board', 'mini', 'gomoku'); } },
    { name: '02-luding', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'luding'); } },
    { name: '03-grab', setup: async (p) => { await jump(p, 'screen-board', 'mini', 'grab'); } },
  ],
  6: [
    // 答题：同一次真实流程里取「出题」与「判分」两态（选项现在是 blk-choice，判分态 .correct/.wrong）
    {
      name: '01-quiz',
      setup: async (p) => {
        await intoCamp(p);
        await p.evaluate(() => window.__czScreens.quiz());
        for (let i = 0; i < 40; i++) {
          if (await p.locator('#quiz-opts .blk-choice').count()) break;
          await p.waitForTimeout(400);
        }
        await p.waitForTimeout(400);
      },
    },
    {
      name: '02-quiz-result',
      setup: async (p) => {
        await p.locator('#quiz-opts .blk-choice').first().click({ force: true });
        for (let i = 0; i < 60; i++) {              // 判分要 2–3 次真调
          if (await p.locator('#quiz-feedback').innerText().catch(() => '')) {
            if ((await p.locator('#btn-continue').count())) break;
          }
          await p.waitForTimeout(400);
        }
        await p.waitForTimeout(400);
      },
    },
    // 篝火夜：同样两态（模型出选项 → 选完写「当夜之后」）
    {
      name: '03-night',
      setup: async (p) => {
        await p.click('#btn-continue', { force: true }).catch(() => {});   // 关掉上一步的回响/继续
        for (let i = 0; i < 30; i++) {
          if (await p.locator('#btn-echo-ok').count()) { await p.click('#btn-echo-ok', { force: true }).catch(() => {}); }
          if (await p.locator('#screen-camp').isVisible().catch(() => false)) break;
          await p.waitForTimeout(300);
        }
        await p.evaluate(() => window.__czScreens.night());
        for (let i = 0; i < 40; i++) {
          if (await p.locator('#night-body .blk-choice').count()) break;
          await p.waitForTimeout(400);
        }
        await p.waitForTimeout(400);
      },
    },
    {
      name: '04-night-result',
      setup: async (p) => {
        await p.locator('#night-body .blk-choice').first().click({ force: true });
        for (let i = 0; i < 60; i++) {
          if (await p.locator('#night-out').innerText().catch(() => '')) break;
          await p.waitForTimeout(400);
        }
        await p.waitForTimeout(600);
      },
    },
    // 终局：真调 ending_review + study_report，等报告落盒
    {
      name: '05-end',
      fresh: true,
      setup: async (p) => {
        await intoCamp(p);
        await p.evaluate(() => window.__czScreens.end());
        for (let i = 0; i < 90; i++) {
          if (await p.locator('#end-report:not(.hidden)').count()) break;
          // 终局流程里夹着升华（六十秒的自动播）：这一屏要的是**报告**，
          // 所以顺手把过场跳过——不然干等一分钟，而且拍到的还是诗
          if (await p.locator('#btn-cut-skip').isVisible().catch(() => false)) {
            await p.click('#btn-cut-skip').catch(() => {});
          }
          await p.waitForTimeout(400);
        }
        await p.waitForTimeout(600);
      },
    },
      // 终章升华（电影化的第三处）：直接放这一段——它不调模型，纯本地诗与音频
      {
        name: '06-poem',
        // 结论（2026-09-15 排查）：诗那一拍**是渲染的**，「lines 恒为 0」是这条 setup 自己写错了——
        // `await page.evaluate(() => cinema.play(...))` 会把 play() 的 Promise 等到底（整条约 60s），
        // 于是后面的 18s 采样与截图全落在**终态**（钤印已上、诗已收）。改成发射后不等即可。
        // 实测：t=2.5s lines=8、running=ending-poem；console 有「[cinema] 诗 8 句 · 时间轴 0–55800ms」；
        // /api/data/poem 返回 200。另：诗的逐句时间轴与录音对齐（能量包络核过，偏差 ≤20ms），
        // 题字按 audio.titleMs=2300 跟念到时淡入。
        // 新开一页 + 先起一局到营地，再演升华（这一页就是"打完一局之后"的样子）。
        // 取图**看时钟不看音频**：逐句窗口是从录音量出来的（11.4–20.8s 是第 1、2 句），
        // 所以"第 18 秒按快门"拿到的一定是"前两句逐字、其余留白"那一帧，不受 headless 音频快慢影响。
        fresh: true,
        setup: async (p) => {
          await p.waitForFunction(() => window.__czKernel?.diag?.events?.({ name: 'app:ready' })?.length > 0, null, { timeout: 20000 });
          await intoCamp(p);
          // 不 await：play() 的 Promise 要等整条编排演完才落，await 会把采样推到终态
          await p.evaluate(() => { window.__czKernel.api('cinema').play('ending-poem'); return true; });
          await p.waitForTimeout(18000);
          console.log('  06-poem 现场：', JSON.stringify(await p.evaluate(() => ({
            lines: document.querySelectorAll('.poem-line').length,
            on: document.querySelectorAll('.poem-ch.on').length,
            titleOn: !!document.querySelector('.poem-title.on'),
            seal: !!document.querySelector('.poem-seal'),
            running: window.__czKernel?.api?.('cinema')?.current?.() || '',
          }))));
        },
      },
    // 记录 / 答辩：两个浮层面板（都是现成入口）
    { name: '07-logs', setup: async (p) => { await p.evaluate(() => window.__czScreens.logs()); await p.waitForTimeout(500); } },
    {
      name: '08-defense',
      setup: async (p) => {
        await p.click('#btn-logs-close', { force: true }).catch(() => {});
        await p.waitForTimeout(300);
        await p.evaluate(() => window.__czScreens.defense());
        await p.waitForTimeout(500);
      },
    },
  ],
};

async function capture() {
  await ensureServer();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  // 1280 沿用 800 高（逐页纸面占比是在这个尺寸量的，别改）；窄屏跟 layout-audit 对齐成 1000 高，两套 820 图好对照
  const page = await browser.newPage({ viewport: { width: WIDTH, height: WIDTH === 1280 ? 800 : 1000 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.goto(`${BASE}/?sheet=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.removeItem('czjc_devtools');
  });
  // 需要钩子时才打开展示开关（它只影响"多挂一个截图入口"，不改变任何屏的样式，但会露出调试入口）
  if (NEED_DEV_HOOK) await page.evaluate(() => localStorage.setItem('czjc_devtools', '1'));
  await page.reload({ waitUntil: 'networkidle' });

  const shots = BATCHES[BATCH] || BATCHES[1];
  const tone = {};
  for (const s of shots) {
    if (s.fresh) await page.reload({ waitUntil: 'networkidle' });
    await s.setup(page);
    await settle(page);                       // 等动效落定，别把"动画中途"拍进交付图
    // 截交付图前先摘掉 dev 标记，只留玩家能看到的样子（钩子是 boot 时挂的，摘标记不影响它）
    await page.evaluate(() => document.body.classList.remove('dev-tools'));
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
    tone[s.name] = { paperRatio: await measurePaper(page) };
    console.log('shot', s.name, `纸面 ${(tone[s.name].paperRatio * 100).toFixed(1)}%`);
  }
  // 逐页面积**累加**写入：qa:tone 要能一次看到所有已测过的页面，
  // 否则跑完第二批就把第一批的记录顶掉，等于"最后跑哪批只查哪批"。
  // 只记 1280：换成窄屏量会把同一页的占比写成另一个视口的值，qa:tone 的"逐页预算"就串了。
  if (WIDTH === 1280) {
    const REPORT = path.join(ART, 'tone-report.json');
    const prev = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, 'utf8')) : {};
    const batches = { ...(prev.batches || {}), [BATCH]: Object.keys(tone) };
    fs.writeFileSync(REPORT, JSON.stringify({
      generatedAt: new Date().toISOString(),
      batches,
      pages: { ...(prev.pages || {}), ...tone },
    }, null, 2), 'utf8');
  }
  await browser.close();
}

/** 用 canvas 拼联系表（两列），带页名标签 */
async function sheet() {
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.png') && !f.startsWith('screen-sheet')).sort();
  const items = files.map((f) => ({ name: f.replace(/\.png$/, ''), src: 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64') }));
  const COLS = 2, CELL_W = 640, CELL_H = 400, PAD = 12, LABEL = 26;
  const rows = Math.ceil(items.length / COLS);
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#1a1611">
  <canvas id="c" width="${COLS * (CELL_W + PAD) + PAD}" height="${rows * (CELL_H + LABEL + PAD) + PAD}"></canvas>
  <script>
  const items = ${JSON.stringify(items)};
  const COLS=${COLS}, CW=${CELL_W}, CH=${CELL_H}, PAD=${PAD}, LABEL=${LABEL};
  const ctx = document.getElementById('c').getContext('2d');
  ctx.fillStyle = '#1a1611'; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  (async () => {
    for (const [n, it] of items.entries()) {
      const img = await load(it.src);
      const x = PAD + (n % COLS) * (CW + PAD), y = PAD + Math.floor(n / COLS) * (CH + LABEL + PAD);
      ctx.drawImage(img, x, y, CW, CH);
      ctx.strokeStyle = 'rgba(232,220,200,0.35)'; ctx.strokeRect(x + 0.5, y + 0.5, CW - 1, CH - 1);
      ctx.fillStyle = '#ece2cd'; ctx.font = '15px Consolas, monospace';
      ctx.fillText(it.name, x + 2, y + CH + 18);
    }
    window.__done = true;
  })();
  <\/script></body>`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: COLS * (CELL_W + PAD) + PAD, height: rows * (CELL_H + LABEL + PAD) + PAD } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__done === true);
  const out = path.join(ART, `screen-sheet-${BATCH}${SUFFIX}.png`);
  await page.locator('#c').screenshot({ path: out });
  await browser.close();
  console.log('联系表 →', out);
}

await capture();
await sheet();
