#!/usr/bin/env node
/**
 * `npm run db:verify:clean` — read-only check of the post-cleanup graph.
 * Exits non-zero when invariants are violated. Never logs secrets.
 *
 * Scope: V1 cleanup (DT13_CLEAN_V1) + reference (CATALOG_REAL_120_V1) + V2
 * (DT13_SEED_V2). One admin node, no admin behaviors, no V1 placeholder
 * product/customer names, exactly one BELONGS_TO per product.
 */
import neo4j from 'neo4j-driver';
import { loadConfig } from '../src/config.js';

const EXIT_OK = 0;
const EXIT_FAIL = 1;

const V1_CLEAN_MARKER = 'DT13_CLEAN_V1';
const V2_MARKER = 'DT13_SEED_V2';
const REF_MARKER = 'CATALOG_REAL_120_V1';
const ADMIN_ID = 'ADMIN_DT13';

function log(msg) { console.log(`[db-verify-clean] ${msg}`); }
function logErr(msg) { console.error(`[db-verify-clean] ${msg}`); }

async function scalar(session, query, params) {
  const res = await session.executeRead(async (tx) => tx.run(query, params || {}));
  if (!res.records[0]) return 0;
  const v = res.records[0].get(0);
  return typeof v === 'number' ? v : Number(v);
}

async function countsByTag(session) {
  const res = await session.executeRead(async (tx) => tx.run(`
    CALL {
      MATCH (p:Product { datasetTag: $v2 }) RETURN count(p) AS v2Product
    }
    CALL {
      MATCH (p:Product { datasetTag: $ref }) RETURN count(p) AS refProduct
    }
    CALL {
      MATCH (c:Customer { datasetTag: $v2, role: 'customer' }) RETURN count(c) AS v2Customer
    }
    CALL {
      MATCH (c:Customer { datasetTag: $ref, role: 'customer' }) RETURN count(c) AS refCustomer
    }
    CALL {
      MATCH (c:Customer { role: 'customer' }) RETURN count(c) AS totalCustomerRole
    }
    CALL {
      MATCH (c:Customer { role: 'customer', active: true }) RETURN count(c) AS activeCustomerRole
    }
    CALL {
      MATCH (c:Customer { role: 'admin' }) RETURN count(c) AS adminCount
    }
    CALL {
      MATCH ()-[r:BOUGHT]->() RETURN count(r) AS totalBought
    }
    CALL {
      MATCH ()-[r:VIEWED]->() RETURN count(r) AS totalViewed
    }
    CALL {
      MATCH ()-[r:BOUGHT { datasetTag: $clean }]->() RETURN count(r) AS cleanBought
    }
    CALL {
      MATCH ()-[r:VIEWED { datasetTag: $clean }]->() RETURN count(r) AS cleanViewed
    }
    CALL {
      MATCH ()-[r:BOUGHT { datasetTag: $v2 }]->() RETURN count(r) AS v2Bought
    }
    CALL {
      MATCH ()-[r:VIEWED { datasetTag: $v2 }]->() RETURN count(r) AS v2Viewed
    }
    CALL {
      MATCH ()-[r:BOUGHT { datasetTag: $ref }]->() RETURN count(r) AS refBought
    }
    CALL {
      MATCH ()-[r:VIEWED { datasetTag: $ref }]->() RETURN count(r) AS refViewed
    }
    CALL {
      MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS totalBelongsTo
    }
    CALL {
      MATCH (c:Category) RETURN count(c) AS categoryCount
    }
    CALL {
      MATCH (p:Product) RETURN count(p) AS totalProduct
    }
    RETURN *
  `, { v2: V2_MARKER, ref: REF_MARKER, clean: V1_CLEAN_MARKER }));
  const rec = res.records[0];
  return {
    totalProduct: Number(rec.get('totalProduct')),
    v2Product: Number(rec.get('v2Product')),
    refProduct: Number(rec.get('refProduct')),
    totalCustomerRole: Number(rec.get('totalCustomerRole')),
    activeCustomerRole: Number(rec.get('activeCustomerRole')),
    v2Customer: Number(rec.get('v2Customer')),
    refCustomer: Number(rec.get('refCustomer')),
    adminCount: Number(rec.get('adminCount')),
    totalBought: Number(rec.get('totalBought')),
    totalViewed: Number(rec.get('totalViewed')),
    cleanBought: Number(rec.get('cleanBought')),
    cleanViewed: Number(rec.get('cleanViewed')),
    v2Bought: Number(rec.get('v2Bought')),
    v2Viewed: Number(rec.get('v2Viewed')),
    refBought: Number(rec.get('refBought')),
    refViewed: Number(rec.get('refViewed')),
    totalBelongsTo: Number(rec.get('totalBelongsTo')),
    categoryCount: Number(rec.get('categoryCount')),
  };
}

async function main() {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    logErr('NEO4J_NOT_CONFIGURED.');
    process.exit(EXIT_FAIL);
  }
  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { connectionTimeout: 5000, disableLosslessIntegers: true }
  );
  const session = driver.session({ database: config.neo4jDatabase, defaultAccessMode: neo4j.session.READ });
  const errors = [];
  try {
    const counts = await countsByTag(session);
    log('=== Graph totals after cleanup ===');
    log(`Product: ${counts.totalProduct} (V2=${counts.v2Product}, RC=${counts.refProduct})`);
    log(`Customer role=customer: ${counts.totalCustomerRole} (active=${counts.activeCustomerRole}, V2=${counts.v2Customer}, RC=${counts.refCustomer})`);
    log(`Admin: ${counts.adminCount}`);
    log(`BOUGHT: ${counts.totalBought} (clean=${counts.cleanBought}, V2=${counts.v2Bought}, RC=${counts.refBought})`);
    log(`VIEWED: ${counts.totalViewed} (clean=${counts.cleanViewed}, V2=${counts.v2Viewed}, RC=${counts.refViewed})`);
    log(`BELONGS_TO: ${counts.totalBelongsTo}`);
    log(`Category: ${counts.categoryCount}`);

    // Invariants
    log('=== Invariant checks ===');

    // 1) Product count >= 100
    if (counts.totalProduct < 100) errors.push(`Product < 100: ${counts.totalProduct}`);
    log(`Product >= 100: ${counts.totalProduct >= 100 ? 'OK' : 'FAIL'} (${counts.totalProduct})`);

    // 2) Customer role=customer >= 50
    if (counts.totalCustomerRole < 50) errors.push(`Customer role=customer < 50: ${counts.totalCustomerRole}`);
    log(`Customer role=customer >= 50: ${counts.totalCustomerRole >= 50 ? 'OK' : 'FAIL'} (${counts.totalCustomerRole})`);

    // 3) BOUGHT + VIEWED > 300
    const totalBehavior = counts.totalBought + counts.totalViewed;
    if (totalBehavior <= 300) errors.push(`BOUGHT+VIEWED <= 300: ${totalBehavior}`);
    log(`BOUGHT+VIEWED > 300: ${totalBehavior > 300 ? 'OK' : 'FAIL'} (${totalBehavior})`);

    // 4) BELONGS_TO = totalProduct (exactly 1 per product)
    if (counts.totalBelongsTo !== counts.totalProduct) {
      errors.push(`BELONGS_TO (${counts.totalBelongsTo}) != Product (${counts.totalProduct})`);
    }
    log(`BELONGS_TO == Product: ${counts.totalBelongsTo === counts.totalProduct ? 'OK' : 'FAIL'} (${counts.totalBelongsTo} vs ${counts.totalProduct})`);

    // 5) Khong co product co > 1 BELONGS_TO (duplicate check)
    const dupBelongs = await scalar(session, `
      MATCH (p:Product)-[r:BELONGS_TO]->(:Category)
      WITH p, count(r) AS rels
      WHERE rels > 1
      RETURN count(p) AS productsWithDup
    `);
    if (dupBelongs > 0) errors.push(`Duplicate BELONGS_TO: ${dupBelongs}`);
    log(`Duplicate BELONGS_TO: ${dupBelongs} (expected 0)`);

    // 6) Khong co product khong co BELONGS_TO
    const noBelongs = await scalar(session, `
      MATCH (p:Product)
      WHERE NOT (p)-[:BELONGS_TO]->(:Category)
      RETURN count(p) AS n
    `);
    if (noBelongs > 0) errors.push(`Product without BELONGS_TO: ${noBelongs}`);
    log(`Product without BELONGS_TO: ${noBelongs} (expected 0)`);

    // 7) Admin co it nhat 1
    if (counts.adminCount < 1) errors.push(`Admin count < 1: ${counts.adminCount}`);
    log(`Admin >= 1: ${counts.adminCount >= 1 ? 'OK' : 'FAIL'} (${counts.adminCount})`);

    // 8) Admin khong co behavior
    const adminBeh = await scalar(session, `
      MATCH (c:Customer { role: 'admin' })-[r]->() RETURN count(r) AS n
    `);
    if (adminBeh > 0) errors.push(`Admin co behavior: ${adminBeh}`);
    log(`Admin behaviors: ${adminBeh} (expected 0)`);

    // 9) Admin ADMIN_DT13 ton tai
    const adminIdExists = await scalar(session, `
      MATCH (c:Customer { customerId: $cid }) RETURN count(c) AS n
    `, { cid: ADMIN_ID });
    if (adminIdExists < 1) errors.push(`Admin ${ADMIN_ID} khong ton tai`);
    log(`Admin ${ADMIN_ID} exists: ${adminIdExists >= 1 ? 'OK' : 'FAIL'}`);

    // 10) No V1 placeholder product names remain.
    const placeholderProduct = await scalar(session, `
      MATCH (p:Product)
      WHERE p.name =~ 'Laptop DT13 .*'
         OR p.name =~ 'Smartphone DT13 .*'
         OR p.name =~ 'Tai nghe DT13 .*'
         OR p.name =~ 'Phu kien DT13 .*'
         OR p.name =~ 'Smartwatch DT13 .*'
         OR p.name =~ 'Tablet DT13 .*'
      RETURN count(p) AS n
    `);
    if (placeholderProduct > 0) errors.push(`Placeholder products: ${placeholderProduct}`);
    log(`Placeholder products: ${placeholderProduct} (expected 0)`);

    // 11) Khong con customer placeholder (ten Khach hang N)
    const placeholderCustomer = await scalar(session, `
      MATCH (c:Customer)
      WHERE c.role = 'customer'
        AND (c.name =~ 'Khach hang .*'
             OR c.name =~ 'Gamer .*'
             OR c.name =~ 'NV Van phong .*'
             OR c.name =~ 'Sinh vien .*'
             OR c.name = 'Inactive With History'
             OR c.name = 'Inactive Empty')
      RETURN count(c) AS n
    `);
    if (placeholderCustomer > 0) errors.push(`Placeholder customers: ${placeholderCustomer}`);
    log(`Placeholder customers: ${placeholderCustomer} (expected 0)`);

    // 12) Distinct bought pairs (de xac nhan co the goi y)
    const distinctPairs = await scalar(session, `
      MATCH (c:Customer)-[r:BOUGHT]->(p:Product)
      RETURN count(DISTINCT { customerId: c.customerId, productId: p.productId }) AS n
    `);
    if (distinctPairs < 100) errors.push(`Distinct bought pairs < 100: ${distinctPairs}`);
    log(`Distinct bought pairs: ${distinctPairs} (expected > 100)`);

    // 13) Constraints
    try {
      const cres = await session.executeRead(async (tx) => tx.run('SHOW CONSTRAINTS'));
      const names = cres.records.map((r) => r.get('name')).filter(Boolean);
      log(`Constraints: ${names.length} (${names.join(', ')})`);
      if (names.length < 6) errors.push(`Constraints: ${names.length} < 6`);
    } catch (err) {
      log(`SHOW CONSTRAINTS not available: ${err.message.split('\n')[0]}`);
    }

    // 14) Categories >= 6 (6 V2 + 6 RC = 12)
    if (counts.categoryCount < 6) errors.push(`Category < 6: ${counts.categoryCount}`);
    log(`Category >= 6: ${counts.categoryCount >= 6 ? 'OK' : 'FAIL'} (${counts.categoryCount})`);

    log(`Total behaviors (BOUGHT+VIEWED): ${totalBehavior}`);
  } catch (err) {
    logErr(`FAIL: ${err.message.split('\n')[0]}`);
    errors.push(err.message.split('\n')[0]);
  } finally {
    await session.close();
    await driver.close();
  }
  if (errors.length > 0) {
    logErr(`Vi pham (${errors.length}): ${errors.join(' | ')}`);
    process.exit(EXIT_FAIL);
  }
  log('ALL OK');
  process.exit(EXIT_OK);
}

main().catch((err) => {
  logErr(`Unexpected: ${err.stack || err.message || err}`);
  process.exit(EXIT_FAIL);
});
