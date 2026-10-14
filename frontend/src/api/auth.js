export async function loginRequest(emailOrId, password) {
  const trimmed = typeof emailOrId === 'string' ? emailOrId.trim() : '';
  const isEmail = trimmed.includes('@');
  const payload = isEmail
    ? { email: trimmed, password }
    : { customerId: trimmed, password };

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await res.json(); } catch { /* noop */ }
  if (!res.ok) {
    const err = new Error((body && body.error && body.error.message) || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body && body.error && body.error.code;
    throw err;
  }
  return body;
}

export async function logoutRequest() {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (res.status !== 204) {
    const body = await res.text().catch(() => '');
    throw new Error(`Đăng xuất thất bại: HTTP ${res.status} ${body}`);
  }
}

export async function fetchMe() {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (res.status === 401) return null;
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* noop */ }
    const err = new Error((body && body.error && body.error.message) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return body && body.profile ? body.profile : null;
}

export async function fetchGraphStats() {
  const res = await fetch('/api/analytics/graph-stats', { credentials: 'same-origin' });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* noop */ }
    const err = new Error((body && body.error && body.error.message) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}