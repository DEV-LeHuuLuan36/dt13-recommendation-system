// Loader V2 - nap catalog V2 (150 product moi), accounts V2 (25 customer + 1 admin + 2 inactive)
// va behaviors V2 (BOUGHT + VIEWED) vao Neo4j. Idempotent.
//
// Quy tac bao toan V1:
//  - KHONG sua product/customer V1 (chi set datasetTag de nhan dien neu chua co).
//  - KHONG reset password hash cua V1.
//  - KHONG them BOUGHT/VIEWED cho seed A-E.
//  - KHONG them BOUGHT cho CUST_005 (cold start V1).
//
// BOUGHT unitPrice duoc snap tu Product.price tai thoi diem nap (theo yeu cau).

import { SEED } from '../cypher/queries.js';
import { V2_MARKER } from './accounts-v2.js';

export const V2_LOADER_MARKER = 'DT13_SEED_V2';

/**
 * V2 loader - 1 transaction thuc thi tat ca.
 *  - neo4jSession: WRITE session.
 *  - data: { catalog, customers, admins, inactive, bought, viewed }.
 *  - options.failAtStep: chi dung cho test rollback.
 */
export async function runV2InTransaction(neo4jSession, data, options = {}) {
  const { failAtStep = null } = options;
  return neo4jSession.executeWrite(async (tx) => {
    const counts = { catalog: 0, customers: 0, admins: 0, inactive: 0, belongsTo: 0, bought: 0, viewed: 0 };

    if (failAtStep === 'catalog') throw new Error('TEST_FAIL_AT_catalog');
    for (const p of data.catalog) {
      // MERGE theo productId, ON CREATE set all; ON MATCH chi set catalogVersion va datasetTag.
      await tx.run(SEED.upsertProductV2, {
        productId: p.productId,
        name: p.name,
        description: p.description,
        price: p.price,
        imageUrl: p.imageUrl,
        marker: V2_MARKER,
      });
      counts.catalog += 1;
    }

    if (failAtStep === 'belongsTo') throw new Error('TEST_FAIL_AT_belongsTo');
    for (const p of data.catalog) {
      await tx.run(SEED.linkBelongsTo, {
        productId: p.productId,
        categoryId: p.categoryId,
        marker: V2_MARKER,
      });
      counts.belongsTo += 1;
    }

    if (failAtStep === 'customers') throw new Error('TEST_FAIL_AT_customers');
    for (const c of data.customers) {
      await tx.run(SEED.upsertCustomerV2, {
        customerId: c.customerId,
        name: c.name,
        email: c.email,
        passwordHash: c.passwordHash,
        marker: V2_MARKER,
        persona: c.persona,
      });
      counts.customers += 1;
    }

    for (const a of data.admins) {
      await tx.run(SEED.upsertAdminV2, {
        customerId: a.customerId,
        name: a.name,
        email: a.email,
        passwordHash: a.passwordHash,
        marker: V2_MARKER,
      });
      counts.admins += 1;
    }

    if (failAtStep === 'inactive') throw new Error('TEST_FAIL_AT_inactive');
    for (const c of data.inactive) {
      await tx.run(SEED.upsertCustomerV2, {
        customerId: c.customerId,
        name: c.name,
        email: c.email,
        passwordHash: c.passwordHash,
        marker: V2_MARKER,
        persona: c.persona,
      });
      // Set active=false explicitly (idempotent: only set if not already false? Just set always)
      await tx.run(SEED.markInactive, { customerId: c.customerId, marker: V2_MARKER });
      counts.inactive += 1;
    }

    if (failAtStep === 'bought') throw new Error('TEST_FAIL_AT_bought');
    for (const e of data.bought) {
      await tx.run(SEED.linkBought, {
        customerId: e.customerId,
        productId: e.productId,
        eventId: e.eventId,
        quantity: e.quantity,
        unitPrice: e.unitPrice,
        purchasedAt: e.purchasedAt.toISOString(),
        marker: V2_MARKER,
      });
      counts.bought += 1;
    }

    if (failAtStep === 'viewed') throw new Error('TEST_FAIL_AT_viewed');
    for (const e of data.viewed) {
      await tx.run(SEED.linkViewed, {
        customerId: e.customerId,
        productId: e.productId,
        eventId: e.eventId,
        viewedAt: e.viewedAt.toISOString(),
        marker: V2_MARKER,
      });
      counts.viewed += 1;
    }

    return counts;
  });
}
