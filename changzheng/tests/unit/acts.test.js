/**
 * 五幕数据完整性 — 单元测试
 *
 * 为什么要有：acts.json 是内容与代码的接缝。热点 id 写重、坐标出界、kind 拼错、
 * action 指向不存在的 CHOICE_SET —— 这些都不会让服务起不来，只会在玩到那一幕时炸。
 * 这里做静态校验，把"内容级错误"挡在跑一局之前。
 *
 * 运行：npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const acts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/acts.json'), 'utf8'));

// 由 main.js 实现的热点类型；改玩法时要同步这张表
// （luding 2026-09-17 从"只在强制链里"挪成热点：它原来挂在 act3 的 forced 上，
//   等于走到幕末自己弹出来 —— 玩家一个点都没点，就被塞了一整支玩法，用户反馈过这条）
const KIND_HANDLED = new Set(['talk', 'fishing', 'school', 'rest', 'share', 'candy', 'sentry',
  'gomoku', 'grab', 'roster', 'choice', 'fire', 'march', 'pontoon', 'rally', 'path', 'luding',
  // 2026-09-18 吸收的四支
  'skim', 'weave', 'antiphony', 'cipher']);
// 只出现在强制链、不挂热点的节点（runForcedChain / finishAct 里单独实现）
const FORCED_ONLY = new Set(['fishing', 'soup', 'candy', 'sentry', 'path', 'night', 'pontoon']);

/**
 * 从**整个流程层**源码里取 CHOICE_SETS 的顶层键。
 *
 * 批 7 把 main.js 拆成 flow/* 后这张表搬去了 `flow/tables.js`——所以别写死 main.js：
 * 扫 main.js + flow/*，表搬到哪都找得到。（踩过：写死 main.js 的同类扫描在搬迁后会
 * "找不到就返回空"，那种沉默才是真麻烦——这里 assert 住，找不到就红。）
 */
function choiceSetKeys() {
  const dir = path.join(ROOT, 'public/js');
  const flowDir = path.join(dir, 'flow');
  const files = ['main.js'].concat(fs.existsSync(flowDir)
    ? fs.readdirSync(flowDir).filter((f) => f.endsWith('.js')).map((f) => `flow/${f}`)
    : []);
  let src = '';
  for (const f of files) {
    try { src += fs.readFileSync(path.join(dir, f), 'utf8') + '\n'; } catch { /* 文件不在就算了 */ }
  }
  const start = src.indexOf('const CHOICE_SETS = {');
  assert.ok(start > 0, '整个流程层里都找不到 CHOICE_SETS（表搬到别处了？）');
  const body = src.slice(start, src.indexOf('\n};', start));
  return new Set([...body.matchAll(/^  ([a-z_]+): \{/gm)].map((m) => m[1]));
}

const eachDay = (act) => (Array.isArray(act.dayScenes) && act.dayScenes.length
  ? act.dayScenes.map((d) => ({ label: `day${d.day}`, hotspots: d.hotspots || [] }))
  : [{ label: 'default', hotspots: act.hotspots || [] }]);

test('order 与 acts 的键一一对应', () => {
  assert.deepEqual(acts.order.slice().sort(), Object.keys(acts.acts).sort());
});

test('每幕：id 一致、有主题、行动点为正整数、至少一个热点', () => {
  for (const id of acts.order) {
    const a = acts.acts[id];
    assert.equal(a.id, id, `${id} 的 id 与键不一致`);
    assert.ok(a.title && a.subtitle && a.date && a.theme, `${id} 文案字段不全`);
    assert.ok(Number.isInteger(a.apDays) && a.apDays > 0, `${id} apDays 非法`);
    assert.ok(Number.isInteger(a.apPerDay) && a.apPerDay > 0, `${id} apPerDay 非法`);
    for (const day of eachDay(a)) {
      assert.ok(day.hotspots.length >= 2, `${id}/${day.label} 热点过少`);
    }
  }
});

test('热点：字段齐全、坐标在画布内、kind 有实现、同一日内 id 不重复', () => {
  for (const id of acts.order) {
    const a = acts.acts[id];
    for (const day of eachDay(a)) {
      // 跨天可以复用 id（如每天都有 march），同一屏（同一天）内必须唯一
      const seen = new Set();
      for (const h of day.hotspots) {
        const where = `${id}/${day.label}/${h.id}`;
        assert.ok(h.id && h.label, `${where} 缺少 id 或 label`);
        assert.ok(!seen.has(h.id), `${where} 同一日内 id 重复`);
        seen.add(h.id);
        assert.ok(KIND_HANDLED.has(h.kind), `${where} kind=${h.kind} 没有实现`);
        assert.ok(Number.isFinite(h.x) && h.x >= 0 && h.x <= 100, `${where} x 越界：${h.x}`);
        assert.ok(Number.isFinite(h.y) && h.y >= 0 && h.y <= 100, `${where} y 越界：${h.y}`);
      }
    }
  }
});

test('choice 热点必须指向真实存在的 CHOICE_SET', () => {
  const keys = choiceSetKeys();
  for (const id of acts.order) {
    for (const day of eachDay(acts.acts[id])) {
      for (const h of day.hotspots) {
        if (h.kind !== 'choice') continue;
        assert.ok(h.action, `${id}/${h.id} 是 choice 热点但没有 action`);
        assert.ok(keys.has(h.action), `${id}/${h.id} 指向不存在的 CHOICE_SET：${h.action}`);
      }
    }
  }
});

test('forced 链上的每一步都有出处（热点 action / 热点 id / 专用节点）', () => {
  for (const id of acts.order) {
    const a = acts.acts[id];
    const reachable = new Set(FORCED_ONLY);
    for (const day of eachDay(a)) {
      for (const h of day.hotspots) {
        if (h.action) reachable.add(h.action);
        reachable.add(h.id);
      }
    }
    for (const f of a.forced || []) {
      assert.ok(reachable.has(f), `${id} 的强制节点 "${f}" 找不到对应热点或实现`);
    }
  }
});

test('本轮新增：二幕「油灯下的地图」独立热点已挂上且不与既有热点重叠', () => {
  const act2 = acts.acts.act2;
  const lamp = act2.hotspots.find((h) => h.id === 'oillamp');
  assert.ok(lamp, '二幕缺少 oillamp 热点');
  assert.equal(lamp.action, 'oillamp');
  assert.equal(lamp.kind, 'choice');
  assert.ok(choiceSetKeys().has('oillamp'), 'CHOICE_SETS 里没有 oillamp');
  const sameSpot = act2.hotspots.filter((h) => h.x === lamp.x && h.y === lamp.y);
  assert.equal(sameSpot.length, 1, '油灯地图与其他热点坐标重叠');
});

// 可重复热点（与 public/js/flow/tables.js 的 REPEATABLE_HOTSPOTS 一致）：能反复点
const REPEATABLE_KINDS = new Set(['fire', 'rest']);

test('每幕：行动点花得完（可点热点数 ≥ 预算，或有可反复点的休息/篝火）', () => {
  for (const id of acts.order) {
    const a = acts.acts[id];
    const budget = a.apDays * a.apPerDay;
    const days = eachDay(a);
    const count = days.reduce((n, d) => n + d.hotspots.filter((h) => h.kind !== 'march').length, 0);
    // 2026-09-17 校正口径：原来只数一次性热点，没算「休息/篝火**能反复点**」——
    // 有可重复热点的幕，剩下行动点时永远有点可点，不会"无事可做"。
    // 而且暮色是**每天的上限**：上限略高于当天任务数（每天 2~3 个任务）是正常配速，
    // 不是浪费（用户要的就是"任务都做得完、每天 2~3 个"）。
    // 真正要拦的是：既没有可重复热点、热点又少于行动点 —— 那才是白给行动点。
    const hasRepeatable = days.some((d) => d.hotspots.some((h) => REPEATABLE_KINDS.has(h.kind)));
    assert.ok(count >= budget || hasRepeatable,
      `${id}：行动点 ${budget}、可点热点只有 ${count} 个，且没有可重复热点（休息/篝火）—— 会有行动点却无事可做`);
  }
});

test('新增热点的坐标不与同幕其他热点重叠', () => {
  for (const id of acts.order) {
    const a = acts.acts[id];
    for (const day of eachDay(a)) {
      const seen = new Map();
      for (const h of day.hotspots) {
        const key = `${h.x},${h.y}`;
        assert.ok(!seen.has(key), `${id}/${day.label}：${h.id} 与 ${seen.get(key)} 坐标重叠（${key}）`);
        seen.set(key, h.id);
      }
    }
  }
});
