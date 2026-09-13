/**
 * 开场设定（出身 + 出发前一问）— 单元测试
 * 运行：npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../public/js/state.js';
import { ORIGINS, ORIGIN_QUIZ, findOrigin, applyOrigin, applyOriginQuiz } from '../../public/js/origin.js';

test('三条出身：id 唯一、文案齐全', () => {
  assert.equal(ORIGINS.length, 3);
  assert.equal(new Set(ORIGINS.map((o) => o.id)).size, 3);
  for (const o of ORIGINS) {
    assert.ok(o.id && o.label && o.sub, `出身 ${o.id} 字段不齐`);
  }
});

test('出身收益对称：各一条 +5 与一条 −2，避免唯一最优解', () => {
  for (const o of ORIGINS) {
    const vals = Object.values(o.effects);
    assert.equal(vals.length, 2, `${o.id} 应只影响两个维度`);
    assert.deepEqual(vals.slice().sort((a, b) => a - b), [-2, 5], `${o.id} 收益不对称`);
    // 只能影响登记在案的维度，否则 applyEffects 会静默丢弃
    for (const k of Object.keys(o.effects)) {
      assert.ok(['体力', '粮食', '士气', '信念', '民心'].includes(k), `${o.id} 影响了非法维度 ${k}`);
    }
  }
});

test('applyOrigin 写入 origin 并结算五维', () => {
  const s = createState();
  const { origin, changes } = applyOrigin(s, 'farm');
  assert.equal(origin.id, 'farm');
  assert.equal(s.origin, 'farm');
  assert.equal(s.体力, 77);        // 72 + 5
  assert.equal(s.信念, 68);        // 70 − 2
  assert.equal(changes.length, 2);
});

test('applyOrigin 对未知 id 安全：不改状态、不报错', () => {
  const s = createState();
  const { origin, changes } = applyOrigin(s, 'not_exist');
  assert.equal(origin, null);
  assert.equal(s.origin, null);
  assert.deepEqual(changes, []);
});

test('applyOrigin 受上下限钳制：满值时不再累加', () => {
  const s = createState();
  s.体力 = 100;
  const { changes } = applyOrigin(s, 'farm');
  assert.equal(s.体力, 100);
  assert.ok(!changes.some((c) => c.startsWith('体力')), '体力已满，不应产生变化项');
});

test('出发前一问：答对加信念，答错不扣', () => {
  const rightState = createState();
  const right = applyOriginQuiz(rightState, ORIGIN_QUIZ.answerIndex);
  assert.equal(right.right, true);
  assert.equal(rightState.信念, 73);            // 70 + 3
  assert.deepEqual(rightState.originQuiz, { picked: 0, right: true });

  const wrongState = createState();
  const wrong = applyOriginQuiz(wrongState, ORIGIN_QUIZ.answerIndex + 1);
  assert.equal(wrong.right, false);
  assert.equal(wrongState.信念, 70, '答错不应扣分');
  assert.deepEqual(wrong.changes, []);
});

test('出发前一问：选项与答案下标合法', () => {
  assert.ok(Array.isArray(ORIGIN_QUIZ.options) && ORIGIN_QUIZ.options.length >= 2);
  assert.ok(ORIGIN_QUIZ.answerIndex >= 0 && ORIGIN_QUIZ.answerIndex < ORIGIN_QUIZ.options.length);
  assert.ok(ORIGIN_QUIZ.explain && ORIGIN_QUIZ.question);
});

test('findOrigin：命中返回对象，未命中返回 null', () => {
  assert.equal(findOrigin('student').label, '学生');
  assert.equal(findOrigin(''), null);
});
