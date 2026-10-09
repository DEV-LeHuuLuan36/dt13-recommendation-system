/**
 * Integration tests for the admin recommendation-graph endpoint.
 * Runs against a real Neo4j with a per-run fixture prefix so seed data is untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import neo4j from 'neo4j-driver';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { bootstrap } from '../src/app.js';
import { hashPassword } from '../src/password.js';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

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
      `MATCH (p:Product) WHERE p.productId =~ 'PROD_[a-f0-9]{32}' DETACH DELETE p`
    );
    await tx.run(
      `MATCH (c:Category) WHERE c.categoryId =~ 'CAT_[a-f0-9]{32}' DETACH DELETE c`
    );
    await tx.run(
      `MATCH (c:Customer) WHERE c.customerId =~ 'CUST_[a-f0-9]{32}' DETACH DELETE c`
    );
    // Only delete BOUGHT/VIEWED created by this fixture; real-dataset rows are off limits.
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

async function setupFixtureCategory(session, prefix, suffix = 'CAT_A') {
  const categoryId = `${prefix}_${suffix}`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (c:Category { categoryId: $categoryId })
       ON CREATE SET c.name = $name, c.description = $description, c.datasetTag = $prefix`,
      { categoryId, name: `Phase5 ${suffix}`, description: 'fixture', prefix }
    );
  });
  return { categoryId };
}

async function setupFixtureProduct(session, prefix, { suffix, active = true, categoryId }) {
  const productId = `${prefix}_${suffix}`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (p:Product { productId: $productId })
       ON CREATE SET p.name = $name, p.description = $description, p.price = $price,
                     p.imageUrl = '/x.svg', p.datasetTag = $prefix, p.createdAt = datetime()
       SET p.active = $active`,
      {
        productId,
        name: `Phase5 ${suffix}`,
        description: 'fixture',
        price: 1_000_000,
        prefix,
        active,
      }
    );
    if (categoryId) {
      await tx.run(
        `MATCH (p:Product { productId: $productId })
         MATCH (cat:Category { categoryId: $categoryId })
         OPTIONAL MATCH (p)-[old:BELONGS_TO]->(:Category)
         DELETE old
         MERGE (p)-[b:BELONGS_TO { datasetTag: $prefix }]->(cat)
         ON CREATE SET b.createdAt = datetime()`,
        { productId, categoryId, prefix }
      );
    }
  });
  return { productId };
}

async function setupFixtureCustomer(session, prefix, { suffix, role = 'customer', active = true, withEmail = true }) {
  const customerId = `${prefix}_CUST_${suffix}`;
  const email = withEmail ? `${prefix.toLowerCase()}-${suffix.toLowerCase()}@phase5.test` : null;
  const passwordHash = await hashPassword('Phase5-Cust-001');
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (c:Customer { customerId: $customerId })
       ON CREATE SET c.name = $name, c.role = $role, c.active = $active,
                     c.datasetTag = $prefix, c.createdAt = datetime(),
                     c.email = $email, c.passwordHash = $passwordHash, c.salt = 'salt'
       ON MATCH SET c.email = $email, c.passwordHash = $passwordHash,
                     c.role = $role, c.active = $active, c.name = $name`,
      {
        customerId,
        name: `Phase5 ${suffix}`,
        role,
        active,
        prefix,
        email,
        passwordHash,
      }
    );
  });
  return { customerId, email, password: 'Phase5-Cust-001', role, active };
}

async function addBought(session, { customerId, productId, prefix, quantity = 1, unitPrice = 1_000_000 }) {
  const eventId = `BOUGHT_DT13_PHASE5_${prefix}_${randomUUID()}`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MATCH (c:Customer { customerId: $customerId })
       MATCH (p:Product { productId: $productId })
       MERGE (c)-[r:BOUGHT { eventId: $eventId }]->(p)
       ON CREATE SET r.quantity = $quantity, r.unitPrice = $unitPrice,
                     r.purchasedAt = datetime(), r.datasetTag = $prefix`,
      { customerId, productId, eventId, quantity, unitPrice, prefix }
    );
  });
  return eventId;
}

async function loginAs(agent, email, password) {
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

/* (helper intentionally omitted: tests so sanh truc tiep voi gia tri da tinh san) */

/* -------------------------------------------------------------------------- */
/* Test harness                                                               */
/* -------------------------------------------------------------------------- */

const RUN_ID = randomUUID().slice(0, 8);
const PREFIX = `DT13_PHASE5_${RUN_ID}`;

const config = loadConfig();
if (!config.neo4jFullyConfigured) {
  test('NEEDS NEO4J', { skip: true }, () => {});
  process.exit(0);
}

const driver = neo4j.driver(
  config.neo4jUri,
  neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
  { connectionTimeout: 5000, disableLosslessIntegers: true }
);

let app;
let session;
let adminInfo;
let customersById = {};
let productIds = {};
let categoryId;

test('Phase 5 recommendation-graph (live Neo4j)', { concurrency: false }, async (t) => {
  const boot = await bootstrap();
  app = boot.app;
  session = driver.session({ database: config.neo4jDatabase, defaultAccessMode: neo4j.session.READ });

  t.before(async () => {
    // Setup fixture.
    const cat = await setupFixtureCategory(session, PREFIX, 'CAT_G');
    categoryId = cat.categoryId;
    const p1 = await setupFixtureProduct(session, PREFIX, { suffix: 'P1', categoryId });
    const p2 = await setupFixtureProduct(session, PREFIX, { suffix: 'P2', categoryId });
    const p3 = await setupFixtureProduct(session, PREFIX, { suffix: 'P3', categoryId });
    const p4 = await setupFixtureProduct(session, PREFIX, { suffix: 'P4', categoryId });
    const p5 = await setupFixtureProduct(session, PREFIX, { suffix: 'P5', categoryId });
    const pInactive = await setupFixtureProduct(session, PREFIX, { suffix: 'P_INACTIVE', active: false, categoryId });
    productIds = { p1: p1.productId, p2: p2.productId, p3: p3.productId, p4: p4.productId, p5: p5.productId, pInactive: pInactive.productId };

    const admin = await setupFixtureCustomer(session, PREFIX, { suffix: 'ADM', role: 'admin', active: true });
    adminInfo = admin;
    const a = await setupFixtureCustomer(session, PREFIX, { suffix: 'A' });
    const b = await setupFixtureCustomer(session, PREFIX, { suffix: 'B' });
    const c = await setupFixtureCustomer(session, PREFIX, { suffix: 'C' });
    const d = await setupFixtureCustomer(session, PREFIX, { suffix: 'D' });
    const e = await setupFixtureCustomer(session, PREFIX, { suffix: 'E', withEmail: false });
    customersById = { A: a, B: b, C: c, D: d, E: e };

    // BOUGHT: A[P1, P2]; B[P1, P2, P3]; C[P1, P3, P4]; D[P2, P4]; E (cold start, nothing).
    const buyMap = {
      A: [productIds.p1, productIds.p2],
      B: [productIds.p1, productIds.p2, productIds.p3],
      C: [productIds.p1, productIds.p3, productIds.p4],
      D: [productIds.p2, productIds.p4],
      E: [],
    };
    for (const [k, list] of Object.entries(buyMap)) {
      for (const pid of list) {
        await addBought(session, { customerId: customersById[k].customerId, productId: pid, prefix: PREFIX });
      }
    }
  });

  t.after(async () => {
    await cleanupByPrefix(session, PREFIX);
    if (session) await session.close();
    if (driver) await driver.close();
  });

  /* ---------------- Auth / role ---------------- */
  await t.test('guest (no auth) returns 401', async () => {
    const agent = request.agent(app);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'user_cf',
      limit: 5,
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  await t.test('customer role returns 403', async () => {
    const agent = request.agent(app);
    await loginAs(agent, customersById.A.email, customersById.A.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'user_cf',
      limit: 5,
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'ADMIN_REQUIRED');
  });

  await t.test('admin returns 200', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'user_cf',
      limit: 5,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.method, 'user_cf');
    assert.equal(res.body.targetCustomerId, customersById.A.customerId);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(Array.isArray(res.body.nodes));
    assert.ok(Array.isArray(res.body.edges));
    assert.ok(Array.isArray(res.body.contributions));
    assert.ok(res.body.bounds.maxNodes > 0);
  });

  /* ---------------- Parameter validation ---------------- */
  await t.test('missing customerId returns 400', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({ mode: 'user_cf' });
    assert.equal(res.status, 400);
  });

  await t.test('invalid mode returns 400', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'unknown',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_MODE');
  });

  await t.test('co_bought without productId returns 400', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'co_bought',
    });
    assert.equal(res.status, 400);
  });

  await t.test('inactive source product returns 404', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'co_bought',
      productId: productIds.pInactive,
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'PRODUCT_NOT_FOUND');
  });

  await t.test('limit=21 returns 400', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'user_cf',
      limit: 21,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_LIMIT');
  });

  await t.test('limit=abc returns 400', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'user_cf',
      limit: 'abc',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_LIMIT');
  });

  /* ---------------- Items/score/support oracle (user_cf) ---------------- */
  await t.test('user_cf for customer A: items phai dong nhat voi Phase 4', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'user_cf',
      limit: 5,
    });
    assert.equal(res.status, 200);
    // A: bought P1, P2. Peer B (P1,P2,P3) -> P3. Peer C (P1,P3,P4) -> P3, P4. Peer D (P2,P4) -> P4.
    // Expected items: P3 (score 3, support 2) from B (sharedCount 2: P1,P2) + C (sharedCount 1: P1).
    // P4 (score 2, support 2) from C (sharedCount 1: P1) + D (sharedCount 1: P2).
    const m = new Map();
    for (const it of res.body.items) m.set(it.productId, it);
    assert.ok(m.has(productIds.p3), 'A must receive P3');
    assert.equal(m.get(productIds.p3).score, 3);
    assert.equal(m.get(productIds.p3).support, 2);
    assert.ok(m.has(productIds.p4), 'A must receive P4');
    assert.equal(m.get(productIds.p4).score, 2);
    assert.equal(m.get(productIds.p4).support, 2);
    // Products A already bought must not be in items.
    assert.ok(!m.has(productIds.p1));
    assert.ok(!m.has(productIds.p2));
  });

  /* ---------------- Items/score/support oracle (co_bought) ---------------- */
  await t.test("co_bought for source P1 against target A: A doesn't have to buy P1 to get recommendations", async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'co_bought',
      productId: productIds.p1,
      limit: 20,
    });
    assert.equal(res.status, 200);
    // Buyers of P1: B, C (A loai vi buyer <> c1). B mua P1, P2, P3; C mua P1, P3, P4.
    // candidates (active): P2 (B), P3 (B, C), P4 (C).
    // P1 (source) khong co trong items.
    const ids = res.body.items.map((it) => it.productId);
    assert.ok(ids.includes(productIds.p3), 'P3 phai la ung vien (B+C)');
    assert.ok(ids.includes(productIds.p4), 'P4 phai la ung vien (C)');
    // P2: A already bought P2; co_bought rule filters it out.
    if (ids.includes(productIds.p2)) {
      const p2 = res.body.items.find((it) => it.productId === productIds.p2);
      assert.equal(p2.support, 1);
    }
  });

  /* ---------------- Graph validation ---------------- */
  await t.test('graph nodes/edges: IDs are unique, source/target are valid', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'user_cf',
      limit: 5,
    });
    assert.equal(res.status, 200);
    const ids = res.body.nodes.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, 'node IDs must be unique');
    const nodeIdSet = new Set(ids);
    for (const e of res.body.edges) {
      assert.ok(nodeIdSet.has(e.source), `Edge source ${e.source} must exist in nodes`);
      assert.ok(nodeIdSet.has(e.target), `Edge target ${e.target} must exist in nodes`);
    }
    // bounds counts must match.
    assert.equal(res.body.bounds.actualNodeCount, res.body.nodes.length);
    assert.equal(res.body.bounds.actualEdgeCount, res.body.edges.length);
  });

  await t.test('co_bought graph contains the source node', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'co_bought',
      productId: productIds.p1,
      limit: 5,
    });
    assert.equal(res.status, 200);
    const ids = res.body.nodes.map((n) => n.id);
    assert.ok(ids.includes(`product:source:${productIds.p1}`), 'source node must be present');
    // Edges from peers to source.
    const sourceEdges = res.body.edges.filter((e) => e.target === `product:source:${productIds.p1}`);
    assert.ok(sourceEdges.length >= 1, 'at least one peer->source edge is required');
  });

  /* ---------------- Cold start ---------------- */
  await t.test('user_cf cold start (customer E) returns empty items but a valid graph', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.E.customerId,
      mode: 'user_cf',
      limit: 5,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 0);
    // The target node must still be present.
    const ids = res.body.nodes.map((n) => n.id);
    assert.ok(ids.includes(`customer:target:${customersById.E.customerId}`));
    assert.equal(res.body.contributions.length, 0);
  });

  /* ---------------- Duplicated buy (mua lap) ---------------- */
  await t.test('duplicate purchases do not increase score/support', async () => {
    // Add 5 duplicate BOUGHT edges from A to P1 and verify items stay the same.
    const before = await (async () => {
      const agent = request.agent(app);
      await loginAs(agent, adminInfo.email, adminInfo.password);
      const res = await agent.get('/api/analytics/recommendation-graph').query({
        customerId: customersById.A.customerId,
        mode: 'user_cf',
        limit: 5,
      });
      return res.body.items;
    })();
    // Them duplicate.
    for (let i = 0; i < 5; i += 1) {
      await addBought(session, { customerId: customersById.A.customerId, productId: productIds.p1, prefix: PREFIX });
    }
    const after = await (async () => {
      const agent = request.agent(app);
      await loginAs(agent, adminInfo.email, adminInfo.password);
      const res = await agent.get('/api/analytics/recommendation-graph').query({
        customerId: customersById.A.customerId,
        mode: 'user_cf',
        limit: 5,
      });
      return res.body.items;
    })();
    assert.deepEqual(after, before, 'duplicate purchases must not change items/score/support');
  });

  /* ---------------- Contribution table ---------------- */
  await t.test('user_cf contributions have peerId and contribution=sharedCount', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'user_cf',
      limit: 5,
    });
    assert.equal(res.status, 200);
    const contributions = res.body.contributions;
    // Total contribution = B(2) + C(1) + D(1) = 4.
    const total = contributions.reduce((s, c) => s + Number(c.contribution), 0);
    assert.equal(total, 4);
    // Peer set must include B, C, D.
    const ids = new Set(contributions.map((c) => c.peerId));
    assert.ok(ids.has(customersById.B.customerId));
    assert.ok(ids.has(customersById.C.customerId));
    assert.ok(ids.has(customersById.D.customerId));
  });

  /* ---------------- Sample summary ---------------- */
  await t.test('sampleSummary reports non-negative totalPeers/shownPeers', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'user_cf',
      limit: 5,
    });
    assert.equal(res.status, 200);
    const s = res.body.sampleSummary;
    assert.ok(s.totalPeers >= s.shownPeers);
    assert.equal(s.shownPeers, res.body.contributions.length);
  });

  /* ---------------- Khong tra passwordHash/email ---------------- */
  await t.test('payload does not include passwordHash or email', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'user_cf',
      limit: 5,
    });
    const json = JSON.stringify(res.body);
    assert.ok(!json.includes('passwordHash'), 'passwordHash must not leak');
    assert.ok(!json.includes(customersById.A.email), 'email must not leak');
  });

  /* ---------------- Tie-break on co_bought ---------------- */
  await t.test('co_bought P1: items are returned in stable order (score DESC, support DESC, productId ASC)', async () => {
    const agent = request.agent(app);
    await loginAs(agent, adminInfo.email, adminInfo.password);
    const res = await agent.get('/api/analytics/recommendation-graph').query({
      customerId: customersById.A.customerId,
      mode: 'co_bought',
      productId: productIds.p1,
      limit: 10,
    });
    assert.equal(res.status, 200);
    const items = res.body.items;
    for (let i = 1; i < items.length; i += 1) {
      const prev = items[i - 1];
      const cur = items[i];
      const scoreOk = prev.score > cur.score
        || (prev.score === cur.score && prev.support > cur.support)
        || (prev.score === cur.score && prev.support === cur.support && prev.productId <= cur.productId);
      assert.ok(scoreOk, 'items must be in a stable order');
    }
  });
});
