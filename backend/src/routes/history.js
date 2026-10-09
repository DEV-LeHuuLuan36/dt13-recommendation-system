import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { CRUD } from '../cypher/queries.js';
import { runRead } from '../lib/tx.js';
import {
  validatePage,
  validatePageSize,
  validateHistoryType,
  ForbiddenError,
  ValidationError,
} from '../lib/validate.js';
import { publicBoughtEdge, publicViewedEdge, paginated } from '../lib/mappers.js';

function requireCustomerRole(req) {
  if (!req.auth) {
    throw Object.assign(new Error('Chua dang nhap.'), { status: 401, code: 'AUTH_REQUIRED' });
  }
  if (req.auth.role !== 'customer') {
    throw new ForbiddenError('API nay chi danh cho khach hang (customer).', 'CUSTOMER_REQUIRED');
  }
}

function requireClient(neo4jClient) {
  if (!neo4jClient) {
    throw Object.assign(new Error('Backend chua ket noi CSDL.'), {
      status: 503,
      code: 'NEO4J_NOT_CONFIGURED',
    });
  }
}

function propsOf(node) {
  return node ? node.properties : {};
}

export function createHistoryRouter({ neo4jClient }) {
  const router = Router();

  // GET /api/me/history
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      requireClient(neo4jClient);
      requireCustomerRole(req);
      const customerId = req.auth.customerId;
      const page = validatePage(req.query.page);
      const pageSize = validatePageSize(req.query.pageSize);
      const type = validateHistoryType(req.query.type);

      const params = { customerId, skip: (page - 1) * pageSize, limit: pageSize };
      const items = [];

      if (type === 'bought' || type === 'all') {
        const countRes = await runRead(neo4jClient, CRUD.countBoughtHistory, params);
        const total = countRes.records[0] ? Number(countRes.records[0].get('total') || 0) : 0;
        const listRes = await runRead(neo4jClient, CRUD.listBoughtHistory, params);
        for (const r of listRes.records) {
          const prod = r.get('p');
          const edge = r.get('r');
          items.push(publicBoughtEdge(edge, prod ? propsOf(prod) : null));
        }
        if (type === 'bought') {
          return res.status(200).json(paginated(items, page, pageSize, total));
        }
        // all: tiep tuc lay viewed
        const countViewed = await runRead(neo4jClient, CRUD.countViewedHistory, params);
        const totalViewed = countViewed.records[0] ? Number(countViewed.records[0].get('total') || 0) : 0;
        const listViewed = await runRead(neo4jClient, CRUD.listViewedHistory, params);
        for (const r of listViewed.records) {
          const prod = r.get('p');
          const edge = r.get('r');
          items.push(publicViewedEdge(edge, prod ? propsOf(prod) : null));
        }
        const combined = items.slice().sort((a, b) => {
          if (a.occurredAt === b.occurredAt) {
            return a.eventId < b.eventId ? 1 : -1;
          }
          return a.occurredAt < b.occurredAt ? 1 : -1;
        });
        return res.status(200).json(paginated(combined, page, pageSize, total + totalViewed));
      }

      if (type === 'viewed') {
        const countRes = await runRead(neo4jClient, CRUD.countViewedHistory, params);
        const total = countRes.records[0] ? Number(countRes.records[0].get('total') || 0) : 0;
        const listRes = await runRead(neo4jClient, CRUD.listViewedHistory, params);
        for (const r of listRes.records) {
          const prod = r.get('p');
          const edge = r.get('r');
          items.push(publicViewedEdge(edge, prod ? propsOf(prod) : null));
        }
        return res.status(200).json(paginated(items, page, pageSize, total));
      }

      throw new ValidationError('type khong hop le.');
    })
  );

  return router;
}
