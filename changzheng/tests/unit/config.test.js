// 配置层单测：Key 读取优先级 + 损坏配置不致命
// 全程使用临时文件，不碰工程里的 .env / runtime-config.json
// 注：项目已移除 MOCK，配置层不再有 MOCK 开关。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, '../../server/config.js');
const SERVER_URL = pathToFileURL(SERVER).href;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'czjc-config-'));
const RUNTIME = path.join(TMP, 'runtime-config.json');
const NO_ENV = path.join(TMP, 'no-such.env');

process.env.RUNTIME_CONFIG = RUNTIME;
process.env.ENV_FILE = NO_ENV;
delete process.env.GLM_API_KEY;
fs.writeFileSync(RUNTIME, JSON.stringify({ GLM_API_KEY: 'runtime-key', GLM_MODEL: 'glm-5.1' }), 'utf8');

const { CONFIG, saveRuntimeConfig } = await import('../../server/config.js');

test('runtime-config.json 的 Key 与模型生效', () => {
  assert.equal(CONFIG.GLM_API_KEY, 'runtime-key');
  assert.equal(CONFIG.GLM_MODEL, 'glm-5.1');
});

test('推理档位默认 low（始终思考的模型必需）', () => {
  assert.equal(CONFIG.GLM_REASONING_EFFORT, 'low');
  saveRuntimeConfig({ GLM_REASONING_EFFORT: 'high' });
  assert.equal(CONFIG.GLM_REASONING_EFFORT, 'high');
  const saved = JSON.parse(fs.readFileSync(RUNTIME, 'utf8'));
  assert.equal(saved.GLM_REASONING_EFFORT, 'high');
});

test('saveRuntimeConfig 回传真调信息，不再有 mockMode', () => {
  const info = saveRuntimeConfig({ GLM_MODEL: 'glm-5.3-flash' });
  assert.equal(info.model, 'glm-5.3-flash');
  assert.equal(info.hasKey, true);
  assert.equal(info.mockMode, undefined);
});

test('清空 Key 后 hasKey 为 false', () => {
  saveRuntimeConfig({ GLM_API_KEY: '' });
  assert.equal(CONFIG.GLM_API_KEY, '');
  assert.equal(saveRuntimeConfig({}).hasKey, false);
});

test('runtime-config.json 损坏时服务端仍能启动', () => {
  const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'czjc-broken-'));
  const broken = path.join(brokenDir, 'runtime-config.json');
  fs.writeFileSync(broken, '{ this is not json', 'utf8');
  const out = execFileSync(
    process.execPath,
    ['-e', `import(${JSON.stringify(SERVER_URL)}).then((m) => console.log(JSON.stringify({ ok: true, model: m.CONFIG.GLM_MODEL })));`],
    { encoding: 'utf8', env: { ...process.env, RUNTIME_CONFIG: broken, ENV_FILE: NO_ENV, GLM_API_KEY: 'env-key' } }
  );
  const parsed = JSON.parse(out.trim().split('\n').pop());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.model, 'glm-5.1');
});
