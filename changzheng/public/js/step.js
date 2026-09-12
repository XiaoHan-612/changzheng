/**
 * 步骤契约 —— 全项目唯一的「当前在做什么」真相。
 *
 * 为什么需要它：
 *   以前进度只存在内存（S.busy / doneKeys），DOM 里没有"当前步骤"的表示。
 *   于是"元素还在 DOM 里"被当成"当前场景"，出现过度依赖残留节点、每个玩法各写一套交互、
 *   测试脚本必须认识每个屏的元素 id 等一串问题。
 *
 * 约定（写入 DOM，人和自动化都读它）：
 *   body[data-step]        当前步骤 id，如 act2:direction / act4:candy / camp / quiz
 *   body[data-step-kind]   步骤类型：choice | minigame | talk | quiz | camp | cutscene | echo | end
 *   body[data-step-state]  awaiting | busy | done
 *   交互元素统一带：
 *     [data-action="continue|pick|hotspot|march|skip"]   通用动作
 *     [data-choice-index="N"]                            选项（askChoice 产出）
 *     [data-mini-action="..."]                           小游戏内的操作
 *   小游戏容器：host[data-mini="gomoku"] + host[data-mini-state="player|ai|done"]
 *
 * 结果：新增玩法只需声明契约；测试驱动只看契约，不认具体元素 id。
 */

import { $ } from './ui.js';

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
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn choice';
      b.dataset.choiceIndex = String(i);
      const extra = opts.extraOf ? opts.extraOf(o) : '';
      b.innerHTML = [
        `<span class="ic">${o.icon || String.fromCharCode(65 + i)}</span>`,
        '<span class="ch-text">',
        `<b>${esc(o.label)}</b>`,
        o.sub ? `<span class="ch-sub">${esc(o.sub)}</span>` : '',
        extra ? `<span class="ch-extra">${extra}</span>` : '',
        '</span>',
        i < 9 ? `<span class="kbd-hint">${i + 1}</span>` : '',
      ].join('');
      b.addEventListener('click', () => {
        box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        setStepState('busy');
        resolve({ label: o.label, index: i, raw: o });
      });
      box.appendChild(b);
    });
  });
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
