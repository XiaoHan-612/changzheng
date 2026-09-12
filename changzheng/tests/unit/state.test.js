/**
 * 资源与副作用 — 单元测试
 * 运行：npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyEffects, unlockFact } from '../../public/js/state.js';

test('createState 默认五维与锁字段', () => {
  const s = createState();
  assert.equal(s.体力, 72);
  assert.equal(s.ap, 2);
  assert.equal(s.busy, false);
  assert.deepEqual(s.doneKeys, {});
});

test('applyEffects 钳制资源上下限', () => {
  const s = createState();
  s.体力 = 95;
  s.粮食 = 1;
  const changes = applyEffects(s, { 体力: 20, 粮食: -5, 不存在: 3 });
  assert.equal(s.体力, 100);
  assert.equal(s.粮食, 0);
  assert.ok(changes.some((c) => c.includes('体力')));
  assert.ok(changes.some((c) => c.includes('粮食')));
  assert.equal(s.不存在, undefined);
});

test('applyEffects 忽略非法数值', () => {
  const s = createState();
  const before = s.士气;
  applyEffects(s, { 士气: 'x', 信念: null });
  assert.equal(s.士气, before);
});

test('unlockFact 幂等', () => {
  const s = createState();
  assert.equal(unlockFact(s, 'h_depart'), true);
  assert.equal(unlockFact(s, 'h_depart'), false);
  assert.deepEqual(s.unlockedFacts, ['h_depart']);
});

test('好感可增减且钳制', () => {
  const s = createState();
  s.好感_老班长 = 98;
  applyEffects(s, { 好感_老班长: 10 });
  assert.equal(s.好感_老班长, 100);
  applyEffects(s, { 好感_老班长: -200 });
  assert.equal(s.好感_老班长, 0);
});
