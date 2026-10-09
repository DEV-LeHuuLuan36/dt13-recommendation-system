/**
 * Integration tests for the seed loader's transaction rollback.
 * Connects to a real Neo4j, writes a small fixture with its own datasetTag,
 * verifies a forced mid-run failure rolls everything back, then cleans up.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import neo4j from 'neo4j-driver';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { runSeedInTransaction } from '../src/seed/loader.js';
import { hashPassword } from '../src/password.js';

function buildFixtureDataset(runId) {
  const marker = `DT13_TEST_${runId}`;
  return {
    marker,
    categories: [
      { categoryId: `${marker}_CAT_A`, name: 'Test Category A', description: 'fixture' },
    ],
    products: [
      { productId: `${marker}_PROD_1`, name: 'Fixture Product 1', description: 'fixture', price: 100_000, imageUrl: '/x.svg', categoryId: `${marker}_CAT_A` },
      { productId: `${marker}_PROD_2`, name: 'Fixture Product 2', description: 'fixture', price: 200_000, imageUrl: '/x.svg', categoryId: `${marker}_CAT_A` },
    ],
    customers: [
      { customerId: `${marker}_CUST_1`, name: 'Fixture C1', email: `c1-${runId}@example.test`, role: 'customer', active: true },
      { customerId: `${marker}_ADMIN`, name: 'Fixture A', email: `admin-${runId}@example.test`, role: 'admin', active: true },
    ],
    bought: [
      { eventId: `${marker}_EVT_B1`, customerId: `${marker}_CUST_1`, productId: `${marker}_PROD_1`, quantity: 1, unitPrice: 100_000, purchasedAt: new Date() },
    ],
    viewed: [
      { eventId: `${marker}_EVT_V1`, customerId: `${marker}_CUST_1`, productId: `${marker}_PROD_2`, viewedAt: new Date() },
    ],
  };
}

async function cleanupByMarker(session, marker) {
  // Remove every node/edge belonging to the fixture (matched by datasetTag or ID prefix).
  await session.executeWrite(async (tx) => {
    await tx.run(`MATCH (n) WHERE n.datasetTag = $marker DETACH DELETE n`, { marker });
  });
  // Note: BOUGHT/VIEWED edges from this fixture also carry datasetTag = marker.
}

async function countByMarker(session, marker) {
  const res = await session.executeRead(async (tx) => tx.run(
    `MATCH (n) WHERE n.datasetTag = $marker RETURN count(n) AS n`,
    { marker }
  ));
  return Number(res.records[0]?.get('n') || 0);
}

test('integration: seed transaction completes and writes all records', async (t) => {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    t.skip('NEO4J not configured; skipping integration test.');
    return;
  }
  const runId = randomBytes(4).toString('hex');
  const marker = `DT13_TEST_${runId}`;
  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { disableLosslessIntegers: true }
  );
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    const ds = buildFixtureDataset(runId);
    const adminHash = await hashPassword('admin-fixture-001');
    const customerHash = await hashPassword('cust-fixture-001');

    // Start from a clean slate.
    await cleanupByMarker(session, marker);

    await t.test('runs successfully', async () => {
      const totals = await runSeedInTransaction(session, ds, adminHash, customerHash);
      assert.equal(totals.categories, 1);
      assert.equal(totals.products, 2);
      assert.equal(totals.customers, 2);
      assert.equal(totals.belongsTo, 2);
      assert.equal(totals.bought, 1);
      assert.equal(totals.viewed, 1);
      const c = await countByMarker(session, marker);
      // 1 cat + 2 prod + 2 cust = 5 nodes
      assert.equal(c, 5);
    });

    await t.test('re-running is idempotent (merge)', async () => {
      const totals = await runSeedInTransaction(session, ds, adminHash, customerHash);
      assert.equal(totals.products, 2);
      const c = await countByMarker(session, marker);
      assert.equal(c, 5);
    });

    await t.test('rollback when customers step fails', async () => {
      // Build a separate dataset to verify rollback.
      const runId2 = randomBytes(4).toString('hex');
      const marker2 = `DT13_TEST_${runId2}`;
      const ds2 = buildFixtureDataset(runId2);
      ds2.marker = marker2;
      await cleanupByMarker(session, marker2);
      await assert.rejects(
        runSeedInTransaction(session, ds2, adminHash, customerHash, { failAtStep: 'customers' }),
        /TEST_FAIL_AT_customers/
      );
      // After rollback no node/edge for marker2 should remain.
      const c = await countByMarker(session, marker2);
      assert.equal(c, 0, `After rollback should be clean but ${c} remain`);
    });

    await t.test('rollback at the bought step (after BOUGHT write) wipes everything', async () => {
      const runId3 = randomBytes(4).toString('hex');
      const marker3 = `DT13_TEST_${runId3}`;
      const ds3 = buildFixtureDataset(runId3);
      ds3.marker = marker3;
      await cleanupByMarker(session, marker3);
      await assert.rejects(
        runSeedInTransaction(session, ds3, adminHash, customerHash, { failAtStep: 'bought' }),
        /TEST_FAIL_AT_bought/
      );
      const c = await countByMarker(session, marker3);
      assert.equal(c, 0, `After rollback at bought, everything must be clean but ${c} remain`);
    });
  } finally {
    // Final cleanup: anything still tagged with the test prefix.
    await session.executeWrite(async (tx) => {
      await tx.run(`MATCH (n) WHERE n.datasetTag STARTS WITH 'DT13_TEST_' DETACH DELETE n`);
    });
    await session.close();
    await driver.close();
  }
});