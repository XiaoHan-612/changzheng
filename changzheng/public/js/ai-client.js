let modeCache = null;

export async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    modeCache = data;
    return data;
  } catch {
    return { model: 'glm-5.3-flash', hasKey: false, availableModels: ['glm-5.3-flash'] };
  }
}

export function getMode() {
  return modeCache;
}

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

export async function runSimTurn({ world, action, intent }) {
  const res = await fetch('/api/sim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ world, action, intent }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '沙盘推进失败');
  return data.result;
}

export async function clearLogs() {
  const res = await fetch('/api/logs/clear', { method: 'POST' });
  return res.json();
}
