// 收料工具：把同事重做的玩法源码接上我们的"缝合点"（幂等，可反复跑）。
//
// 为什么要有它：同事那条线是**单独开发**的（他们自己的 audio.js / 数值签写法 / 注册表），
// 而我们的架构规定：玩法不碰音频门面（声音只走总线事件）、数值签归宿主、宿主负责收尾。
// 两边差的只有三处**固定缝合点**，本工具就只改这三处、别的代码一个字不动——
// 他们下次发来新版本，把文件丢进 `src/` 再跑一次即可，不必手工比对。
//
//   ① `import { audio } from './audio.js'` + `audio.playSfx(` → 注入式 `SFX(`（宿主给 ctx.sfx）
//   ② 各自的 `stats(host, items)` helper → 转发给宿主 `STATS(items)`（数值签由 ctx.stats 唯一实现）
//   ③ 文件头顶部注释之后插入 `bindHost()` 出口：宿主在 mount 时把 sfx/stats/decide 注入进来
//   ④ `import { decide } from './ai-client.js'` + `decide(payload, {signal})` → 注入式 `DECIDE(payload)`：
//      模型调用归**流程层**（flow 用 modules/ai 的 callAI 发起），玩法只调这个回调——
//      这样预算/账目/重试都在 modules/ai 的 registry 里统一管（他们那条线是自己 POST /api/decide）
//
// 两条必须守住的实现细节（第一版踩过，见 HANDOFF-CODE 坑 57）：
//   · **注释里的 `function stats(` 会被正则当成真函数**（他们的注释里就写着签名）→ 先算注释区间，
//     落在注释里的匹配一律跳过；找不到真 helper 就**报错退出**，绝不"猜一个位置"乱改。
//   · 注入块插在**顶部块注释之后**，不要插在文件最前面（那会把文件头注释切两半）。
//
// 用法：node tools/intake-minigames.mjs [--check]
//   --check 只报告状态、不改文件（守卫用）；发现"没找到真 helper"等异常一律非零退出。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public/js/modules/games/src');
const CHECK = process.argv.includes('--check');
const SKIP = new Set(['minigames.js', 'minigames-registry.js', 'minigames-story.js']);

/** 注释区间（`/* … *​/` 与 `// …`），用于跳过注释里的匹配 */
function commentSpans(src) {
  const spans = [];
  for (let i = 0; i < src.length - 1; i++) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const e = end < 0 ? src.length : end + 2;
      spans.push([i, e]);
      i = e - 1;
    } else if (src[i] === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      const e = end < 0 ? src.length : end;
      spans.push([i, e]);
      i = e - 1;
    }
  }
  return spans;
}
const inComment = (spans, i) => spans.some(([a, b]) => i >= a && i < b);

/** 顶部块注释之后的插入点（没有块注释就插在最前面） */
function afterHeader(src) {
  const m = /^\/\*[\s\S]*?\*\//m.exec(src);
  if (!m) return 0;
  let i = m.index + m[0].length;
  if (src[i] === '\n') i += 1;
  return i;
}

/** 真的 `function stats(…) {` 定义（行首、同行有 `{`、不在注释里），返回 [start, end) */
function statsSpan(src, spans) {
  const re = /^function stats\(([^)]*)\)\s*\{/gm;
  for (const m of src.matchAll(re)) {
    if (inComment(spans, m.index)) continue;
    let j = src.indexOf('{', m.index);
    let depth = 0;
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') depth += 1;
      else if (src[k] === '}') { depth -= 1; if (depth === 0) return [m.index, k + 1]; }
    }
    return null;                       // 找到定义但括号不配平：报错，不猜
  }
  return null;
}

const BIND_BLOCK = `
/* ── 宿主注入（我们的架构：玩法不碰音频门面、数值签归宿主）────────────────
 * 这一段由 tools/intake-minigames.mjs 插入；要改缝合方式请改工具，别手改这里。
 * 宿主（modules/games/adapter.js）在装配这一支时调 bindHost({sfx, stats, decide})：
 *   sfx(name)     音效：宿主转成总线事件 sfx:play（玩法不认识音频框架）
 *   stats(items)  数值签：宿主唯一实现，返回句柄（{标签: <b>元素}）
 *   decide(payload) 需要模型时由流程层注入（玩法自己不发请求，见 docs/MINIGAMES-INTAKE.md）
 */
let SFX = () => {};
let STATS = (items) => items;
let DECIDE = null;
export function bindHost(h = {}) {
  if (h.sfx) SFX = h.sfx;
  if (h.stats) STATS = h.stats;
  if (h.decide) DECIDE = h.decide;
}
`;
/** 只换函数体、签名照旧：他们的调用点形如 stats(host, rows) / stats(opts.stats, rows) */
const STATS_BODY = 'function stats(_host, items) { return STATS(items); }';

const files = fs.readdirSync(SRC).filter((f) => /^minigames-/.test(f) && f.endsWith('.js') && !SKIP.has(f));
const report = [];
let fatal = 0;

for (const f of files) {
  const p = path.join(SRC, f);
  let s = fs.readFileSync(p, 'utf8');
  // 幂等是**按缝合点**算的，不是按文件：新加一处缝合时，老文件也要能补上（踩过：按文件跳过，
  // 结果第 ④ 处 decide 缝合对已插过注入块的文件集体失效）
  const hasBind = s.includes('export function bindHost(');

  const spans = commentSpans(s);
  const importRe = /^import .*from '\.\/audio\.js';?[^\n]*\n/gm;
  const nImport = [...s.matchAll(importRe)].filter((m) => !inComment(spans, m.index)).length;
  const nSfx = [...s.matchAll(/audio\.playSfx\(/g)].filter((m) => !inComment(spans, m.index)).length;
  const nDecide = [...s.matchAll(/from '\.\/ai-client\.js'/g)].filter((m) => !inComment(spans, m.index)).length;
  const span = statsSpan(s, spans);
  const statsPatched = /^function stats\(_host, items\) \{ return STATS\(items\); \}/m.test(s);

  if (CHECK) {
    const pending = !!(nImport || nSfx || nDecide || !hasBind || (span && !statsPatched));
    report.push([f, pending ? '未接入' : '已接入', nImport, nSfx, !!span, nDecide]);
    continue;
  }
  if (!span && (nSfx || nImport)) {
    report.push([f, '**找不到真 stats helper**', nImport, nSfx, false, nDecide]);
    fatal += 1;
    continue;                                        // 有音效/音频 import 却找不到 helper：不猜位置
  }

  // ① 删 audio import → 顶部注释之后插注入块（没有缝合点的支也插：将来加音效时口子是现成的）
  s = s.replace(importRe, '');
  if (!hasBind) {
    const at = afterHeader(s);
    s = s.slice(0, at) + BIND_BLOCK + s.slice(at);
  }
  if (!span) {                                        // 没有 stats helper（如入口小屏）：只插注入块
    fs.writeFileSync(p, s);
    report.push([f, hasBind ? '已接入' : '已接入（无缝合点，仅注入）', nImport, nSfx, false, nDecide]);
    continue;
  }
  // ④ decide → 注入式 DECIDE（先删 import，再改名；只动注释外的）
  s = s.replace(/^import \{[^}]*\bdecide\b[^}]*\} from '\.\/ai-client\.js';?[^\n]*\n/gm, '');
  {
    const sp = commentSpans(s);
    let acc = '';
    let cur = 0;
    for (const m of s.matchAll(/(?<![\w.])decide\(/g)) {
      if (inComment(sp, m.index)) continue;
      acc += s.slice(cur, m.index) + 'DECIDE(';
      cur = m.index + 'decide('.length;
    }
    acc += s.slice(cur);
    s = acc;
  }
  // ② playSfx → SFX（只替换注释外的）
  const spans2 = commentSpans(s);
  let out = '';
  let last = 0;
  for (const m of s.matchAll(/audio\.playSfx\(/g)) {
    if (inComment(spans2, m.index)) continue;
    out += s.slice(last, m.index) + 'SFX(';
    last = m.index + 'audio.playSfx('.length;
  }
  out += s.slice(last);
  s = out;
  // ③ stats helper：只换体（按新的位置重算 span，保持行号稳定）
  const span2 = statsSpan(s, commentSpans(s));
  s = s.slice(0, span2[0]) + STATS_BODY + s.slice(span2[1]);
  fs.writeFileSync(p, s);
  report.push([f, nImport || nSfx || span ? '已改造' : '已接入（本就无缝合点）', nImport, nSfx, true]);
}

console.log(`收料：${files.length} 个源码文件`);
for (const [f, st, a, b, c, d] of report) {
  const ok = st === '已接入' || st === '已改造' || st === '已接入（无缝合点，仅注入）';
  console.log(`  ${ok ? '✓' : '✗'} ${f.padEnd(26)} ${st}`
    + (st === '已接入' ? '' : `（import ${a ?? 0} · playSfx ${b ?? 0} · helper ${c ? '有' : '无'} · decide ${d ?? 0}）`));
}
if (fatal) { console.log(`\n✗ ${fatal} 个文件没找到真 stats helper（工具拒绝瞎猜位置）——人工看一眼再跑`); process.exit(1); }
if (CHECK && report.some((r) => r[1] === '未接入')) { console.log('\n✗ 有文件还没接缝合点——跑 npm run intake:minigames'); process.exit(1); }
console.log('\n✓ 全部接上缝合点（幂等：再跑不会重复插入）');
