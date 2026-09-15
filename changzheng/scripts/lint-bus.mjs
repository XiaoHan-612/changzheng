// 总线架构守卫（静态那半）：把"模块化"变成机器可查的规则，而不是靠自觉。
//
// 六条规则（对应 docs/BUS.md §规矩）：
//   ① 模块之间不许 import：modules/x 只能 import kernel/ 与自己的文件（要协作走事件或 kernel.api）
//   ② 订阅只写在描述符里：模块内不许出现 `bus.on(` / `kernel.bus.on(`
//   ③ 事件名必须登记：源码里出现的 emit/on 名字要在 kernel/contracts.js 里
//   ④ 模块必须在清单里：有描述符的模块目录要在 kernel/wiring.js 的 MODULES 里（防"注册了没人知道"）
//   ⑤ 状态写入只能在 state 模块（别处只读）
//   ⑥ state.js 的纯函数必须先 import（或走 st() 动作）——批 4 漏改一处就卡死过行军模式
//
// 用法：npm run qa:bus（静态这半 + 运行时那半 tests/e2e/bus-boot.mjs）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'public/js');
const KERNEL = path.join(JS, 'kernel');
const MODULES = path.join(JS, 'modules');

const problems = [];
const ok = [];

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const walkJs = (dir) => (fs.existsSync(dir)
  ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory() ? walkJs(path.join(dir, e.name)) : (e.name.endsWith('.js') ? [path.join(dir, e.name)] : [])
  ))
  : []);

/**
 * 剥注释：注释里提到的类名/事件名不该算违规（守卫只量代码）。
 * **关键：注释换成等长空格、换行保留**——这样剥离后的下标与原文一一对应，
 * 所有规则报的行号才是真行号（早先直接删注释，报出来的行号会偏十几行，白白浪费排查时间）。
 */
const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, (m) => ' '.repeat(m.length));

/** 报行号：剥离源码里的下标 → 真源码里的行号（两者等长，所以直接数换行即可） */
const lineAt = (strippedSrc, index) => strippedSrc.slice(0, index).split('\n').length;

// ── 读契约表与实际模块 ──
const contractsSrc = fs.readFileSync(path.join(KERNEL, 'contracts.js'), 'utf8');
const knownEvents = new Set([...contractsSrc.matchAll(/^\s*'([a-z]+:[a-z-]+)':\s*\{/gm)].map((m) => m[1]));

const moduleFiles = walkJs(MODULES).filter((f) => !f.endsWith('_template.js') && path.basename(f) === 'index.js');
// 清单也要先剥注释：wiring.js 里那行「怎么加一行」的示例写在注释里，不剥就会当成真清单（守卫自己的坑）
const wiringSrc = fs.readFileSync(path.join(KERNEL, 'wiring.js'), 'utf8');
const manifestNames = [...stripComments(wiringSrc).matchAll(/\{\s*name:\s*'([^']+)'/g)].map((m) => m[1]);

// ── ① 模块之间不许 import ──
{
  const offenders = [];
  for (const f of walkJs(MODULES)) {
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    const self = path.relative(MODULES, f).split(path.sep)[0];      // 顶层模块名
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;                          // 第三方/绝对路径不管
      const target = path.resolve(path.dirname(f), spec);
      const inModules = target.startsWith(MODULES);
      const targetTop = inModules ? path.relative(MODULES, target).split(path.sep)[0] : null;
      if (inModules && targetTop !== self) {
        offenders.push(`${rel(f)} → ${spec}（跨模块 import「${targetTop}」）`);
      }
      if (!target.startsWith(JS)) offenders.push(`${rel(f)} → ${spec}（import 到了 public/js 之外）`);
    }
  }
  if (offenders.length) problems.push(`模块之间不许直接 import：\n      ${offenders.join('\n      ')}`);
  else ok.push('模块之间没有直接 import（协作只走事件 / kernel.api）');
}

// ── ② 订阅只写在描述符里 ──
{
  const offenders = [];
  for (const f of walkJs(MODULES)) {
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/(?:^|[^.\w])(?:bus|kernel\.bus)\.(on|once)\s*\(/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${rel(f)}:${line} 出现 ${m[0].trim()}`);
    }
  }
  if (offenders.length) problems.push(`订阅必须写进描述符的 subscriptions（模块内不许 bus.on）：\n      ${offenders.join('\n      ')}`);
  else ok.push('订阅只出现在描述符里（模块内无 bus.on）');
}

// ── ③ 事件名必须登记 ──
{
  const offenders = [];
  const files = [...walkJs(JS)];
  for (const f of files) {
    if (f.startsWith(KERNEL + path.sep) && path.basename(f) === 'contracts.js') continue;   // 契约表自己
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/(?:emit|on|once)\s*\(\s*'([^']+)'/g)) {
      const name = m[1];
      if (!/^[a-z]+:[a-z-]+$/.test(name)) continue;                 // 只校验形如 xxx:yyy 的事件名
      if (!knownEvents.has(name)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${rel(f)}:${line} 用了未登记的事件「${name}」`);
      }
    }
  }
  if (offenders.length) problems.push(`事件必须先登记在 kernel/contracts.js：\n      ${offenders.join('\n      ')}`);
  else ok.push(`源码里出现的事件名都已登记（契约表 ${knownEvents.size} 条）`);
}

// ── ④ 模块必须在清单里 ──
{
  const missing = [];
  for (const f of moduleFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const m = src.match(/name:\s*'([^']+)'/);
    if (!m) { problems.push(`${rel(f)} 里找不到 name —— 模块必须 export default 一个描述符`); continue; }
    if (!manifestNames.includes(m[1])) missing.push(`${m[1]}（${rel(f)}）`);
  }
  const ghost = manifestNames.filter((n) => !moduleFiles.some((f) => new RegExp(`name:\\s*'${n}'`).test(fs.readFileSync(f, 'utf8'))));
  if (missing.length) problems.push(`模块没在 kernel/wiring.js 的 MODULES 清单里登记：${missing.join('、')}`);
  if (ghost.length) problems.push(`清单里列了但找不到模块文件（名单写错了）：${ghost.join('、')}`);
  if (!missing.length && !ghost.length) {
    ok.push(moduleFiles.length ? `清单与模块文件一致（${moduleFiles.length} 个模块）` : '清单与模块文件一致（当前 0 个模块，地基期正常）');
  }
}

// ── ⑤ 状态写入只能发生在 state 模块（或它的纯函数层 state.js）──
//
// 踩过的坑：这条规则里的 \b 曾被写成字面退格符，四条正则一条也匹配不上——
// 守卫照样报 ✓（假绿），于是"状态只有一条写路"实际上没人守。判断守卫死没死的办法只有一条：
// 故意写一行违规，看它红不红（本轮就是这么发现的）。
const MUTATORS = ['applyEffects', 'applyStarvation', 'addLoss', 'unlockFact', 'markLineDone', 'saveState'];
/**
 * 允许"把整个状态对象交出去"的**只读**函数（默认空：一律走 st() 动作或只读快照）。
 * 真有只读助手需要收整份状态时再往这里加，并写清为什么它不会改状态。
 */
const STATE_READERS = [];
{
  const offenders = [];
  // 字段名**不能用 \w**：本项目的状态字段大多是中文（体力/粮食/士气…），\w 一个也匹配不到，
  // 守卫又会变成"看着在守、其实漏光"（这一版的第一个负向用例就是这么发现的）。
  const FIELD = '[^\\s=(),;\\[\\]]+';
  const patterns = [
    [new RegExp('\\bS\\.' + FIELD + '\\s*(=(?!=)|[+\\-*]=|[|&]=|\\?\\?=|\\u002F=)'), '对 S 的字段赋值'],
    [new RegExp('\\bS\\.' + FIELD + '\\.(push|pop|shift|unshift|splice|sort|fill|reverse)\\s*\\('), '改 S 的数组'],
    [new RegExp('\\bS\\.' + FIELD + '\\[[^\\]]*\\]\\s*=(?!=)'), '往 S 的键值里写'],
    [new RegExp('\\bS\\.' + FIELD + '(\\+\\+|--)'), '自增/自减 S 的字段'],
    [new RegExp('\\b(' + MUTATORS.join('|') + ')\\s*\\(\\s*S\\b'), '把 S 交给写函数直接改（要走 st() 的动作）'],
  ];
  // 把**整个** S 交给别的函数：`applyOrigin(S, …)` 就是这么绕过写路的
  // （不广播 state:change → HUD 停在旧数字；2026-09-15 修）。
  // 注意 `S.x` / `S?.x` / `String(S.x)` 是"读字段"，不算。
  const handOver = /\b([A-Za-z_$][\w$]*)\s*\(\s*S(?![\w$.?])/;
  for (const f of walkJs(JS)) {
    const where = rel(f);
    if (/^public\/js\/modules\/state\//.test(where)) continue;   // store 本体
    if (/^public\/js\/state\.js$/.test(where)) continue;         // 纯函数层：它收到的 state 参数就是要改的
    const orig = fs.readFileSync(f, 'utf8');
    // 只查"手里真的握着状态别名"的文件：`S` 在别处可能只是个小局部变量
    // （minigames.js 里 `let S = {}` 是元素表，早先被这条规则误报过）。
    const holdsAlias = /\bst\(\)\./.test(orig)
      || /kernel\.api\('state'\)/.test(orig)
      || /modules\/state/.test(orig);
    if (!holdsAlias) continue;
    const stripped = stripComments(orig);
    for (const [re, what] of patterns) {
      const m = stripped.match(re);
      if (!m) continue;
      offenders.push(`${where}:${lineAt(stripped, m.index)} ${what}（${m[0].trim()}）`);
    }
    const h = stripped.match(handOver);
    if (h && !STATE_READERS.includes(h[1])) {
      offenders.push(`${where}:${lineAt(stripped, h.index)} 把整个 S 交给了 ${h[1]}()（写状态请走 st() 的动作，读请用快照或 S.字段）`);
    }
  }
  if (offenders.length) {
    problems.push(`写状态只有一条路：state 模块的语义动作 / apply()（见 docs/BUS.md）：\n      ${offenders.join('\n      ')}`);
  } else ok.push('状态的写入只发生在 modules/state（其它地方只读）');
}

// ── ⑥ 调用 state.js 的纯函数必须先 import（或走 st() 动作）──
//
// 为什么单列一条：批 4 把状态收归模块时，`addLoss(S, …)` 这种老写法被漏改了一处，
// 而它只在**行军模式的高风险抉择**上会被执行——e2e 走的是研学模式，谁都没碰它，
// 于是"玩到湘江护送就原地卡死"活到了全量验收才被 qa:loss 抓到（页面报 addLoss is not defined）。
// 静态上认得出这一类：state.js 导出的名字，在别的文件里既没 import、也没定义，却出现了调用。
{
  const offenders = [];
  const pureNames = [...fs.readFileSync(path.join(JS, 'state.js'), 'utf8')
    .matchAll(/export function ([\w$]+)/g)].map((m) => m[1]);
  for (const f of walkJs(JS)) {
    const where = rel(f);
    // 模块内部有自己的写法（走 kernel.api 拿到 state 动作），这里只管"非模块的页面脚本"
    if (where.startsWith('public/js/modules/') || where === 'public/js/state.js') continue;
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    const imported = new Set([...src.matchAll(/import\s*\{([^}]+)\}\s*from/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop())));
    const defined = new Set([...src.matchAll(/(?:function|class)\s+([\w$]+)|(?:const|let|var)\s+([\w$]+)\s*=/g)]
      .flatMap((m) => [m[1], m[2]]).filter(Boolean));
    for (const n of pureNames) {
      if (imported.has(n) || defined.has(n)) continue;
      const m = src.match(new RegExp('(^|[^.\\w$])' + n + '\\s*\\('));
      if (m) {
        offenders.push(`${where}:${lineAt(src, m.index)} 调了没导入的 ${n}()（批次重构后漏改？要走 st().${n}() 或先 import）`);
      }
    }
  }
  if (offenders.length) problems.push(`state.js 的纯函数必须先 import 再用：\n      ${offenders.join('\n      ')}`);
  else ok.push('state.js 的纯函数没有裸调用（要么 import，要么走 st() 动作）');
}

// ── 报告 ──
console.log('总线守卫（静态）：');
for (const o of ok) console.log('  ✓ ' + o);
if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\n✗ 总线守卫未通过：${problems.length} 项`);
  process.exit(1);
}
console.log('\n✓ 可以：模块化规则没有被写坏（运行时那半在 tests/e2e/bus-boot.mjs）');
