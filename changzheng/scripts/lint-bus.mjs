// 总线架构守卫（静态那半）：把"模块化"变成机器可查的规则，而不是靠自觉。
//
// 四条规则（对应 docs/BUS.md §规矩）：
//   ① 模块之间不许 import：modules/x 只能 import kernel/ 与自己的文件（要协作走事件或 kernel.api）
//   ② 订阅只写在描述符里：模块内不许出现 `bus.on(` / `kernel.bus.on(`
//   ③ 事件名必须登记：源码里出现的 emit/on 名字要在 kernel/contracts.js 里
//   ④ 模块必须在清单里：有描述符的模块目录要在 kernel/wiring.js 的 MODULES 里（防"注册了没人知道"）
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

/** 剥注释：注释里提到的类名/事件名不该算违规（守卫只量代码） */
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

// ── 报告 ──
console.log('总线守卫（静态）：');
for (const o of ok) console.log('  ✓ ' + o);
if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\n✗ 总线守卫未通过：${problems.length} 项`);
  process.exit(1);
}
console.log('\n✓ 可以：模块化规则没有被写坏（运行时那半在 tests/e2e/bus-boot.mjs）');
