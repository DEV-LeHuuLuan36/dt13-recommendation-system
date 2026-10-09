import { Router } from 'express';
import neo4j from 'neo4j-driver';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { QUERIES } from '../cypher/queries.js';
import { runRead } from '../lib/tx.js';
import {
  validateId,
  ForbiddenError,
  NotFoundError,
} from '../lib/validate.js';
import { toNumber } from '../lib/mappers.js';

// Recommendation routes — customer-only.
//   GET /api/recommendations/me?limit=
//   GET /api/recommendations/products/:productId?limit=
// customerId always comes from the session, never from the query/body.

const DEFAULT_LIMIT = 5;
const MIN_LIMIT = 1;
const MAX_LIMIT = 20;

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

// Parse and validate `limit` (1..20). Rejects 0, 21, "abc", 1.5 explicitly.
function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
  if (typeof raw === 'string') {
    if (!/^\d+$/.test(raw)) {
      throw Object.assign(new Error('limit phai la so nguyen duong.'), { status: 400, code: 'INVALID_LIMIT' });
    }
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < MIN_LIMIT || n > MAX_LIMIT) {
      throw Object.assign(new Error(`limit phai trong [${MIN_LIMIT}, ${MAX_LIMIT}].`), {
        status: 400,
        code: 'INVALID_LIMIT',
      });
    }
    return n;
  }
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < MIN_LIMIT || raw > MAX_LIMIT) {
      throw Object.assign(new Error(`limit phai trong [${MIN_LIMIT}, ${MAX_LIMIT}].`), {
        status: 400,
        code: 'INVALID_LIMIT',
      });
    }
    return raw;
  }
  throw Object.assign(new Error('limit phai la so nguyen.'), { status: 400, code: 'INVALID_LIMIT' });
}

// neo4j.int avoids integer-to-float coercion when binding LIMIT parameters.
function toIntParam(n) {
  return neo4j.int(n);
}

function recordToItem(record, reasonFor) {
  return {
    productId: record.get('productId'),
    name: record.get('name'),
    price: toNumber(record.get('price')),
    imageUrl: record.get('imageUrl'),
    score: toNumber(record.get('score')),
    support: toNumber(record.get('support')),
    reason: reasonFor(record.get('support'), toNumber(record.get('score'))),
  };
}

function reasonForMe(support, score) {
  const s = Number(support);
  const sc = Number(score);
  const ngMua = s === 1 ? '1 nguoi' : `${s} nguoi`;
  if (s <= 0) return 'Co the phu hop voi ban.';
  return `Co ${ngMua} mua chung voi ban da mua san pham nay; tong trong so la ${sc}.`;
}

function reasonForCoBought(support) {
  const s = Number(support);
  if (s <= 0) return 'Co the phu hop voi san pham dang xem.';
  const ngMua = s === 1 ? '1 nguoi' : `${s} nguoi`;
  return `${ngMua} da mua san pham dang xem va cung da mua san pham nay.`;
}

export function createRecommendationsRouter({ neo4jClient }) {
  const router = Router();

  // GET /api/recommendations/me — user_cf over the customer's purchase history.
  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      requireClient(neo4jClient);
      requireCustomerRole(req);
      const customerId = req.auth.customerId;
      const limit = parseLimit(req.query.limit);

      let result;
      try {
        result = await runRead(neo4jClient, QUERIES.recommendForMe, {
          customerId,
          limit: toIntParam(limit),
        });
      } catch (err) {
        const message = (err && err.message) ? String(err.message).split('\n')[0] : 'unknown';
        throw Object.assign(new Error(`Loi CSDL khi goi y: ${message}`), {
          status: 503,
          code: 'NEO4J_UNAVAILABLE',
        });
      }

      const items = (result.records || []).map((r) => recordToItem(r, reasonForMe));
      const body = {
        method: 'user_cf',
        limit,
        items,
        reason: items.length === 0
          ? 'Chua co san pham phu hop tu lich su mua hien tai.'
          : 'Goi y tu lich su mua va nhung nguoi co san pham mua chung.',
      };
      return res.status(200).json(body);
    })
  );

  // GET /api/recommendations/products/:productId — co_bought from the given source product.
  // 404 if the source is missing or inactive.
  router.get(
    '/products/:productId',
    asyncHandler(async (req, res) => {
      requireClient(neo4jClient);
      requireCustomerRole(req);
      const productId = validateId(req.params.productId, 'productId');
      const customerId = req.auth.customerId;
      const limit = parseLimit(req.query.limit);

      let sourceResult;
      try {
        sourceResult = await runRead(neo4jClient, QUERIES.findSourceProduct, { productId });
      } catch (err) {
        const message = (err && err.message) ? String(err.message).split('\n')[0] : 'unknown';
        throw Object.assign(new Error(`Loi CSDL khi goi y: ${message}`), {
          status: 503,
          code: 'NEO4J_UNAVAILABLE',
        });
      }
      if (!sourceResult.records[0]) {
        throw new NotFoundError('San pham khong ton tai.', 'PRODUCT_NOT_FOUND');
      }
      const sourceActive = sourceResult.records[0].get('active');
      if (sourceActive === false) {
        throw new NotFoundError('San pham khong ton tai hoac da ngung kinh doanh.', 'PRODUCT_NOT_FOUND');
      }

      let result;
      try {
        result = await runRead(neo4jClient, QUERIES.recommendForProduct, {
          customerId,
          productId,
          limit: toIntParam(limit),
        });
      } catch (err) {
        const message = (err && err.message) ? String(err.message).split('\n')[0] : 'unknown';
        throw Object.assign(new Error(`Loi CSDL khi goi y: ${message}`), {
          status: 503,
          code: 'NEO4J_UNAVAILABLE',
        });
      }

      const items = (result.records || []).map((r) => recordToItem(r, reasonForCoBought));
      const body = {
        method: 'co_bought',
        sourceProductId: productId,
        limit,
        items,
        reason: items.length === 0
          ? 'Chua du lieu mua cung cho san pham nay.'
          : 'Goi y tu nguoi mua san pham dang xem.',
      };
      return res.status(200).json(body);
    })
  );

  return router;
}
