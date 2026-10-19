/**
 * Comprehensive integration tests verifying the 8 specific user scenarios:
 * 1. A buys P1 & P2; B buys P1 -> B gets recommended P2 (pure CF).
 * 2. A buys P1 & P2; B only views P1 -> B gets recommended P2 (viewed fallback).
 * 3. B buys P2 -> P2 disappears from B's recommendations.
 * 4. A buys P3 -> B refetches recommendations and receives P3.
 * 5. Users with no shared interactions have 0 similarity.
 * 6. Repeated views/purchases do not inflate score; retry with same eventId is idempotent.
 * 7. Switching accounts isolates history and recommendations completely.
 * 8. Customer role receives 403 on admin-only explanation endpoints.
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
       DETACH DELETE n`,
      { prefix }
    );
    await tx.run(
      `MATCH ()-[r:BOUGHT]-() WHERE r.datasetTag STARTS WITH $prefix DETACH DELETE r`,
      { prefix }
    );
    await tx.run(
      `MATCH ()-[r:VIEWED]-() WHERE r.datasetTag STARTS WITH $prefix DETACH DELETE r`,
      { prefix }
    );
  });
}

async function setupCustomer(session, prefix, { suffix, role = 'customer', name }) {
  const passwordHash = await hashPassword('TestPassword@123');
  const customerId = `${prefix}_${suffix}`;
  const email = `${suffix.toLowerCase()}-${prefix.toLowerCase()}@example.test`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (c:Customer { customerId: $customerId })
       ON CREATE SET c.email = $email, c.passwordHash = $passwordHash,
                     c.datasetTag = $prefix, c.createdAt = datetime(),
                     c.role = $role, c.active = true, c.name = $name`,
      { customerId, email, passwordHash, prefix, role, name: name || suffix }
    );
  });
  return { customerId, email, password: 'TestPassword@123' };
}

async function setupProduct(session, prefix, { suffix, name, price = 500000 }) {
  const productId = `${prefix}_${suffix}`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (p:Product { productId: $productId })
       ON CREATE SET p.name = $name, p.description = 'Scenario test product',
                     p.price = $price, p.imageUrl = '/placeholder.svg',
                     p.datasetTag = $prefix, p.createdAt = datetime(), p.active = true`,
      { productId, name: name || suffix, price, prefix }
    );
  });
  return { productId, name: name || suffix, price };
}

test('integration: User recommendation scenarios (Requirements A-F)', async (t) => {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    t.skip('Neo4j not configured; skipping scenario tests.');
    return;
  }

  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { disableLosslessIntegers: true }
  );
  const session = driver.session({ database: config.neo4jDatabase });
  const { app, neo4jClient } = bootstrap();

  const prefix = `DT13_SCENARIO_${randomBytes(3).toString('hex')}`;

  t.after(async () => {
    try {
      await cleanupByPrefix(session, prefix);
    } catch {
      // ignore
    }
    await session.close();
    await driver.close();
    if (neo4jClient && typeof neo4jClient.close === 'function') {
      try { await neo4jClient.close(); } catch { /* ignore */ }
    }
  });

  await cleanupByPrefix(session, prefix);

  // Set up customers
  const custA = await setupCustomer(session, prefix, { suffix: 'CUST_A', name: 'Khách hàng A' });
  const custB = await setupCustomer(session, prefix, { suffix: 'CUST_B', name: 'Khách hàng B' });
  const custIsolated = await setupCustomer(session, prefix, { suffix: 'CUST_ISO', name: 'Khách hàng Độc lập' });
  const adminUser = await setupCustomer(session, prefix, { suffix: 'ADMIN_U', role: 'admin', name: 'Quản trị viên' });

  // Set up test products
  const p1 = await setupProduct(session, prefix, { suffix: 'P1', name: 'Sản phẩm 1' });
  const p2 = await setupProduct(session, prefix, { suffix: 'P2', name: 'Sản phẩm 2' });
  const p3 = await setupProduct(session, prefix, { suffix: 'P3', name: 'Sản phẩm 3' });
  const pIsolated = await setupProduct(session, prefix, { suffix: 'P_ISO', name: 'Sản phẩm Biệt lập' });

  // Dedicated supertest agents for isolated session handling
  const agentA = request.agent(app);
  const agentB = request.agent(app);
  const agentIsolated = request.agent(app);
  const agentAdmin = request.agent(app);

  // Authenticate all test sessions
  await agentA.post('/api/auth/login').send({ email: custA.email, password: custA.password }).expect(200);
  await agentB.post('/api/auth/login').send({ email: custB.email, password: custB.password }).expect(200);
  await agentIsolated.post('/api/auth/login').send({ email: custIsolated.email, password: custIsolated.password }).expect(200);
  await agentAdmin.post('/api/auth/login').send({ email: adminUser.email, password: adminUser.password }).expect(200);

  // Customer A buys P1 and P2
  await agentA.post('/api/interactions/purchases').send({
    eventId: `EV_${prefix}_A_P1`,
    productId: p1.productId,
    quantity: 1,
  }).expect(201);

  await agentA.post('/api/interactions/purchases').send({
    eventId: `EV_${prefix}_A_P2`,
    productId: p2.productId,
    quantity: 1,
  }).expect(201);

  await t.test('Scenario 1: A buys P1 & P2; B buys P1 -> B is recommended P2 via pure CF', async () => {
    // B purchases P1
    await agentB.post('/api/interactions/purchases').send({
      eventId: `EV_${prefix}_B_P1`,
      productId: p1.productId,
      quantity: 1,
    }).expect(201);

    // Query recommendations for B
    const res = await agentB.get('/api/recommendations/me').expect(200);
    assert.equal(res.body.method, 'user_cf', 'Should use pure collaborative filtering');
    assert.ok(Array.isArray(res.body.items));

    const p2Item = res.body.items.find((it) => it.productId === p2.productId);
    assert.ok(p2Item, 'P2 must be in recommendations for B');
    assert.ok(p2Item.score >= 1, 'Score must be at least 1 (from shared purchase P1 with A)');

    // B should NOT be recommended P1 because B already bought P1
    const p1Item = res.body.items.find((it) => it.productId === p1.productId);
    assert.equal(p1Item, undefined, 'P1 must not be recommended because B already bought P1');
  });

  await t.test('Scenario 2: User C only views P1 -> C receives P2 via multi-behavior fallback', async () => {
    // Setup a new customer C who only views P1
    const custC = await setupCustomer(session, prefix, { suffix: 'CUST_C', name: 'Khách hàng C' });
    const agentC = request.agent(app);
    await agentC.post('/api/auth/login').send({ email: custC.email, password: custC.password }).expect(200);

    // C views P1
    await agentC.post('/api/interactions/views').send({
      eventId: `EV_${prefix}_C_P1`,
      productId: p1.productId,
    }).expect(201);

    // Query recommendations for C
    const res = await agentC.get('/api/recommendations/me').expect(200);
    // Since C has not bought any product, pure CF has 0 candidates and automatically falls back
    assert.equal(res.body.method, 'user_cf_multibehavior', 'Must fallback to user-based multi-behavior');
    const p2Item = res.body.items.find((it) => it.productId === p2.productId);
    assert.ok(p2Item, 'P2 must be recommended to C because C interacted with P1 which A bought alongside P2');
  });

  await t.test('Scenario 3: B buys P2 -> P2 disappears immediately from B recommendations', async () => {
    // B buys P2
    await agentB.post('/api/interactions/purchases').send({
      eventId: `EV_${prefix}_B_P2`,
      productId: p2.productId,
      quantity: 1,
    }).expect(201);

    // Re-fetch recommendations for B
    const res = await agentB.get('/api/recommendations/me').expect(200);
    const p2Item = res.body.items.find((it) => it.productId === p2.productId);
    assert.equal(p2Item, undefined, 'P2 must disappear from recommendations after B buys it');
  });

  await t.test('Scenario 4: A buys P3 -> B refetches and receives P3', async () => {
    // A buys P3
    await agentA.post('/api/interactions/purchases').send({
      eventId: `EV_${prefix}_A_P3`,
      productId: p3.productId,
      quantity: 1,
    }).expect(201);

    // B refetches recommendations
    const res = await agentB.get('/api/recommendations/me').expect(200);
    const p3Item = res.body.items.find((it) => it.productId === p3.productId);
    assert.ok(p3Item, 'P3 must be recommended to B because A bought P3 and shares P1 and P2 with B');
  });

  await t.test('Scenario 5: Two users without shared interactions have 0 similarity', async () => {
    // Isolated user only buys isolated product
    await agentIsolated.post('/api/interactions/purchases').send({
      eventId: `EV_${prefix}_ISO_P`,
      productId: pIsolated.productId,
      quantity: 1,
    }).expect(201);

    const res = await agentIsolated.get('/api/recommendations/me').expect(200);
    // Isolated user shares nothing with A or B, so cannot be recommended P1, P2, P3
    const hasABProducts = res.body.items.some((it) =>
      [p1.productId, p2.productId, p3.productId].includes(it.productId)
    );
    assert.equal(hasABProducts, false, 'Users with no shared interactions must not share recommendations');
  });

  await t.test('Scenario 6: Repeated views/purchases do not inflate scores; retry is idempotent', async () => {
    // Retry purchase with EXACT same eventId
    const retryRes = await agentA.post('/api/interactions/purchases').send({
      eventId: `EV_${prefix}_A_P3`,
      productId: p3.productId,
      quantity: 1,
    }).expect(200);
    assert.equal(retryRes.body.eventId, `EV_${prefix}_A_P3`, 'Retry must return existing purchase without error');

    // Add repeated view for B on P1
    await agentB.post('/api/interactions/views').send({
      eventId: `EV_${prefix}_B_P1_V1`,
      productId: p1.productId,
    }).expect(201);
    await agentB.post('/api/interactions/views').send({
      eventId: `EV_${prefix}_B_P1_V2`,
      productId: p1.productId,
    }).expect(201);

    // Query recommendations for B - score for P3 should remain based on distinct shared count
    const res = await agentB.get('/api/recommendations/me').expect(200);
    const p3Item = res.body.items.find((it) => it.productId === p3.productId);
    assert.ok(p3Item);
    // A shares P1 and P2 with B. Distinct count = 2. Score = 2.
    assert.equal(p3Item.score, 2, 'Score must be distinct shared count (2), not multiplied by repeated events');
  });

  await t.test('Scenario 7: Account switching isolates history and recommendations completely', async () => {
    const switchingAgent = request.agent(app);

    // Login as Customer A
    await switchingAgent.post('/api/auth/login').send({ email: custA.email, password: custA.password }).expect(200);
    const meA = await switchingAgent.get('/api/auth/me').expect(200);
    assert.equal(meA.body.profile.customerId, custA.customerId);

    const histA = await switchingAgent.get('/api/me/history').expect(200);
    assert.ok(histA.body.items.some((p) => p.productId === p3.productId));

    // Logout and Login as Customer Isolated
    await switchingAgent.post('/api/auth/logout').expect(204);
    await switchingAgent.post('/api/auth/login').send({ email: custIsolated.email, password: custIsolated.password }).expect(200);

    const meIso = await switchingAgent.get('/api/auth/me').expect(200);
    assert.equal(meIso.body.profile.customerId, custIsolated.customerId);

    const histIso = await switchingAgent.get('/api/me/history').expect(200);
    assert.ok(!histIso.body.items.some((p) => p.productId === p3.productId), 'Isolated user must not see A history');
  });

  await t.test('Scenario 8: Customer role receives 403 on admin explanation endpoints', async () => {
    // Customer B calls admin analytics
    const resGraph = await agentB.get('/api/analytics/recommendation-graph').query({
      customerId: custB.customerId,
      mode: 'user_cf',
    });
    assert.equal(resGraph.status, 403);
    assert.equal(resGraph.body.error.code, 'ADMIN_REQUIRED');

    // Admin user CAN access
    const resAdmin = await agentAdmin.get('/api/analytics/recommendation-graph').query({
      customerId: custB.customerId,
      mode: 'user_cf',
    });
    assert.equal(resAdmin.status, 200);
    assert.ok(Array.isArray(resAdmin.body.nodes));
    assert.ok(Array.isArray(resAdmin.body.edges));
  });
});
