/**
 * 步骤契约 —— 全项目唯一的「当前在做什么」真相。
 *
 * 为什么需要它：
 *   以前进度只存在内存（S.busy / doneKeys），DOM 里没有"当前步骤"的表示。
 *   于是"元素还在 DOM 里"被当成"当前场景"，出现过度依赖残留节点、每个玩法各写一套交互、
 *   测试脚本必须认识每个屏的元素 id 等一串问题。
 *
 * 约定（写入 DOM，人和自动化都读它）：
 *   body[data-step]        当前步骤 id，如 origin（开场出身）/ act2:direction / act4:candy / camp / quiz
 *   body[data-step-kind]   步骤类型：choice | minigame | talk | quiz | camp | cutscene | echo | end
 *   body[data-step-state]  awaiting | busy | done
 *   交互元素统一带：
 *     [data-action="continue|pick|hotspot|march|skip"]   通用动作
 *     [data-choice-index="N"]                            选项（askChoice 产出）
 *     [data-mini-action="..."]                           小游戏内的操作
 *                                                        （fishing/needle/candy/sentry/school/gomoku/luding/grab）
 *   小游戏容器：host[data-mini="gomoku"] + host[data-mini-state="player|ai|done"]
 *
 * 结果：新增玩法只需声明契约；测试驱动只看契约，不认具体元素 id。
 */

import { $, replayAnim } from './ui.js';

/** 开始一个步骤 */
export function setStep(id, kind = 'choice', state = 'awaiting') {
  const b = document.body;
  b.dataset.step = String(id || '');
  b.dataset.stepKind = kind;
  b.dataset.stepState = state;
}

/** 更新步骤状态（busy/awaiting/done），id/kind 不变 */
export function setStepState(state) {
  document.body.dataset.stepState = state;
}

export function getStep() {
  const b = document.body;
  return { id: b.dataset.step || '', kind: b.dataset.stepKind || '', state: b.dataset.stepState || '' };
}

export function endStep() {
  const b = document.body;
  delete b.dataset.step;
  delete b.dataset.stepKind;
  delete b.dataset.stepState;
}

/**
 * 唯一的选择题渲染实现（取代原来抄了 5 遍的"渲染选项→禁用→resolve"）。
 * @param {HTMLElement} host 容器
 * @param {Array<{label:string, sub?:string, icon?:string}>} options
 * @param {{keyboard?:boolean, extraOf?:(o:any)=>string}} [opts]
 * @returns {Promise<{label:string, index:number, raw:any}>}
 */
export function askChoice(host, options, opts = {}) {
  return new Promise((resolve) => {
    const box = host || $('stage-panel');
    box.classList.add('choice-row');
    box.dataset.choiceHost = '1';
    box.innerHTML = '';
    (options || []).forEach((o, i) => {
      const b = choiceButton({
        label: o.label,
        sub: o.sub,
        icon: o.icon,
        extra: opts.extraOf ? opts.extraOf(o) : '',
        index: i,
      });
      b.addEventListener('click', () => {
        box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        setStepState('busy');
        resolve({ label: o.label, index: i, raw: o });
      });
      box.appendChild(b);
    });
    // 逐条入场：选项一条一条渗出来（同一容器复用时靠 replayAnim 重新触发）
    replayAnim(box, 'anim-stagger');
  });
}

/**
 * 选项按钮的**唯一**构建实现。
 *
 * 结构契约（样式在 framework.css 的 .blk-choice）：
 *   <span class="ic">     序号/图标（可省）
 *   <span class="ch-text"> <b>主文案</b> + <span class="ch-sub">副文案</span>（可省）
 *                          + <span class="ch-extra">代价预告/风险标签</span>（由 extraOf 产出）
 *   <span class="kbd-hint"> 键盘序号
 *
 * 为什么要抽出来：篝火菜单与交谈快捷句原先各自手拼 innerHTML，迁移到 blk-choice 时
 * 就是它们先漂移（少了 ch-text 包裹，副文案字号跟着主文案走）。**新增选项一律走这里。**
 *
 * @param {{label:string, sub?:string, icon?:string, extra?:string, index?:number, action?:string, keyboard?:boolean}} o
 */
export function choiceButton(o = {}) {
  const { label = '', sub = '', icon = '', extra = '', index = 0, action = '' } = o;
  const keyboard = o.keyboard !== false && index < 9;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'blk-choice';
  b.dataset.choiceIndex = String(index);
  if (action) b.dataset.action = action;
  b.innerHTML = [
    icon ? `<span class="ic">${esc(icon)}</span>` : '',
    `<span class="ch-text"><b>${esc(label)}</b>${sub ? `<span class="ch-sub">${esc(sub)}</span>` : ''}${extra}</span>`,
    keyboard ? `<span class="kbd-hint">${index + 1}</span>` : '',
  ].join('');
  return b;
}

/**
 * 唯一的「继续」按钮实现（带契约标记）。
 * @param {string} label
 * @param {HTMLElement} [hostEl]
 */
export function waitContinue(label = '继续', hostEl) {
  return new Promise((resolve) => {
    const host = hostEl || $('sheet-actions') || $('stage-panel') || document.body;
    host.querySelectorAll('[data-action="continue"]').forEach((n) => n.remove());
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary';
    btn.id = 'btn-continue';
    btn.dataset.action = 'continue';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      btn.remove();
      setStepState('awaiting');
      resolve();
    });
    host.appendChild(btn);
  });
}

/** 给已经存在的按钮补上契约标记（热点 / 启程 / 过场 / 回响等历史入口） */
export function markAction(el, action) {
  if (el && el.dataset) el.dataset.action = action;
  return el;
}

/** 小游戏容器统一声明契约 */
export function markMini(host, name, state = 'awaiting') {
  if (!host) return host;
  host.dataset.mini = name;
  host.dataset.miniState = state;
  return host;
}

export function setMiniState(host, state) {
  if (host) host.dataset.miniState = state;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
