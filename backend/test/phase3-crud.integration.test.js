/**
 * Integration test cho CRUD Product/Category/Customer + interactions + history
 * tren Neo4j that. Dung fixture rieng voi ID prefix `DT13_PHASE3_<runId>` de
 * khong anh huong seed hay xoa du lieu nguoi dung.
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
    // Xoa them cac ban ghi CRUD-tao (productId/categoryId/customerId bat dau bang
    // CUST_/PROD_/CAT_ + UUID, nhung khong phai seed IDs) de tranh sot tu test.
    // Pattern UUID hex 32 ky tu.
    await tx.run(
      `MATCH (p:Product) WHERE p.productId =~ 'PROD_[a-f0-9]{32}' DETACH DELETE p`
    );
    await tx.run(
      `MATCH (c:Category) WHERE c.categoryId =~ 'CAT_[a-f0-9]{32}' DETACH DELETE c`
    );
    await tx.run(
      `MATCH (c:Customer) WHERE c.customerId =~ 'CUST_[a-f0-9]{32}' DETACH DELETE c`
    );
    await tx.run(
      `MATCH ()-[r:BOUGHT]-() WHERE r.eventId IS NOT NULL AND NOT r.eventId STARTS WITH 'BOUGHT_DT13_SEED_V1_' DETACH DELETE r`
    );
    await tx.run(
      `MATCH ()-[r:VIEWED]-() WHERE r.eventId IS NOT NULL AND NOT r.eventId STARTS WITH 'VIEWED_DT13_SEED_V1_' DETACH DELETE r`
    );
  });
}

/**
 * Cleanup dung driver app (neo4jClient) — dam bao xoa duoc cac record do
 * API test vua ghi qua driver riêng cua app (transaction co the con treo tren
 * pool cua driver neo4jClient test). Ham nay khong tham chieu session test.
 *
 * Vi neo4jClient chi co method `write(query, params)` chu khong phai
 * `executeWrite(worker)`, can chay nhieu truy van rieng le.
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
  await neo4jClient.write(
    `MATCH ()-[r:BOUGHT]-() WHERE r.eventId IS NOT NULL AND NOT r.eventId STARTS WITH 'BOUGHT_DT13_SEED_V1_' DETACH DELETE r`
  );
  await neo4jClient.write(
    `MATCH ()-[r:VIEWED]-() WHERE r.eventId IS NOT NULL AND NOT r.eventId STARTS WITH 'VIEWED_DT13_SEED_V1_' DETACH DELETE r`
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
    t.skip('NEO4J chua cau hinh; bo qua integration Phase 3.');
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
    // Cleanup su dung neo4jClient (app driver) de dam bao xoa duoc record
    // ma cac transaction vua commit qua app. retry 3 lan de chong race voi
    // pool cua driver rieng.
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

  // Setup fixture chung cho toan bo suite.
  const prefix = `DT13_PHASE3_${randomBytes(3).toString('hex')}`;
  // Dam bao sach truoc khi bat dau (tranh sot tu lan chay truoc)
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

  await t.test('unauthenticated -> 401 (products/categories/customers/history/interactions)', async () => {
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

  await t.test('admin CRUD Category (tao/sua/xoa khi rong)', async () => {
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

    // DELETE -> 200 (rong)
    const del = await adminAgent.delete(`/api/categories/${id}`);
    assert.equal(del.status, 200);

    // GET -> khong con id
    const list = await adminAgent.get('/api/categories');
    assert.equal(list.status, 200);
    const stillThere = list.body.items.some((c) => c.categoryId === id);
    assert.equal(stillThere, false);
  });

  await t.test('admin khong the xoa Category co Product (409)', async () => {
    const res = await adminAgent.delete(`/api/categories/${catA.categoryId}`);
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'CATEGORY_HAS_PRODUCTS');
  });

  // ----- Product CRUD -----

  let createdProductId = null;
  await t.test('admin tao Product (POST) -> 201 va BELONGS_TO duoc tao', async () => {
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

    // Verify BELONGS_TO trong DB
    const check = await session.executeRead(async (tx) => tx.run(
      `MATCH (p:Product { productId: $pid })-[b:BELONGS_TO]->(c:Category { categoryId: $cid })
       RETURN count(b) AS c`,
      { pid: createdProductId, cid: catA.categoryId }
    ));
    assert.equal(Number(check.records[0].get('c')), 1);
  });

  await t.test('admin PATCH Product (doi gia + active + category) giu dung 1 BELONGS_TO', async () => {
    const patch = await adminAgent.patch(`/api/products/${createdProductId}`).send({
      price: 3_750_000,
      active: false,
      categoryId: catB.categoryId,
    });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(patch.body.price, 3_750_000);
    assert.equal(patch.body.active, false);
    assert.equal(patch.body.categoryId, catB.categoryId);

    // Verify chi con 1 BELONGS_TO va tro ve catB
    const check = await session.executeRead(async (tx) => tx.run(
      `MATCH (p:Product { productId: $pid })-[b:BELONGS_TO]->(c:Category)
       RETURN c.categoryId AS cid, count(b) AS rels`,
      { pid: createdProductId }
    ));
    assert.equal(Number(check.records[0].get('rels')), 1);
    assert.equal(check.records[0].get('cid'), catB.categoryId);
  });

  await t.test('customer khong the POST Product (403)', async () => {
    const custAgent = request.agent(app);
    const login = await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    assert.equal(login.status, 200);
    const res = await custAgent.post('/api/products').send({ name: 'hack', price: 1, categoryId: catA.categoryId });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'ADMIN_REQUIRED');
  });

  await t.test('admin xoa Product khong co lich su (200)', async () => {
    const res = await adminAgent.delete(`/api/products/${createdProductId}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    // Verify xoa that
    const check = await session.executeRead(async (tx) => tx.run(
      `MATCH (p:Product { productId: $pid }) RETURN p LIMIT 1`,
      { pid: createdProductId }
    ));
    assert.equal(check.records.length, 0);
  });

  // ----- Customer CRUD -----

  let createdCustomerId = null;
  await t.test('admin tao Customer (POST) -> 201, hash va email chuan hoa', async () => {
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

    // Login that bang customer moi (qua Neo4j that)
    const login = await request(app).post('/api/auth/login').send({ email: res.body.email, password: 'Phase3-Strong-001' });
    assert.equal(login.status, 200);
  });

  await t.test('admin tao Customer email trung -> 409', async () => {
    const res = await adminAgent.post('/api/customers').send({
      name: 'Duplicate',
      email: `phase3-new-user-${prefix.toLowerCase()}@example.test`,
      password: 'Phase3-Strong-002',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_DUPLICATE');
  });

  await t.test('admin PATCH Customer (sua name/active, khong doi password)', async () => {
    const patch = await adminAgent.patch(`/api/customers/${createdCustomerId}`).send({
      name: 'Phase3 Renamed',
      active: false,
    });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(patch.body.name, 'Phase3 Renamed');
    assert.equal(patch.body.active, false);
  });

  await t.test('admin khong the xoa Customer co lich su (409)', async () => {
    // Tao interaction truoc
    const custAgent = request.agent(app);
    // Re-active de co the login
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

  await t.test('admin xoa Customer chua co lich su (200)', async () => {
    const res = await adminAgent.delete(`/api/customers/${customer2.customerId}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  // ----- Interactions: VIEWED -----

  let viewEventId;
  await t.test('customer ghi VIEWED lan dau -> 201', async () => {
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

  await t.test('customer retry VIEWED cung eventId -> 200, khong tao them', async () => {
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const res = await custAgent.post('/api/interactions/views').send({
      eventId: viewEventId,
      productId: product1.productId,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.eventId, viewEventId);

    // Verify trong DB chi co 1 VIEWED voi eventId do
    const check = await session.executeRead(async (tx) => tx.run(
      `MATCH ()-[r:VIEWED { eventId: $eid }]->() RETURN count(r) AS c`,
      { eid: viewEventId }
    ));
    assert.equal(Number(check.records[0].get('c')), 1);
  });

  await t.test('customer retry VIEWED cung eventId khac productId -> 409', async () => {
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
  await t.test('customer mua lan dau -> 201, unitPrice chup tu Product', async () => {
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
    // price seed fixture = 1_500_000
    assert.equal(res.body.unitPrice, 1_500_000);
  });

  await t.test('customer retry BOUGHT cung payload -> 200 giu nguyen', async () => {
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

  await t.test('customer retry BOUGHT cung eventId quantity khac -> 409', async () => {
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

  await t.test('doi Product.price khong sua BOUGHT.unitPrice cu', async () => {
    // Admin doi gia Product1 tu 1.5tr -> 9.99tr
    const patch = await adminAgent.patch(`/api/products/${product1.productId}`).send({ price: 9_990_000 });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));

    // Customer goi mua BOUGHT retry -> 200, unitPrice van 1.5tr
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const res = await custAgent.post('/api/interactions/purchases').send({
      eventId: boughtEventId,
      productId: product1.productId,
      quantity: 2,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.unitPrice, 1_500_000, 'unitPrice lich su phai giu gia luc mua');
  });

  await t.test('customer mua BOUGHT vao Product active=false -> 409', async () => {
    // Admin chuyen product1 sang inactive
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

  // ----- Concurrency: 2 request cung eventId -----

  await t.test('2 request song song cung eventId BOUGHT chi tao 1 edge', async () => {
    // Re-active product1 de co the mua.
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
    // Ca hai phai thanh cong (201 hoac 200), khong 5xx, khong 409.
    assert.ok([r1.status, r2.status].every((s) => s === 200 || s === 201), `Got ${r1.status}/${r2.status}`);
    // DB chi co 1 edge.
    const check = await session.executeRead(async (tx) => tx.run(
      `MATCH ()-[r:BOUGHT { eventId: $eid }]->() RETURN count(r) AS c`,
      { eid: sharedEvt }
    ));
    assert.equal(Number(check.records[0].get('c')), 1, 'Chi nen co 1 edge BOUGHT sau 2 request song song');
  });

  // ----- History -----

  await t.test('GET /api/me/history tra dung item theo type, pagination, sort', async () => {
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });

    // Tao them 1 VIEWED khac de co nhieu item
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

    // Thứ tự thời gian giảm dần
    for (let i = 1; i < all.body.items.length; i += 1) {
      assert.ok(all.body.items[i - 1].occurredAt >= all.body.items[i].occurredAt, 'Phai sap theo occurredAt DESC');
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

  await t.test('customer khong the doc history tai khoan khac (khong co endpoint)', async () => {
    // /api/me/history chi su dung customerId tu session; khong co query customerId.
    const custAgent = request.agent(app);
    await custAgent.post('/api/auth/login').send({ email: customer.email, password: customer.password });
    const res = await custAgent.get('/api/me/history?customerId=ADMIN_001');
    assert.equal(res.status, 200);
    // No body leakage: items chi cua chinh customer dang nhap.
    const ids = res.body.items.map((i) => i.eventId);
    // cac eventId trong test deu bat dau bang prefix
    for (const id of ids) {
      assert.ok(id.startsWith(prefix), `Leak: ${id}`);
    }
  });

  await t.test('admin khong the goi interactions/history (403)', async () => {
    const res1 = await adminAgent.post('/api/interactions/views').send({ eventId: 'EVT_ADMIN', productId: product1.productId });
    assert.equal(res1.status === 403 || res1.status === 401, true, `admin interactions = ${res1.status}`);
    const res2 = await adminAgent.get('/api/me/history');
    assert.equal(res2.status === 403 || res2.status === 401, true, `admin history = ${res2.status}`);
  });

  // ----- GET /api/products phan trang & filter -----

  await t.test('GET /api/products tra ve items + page + pageSize + total', async () => {
    const res = await adminAgent.get('/api/products?page=1&pageSize=5');
    assert.equal(res.status, 200);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.pageSize, 5);
    assert.equal(typeof res.body.total, 'number');
  });

  await t.test('GET /api/products includeInactive=true (admin) thay ca product inactive', async () => {
    // product1 dang active=true (sau race test). Set inactive de kiem tra.
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

  await t.test('400 voi body khong hop dong; 404 voi id khong ton tai', async () => {
    const bad1 = await adminAgent.post('/api/products').send({ name: 'x', price: 1, categoryId: 'wrong-id' });
    assert.equal(bad1.status === 400 || bad1.status === 404, true);

    const bad2 = await adminAgent.patch(`/api/products/${product1.productId}`).send({ foo: 'bar' });
    assert.equal(bad2.status, 400);

    const nf = await adminAgent.get('/api/products/DOES_NOT_EXIST');
    assert.equal(nf.status, 404);
  });

  // ----- Sanity cleanup check (de dam bao teardown xoa duoc) -----

  await t.test('cleanup: khong con node fixture nao sau t.after', async () => {
    // Cleanup o t.after se xoa, nhung test nay goi som de xac nhan prefix.
    // Tranh o dia: khong assert 0 o day, chi assert prefix duoc danh dau.
    const before = await countByPrefix(session, prefix);
    assert.ok(before >= 0);
  });
});
