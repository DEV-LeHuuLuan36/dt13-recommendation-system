/**
 * Loader dataset vao Neo4j trong mot transaction duy nhat.
 *
 * Tach khoi script `db-seed.js` de test rollback co the inject fail o
 * giua cac buoc (chi chay qua driver that, khong mock).
 */
import { SEED } from '../cypher/queries.js';

/**
 * Chay 1 dataset trong 1 transaction executeWrite.
 *  - neo4jSession: mot session WRITE da mo.
 *  - dataset: { products, customers, categories, bought, viewed, marker }.
 *  - adminHash, customerHash: hash mat khau (chuan bi truoc, khong tao side effect trong callback).
 *  - options.failAtStep: when set to one of "categories|products|customers|belongsTo|bought|viewed",
 *    throws before that step runs (default null).
 *
 * Returns: counts (object). Throws if failAtStep is set or the database errors.
 */
export async function runSeedInTransaction(neo4jSession, dataset, adminHash, customerHash, options = {}) {
  const { failAtStep = null } = options;
  return neo4jSession.executeWrite(async (tx) => {
    const counts = { categories: 0, products: 0, customers: 0, belongsTo: 0, bought: 0, viewed: 0 };
    const marker = dataset.marker;

    if (failAtStep === 'categories') throw new Error('TEST_FAIL_AT_categories');

    for (const cat of dataset.categories) {
      await tx.run(SEED.upsertCategory, {
        categoryId: cat.categoryId,
        name: cat.name,
        description: cat.description,
        marker,
      });
      counts.categories += 1;
    }

    if (failAtStep === 'products') throw new Error('TEST_FAIL_AT_products');

    for (const p of dataset.products) {
      await tx.run(SEED.upsertProduct, {
        productId: p.productId,
        name: p.name,
        description: p.description,
        price: p.price,
        imageUrl: p.imageUrl,
        marker,
      });
      counts.products += 1;
    }

    if (failAtStep === 'customers') throw new Error('TEST_FAIL_AT_customers');

    for (const c of dataset.customers) {
      const hash = c.role === 'admin' ? adminHash : customerHash;
      await tx.run(c.role === 'admin' ? SEED.upsertAdmin : SEED.upsertCustomer, {
        customerId: c.customerId,
        name: c.name,
        email: c.email,
        passwordHash: hash,
        marker,
      });
      counts.customers += 1;
    }

    if (failAtStep === 'belongsTo') throw new Error('TEST_FAIL_AT_belongsTo');

    for (const p of dataset.products) {
      await tx.run(SEED.linkBelongsTo, {
        productId: p.productId,
        categoryId: p.categoryId,
        marker,
      });
      counts.belongsTo += 1;
    }

    if (failAtStep === 'bought') throw new Error('TEST_FAIL_AT_bought');

    for (const e of dataset.bought) {
      await tx.run(SEED.linkBought, {
        customerId: e.customerId,
        productId: e.productId,
        eventId: e.eventId,
        quantity: e.quantity,
        unitPrice: e.unitPrice,
        purchasedAt: e.purchasedAt.toISOString(),
        marker,
      });
      counts.bought += 1;
    }

    if (failAtStep === 'viewed') throw new Error('TEST_FAIL_AT_viewed');

    for (const e of dataset.viewed) {
      await tx.run(SEED.linkViewed, {
        customerId: e.customerId,
        productId: e.productId,
        eventId: e.eventId,
        viewedAt: e.viewedAt.toISOString(),
        marker,
      });
      counts.viewed += 1;
    }

    return counts;
  });
}