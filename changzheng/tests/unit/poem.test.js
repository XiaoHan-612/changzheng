// 终局升华的诗：结构守卫。
//
// 为什么要有它：诗的文本、落款、节奏都在 data/poem.json 里，屏幕与配音两处都读它——
// 少一句、多一个字、成对关系写错，屏幕上看是"排版怪"，配音那边是"文件白做"（哈希按文本算）。
// 这些是纯数据约束，机器一秒能查完，别等到看屏幕才发现。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const poem = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/poem.json'), 'utf8'));

test('诗：题、作者、出处、落款都得有（升华屏逐条要显示）', () => {
  for (const k of ['title', 'author', 'written', 'source']) {
    assert.ok(String(poem[k] || '').trim(), `poem.json 缺 ${k}`);
  }
  assert.ok(String(poem.seal?.line || '').trim(), 'poem.json 缺 seal.line');
});

test('诗：八句、每句七字、两句一联（七律的形制）', () => {
  const lines = poem.lines || [];
  assert.equal(lines.length, 8, `应该是 8 句，实际 ${lines.length}`);
  lines.forEach((l, i) => {
    assert.equal(l.i, i + 1, `第 ${i + 1} 句的 i 写成了 ${l.i}`);
    assert.equal([...l.text].length, 7, `第 ${l.i} 句不是七字：${l.text}`);
    assert.ok(/^[\u4e00-\u9fa5]+$/.test(l.text), `第 ${l.i} 句混进了非汉字（标点要放 punct）：${l.text}`);
  });
  const pairs = lines.map((l) => l.pair);
  assert.deepEqual(pairs, [1, 1, 2, 2, 3, 3, 4, 4], 'pair 必须是 1,1,2,2,3,3,4,4');
});

test('诗：标点按联落（上句逗、下句句号）', () => {
  for (const l of poem.lines) {
    const want = l.i % 2 === 1 ? '，' : '。';   // 每联两句：第一句逗号收、第二句句号收
    assert.equal(l.punct, want, `第 ${l.i} 句的标点应是 ${JSON.stringify(want)}，实际 ${JSON.stringify(l.punct)}`);
  }
});

test('诗：无声节奏是正数（缺音频时逐字就靠它）', () => {
  const p = poem.pace || {};
  for (const k of ['msPerChar', 'lineGapMs', 'holdTitleMs', 'holdSealMs']) {
    assert.ok(Number(p[k]) > 0, `pace.${k} 必须是正数，实际 ${p[k]}`);
  }
  assert.ok(Number(p.msPerChar) >= 80 && Number(p.msPerChar) <= 600, 'pace.msPerChar 应在 80–600ms（朗读速度）');
  const totalMs = poem.lines.reduce((s, l) => s + [...l.text].length * p.msPerChar + p.lineGapMs, 0);
  assert.ok(totalMs < 25000, `无声逐字总时长 ${(totalMs / 1000).toFixed(1)}s 超了 25s 上限（策划案：升华 ≤25s）`);
});

test('诗：走整段录音路线时，每句都要有时间轴', () => {
  if (!poem.audio?.full) return;   // 走逐句配音/无声路线：时间轴可留空
  for (const l of poem.lines) {
    assert.ok(Number.isFinite(l.startMs) && Number.isFinite(l.endMs), `audio.full 已填，第 ${l.i} 句缺 startMs/endMs`);
    assert.ok(l.endMs > l.startMs, `第 ${l.i} 句的时间轴倒挂`);
  }
  assert.ok(String(poem.audio.voiceId || '').trim(), 'audio.voiceId 不能空（逐句配音的哈希要用它）');
});
