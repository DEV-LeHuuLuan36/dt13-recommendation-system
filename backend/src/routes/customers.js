import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { CRUD } from '../cypher/queries.js';
import { runRead, runInTransaction } from '../lib/tx.js';
import {
  validateId,
  validateName,
  validateEmail,
  normalizeEmail,
  validatePassword,
  validateBoolean,
  validatePage,
  validatePageSize,
  pickAllowed,
  ConflictError,
  NotFoundError,
} from '../lib/validate.js';
import { generateId, PREFIX } from '../lib/ids.js';
import { hashPassword } from '../password.js';
import { publicCustomer, paginated } from '../lib/mappers.js';
import { getCustomerDefaultPassword } from '../seed/generator.js';

const CUSTOMER_BODY_FIELDS = ['name', 'email', 'password', 'active'];
const CUSTOMER_PATCH_FIELDS = ['name', 'email', 'active', 'password'];

export function createCustomersRouter({ neo4jClient }) {
  const router = Router();
  const requireClient = () => {
    if (!neo4jClient) {
      throw Object.assign(new Error('Backend chua ket noi CSDL.'), {
        status: 503,
        code: 'NEO4J_NOT_CONFIGURED',
      });
    }
  };

  // GET /api/customers (admin)
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      requireClient();
      if (!req.auth || req.auth.role !== 'admin') {
        throw Object.assign(new Error('Yeu cau quyen admin.'), { status: 403, code: 'ADMIN_REQUIRED' });
      }
      const page = validatePage(req.query.page);
      const pageSize = validatePageSize(req.query.pageSize);
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : null;

      const params = { q: q || null, skip: (page - 1) * pageSize, limit: pageSize };

      const countRes = await runRead(neo4jClient, CRUD.countCustomers, params);
      const total = countRes.records[0] ? Number(countRes.records[0].get('total')) : 0;

      const listRes = await runRead(neo4jClient, CRUD.listCustomers, params);
      const items = listRes.records.map((r) => publicCustomer(r.get('c')));
      return res.status(200).json(paginated(items, page, pageSize, total));
    })
  );

  // GET /api/customers/:customerId (admin)
  router.get(
    '/:customerId',
    asyncHandler(async (req, res) => {
      requireClient();
      if (!req.auth || req.auth.role !== 'admin') {
        throw Object.assign(new Error('Yeu cau quyen admin.'), { status: 403, code: 'ADMIN_REQUIRED' });
      }
      const customerId = validateId(req.params.customerId, 'customerId');
      const resDb = await runRead(neo4jClient, CRUD.getCustomerByIdAdmin, { customerId });
      if (!resDb.records[0]) {
        throw new NotFoundError('Khach hang khong ton tai.', 'CUSTOMER_NOT_FOUND');
      }
      const c = resDb.records[0].get('c');
      return res.status(200).json(publicCustomer(c));
    })
  );

  // POST /api/customers (admin)
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      requireClient();
      if (!req.auth || req.auth.role !== 'admin') {
        throw Object.assign(new Error('Yeu cau quyen admin.'), { status: 403, code: 'ADMIN_REQUIRED' });
      }
      const body = pickAllowed(req.body, CUSTOMER_BODY_FIELDS);
      const name = validateName(body.name, 'name');
      const email = validateEmail(body.email);
      const active = body.active === undefined ? true : validateBoolean(body.active, 'active');
      const customerId = generateId(PREFIX.customer);
      const plainPassword = (body.password !== undefined && body.password !== '')
        ? validatePassword(body.password)
        : getCustomerDefaultPassword(customerId, 'customer');
      const passwordHash = await hashPassword(plainPassword);

      const created = await runInTransaction(neo4jClient, async (tx) => {
        // Dam bao email chua ton tai (case-insensitive)
        const dup = await tx.run(
          'MATCH (c:Customer) WHERE toLower(c.email) = toLower($email) RETURN c LIMIT 1',
          { email }
        );
        if (dup.records[0]) {
          throw new ConflictError('Email da ton tai.', 'EMAIL_DUPLICATE');
        }
        await tx.run(CRUD.createCustomer, {
          customerId,
          name,
          email,
          passwordHash,
          active,
        });
        const after = await tx.run(CRUD.getCustomerByIdAdmin, { customerId });
        return publicCustomer(after.records[0].get('c'));
      });
      return res.status(201).json(created);
    })
  );

  // PATCH /api/customers/:customerId (admin)
  router.patch(
    '/:customerId',
    asyncHandler(async (req, res) => {
      requireClient();
      if (!req.auth || req.auth.role !== 'admin') {
        throw Object.assign(new Error('Yeu cau quyen admin.'), { status: 403, code: 'ADMIN_REQUIRED' });
      }
      const customerId = validateId(req.params.customerId, 'customerId');
      const body = pickAllowed(req.body, CUSTOMER_PATCH_FIELDS);

      const updated = await runInTransaction(neo4jClient, async (tx) => {
        const cur = await tx.run(CRUD.getCustomerByIdAdmin, { customerId });
        if (!cur.records[0]) {
          throw new NotFoundError('Khach hang khong ton tai.', 'CUSTOMER_NOT_FOUND');
        }
        const current = cur.records[0].get('c').properties;
        if (current.role !== 'customer') {
          throw new ConflictError('Khong the sua tai khoan admin qua API nay.', 'PROTECTED_ACCOUNT');
        }
        let nextName = current.name;
        let nextEmail = current.email;
        let nextActive = current.active;
        if (body.name !== undefined) nextName = validateName(body.name, 'name');
        if (body.email !== undefined) {
          nextEmail = validateEmail(body.email);
          if (normalizeEmail(nextEmail) !== normalizeEmail(current.email)) {
            const dup = await tx.run(
              'MATCH (c:Customer) WHERE toLower(c.email) = toLower($email) AND c.customerId <> $customerId RETURN c LIMIT 1',
              { email: nextEmail, customerId }
            );
            if (dup.records[0]) {
              throw new ConflictError('Email da ton tai.', 'EMAIL_DUPLICATE');
            }
          }
        }
        if (body.active !== undefined) nextActive = validateBoolean(body.active, 'active');

        let nextPasswordHash = null;
        if (body.password !== undefined && body.password !== '') {
          const validPass = validatePassword(body.password);
          nextPasswordHash = await hashPassword(validPass);
        }

        await tx.run(CRUD.updateCustomer, {
          customerId,
          name: nextName,
          email: nextEmail,
          active: nextActive,
          passwordHash: nextPasswordHash,
        });
        const after = await tx.run(CRUD.getCustomerByIdAdmin, { customerId });
        return publicCustomer(after.records[0].get('c'));
      });
      return res.status(200).json(updated);
    })
  );

  // DELETE /api/customers/:customerId (admin)
  router.delete(
    '/:customerId',
    asyncHandler(async (req, res) => {
      requireClient();
      if (!req.auth || req.auth.role !== 'admin') {
        throw Object.assign(new Error('Yeu cau quyen admin.'), { status: 403, code: 'ADMIN_REQUIRED' });
      }
      const customerId = validateId(req.params.customerId, 'customerId');
      const result = await runInTransaction(neo4jClient, async (tx) => {
        const cur = await tx.run(CRUD.getCustomerByIdAdmin, { customerId });
        if (!cur.records[0]) {
          throw new NotFoundError('Khach hang khong ton tai.', 'CUSTOMER_NOT_FOUND');
        }
        const current = cur.records[0].get('c').properties;
        if (current.role !== 'customer') {
          throw new ConflictError('Khong the xoa tai khoan admin.', 'PROTECTED_ACCOUNT');
        }
        const beh = await tx.run(CRUD.customerBehaviorBreakdown, { customerId });
        const bought = Number(beh.records[0]?.get('bought') || 0);
        const viewed = Number(beh.records[0]?.get('viewed') || 0);
        if (bought > 0 || viewed > 0) {
          throw new ConflictError(
            `Khach hang da co lich su (${bought} mua, ${viewed} xem). Hay chuyen active=false thay vi xoa.`,
            'CUSTOMER_HAS_HISTORY'
          );
        }
        await tx.run('MATCH (c:Customer { customerId: $customerId }) WHERE c.role = "customer" DELETE c', { customerId });
        return { deleted: true };
      });
      return res.status(200).json(result);
    })
  );

  return router;
}
