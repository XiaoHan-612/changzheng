// 一致性 lint：组件 CSS 里不允许出现颜色字面量，字体/圆角必须走变量。
//
// 为什么要它：视觉"不统一"的物理来源就是各处随手写死颜色——上一轮统计到 258 处
// （历史：cinema 115 / style 88 / minigames 28）。人眼记不住，脚本能记住。
//
// 规则：除 tokens.css 外的所有 CSS：
//   · 不许出现 #hex 或 rgb()/rgba()/hsl() 字面量（transparent / currentColor / inherit 除外）
//   · font-family 必须引用 var(--font*)
//   · border-radius 必须引用 var(--radius*)
// 债务只减不增：与 tools/token-baseline.json 比对，超出基线即失败。
// 用法：npm run qa:tokens            # 检查
//       npm run qa:tokens -- --update-baseline   # 记录当前基线（仅在一批打磨完成后做）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_DIR = path.join(ROOT, 'public/css');
const BASELINE = path.join(ROOT, 'tools/token-baseline.json');
const SKIP = new Set(['tokens.css', 'fonts.css']);

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
const OK_WORDS = /transparent|currentColor|inherit|none/i;

function scan() {
  const out = { colors: {}, fonts: {}, radius: {} };
  for (const f of fs.readdirSync(CSS_DIR).filter((x) => x.endsWith('.css') && !SKIP.has(x))) {
    const text = fs.readFileSync(path.join(CSS_DIR, f), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const isComment = /^\s*(?:\/\*|\*)/.test(line);
      if (isComment) return;
      const decl = line.split('/*')[0];
      if (OK_WORDS.test(decl)) { /* 允许的写法仍要计数里排除 */ }
      const colors = [...decl.matchAll(COLOR_RE)].filter((m) => !OK_WORDS.test(m[0]));
      if (colors.length && !OK_WORDS.test(decl)) {
        (out.colors[f] = out.colors[f] || []).push(`${i + 1}: ${decl.trim().slice(0, 90)}`);
      }
      const fam = /font-family\s*:\s*([^;]+)/.exec(decl);
      if (fam && !/var\(--font/.test(fam[1])) (out.fonts[f] = out.fonts[f] || []).push(`${i + 1}: ${fam[1].trim().slice(0, 60)}`);
      const rad = /border-radius\s*:\s*([^;]+)/.exec(decl);
      // 50% 是"画圆"不是设计尺度（头像、印章、圆点），允许
      if (rad && /\d/.test(rad[1]) && !/var\(--radius/.test(rad[1]) && !/^\s*50%\s*$/.test(rad[1])) {
        (out.radius[f] = out.radius[f] || []).push(`${i + 1}: ${rad[1].trim().slice(0, 60)}`);
      }
    });
  }
  return out;
}

const counts = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.length]));

function main() {
  const found = scan();
  const now = {
    colors: counts(found.colors),
    fonts: counts(found.fonts),
    radius: counts(found.radius),
  };
  const total = (o) => Object.values(o).reduce((s, n) => s + n, 0);

  if (process.argv.includes('--update-baseline')) {
    fs.writeFileSync(BASELINE, JSON.stringify(now, null, 2), 'utf8');
    console.log(`已更新基线：颜色 ${total(now.colors)} · 字体 ${total(now.fonts)} · 圆角 ${total(now.radius)}`);
    return;
  }

  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { colors: {}, fonts: {}, radius: {} };
  const problems = [];
  for (const kind of ['colors', 'fonts', 'radius']) {
    for (const [file, n] of Object.entries(now[kind])) {
      const b = base[kind][file] ?? 0;
      if (n > b) problems.push(`${file} 的${kind === 'colors' ? '颜色字面量' : kind === 'fonts' ? '硬编码字体' : '硬编码圆角'} 从 ${b} 涨到 ${n}`);
    }
  }
  console.log(`当前：颜色字面量 ${total(now.colors)} · 硬编码字体 ${total(now.fonts)} · 硬编码圆角 ${total(now.radius)}`);
  console.log(`基线：颜色 ${total(base.colors)} · 字体 ${total(base.fonts)} · 圆角 ${total(base.radius)}`);
  for (const [file, list] of Object.entries(found.colors)) {
    const b = base.colors[file] ?? 0;
    const tail = b ? `（基线 ${b}）` : '（新增文件）';
    console.log(`  ${file.padEnd(16)} ${String(list.length).padStart(3)} 处 ${tail}`);
  }
  console.log('');
  if (problems.length) {
    for (const p of problems) console.log('  ✗ ' + p);
    console.log(`\n一致性 lint 未通过：${problems.length} 项（债务只允许减少，不允许新增）`);
    process.exit(1);
  }
  console.log('✓ 一致性 lint 通过：没有新增的颜色/字体/圆角字面量');
}

main();
