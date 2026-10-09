/**
 * Middleware xac thuc: dam bao session dang nhap, dong thoi doc lai role/active tu DB
 * de khong tin cookie cu (theo yeu cau cua PROMPT_GIAI_DOAN_2 muc 7).
 *
 * Tra ve middleware(req, res, next) neu OK; neu khong, se goi next voi loi.
 *
 * Su dung:
 *   app.get('/api/foo', requireAuth(neo4jClient), handler)
 */
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
        // Tai khoan da bi xoa. Huy phien.
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

/**
 * Middleware yeu cau role admin. Dat sau requireAuth.
 */
export function requireAdmin() {
  return function adminOnly(req, res, next) {
    if (!req.auth || req.auth.role !== 'admin') {
      return next(Object.assign(new Error('Yeu cau quyen admin'), { status: 403, code: 'ADMIN_REQUIRED' }));
    }
    return next();
  };
}

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy((err) => {
      if (err) {
        // Bo qua; xoa cookie nhu fallback.
      }
      resolve();
    });
  });
}