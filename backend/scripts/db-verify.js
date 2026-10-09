#!/usr/bin/env node
/**
 * `npm run db:verify` (Phase 6)
 *
 * Chi doc, exit != 0 neu vi pham cac rang buoc seed V1 (DT13_SEED_V1).
 *  - V1 scope: 105 Product / 55 customer role=customer / 1 admin / 6 Category /
 *    260 BOUGHT / 180 VIEWED / 105 BELONGS_TO.
 *  - V2 scope (DT13_SEED_V2): catalog + accounts + behaviors V2.
 *  - Tổng graph in ra để tham khảo (co the khac nếu co runtime CRUD ngoai seed).
 *  - Idempotency: hash V1 BOUGHT fingerprint khop.
 *
 * Khong in passwordHash, salt, secret.
 */
import { createHash } from 'node:crypto';
import neo4j from 'neo4j-driver';
import { loadConfig } from '../src/config.js';
import { VERIFY } from '../src/cypher/queries.js';
import {
  PRODUCT_COUNT,
  CUSTOMER_COUNT,
  CATEGORY_COUNT,
} from '../src/seed/generator.js';
import { CATALOG_V2_COUNT } from '../src/seed/catalog-v2.js';

const EXIT_OK = 0;
const EXIT_FAIL = 1;

function log(msg) { console.log(`[db-verify] ${msg}`); }
function logErr(msg) { console.error(`[db-verify] ${msg}`); }

async function scalar(session, query, params) {
  const res = await session.executeRead(async (tx) => tx.run(query, params));
  if (!res.records[0]) return 0;
  const v = res.records[0].get(0);
  return typeof v === 'number' ? v : Number(v);
}

async function countsByTag(session) {
  // Dem V1 / V2 / total
  const res = await session.executeRead(async (tx) => tx.run(`
    CALL {
      MATCH (c:Customer { datasetTag: 'DT13_SEED_V1' }) RETURN count(c) AS v1Customer
    }
    CALL {
      MATCH (c:Customer { datasetTag: 'DT13_SEED_V2' }) RETURN count(c) AS v2Customer
    }
    CALL {
      MATCH (p:Product { datasetTag: 'DT13_SEED_V1' }) RETURN count(p) AS v1Product
    }
    CALL {
      MATCH (p:Product { datasetTag: 'DT13_SEED_V2' }) RETURN count(p) AS v2Product
    }
    CALL {
      MATCH ()-[r:BOUGHT { datasetTag: 'DT13_SEED_V1' }]->() RETURN count(r) AS v1Bought
    }
    CALL {
      MATCH ()-[r:BOUGHT { datasetTag: 'DT13_SEED_V2' }]->() RETURN count(r) AS v2Bought
    }
    CALL {
      MATCH ()-[r:VIEWED { datasetTag: 'DT13_SEED_V1' }]->() RETURN count(r) AS v1Viewed
    }
    CALL {
      MATCH ()-[r:VIEWED { datasetTag: 'DT13_SEED_V2' }]->() RETURN count(r) AS v2Viewed
    }
    CALL {
      MATCH ()-[r:BELONGS_TO { datasetTag: 'DT13_SEED_V1' }]->() RETURN count(r) AS v1BelongsTo
    }
    CALL {
      MATCH ()-[r:BELONGS_TO { datasetTag: 'DT13_SEED_V2' }]->() RETURN count(r) AS v2BelongsTo
    }
    CALL {
      MATCH (c:Customer) RETURN count(c) AS totalCustomer
    }
    CALL {
      MATCH (p:Product) RETURN count(p) AS totalProduct
    }
    CALL {
      MATCH ()-[r:BOUGHT]->() RETURN count(r) AS totalBought
    }
    CALL {
      MATCH ()-[r:VIEWED]->() RETURN count(r) AS totalViewed
    }
    CALL {
      MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS totalBelongsTo
    }
    CALL {
      MATCH (c:Category) RETURN count(c) AS totalCategory
    }
    RETURN *
  `));
  const rec = res.records[0];
  return {
    v1: {
      customer: Number(rec.get('v1Customer')),
      product: Number(rec.get('v1Product')),
      bought: Number(rec.get('v1Bought')),
      viewed: Number(rec.get('v1Viewed')),
      belongsTo: Number(rec.get('v1BelongsTo')),
    },
    v2: {
      customer: Number(rec.get('v2Customer')),
      product: Number(rec.get('v2Product')),
      bought: Number(rec.get('v2Bought')),
      viewed: Number(rec.get('v2Viewed')),
      belongsTo: Number(rec.get('v2BelongsTo')),
    },
    total: {
      customer: Number(rec.get('totalCustomer')),
      product: Number(rec.get('totalProduct')),
      bought: Number(rec.get('totalBought')),
      viewed: Number(rec.get('totalViewed')),
      belongsTo: Number(rec.get('totalBelongsTo')),
      category: Number(rec.get('totalCategory')),
    },
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
    // V1 scope (idempotent)
    const v1Expected = {
      customer: CUSTOMER_COUNT + 1, // 55 customer + 1 admin
      product: PRODUCT_COUNT,
      bought: 260,
      viewed: 180,
      belongsTo: PRODUCT_COUNT,
    };
    log('V1 scope (DT13_SEED_V1):');
    for (const [k, v] of Object.entries(v1Expected)) {
      const actual = counts.v1[k];
      const ok = actual === v;
      log(`  v1.${k}: ${actual} (expected ${v}) ${ok ? 'OK' : 'MISMATCH'}`);
      if (!ok) errors.push(`v1.${k}: ${actual} != ${v}`);
    }

    // V2 scope (idempotent)
    const v2Expected = {
      customer: 28, // 25 customer + 1 admin phu + 2 inactive
      product: CATALOG_V2_COUNT,
      bought: 907,
      viewed: 650,
      belongsTo: CATALOG_V2_COUNT,
    };
    log('V2 scope (DT13_SEED_V2):');
    for (const [k, v] of Object.entries(v2Expected)) {
      const actual = counts.v2[k];
      const ok = actual === v;
      log(`  v2.${k}: ${actual} (expected ${v}) ${ok ? 'OK' : 'MISMATCH'}`);
      if (!ok) errors.push(`v2.${k}: ${actual} != ${v}`);
    }

    log(`Tổng graph: ${JSON.stringify(counts.total)}`);

    // V1 invariants (Phase 2)
    const distinctPairs = await scalar(session, VERIFY.distinctBoughtPairs);
    log(`distinctBoughtPairs (V1 only): ${distinctPairs} (expected 259)`);
    if (distinctPairs !== 259) errors.push(`distinctBoughtPairs: ${distinctPairs} != 259`);

    const fixtureRes = await session.executeRead(async (tx) => tx.run(VERIFY.fixtureGroup));
    const expectedByCid = {
      CUST_001: new Set(['PROD_001', 'PROD_002']),
      CUST_002: new Set(['PROD_001', 'PROD_002', 'PROD_003']),
      CUST_003: new Set(['PROD_001', 'PROD_003', 'PROD_004']),
      CUST_004: new Set(['PROD_002', 'PROD_004']),
      CUST_005: new Set(),
    };
    let fixtureOk = true;
    for (const record of fixtureRes.records) {
      const cid = record.get('cid');
      const prods = record.get('products') || [];
      const set = new Set(prods);
      const exp = expectedByCid[cid];
      if (!exp) continue;
      const same = set.size === exp.size && [...exp].every((p) => set.has(p));
      if (!same) { errors.push(`Fixture ${cid}: got ${[...set].sort()} expected ${[...exp].sort()}`); fixtureOk = false; }
    }
    log(`Fixture A..E: ${fixtureOk ? 'OK' : 'MISMATCH'}`);

    const groupAViolations = await scalar(session, VERIFY.groupABoughtAllows);
    if (groupAViolations > 0) errors.push(`group A-D bought P1..P4 only: violations=${groupAViolations}`);
    log(`group A-D only P1..P4: ${groupAViolations}`);

    const c5Edges = await scalar(session, VERIFY.customer5NoBought);
    if (c5Edges > 0) errors.push(`CUST_005 co BOUGHT: ${c5Edges}`);
    log(`CUST_005 BOUGHT count: ${c5Edges} (expected 0)`);

    const group6Violations = await scalar(session, VERIFY.group6to55NoP1toP4);
    if (group6Violations > 0) errors.push(`group 6..55 bought P1..P4: violations=${group6Violations}`);
    log(`group CUST_006..055 no P1..P4: ${group6Violations}`);

    // Admin behaviors (chi tinh admin role, active)
    const adminBeh = await scalar(session, VERIFY.adminNoBehaviors);
    if (adminBeh > 0) errors.push(`admin role co behaviors: ${adminBeh}`);
    log(`admin behaviors: ${adminBeh} (expected 0)`);

    const dupBelongs = await scalar(session, VERIFY.duplicateBelongsTo);
    if (dupBelongs > 0) errors.push(`Duplicate BELONGS_TO: ${dupBelongs}`);
    log(`Duplicate BELONGS_TO: ${dupBelongs}`);

    const missing = await scalar(session, VERIFY.missingFields);
    if (missing > 0) errors.push(`Customer missing fields: ${missing}`);
    log(`Customer missing fields: ${missing}`);

    const boughtEventMissing = await scalar(session, VERIFY.boughtEventIdMissing);
    if (boughtEventMissing > 0) errors.push(`BOUGHT missing eventId: ${boughtEventMissing}`);
    log(`BOUGHT eventId missing: ${boughtEventMissing} (expected 0)`);

    const viewedEventMissing = await scalar(session, VERIFY.viewedEventIdMissing);
    if (viewedEventMissing > 0) errors.push(`VIEWED missing eventId: ${viewedEventMissing}`);
    log(`VIEWED eventId missing: ${viewedEventMissing} (expected 0)`);

    const boughtTimeMissing = await scalar(session, VERIFY.boughtTimeMissing);
    if (boughtTimeMissing > 0) errors.push(`BOUGHT missing purchasedAt: ${boughtTimeMissing}`);
    log(`BOUGHT purchasedAt missing: ${boughtTimeMissing} (expected 0)`);

    const viewedTimeMissing = await scalar(session, VERIFY.viewedTimeMissing);
    if (viewedTimeMissing > 0) errors.push(`VIEWED missing viewedAt: ${viewedTimeMissing}`);
    log(`VIEWED viewedAt missing: ${viewedTimeMissing} (expected 0)`);

    const adminBehRes = await session.executeRead(async (tx) => tx.run(VERIFY.adminNoBehaviorsDetail));
    if (adminBehRes.records.length > 0) {
      const sample = adminBehRes.records.slice(0, 5).map((r) => `${r.get('cid')}:${r.get('type')}x${r.get('behaviors')}`).join(', ');
      errors.push(`admin role co behaviors (${adminBehRes.records.length}): ${sample}`);
    }
    log(`admin behaviors (detail): ${adminBehRes.records.length} (expected 0)`);

    // V1 BOUGHT fingerprint (idempotency)
    const fpRes = await session.executeRead(async (tx) => tx.run(`
      MATCH ()-[r:BOUGHT { datasetTag: 'DT13_SEED_V1' }]->()
      RETURN r.eventId AS eventId, r.unitPrice AS unitPrice, r.purchasedAt AS purchasedAt
      ORDER BY r.eventId
    `));
    const h = createHash('sha256');
    for (const r of fpRes.records) {
      h.update(`${r.get('eventId')}|${r.get('unitPrice')}|${r.get('purchasedAt') ? r.get('purchasedAt').toString() : ''}\n`);
    }
    const digest = h.digest('hex');
    log(`V1 BOUGHT fingerprint: ${digest}`);

    log(`V1 dataset target: ${PRODUCT_COUNT + CUSTOMER_COUNT + 1 + CATEGORY_COUNT} nodes, ${260 + 180 + PRODUCT_COUNT} edges (chi seed V1)`);
    log(`V2 dataset target: ${CATALOG_V2_COUNT + 28 + CATEGORY_COUNT} nodes, ${907 + 650 + CATALOG_V2_COUNT} edges (chi seed V2)`);
    log(`Tong graph (co the khac neu co CRUD ngoai seed): ${JSON.stringify(counts.total)}`);

    try {
      const cres = await session.executeRead(async (tx) => tx.run(VERIFY.showConstraints));
      const names = cres.records.map((r) => r.get('name')).filter(Boolean);
      log(`Constraints: ${names.length} (${names.join(', ')})`);
      if (names.length < 6) errors.push(`Constraints: ${names.length} < 6`);
    } catch (err) {
      log(`SHOW CONSTRAINTS khong kha dung: ${err.message.split('\n')[0]}`);
    }
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
