/**
 * Integration tests for the reference loader (CATALOG_REAL_120_V1).
 *
 * Each test runs in its own per-run namespace (prefix DT13_TEST_REF_<runId>)
 * and uses a dedicated datasetTag so it cannot touch the real reference
 * graph that powers the production catalog. The loader logic (MERGE,
 * idempotency, rollback, conflict detection) is exercised through a
 * hand-built subset of nodes/edges; no fixture ever shares an ID with the
 * live 120-product set.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import neo4j from 'neo4j-driver';
import { randomBytes } from 'node:crypto';

import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import {
  loadReferenceDataset,
  runReferenceInTransaction,
  REFERENCE_PRODUCT_COUNT,
  REFERENCE_CUSTOMER_COUNT,
  REFERENCE_CATEGORY_COUNT,
  REFERENCE_BOUGHT_COUNT,
  REFERENCE_VIEWED_COUNT,
  REFERENCE_DISTINCT_BOUGHT_PAIRS,
} from '../src/seed/reference/loader-reference.js';

const TEST_RUN_ID = randomBytes(4).toString('hex');
const TEST_TAG = `DT13_TEST_REF_LOADER_${TEST_RUN_ID}`;
const TEST_PRODUCT_IDS = [
  `DT13_TEST_REF_${TEST_RUN_ID}_P1`,
  `DT13_TEST_REF_${TEST_RUN_ID}_P2`,
  `DT13_TEST_REF_${TEST_RUN_ID}_P3`,
];
const TEST_CUSTOMER_IDS = [
  `DT13_TEST_REF_${TEST_RUN_ID}_C1`,
  `DT13_TEST_REF_${TEST_RUN_ID}_C2`,
];

function buildFixtureSubset() {
  // Borrow a small piece of the real reference dataset for the structural
  // shape (price ranges, brand labels, etc.) but rename every ID so the
  // fixture cannot collide with the live 120-product reference graph.
  const data = loadReferenceDataset();
  const pidMap = new Map();
  data.products.slice(0, 3).forEach((p, i) => pidMap.set(p.productId, TEST_PRODUCT_IDS[i]));
  const cidMap = new Map();
  data.customers.slice(0, 2).forEach((c, i) => cidMap.set(c.customerId, TEST_CUSTOMER_IDS[i]));

  const products = data.products.slice(0, 3).map((p, idx) => ({
    ...p,
    productId: TEST_PRODUCT_IDS[idx],
    name: `Test ${p.name}`,
  }));
  const customers = data.customers.slice(0, 2).map((c, idx) => ({
    customerId: TEST_CUSTOMER_IDS[idx],
    name: `Test Customer ${idx + 1}`,
    email: `ref-test-${TEST_RUN_ID}-${idx}@example.test`,
    role: 'customer',
    active: true,
    createdAt: new Date().toISOString(),
    cohort: 'Test',
  }));
  // Single category (still stamped with our test tag, never COLLIDES with reference).
  const category = {
    ...data.categories[0],
    categoryId: `DT13_TEST_REF_${TEST_RUN_ID}_CAT`,
  };
  const belongsTo = TEST_PRODUCT_IDS.map((pid) => ({ productId: pid, categoryId: category.categoryId }));
  const bought = TEST_CUSTOMER_IDS.flatMap((cid, i) => [
    {
      eventId: `BOUGHT_${TEST_TAG}_${cid}_001`,
      customerId: cid,
      productId: TEST_PRODUCT_IDS[i],
      quantity: 1,
      unitPrice: 100000,
      purchasedAt: new Date().toISOString(),
    },
    {
      eventId: `BOUGHT_${TEST_TAG}_${cid}_002`,
      customerId: cid,
      productId: TEST_PRODUCT_IDS[(i + 1) % TEST_PRODUCT_IDS.length],
      quantity: 2,
      unitPrice: 200000,
      purchasedAt: new Date().toISOString(),
    },
  ]);
  const viewed = TEST_CUSTOMER_IDS.map((cid, i) => ({
    eventId: `VIEWED_${TEST_TAG}_${cid}_001`,
    customerId: cid,
    productId: TEST_PRODUCT_IDS[i],
    viewedAt: new Date().toISOString(),
  }));

  return {
    products,
    customers,
    categories: [category],
    belongsTo,
    bought,
    viewed,
  };
}async function cleanupByTag(session) {
  await session.executeWrite(async (tx) => {
    // Delete any node that carries our test tag, and any node whose ID
    // starts with the test prefix (covers nodes stamped with the tag and
    // any leftovers from a half-finished run).
    await tx.run(
      `MATCH (n) WHERE n.datasetTag = $tag OR coalesce(n.productId, '') STARTS WITH $prefix OR coalesce(n.customerId, '') STARTS WITH $prefix OR coalesce(n.categoryId, '') STARTS WITH $prefix OR coalesce(n.eventId, '') STARTS WITH $prefix DETACH DELETE n`,
      { tag: TEST_TAG, prefix: `DT13_TEST_REF_${TEST_RUN_ID}` }
    );
  });
}

test('reference dataset: read + validate', () => {
  const data = loadReferenceDataset();
  assert.equal(data.products.length, REFERENCE_PRODUCT_COUNT);
  assert.equal(data.customers.length, REFERENCE_CUSTOMER_COUNT);
  assert.equal(data.categories.length, REFERENCE_CATEGORY_COUNT);
  assert.equal(data.bought.length, REFERENCE_BOUGHT_COUNT);
  assert.equal(data.viewed.length, REFERENCE_VIEWED_COUNT);
  assert.equal(data.belongsTo.length, REFERENCE_PRODUCT_COUNT);
  const pairs = new Set(data.bought.map((b) => `${b.customerId}|${b.productId}`));
  assert.equal(pairs.size, REFERENCE_DISTINCT_BOUGHT_PAIRS);
});

test('integration: reference loader rollback + idempotent + conflict', async (t) => {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    t.skip('NEO4J not configured; skipping reference integration test.');
    return;
  }
  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { disableLosslessIntegers: true }
  );
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    // Build a subset that uses our per-run IDs and a dedicated datasetTag.
    const subset = buildFixtureSubset();
    const credentials = new Map();
    for (const c of subset.customers) {
      const hash = await hashPassword(`ref-test-${c.customerId}`);
      credentials.set(c.customerId, { hash });
    }

    // The loader hard-codes REFERENCE_MARKER but accepts an override
    // (test-only). Use the override so the test can keep its data in a
    // dedicated namespace and never touch the live reference graph.
    const testOptions = { skipPreValidate: true, tag: TEST_TAG };

    // Start from a clean slate (defensive).
    await cleanupByTag(session);

    await t.test('runs successfully on the subset (idempotent)', async () => {
      const counts = await runReferenceInTransaction(session, subset, credentials, testOptions);
      assert.equal(counts.categories, subset.categories.length);
      assert.equal(counts.products, subset.products.length);
      assert.equal(counts.customers, subset.customers.length);
      assert.equal(counts.belongsTo, subset.belongsTo.length);
      assert.equal(counts.bought, subset.bought.length);
      assert.equal(counts.viewed, subset.viewed.length);

      // Run twice more; counts must not grow (idempotency).
      await runReferenceInTransaction(session, subset, credentials, testOptions);
      const after = await session.executeRead(async (tx) => tx.run(
        `MATCH ()-[r:BOUGHT]->() WHERE r.datasetTag = $tag RETURN count(r) AS c`,
        { tag: TEST_TAG }
      ));
      assert.equal(Number(after.records[0].get('c')), subset.bought.length);
    });

    await t.test('rollback at the products step (after writing category) wipes everything', async () => {
      const runId = randomBytes(4).toString('hex');
      const tmpProduct = {
        productId: `DT13_TEST_REF_${runId}_PROD`,
        name: 'tmp',
        brand: 'tmp',
        model: 'tmp',
        description: 'tmp',
        price: 1,
        currency: 'VND',
        active: true,
        createdAt: new Date().toISOString(),
        imageUrl: '',
        illustrationKey: 'laptop',
        imageKind: 'category_illustration',
        slug: 'tmp',
        searchText: 'tmp',
        sourceUrl: '',
        catalogKey: 'tmp',
        datasetTag: TEST_TAG,
      };
      const tmpCustomer = {
        customerId: `DT13_TEST_REF_${runId}_CUST`,
        name: 'tmp',
        email: `dt13-ref-${runId}@example.test`,
        role: 'customer',
        active: true,
        createdAt: new Date().toISOString(),
        cohort: 'tmp',
        datasetTag: TEST_TAG,
      };
      const tmpSubset = {
        products: [tmpProduct],
        customers: [tmpCustomer],
        categories: [{ ...subset.categories[0], categoryId: `DT13_TEST_REF_${runId}_CAT`, datasetTag: TEST_TAG }],
        bought: [],
        viewed: [],
        belongsTo: [{ productId: tmpProduct.productId, categoryId: `DT13_TEST_REF_${runId}_CAT` }],
      };
      const tmpCred = new Map();
      tmpCred.set(tmpCustomer.customerId, { hash: 'scrypt$1$1$1$AAAA$BBBB' });
      await assert.rejects(
        runReferenceInTransaction(session, tmpSubset, tmpCred, { failAtStep: 'products', skipPreValidate: true, tag: TEST_TAG }),
        /TEST_FAIL_AT_products/
      );
      // No node carrying this per-run prefix should remain.
      const c = await session.executeRead(async (tx) => tx.run(
        `MATCH (n) WHERE (n.productId STARTS WITH $prefix OR n.customerId STARTS WITH $prefix OR n.categoryId STARTS WITH $prefix) RETURN count(n) AS c`,
        { prefix: `DT13_TEST_REF_${runId}` }
      ));
      assert.equal(Number(c.records[0]?.get('c') || 0), 0);
    });

    await t.test('conflict payload: BOUGHT eventId already exists with a different unitPrice -> throw', async () => {
      const conflicted = JSON.parse(JSON.stringify(subset));
      if (!conflicted.bought.length) return;
      conflicted.bought[0] = { ...conflicted.bought[0], unitPrice: Number(conflicted.bought[0].unitPrice) + 1 };
      await assert.rejects(
        runReferenceInTransaction(session, conflicted, credentials, { skipPreValidate: true, tag: TEST_TAG }),
        /BOUGHT eventId .* da ton tai voi payload khac/
      );
    });
  } finally {
    // Final cleanup: anything still tagged or ID-prefixed for this run.
    await cleanupByTag(session);
    await session.close();
    await driver.close();
  }
});
