import { Router } from 'express';
import { QUERIES } from '../cypher/queries.js';

export function createAdminRouter({ neo4jClient = null } = {}) {
  const router = Router();

  router.get('/graph-stats', async (req, res, next) => {
    if (!neo4jClient) {
      return res.status(503).json({
        error: { code: 'NEO4J_NOT_CONFIGURED', message: 'Backend chua ket noi CSDL.' },
      });
    }
    try {
      const result = await neo4jClient.read(QUERIES.graphStats);
      if (!result.records[0]) {
        return res.status(503).json({
          error: { code: 'NEO4J_UNAVAILABLE', message: 'Khong doc duoc graph stats.' },
        });
      }
      const rec = result.records[0];
      const stats = {
        customerNodes: numberOf(rec.get('customerNodes')),
        customerRoleNodes: numberOf(rec.get('customerRoleNodes')),
        adminRoleNodes: numberOf(rec.get('adminRoleNodes')),
        productNodes: numberOf(rec.get('productNodes')),
        categoryNodes: numberOf(rec.get('categoryNodes')),
        boughtEdges: numberOf(rec.get('boughtEdges')),
        viewedEdges: numberOf(rec.get('viewedEdges')),
        belongsToEdges: numberOf(rec.get('belongsToEdges')),
        generatedAt: new Date().toISOString(),
      };
      return res.status(200).json(stats);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

function numberOf(v) {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  if (typeof v.toNumber === 'function') {
    try { return v.toNumber(); } catch { return Number(v); }
  }
  return Number(v);
}