/**
 * flow/echo —— **史实回响**：每步之后的"你刚经历的 / 真实发生过的 / 虚构边界"三栏。
 *
 * 从 main.js 搬出来（批 7 二·2）。为什么先搬它：被 20 多处调用（每个抉择、玩法、交谈结算后都要走），
 * 是最容易被复制粘贴的一块——搬进一个文件后，"回响长什么样"就只有一份实现可改。
 *
 * 两个约定（改动时别破坏）：
 *   · **回响必须等玩家关掉**（`showEcho` 返回的 Promise 由 `bindEcho` 的「明白了」键 resolve）——
 *     流程靠 await 它来串节奏，所以 `bindEcho` 必须在 boot 时挂一次。
 *   · **史实卡优先**：`afterJudge(result, fallbackTitle, defaultFactId)` 先按 `factId` 找史实卡，
 *     找不到才用兜底标题与通用说明；`narrative` 为空且没有史实卡时**不弹回响**（不给玩家空屏）。
 */
import { $, showOverlay, hideOverlay, replayAnim } from '../ui.js';
import { markAction } from '../step.js';
import { kernel } from '../kernel/index.js';
import { st, getFacts } from './kit.js';
import { sceneImage } from './view.js';

/** 「明白了」键没按之前的那个 resolve（同一时刻只会有一个回响层） */
let echoResolve = null;

/** 关闭回响层并 resolve（按钮与 Esc 共用；没有开着的回响时是 no-op） */
export function closeEcho() {
  const panel = $('screen-echo');
  if (!panel || panel.classList.contains('hidden')) return false;
  hideOverlay('screen-echo');
  if (echoResolve) {
    const r = echoResolve;
    echoResolve = null;
    r();
  }
  return true;
}

export function bindEcho() {
  $('btn-echo-ok').onclick = () => closeEcho();
}

export function showEcho({ title, play, real, fic }) {
  markAction($('btn-echo-ok'), 'echo-ok');
  return new Promise((resolve) => {
    kernel.emit('sfx:play', { name: 'echo' });
    // 史实回响底纹：有 echo_paper 就用它（压一层深色渐变，保证文字可读）
    const paper = sceneImage('/assets/scenes/echo_paper.jpg', '');
    const cinema = document.querySelector('#screen-echo .echo-cinema');
    if (cinema) {
      cinema.style.backgroundImage = paper
        // 同上：纸纱盖在纸纹上，保持浅底墨字
        ? `linear-gradient(160deg, rgba(244,237,223,0.9), rgba(230,218,195,0.94)), url('${paper}')`
        : '';
    }
    // 史实回响的播报点：有史实卡就念卡名（命中 14 张标题的 TTS 缓存），没有才念固定旁白
    if (title) kernel.emit('voice:say', { text: title, actorId: '旁白', voiceId: 'narr' });
    else kernel.emit('voice:say', { text: '你刚经历的，和真实发生过的，往往只隔着一层时间。', actorId: '叙事', voiceId: 'narr_echo' });
    $('echo-title').textContent = title || '刚刚发生的事';
    $('echo-play').textContent = play || '';
    $('echo-real').textContent = real || '';
    $('echo-fic').textContent = fic ? `虚构边界：${fic}` : '';
    showOverlay('screen-echo');
    // 回响两栏逐条入场（印章的钤印动效由 .echo-seal 自己的动画负责）
    replayAnim(document.querySelector('#screen-echo .echo-grid'), 'anim-stagger');
    echoResolve = resolve;
  });
}

export async function afterJudge(result, fallbackTitle, defaultFactId) {
  const fid = result.factId || result.fact_id || defaultFactId;
  if (fid) st().unlockFact(fid);
  const fact = getFacts()?.[fid];
  const play = result.narrative || result.scene_text || result.reply || '';
  if (!fact && !play) return;
  await showEcho({
    title: fact?.title || fallbackTitle || '史实回响',
    play: play || '（你刚完成一次操作）',
    real: fact?.real || '走过这段路的部队普遍面临严酷考验；战友互助是大量回忆录中的共同记忆。',
    fic: fact?.fiction || '本关卡具体操作为互动重演。',
  });
}
