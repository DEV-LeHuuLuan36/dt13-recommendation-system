/**
 * Tra ve state: 'loading' | 'connected' | 'not-configured' | 'error'
 */
function classify(status, body, fetchError) {
  if (fetchError) {
    return { status: 'error', detail: null, error: fetchError.message };
  }
  if (status === 200 && body && body.status === 'ok') {
    return { status: 'connected', detail: body, error: null };
  }
  if (status === 200 && body && body.status === 'connected') {
    return { status: 'connected', detail: body, error: null };
  }
  if (status === 503 && body && body.error) {
    const code = body.error.code;
    return {
      status: code === 'NEO4J_NOT_CONFIGURED' ? 'not-configured' : 'error',
      detail: body,
      error: body.error.message,
    };
  }
  return {
    status: 'error',
    detail: body,
    error: (body && body.error && body.error.message) || `HTTP ${status}`,
  };
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchApiHealth() {
  try {
    const res = await fetch('/api/health', { credentials: 'same-origin' });
    const body = await safeJson(res);
    return classify(res.status, body, null);
  } catch (err) {
    return { status: 'error', detail: null, error: `Khong goi duoc /api/health: ${err.message}` };
  }
}

export async function fetchNeo4jHealth() {
  try {
    const res = await fetch('/api/health/neo4j', { credentials: 'same-origin' });
    const body = await safeJson(res);
    return classify(res.status, body, null);
  } catch (err) {
    return { status: 'error', detail: null, error: `Khong goi duoc /api/health/neo4j: ${err.message}` };
  }
}