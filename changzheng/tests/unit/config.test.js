/**
 * 配置层单测：MOCK 锁定持久化 + 损坏配置不致命
 * 全程使用临时文件，不碰工程里的 .env / runtime-config.json
 */
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
fs.writeFileSync(RUNTIME, JSON.stringify({ GLM_API_KEY: 'demo-key', MOCK_AI: true }), 'utf8');

const { CONFIG, saveRuntimeConfig } = await import('../../server/config.js');

test('MOCK 锁定优先于已配置的 Key（重启后仍然 MOCK）', () => {
  assert.equal(CONFIG.GLM_API_KEY, 'demo-key');
  assert.equal(CONFIG.MOCK_AI, true);
});

test('关闭 MOCK 锁定后恢复真调判定', () => {
  const info = saveRuntimeConfig({ MOCK_AI: false });
  assert.equal(CONFIG.MOCK_AI, false);
  assert.equal(info.mockMode, false);
  const saved = JSON.parse(fs.readFileSync(RUNTIME, 'utf8'));
  assert.equal(saved.MOCK_AI, false);
});

test('无 Key 时自动回落到 MOCK', () => {
  saveRuntimeConfig({ MOCK_AI: false, GLM_API_KEY: '' });
  assert.equal(CONFIG.GLM_API_KEY, '');
  assert.equal(CONFIG.MOCK_AI, true);
});

test('runtime-config.json 损坏时服务端仍能启动', () => {
  const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'czjc-broken-'));
  const broken = path.join(brokenDir, 'runtime-config.json');
  fs.writeFileSync(broken, '{ this is not json', 'utf8');
  const out = execFileSync(
    process.execPath,
    [
      '-e',
      `import(${JSON.stringify(SERVER_URL)}).then((m) => console.log(JSON.stringify({ ok: true, mock: m.CONFIG.MOCK_AI })));`,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, RUNTIME_CONFIG: broken, ENV_FILE: NO_ENV, GLM_API_KEY: 'demo-key' },
    }
  );
  const parsed = JSON.parse(out.trim().split('\n').pop());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mock, false);
});
