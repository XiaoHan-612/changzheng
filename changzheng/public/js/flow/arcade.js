/**
 * flow/arcade —— **游戏模式**：把玩法清单里的全部插件单独摆出来，点开就玩。
 *
 * 为什么单独开一个模式：这些玩法原本只长在剧情里（第一幕要搭桥、第五幕要下棋…），
 * 想单看一支就得走完整幕。评审与试玩经常只需要"看一眼那支棋子游戏长什么样"。
 *
 * 口径（三条，别在这里长出新规矩）：
 *   ① **不进剧情状态**：玩法只拿到 `decide`（模型回调）与 `password` 两个参数，
 *      不写 loss/好感/附身线，也不落存档 —— 玩完点「回标题」就干净地回去。
 *   ② 挂载/放弃/结算一律走宿主那一份（`gamesApi().play`）：开板屏、题名、数值签、
 *      「放弃本局」、自动化契约都在那儿，这里不再实现第二遍。
 *   ③ 清单是唯一真源：卡片从 `gamesApi().list() + describe()` 里长出来（数量随 manifest 变），
 *      同事往 manifest 加一支，这里自动多一张卡（不抄第二张表）。
 *   ④ 游戏模式为自由练习，可不调结算模型；**剧情主线**收尾一律真调（见 games-flow reviewMain）。
 */
import { $, showScreen, escapeHtml, toast } from '../ui.js';
import { kernel } from '../kernel/index.js';
import { S, step, gamesApi, callAI, publicState } from './kit.js';

/**
 * 游戏模式自己那份"夜校已经用过的词"。
 * 剧情那条路记在状态里（state 的 schoolUsed，跨幕累计）；游戏模式不碰剧情状态（见文件头口径①），
 * 所以在会话内记一份 —— 同一个会话连玩两次夜校，第二次也会换一批字。
 */
let arcadeSchoolUsed = [];

/** 当前等着的"选哪支"（一次只可能有一个） */
let pickResolve = null;

function waitPick() {
  return new Promise((resolve) => { pickResolve = resolve; });
}

function resolvePick(value) {
  const r = pickResolve;
  pickResolve = null;
  if (r) r(value);
}

/** 进游戏模式：画廊 → 玩一局 → 回画廊 → …直到点「回标题」 */
export async function runArcade() {
  document.body.classList.add('arcade-mode');   // 顶栏少显示行程缎带与数值（见 components.css）
  try {
    for (;;) {
      step('arcade', 'arcade');
      renderGallery();
      showScreen('screen-arcade');
      const pick = await waitPick();
      if (!pick) return;                        // 回标题
      await playOne(pick);
    }
  } finally {
    document.body.classList.remove('arcade-mode');
  }
}

/** 画廊：一支一张卡（题名 + 场景），点开即玩 */
function renderGallery() {
  const grid = $('arcade-grid');
  if (!grid) return;
  const g = gamesApi();
  const ids = g?.list?.() || [];
  grid.innerHTML = '';
  for (const id of ids) {
    const d = g.describe?.(id) || { title: id, kicker: '' };
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mode-card';
    b.dataset.game = id;
    b.innerHTML = `<b>${escapeHtml(d.title || id)}</b><span>${escapeHtml(d.kicker || '')}</span>`;
    b.onclick = () => {
      kernel.emit('sfx:play', { name: 'click' });
      resolvePick(id);
    };
    grid.appendChild(b);
  }
  const back = $('btn-arcade-back');
  if (back) back.onclick = () => resolvePick('');
  const count = $('arcade-count');
  if (count) count.textContent = String(ids.length);
}

/** 玩一局：宿主负责开板屏与收尾，这里只补"玩法要的两个参数"和一句结算 */
async function playOne(id) {
  const g = gamesApi();
  const d = g?.describe?.(id) || { title: id };
  const op = await g.play(id, {
    params: {
      // 今晚口令：剧情里由夜校教出来；单独玩时给一个默认值（夜岗/夜校都用它）
      password: S?.tonightPassword || '瑞金',
      // 模型回调：玩法那边不自己发请求（见 flow/games-flow.js 的 decideFor 同一口径）
      decide: (payload = {}) => callAI({
        ...payload,
        scene: payload.scene || `游戏模式·${d.title || id}`,
        state: payload.state || publicState(),
      }),
      // 夜校换一批字（与剧情同一条口径）：把这一场用过的词剔出候选，见 minigames-school*.js 的 avoid
      avoid: id === 'nightschool' ? arcadeSchoolUsed : [],
    },
  });
  if (id === 'nightschool') {
    const used = [
      ...(Array.isArray(op?.detail?.chars) ? op.detail.chars.map((c) => c.from) : []),
      op?.detail?.password,
    ].filter((w) => typeof w === 'string' && w);
    if (used.length) arcadeSchoolUsed = [...new Set([...arcadeSchoolUsed, ...used])].slice(-16);
  }
  const aborted = !!op?.detail?.aborted;
  const skipped = !!op?.detail?.skipped;
  const score = Number.isFinite(op?.score) ? Math.round(op.score * 100) : null;
  // 模型在局内写的收尾（例如编草鞋的「老班长瞅了瞅这只鞋」）也一并显示 ——
  // 那句话是模型读了这局工序数据写的，藏在 detail 里没人看见就白写了。
  const note = op?.detail?.keeperNote ? `　老班长：${op.detail.keeperNote}` : '';
  if (skipped) toast(`「${d.title}」跳过了 —— 换一支再玩`, 2400);
  else if (aborted) toast(`「${d.title}」这一局放弃了 —— 换一支再玩`, 2600);
  else toast(`${op?.summary || `「${d.title}」这一局结束`}${score === null ? '' : `　得分 ${score}`}${note}`, 4200);
}
