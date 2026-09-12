const API_BASE = '';

export async function requestDecision({ scene, situation, state, options, extraContext, operation }) {
  const res = await fetch(`${API_BASE}/api/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene, situation, state, options, extraContext, operation }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.result;
}

export async function fetchLogs(scope = 'session') {
  const res = await fetch(`${API_BASE}/api/logs?scope=${scope}`);
  return res.json();
}

export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/api/config`);
  return res.json();
}

export async function clearLogs() {
  await fetch(`${API_BASE}/api/logs/clear`, { method: 'POST' });
}
