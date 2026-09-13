/**
 * 数值护栏 — 单元测试
 *
 * 背景：实测一局体力净 −152、信念 +79（起始 70 / 上限 100），"选择"因此没有代价。
 * 这张表是唯一的钳制点，改数值口径必须同时改这里。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEffects, EFFECT_LIMIT, MAX_DIMS } from '../../server/balance.js';

test('单维封顶：超出上限的数值被夹回来', () => {
  assert.deepEqual(normalizeEffects('branch_judge', { 体力: -15 }), { 体力: -8 });
  assert.deepEqual(normalizeEffects('branch_judge', { 体力: 99 }), { 体力: 8 });
  assert.deepEqual(normalizeEffects('branch_judge', { 粮食: -5 }), { 粮食: -2 });
  assert.deepEqual(normalizeEffects('branch_judge', { 好感_老班长: 9 }), { 好感_老班长: 4 });
});

test('单次最多影响 3 个维度', () => {
  const input = { 体力: -5, 士气: 5, 民心: 5, 粮食: -1, 好感_老班长: 2 };
  assert.equal(Object.keys(normalizeEffects('branch_judge', input)).length, MAX_DIMS);
});

test('信念只在关键抉择与夜间议事上正向增长', () => {
  assert.deepEqual(normalizeEffects('branch_judge', { 信念: 6 }), { 信念: 6 });
  assert.deepEqual(normalizeEffects('night_resolve', { 信念: 4 }), { 信念: 4 });
  // 小游戏/分享/答题不该加信念
  assert.deepEqual(normalizeEffects('minigame_review', { 信念: 6 }), {});
  assert.deepEqual(normalizeEffects('share_judge', { 信念: 5 }), {});
  assert.deepEqual(normalizeEffects('quiz_judge', { 信念: 3 }), {});
  // 但负向信念（挫败）任何 callType 都允许
  assert.deepEqual(normalizeEffects('minigame_review', { 信念: -4 }), { 信念: -4 });
});

test('小数取整，0 值不写入', () => {
  assert.deepEqual(normalizeEffects('branch_judge', { 体力: -3.6 }), { 体力: -4 });
  assert.deepEqual(normalizeEffects('branch_judge', { 体力: 0.2 }), {});
});

test('未登记维度与非法值直接丢弃', () => {
  assert.deepEqual(normalizeEffects('branch_judge', { 安全感: 5, 体力: NaN, 士气: '3' }), {});
  assert.deepEqual(normalizeEffects('branch_judge', null), {});
  assert.deepEqual(normalizeEffects('branch_judge', undefined), {});
});

test('钳制表覆盖五维与全部好感维度', () => {
  for (const k of ['体力', '粮食', '士气', '信念', '民心']) {
    assert.ok(EFFECT_LIMIT[k] > 0, `${k} 缺少上限`);
  }
  for (const k of Object.keys(EFFECT_LIMIT)) {
    assert.ok(Math.abs(EFFECT_LIMIT[k]) <= 8, `${k} 的单次幅度过大（>8）`);
  }
});
