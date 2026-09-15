/**
 * 同伴与好感维度的一致性 —— 单元测试
 *
 * 守的是这一类事故：**好感维度存在、但玩家看不见**。
 * 2026-09-15 实况：state 里有 `好感_老乡`（模型能改、日志里有、研学报文也带着），
 * 而 `COMPANIONS` 只有四位——HUD 同伴栏、终局关系面板都不显示它，
 * 玩家做对做错都得不到反馈，等于白算一个维度。
 *
 * 运行：npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createState } from '../../public/js/state.js';
import { COMPANIONS } from '../../public/js/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const affKeys = () => Object.keys(createState()).filter((k) => k.startsWith('好感_'));

test('每个好感维度都要有一位同伴在界面上显示它', () => {
  const shown = new Set(COMPANIONS.map((c) => `好感_${c.name}`));
  const hidden = affKeys().filter((k) => !shown.has(k));
  assert.deepEqual(hidden, [], `这些好感维度没有同伴位可显示（玩家看不到，等于白算）：${hidden.join('、')}`);
});

test('每位同伴都要有对应的好感维度（否则界面显示兜底值，与存档不一致）', () => {
  const keys = new Set(affKeys());
  const missing = COMPANIONS.filter((c) => !keys.has(`好感_${c.name}`)).map((c) => c.name);
  assert.deepEqual(missing, [], `这些同伴没有好感维度：${missing.join('、')}`);
});

test('每位同伴的立绘文件真的在磁盘上', () => {
  const missing = COMPANIONS
    .filter((c) => c.img && !fs.existsSync(path.join(ROOT, 'public', c.img.replace(/^\//, ''))))
    .map((c) => `${c.name} → ${c.img}`);
  assert.deepEqual(missing, [], `立绘缺失（界面会退回文字头像）：${missing.join('、')}`);
});

test('同伴 id 不重复', () => {
  const ids = COMPANIONS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, `同伴 id 重复：${ids.join('、')}`);
});
