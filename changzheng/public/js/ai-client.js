let modeCache = null;

export async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    modeCache = data;
    return data;
  } catch {
    // 兜底占位：与赛制指定模型一致（真值以 /api/config 为准）
    return { model: 'glm-5.1', hasKey: false, availableModels: ['glm-5.1'] };
  }
}

export function getMode() {
  return modeCache;
}

/**
 * 主线调用。/api/decide 的**唯一入口**（批 6：业务侧走 modules/ai 的 ask()，不直接调这里）。
 * payload 里的 maxTokens / temperature 会随请求带给服务器，服务器按它们收口并记账
 * （每类预算见 modules/ai/registry.js）。
 */
export async function decide(payload) {
  const res = await fetch('/api/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'AI 调用失败');
  return data.result;
}

export async function fetchLogs() {
  const res = await fetch('/api/logs');
  return res.json();
}

export async function fetchFacts() {
  try {
    const res = await fetch('/api/data/facts');
    return res.json();
  } catch {
    return {};
  }
}

export async function fetchActs() {
  try {
    const res = await fetch('/api/data/acts');
    return res.json();
  } catch {
    return null;
  }
}

export async function saveConfig(body) {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '保存失败');
  return data;
}

export async function testConfig(payload = {}) {
  const res = await fetch('/api/config/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '测试失败');
  return data;
}

export async function runSimTurn({ world, action, intent, maxTokens, temperature }) {
  const res = await fetch('/api/sim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ world, action, intent, maxTokens, temperature }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '沙盘推进失败');
  return data.result;
}

export async function clearLogs() {
  const res = await fetch('/api/logs/clear', { method: 'POST' });
  return res.json();
}
