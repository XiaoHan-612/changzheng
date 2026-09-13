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
const KIND_HANDLED = new Set(['talk', 'fishing', 'school', 'rest', 'share', 'candy', 'sentry',
  'gomoku', 'grab', 'roster', 'choice', 'fire', 'march']);
// 只出现在强制链、不挂热点的节点（runForcedChain / finishAct 里单独实现）
const FORCED_ONLY = new Set(['fishing', 'soup', 'candy', 'sentry', 'path', 'luding', 'night']);

/** 从 main.js 源码里取 CHOICE_SETS 的顶层键（避免为了测试把 UI 模块拆开） */
function choiceSetKeys() {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/main.js'), 'utf8');
  const start = src.indexOf('const CHOICE_SETS = {');
  assert.ok(start > 0, '找不到 CHOICE_SETS');
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
