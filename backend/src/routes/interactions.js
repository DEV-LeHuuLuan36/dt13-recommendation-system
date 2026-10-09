import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { CRUD } from '../cypher/queries.js';
import { runInTransaction } from '../lib/tx.js';
import {
  validateId,
  validateEventId,
  validateQuantity,
  pickAllowed,
  ValidationError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../lib/validate.js';
import { publicBoughtEdge, publicViewedEdge } from '../lib/mappers.js';

const VIEW_BODY_FIELDS = ['eventId', 'productId'];
const PURCHASE_BODY_FIELDS = ['eventId', 'productId', 'quantity'];

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

export function createInteractionsRouter({ neo4jClient }) {
  const router = Router();

  // POST /api/interactions/views
  router.post(
    '/views',
    asyncHandler(async (req, res) => {
      requireClient(neo4jClient);
      requireCustomerRole(req);
      const body = pickAllowed(req.body, VIEW_BODY_FIELDS);
      const eventId = validateEventId(body.eventId);
      const productId = validateId(body.productId, 'productId');
      const customerId = req.auth.customerId;

      const result = await runInTransaction(neo4jClient, async (tx) => {
        // 1. Kiem tra Customer con active.
        const cust = await tx.run(
          'MATCH (c:Customer { customerId: $customerId }) RETURN c LIMIT 1',
          { customerId }
        );
        if (!cust.records[0]) {
          throw new NotFoundError('Tai khoan khong ton tai.', 'CUSTOMER_NOT_FOUND');
        }
        const custProps = propsOf(cust.records[0].get('c'));
        if (custProps.active === false) {
          throw new ForbiddenError('Tai khoan dang inactive.', 'ACCOUNT_INACTIVE');
        }

        // 2. Kiem tra da co eventId chua.
        const existing = await tx.run(CRUD.findViewedByEventId, { eventId });
        if (existing.records[0]) {
          const row = existing.records[0];
          const existingCustomerId = row.get('customerId');
          const existingProductId = row.get('productId');
          if (existingCustomerId !== customerId || existingProductId !== productId) {
            throw new ConflictError(
              'eventId da duoc su dung boi chu tai khoan hoac san pham khac.',
              'EVENT_ID_CONFLICT'
            );
          }
          const edge = propsOf(row.get('r'));
          return {
            status: 200,
            body: publicViewedEdge({ properties: edge }, null),
          };
        }

        // 3. Kiem tra Product ton tai va active.
        const prod = await tx.run(CRUD.getProductById, { productId });
        if (!prod.records[0]) {
          throw new NotFoundError('San pham khong ton tai.', 'PRODUCT_NOT_FOUND');
        }
        const prodProps = propsOf(prod.records[0].get('p'));
        if (prodProps.active === false) {
          throw new ConflictError('San pham dang ngung kinh doanh.', 'PRODUCT_INACTIVE');
        }

        // 4. Ghi VIEWED.
        const created = await tx.run(CRUD.createViewed, { customerId, productId, eventId });
        const edge = propsOf(created.records[0].get('r'));
        return {
          status: 201,
          body: publicViewedEdge({ properties: edge }, prodProps),
        };
      });

      return res.status(result.status).json(result.body);
    })
  );

  // POST /api/interactions/purchases
  router.post(
    '/purchases',
    asyncHandler(async (req, res) => {
      requireClient(neo4jClient);
      requireCustomerRole(req);
      const body = pickAllowed(req.body, PURCHASE_BODY_FIELDS);
      const eventId = validateEventId(body.eventId);
      const productId = validateId(body.productId, 'productId');
      const quantity = validateQuantity(body.quantity === undefined ? 1 : body.quantity);
      const customerId = req.auth.customerId;

      const result = await runInTransaction(neo4jClient, async (tx) => {
        const cust = await tx.run(
          'MATCH (c:Customer { customerId: $customerId }) RETURN c LIMIT 1',
          { customerId }
        );
        if (!cust.records[0]) {
          throw new NotFoundError('Tai khoan khong ton tai.', 'CUSTOMER_NOT_FOUND');
        }
        const custProps = propsOf(cust.records[0].get('c'));
        if (custProps.active === false) {
          throw new ForbiddenError('Tai khoan dang inactive.', 'ACCOUNT_INACTIVE');
        }

        const existing = await tx.run(CRUD.findBoughtByEventId, { eventId });
        if (existing.records[0]) {
          const row = existing.records[0];
          const existingCustomerId = row.get('customerId');
          const existingProductId = row.get('productId');
          const existingEdge = propsOf(row.get('r'));
          if (
            existingCustomerId !== customerId ||
            existingProductId !== productId ||
            Number(existingEdge.quantity) !== quantity
          ) {
            throw new ConflictError(
              'eventId da duoc su dung voi chu tai khoan, san pham hoac so luong khac.',
              'EVENT_ID_CONFLICT'
            );
          }
          // Lay thong tin Product de hien thi (co the inactive).
          const prod = await tx.run(CRUD.getProductById, { productId });
          const prodProps = prod.records[0] ? propsOf(prod.records[0].get('p')) : null;
          return {
            status: 200,
            body: publicBoughtEdge({ properties: existingEdge }, prodProps),
          };
        }

        const prod = await tx.run(CRUD.getProductById, { productId });
        if (!prod.records[0]) {
          throw new NotFoundError('San pham khong ton tai.', 'PRODUCT_NOT_FOUND');
        }
        const prodProps = propsOf(prod.records[0].get('p'));
        if (prodProps.active === false) {
          throw new ConflictError('San pham dang ngung kinh doanh.', 'PRODUCT_INACTIVE');
        }
        const unitPrice = prodProps.price;
        if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice < 0) {
          throw new ValidationError('Gia san pham khong hop le.', 'INVALID_PRICE');
        }

        const created = await tx.run(CRUD.createBought, {
          customerId,
          productId,
          eventId,
          quantity,
          unitPrice,
        });
        const edge = propsOf(created.records[0].get('r'));
        return {
          status: 201,
          body: publicBoughtEdge({ properties: edge }, prodProps),
        };
      });

      return res.status(result.status).json(result.body);
    })
  );

  return router;
}
