/**
 * flow/kit —— 流程层的**共用地基**（批 7 拆 main.js 时第一块搬出来的东西）。
 *
 * 它回答的是"流程代码都要用的那几样从哪儿拿"：
 *   · 状态：`st()` 写、`S` 读（**只读代理**，见下）、`hasS()` 判断有没有开局
 *   · 调用模型：`callAI()`（薄壳，实现与预算在 modules/ai）
 *   · 步骤契约：`step()` / `waitBtn()`（对 step.js 的两个常用封装）
 *   · 只读上下文：幕次数据 / 史实卡 / 运行配置（`getActsData()` 等，由 main.js 在 boot 时灌入）
 *   · 记流水：`logChoice` / `logShare` / `markDone` / `isDone` / `LINE_NAMES`
 *
 * 为什么 `S` 是个 **Proxy**：流程代码里有 80 多处 `S.体力` 这种读法（批 4 之前满天飞，
 * 现在只剩读）。搬文件时如果改成 `S().体力`，得动 80 多处、还得防漏；而直接 `import { S }`
 * 又会因为"谁给 S 赋值"变成共享可变状态。折中：S 是**读的视图**——每次取值都从 state 模块
 * 现读（比旧的"启动时抓一个引用"更准），**写会抛错**（提前暴露 "S.xxx = …" 这种违约写法，
 * 与 `qa:bus` 的静态规则同一条口径）。
 *
 * 这个文件只 import kernel/ 与共享工具层（step.js），**不 import 任何流程文件**——
 * 依赖方向单向：flow/* → kit → kernel/step/ui。别在这里写业务逻辑。
 */
import { kernel } from '../kernel/index.js';
import { setStep, setStepState, waitContinue } from '../step.js';

/* ── 状态：写走 st()，读走 S（只读代理） ── */
export const st = () => kernel.api('state');
/** 有没有开局（原 `if (!S)` 的替代：S 现在是对象，永远真值） */
export const hasS = () => !!st()?.raw?.();

export const S = new Proxy({}, {
  get: (_t, key) => {
    const raw = st()?.raw?.();
    return raw ? raw[key] : undefined;
  },
  set: (_t, key) => {
    // 与 qa:bus 静态规则⑤同一条口径：写状态只有 st() 的动作一条路。
    throw new Error(`别往 S.${String(key)} 写——S 是只读视图，写请走 st() 的语义动作（见 docs/BUS.md §三点五）`);
  },
  has: (_t, key) => {
    const raw = st()?.raw?.();
    return !!raw && key in raw;
  },
});

/* ── 玩法宿主、电影化播放器与模型调用（都是薄壳，实现在模块里） ── */
export const gamesApi = () => kernel.api('games');
/** 电影化：演一段拍子（序章 / 幕间 / 终章升华）。拍子与文案在 modules/cinema，流程层只管什么时候演 */
export const cinemaApi = () => kernel.api('cinema');
export function callAI(payload, opts) {
  return kernel.api('ai').ask(payload, opts);
}

/* ── 步骤契约的常用封装 ── */
export function step(id, kind = 'choice', state = 'awaiting') {
  setStep(id, kind, state);
}
export const waitBtn = waitContinue;

/** 「启程」按钮的刷新钩子：withLock 进出锁时要重画它，但那个按钮属于 act 那一块——
 *  用 setMarchUpdater() 注入，kit 因此不必 import 任何流程文件（这是打破 camp↔act 那处环的正规做法） */
let marchUpdater = null;
export const setMarchUpdater = (fn) => { marchUpdater = fn; };

/**
 * 流程锁：玩家入口（点热点/启程）占不到就**明说**（广播 resource:blocked，由 shell 提示），
 * 流程内部（幕末强制链、快速模式主玩法）占不到就直接跑——那种嵌套是设计内的。
 */
export async function withLock(fn, { from = 'user', label = 'flow' } = {}) {
  const isHeld = kernel.resources.isHeld('flow');
  if (isHeld && from === 'user') {
    kernel.resources.claim('flow', label);      // 故意再申请一次：失败会广播 resource:blocked，由 shell 提示
    return;
  }
  const mine = !isHeld;
  if (mine) {
    kernel.resources.claim('flow', label);
    setStepState('busy');                      // 与 step 状态联动：自动化据此"等待"，而不是"该点却点不动"
    marchUpdater?.();
  }
  try {
    return await fn();
  } finally {
    if (mine) {
      kernel.resources.release('flow', label);
      setStepState('awaiting');
      marchUpdater?.();
    }
  }
}

/* ── 只读上下文：main.js 在 boot 时灌入 ──
   （数据本身由 /api/data/* 取，属于"运行配置"，不是玩家状态——所以留在组合根持有） */
let actsData = null;
let facts = {};
let config = { model: 'glm-5.1', hasKey: false };
export const getActsData = () => actsData;
export const setActsData = (v) => { actsData = v; };
export const getFacts = () => facts;
export const setFacts = (v) => { facts = v; };
export const getConfig = () => config;
export const setConfig = (v) => { config = v; };

/** 当前幕的定义（幕轴 + 幕数据） */
export function currentActDef() {
  const order = actsData?.order || [];
  const idx = S.actIndex || 0;
  const id = order[idx];
  return actsData?.acts?.[id] || null;
}

/** 给模型看的当下状态（只含模型该知道的那部分；**不含**任何运行时/调试字段） */
export function publicState() {
  return {
    体力: S.体力, 粮食: S.粮食, 士气: S.士气, 信念: S.信念, 民心: S.民心,
    好感_老班长: S.好感_老班长, 好感_指导员: S.好感_指导员, 好感_红小鬼: S.好感_红小鬼,
    好感_卫生员: S.好感_卫生员, 好感_老乡: S.好感_老乡,
    tonightPassword: S.tonightPassword, 行动日志: S.行动日志, day: S.day, act: S.actIndex,
    附身线: (S.linesDone || []).map((k) => LINE_NAMES[k] || k),
    夜岗表现: S.sentryScore || 0,
    分糖方案: S.sugarPlan || null,
    夜间抉择: S.nightChoice || '',
  };
}

/* ── 记流水（都是 st() 的动作，这里只是给流程层一个短名字） ── */
export function logChoice(act, label, mood) {
  if (!hasS()) return;
  st().pushChoice({ act: act?.title || '—', label: String(label).slice(0, 40), mood: mood || '' });
}

export function logShare(label) {
  if (!hasS()) return;
  st().pushChoice({ act: `第 ${S.actIndex + 1} 幕 · 分享`, label: String(label).slice(0, 40), mood: '分粮' });
}

/** 附身线：点亮一条（幂等，由 state 模块判重） */
export function markDone(actId, key) {
  st().markDone(actId, key);
}
export function isDone(actId, key) {
  return !!(S.doneKeys && S.doneKeys[`${actId}:${key}`]);
}

/** 点亮一条附身线（幂等）；`opts.voluntary` 计入篝火夜门槛（强制链请传 false/省略） */
export function markLine(key, opts = {}) {
  if (!LINE_NAMES[key]) return;
  if (st().markLine(key, opts)) {
    st().pushCampLog('附身线', `点亮「${LINE_NAMES[key]}」（${st().linesDone()}/${LINES_TOTAL}）`);
  }
}

/** 附身线的名字（篝火夜的门槛按它算；`LINES_TOTAL` 是总数） */
export const LINE_NAMES = {
  fishing: '钓鱼分汤',
  candy: '分糖',
  sentry: '夜岗',
  school: '夜校识字',
  gomoku: '五子棋',
};
export const LINES_TOTAL = Object.keys(LINE_NAMES).length;
