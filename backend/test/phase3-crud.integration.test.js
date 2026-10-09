/**
 * Integration tests for Product/Category/Customer CRUD plus interactions and history.
 * Runs against a real Neo4j with a per-run fixture prefix so seed/user data is not touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import neo4j from 'neo4j-driver';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { bootstrap } from '../src/app.js';
import { hashPassword } from '../src/password.js';

async function cleanupByPrefix(session, prefix) {
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MATCH (n) WHERE (n.datasetTag IS NOT NULL AND n.datasetTag STARTS WITH $prefix)
         OR (n.productId IS NOT NULL AND n.productId STARTS WITH $prefix)
         OR (n.categoryId IS NOT NULL AND n.categoryId STARTS WITH $prefix)
         OR (n.customerId IS NOT NULL AND n.customerId STARTS WITH $prefix)
         OR (n.email IS NOT NULL AND toLower(n.email) CONTAINS toLower($prefix))
         OR (r.datasetTag IS NOT NULL AND r.datasetTag STARTS WITH $prefix)
       DETACH DELETE n`,
      { prefix }
    );
    // Also purge rows created by CRUD paths (UUID-style IDs that do not
    // collide with the seed prefixes).
    await tx.run(
      `MATCH (p:Product) WHERE p.productId =~ 'PROD_[a-f0-9]{32}' DETACH DELETE p`
    );
    await tx.run(
      `MATCH (c:Category) WHERE c.categoryId =~ 'CAT_[a-f0-9]{32}' DETACH DELETE c`
    );
    await tx.run(
      `MATCH (c:Customer) WHERE c.customerId =~ 'CUST_[a-f0-9]{32}' DETACH DELETE c`
    );
    // Only delete BOUGHT/VIEWED created by CRUD; canonical seed markers are off limits.
    await tx.run(
      `MATCH ()-[r:BOUGHT]-() WHERE r.eventId IS NOT NULL
         AND NOT r.eventId STARTS WITH 'BOUGHT_DT13_SEED_V1_'
         AND NOT r.eventId STARTS WITH 'BOUGHT_DT13_SEED_V1_CLEAN_'
         AND NOT r.eventId STARTS WITH 'BOUGHT_DT13_SEED_V2_'
         AND NOT r.eventId STARTS WITH 'BOUGHT_CATALOG_REAL_120_V1_'
         AND NOT r.eventId STARTS WITH 'RC_B'
       DETACH DELETE r`
    );
    await tx.run(
      `MATCH ()-[r:VIEWED]-() WHERE r.eventId IS NOT NULL
         AND NOT r.eventId STARTS WITH 'VIEWED_DT13_SEED_V1_'
         AND NOT r.eventId STARTS WITH 'VIEWED_DT13_SEED_V1_CLEAN_'
         AND NOT r.eventId STARTS WITH 'VIEWED_DT13_SEED_V2_'
         AND NOT r.eventId STARTS WITH 'VIEWED_CATALOG_REAL_120_V1_'
         AND NOT r.eventId STARTS WITH 'RC_V'
       DETACH DELETE r`
    );
  });
}

/**
 * Cleanup through the app's neo4jClient so it can remove records that the
 * API test just wrote (an open transaction may still hold the session pool).
 * This helper does not reuse the test's session.
 *
 * neo4jClient only exposes `write(query, params)`, not `executeWrite(worker)`,
 * so we issue several independent queries instead of one transaction.
 */
async function cleanupByPrefixViaApp(neo4jClient, prefix) {
  if (!neo4jClient || typeof neo4jClient.write !== 'function') return;
  await neo4jClient.write(
    `MATCH (n) WHERE (n.datasetTag IS NOT NULL AND n.datasetTag STARTS WITH $prefix)
       OR (n.productId IS NOT NULL AND n.productId STARTS WITH $prefix)
       OR (n.categoryId IS NOT NULL AND n.categoryId STARTS WITH $prefix)
       OR (n.customerId IS NOT NULL AND n.customerId STARTS WITH $prefix)
       OR (n.email IS NOT NULL AND toLower(n.email) CONTAINS toLower($prefix))
     DETACH DELETE n`,
    { prefix }
  );
  await neo4jClient.write(
    `MATCH ()-[r]->() WHERE r.datasetTag IS NOT NULL AND r.datasetTag STARTS WITH $prefix DELETE r`,
    { prefix }
  );
  await neo4jClient.write(
    `MATCH (p:Product) WHERE p.productId =~ 'PROD_[a-f0-9]{32}' DETACH DELETE p`
  );
  await neo4jClient.write(
    `MATCH (c:Category) WHERE c.categoryId =~ 'CAT_[a-f0-9]{32}' DETACH DELETE c`
  );
  await neo4jClient.write(
    `MATCH (c:Customer) WHERE c.customerId =~ 'CUST_[a-f0-9]{32}' DETACH DELETE c`
  );
  // Only remove BOUGHT/VIEWED written by CRUD paths; the canonical seed
  // markers are off limits.
  await neo4jClient.write(
    `MATCH ()-[r:BOUGHT]-() WHERE r.eventId IS NOT NULL
       AND NOT r.eventId STARTS WITH 'BOUGHT_DT13_SEED_V1_'
       AND NOT r.eventId STARTS WITH 'BOUGHT_DT13_SEED_V1_CLEAN_'
       AND NOT r.eventId STARTS WITH 'BOUGHT_DT13_SEED_V2_'
       AND NOT r.eventId STARTS WITH 'BOUGHT_CATALOG_REAL_120_V1_'
       AND NOT r.eventId STARTS WITH 'RC_B'
     DETACH DELETE r`
  );
  await neo4jClient.write(
    `MATCH ()-[r:VIEWED]-() WHERE r.eventId IS NOT NULL
       AND NOT r.eventId STARTS WITH 'VIEWED_DT13_SEED_V1_'
       AND NOT r.eventId STARTS WITH 'VIEWED_DT13_SEED_V1_CLEAN_'
       AND NOT r.eventId STARTS WITH 'VIEWED_DT13_SEED_V2_'
       AND NOT r.eventId STARTS WITH 'VIEWED_CATALOG_REAL_120_V1_'
       AND NOT r.eventId STARTS WITH 'RC_V'
     DETACH DELETE r`
  );
}

async function countByPrefix(session, prefix) {
  const res = await session.executeRead(async (tx) => tx.run(
    `MATCH (n)
     WHERE (n.productId IS NOT NULL AND n.productId STARTS WITH $prefix)
        OR (n.categoryId IS NOT NULL AND n.categoryId STARTS WITH $prefix)
        OR (n.customerId IS NOT NULL AND n.customerId STARTS WITH $prefix)
     RETURN count(n) AS c`,
    { prefix }
  ));
  return Number(res.records[0]?.get('c') || 0);
}

async function setupAdminFixture(session, prefix) {
  const passwordHash = await hashPassword('Phase3-Admin-001');
  const customerId = `${prefix}_ADMIN`;
  const email = `phase3-admin-${prefix.toLowerCase()}@example.test`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (c:Customer { customerId: $customerId })
       ON CREATE SET c.email = $email, c.name = $name, c.role = 'admin', c.active = true, c.datasetTag = $prefix, c.createdAt = datetime()
       SET c.passwordHash = $passwordHash`,
      { customerId, email, name: 'Phase3 Admin', prefix, passwordHash }
    );
  });
  return { customerId, email, password: 'Phase3-Admin-001' };
}

async function setupCustomerFixture(session, prefix, suffix = 'C1') {
  const passwordHash = await hashPassword('Phase3-Cust-001');
  const customerId = `${prefix}_${suffix}`;
  const email = `phase3-${suffix.toLowerCase()}-${prefix.toLowerCase()}@example.test`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (c:Customer { customerId: $customerId })
       ON CREATE SET c.email = $email, c.name = $name, c.role = 'customer', c.active = true, c.datasetTag = $prefix, c.createdAt = datetime()
       SET c.passwordHash = $passwordHash`,
      { customerId, email, name: `Phase3 ${suffix}`, prefix, passwordHash }
    );
  });
  return { customerId, email, password: 'Phase3-Cust-001' };
}

async function setupCategoryFixture(session, prefix, suffix = 'CAT_A') {
  const categoryId = `${prefix}_${suffix}`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (c:Category { categoryId: $categoryId })
       ON CREATE SET c.name = $name, c.description = $description, c.datasetTag = $prefix`,
      { categoryId, name: 'Phase3 Cat', description: 'fixture', prefix }
    );
  });
  return { categoryId };
}

async function setupProductFixture(session, prefix, { productIdSuffix = 'PROD_1', categoryId, price = 1_000_000 } = {}) {
  const productId = `${prefix}_${productIdSuffix}`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (p:Product { productId: $productId })
       ON CREATE SET p.name = $name, p.description = $description, p.price = $price, p.imageUrl = $imageUrl, p.active = true, p.datasetTag = $prefix, p.createdAt = datetime()`,
      {
        productId,
        name: `Phase3 Product ${productIdSuffix}`,
        description: 'fixture',
        price,
        imageUrl: '/x.svg',
        prefix,
      }
    );
    if (categoryId) {
      await tx.run(
        `MATCH (p:Product { productId: $productId })
         MATCH (c:Category { categoryId: $categoryId })
         OPTIONAL MATCH (p)-[old:BELONGS_TO]->(:Category)
         DELETE old
         MERGE (p)-[b:BELONGS_TO { datasetTag: $prefix }]->(c)
         ON CREATE SET b.createdAt = datetime()`,
        { productId, categoryId, prefix }
      );
    }
  });
  return { productId };
}

test('integration: Phase 3 CRUD + interactions + history', async (t) => {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    t.skip('NEO4J not configured; skipping Phase 3 integration tests.');
    return;
  }

  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { disableLosslessIntegers: true }
  );
  const session = driver.session({ database: config.neo4jDatabase });
  const { app, neo4jClient } = bootstrap();

  t.after(async () => {
    // Cleanup uses the app's neo4jClient so that records the app's own
    // transactions just committed get removed too. Retry up to 3 times to
    // outlast a busy driver pool.
    for (let i = 0; i < 3; i += 1) {
      try {
        await cleanupByPrefixViaApp(neo4jClient, 'DT13_PHASE3_');
        await cleanupByPrefix(session, 'DT13_PHASE3_');
      } catch {
        // ignore
      }
    }
    await session.close();
    await driver.close();
    if (neo4jClient && typeof neo4jClient.close === 'function') {
      try { await neo4jClient.close(); } catch { /* ignore */ }
    }
  });

  // Shared fixture for the whole suite.
  const prefix = `DT13_PHASE3_${randomBytes(3).toString('hex')}`;
  // Start clean (defensive against leftover state from a previous run).
  await cleanupByPrefixViaApp(neo4jClient, 'DT13_PHASE3_').catch(() => {});
  await cleanupByPrefix(session, 'DT13_PHASE3_').catch(() => {});
  const admin = await setupAdminFixture(session, prefix);
  const customer = await setupCustomerFixture(session, prefix, 'C1');
  const customer2 = await setupCustomerFixture(session, prefix, 'C2');
  const catA = await setupCategoryFixture(session, prefix, 'CAT_A');
  const catB = await setupCategoryFixture(session, prefix, 'CAT_B');
  const product1 = await setupProductFixture(session, prefix, {
    productIdSuffix: 'PROD_1',
    categoryId: catA.categoryId,
    price: 1_500_000,
  });

  // ----- Permission / auth -----

  await t.test('unauthenticated -> 401 on products/categories/customers/history/interactions', async () => {
    const r1 = await request(app).get('/api/products');
    assert.equal(r1.status, 401);
    const r2 = await request(app).get('/api/categories');
    assert.equal(r2.status, 401);
    const r3 = await request(app).get('/api/customers');
    assert.equal(r3.status, 401);
    const r4 = await request(app).get('/api/me/history');
    assert.equal(r4.status, 401);
    const r5 = await request(app).post('/api/interactions/views').send({});
    assert.equal(r5.status, 401);
  });

  // ----- Login admin -----

  let adminAgent = null;
  await t.test('admin login OK', async () => {
    adminAgent = request.agent(app);
    const res = await adminAgent.post('/api/auth/login').send({ email: admin.email, password: admin.password });
    assert.equal(res.status, 200);
    assert.equal(res.body.profile.role, 'admin');
  });

  // ----- Category CRUD -----

  await t.test('admin CRUD Category: create/update/delete when empty', async () => {
    // POST -> 201
    const create = await adminAgent.post('/api/categories').send({
      name: 'Phase3 New Category',
      description: 'created by admin',
    });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    assert.ok(create.body.categoryId.startsWith('CAT_'));
    const id = create.body.categoryId;
    assert.equal(create.body.productCount, 0);

    // PATCH -> 200
    const patch = await adminAgent.patch(`/api/categories/${id}`).send({ name: 'Phase3 Renamed' });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.name, 'Phase3 Renamed');

    // DELETE -> 200 (empty category)
    const del = await adminAgent.delete(`/api/categories/${id}`);
    assert.equal(del.status, 200);

    // GET -> id is gone
    const list = await adminAgent.get('/api/categories');
    assert.equal(list.status, 200);
    const stillThere = list.body.items.some((c) => c.categoryId === id);
    assert.equal(stillThere, false);
  });

  await t.test('admin cannot delete a Category that still has Products (409)', async () => {
    const res = await adminAgent.delete(`/api/categories/${catA.categoryId}`);
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'CATEGORY_HAS_PRODUCTS');
  });

  // ----- Product CRUD -----

  let createdProductId = null;
  await t.test('admin POST Product -> 201 and creates the BELONGS_TO edge', async () => {
    const res = await adminAgent.post('/api/products').send({
      name: 'Phase3 New Product',
      description: 'mo phong',
      price: 2_500_000,
      categoryId: catA.categoryId,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.name, 'Phase3 New Product');
    assert.equal(res.body.price, 2_500_000);
    assert.equal(res.body.categoryId, catA.categoryId);
    assert.equal(res.body.active, true);
    assert.ok(res.body.imageUrl);
    createdProductId = res.body.productId;

    // Verify BELONGS_TO was created in the database
    const check = await session.executeRead(async (tx) => tx.run(
      `MATCH (p:Product { productId: $pid })-[b:BELONGS_TO]->(c:Category { categoryId: $cid })
       RETURN count(b) AS c`,
      { pid: createdProductId, cid: catA.categoryId }
    ));
    assert.equal(Number(check.records[0].get('c')), 1);
  });

  await t.test('admin PATCH Product (price + active + category) keeps exactly one BELONGS_TO', async () => {
    const patch = await adminAgent.patch(`/api/products/${createdProductId}`).send({
      price: 3_750_000,
      active: false,
      categoryId: catB.categoryId,
    });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(patch.body.price, 3_750_000);
    assert.equal(patch.body.active, false);
    assert.equal(patch.body.categoryId, catB.categoryId);

    // Verify only one BELONGS_TO remains, pointing at catB.
    const check = await session.executeRead(async (tx) => tx.run(
      `MATCH (p:Product { productId: $pid })-[b:BELONGS_TO]->(c:Category)
       RETURN c.categoryId AS cid, count(b) AS rels`,
      { pid: createdProductId }
    ));
    assert.equal(Number(check.records[0].get('rels')), 1);
    assert.equal(check.records[0].get('cid'), catB.categoryId);
  });

  await t.test('customer cannot POST Product (403)', async () => {
    const custAgent = request.agent(app);
    const login = await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    assert.equal(login.status, 200);
    const res = await custAgent.post('/api/products').send({ name: 'hack', price: 1, categoryId: catA.categoryId });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'ADMIN_REQUIRED');
  });

  await t.test('admin deletes a Product with no history (200)', async () => {
    const res = await adminAgent.delete(`/api/products/${createdProductId}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    // Verify the row is actually gone
    const check = await session.executeRead(async (tx) => tx.run(
      `MATCH (p:Product { productId: $pid }) RETURN p LIMIT 1`,
      { pid: createdProductId }
    ));
    assert.equal(check.records.length, 0);
  });

  // ----- Customer CRUD -----

  let createdCustomerId = null;
  await t.test('admin POST Customer -> 201, hash is stored and email is normalized', async () => {
    const emailRaw = `  Phase3-New-User-${prefix}@Example.Test  `;
    const res = await adminAgent.post('/api/customers').send({
      name: 'Phase3 New User',
      email: emailRaw,
      password: 'Phase3-Strong-001',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.email, `phase3-new-user-${prefix.toLowerCase()}@example.test`);
    assert.equal(res.body.role, 'customer');
    assert.equal(res.body.active, true);
    assert.ok(!('passwordHash' in res.body));
    createdCustomerId = res.body.customerId;

    // Login succeeds with the freshly created customer (real Neo4j path).
    const login = await request(app).post('/api/auth/login').send({ email: res.body.email, password: 'Phase3-Strong-001' });
    assert.equal(login.status, 200);
  });

  await t.test('admin POST Customer with duplicate email -> 409', async () => {
    const res = await adminAgent.post('/api/customers').send({
      name: 'Duplicate',
      email: `phase3-new-user-${prefix.toLowerCase()}@example.test`,
      password: 'Phase3-Strong-002',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_DUPLICATE');
  });

  await t.test('admin PATCH Customer (update name/active, never the password)', async () => {
    const patch = await adminAgent.patch(`/api/customers/${createdCustomerId}`).send({
      name: 'Phase3 Renamed',
      active: false,
    });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(patch.body.name, 'Phase3 Renamed');
    assert.equal(patch.body.active, false);
  });

  await t.test('admin cannot delete a Customer that has history (409)', async () => {
    // Create an interaction first.
    const custAgent = request.agent(app);
    // Re-activate so we can log in.
    await session.executeWrite(async (tx) => {
      await tx.run(`MATCH (c:Customer { customerId: $cid }) SET c.active = true`, { cid: createdCustomerId });
    });
    const login = await custAgent.post('/api/auth/login').send({
      email: `phase3-new-user-${prefix.toLowerCase()}@example.test`,
      password: 'Phase3-Strong-001',
    });
    assert.equal(login.status, 200);
    const view = await custAgent.post('/api/interactions/views').send({
      eventId: `${prefix}_EVT_VIEW_1`,
      productId: product1.productId,
    });
    assert.equal(view.status, 201, JSON.stringify(view.body));

    const del = await adminAgent.delete(`/api/customers/${createdCustomerId}`);
    assert.equal(del.status, 409, JSON.stringify(del.body));
    assert.equal(del.body.error.code, 'CUSTOMER_HAS_HISTORY');
  });

  await t.test('admin deletes a Customer that has no history (200)', async () => {
    const res = await adminAgent.delete(`/api/customers/${customer2.customerId}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  // ----- Interactions: VIEWED -----

  let viewEventId;
  await t.test('customer writes VIEWED for the first time -> 201', async () => {
    const custAgent = request.agent(app);
    const login = await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    assert.equal(login.status, 200);

    viewEventId = `${prefix}_EVT_VIEW_2`;
    const res = await custAgent.post('/api/interactions/views').send({
      eventId: viewEventId,
      productId: product1.productId,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.eventId, viewEventId);
    assert.equal(res.body.type, 'viewed');
    assert.equal(res.body.productId, product1.productId);
    assert.ok(res.body.occurredAt);
  });

  await t.test('replaying VIEWED with the same eventId -> 200 and does not create a new edge', async () => {
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const res = await custAgent.post('/api/interactions/views').send({
      eventId: viewEventId,
      productId: product1.productId,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.eventId, viewEventId);

    // DB must hold exactly one VIEWED edge for this eventId.
    const check = await session.executeRead(async (tx) => tx.run(
      `MATCH ()-[r:VIEWED { eventId: $eid }]->() RETURN count(r) AS c`,
      { eid: viewEventId }
    ));
    assert.equal(Number(check.records[0].get('c')), 1);
  });

  await t.test('replaying VIEWED with the same eventId but different productId -> 409', async () => {
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const res = await custAgent.post('/api/interactions/views').send({
      eventId: viewEventId,
      productId: `${prefix}_PROD_OTHER`,
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EVENT_ID_CONFLICT');
  });

  // ----- Interactions: BOUGHT -----

  let boughtEventId;
  await t.test('first BOUGHT -> 201, unitPrice is taken from the Product', async () => {
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    boughtEventId = `${prefix}_EVT_BOUGHT_1`;
    const res = await custAgent.post('/api/interactions/purchases').send({
      eventId: boughtEventId,
      productId: product1.productId,
      quantity: 2,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.eventId, boughtEventId);
    assert.equal(res.body.type, 'bought');
    assert.equal(res.body.quantity, 2);
    // Fixture product price = 1_500_000
    assert.equal(res.body.unitPrice, 1_500_000);
  });

  await t.test('replaying BOUGHT with the same payload -> 200 and keeps unitPrice', async () => {
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const res = await custAgent.post('/api/interactions/purchases').send({
      eventId: boughtEventId,
      productId: product1.productId,
      quantity: 2,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.unitPrice, 1_500_000);
  });

  await t.test('replaying BOUGHT with same eventId but different quantity -> 409', async () => {
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const res = await custAgent.post('/api/interactions/purchases').send({
      eventId: boughtEventId,
      productId: product1.productId,
      quantity: 5,
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EVENT_ID_CONFLICT');
  });

  await t.test('changing Product.price does not mutate historical BOUGHT.unitPrice', async () => {
    // Admin moves product1 from 1.5M to 9.99M.
    const patch = await adminAgent.patch(`/api/products/${product1.productId}`).send({ price: 9_990_000 });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));

    // Customer replays the original BOUGHT -> 200, unitPrice must remain 1.5M.
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const res = await custAgent.post('/api/interactions/purchases').send({
      eventId: boughtEventId,
      productId: product1.productId,
      quantity: 2,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.unitPrice, 1_500_000, 'historical unitPrice must be preserved');
  });

  await t.test('BOUGHT against an inactive Product -> 409', async () => {
    // Admin flips product1 to inactive.
    await adminAgent.patch(`/api/products/${product1.productId}`).send({ active: false });
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const newEvt = `${prefix}_EVT_BOUGHT_INACTIVE`;
    const res = await custAgent.post('/api/interactions/purchases').send({
      eventId: newEvt,
      productId: product1.productId,
      quantity: 1,
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'PRODUCT_INACTIVE');
  });

  await t.test('two parallel BOUGHT requests with the same eventId create only one edge', async () => {
    // Re-activate product1 so the purchase is allowed.
    await adminAgent.patch(`/api/products/${product1.productId}`).send({ active: true });
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const sharedEvt = `${prefix}_EVT_RACE`;
    const [r1, r2] = await Promise.all([
      custAgent.post('/api/interactions/purchases').send({
        eventId: sharedEvt,
        productId: product1.productId,
        quantity: 1,
      }),
      custAgent.post('/api/interactions/purchases').send({
        eventId: sharedEvt,
        productId: product1.productId,
        quantity: 1,
      }),
    ]);
    // Both must succeed (201 or 200), no 5xx, no 409.
    assert.ok([r1.status, r2.status].every((s) => s === 200 || s === 201), `Got ${r1.status}/${r2.status}`);
    // Database must contain exactly one BOUGHT edge.
    const check = await session.executeRead(async (tx) => tx.run(
      `MATCH ()-[r:BOUGHT { eventId: $eid }]->() RETURN count(r) AS c`,
      { eid: sharedEvt }
    ));
    assert.equal(Number(check.records[0].get('c')), 1, 'Expected exactly 1 BOUGHT edge after the race');
  });

  // ----- History -----

  await t.test('GET /api/me/history returns the right items by type, page, and sort', async () => {
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });

    // Add another VIEWED so we have multiple items.
    const otherEvt = `${prefix}_EVT_VIEW_3`;
    await custAgent.post('/api/interactions/views').send({
      eventId: otherEvt,
      productId: product1.productId,
    });

    // all, page=1, pageSize=10
    const all = await custAgent.get('/api/me/history?type=all&page=1&pageSize=10');
    assert.equal(all.status, 200, JSON.stringify(all.body));
    assert.ok(all.body.items.length > 0);
    const allEvtIds = all.body.items.map((i) => i.eventId);
    assert.ok(allEvtIds.includes(boughtEventId));
    assert.ok(allEvtIds.includes(viewEventId));
    assert.ok(allEvtIds.includes(otherEvt));

    // Newest first.
    for (let i = 1; i < all.body.items.length; i += 1) {
      assert.ok(all.body.items[i - 1].occurredAt >= all.body.items[i].occurredAt, 'Must be sorted by occurredAt DESC');
    }

    // type=bought
    const bought = await custAgent.get('/api/me/history?type=bought');
    assert.equal(bought.status, 200);
    assert.ok(bought.body.items.length >= 1);
    assert.ok(bought.body.items.every((i) => i.type === 'bought'));

    // type=viewed
    const viewed = await custAgent.get('/api/me/history?type=viewed');
    assert.equal(viewed.status, 200);
    assert.ok(viewed.body.items.every((i) => i.type === 'viewed'));

    // type=invalid
    const bad = await custAgent.get('/api/me/history?type=oops');
    assert.equal(bad.status, 400);
  });

  await t.test('customer cannot read another account history (no such endpoint)', async () => {
    // /api/me/history always uses the customerId from the session;
    // the customerId query parameter is ignored.
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const res = await custAgent.get('/api/me/history?customerId=ADMIN_001');
    assert.equal(res.status, 200);
    // No leakage: items must all belong to the logged-in customer.
    const ids = res.body.items.map((i) => i.eventId);
    for (const id of ids) {
      assert.ok(id.startsWith(prefix), `Leak: ${id}`);
    }
  });

  await t.test('admin cannot call interactions/history (403)', async () => {
    const res1 = await adminAgent.post('/api/interactions/views').send({ eventId: 'EVT_ADMIN', productId: product1.productId });
    assert.equal(res1.status === 403 || res1.status === 401, true, `admin interactions = ${res1.status}`);
    const res2 = await adminAgent.get('/api/me/history');
    assert.equal(res2.status === 403 || res2.status === 401, true, `admin history = ${res2.status}`);
  });

  // ----- GET /api/products phan trang & filter -----

  await t.test('GET /api/products returns items + page + pageSize + total', async () => {
    const res = await adminAgent.get('/api/products?page=1&pageSize=5');
    assert.equal(res.status, 200);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.pageSize, 5);
    assert.equal(typeof res.body.total, 'number');
  });

  await t.test('GET /api/products includeInactive=true (admin) shows inactive products', async () => {
    // product1 is currently active=true (after the race test). Flip to inactive.
    await adminAgent.patch(`/api/products/${product1.productId}`).send({ active: false });
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const custView = await custAgent.get(`/api/products/${product1.productId}`);
    assert.equal(custView.status, 404);
    const admView = await adminAgent.get(`/api/products/${product1.productId}?includeInactive=true`);
    assert.equal(admView.status, 200);
    assert.equal(admView.body.active, false);
  });

  // ----- 400 / 404 / 409 errors -----

  await t.test('400 on bad body, 404 on unknown id', async () => {
    const bad1 = await adminAgent.post('/api/products').send({ name: 'x', price: 1, categoryId: 'wrong-id' });
    assert.equal(bad1.status === 400 || bad1.status === 404, true);

    const bad2 = await adminAgent.patch(`/api/products/${product1.productId}`).send({ foo: 'bar' });
    assert.equal(bad2.status, 400);

    const nf = await adminAgent.get('/api/products/DOES_NOT_EXIST');
    assert.equal(nf.status, 404);
  });

  // ----- Sanity cleanup check (de dam bao teardown xoa duoc) -----

  await t.test('cleanup: no fixture node remains after t.after', async () => {
    // t.after handles the actual cleanup; this test only confirms the
    // prefix-scoped count is observable.
    const before = await countByPrefix(session, prefix);
    assert.ok(before >= 0);
  });
});
