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
import { HybridEngine } from '../lib/hybridEngine.js';

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

function recordToItem(record, reasonFor, isWeighted = false) {
  const item = {
    productId: record.get('productId'),
    name: record.get('name'),
    price: toNumber(record.get('price')),
    imageUrl: record.get('imageUrl'),
    score: toNumber(record.get('score')),
    support: toNumber(record.get('support')),
  };
  if (isWeighted) {
    const boughtCount = toNumber(record.get('boughtCount')) || 0;
    const viewedCount = toNumber(record.get('viewedCount')) || 0;
    item.boughtCount = boughtCount;
    item.viewedCount = viewedCount;
    item.boughtWeight = boughtCount * 3.0;
    item.viewedWeight = viewedCount * 1.0;
    item.reason = reasonForWeighted(boughtCount, viewedCount, item.score, item.support);
  } else {
    item.reason = reasonFor(record.get('support'), toNumber(record.get('score')));
  }
  return item;
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

function reasonForWeighted(boughtCount, viewedCount, score, support) {
  const parts = [];
  if (boughtCount > 0) parts.push(`${boughtCount} nguoi mua (x3.0 = ${boughtCount * 3}d)`);
  if (viewedCount > 0) parts.push(`${viewedCount} luot xem (x1.0 = ${viewedCount * 1}d)`);
  if (parts.length === 0) return 'Goi y da hanh vi (mua x3.0 + xem x1.0).';
  return `Goi y da hanh vi: ${parts.join(', ')}. Tong diem: ${score} (Do ho tro: ${support}).`;
}

export function createRecommendationsRouter({ neo4jClient }) {
  const router = Router();
  const hybridEngine = neo4jClient ? new HybridEngine(neo4jClient) : null;

  // GET /api/recommendations/feed — Hybrid personalized feed (Customer and Guest)
  router.get(
    '/feed',
    asyncHandler(async (req, res) => {
      requireClient(neo4jClient);
      const actor = req.actor || { type: 'guest', id: 'guest_default', role: 'guest' };
      const visitId = String(req.query.visitId || req.visitId || 'visit_1').slice(0, 50);
      const feedId = String(req.query.feedId || 'home_feed').slice(0, 50);
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10));
      const categoryId = req.query.categoryId ? String(req.query.categoryId).trim() : null;
      const priceMin = req.query.priceMin !== undefined && req.query.priceMin !== '' ? Number(req.query.priceMin) : null;
      const priceMax = req.query.priceMax !== undefined && req.query.priceMax !== '' ? Number(req.query.priceMax) : null;
      const excludeProductId = req.query.excludeProductId ? validateId(req.query.excludeProductId, 'excludeProductId') : null;

      const feed = await hybridEngine.getHybridFeed({
        actor,
        visitId,
        feedId,
        page,
        pageSize,
        categoryId,
        priceMin,
        priceMax,
        excludeProductId,
      });

      return res.status(200).json(feed);
    })
  );

  // GET /api/recommendations/detail/:productId — Co-bought and Substitutes for detail page
  router.get(
    '/detail/:productId',
    asyncHandler(async (req, res) => {
      requireClient(neo4jClient);
      const productId = validateId(req.params.productId, 'productId');
      const actor = req.actor || { type: 'guest', id: 'guest_default', role: 'guest' };
      const limit = parseLimit(req.query.limit);

      const data = await hybridEngine.getDetailRecommendations({
        productId,
        actor,
        limit,
      });

      return res.status(200).json(data);
    })
  );

  // GET /api/recommendations/me — user_cf over the customer's purchase history.
  // Supports ?formula=weighted or ?includeViews=true for multi-behavior recommendation.
  // Automatically falls back to multi-behavior user-based branch if pure CF returns 0 items.
  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      requireClient(neo4jClient);
      requireCustomerRole(req);
      const customerId = req.auth.customerId;
      const limit = parseLimit(req.query.limit);
      const isWeighted = req.query.formula === 'weighted' || req.query.includeViews === 'true';
      const excludeProductId = req.query.excludeProductId
        ? validateId(req.query.excludeProductId, 'excludeProductId')
        : null;

      let result;
      let method = isWeighted ? 'user_cf_weighted' : 'user_cf';
      let isFallback = false;

      try {
        if (isWeighted) {
          result = await runRead(neo4jClient, QUERIES.recommendForMeWeighted, {
            customerId,
            limit: toIntParam(limit + (excludeProductId ? 1 : 0)),
          });
        } else {
          result = await runRead(neo4jClient, QUERIES.recommendForMe, {
            customerId,
            limit: toIntParam(limit + (excludeProductId ? 1 : 0)),
          });

          // Fallback: if pure CF yields no candidates, use user-based multi-behavior branch
          if (!result.records || result.records.length === 0) {
            const fallbackRes = await runRead(neo4jClient, QUERIES.recommendForMeFallback, {
              customerId,
              limit: toIntParam(limit + (excludeProductId ? 1 : 0)),
            });
            if (fallbackRes.records && fallbackRes.records.length > 0) {
              result = fallbackRes;
              method = 'user_cf_multibehavior';
              isFallback = true;
            }
          }
        }
      } catch (err) {
        const message = (err && err.message) ? String(err.message).split('\n')[0] : 'unknown';
        throw Object.assign(new Error(`Loi CSDL khi goi y: ${message}`), {
          status: 503,
          code: 'NEO4J_UNAVAILABLE',
        });
      }

      let items = (result.records || []).map((r) => recordToItem(r, reasonForMe, isWeighted));
      if (excludeProductId) {
        items = items.filter((it) => it.productId !== excludeProductId);
      }
      if (items.length > limit) {
        items = items.slice(0, limit);
      }

      const body = {
        method,
        ...(isWeighted ? { formula: 'score = 3.0 * boughtCount + 1.0 * viewedCount' } : {}),
        limit,
        items,
        reason: items.length === 0
          ? (isWeighted
            ? 'Chua co san pham phu hop tu lich su mua va xem hien tai.'
            : 'Chua co san pham phu hop tu lich su mua hien tai.')
          : (isWeighted
            ? 'Goi y da hanh vi ket hop mua (x3.0) va xem (x1.0) tu nhung nguoi tuong dong.'
            : (isFallback
              ? 'Goi y tu cac san pham duoc mua boi nhung nguoi co tuong tac tuong dong.'
              : 'Goi y tu lich su mua va nhung nguoi co san pham mua chung.')),
      };
      return res.status(200).json(body);
    })
  );

  // GET /api/recommendations/products/:productId (alias: /co-bought/:productId)
  // co_bought from the given source product. 404 if source is missing or inactive.
  router.get(
    ['/products/:productId', '/co-bought/:productId'],
    asyncHandler(async (req, res) => {
      requireClient(neo4jClient);
      requireCustomerRole(req);
      const productId = validateId(req.params.productId, 'productId');
      const customerId = req.auth.customerId;
      const limit = parseLimit(req.query.limit);
      const isWeighted = req.query.formula === 'weighted' || req.query.includeViews === 'true';

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

      const query = isWeighted ? QUERIES.recommendForProductWeighted : QUERIES.recommendForProduct;
      let result;
      try {
        result = await runRead(neo4jClient, query, {
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

      const items = (result.records || []).map((r) => recordToItem(r, reasonForCoBought, isWeighted));
      const body = {
        method: isWeighted ? 'co_bought_weighted' : 'co_bought',
        ...(isWeighted ? { formula: 'score = 3.0 * boughtCount + 1.0 * viewedCount' } : {}),
        sourceProductId: productId,
        limit,
        items,
        reason: items.length === 0
          ? (isWeighted
            ? 'Chua co du lieu mua va xem cung cho san pham nay.'
            : 'Chua du lieu mua cung cho san pham nay.')
          : (isWeighted
            ? 'Goi y da hanh vi tu nguoi mua san pham dang xem (mua x3.0 + xem x1.0).'
            : 'Goi y tu nguoi mua san pham dang xem.'),
      };
      return res.status(200).json(body);
    })
  );

  // GET /api/recommendations/user-feed/:customerId — direct feed for Word report demonstration
  router.get(
    '/user-feed/:customerId',
    asyncHandler(async (req, res) => {
      requireClient(neo4jClient);
      const targetId = validateId(req.params.customerId, 'customerId');
      if (req.auth.role !== 'admin' && req.auth.customerId !== targetId) {
        throw new ForbiddenError('Ban khong co quyen xem goi y cua nguoi dung khac.', 'FORBIDDEN');
      }
      const limit = parseLimit(req.query.limit);
      const isWeighted = req.query.formula === 'weighted' || req.query.includeViews === 'true';

      let result;
      let method = isWeighted ? 'user_cf_weighted' : 'user_cf';
      let isFallback = false;

      try {
        if (isWeighted) {
          result = await runRead(neo4jClient, QUERIES.recommendForMeWeighted, {
            customerId: targetId,
            limit: toIntParam(limit),
          });
        } else {
          result = await runRead(neo4jClient, QUERIES.recommendForMe, {
            customerId: targetId,
            limit: toIntParam(limit),
          });

          if (!result.records || result.records.length === 0) {
            const fallbackRes = await runRead(neo4jClient, QUERIES.recommendForMeFallback, {
              customerId: targetId,
              limit: toIntParam(limit),
            });
            if (fallbackRes.records && fallbackRes.records.length > 0) {
              result = fallbackRes;
              method = 'user_cf_multibehavior';
              isFallback = true;
            }
          }
        }
      } catch (err) {
        const message = (err && err.message) ? String(err.message).split('\n')[0] : 'unknown';
        throw Object.assign(new Error(`Loi CSDL khi goi y: ${message}`), {
          status: 503,
          code: 'NEO4J_UNAVAILABLE',
        });
      }

      const items = (result.records || []).map((r) => recordToItem(r, reasonForMe, isWeighted));
      const body = {
        method,
        targetCustomerId: targetId,
        ...(isWeighted ? { formula: 'score = 3.0 * boughtCount + 1.0 * viewedCount' } : {}),
        limit,
        items,
        reason: items.length === 0
          ? 'Chua co san pham phu hop tu lich su mua hien tai.'
          : (isWeighted
            ? 'Goi y da hanh vi ket hop mua (x3.0) va xem (x1.0) tu nhung nguoi tuong dong.'
            : (isFallback
              ? 'Goi y tu cac san pham duoc mua boi nhung nguoi co tuong tac tuong dong.'
              : 'Goi y tu lich su mua va nhung nguoi co san pham mua chung.')),
      };
      return res.status(200).json(body);
    })
  );

  return router;
}
