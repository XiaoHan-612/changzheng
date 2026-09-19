/**
 * flow/quiz —— **知识对决**（出题 → 玩家作答 → 两个 AI 作答 → 判分 → 回响）。
 *
 * 从 main.js 搬出来（批 7 二·4）。它是最长的一段单一流程，也是"模型返回残缺时怎么兜底"
 * 的样板：出题失败 → 明说 + 跳过本题（不拿假题骗玩家，也不白烧 3 次调用，见坑 41）。
 *
 * 2026-09-17：**每幕从一道改成三道**（用户要求"题目应该引用 AI 出题，可以出一个也可以出多个，
 * 应该三个吧，我感觉每一幕"）。三道是**连着打完再出回响**：每题仍是完整的一轮
 * （出题 → 作答 → 两个 AI 各答一次 → 判分），但史实回响（afterJudge）只在最后出一次 ——
 * 三题各出一遍回响会把回响本身冲淡，而且玩家要连按三次"继续"看三段同样格式的卡片。
 * 出题时把前面几题的题干回传给模型，让它换考点（不然三题容易问同一件事）。
 */
import { $, showScreen, escapeHtml } from '../ui.js';
import { choiceButton, markAction, setStepState } from '../step.js';
import { kernel } from '../kernel/index.js';
import { S, st, callAI, step, publicState } from './kit.js';
import { afterJudge } from './echo.js';

/** 每幕几道题。想改数量就改这里（3 是用户定的口径） */
export const QUIZ_ROUNDS = 3;

export async function runQuiz(act) {
  step(`${act.id}:quiz`, 'quiz');
  showScreen('screen-quiz');
  $('quiz-bg').style.backgroundImage = `url('${act.pano}')`;
  $('quiz-score').textContent = `${S.quiz.human} : ${S.quiz.ai}`;
  kernel.emit('voice:say', { text: '停一停。刚才走过的路，你还记得多少。', actorId: '叙事', voiceId: 'narr_quiz' });

  const notes = [];        // 每题一句话，最后合成一条回响
  const asked = [];        // 已问过的题干，回传给模型让它换考点
  let aborted = false;
  for (let round = 1; round <= QUIZ_ROUNDS && !aborted; round += 1) {
    const r = await askOneQuestion(act, round, asked);
    notes.push(r.note);
    if (r.question) asked.push(r.question);
    aborted = !!r.aborted;     // 出题失败：不再往下问，直接收尾
  }
  await afterJudge({ narrative: notes.join(' ') }, `知识对决 · ${act.title}`, act.facts?.[0]);
}

/**
 * 出一题并打完这一轮。
 * @returns {Promise<{note: string, question?: string, aborted?: boolean}>}
 */
async function askOneQuestion(act, round, asked) {
  const body = $('quiz-body');
  body.innerHTML = `<p class="muted">正在出第 ${round} / ${QUIZ_ROUNDS} 题…</p>`;
  const q = await callAI({
    scene: `知识对决·${act.title}`,
    callType: 'quiz_generate',
    situation: `根据「${act.title}·${act.subtitle}」出一道长征史实单选题（本幕第 ${round} 题）`,
    state: publicState(),
    extraContext: `本幕主题：${act.theme}；史实：${(act.facts || []).join(',')}`
      + (asked.length ? `；已经考过：${asked.map((s) => String(s).slice(0, 40)).join(' ／ ')}——换一个考点，不要重复` : ''),
  });
  // 出题失败（玩家点了跳过／两次重试用尽）：**明说 + 跳过本题**，本节双方都不计分。
  // 以前会拿"题目 /（题目选项缺失）"当一道真题继续走：玩家答一道不存在的题，
  // 还要再烧 3 次调用（两个 AI 作答 + 判分）才能过去（2026-09-15 修，见 HANDOFF-CODE 坑 41）。
  if (!q || q._error) {
    // 用 blk-body（正常墨色、正文字号）：这句是玩家要读的正文，`.muted`/`.blk-note`
    // 在纸面上都偏淡（约 2.9:1），放主信息里看不清
    body.innerHTML = `<p class="blk-body">第 ${round} 题没能出出来：模型没有返回题目。本题跳过、双方都不计分，原因已记入日志。</p>
      <div class="blk-actions"><button type="button" class="btn primary" id="quiz-next" data-action="continue">继续</button></div>`;
    markAction($('quiz-next'), 'continue');
    setStepState('awaiting');
    await new Promise((r) => { $('quiz-next').onclick = () => { $('quiz-next').onclick = null; r(); }; });
    return { note: `第 ${round} 题出题未成，双方均不计分。`, aborted: true };
  }

  body.innerHTML = `
    <p class="blk-note">第 ${round} / ${QUIZ_ROUNDS} 题</p>
    <p class="blk-body">${escapeHtml(q.question || '题目')}</p>
    <div class="blk-choice-list" id="quiz-opts"></div>
    <div id="quiz-feedback" class="blk-note"></div>
    <div class="blk-actions">
      <button type="button" class="btn ghost" id="quiz-auto" data-action="quiz-auto">让两位战友先答</button>
      <button type="button" class="btn primary hidden" id="quiz-next" data-action="continue">${round < QUIZ_ROUNDS ? '下一题' : '继续'}</button>
    </div>
  `;
  const optsBox = $('quiz-opts');
  const opts = Array.isArray(q.options) && q.options.length >= 2
    ? q.options.map((o) => String(o))
    : ['（题目选项缺失）', '（请重开本题）'];
  // 模型可能把下标写成字符串或越界：合法就取用，非法一律记 -1（本题不计分），
  // 避免「解析失败」被当成默认选了 A
  const normIdx = (v, len) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n < len ? n : -1;
  };

  return await new Promise((resolveRound) => {
    let answered = false;
    const finish = async (humanIdx, auto = false) => {
      if (answered) return;
      answered = true;
      const ans = normIdx(q.answer_index, opts.length);
      const answerKnown = ans >= 0;
      // ai_vs_ai：玩家这一侧由第二个 AI 人设代答
      let humanAns = humanIdx;
      if (auto) {
        const h = await callAI({
          scene: '知识对决·AI 代答（ai_vs_ai）',
          callType: 'quiz_answer_ai',
          situation: `题目：${q.question}\n选项：${opts.join(' / ')}`,
          state: publicState(),
          agent: '激进派小张',
          options: opts,
        });
        humanAns = normIdx(h.answer_index, opts.length);
      }
      const ai = await callAI({
        scene: '知识对决·AI作答',
        callType: 'quiz_answer_ai',
        situation: `题目：${q.question}\n选项：${opts.join(' / ')}`,
        state: publicState(),
        agent: '稳健派老李',
        options: opts,
      });
      const aiAns = normIdx(ai.answer_index, opts.length);
      const humanRight = answerKnown && humanAns === ans;
      const aiRight = answerKnown && aiAns === ans;
      st().quizScore({ human: humanRight ? 1 : 0, ai: aiRight ? 1 : 0 });
      $('quiz-score').textContent = `${S.quiz.human} : ${S.quiz.ai}`;
      const judge = await callAI({
        scene: '知识对决·判分',
        callType: 'quiz_judge',
        situation: `标准答案 index=${ans}。${auto ? '红方(激进派小张)' : '玩家'}=${humanAns}。蓝方(稳健派老李)=${aiAns}`,
        state: publicState(),
        agent: auto ? 'ai_vs_ai' : 'human_vs_ai',
        operation: { human: humanAns, ai: aiAns, answer_index: ans, mode: auto ? 'ai_vs_ai' : 'human_vs_ai' },
      });
      st().applyEffects(judge.effects || { 士气: humanRight ? 3 : -1 });
      kernel.emit('sfx:play', { name: humanRight ? 'correct' : 'wrong' });
      $('quiz-feedback').innerHTML = `
        <div>${auto ? '激进派小张' : '你'}：<b>${humanRight ? '正确' : '错误'}</b> · 稳健派老李：<b>${aiRight ? '正确' : '错误'}</b><br/>
        ${escapeHtml(answerKnown ? (q.explain || judge.explain || '') : '本题标准答案解析失败，双方均不计分。')}</div>
      `;
      [...optsBox.children].forEach((el, i) => {
        el.disabled = true;
        if (i === ans) el.classList.add('correct');
        else if (i === humanAns) el.classList.add('wrong');
      });
      const next = $('quiz-next');
      await new Promise((r) => {
        next.onclick = () => { next.onclick = null; r(); };
        next.classList.remove('hidden');
      });
      resolveRound({
        note: `第${round}题：${auto ? '小张' : '你'}答「${opts[humanAns] ?? '（未作答）'}」，标准答案「${opts[ans] ?? '（本题答案缺失）'}」。${q.explain || ''}`,
        question: q.question || '',
      });
    };
    opts.forEach((text, i) => {
      // 选项一律走唯一的构建处（批三起的口径）：序号进徽章，键盘位自动带上
      const b = choiceButton({ label: text, icon: String.fromCharCode(65 + i), index: i });
      b.onclick = () => finish(i);
      optsBox.appendChild(b);
    });
    const autoBtn = $('quiz-auto');
    if (autoBtn) autoBtn.onclick = () => { autoBtn.disabled = true; finish(null, true); };
  });
}
