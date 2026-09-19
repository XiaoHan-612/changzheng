/**
 * 资源与副作用 — 单元测试
 * 运行：npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyEffects, unlockFact } from '../../public/js/state.js';
import { markLineDone, linesDoneCount, canNight, apPerDay, dayScene, checkFailure, resolveLoss, checkVillageUnlock, pickEndingId } from '../../public/js/state.js';

// 减员判定：由作者标注的风险 + 当前资源决定（行军模式的主要代价来源）
const LOSS_CS = {
  loss: { who: '某个人', reason: '代价' },
  options: [
    { label: 'A', risk: 'high' },
    { label: 'B', risk: 'mid' },
    { label: 'C', risk: 'low' },
  ],
};

test('减员：高风险在资源吃紧时触发', () => {
  const s = createState();
  // 方案 A：高风险阈值 体力<55 或 粮≤1
  s.体力 = 54; s.粮食 = 5;
  assert.equal(resolveLoss(LOSS_CS, 0, s).who, '某个人');
  s.体力 = 80; s.粮食 = 0;
  assert.equal(resolveLoss(LOSS_CS, 0, s).who, '某个人', '断粮时高风险同样危险');
  s.体力 = 80; s.粮食 = 5;
  assert.equal(resolveLoss(LOSS_CS, 0, s), null, '资源充足时不该减员');
  s.体力 = 55; s.粮食 = 2;
  assert.equal(resolveLoss(LOSS_CS, 0, s), null, '体力≥55 且粮>1 时高风险不减员');
});

test('减员：中风险只在体力见底时触发，低风险永不', () => {
  const s = createState();
  // 方案 A：中风险体力≤32
  s.体力 = 33; s.粮食 = 5;
  assert.equal(resolveLoss(LOSS_CS, 1, s), null);
  s.体力 = 32;
  assert.equal(resolveLoss(LOSS_CS, 1, s).who, '某个人');
  s.体力 = 1; s.粮食 = 0;
  assert.equal(resolveLoss(LOSS_CS, 2, s), null, '低风险选项不该减员');
});

test('减员：没有 loss 声明的抉择永不减员', () => {
  const s = createState();
  s.体力 = 0; s.粮食 = 0;
  assert.equal(resolveLoss({ options: [{ label: 'A', risk: 'high' }] }, 0, s), null);
});

test('createState 默认五维（锁字段已移出：忙不忙由内核资源管）', () => {
  const s = createState();
  assert.equal(s.体力, 72);
  assert.equal(s.ap, 2);
  assert.equal('busy' in s, false);   // 存档里不该再有运行时字段（批 3 收口）
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

test('附身线：幂等计数 + 篝火夜门槛（自愿 ≥2；强制链不计）', () => {
  const s = createState();
  assert.equal(linesDoneCount(s), 0);
  assert.equal(canNight(s), false);
  // 强制链：只记 linesDone，不进 voluntary，不解锁夜间
  assert.equal(markLineDone(s, 'fishing'), true);
  assert.equal(markLineDone(s, 'fishing'), false);
  markLineDone(s, 'candy');
  markLineDone(s, 'sentry');
  assert.equal(linesDoneCount(s), 3);
  assert.equal(canNight(s, 2), false);
  // 营地自愿：计入门槛
  markLineDone(s, 'school', { voluntary: true });
  assert.equal(canNight(s, 2), false);
  markLineDone(s, 'gomoku', { voluntary: true });
  assert.equal(canNight(s, 2), true);
});

test('行动点：读取 acts 的 apPerDay，缺省 2', () => {
  assert.equal(apPerDay({ apPerDay: 3 }), 3);
  assert.equal(apPerDay({}), 2);
  assert.equal(apPerDay({ apPerDay: 0 }), 2);
  assert.equal(apPerDay(null), 2);
});

test('每日场景：无 dayScenes 回退 act.pano，有则按天取并夹紧', () => {
  const act = { pano: '/a.jpg', hotspots: [{ id: 'x' }] };
  const only = dayScene(act, 1);
  assert.equal(only.pano, '/a.jpg');
  assert.equal(only.alt, '');
  assert.deepEqual(only.hotspots, act.hotspots);

  const multi = {
    pano: '/fallback.jpg',
    hotspots: [],
    dayScenes: [
      { pano: '/snow.jpg', alt: '/snow_camp.jpg', label: '雪山', hotspots: [{ id: 's' }] },
      { pano: '/grass.jpg', hotspots: [{ id: 'g' }] },
    ],
  };
  assert.equal(dayScene(multi, 1).pano, '/snow.jpg');
  assert.equal(dayScene(multi, 1).alt, '/snow_camp.jpg');
  assert.equal(dayScene(multi, 1).label, '雪山');
  assert.equal(dayScene(multi, 2).pano, '/grass.jpg');
  assert.equal(dayScene(multi, 2).alt, '');
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

test('民心 ≥60 解锁老乡支线（幂等）', () => {
  const s = createState();
  assert.equal(checkVillageUnlock(s), false);
  s.民心 = 59;
  assert.equal(checkVillageUnlock(s), false);
  s.民心 = 60;
  assert.equal(checkVillageUnlock(s), true);
  assert.equal(s.villageUnlocked, true);
  assert.equal(checkVillageUnlock(s), false);
});

test('本地结局倾向：损失/夜间/信念映射到四结局', () => {
  const base = createState();
  assert.equal(pickEndingId(base), '同行');
  assert.equal(pickEndingId({ ...base, losses: [{ who: 'a' }, { who: 'b' }, { who: 'c' }] }), '未竟');
  assert.equal(pickEndingId({ ...base, nightChoice: '加岗并匀出口粮' }), '守望');
  assert.equal(pickEndingId({ ...base, 信念: 80, losses: [] }), '星火');
});
