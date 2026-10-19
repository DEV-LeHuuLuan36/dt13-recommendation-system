import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { CRUD } from '../cypher/queries.js';
import { runRead, runInTransaction } from '../lib/tx.js';
import {
  validateId,
  validateName,
  validateDescription,
  pickAllowed,
  ConflictError,
  NotFoundError,
} from '../lib/validate.js';
import { generateId, PREFIX } from '../lib/ids.js';
import { publicCategory } from '../lib/mappers.js';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';

const CATEGORY_BODY_FIELDS = ['name', 'description'];
const CATEGORY_PATCH_FIELDS = ['name', 'description'];

export function createCategoriesRouter({ neo4jClient }) {
  const router = Router();
  router.use(optionalAuth(neo4jClient));
  const requireClient = () => {
    if (!neo4jClient) {
      throw Object.assign(new Error('Backend chua ket noi CSDL.'), {
        status: 503,
        code: 'NEO4J_NOT_CONFIGURED',
      });
    }
  };

  // GET /api/categories
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      requireClient();
      const resDb = await runRead(neo4jClient, CRUD.listCategories);
      const items = resDb.records.map((r) => ({
        ...publicCategory(r.get('c')),
        productCount: Number(r.get('productCount') || 0),
      }));
      return res.status(200).json({ items });
    })
  );

  // POST /api/categories (admin)
  router.post(
    '/',
    requireAuth(neo4jClient),
    requireAdmin(),
    asyncHandler(async (req, res) => {
      requireClient();
      const body = pickAllowed(req.body, CATEGORY_BODY_FIELDS);
      const name = validateName(body.name, 'name');
      const description = validateDescription(body.description);

      const categoryId = generateId(PREFIX.category);
      const result = await runInTransaction(neo4jClient, async (tx) => {
        await tx.run(CRUD.createCategory, {
          categoryId,
          name,
          description: description === undefined ? '' : description,
        });
        const after = await tx.run(CRUD.getCategoryWithProductCount, { categoryId });
        return {
          ...publicCategory(after.records[0].get('c')),
          productCount: Number(after.records[0].get('productCount') || 0),
        };
      });
      return res.status(201).json(result);
    })
  );

  // PATCH /api/categories/:categoryId (admin)
  router.patch(
    '/:categoryId',
    requireAuth(neo4jClient),
    requireAdmin(),
    asyncHandler(async (req, res) => {
      requireClient();
      const categoryId = validateId(req.params.categoryId, 'categoryId');
      const body = pickAllowed(req.body, CATEGORY_PATCH_FIELDS);

      const updated = await runInTransaction(neo4jClient, async (tx) => {
        const cur = await tx.run(CRUD.getCategoryById, { categoryId });
        if (!cur.records[0]) {
          throw new NotFoundError('Danh muc khong ton tai.', 'CATEGORY_NOT_FOUND');
        }
        const current = cur.records[0].get('c').properties;
        let nextName = current.name;
        let nextDescription = current.description;
        if (body.name !== undefined) nextName = validateName(body.name, 'name');
        if (body.description !== undefined) nextDescription = validateDescription(body.description);
        await tx.run(CRUD.updateCategory, {
          categoryId,
          name: nextName,
          description: nextDescription === undefined ? '' : nextDescription,
        });
        const after = await tx.run(CRUD.getCategoryWithProductCount, { categoryId });
        return {
          ...publicCategory(after.records[0].get('c')),
          productCount: Number(after.records[0].get('productCount') || 0),
        };
      });
      return res.status(200).json(updated);
    })
  );

  // DELETE /api/categories/:categoryId (admin)
  router.delete(
    '/:categoryId',
    requireAuth(neo4jClient),
    requireAdmin(),
    asyncHandler(async (req, res) => {
      requireClient();
      const categoryId = validateId(req.params.categoryId, 'categoryId');
      const result = await runInTransaction(neo4jClient, async (tx) => {
        const cur = await tx.run(CRUD.getCategoryById, { categoryId });
        if (!cur.records[0]) {
          throw new NotFoundError('Danh muc khong ton tai.', 'CATEGORY_NOT_FOUND');
        }
        const usage = await tx.run(CRUD.countCategoryProducts, { categoryId });
        const productCount = Number(usage.records[0]?.get('productCount') || 0);
        if (productCount > 0) {
          throw new ConflictError(
            `Danh muc dang duoc su dung boi ${productCount} san pham. Hay chuyen san pham sang danh muc khac truoc.`,
            'CATEGORY_HAS_PRODUCTS'
          );
        }
        await tx.run(CRUD.deleteCategoryEmpty, { categoryId });
        return { deleted: true };
      });
      return res.status(200).json(result);
    })
  );

  return router;
}
