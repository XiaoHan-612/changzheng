/**
 * AI 响应契约：服务端校验与日志审计共用 server/schema.js 这一张表。
 * 这里锁住判定规则，避免"缺字段的响应被放行到界面"再次发生。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, missingFields } from '../../server/schema.js';

test('契约表覆盖 16 类 callType', () => {
  assert.equal(Object.keys(REQUIRED).length, 16);
});

test('缺必需字段会被点名', () => {
  assert.deepEqual(missingFields('quiz_generate', { question: 'q', options: ['a', 'b'] }), ['answer_index']);
  assert.deepEqual(missingFields('npc_chat', { mood: '平静' }), ['reply']);
});

test('字段齐全则通过', () => {
  assert.deepEqual(missingFields('quiz_generate', { question: 'q', options: ['a'], answer_index: 0 }), []);
  assert.deepEqual(missingFields('failure_review', { paragraphs: ['a'] }), []);
});

test('| 表示任一命中即可', () => {
  const base = { effects: {} };
  assert.deepEqual(missingFields('branch_judge', { ...base, scene_text: 'x' }), []);
  assert.deepEqual(missingFields('branch_judge', { ...base, narrative: 'x' }), []);
  assert.deepEqual(missingFields('branch_judge', base), ['scene_text|narrative']);
});

test('值为 null 不算命中', () => {
  assert.deepEqual(missingFields('night_resolve', { narrative: null }), ['narrative']);
});

test('未登记的 callType 不做判定', () => {
  assert.deepEqual(missingFields('some_future_type', {}), []);
});

test('非对象整体判失败', () => {
  assert.deepEqual(missingFields('npc_chat', null), ['(整体不是对象)']);
  assert.deepEqual(missingFields('npc_chat', 'reply'), ['(整体不是对象)']);
});

test('回归：模型把 answer_index 键名写坏时必须报出来', () => {
  // 2026-09-13 真实事故：模型返回里键名变成 ",answer_index"，
  // 宽松解析后照样成对象，界面拿不到正确答案却照常渲染。
  const broken = { question: 'q', options: ['a', 'b'], ',answer_index': 0, explain: 'x' };
  assert.deepEqual(missingFields('quiz_generate', broken), ['answer_index']);
});
