// 玩法插件的架构守卫（同事那条线接进来之后新增）。
//
// 为什么是**静态读源码**而不是 import 那些模块：玩法源码是同事那条线的，**加载时就碰 DOM**
// （canvas/样式/元素探测），在 Node 里 import 会 `document is not defined`。
// 所以这里只读文本、按卡片区段解析——顺带还能守住"依赖方向"（src 不许 import 自己目录外的东西）。
//
// 它守的四类漂移（都是"接缝处"的、玩到那一局才会暴露的东西）：
//   ① manifest 的键 == 插件的 id == 卡片的 id：对不上 `data-mini` 就与 qa:board / e2e 认的不是一支；
//   ② 每支卡片必须有 `actions`（qa:board 的三方对账靠它）；
//   ③ `src/*.js` 里的音效名必须都在 `audio/sfx-table.js` 里（否则只是"告警 + 通用音"，
//      听起来不对却不会报错——rally 的 `thud` 就是这么漏的）；
//   ④ src 不许 import 自己目录外的模块（缝合点没接干净时，这里会先红——`npm run intake:minigames:check` 是第二道）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SFX_TABLE } from '../../public/js/audio/sfx-table.js';
// 流程层可以在 Node 里导入（只碰 DOM 的模块都在 src/ 那边）——固定效果的边界与单调性在这里测
import { fixedEffectsFor } from '../../public/js/flow/games-flow.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GDIR = path.join(ROOT, 'public/js/modules/games');
const SRC = path.join(GDIR, 'src');
const read = (p) => fs.readFileSync(p, 'utf8');

/** manifest：`import 名 from './文件.js'` + `GAMES = { 键: 名, … }` */
function manifest() {
  const src = read(path.join(GDIR, 'manifest.js'));
  const imports = Object.fromEntries([...src.matchAll(/^import\s+(\w+)\s+from\s+'\.\/([\w.-]+\.js)'/gm)]
    .map((m) => [m[1], m[2]]));
  const gmap = src.slice(src.indexOf('export const GAMES'));
  // 两种写法都要认：`名字,`（简写）与 `'键': 变量,`
  const rows = [...gmap.matchAll(/^\s*(?:'([\w-]+)'|(\w+))\s*(?::\s*(\w+))?,/gm)]
    .map((m) => [m[1] || m[2], m[3] || m[1] || m[2]]);
  return { imports, rows };
}

/** 插件文件：取出它引的 src 模块、槽 id、卡片 id */
function plugin(file) {
  const src = read(path.join(GDIR, file));
  const mods = [...src.matchAll(/from\s+'\.\/src\/([\w.-]+\.js)'/g)].map((m) => m[1]);
  const id = (/(?:^|\s)id:\s*'([\w-]+)'/.exec(src) || [])[1] || '';
  const cardId = (/cardId:\s*'([\w-]+)'/.exec(src) || [])[1] || id;
  return { src, mods, id, cardId };
}

/** 卡片区段（`export const X_MINIGAMES = [ … ]`，按方括号配平） */
function card(srcFile) {
  const s = read(path.join(SRC, srcFile));
  const m = /export const [A-Z_]+_MINIGAMES\s*=\s*\[/.exec(s);
  if (!m) return null;
  let depth = 0;
  let end = m.index + m[0].length - 1;
  for (let i = end; i < s.length; i++) {
    if (s[i] === '[') depth += 1;
    else if (s[i] === ']') { depth -= 1; if (!depth) { end = i; break; } }
  }
  return s.slice(m.index + m[0].length - 1, end);
}

const M = manifest();
const games = M.rows.map(([key, local]) => ({ key, local, file: M.imports[local] }));

test('玩法清单：每行的 import 都在、文件都在', () => {
  assert.ok(games.length >= 10, `清单里只有 ${games.length} 支玩法`);
  for (const g of games) {
    assert.ok(g.file, `GAMES 里的「${g.key}」没有对应的 import`);
    assert.ok(fs.existsSync(path.join(GDIR, g.file)), `插件文件不在：${g.file}`);
  }
});

test('玩法插件：manifest 键 == 插件 id == 卡片 id（data-mini 才对得上）', () => {
  for (const g of games) {
    const p = plugin(g.file);
    assert.equal(p.id, g.key, `${g.file} 的 id「${p.id}」与 manifest 键「${g.key}」不一致`);
    assert.ok(p.mods.length >= 1, `${g.file} 没有引任何 src 模块`);
    for (const f of p.mods) {
      assert.ok(fs.existsSync(path.join(SRC, f)), `${g.file} 引的 src/${f} 不在`);
    }
    const cardSrc = p.mods.map(card).find((c) => c && new RegExp(`id:\\s*'${p.cardId}'`).test(c));
    assert.ok(cardSrc, `${g.file} 的卡片里找不到 id='${p.cardId}'（cardId 与卡片对不上）`);
    assert.ok(/actions:\s*\[[^\]]+\]/.test(cardSrc), `${g.file} 的卡片没声明 actions（qa:board 三方对账需要）`);
  }
});

test('玩法源码：不许 import 自己目录之外的模块（依赖方向）', () => {
  const bad = [];
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.js'))) {
    const src = read(path.join(SRC, f));
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
      if (!m[1].startsWith('./')) bad.push(`${f} → ${m[1]}`);
    }
  }
  assert.deepEqual(bad, [], `玩法源码引了目录外的模块（缝合点没接干净？）：${bad.join('、')}`);
});

test('玩法源码用到的音效名都已登记（不然只是告警 + 通用音）', () => {
  const known = new Set(Object.keys(SFX_TABLE));
  const used = new Map();
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.js'))) {
    for (const m of read(path.join(SRC, f)).matchAll(/SFX\('([a-z_]+)'\)/g)) {
      if (!used.has(m[1])) used.set(m[1], f);
    }
  }
  const missing = [...used.entries()].filter(([name]) => !known.has(name));
  assert.deepEqual(missing.map(([n, f]) => `${n}（${f}）`), [], '这些音效名不在 sfx-table.js 里');
});

test('不需要模型的玩法：固定效果有界、单调，且不碰信念', () => {
  const hi = fixedEffectsFor({ score: 0.9 });
  const mid = fixedEffectsFor({ score: 0.5 });
  const lo = fixedEffectsFor({ score: 0.1 });
  assert.ok(hi.士气 > mid.士气 && mid.士气 > lo.士气, '士气应随分单调');
  assert.ok(hi.体力 > lo.体力, '分高不该掉更多体力');
  for (const e of [hi, mid, lo]) {
    for (const [k, v] of Object.entries(e)) {
      assert.ok(Math.abs(v) <= 8, `${k} 的固定效果 ${v} 超出单次上限（数值护栏是 ±8 量级）`);
    }
    assert.equal('信念' in e, false, '固定效果不碰信念（那是关键抉择才动的维度）');
  }
  assert.deepEqual(fixedEffectsFor(null), lo, '拿不到结果时按最差档处理');
});
