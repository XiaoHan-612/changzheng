/**
 * 拍子播放器 —— 电影化的**唯一实现**：顺序播一条编排（sequence）里的拍子。
 *
 * 它接手的是老 `flow/act.js` 的 `runCutscene`：那 40 行混了三件事（切屏 + 逐字 + 点按推进），
 * 于是"换个幕"和"演一段电影"是同一段代码，谁也不敢动。现在分工是：
 *   · **播放器**管"怎么播"：自动播 / 点按推进 / 跳过（一跳到底）/ 减动效降级 / 音画同步 / 收尾清场；
 *   · **拍子**管"这一镜长什么样"（`beats.js`）；
 *   · **编排**管"放哪几拍"（`sequences.js`，纯数据）。
 *
 * 四条硬口径（都是踩过或已经写进文档的）：
 *   ① **不阻塞**：任何等待都有上限，点按与跳过随时能打断——音频放不出来也一样往下演（红线）。
 *   ② **音画同步**：字幕逐字 24ms/字；声明了配音的拍子等它播完再走（等不到就当无声）。
 *   ③ **收尾一定干净**：两个按钮上的 `data-action` 契约标记必须摘掉——它们是静态 DOM，
 *      留着会让"当前可交互项"的判断出错（老实现踩过）；换拍子清定时器，通道不留残留。
 *   ④ **减动效**：位移类一律不做（只留淡入），字幕整段直显，**音频照播**。
 */
import { kernel } from '../../kernel/index.js';
import { $, showScreen, wipe, typeText } from '../../ui.js';
import { setStep, markAction } from '../../step.js';
import { beatOf } from './beats.js';
import { SEQUENCES } from './sequences.js';

/** 配音的宽限与上限：宽限内没听到开播就当"这一拍没声"（缺音频是常态），上限防长音频挂住流程 */
const VOICE_GRACE_MS = 650;
const VOICE_CAP_MS = 9000;
/** 逐字速度：过场字幕要「念得出来」——过快会糊成一片（用户反馈） */
const TYPE_MS = 42;
const TYPE_MS_TITLE = 56;
/** 没有 holdMs 时的默认停留 */
const DEFAULT_HOLD_MS = 1500;

/**
 * 语音通道的回声：由描述符的 `voice:*` 订阅喂进来（通道不认识播放器，见 kernel/contracts.js）。
 * `t` / `duration` 是**逐字跟音频的唯一时钟**（批 A 建立）：诗那一拍只认它，不自造第二个时钟。
 */
const voice = { playing: false, startedAt: 0, endedAt: 0, t: 0, duration: 0, seq: 0 };
/** 最近一次"通道在播哪一句"（seq 由通道给，见 kernel/contracts.js） */
export function onVoiceStart(p = {}) {
  voice.playing = true;
  voice.startedAt = Date.now();
  voice.t = 0;
  voice.duration = Number(p.durationMs) || 0;
  voice.seq = Number(p.seq) || 0;
}
export function onVoiceProgress(p = {}) {
  voice.t = Number(p.t) || 0;
  if (Number(p.duration)) voice.duration = Number(p.duration);
  if (Number(p.seq)) voice.seq = Number(p.seq);
}
export function onVoiceEnd(p = {}) {
  voice.playing = false;
  voice.endedAt = Date.now();
  if (Number(p.seq)) voice.seq = Number(p.seq);
}

/**
 * 演一句台词，拿回**这一句自己**的句柄（按 `seq` 认领，见下）。
 *
 * 为什么按 seq 认领：`voice:say` 发出去之后，回声是总线上的公共信号，谁都能听见——
 * 上一句的进度、别的拍子的回声都可能漏进"我现在播到哪了"的判断里。**句柄只认自己那一句**：
 * 发出去之后第一条 start 的 seq 就是它，别的 seq 一律当噪声；没有 start（文件缺/静音/被拒播）
 * 就在 grace 后如实说"这一句没响"——**不阻塞**是硬口径，任何一句都不许把流程挂住。
 *
 * 用法只有两种（够用就好，别再加读表接口）：
 *   `await line.started()`  这一句起播了吗（false = 没响，调用方自己决定退化成什么节奏）
 *   `line.playing()` / `await line.ended()`  它还在响吗 / 等它响完
 * @returns {{seq:number|null, started:()=>Promise<boolean>, playing:()=>boolean, ended:()=>Promise<void>, silent:()=>boolean}}
 */
export function say(payload, { graceMs = VOICE_GRACE_MS } = {}) {
  const seq0 = voice.seq;
  kernel.emit('voice:say', { ...payload });
  const d = { seq: null, silent: false, started: false };
  return {
    seq: () => d.seq,
    /** 这一句起播了吗：起播 → true；宽限期内一直没起播（或先收到 ended）→ false 且记为 silent */
    async started() {
      const until = Date.now() + graceMs;
      for (;;) {
        if (voice.seq !== seq0 && voice.seq > 0) {
          d.seq = voice.seq;
          d.started = voice.playing;
          d.silent = !voice.playing;
          return d.started;
        }
        if (Date.now() >= until) { d.silent = true; return false; }
        await sleep(60);
      }
    },
    /** 还在响吗（只认自己那一句） */
    playing() { return d.seq != null && voice.seq === d.seq && voice.playing; },
    /** 等它响完（自己那一句的 ended） */
    async ended(capMs = VOICE_CAP_MS) {
      const capAt = Date.now() + capMs;
      while (this.playing() && Date.now() < capAt) await sleep(80);
    },
    silent() { return d.silent; },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 可用语速档位：问音频模块要（值在 audio/mix.js 一处），拿不到就只按原速演 */
function rateOptions() {
  try {
    const list = kernel.api('audio')?.voiceRates?.();
    return Array.isArray(list) && list.length ? list : [1];
  } catch { return [1]; }
}
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let running = '';      // 正在播的编排 id（'' = 没在播）
let gen = 0;           // 代次：换拍子 / 播放结束 / 屏被清掉都会 +1，让过期的定时器写入作废
let timers = [];       // 本模块起的定时器（屏被清掉或换拍子时统一清）
/**
 * 正在跑的那一段（单飞保护）。
 *
 * 为什么要有：两段 `play()` 同时跑会**互相覆盖**——后一段把同一个容器重写过一遍，
 * 前一段的拍子循环还在往下走（它只认自己的 `gen` 与 `skipped`），于是屏幕上出现"前一段的钤印
 * 盖在后一段的诗上"。正常流程是单线的，但体检脚本/将来新流程可能撞上，所以这里显式互斥：
 * 新的一段进来时，先把上一段**干净地停掉**（等同按了跳过）再开。
 */
let active = null;     // { id, cancel, done }

function clearTimers() { timers.forEach(clearTimeout); timers = []; }

/** 过场屏的容器与按钮：**只有这里知道它们是谁**（别的模块要读状态走 api） */
function frame() {
  return {
    screen: $('screen-cutscene'),
    stage: $('cut-stage'),
    beat: $('cut-beat'),
    cap: $('cut-caption'),
    next: $('btn-cut-next'),
    skip: $('btn-cut-skip'),
  };
}

/**
 * 播一条编排。
 * @param {string} id `sequences.js` 里的编排 id
 * @param {{ctx?: object, onBeat?: (beat: object, n: number) => void}} [opts] ctx 透给拍子（如幕次）
 * @returns {Promise<{id: string, beats: number, skipped: boolean}>}
 */
export async function play(id, opts = {}) {
  // 编排有两种写法（`sequences.js` 里混用）：静态数组，或 `(ctx) => 拍子[]`。
  // 后者给"内容随幕次变"的编排用（幕间过渡要拿本幕的图、幕名与一句总评），
  // 但它仍然是**纯数据**：只挑拍子与文案，不做任何流程判断。
  const raw = SEQUENCES[id];
  const seq = typeof raw === 'function' ? raw(opts.ctx || {}) : raw;
  if (!raw) {
    // 编排 id 写错就明说：静默演一段空白，会让"序章没了"变成很晚才发现的怪事
    console.error(`[cinema] 没有编排「${id}」，可用：${Object.keys(SEQUENCES).join('、')}`);
    return { id, beats: 0, skipped: false };
  }
  // 空编排是合法选择（如 act-intro 的 idx=0：序章已演过题字与路线图，不再重演）
  if (!seq || !seq.length) {
    return { id, beats: 0, skipped: false };
  }
  const f = frame();
  if (!f.screen || !f.stage || !f.beat || !f.cap) {
    console.error('[cinema] 过场屏的容器不在（index.html 被改过？）');
    return { id, beats: 0, skipped: false };
  }
  if (active) {                          // 上一段还在跑：先停掉它（见上面的单飞说明）
    console.warn(`[cinema] 上一段「${active.id}」还没演完就又开了一段「${id}」——先把它停掉`);
    active.cancel();
    await active.done.catch(() => {});
  }

  running = id;
  gen += 1;
  clearTimers();
  setStep('cutscene', 'cutscene');         // 契约：data-step-kind="cutscene"（9 个脚本依赖它）
  showScreen('screen-cutscene');
  wipe(f.screen);                          // 换幕抹擦（减动效下 CSS 自己 display:none）

  const reduce = reduceMotion();
  f.screen.dataset.reduced = reduce ? '1' : '0';
  const mine = gen;

  // 交互：点按推进（下一句 / 屏上任意处）+ 跳过（一跳到底）
  let skipped = false;
  let waitClick = null;
  const myRun = { id, cancel: () => { skipped = true; tap(); }, done: null };
  let aborted = false;                       // 这一拍被点按/跳过了（正在跑的 render 靠它收手）
  const tap = () => {
    aborted = true;
    if (!waitClick) return;
    const r = waitClick;
    waitClick = null;
    kernel.emit('voice:stop', {});          // 点一下就是"往下走"：这一句不再念了
    r();
  };
  const waitUser = () => new Promise((r) => { waitClick = r; });
  const onClick = (e) => { if (e && e.target === f.skip) return; tap(); };
  const onSkip = () => { skipped = true; tap(); };
  if (f.next) { f.next.onclick = onClick; markAction(f.next, 'continue'); }
  if (f.skip) { f.skip.onclick = onSkip; markAction(f.skip, 'skip'); }
  f.screen.onclick = onClick;

  // 语速：整条编排共用一个档位（可加速的拍子由拍子自己声明 `speeds`，播放器据此露出速度键）
  let rate = Number(opts.ctx?.rate) || 1;
  let restartBeat = null;                  // 改变语速要"这一拍重来"（音频没法中途变速）
  const speedBtn = $('btn-cut-speed');
  const applySpeedBtn = (speeds) => {
    if (!speedBtn) return;
    if (!speeds || speeds.length < 2) { speedBtn.classList.add('hidden'); delete speedBtn.dataset.action; return; }
    speedBtn.classList.remove('hidden');
    speedBtn.textContent = `${rate}× 语速`;
    markAction(speedBtn, 'speed');
    speedBtn.onclick = (e) => {
      e.stopPropagation();
      const i = speeds.indexOf(rate);
      rate = speeds[(i + 1) % speeds.length];
      speedBtn.textContent = `${rate}× 语速`;
      kernel.emit('voice:stop', {});
      if (restartBeat) restartBeat();       // 这一拍从头再演一遍（新语速）
    };
  };

  let n = 0;
  let prevImpl = null;                        // 上一拍的实现（在下一拍开始前调它的 cleanup）
  let lastCtx = null;                         // 上一拍的 ctx：cleanup 要用它，而本拍的 ctx 还没建出来
  let capType = null;                         // 当前字幕打字机句柄（换拍/跳过必须 finish，否则旧 interval 覆写）
  const finishCap = () => { if (capType) { try { capType.finish(); } catch { /* 已结束 */ } capType = null; } };
  myRun.done = (async () => {                 // 让"下一段"能等到这一段真的收尾
  for (const beat of seq) {
    if (skipped) break;
    const impl = beatOf(beat.kind);
    if (!impl) continue;                   // 未登记的拍子：已经报过错了，跳过这一拍继续演
    let again = true;
    while (again && !skipped) {
    again = false;
    n += 1;
    finishCap();                           // 上一拍的打字机必须收掉，否则 interval 会覆写本拍字幕
    // 上一拍收尾（它自己要停的东西自己停：比如诗那一拍的长音频不该盖到钤印上）
    // 用 lastCtx 而不是本行的 ctx：`const ctx` 在本拍下方才声明，直接写 ctx 会踩 TDZ
    // ——第一拍 prevImpl 是 null 短路掉看不出来，第二拍起必抛 ReferenceError，
    // 又被这行的空 catch 吞掉，等于 cleanup **从来没执行过**（诗的 voice:stop 没发出去）。
    try { prevImpl?.cleanup?.(lastCtx); } catch { /* 收尾出错不拖垮播放 */ }
    prevImpl = impl;
    applySpeedBtn(beat.speeds || impl.speeds);
    clearTimers();
    const myGen = gen;
    let gone = false;                      // 这一拍过去了：它起的定时器再写就作废
    restartBeat = () => { gone = true; again = true; };   // 让本拍的循环与定时器全部失效，再跑一遍
    aborted = false;
    const ctx = {
      ...f,
      reduce,
      rate,
      extra: opts.ctx || {},
      voice: () => ({ ...voice }),
      /** 演一句并拿回这一句的时钟（句级，不认别人的回声） */
      say: (payload, opts) => say(payload, opts),
      skipped: () => skipped,
      // "正在重来"（换语速）与"被点按中断"是两件事：前者要立刻重演，后者才该把剩下的字补完
      restarting: () => again,
      after(ms, fn) {
        const t = setTimeout(() => { if (!gone && !skipped && gen === myGen) fn(); }, Math.max(0, ms));
        timers.push(t);
        return t;
      },
      // gone：这一拍作废（点按/跳过/换拍/换语速都会置位）——长拍子（诗）的循环靠它收手
      gone: () => gone || skipped || aborted || gen !== myGen,
    };
    lastCtx = ctx;                          // 交给下一拍开头那次 cleanup 用
    if (opts.onBeat) { try { opts.onBeat(beat, n); } catch { /* 回调出错不拖垮播放 */ } }

    if (f.next) f.next.textContent = n < seq.length ? '下一句 ▸' : '进入 ▸';
    // 换底片的处理档（如路线图要压暗一档）：由拍子声明、播放器执行——拍子不直接改 class，
    // 免得上一拍加的类留在下一拍身上（"谁加谁清"在这里容易漏）。
    f.stage.className = `cut-stage${beat.stageClass ? ' ' + beat.stageClass : ''}`;
    // 诗/钤印：内容要铺满过场屏，不能挤在底部字幕条里
    f.screen.classList.toggle('is-poem', beat.kind === 'poem' || beat.kind === 'seal');
    if (beat.sfx) kernel.emit('sfx:play', { name: beat.sfx });
    // 拍子的 render 允许是异步的，而且**必须等它**：终章的诗要自己演一分钟（逐字跟音频），
    // 早先没 await（批 C 的拍子都是同步的，看不出来），诗会刚摆上来就被下一拍顶掉。
    if (skipped) break;
    try { await impl.render?.(ctx, beat, opts.ctx || {}); } catch (err) {
      console.error(`[cinema] 拍子「${beat.kind}」演出时出错（继续往下演）：`, err);
    }
    if (skipped) break;
    // 换语速要"立刻重演"，别先走完停留（不然点了"更快"会先停一拍再从头来）
    if (again) { f.cap.textContent = ''; f.beat.innerHTML = ''; continue; }

    // 字幕：题字用更慢的打字节奏；减动效直接给全文
    const text = String(beat.text || '');
    let typingDone = !text;
    const typeMs = beat.kind === 'title' ? TYPE_MS_TITLE : TYPE_MS;
    const typed = !text || reduce
      ? Promise.resolve().then(() => { if (text) f.cap.textContent = text; })
      : (capType = typeText(f.cap, text, typeMs)).then(() => { typingDone = true; });
    if (!text) f.cap.textContent = '';

    // 配音：交给语音通道（它在播什么、播多久只有它知道），这里只等它的回声
    let voiceWait = Promise.resolve();
    if (beat.voice?.text || beat.voice?.file) {
      const line = ctx.say(beat.voice);
      voiceWait = (async () => {
        // 宽限内没开播 = 这一拍没有声（文件缺 / 静音 / 命中不了缓存）——继续往下演
        if (!(await line.started()) || skipped) return;
        await line.ended();
      })();
    }

    if (beat.hold === 'click' || impl.hold === 'click') {
      await waitUser();
      if (skipped) break;
      if (!typingDone) { finishCap(); f.cap.textContent = text; await waitUser(); }
    } else {
      // 自动播：等"字走完 + 声播完"，再停留 holdMs——三者都可能被一次点按/跳过直接打断
      await Promise.race([Promise.all([typed, voiceWait]), waitUser()]);
      if (skipped) { finishCap(); break; }
      finishCap();
      const hold = Number(impl.holdMs?.(beat, opts.ctx || {}) ?? beat.holdMs ?? DEFAULT_HOLD_MS);
      await Promise.race([sleep(hold), waitUser()]);
    }
    gone = true;
    finishCap();
    if (again && !skipped) { f.cap.textContent = ''; f.beat.innerHTML = ''; }   // 重来一拍：清干净再演
    }
  }

  // ── 收尾：清定时器、摘契约标记、回到干净状态 ──
  try { prevImpl?.cleanup?.({ ...f, reduce, rate }); } catch { /* 同上 */ }
  clearTimers();
  if (capType) { capType.finish(); capType = null; }
  f.screen.classList.remove('is-poem');
  if (f.next) { f.next.onclick = null; delete f.next.dataset.action; }
  if (f.skip) { f.skip.onclick = null; delete f.skip.dataset.action; }
  if (speedBtn) { speedBtn.onclick = null; speedBtn.classList.add('hidden'); delete speedBtn.dataset.action; }
  restartBeat = null;
  f.screen.onclick = null;
  f.cap.classList.remove('typing');
  running = '';
  })();
  active = myRun;
  try { await myRun.done; } finally { if (active === myRun) active = null; }
  return { id, beats: n, skipped };
}

/** 正在播哪一条编排（体检与调试用） */
export const current = () => running;
/** 语音通道此刻在播吗（音画同步的体检用） */
export const voiceLive = () => voice.playing;

/** 屏自清：离开过场屏时清掉本模块写进去的东西（`screens.own('screen-cutscene', …)` 登记的就是它） */
export function clearCutscene() {
  const f = frame();
  // 屏都走了，正在演的那一段要**干净收手**（等同按了跳过），而不是继续往后演拍子——
  // 否则"过场被别的屏顶掉"之后，剩下几拍还会一个个渲染到这个已经藏起来的屏上，
  // 看起来就像"诗刚挂上就跳到了钤印"（2026-09-15 联系表实拍踩到，见 HANDOFF-CODE 坑 54）。
  if (active) active.cancel();
  gen += 1;                              // 让还在飞的定时器写入作废
  clearTimers();
  running = '';
  if (!f.screen) return;
  if (f.stage) f.stage.style.backgroundImage = '';
  if (f.beat) f.beat.innerHTML = '';
  if (f.cap) { f.cap.textContent = ''; f.cap.classList.remove('typing'); }
  delete f.screen.dataset.reduced;
}
