import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { CRUD } from '../cypher/queries.js';
import { runRead, runInTransaction } from '../lib/tx.js';
import {
  validateId,
  validateName,
  validateDescription,
  validateImageUrl,
  validatePriceRequired,
  validateBoolean,
  validatePage,
  validatePageSize,
  validateProductSort,
  validatePriceRange,
  pickAllowed,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../lib/validate.js';
import { generateId, PREFIX } from '../lib/ids.js';
import { publicProductWithCategory, publicCategory, paginated } from '../lib/mappers.js';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';

import { parseSearchIntent } from '../lib/searchIntentParser.js';

const PRODUCT_BODY_FIELDS = ['name', 'description', 'price', 'categoryId', 'imageUrl', 'active'];
const PRODUCT_PATCH_FIELDS = ['name', 'description', 'price', 'categoryId', 'imageUrl', 'active'];

/**
 * Kiem tra quyen xem product active. Customer chi duoc thay active=true.
 * includeInactive=true cho admin xem ca inactive.
 */
function checkProductVisible(productProps, profile, { includeInactive = false } = {}) {
  if (includeInactive) return;
  if (productProps.active === false) {
    throw new NotFoundError('San pham khong ton tai hoac da ngung kinh doanh.', 'PRODUCT_NOT_FOUND');
  }
}

export function createProductsRouter({ neo4jClient }) {
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

  // Error messages stay in Vietnamese because the UI surfaces them directly.
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      requireClient();
      const page = validatePage(req.query.page);
      const pageSize = validatePageSize(req.query.pageSize);
      const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : null;

      // Parse structured intent from search query
      const intent = rawQ ? parseSearchIntent(rawQ) : null;

      // Explicit user filters override inferred intent
      const hasExplicitCategory = typeof req.query.categoryId === 'string' && req.query.categoryId.trim() !== '';
      const hasExplicitBrand = typeof req.query.brand === 'string' && req.query.brand.trim() !== '';
      const hasExplicitPriceMin = req.query.priceMin !== undefined && req.query.priceMin !== '';
      const hasExplicitPriceMax = req.query.priceMax !== undefined && req.query.priceMax !== '';

      const categoryId = hasExplicitCategory
        ? req.query.categoryId.trim()
        : (intent && intent.category ? intent.category.id : null);

      const brand = hasExplicitBrand
        ? req.query.brand.trim()
        : (intent && intent.brands.length === 1 ? intent.brands[0] : null);

      const { min: explicitPriceMin, max: explicitPriceMax } = validatePriceRange({
        min: req.query.priceMin,
        max: req.query.priceMax,
      });

      const priceMin = hasExplicitPriceMin
        ? explicitPriceMin
        : (intent && intent.minPrice !== null ? intent.minPrice : null);

      const priceMax = hasExplicitPriceMax
        ? explicitPriceMax
        : (intent && intent.maxPrice !== null ? intent.maxPrice : null);

      const inclusiveMin = hasExplicitPriceMin ? true : (intent ? intent.inclusiveMin : true);
      const inclusiveMax = hasExplicitPriceMax ? true : (intent ? intent.inclusiveMax : true);
      const targetPrice = (hasExplicitPriceMin || hasExplicitPriceMax) ? null : (intent ? intent.targetPrice : null);
      const excludedBrands = intent && intent.excludedBrands ? intent.excludedBrands : [];

      // Cleaned keyword for text search (price phrase removed)
      const q = intent && intent.cleanedQuery ? intent.cleanedQuery : (rawQ || null);

      const sort = validateProductSort(req.query.sort);
      const includeInactive = req.query.includeInactive === 'true' && req.auth && req.auth.role === 'admin';
      const activeFilter = includeInactive ? 'all' : 'active';

      const params = {
        q: q || null,
        categoryId: categoryId || null,
        brand: brand || null,
        excludedBrands,
        priceMin: priceMin !== null ? priceMin : null,
        priceMax: priceMax !== null ? priceMax : null,
        inclusiveMin,
        inclusiveMax,
        targetPrice: targetPrice !== null ? targetPrice : null,
        sort: sort || '',
        activeFilter,
        skip: (page - 1) * pageSize,
        limit: pageSize,
      };

      const countRes = await runRead(neo4jClient, CRUD.countProducts, params);
      const total = countRes.records[0] ? Number(countRes.records[0].get('total')) : 0;

      const listRes = await runRead(neo4jClient, CRUD.listProducts, params);
      const items = listRes.records.map((r) => publicProductWithCategory(r.get('p'), r.get('c')));

      const responsePayload = paginated(items, page, pageSize, total);
      if (intent) {
        responsePayload.intent = intent;
      }
      if (total === 0 && (priceMin !== null || priceMax !== null || targetPrice !== null)) {
        responsePayload.message = 'Chưa có sản phẩm phù hợp với khoảng giá này';
      }

      return res.status(200).json(responsePayload);
    })
  );

  // GET /api/products/:productId
  router.get(
    '/:productId',
    asyncHandler(async (req, res) => {
      requireClient();
      const productId = validateId(req.params.productId, 'productId');
      const resDb = await runRead(neo4jClient, CRUD.getProductById, { productId });
      if (!resDb.records[0]) {
        throw new NotFoundError('San pham khong ton tai.', 'PRODUCT_NOT_FOUND');
      }
      const includeInactive = req.query.includeInactive === 'true' && req.auth && req.auth.role === 'admin';
      const product = publicProductWithCategory(resDb.records[0].get('p'), resDb.records[0].get('c'));
      checkProductVisible(product, req.auth, { includeInactive });
      return res.status(200).json(product);
    })
  );

  // POST /api/products (admin)
  router.post(
    '/',
    requireAuth(neo4jClient),
    requireAdmin(),
    asyncHandler(async (req, res) => {
      requireClient();
      const body = pickAllowed(req.body, PRODUCT_BODY_FIELDS);
      const name = validateName(body.name, 'name');
      const description = validateDescription(body.description);
      const price = validatePriceRequired(body.price);
      const categoryId = validateId(body.categoryId, 'categoryId');
      const imageUrl = validateImageUrl(body.imageUrl);
      const active = body.active === undefined ? true : validateBoolean(body.active, 'active');

      const productId = generateId(PREFIX.product);

      const result = await runInTransaction(neo4jClient, async (tx) => {
        const catRes = await tx.run(
          'MATCH (c:Category { categoryId: $categoryId }) RETURN c LIMIT 1',
          { categoryId }
        );
        if (!catRes.records[0]) {
          throw new ValidationError('categoryId khong ton tai.', 'CATEGORY_NOT_FOUND');
        }
        await tx.run(CRUD.createProduct, {
          productId,
          name,
          description: description === undefined ? '' : description,
          price,
          imageUrl: imageUrl || `/images/products/${productId}.svg`,
          active,
        });
        const relRes = await tx.run(CRUD.setProductBelongsTo, { productId, categoryId });
        return {
          product: publicProductWithCategory(relRes.records[0].get('p'), relRes.records[0].get('c')),
          category: publicCategory(relRes.records[0].get('c')),
        };
      });

      return res.status(201).json(result.product);
    })
  );

  // PATCH /api/products/:productId (admin)
  router.patch(
    '/:productId',
    requireAuth(neo4jClient),
    requireAdmin(),
    asyncHandler(async (req, res) => {
      requireClient();
      const productId = validateId(req.params.productId, 'productId');
      const body = pickAllowed(req.body, PRODUCT_PATCH_FIELDS);

      const updated = await runInTransaction(neo4jClient, async (tx) => {
        const cur = await tx.run(CRUD.getProductById, { productId });
        if (!cur.records[0]) {
          throw new NotFoundError('San pham khong ton tai.', 'PRODUCT_NOT_FOUND');
        }
        const current = cur.records[0].get('p').properties;
        const currentCat = cur.records[0].get('c');
        const currentCategoryId = currentCat ? currentCat.properties.categoryId : current.categoryId;

        // Apply only the fields the body actually provided.
        let nextName = current.name;
        let nextDescription = current.description;
        let nextPrice = current.price;
        let nextImageUrl = current.imageUrl;
        let nextActive = current.active;
        let nextCategoryId = currentCategoryId;

        if (body.name !== undefined) nextName = validateName(body.name, 'name');
        if (body.description !== undefined) nextDescription = validateDescription(body.description);
        if (body.price !== undefined) nextPrice = validatePriceRequired(body.price);
        if (body.imageUrl !== undefined) nextImageUrl = validateImageUrl(body.imageUrl);
        if (body.active !== undefined) nextActive = validateBoolean(body.active, 'active');
        if (body.categoryId !== undefined) nextCategoryId = validateId(body.categoryId, 'categoryId');

        if (nextCategoryId !== currentCategoryId) {
          const catRes = await tx.run(
            'MATCH (c:Category { categoryId: $categoryId }) RETURN c LIMIT 1',
            { categoryId: nextCategoryId }
          );
          if (!catRes.records[0]) {
            throw new ValidationError('categoryId khong ton tai.', 'CATEGORY_NOT_FOUND');
          }
        }

        await tx.run(CRUD.updateProduct, {
          productId,
          name: nextName,
          description: nextDescription === undefined ? '' : nextDescription,
          price: nextPrice,
          imageUrl: nextImageUrl === undefined ? null : nextImageUrl,
          active: nextActive,
        });

        if (nextCategoryId !== currentCategoryId) {
          await tx.run(CRUD.setProductBelongsTo, { productId, categoryId: nextCategoryId });
        }

        const after = await tx.run(CRUD.getProductById, { productId });
        return publicProductWithCategory(after.records[0].get('p'), after.records[0].get('c'));
      });

      return res.status(200).json(updated);
    })
  );

  // DELETE /api/products/:productId (admin)
  router.delete(
    '/:productId',
    requireAuth(neo4jClient),
    requireAdmin(),
    asyncHandler(async (req, res) => {
      requireClient();
      const productId = validateId(req.params.productId, 'productId');
      const result = await runInTransaction(neo4jClient, async (tx) => {
        const cur = await tx.run(CRUD.getProductById, { productId });
        if (!cur.records[0]) {
          throw new NotFoundError('San pham khong ton tai.', 'PRODUCT_NOT_FOUND');
        }
        const beh = await tx.run(
          'MATCH (p:Product { productId: $productId })<-[r]-(:Customer) RETURN count(r) AS c',
          { productId }
        );
        const history = Number(beh.records[0]?.get('c') || 0);
        if (history > 0) {
          throw new ConflictError(
            'San pham da co lich su mua/xem. Hay chuyen active=false thay vi xoa.',
            'PRODUCT_HAS_HISTORY'
          );
        }
        await tx.run(CRUD.deleteProductNoHistory, { productId });
        return { deleted: true };
      });
      return res.status(200).json(result);
    })
  );

  return router;
}
