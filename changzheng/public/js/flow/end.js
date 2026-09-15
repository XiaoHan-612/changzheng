/**
 * flow/end —— **收尾**：行军失败的结算、终局总评、关系面板、终局屏的两个按钮。
 *
 * 从 main.js 搬出来（批 7 二·5）。与 act 的关系是单向的（act 在幕末/失败时调它），
 * 所以这里**不许**反向 import act（那会成环）。三处"模型没返回就不能摆空壳"的兜底都在这里
 * （失败结算、终局总评、以及报告缺失时不留死键，见 HANDOFF-CODE 坑 41）。
 */
import { $, toast, typeText, escapeHtml, showScreen } from '../ui.js';
import { markAction } from '../step.js';
import { kernel } from '../kernel/index.js';
import { COMPANIONS } from '../data.js';
import { S, hasS, st, callAI, step, publicState, cinemaApi } from './kit.js';
import { originText } from './view.js';

export async function runFailure(fail, act) {
  step('failure', 'end');
  showScreen('screen-end');
  $('end-eyebrow').textContent = `${S.mode === 'march' ? '行军模式' : '研学模式'} · ${fail.kind}`;
  $('end-title').textContent = '结算中…';
  $('end-paras').innerHTML = '';
  $('end-history').innerHTML = '';
  let end;
  try {
    end = await callAI({
      scene: '失败结算',
      callType: 'failure_review',
      situation: `${fail.kind}：${fail.why}`,
      state: publicState(),
      extraContext: `已走 ${(S.actLog || []).map((a) => a.title).join('、') || '开场'}；损失：${(S.losses || []).map((l) => l.who).join('、') || '无'}`,
    });
  } catch {
    end = null;
  }
  // 模型没给出结算就明说，不编造叙事（callAI 内部已给过「重试 / 跳过」）
  if (!end || end._error) {
    $('end-title').textContent = '结算未完成';
    $('end-paras').innerHTML = '<p class="muted">模型没有返回这段失败结算。原因已记入日志，可在「设置 → 测试连接」复查 Key，或翻「记录」看失败详情。</p>';
    $('end-history').innerHTML = '';
    $('end-rel').innerHTML = renderRelations();
    $('end-personal').textContent = '';
    return;
  }
  $('end-title').textContent = end.title || '掉队';
  for (const t of end.paragraphs || []) {
    const p = document.createElement('p');
    $('end-paras').appendChild(p);
    await typeText(p, t, 14);
  }
  $('end-history').innerHTML = (end.history_points || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('');
  $('end-rel').innerHTML = renderRelations();
  $('end-personal').textContent = end.personal || '';
}

export function renderRelations() {
  const rows = [`出身：${originText()}`]
    .concat(COMPANIONS.map((c) => `${c.name}：${S[`好感_${c.name}`] ?? 40}`));
  const lost = (S.losses || []).map((l) => `<span class="txt-bad">${escapeHtml(l.who)} · ${escapeHtml(l.reason)}</span>`);
  return rows.concat(lost).join('<br/>');
}

export async function runEnding() {
  step('end', 'end');
  kernel.emit('scene:enter', { name: 'ending' });
  showScreen('screen-end');
  $('end-title').textContent = '结算中…';
  $('end-paras').innerHTML = '';
  $('end-history').innerHTML = '';
  let end;
  end = await callAI({
    scene: '终局总评',
    callType: 'ending_review',
    situation: '长征五幕结束，综合资源、关系、抉择与对决',
    state: publicState(),
    extraContext: `幕记录：${JSON.stringify(S.actLog)}；对决 ${S.quiz.human}:${S.quiz.ai}；钓鱼最佳 ${(S.fishingBest || 0).toFixed(2)}`,
  });
  // 模型没给终局总评（玩家点了「跳过」/两次重试都用尽）：**明说 + 可重试**，不摆一个空壳结算。
  // 以前这里直接用 end.xxx，失败了整屏只剩一个标题、没有正文也没有说明——终局是最容易被看到的一屏，
  // 空屏等于翻车（2026-09-15 修，见 HANDOFF-CODE 坑 41）。
  if (!end || end._error) {
    $('end-eyebrow').textContent = '终局';
    $('end-title').textContent = '结算未完成';
    const box = $('end-paras');
    // 这句是玩家在这屏上唯一要读的内容，用正常墨色：`.muted`(#8d8474) 在纸面上只有约 2.9:1，
    // 那是给暗底 HUD 的次要标注用的，放在正文里会看不清（实测于 2026-09-15 的截图）。
    box.innerHTML = '<p>模型没有返回这段终局总评。原因已记入日志：可在「设置 → 测试连接」复查 Key，'
      + '或翻「记录」看失败详情。</p>';
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn primary';
    again.textContent = '重新结算';
    markAction(again, 'end-retry');
    again.addEventListener('click', () => {
      again.remove();
      runEnding();
    });
    box.appendChild(again);
    $('end-history').innerHTML = '';
    $('end-rel').innerHTML = renderRelations();   // 本局资源与关系照旧给全（它们不依赖模型）
    $('end-personal').textContent = '';
    bindEndActions(null);
    return;
  }
  $('end-eyebrow').textContent = `终局 · ${end.ending_id || ''}`;
  $('end-title').textContent = end.title || '长征之后';
  for (const t of end.paragraphs || []) {
    const p = document.createElement('p');
    $('end-paras').appendChild(p);
    await typeText(p, t, 14);
  }
  $('end-history').innerHTML = (end.history_points || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('');
  $('end-rel').innerHTML = renderRelations();
  $('end-personal').textContent = end.personal || '';

  // 升华（电影化，见 modules/cinema）：会宁空镜 → 诗八句逐字 → 钤印。
  // 位置就卡在这儿——**终局总评成功之后、研学报告渲染之前**：
  //   · 失败分支（上面的结算未完成）不会走到这里，所以失败局不演升华；
  //   · 报告是"可带走的纸面"，让它落在诗之后，玩家读完诗再去看报告。
  // 它全程可跳过（一跳到底），且**不做任何模型调用**（诗与时间是本地数据）。
  await cinemaApi()?.play('ending-poem');

  // 研学报告（课后复盘用；对外不出现行业与场景口径，见 docs/PITCH.md）
  try {
    const report = await callAI({
      scene: '研学报告',
      callType: 'study_report',
      situation: '生成可给带队者复盘的研学摘要',
      state: publicState(),
      extraContext: `结局=${end.ending_id}；史实解锁=${(S.unlockedFacts || []).join(',')}；对决=${S.quiz.human}:${S.quiz.ai}`,
    });
    const box = $('end-report');
    if (box && report) {
      box.classList.remove('hidden');
      $('report-summary').textContent = report.summary || '';
      $('report-knowledge').innerHTML = (report.knowledge || []).map((k) => `<li>${escapeHtml(k)}</li>`).join('');
      $('report-values').innerHTML = (report.values || []).map((k) => `<li>${escapeHtml(k)}</li>`).join('');
      $('report-suggest').textContent = report.suggest || '';
      st().remember('lastReport', report);
    }
  } catch { /* optional */ }

  bindEndActions(end);
  toast('全主线完成 · 可打开行军记录', 4000);
}

/**
 * 终局屏的收尾按钮：报告没生成也不能留一个"点了没反应"的键。
 * 以前「复制报告」的 onclick 在正常路径里现绑、闭包里带着本局的 `end`；
 * 一旦走了失败分支就会留着**上一局**的闭包（复制出来的是旧内容），所以统一在这里绑。
 * @param {object|null} end 终局总评；null = 这一局没生成
 */
export function bindEndActions(end) {
  const copyBtn = $('btn-copy-report');
  if (!copyBtn) return;
  if (!end) {
    copyBtn.disabled = true;
    copyBtn.onclick = null;
    return;
  }
  copyBtn.disabled = false;
  copyBtn.onclick = () => {
    const r = S.lastReport;
    const text = [
      `《长征·抉择》研学报告 — ${end.title || ''}`,
      r?.summary || '',
      '史实：' + (r?.knowledge || []).join('；'),
      '价值：' + (r?.values || []).join('；'),
      r?.suggest || '',
    ].join('\n');
    navigator.clipboard?.writeText(text).then(() => toast('报告已复制')).catch(() => toast('复制失败'));
  };
}
