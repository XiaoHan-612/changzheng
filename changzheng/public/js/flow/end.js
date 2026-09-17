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
import { originText, sceneImage } from './view.js';

/** 四套本地结局骨架：模型只填段落；失败/无 Key 时也能给出可读终局（v0.3 P2-10） */
const ENDING_SHELLS = {
  同行: {
    title: '同行',
    lead: '你和还在一起的人，走完了这一路。',
    paras: ['有人掉队，有人补上。名字记不全了，脚步声还在。', '会宁的风吹过来，你下意识回头看了一眼来路。'],
  },
  守望: {
    title: '守望',
    lead: '你把安全留给了别人。',
    paras: ['夜里你多站了一班岗，口粮匀给了伤员。', '天亮时队伍还在——这就够了。'],
  },
  未竟: {
    title: '未竟',
    lead: '有些人没能走到最后。',
    paras: ['名单比出发时短了。空着的位置，你记得是在哪一段空的。', '路还在往前。你替他们把名字带到了会宁。'],
  },
  星火: {
    title: '星火',
    lead: '你信的东西，传给了下一个人。',
    paras: ['信念没有掉，人也几乎都在。', '后来的人会知道：这一路是怎么走过来的。'],
  },
};

export async function runFailure(fail, act) {
  step('failure', 'end');
  showScreen('screen-end');
  // 失败结算的底图按"怎么失败的"换（两张都是 public/assets/events/ 里原先闲置的素材）：
  // 断粮掉队 → 火上的一口空锅；体力耗尽 → 一双留在路上的旧鞋。
  // 这屏与终局成功共用同一个屏，所以成功的 runEnding 会把底图换回会宁。
  // 路径**写成字面量**（不要拼文件名）：素材体检/文档对账都是按字面路径扫的，拼出来的路径扫不到。
  const FAIL_BG = {
    断粮: '/assets/events/ev_starve.jpg',
    体力: '/assets/events/ev_loss.jpg',
  };
  const failBg = Object.keys(FAIL_BG).find((k) => String(fail?.kind || '').includes(k));
  if ($('end-bg')) $('end-bg').style.backgroundImage = `url('${FAIL_BG[failBg] || FAIL_BG.体力}')`;
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
  // 终局成功回到会宁全景（失败结算可能把这屏的底图换成了 ev_loss/ev_starve）
  if ($('end-bg')) $('end-bg').style.backgroundImage = "url('/assets/scenes/huining_pano.jpg')";
  $('end-title').textContent = '结算中…';
  $('end-paras').innerHTML = '';
  $('end-history').innerHTML = '';
  let end;
  const localId = st().pickEnding() || '同行';
  end = await callAI({
    scene: '终局总评',
    callType: 'ending_review',
    situation: '长征五幕结束，综合资源、关系、抉择与对决',
    state: publicState(),
    extraContext: `幕记录：${JSON.stringify(S.actLog)}；对决 ${S.quiz.human}:${S.quiz.ai}；钓鱼最佳 ${(S.fishingBest || 0).toFixed(2)}；本地倾向结局=${localId}；减员=${(S.losses||[]).map(l=>l.who).join('、')||'无'}；夜间抉择=${S.nightChoice || '—'}`,
  });
  // 模型没给终局总评：用本地骨架顶上，保证「有结局可读」（不编造史实，只给结构句）
  if (!end || end._error) {
    const shell = ENDING_SHELLS[localId] || ENDING_SHELLS.同行;
    end = {
      ending_id: localId,
      title: shell.title,
      paragraphs: shell.paras,
      history_points: [],
      personal: shell.lead,
      _localShell: true,
    };
  } else if (!end.ending_id) {
    end.ending_id = localId;
  }
  // 本地骨架已保证 end 可读；若模型成功则用模型文案，失败用 shell（上方）
  if (end._localShell) {
    st().pushCampLog('终局', `本地结局骨架：${end.title}（模型未返回总评）`);
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
  await cinemaApi()?.play('ending-poem', {
    ctx: {
      // 第 2 轮的两张待产图（落盘即生效）：收束空镜与诗页底纹，没产出就退回会宁全景 / 纯黑场
      photoImg: sceneImage('/assets/scenes/huining_dusk.jpg', '/assets/scenes/huining_pano.jpg'),
      paperImg: sceneImage('/assets/scenes/poem_paper.jpg', ''),
    },
  });
  // 升华演完必须回到结算屏：play() 内部 showScreen('screen-cutscene')，
  // 不回来玩家会卡在空过场（按钮契约已摘），报告与「复制」都在背后的 screen-end 上（v0.3 P0）
  showScreen('screen-end');

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
