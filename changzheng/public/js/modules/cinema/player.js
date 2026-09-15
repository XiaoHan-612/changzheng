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
/** 逐字速度（与老过场一致：24ms/字） */
const TYPE_MS = 24;
/** 没有 holdMs 时的默认停留 */
const DEFAULT_HOLD_MS = 1500;

/** 语音通道的回声：由描述符的 `voice:*` 订阅喂进来（通道不认识播放器，见 kernel/contracts.js） */
const voice = { playing: false, startedAt: 0, endedAt: 0 };
export function onVoiceStart() { voice.playing = true; voice.startedAt = Date.now(); }
export function onVoiceEnd() { voice.playing = false; voice.endedAt = Date.now(); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let running = '';      // 正在播的编排 id（'' = 没在播）
let gen = 0;           // 代次：换拍子 / 播放结束 / 屏被清掉都会 +1，让过期的定时器写入作废
let timers = [];       // 本模块起的定时器（屏被清掉或换拍子时统一清）

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
  if (!seq || !seq.length) {
    // 编排 id 写错就明说：静默演一段空白，会让"序章没了"变成很晚才发现的怪事
    console.error(`[cinema] 没有编排「${id}」，可用：${Object.keys(SEQUENCES).join('、')}`);
    return { id, beats: 0, skipped: false };
  }
  const f = frame();
  if (!f.screen || !f.stage || !f.beat || !f.cap) {
    console.error('[cinema] 过场屏的容器不在（index.html 被改过？）');
    return { id, beats: 0, skipped: false };
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
  const tap = () => {
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

  let n = 0;
  for (const beat of seq) {
    if (skipped) break;
    const impl = beatOf(beat.kind);
    if (!impl) continue;                   // 未登记的拍子：已经报过错了，跳过这一拍继续演
    n += 1;
    clearTimers();
    const myGen = gen;
    let gone = false;                      // 这一拍过去了：它起的定时器再写就作废
    const ctx = {
      ...f,
      reduce,
      extra: opts.ctx || {},
      after(ms, fn) {
        const t = setTimeout(() => { if (!gone && !skipped && gen === myGen) fn(); }, Math.max(0, ms));
        timers.push(t);
        return t;
      },
      gone: () => gone || skipped || gen !== myGen,
    };
    if (opts.onBeat) { try { opts.onBeat(beat, n); } catch { /* 回调出错不拖垮播放 */ } }

    if (f.next) f.next.textContent = n < seq.length ? '下一句 ▸' : '进入 ▸';
    // 换底片的处理档（如路线图要压暗一档）：由拍子声明、播放器执行——拍子不直接改 class，
    // 免得上一拍加的类留在下一拍身上（"谁加谁清"在这里容易漏）。
    f.stage.className = `cut-stage${beat.stageClass ? ' ' + beat.stageClass : ''}`;
    // 拍子可以声明一个音效（如幕间启程的鼓点）：走事件，交给音频模块放
    if (beat.sfx) kernel.emit('sfx:play', { name: beat.sfx });
    impl.render?.(ctx, beat, opts.ctx || {});

    // 字幕：减动效直接给全文；点按先把剩下的一次性显示完，再一次点按才走（老行为，别改）
    const text = String(beat.text || '');
    let typingDone = !text;
    const typed = !text || reduce
      ? Promise.resolve().then(() => { if (text) f.cap.textContent = text; })
      : typeText(f.cap, text, TYPE_MS).then(() => { typingDone = true; });
    if (!text) f.cap.textContent = '';

    // 配音：交给语音通道（它在播什么、播多久只有它知道），这里只等它的回声
    let voiceWait = Promise.resolve();
    if (beat.voice?.text || beat.voice?.file) {
      const t0 = Date.now();
      voice.startedAt = 0;
      kernel.emit('voice:say', { ...beat.voice });
      voiceWait = (async () => {
        await sleep(VOICE_GRACE_MS);
        // 宽限内没开播 = 这一拍没有声（文件缺 / 静音 / 命中不了缓存）——继续往下演
        if (skipped || !voice.startedAt || voice.startedAt < t0) return;
        const capAt = Date.now() + VOICE_CAP_MS;
        while (voice.playing && !skipped && Date.now() < capAt) await sleep(80);
      })();
    }

    if (beat.hold === 'click' || impl.hold === 'click') {
      await waitUser();
      if (skipped) break;
      if (!typingDone) { f.cap.textContent = text; await waitUser(); }
    } else {
      // 自动播：等"字走完 + 声播完"，再停留 holdMs——三者都可能被一次点按/跳过直接打断
      await Promise.race([Promise.all([typed, voiceWait]), waitUser()]);
      if (skipped) break;
      const hold = Number(impl.holdMs?.(beat, opts.ctx || {}) ?? beat.holdMs ?? DEFAULT_HOLD_MS);
      await Promise.race([sleep(hold), waitUser()]);
    }
    gone = true;
  }

  // ── 收尾：清定时器、摘契约标记、回到干净状态 ──
  clearTimers();
  if (f.next) { f.next.onclick = null; delete f.next.dataset.action; }
  if (f.skip) { f.skip.onclick = null; delete f.skip.dataset.action; }
  f.screen.onclick = null;
  f.cap.classList.remove('typing');
  running = '';
  return { id, beats: n, skipped };
}

/** 正在播哪一条编排（体检与调试用） */
export const current = () => running;
/** 语音通道此刻在播吗（音画同步的体检用） */
export const voiceLive = () => voice.playing;

/** 屏自清：离开过场屏时清掉本模块写进去的东西（`screens.own('screen-cutscene', …)` 登记的就是它） */
export function clearCutscene() {
  const f = frame();
  gen += 1;                              // 让还在飞的定时器写入作废
  clearTimers();
  running = '';
  if (!f.screen) return;
  if (f.stage) f.stage.style.backgroundImage = '';
  if (f.beat) f.beat.innerHTML = '';
  if (f.cap) { f.cap.textContent = ''; f.cap.classList.remove('typing'); }
  delete f.screen.dataset.reduced;
}
