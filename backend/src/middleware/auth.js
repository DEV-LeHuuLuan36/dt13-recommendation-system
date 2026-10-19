// Reads role/active from the DB on every request so a stale cookie or a
// demoted/deleted account loses access immediately.
export function requireAuth(neo4jClient) {
  return async function authMiddleware(req, res, next) {
    const session = req.session || {};
    const customerId = session.customerId;
    if (!customerId) {
      return next(Object.assign(new Error('Chua dang nhap'), { status: 401, code: 'AUTH_REQUIRED' }));
    }
    if (!neo4jClient) {
      return next(Object.assign(new Error('CSDL chua san sang'), { status: 503, code: 'NEO4J_NOT_CONFIGURED' }));
    }
    try {
      const res = await neo4jClient.read(
        'MATCH (c:Customer { customerId: $customerId }) RETURN c.role AS role, c.active AS active LIMIT 1',
        { customerId }
      );
      if (!res.records[0]) {
        // Account was deleted; drop the cookie.
        await destroySession(req);
        return next(Object.assign(new Error('Tai khoan khong ton tai'), { status: 401, code: 'AUTH_REQUIRED' }));
      }
      const role = res.records[0].get('role');
      const active = res.records[0].get('active');
      if (!active) {
        await destroySession(req);
        return next(Object.assign(new Error('Tai khoan dang inactive'), { status: 403, code: 'ACCOUNT_INACTIVE' }));
      }
      req.auth = { customerId, role, active };
      return next();
    } catch (err) {
      return next(Object.assign(new Error(`Loi CSDL khi xac thuc: ${err.message.split('\n')[0]}`), {
        status: 503,
        code: 'NEO4J_UNAVAILABLE',
      }));
    }
  };
}

// Place after requireAuth; rejects non-admin sessions.
export function requireAdmin() {
  return function adminOnly(req, res, next) {
    if (!req.auth || req.auth.role !== 'admin') {
      return next(Object.assign(new Error('Yeu cau quyen admin'), { status: 403, code: 'ADMIN_REQUIRED' }));
    }
    return next();
  };
}

// Populates req.auth if session exists and is active; does not block unauthenticated requests.
export function optionalAuth(neo4jClient) {
  return async function optionalAuthMiddleware(req, res, next) {
    const session = req.session || {};
    const customerId = session.customerId;
    if (!customerId || !neo4jClient) {
      req.auth = null;
      return next();
    }
    try {
      const dbRes = await neo4jClient.read(
        'MATCH (c:Customer { customerId: $customerId }) RETURN c.role AS role, c.active AS active LIMIT 1',
        { customerId }
      );
      if (!dbRes.records[0]) {
        await destroySession(req);
        req.auth = null;
        return next();
      }
      const active = dbRes.records[0].get('active');
      if (!active) {
        await destroySession(req);
        return next(Object.assign(new Error('Tai khoan dang inactive'), { status: 403, code: 'ACCOUNT_INACTIVE' }));
      }
      req.auth = {
        customerId,
        role: dbRes.records[0].get('role'),
        active: true,
      };
      return next();
    } catch (err) {
      if (err.status === 403) return next(err);
      req.auth = null;
      return next();
    }
  };
}

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => resolve());
  });
}
