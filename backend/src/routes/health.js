import { Router } from 'express';

const SERVICE_NAME = 'dt13-api';

/**
 * Tao router health:
 *  - GET /            : trang thai Express (khong tuyen bo Neo4j)
 *  - GET /neo4j       : trang thai Neo4j (503/200)
 */
export function createHealthRouter({ neo4jClient = null, databaseName = 'neo4j' } = {}) {
  const router = Router();

  router.get('/', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: SERVICE_NAME,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/neo4j', async (req, res) => {
    if (!neo4jClient) {
      return res.status(503).json({
        error: {
          code: 'NEO4J_NOT_CONFIGURED',
          message:
            'Chua cau hinh ket noi Neo4j. Vui long dien NEO4J_URI/USERNAME/PASSWORD/DATABASE trong backend/.env.',
          database: databaseName || null,
        },
      });
    }

    try {
      await runWithTimeout(neo4jClient.ping(), 4000, 'TIMEOUT (4s)');
      return res.status(200).json({
        status: 'connected',
        service: SERVICE_NAME,
        database: databaseName,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const safeMessage = sanitizeError(err);
      return res.status(503).json({
        error: {
          code: 'NEO4J_UNAVAILABLE',
          message: `Khong the ket noi den Neo4j: ${safeMessage}`,
          database: databaseName,
        },
      });
    }
  });

  return router;
}

function sanitizeError(err) {
  if (!err) return 'unknown error';
  const code = err.code || (err.cause && err.cause.code) || '';
  const message = err.message || String(err);
  // Cat doan message si lon; chi lay phan dau.
  let trimmed = message.split('\n')[0].slice(0, 240);
  // Che cac cap khoa=giatri co the chua bi mat (password, secret, neo4j password).
  trimmed = trimmed
    .replace(/(password\s*=\s*)([^\s,;]+)/gi, '$1***')
    .replace(/(neo4j password[^,;\n]*)/gi, 'neo4j password ***')
    .replace(/("password"\s*:\s*)"[^"]+"/gi, '$1"***"')
    .replace(/('password'\s*:\s*)'[^']+'/gi, "$1'***'");
  if (code) return `${code}: ${trimmed}`;
  return trimmed;
}

/** Promise.race nho, tu timeout neu qua han. */
function runWithTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Re-export de test/other modules su dung neu can.
export { SERVICE_NAME, sanitizeError };