import crypto from 'node:crypto';

// Parses cookies from the raw Cookie header without external dependencies.
function parseCookieHeader(header) {
  const cookies = {};
  if (!header || typeof header !== 'string') return cookies;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    const val = pair.slice(eq + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

// Actor resolution middleware. Identifies the user as either a logged-in Customer or a Guest with a stable cookie.
export function resolveActor() {
  return function actorMiddleware(req, res, next) {
    // 1. If authenticated via session
    if (req.auth && req.auth.customerId) {
      req.actor = {
        type: 'customer',
        id: req.auth.customerId,
        role: req.auth.role || 'customer',
      };
    } else {
      // 2. Unauthenticated -> Guest
      const cookies = parseCookieHeader(req.headers.cookie);
      let guestId = req.headers['x-guest-id'] || req.query.guestId || req.body?.guestId || cookies.dt13_guest_id;
      const visitId = req.headers['x-visit-id'] || req.query.visitId || req.body?.visitId;

      let isValidGuestId = typeof guestId === 'string' &&
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(guestId.trim());

      if (!isValidGuestId) {
        if (visitId && typeof visitId === 'string' && visitId.trim()) {
          const hash = crypto.createHash('md5').update(visitId.trim()).digest('hex');
          guestId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
          isValidGuestId = true;
        } else {
          guestId = crypto.randomUUID();
        }
        // Set HTTP-only guest cookie
        res.cookie('dt13_guest_id', guestId, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          path: '/',
        });
      }

      req.actor = {
        type: 'guest',
        id: guestId,
        role: 'guest',
      };
    }

    // Attach visitId from header or query param
    req.visitId = req.headers['x-visit-id'] || req.query.visitId || 'default-visit';
    next();
  };
}
