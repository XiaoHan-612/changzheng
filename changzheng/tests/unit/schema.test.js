/**
 * AI 响应契约：服务端校验与日志审计共用 server/schema.js 这一张表。
 * 这里锁住判定规则，避免"缺字段的响应被放行到界面"再次发生。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, missingFields, contractStamp } from '../../server/schema.js';

test('契约表覆盖每一类调用（与策略表一一对应）', () => {
  // 不写死条数：加一类调用（如同事玩法带来的 candy_scene / gomoku_move / school_lesson / school_quiz）
  // 不该让这条测试红——真正要守的是"字段契约与预算策略表一一对应"，那条在 qa:ai 里；
  // 这里只兜"契约表没被清空、也没有空字段定义"。
  const types = Object.entries(REQUIRED);
  assert.ok(types.length >= 15, `契约表只剩 ${types.length} 类，像是被误删了`);
  for (const [t, fields] of types) {
    assert.ok(Array.isArray(fields) && fields.length > 0, `${t} 的字段契约是空的`);
  }
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

test('回归：数组不是对象（2026-09-13 真调实测）', () => {
  // 模型把整个响应包成数组 [{...}]。空数组会被"空 JSON"那条拦下，
  // 但非空数组 `typeof === 'object'` 成立、键数也大于 0，一路放行到界面，
  // 玩家就会得到一个没有叙事的空白回合（当时有个端点没接这张表，真调才暴露）。
  assert.deepEqual(missingFields('ending_review', [{ ending_id: 'x', paragraphs: ['y'] }]), ['(整体不是对象)']);
  assert.deepEqual(missingFields('ending_review', ['x', 'y']), ['(整体不是对象)']);
});

test('回归：模型把 answer_index 键名写坏时必须报出来', () => {
  // 2026-09-13 真实事故：模型返回里键名变成 ",answer_index"，
  // 宽松解析后照样成对象，界面拿不到正确答案却照常渲染。
  const broken = { question: 'q', options: ['a', 'b'], ',answer_index': 0, explain: 'x' };
  assert.deepEqual(missingFields('quiz_generate', broken), ['answer_index']);
});

test('契约戳记：落库时盖的那一笔账', () => {
  // 合规 / 不合规
  assert.equal(contractStamp('npc_chat', { reply: '好' }), true);
  assert.equal(contractStamp('npc_chat', { mood: '平静' }), false);
  assert.equal(contractStamp('ending_review', [{ ending_id: 'x', paragraphs: ['y'] }]), false);
  // 不判定（null）：没带回响应（ERROR 记录）或没登记的类型——不能替它们说"合规"
  assert.equal(contractStamp('npc_chat', undefined), null);
  assert.equal(contractStamp('npc_chat', null), null);
  assert.equal(contractStamp('some_future_type', { a: 1 }), null);
});
