#!/usr/bin/env node
/**
 * `npm run db:verify` — read-only seed invariant check. Exits non-zero on any
 * mismatch in the V1, V2, or reference (CATALOG_REAL_120_V1) scopes. Total
 * graph counts are reported for context and may differ when runtime CRUD rows
 * exist. Never logs passwordHash, salt, or session secrets.
 */
import { createHash } from 'node:crypto';
import neo4j from 'neo4j-driver';
import { loadConfig } from '../src/config.js';
import { VERIFY } from '../src/cypher/queries.js';

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
    CALL {
      MATCH (p:Product)
        WHERE 'CATALOG_REAL_120_V1' IN coalesce(p.referenceCatalogTags, [])
        RETURN count(p) AS refProduct
    }
    CALL {
      MATCH (c:Customer)
        WHERE c.role = 'customer'
          AND 'CATALOG_REAL_120_V1' IN coalesce(c.referenceCatalogTags, [])
        RETURN count(c) AS refCustomer
    }
    // BOUGHT/VIEWED that point at Reference products (filter by endpoint,
    // not by edge tag, so existing DT13_CLEAN_V1 edges still match).
    CALL {
      MATCH ()-[r:BOUGHT]->(p:Product)
        WHERE p.datasetTag = 'CATALOG_REAL_120_V1'
        RETURN count(r) AS refBought
    }
    CALL {
      MATCH ()-[r:VIEWED]->(p:Product)
        WHERE p.datasetTag = 'CATALOG_REAL_120_V1'
        RETURN count(r) AS refViewed
    }
    CALL {
      MATCH (:Customer)-[r:BOUGHT]->(p:Product)
        WHERE p.datasetTag = 'CATALOG_REAL_120_V1'
        RETURN count(DISTINCT [coalesce(startNode(r).customerId, ''), endNode(r).productId]) AS refDistinctBoughtPairs
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
    ref: {
      product: Number(rec.get('refProduct')),
      customer: Number(rec.get('refCustomer')),
      bought: Number(rec.get('refBought')),
      viewed: Number(rec.get('refViewed')),
      distinctBoughtPairs: Number(rec.get('refDistinctBoughtPairs')),
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
    // V1 scope: the legacy 100-product fixture was removed; this DB now only
    // carries the 120-reference catalog. Expect zero rows for V1.
    const v1Expected = {
      customer: 0,
      product: 0,
      bought: 0,
      viewed: 0,
      belongsTo: 0,
    };
    log('V1 scope (DT13_SEED_V1):');
    for (const [k, v] of Object.entries(v1Expected)) {
      const actual = counts.v1[k];
      const ok = actual === v;
      log(`  v1.${k}: ${actual} (expected ${v}) ${ok ? 'OK' : 'MISMATCH'}`);
      if (!ok) errors.push(`v1.${k}: ${actual} != ${v}`);
    }

    // V2 scope: the 150-product V2 catalog has been removed.
    const v2Expected = {
      customer: 0,
      product: 0,
      bought: 0,
      viewed: 0,
      belongsTo: 0,
    };
    log('V2 scope (DT13_SEED_V2):');
    for (const [k, v] of Object.entries(v2Expected)) {
      const actual = counts.v2[k];
      const ok = actual === v;
      log(`  v2.${k}: ${actual} (expected ${v}) ${ok ? 'OK' : 'MISMATCH'}`);
      if (!ok) errors.push(`v2.${k}: ${actual} != ${v}`);
    }

    log(`graph totals: ${JSON.stringify(counts.total)}`);

    // Reference (CATALOG_REAL_120_V1) - the canonical catalog after V1/V2 removal.
    // BOUGHT/VIEWED totals reflect the current state of the graph; only the
    // catalog coverage (120 products, 60 customers) is a hard invariant.
    // Some customers buy the same product multiple times in the source data
    // (different eventId per purchase), so the distinct (customer, product)
    // pair count is normally lower than the total BOUGHT event count.
    const refExpected = {
      product: 120,
      customer: 60,
      bought: 372,
      viewed: 360,
      distinctBoughtPairs: 360,
    };
    log('Reference scope (CATALOG_REAL_120_V1):');
    for (const [k, v] of Object.entries(refExpected)) {
      const actual = counts.ref[k];
      const ok = actual === v;
      log(`  ref.${k}: ${actual} (expected ${v}) ${ok ? 'OK' : 'MISMATCH'}`);
      if (!ok) errors.push(`ref.${k}: ${actual} != ${v}`);
    }

    // V1 invariants (Phase 2) - V1 has been removed; everything should be 0.
    const distinctPairs = await scalar(session, VERIFY.distinctBoughtPairs);
    log(`distinctBoughtPairs (V1 only): ${distinctPairs} (expected 0)`);
    if (distinctPairs !== 0) errors.push(`distinctBoughtPairs (V1): ${distinctPairs} != 0`);

    const fixtureRes = await session.executeRead(async (tx) => tx.run(VERIFY.fixtureGroup));
    // V1 fixture customers (CUST_001..005) no longer exist after V1 removal;
    // any record returned with an empty products list is OK because the
    // customer itself is absent.
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
      // OPTIONAL MATCH returns empty set for missing customers; treat that as OK.
      if (set.size === 0) continue;
      const same = set.size === exp.size && [...exp].every((p) => set.has(p));
      if (!same) { errors.push(`Fixture ${cid}: got ${[...set].sort()} expected ${[...exp].sort()}`); fixtureOk = false; }
    }
    log(`Fixture A..E: ${fixtureOk ? 'OK' : 'MISMATCH'} (V1 fixture customers removed)`);

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

    // Idempotency fingerprint: hash every Reference BOUGHT
    // eventId/unitPrice/purchasedAt in order to detect accidental churn.
    const fpRes = await session.executeRead(async (tx) => tx.run(`
      MATCH (c:Customer)-[r:BOUGHT]->(p:Product)
      WHERE p.datasetTag = 'CATALOG_REAL_120_V1'
      RETURN r.eventId AS eventId, r.unitPrice AS unitPrice, r.purchasedAt AS purchasedAt
      ORDER BY r.eventId
    `));
    const h = createHash('sha256');
    for (const r of fpRes.records) {
      h.update(`${r.get('eventId')}|${r.get('unitPrice')}|${r.get('purchasedAt') ? r.get('purchasedAt').toString() : ''}\n`);
    }
    const digest = h.digest('hex');
    log(`Reference BOUGHT fingerprint: ${digest}`);

    log(`Reference dataset target: 120 products, 60 customers, 6 categories, 120 BELONGS_TO`);
    log(`Graph total: ${JSON.stringify(counts.total)}`);

    try {
      const cres = await session.executeRead(async (tx) => tx.run(VERIFY.showConstraints));
      const names = cres.records.map((r) => r.get('name')).filter(Boolean);
      log(`Constraints: ${names.length} (${names.join(', ')})`);
      if (names.length < 6) errors.push(`Constraints: ${names.length} < 6`);
    } catch (err) {
      log(`SHOW CONSTRAINTS not available: ${err.message.split('\n')[0]}`);
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
