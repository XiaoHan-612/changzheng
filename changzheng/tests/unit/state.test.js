/**
 * 资源与副作用 — 单元测试
 * 运行：npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyEffects, unlockFact } from '../../public/js/state.js';
import { markLineDone, linesDoneCount, canNight, apPerDay, dayScene, checkFailure } from '../../public/js/state.js';

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

test('附身线：幂等计数 + 篝火夜门槛 ≥3', () => {
  const s = createState();
  assert.equal(linesDoneCount(s), 0);
  assert.equal(canNight(s), false);
  assert.equal(markLineDone(s, 'fishing'), true);
  assert.equal(markLineDone(s, 'fishing'), false);
  markLineDone(s, 'candy');
  assert.equal(canNight(s), false);
  markLineDone(s, 'sentry');
  assert.equal(linesDoneCount(s), 3);
  assert.equal(canNight(s), true);
});

test('行动点：读取 acts 的 apPerDay，缺省 2', () => {
  assert.equal(apPerDay({ apPerDay: 3 }), 3);
  assert.equal(apPerDay({}), 2);
  assert.equal(apPerDay({ apPerDay: 0 }), 2);
  assert.equal(apPerDay(null), 2);
});

test('每日场景：无 dayScenes 回退 act.pano，有则按天取并夹紧', () => {
  const act = { pano: '/a.jpg', hotspots: [{ id: 'x' }] };
  assert.deepEqual(dayScene(act, 1), { pano: '/a.jpg', hotspots: act.hotspots });

  const multi = {
    pano: '/fallback.jpg',
    hotspots: [],
    dayScenes: [
      { pano: '/snow.jpg', hotspots: [{ id: 's' }] },
      { pano: '/grass.jpg', hotspots: [{ id: 'g' }] },
    ],
  };
  assert.equal(dayScene(multi, 1).pano, '/snow.jpg');
  assert.equal(dayScene(multi, 2).pano, '/grass.jpg');
  assert.equal(dayScene(multi, 9).pano, '/grass.jpg');
});

test('失败判定：体力归零、断粮见底；研学模式不触发', () => {
  const march = { ...createState(), mode: 'march' };
  assert.equal(checkFailure(march), null);
  march.体力 = 0;
  assert.equal(checkFailure(march).kind, '体力耗尽');

  const hungry = { ...createState(), mode: 'march', 粮食: 0, 体力: 30 };
  assert.equal(checkFailure(hungry).kind, '断粮掉队');

  const study = { ...createState(), mode: 'study', 体力: 0, 粮食: 0 };
  assert.equal(checkFailure(study), null);
});
