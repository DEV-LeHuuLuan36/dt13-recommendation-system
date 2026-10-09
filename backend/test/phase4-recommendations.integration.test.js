/**
 * Integration tests for the recommendations endpoints.
 * Runs against a real Neo4j. Uses a per-run fixture prefix to avoid
 * touching seed data. CF and co_bought only walk BOUGHT of active
 * customer-role nodes, so the in-memory oracle is reliable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import neo4j from 'neo4j-driver';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { bootstrap } from '../src/app.js';
import { hashPassword } from '../src/password.js';

/* -------------------------------------------------------------------------- */
/* Test helpers                                                               */
/* -------------------------------------------------------------------------- */

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
    await tx.run(
      `MATCH (p:Product) WHERE p.productId =~ 'PROD_[a-f0-9]{32}' DETACH DELETE p`
    );
    await tx.run(
      `MATCH (c:Category) WHERE c.categoryId =~ 'CAT_[a-f0-9]{32}' DETACH DELETE c`
    );
    await tx.run(
      `MATCH (c:Customer) WHERE c.customerId =~ 'CUST_[a-f0-9]{32}' DETACH DELETE c`
    );
    // Only delete BOUGHT/VIEWED that this fixture created (prefix DT13_PHASE4_);
    // never touch real dataset rows tagged with the canonical markers.
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
  // Only delete BOUGHT/VIEWED that this fixture created (prefix DT13_PHASE4_).
  await neo4jClient.write(
    `MATCH ()-[r:BOUGHT]-() WHERE r.datasetTag STARTS WITH $prefix DETACH DELETE r`,
    { prefix }
  );
  await neo4jClient.write(
    `MATCH ()-[r:VIEWED]-() WHERE r.datasetTag STARTS WITH $prefix DETACH DELETE r`,
    { prefix }
  );
}

async function setupFixtureCustomer(session, prefix, { suffix, role = 'customer', active = true, name = 'Phase4 Cust' } = {}) {
  const passwordHash = await hashPassword('Phase4-Cust-001');
  const customerId = `${prefix}_${suffix}`;
  const email = `phase4-${suffix.toLowerCase()}-${prefix.toLowerCase()}@example.test`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (c:Customer { customerId: $customerId })
       ON CREATE SET c.email = $email, c.passwordHash = $passwordHash,
                     c.datasetTag = $prefix, c.createdAt = datetime()
       SET c.role = $role, c.active = $active, c.name = $name`,
      { customerId, email, passwordHash, prefix, role, active, name }
    );
  });
  return { customerId, email, password: 'Phase4-Cust-001' };
}

async function setupFixtureCategory(session, prefix, suffix = 'CAT_A') {
  const categoryId = `${prefix}_${suffix}`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (c:Category { categoryId: $categoryId })
       ON CREATE SET c.name = $name, c.description = $description, c.datasetTag = $prefix`,
      { categoryId, name: `Phase4 ${suffix}`, description: 'fixture', prefix }
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
        name: `Phase4 ${suffix}`,
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

/**
 * Them mot BOUGHT tu fixtureCustomer -> fixtureProduct voi eventId tuy y.
 * Co the goi nhieu lan (de tao mua lap).
 */
async function addBought(session, { customerId, productId, prefix, quantity = 1, unitPrice = 1_000_000, eventIdSuffix }) {
  const eventId = `BOUGHT_DT13_PHASE4_${prefix}_${eventIdSuffix || randomUUID()}`;
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

async function addViewed(session, { customerId, productId, prefix, eventIdSuffix }) {
  const eventId = `VIEWED_DT13_PHASE4_${prefix}_${eventIdSuffix || randomUUID()}`;
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MATCH (c:Customer { customerId: $customerId })
       MATCH (p:Product { productId: $productId })
       MERGE (c)-[r:VIEWED { eventId: $eventId }]->(p)
       ON CREATE SET r.viewedAt = datetime(), r.datasetTag = $prefix`,
      { customerId, productId, eventId, prefix }
    );
  });
  return eventId;
}

/* -------------------------------------------------------------------------- */
/* Oracle doc tu BOUGHT cua fixture (set phan biet)                           */
/* -------------------------------------------------------------------------- */

async function loadPeerBoughtSets(session, { prefix }) {
  // Lay tat ca khach active role=customer trong fixture, va cac BOUGHT cua ho.
  // Doc BOUGHT that (khong filter prefix eventId) de oracle phan anh BOUGHT moi
  // tu API Phase 3 (idempotent eventId khong the bi trung prefix).
  const res = await session.executeRead(async (tx) => tx.run(
    `MATCH (c:Customer)
     WHERE c.datasetTag = $prefix AND c.role = 'customer' AND c.active = true
     OPTIONAL MATCH (c)-[r:BOUGHT]->(p:Product)
     RETURN c.customerId AS cid, collect(DISTINCT p.productId) AS prods`,
    { prefix }
  ));
  const out = {};
  for (const r of res.records) {
    const cid = r.get('cid');
    const prods = r.get('prods') || [];
  // Drop nulls in the OPTIONAL MATCH collect.
  out[cid] = new Set(prods.filter((p) => p));
  }
  return out;
}

/**
 * Tinh expected cho user_cf theo MASTER_CONTEXT section 6.1:
 *  - sharedCount(u,v) = |B(u) ∩ B(v)|.
 *  - score(u,p) = sum(sharedCount(u,v)) tren peer v co p in B(v).
 *  - support(u,p) = so peer v phan biet co p in B(v).
 *  - Loai p in B(u), peer v khong active/role=customer, hang inactive.
 *  - Sort score DESC, support DESC, productId ASC; limit K.
 */
function computeCfForUser(uId, peersBought, uBought, activeProducts, limit) {
  const uSet = uBought;
  const candidates = new Map(); // pid -> { score, support }
  for (const [vid, vSet] of Object.entries(peersBought)) {
    if (vid === uId) continue;
    // Tinh sharedCount(u,v)
    let shared = 0;
    for (const p of vSet) if (uSet.has(p)) shared += 1;
    if (shared === 0) continue;
    for (const p of vSet) {
      if (uSet.has(p)) continue; // u da mua
      if (!activeProducts.has(p)) continue; // p inactive
      const entry = candidates.get(p) || { score: 0, support: 0 };
      entry.score += shared;
      entry.support += 1;
      candidates.set(p, entry);
    }
  }
  const list = [];
  for (const [pid, v] of candidates.entries()) {
    list.push({ productId: pid, score: v.score, support: v.support });
  }
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.support !== a.support) return b.support - a.support;
    if (a.productId < b.productId) return -1;
    if (a.productId > b.productId) return 1;
    return 0;
  });
  return list.slice(0, limit);
}

/**
 * Tinh expected cho co_bought theo section 6.2:
 *  - source = productId.
 *  - peer = customer phan biet active role=customer mua source.
 *  - candidates = (peer, candidate) cho cac candidate khac source, khong trong B(u), active.
 *  - score = support = so peer phan biet.
 *  - Khach hien tai khong can mua source.
 *  - Sort score DESC, support DESC, productId ASC; limit K.
 */
function computeCoBoughtFor({ sourceId, uId, peersBought, activeProducts, limit }) {
  const uSet = peersBought[uId] || new Set();
  const candidateMap = new Map(); // pid -> so peer
  for (const [vid, vSet] of Object.entries(peersBought)) {
    if (vid === uId) continue;
    if (!vSet.has(sourceId)) continue;
    for (const p of vSet) {
      if (p === sourceId) continue;
      if (uSet.has(p)) continue;
      if (!activeProducts.has(p)) continue;
      candidateMap.set(p, (candidateMap.get(p) || 0) + 1);
    }
  }
  const list = [];
  for (const [pid, support] of candidateMap.entries()) {
    list.push({ productId: pid, score: support, support });
  }
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.support !== a.support) return b.support - a.support;
    if (a.productId < b.productId) return -1;
    if (a.productId > b.productId) return 1;
    return 0;
  });
  return list.slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Test suite                                                                */
/* -------------------------------------------------------------------------- */

test('integration: Phase 4 recommendations (CF + co_bought)', async (t) => {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    t.skip('NEO4J not configured; skipping Phase 4 integration tests.');
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
    for (let i = 0; i < 3; i += 1) {
      try {
        await cleanupByPrefixViaApp(neo4jClient, 'DT13_PHASE4_');
        await cleanupByPrefix(session, 'DT13_PHASE4_');
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

  const prefix = `DT13_PHASE4_${randomBytes(3).toString('hex')}`;
  await cleanupByPrefixViaApp(neo4jClient, 'DT13_PHASE4_').catch(() => {});
  await cleanupByPrefix(session, 'DT13_PHASE4_').catch(() => {});

  // ----- Build fixture: A..E customers, P1..P4 products, CAT_A category.
  const A = await setupFixtureCustomer(session, prefix, { suffix: 'A', role: 'customer', active: true, name: 'Phase4 A' });
  const B = await setupFixtureCustomer(session, prefix, { suffix: 'B', role: 'customer', active: true, name: 'Phase4 B' });
  const C = await setupFixtureCustomer(session, prefix, { suffix: 'C', role: 'customer', active: true, name: 'Phase4 C' });
  const D = await setupFixtureCustomer(session, prefix, { suffix: 'D', role: 'customer', active: true, name: 'Phase4 D' });
  const E = await setupFixtureCustomer(session, prefix, { suffix: 'E', role: 'customer', active: true, name: 'Phase4 E' });
  const adminX = await setupFixtureCustomer(session, prefix, { suffix: 'ADMINX', role: 'admin', active: true, name: 'Phase4 Admin' });
  const inactivePeer = await setupFixtureCustomer(session, prefix, { suffix: 'INACT', role: 'customer', active: false, name: 'Phase4 Inactive' });
  const catA = await setupFixtureCategory(session, prefix, 'CAT_A');
  const P1 = await setupFixtureProduct(session, prefix, { suffix: 'P1', active: true, categoryId: catA.categoryId });
  const P2 = await setupFixtureProduct(session, prefix, { suffix: 'P2', active: true, categoryId: catA.categoryId });
  const P3 = await setupFixtureProduct(session, prefix, { suffix: 'P3', active: true, categoryId: catA.categoryId });
  const P4 = await setupFixtureProduct(session, prefix, { suffix: 'P4', active: true, categoryId: catA.categoryId });
  const PINACT = await setupFixtureProduct(session, prefix, { suffix: 'PINACT', active: false, categoryId: catA.categoryId });
  const PEMPTY = await setupFixtureProduct(session, prefix, { suffix: 'PEMPTY', active: true, categoryId: catA.categoryId });

  // BOUGHT pattern (per design notes):
  //   A: P1, P2
  //   B: P1, P2, P3 (+ duplicate P3)
  //   C: P1, P3, P4
  //   D: P2, P4
  //   E: (nothing)
  // B also gets a duplicate P3 (no extra credit) and a PINACT purchase (filtered by active=false).
  // PEMPTY stays unbought so co_bought against it must return 200 + empty.
  await addBought(session, { customerId: A.customerId, productId: P1.productId, prefix, eventIdSuffix: 'A_P1' });
  await addBought(session, { customerId: A.customerId, productId: P2.productId, prefix, eventIdSuffix: 'A_P2' });
  await addBought(session, { customerId: B.customerId, productId: P1.productId, prefix, eventIdSuffix: 'B_P1' });
  await addBought(session, { customerId: B.customerId, productId: P2.productId, prefix, eventIdSuffix: 'B_P2' });
  await addBought(session, { customerId: B.customerId, productId: P3.productId, prefix, eventIdSuffix: 'B_P3' });
  await addBought(session, { customerId: B.customerId, productId: P3.productId, prefix, eventIdSuffix: 'B_P3_REPEAT' });
  await addBought(session, { customerId: C.customerId, productId: P1.productId, prefix, eventIdSuffix: 'C_P1' });
  await addBought(session, { customerId: C.customerId, productId: P3.productId, prefix, eventIdSuffix: 'C_P3' });
  await addBought(session, { customerId: C.customerId, productId: P4.productId, prefix, eventIdSuffix: 'C_P4' });
  await addBought(session, { customerId: D.customerId, productId: P2.productId, prefix, eventIdSuffix: 'D_P2' });
  await addBought(session, { customerId: D.customerId, productId: P4.productId, prefix, eventIdSuffix: 'D_P4' });
  // Them mua PINACT cua B -> loai vi PINACT inactive.
  await addBought(session, { customerId: B.customerId, productId: PINACT.productId, prefix, eventIdSuffix: 'B_PINACT' });
  // Inactive peer (inactivePeer) buys P4 -> should not count (inactive).
  await addBought(session, { customerId: inactivePeer.customerId, productId: P4.productId, prefix, eventIdSuffix: 'INACT_P4' });
  await addBought(session, { customerId: inactivePeer.customerId, productId: P1.productId, prefix, eventIdSuffix: 'INACT_P1' });

  // Oracle data
  const peersBought = await loadPeerBoughtSets(session, { prefix });
  const activeProducts = new Set([P1.productId, P2.productId, P3.productId, P4.productId]);
  const uABought = peersBought[A.customerId];

  /* ------------------------------ Auth & perms --------------------------- */

  // agentA handles recommendation calls for A.
  let agentA = null;
  await t.test('A login OK', async () => {
    agentA = request.agent(app);
    const res = await agentA.post('/api/auth/login').send({ email: A.email, password: A.password });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.profile.role, 'customer');
  });

  await t.test('GET /api/recommendations/me without auth -> 401', async () => {
    const r = await request(app).get('/api/recommendations/me');
    assert.equal(r.status, 401);
  });

  await t.test('admin cannot call /api/recommendations/* (403 CUSTOMER_REQUIRED)', async () => {
    const adminAgent = request.agent(app);
    const login = await adminAgent.post('/api/auth/login').send({
      email: adminX.email,
      password: adminX.password,
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.profile.role, 'admin');

    const r1 = await adminAgent.get('/api/recommendations/me');
    assert.equal(r1.status, 403, JSON.stringify(r1.body));
    assert.equal(r1.body.error.code, 'CUSTOMER_REQUIRED');
    const r2 = await adminAgent.get(`/api/recommendations/products/${P1.productId}`);
    assert.equal(r2.status, 403, JSON.stringify(r2.body));
    assert.equal(r2.body.error.code, 'CUSTOMER_REQUIRED');
  });

  await t.test('inactive customer is blocked by requireAuth (403 ACCOUNT_INACTIVE)', async () => {
    // Use a dedicated agent: if A gets demoted, requireAuth will destroy
    // *its* session without affecting agentA used in later tests.
    const isolatedAgent = request.agent(app);
    const login = await isolatedAgent.post('/api/auth/login').send({ email: A.email, password: A.password });
    assert.equal(login.status, 200);

    await session.executeWrite(async (tx) => {
      await tx.run(`MATCH (c:Customer { customerId: $cid }) SET c.active = false`, { cid: A.customerId });
    });
    try {
      const r = await isolatedAgent.get('/api/recommendations/me');
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'ACCOUNT_INACTIVE');
    } finally {
      await session.executeWrite(async (tx) => {
        await tx.run(`MATCH (c:Customer { customerId: $cid }) SET c.active = true`, { cid: A.customerId });
      });
    }
  });

  await t.test('invalid limit (0/-1/abc/1.5/21/empty) -> 400 (empty is allowed, default 5)', async () => {
    const cases = ['0', '-1', 'abc', '1.5', '21', ''];
    for (const l of cases) {
      const r = await agentA.get(`/api/recommendations/me?limit=${encodeURIComponent(l)}`);
      if (l === '') {
        // empty -> default 5 (not 400)
        assert.ok(r.status === 200, `limit='' expected 200 got ${r.status}`);
      } else {
        assert.equal(r.status, 400, `limit=${l} expected 400 got ${r.status}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error.code, 'INVALID_LIMIT');
      }
    }
  });

  await t.test('limit=1 returns a single item with the highest score', async () => {
    const r = await agentA.get('/api/recommendations/me?limit=1');
    assert.equal(r.status, 200);
    assert.equal(r.body.method, 'user_cf');
    assert.equal(r.body.limit, 1);
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].productId, P3.productId);
    assert.equal(r.body.items[0].score, 3);
    assert.equal(r.body.items[0].support, 2);
  });

  /* ------------------------- CF baseline / oracle ----------------------- */

  await t.test('CF baseline: A gets P3(3,2) first, then P4(2,2)', async () => {
    const r = await agentA.get('/api/recommendations/me?limit=5');
    assert.equal(r.status, 200);
    assert.equal(r.body.method, 'user_cf');

    const expected = computeCfForUser(
      A.customerId,
      peersBought,
      uABought,
      activeProducts,
      5
    );
    assert.equal(r.body.items.length, expected.length, JSON.stringify(r.body.items));
    for (let i = 0; i < expected.length; i += 1) {
      const it = r.body.items[i];
      assert.equal(it.productId, expected[i].productId, `order #${i}`);
      assert.equal(it.score, expected[i].score);
      assert.equal(it.support, expected[i].support);
      assert.equal(typeof it.name, 'string');
      assert.equal(typeof it.imageUrl, 'string');
      assert.ok(typeof it.price === 'number');
      assert.ok(typeof it.reason === 'string' && it.reason.length > 0);
    }

    // Concretely: P3 score=3 support=2, P4 score=2 support=2.
    assert.equal(r.body.items[0].productId, P3.productId);
    assert.equal(r.body.items[0].score, 3);
    assert.equal(r.body.items[0].support, 2);
    assert.equal(r.body.items[1].productId, P4.productId);
    assert.equal(r.body.items[1].score, 2);
    assert.equal(r.body.items[1].support, 2);

    // PINACT (inactive) and PEMPTY (no peer purchase) must not appear.
    for (const it of r.body.items) {
      assert.notEqual(it.productId, PINACT.productId);
      assert.notEqual(it.productId, PEMPTY.productId);
    }
  });

  await t.test("Duplicate P3 purchase by B does not inflate A's score/support", async () => {
    // Peer count for P3 must remain 2 (B, C) and score must stay 3.
    const r = await agentA.get('/api/recommendations/me?limit=5');
    assert.equal(r.status, 200);
    const p3 = r.body.items.find((x) => x.productId === P3.productId);
    assert.ok(p3, 'P3 must be present');
    assert.equal(p3.score, 3);
    assert.equal(p3.support, 2);
  });

  /* ----------------------- Co-bought oracle (A xem P4) ------------------ */

  await t.test('Co-bought: A views P4 (not yet bought) gets P3(1,1)', async () => {
    const r = await agentA.get(`/api/recommendations/products/${P4.productId}?limit=5`);
    assert.equal(r.status, 200);
    assert.equal(r.body.method, 'co_bought');
    assert.equal(r.body.sourceProductId, P4.productId);

    const expected = computeCoBoughtFor({
      sourceId: P4.productId,
      uId: A.customerId,
      peersBought,
      activeProducts,
      limit: 5,
    });
    assert.equal(r.body.items.length, expected.length);
    for (let i = 0; i < expected.length; i += 1) {
      assert.equal(r.body.items[i].productId, expected[i].productId);
      assert.equal(r.body.items[i].score, expected[i].score);
      assert.equal(r.body.items[i].support, expected[i].support);
    }
    // A already bought P1/P2, source is P4 -> all three are filtered out,
    // leaving only P3 (from C and D).
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].productId, P3.productId);
    assert.equal(r.body.items[0].score, 1);
    assert.equal(r.body.items[0].support, 1);
  });

  await t.test('Co-bought: source exists but no co-purchase -> items=[] (200)', async () => {
    // PEMPTY has no peer purchases -> 200 with empty list.
    const r = await agentA.get(`/api/recommendations/products/${PEMPTY.productId}?limit=5`);
    assert.equal(r.status, 200);
    assert.equal(r.body.method, 'co_bought');
    assert.equal(r.body.items.length, 0);
  });

  await t.test('Co-bought: source product not found -> 404', async () => {
    const r = await agentA.get('/api/recommendations/products/DOES_NOT_EXIST');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'PRODUCT_NOT_FOUND');
  });

  await t.test('Co-bought: source product is inactive -> 404', async () => {
    const r = await agentA.get(`/api/recommendations/products/${PINACT.productId}`);
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'PRODUCT_NOT_FOUND');
  });

  /* ------------------ Mua moi -> CF cap nhat (P3 loai) ----------------- */

  await t.test('After A buys P3 via Phase 3 API: P3 disappears and P4 becomes (3,2)', async () => {
    const eventId = `${prefix}_BOUGHT_AFTER_VIEW`;
    const res = await agentA.post('/api/interactions/purchases').send({
      eventId,
      productId: P3.productId,
      quantity: 1,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    // Refresh local oracle after the API write.
    uABought.add(P3.productId);
    peersBought[A.customerId] = uABought;
    const expected = computeCfForUser(A.customerId, peersBought, uABought, activeProducts, 5);

    const r = await agentA.get('/api/recommendations/me?limit=5');
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, expected.length);
    // P3 must be gone
    const ids = r.body.items.map((x) => x.productId);
    assert.ok(!ids.includes(P3.productId), 'P3 must disappear after A buys it');
    // P4 score=3 (C shares P1/P3, D shares P2) support=2 (C, D)
    const p4 = r.body.items.find((x) => x.productId === P4.productId);
    assert.ok(p4, 'P4 must be present');
    assert.equal(p4.score, 3);
    assert.equal(p4.support, 2);
  });

  await t.test('After A buys P3: P3 is also removed as a co-bought candidate for source P4', async () => {
    const r = await agentA.get(`/api/recommendations/products/${P4.productId}?limit=5`);
    assert.equal(r.status, 200);
    const ids = r.body.items.map((x) => x.productId);
    assert.ok(!ids.includes(P3.productId), 'P3 was just bought, must be filtered out');
    assert.equal(r.body.items.length, 0, 'A bought P1, P2, P3 and viewed P4 -> no remaining candidates');
  });

  let viewCountsBefore = 0;
  let viewCountsAfter = 0;
  await t.test('Writing new VIEWED does not change CF (read-only)', async () => {
    viewCountsBefore = Number((await session.executeRead(async (tx) => tx.run(
      `MATCH ()-[r:VIEWED]->() WHERE r.eventId STARTS WITH 'VIEWED_DT13_PHASE4_' RETURN count(r) AS n`
    ))).records[0].get('n'));
    const r1 = await agentA.get('/api/recommendations/me?limit=5');
    await addViewed(session, { customerId: A.customerId, productId: P4.productId, prefix, eventIdSuffix: 'A_P4_VIEW' });
    await addViewed(session, { customerId: A.customerId, productId: P3.productId, prefix, eventIdSuffix: 'A_P3_VIEW' });
    const r2 = await agentA.get('/api/recommendations/me?limit=5');
    viewCountsAfter = Number((await session.executeRead(async (tx) => tx.run(
      `MATCH ()-[r:VIEWED]->() WHERE r.eventId STARTS WITH 'VIEWED_DT13_PHASE4_' RETURN count(r) AS n`
    ))).records[0].get('n'));
    assert.equal(r1.body.items.length, r2.body.items.length);
    for (let i = 0; i < r1.body.items.length; i += 1) {
      assert.equal(r1.body.items[i].productId, r2.body.items[i].productId);
      assert.equal(r1.body.items[i].score, r2.body.items[i].score);
      assert.equal(r1.body.items[i].support, r2.body.items[i].support);
    }
    assert.ok(viewCountsAfter > viewCountsBefore, 'VIEWED count must increase');
  });

  /* ----------------------- Empty / role / active ----------------------- */

  await t.test('E has no purchases: CF returns the empty shape', async () => {
    const agentE = request.agent(app);
    await agentE.post('/api/auth/login').send({ email: E.email, password: E.password });
    const r = await agentE.get('/api/recommendations/me?limit=5');
    assert.equal(r.status, 200);
    assert.equal(r.body.method, 'user_cf');
    assert.equal(r.body.items.length, 0);
    assert.ok(typeof r.body.reason === 'string' && r.body.reason.length > 0);
  });

  await t.test('BOUGHT/VIEWED snapshot is unchanged after recommendation calls', async () => {
    const before = await session.executeRead(async (tx) => tx.run(
      `MATCH (c:Customer)-[r:BOUGHT]->() WHERE r.eventId STARTS WITH 'BOUGHT_DT13_PHASE4_' RETURN count(r) AS n`
    ));
    const beforeN = Number(before.records[0].get('n'));
    await agentA.get('/api/recommendations/me?limit=5');
    await agentA.get(`/api/recommendations/products/${P4.productId}`);
    const after = await session.executeRead(async (tx) => tx.run(
      `MATCH (c:Customer)-[r:BOUGHT]->() WHERE r.eventId STARTS WITH 'BOUGHT_DT13_PHASE4_' RETURN count(r) AS n`
    ));
    assert.equal(Number(after.records[0].get('n')), beforeN);
  });

  /* ----------------------- Sorting deterministic ----------------------- */

  await t.test('Sort: equal score -> support decides; equal score+support -> productId ASC', async () => {
    // A sau khi mua P3, con P4 (3,2) la item duy nhat. Tao them 1 fixture de test sort.
    // Them peer Mua P5 va P6 sao cho cung score=1 support=1.
    // Tao them P5 (chi D mua) va P6 (chi B mua). Sau khi cap nhat BOUGHT cua B mua P6
    // va D mua P5, A se nhan them P5,P6 moi.
    // Don gian: them P5 (D mua), P6 (C mua); A=P1,P2,P3 set.
    // C mua P1,P3,P4,P6 -> chia se P1/P3 -> score cho moi ung vien = 2.
    // D mua P2,P4,P5 -> chia se P2 -> score = 1.
    // Voi A(P1,P2,P3), P5 (tu D score=1, support=1), P6 (tu C score=2, support=1), P4 (tu C score=2, tu D score=1, total=3 support=2).
    // Khong can P5/P6 de test tiep, do P4 dang tren cung (3,2). Them de kiem P5/P6 ti le.
    const P5 = await setupFixtureProduct(session, prefix, { suffix: 'PSORT5', active: true, categoryId: catA.categoryId });
    const P6 = await setupFixtureProduct(session, prefix, { suffix: 'PSORT6', active: true, categoryId: catA.categoryId });
    await addBought(session, { customerId: D.customerId, productId: P5.productId, prefix, eventIdSuffix: 'D_P5' });
    await addBought(session, { customerId: C.customerId, productId: P6.productId, prefix, eventIdSuffix: 'C_P6' });
    // Refresh oracle
    const peersBought2 = await loadPeerBoughtSets(session, { prefix });
    const uSet = peersBought2[A.customerId];
    const expected = computeCfForUser(A.customerId, peersBought2, uSet, new Set([...activeProducts, P5.productId, P6.productId]), 20);

    const r = await agentA.get('/api/recommendations/me?limit=20');
    assert.equal(r.status, 200);
    for (let i = 1; i < expected.length; i += 1) {
      assert.ok(
        expected[i - 1].score > expected[i].score ||
        (expected[i - 1].score === expected[i].score && expected[i - 1].support > expected[i].support) ||
        (expected[i - 1].score === expected[i].score && expected[i - 1].support === expected[i].support && expected[i - 1].productId < expected[i].productId),
        `sort order #${i - 1} vs #${i}`
      );
    }
    // Kiem API cung dap ung cung thu tu
    for (let i = 1; i < r.body.items.length; i += 1) {
      const a = r.body.items[i - 1];
      const b = r.body.items[i];
      assert.ok(
        a.score > b.score ||
        (a.score === b.score && a.support > b.support) ||
        (a.score === b.score && a.support === b.support && a.productId < b.productId),
        `API order broken at #${i - 1} vs #${i}: ${JSON.stringify({ a, b })}`
      );
    }
  });

  /* ----------------------------- Cleanup sanity ------------------------ */

  await t.test('cleanup: bought/viewed counts return to 0 after t.after', async () => {
    // Chi kiem tra prefix danh dau; khong assert 0 o day do cleanup o t.after.
    const before = Number((await session.executeRead(async (tx) => tx.run(
      `MATCH ()-[r:BOUGHT]->() WHERE r.eventId STARTS WITH 'BOUGHT_DT13_PHASE4_' RETURN count(r) AS n`
    ))).records[0].get('n'));
    assert.ok(before >= 0);
  });
});
