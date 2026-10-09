/**
 * Integration test cho `runSeedInTransaction` (loader).
 *
 * Ket noi Neo4j that (qua `loadConfig()`), sinh 1 dataset nho voi ID va
 * datasetTag rieng (`DT13_TEST_<runId>`), chay 1 lan thanh cong, 1 lan
 * gay loi o buoc thu 3 (customers), verify rollback, cleanup.
 *
 * Khong dung du lieu seed that (PROD_001, CUST_001, ...).
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
  // Xoa toan bo node/edge thuoc fixture (theo datasetTag hoac ID prefix).
  // Dung vi nhieu buoc lien quan.
  await session.executeWrite(async (tx) => {
    await tx.run(`MATCH (n) WHERE n.datasetTag = $marker DETACH DELETE n`, { marker });
  });
  // Dam bao cung cap nhat BOUGHT/VIEWED khong co datasetTag (do dataset nho cua ta co):
  // (CAC node thuoc fixture co datasetTag = marker; cac edge cung co.)
}

async function countByMarker(session, marker) {
  const res = await session.executeRead(async (tx) => tx.run(
    `MATCH (n) WHERE n.datasetTag = $marker RETURN count(n) AS n`,
    { marker }
  ));
  return Number(res.records[0]?.get('n') || 0);
}

test('integration: seed transaction hoan tat va ghi tat ca records', async (t) => {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    t.skip('NEO4J khong cau hinh; bo qua integration test.');
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

    // Dam bao sach truoc
    await cleanupByMarker(session, marker);

    await t.test('chay thanh cong', async () => {
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

    await t.test('chay lai idempotent (merge)', async () => {
      const totals = await runSeedInTransaction(session, ds, adminHash, customerHash);
      assert.equal(totals.products, 2);
      const c = await countByMarker(session, marker);
      assert.equal(c, 5);
    });

    await t.test('rollback khi fail o buoc customers', async () => {
      // Tao dataset khac de kiem rollback
      const runId2 = randomBytes(4).toString('hex');
      const marker2 = `DT13_TEST_${runId2}`;
      const ds2 = buildFixtureDataset(runId2);
      ds2.marker = marker2;
      await cleanupByMarker(session, marker2);
      await assert.rejects(
        runSeedInTransaction(session, ds2, adminHash, customerHash, { failAtStep: 'customers' }),
        /TEST_FAIL_AT_customers/
      );
      // Sau rollback, khong co node/edge nao thuoc marker2
      const c = await countByMarker(session, marker2);
      assert.equal(c, 0, `Sau rollback phai clean nhung con ${c}`);
    });

    await t.test('rollback khi fail o buoc bought (sau khi da ghi BOUGHT) cung rollback toan bo', async () => {
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
      assert.equal(c, 0, `Sau rollback o bought, toan bo phai clean nhung con ${c}`);
    });
  } finally {
    // Cleanup tat ca fixture con sot theo prefix DT13_TEST_
    await session.executeWrite(async (tx) => {
      await tx.run(`MATCH (n) WHERE n.datasetTag STARTS WITH 'DT13_TEST_' DETACH DELETE n`);
    });
    await session.close();
    await driver.close();
  }
});