let modeCache = null;

export async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    modeCache = data;
    return data;
  } catch {
    return { mockMode: true, model: 'glm-5.1' };
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
