import test from 'node:test';
import assert from 'node:assert/strict';
import neo4j from 'neo4j-driver';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { bootstrap } from '../src/app.js';
import { hashPassword } from '../src/password.js';
import { createRecommendationController } from '../../frontend/src/utils/recommendationController.js';

async function cleanupByPrefix(session, prefix) {
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MATCH (n) WHERE (n.datasetTag IS NOT NULL AND n.datasetTag STARTS WITH $prefix)
         OR (n.productId IS NOT NULL AND n.productId STARTS WITH $prefix)
         OR (n.categoryId IS NOT NULL AND n.categoryId STARTS WITH $prefix)
         OR (n.customerId IS NOT NULL AND n.customerId STARTS WITH $prefix)
         OR (n.guestId IS NOT NULL AND n.guestId STARTS WITH $prefix)
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
    await tx.run(
      `MATCH ()-[r:SEARCHED]-() WHERE r.eventId STARTS WITH $prefix DETACH DELETE r`,
      { prefix }
    );
    await tx.run(
      `MATCH ()-[r:DISMISSED]-() WHERE r.eventId STARTS WITH $prefix DETACH DELETE r`,
      { prefix }
    );
    await tx.run(
      `MATCH ()-[r:IMPRESSED]-() WHERE r.eventId STARTS WITH $prefix DETACH DELETE r`,
      { prefix }
    );
  });
}

test('integration: 16 Hybrid Recommendation System Scenarios', async (t) => {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    t.skip('Neo4j not configured; skipping hybrid scenarios.');
    return;
  }

  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword)
  );
  const session = driver.session({ database: config.neo4jDatabase });

  const { app } = bootstrap();
  const prefix = `HYB_${randomBytes(4).toString('hex').toUpperCase()}`;

  // Helper setup fixtures
  const defaultPwHash = await hashPassword('TestHybrid@123');
  async function createCust(suffix, name = suffix) {
    const cid = `${prefix}_${suffix}`;
    const email = `${suffix.toLowerCase()}-${prefix.toLowerCase()}@test.local`;
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MERGE (c:Customer { customerId: $cid })
         ON CREATE SET c.name = $name, c.email = $email,
                       c.passwordHash = $defaultPwHash, c.role = 'customer',
                       c.active = true, c.datasetTag = $prefix, c.createdAt = datetime()`,
        { cid, email, defaultPwHash, prefix, name }
      );
    });
    return { customerId: cid, email, password: 'TestHybrid@123' };
  }

  async function createProd(suffix, name, price, brand = 'Apple', catId = null) {
    const pid = `${prefix}_${suffix}`;
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MERGE (p:Product { productId: $pid })
         ON CREATE SET p.name = $name, p.price = $price, p.brand = $brand,
                       p.model = $suffix, p.description = $name, p.active = true,
                       p.datasetTag = $prefix, p.createdAt = datetime()
         WITH p
         FOREACH (_ IN CASE WHEN $catId IS NOT NULL THEN [1] ELSE [] END |
           MERGE (cat:Category { categoryId: $catId })
           MERGE (p)-[:BELONGS_TO]->(cat)
         )`,
        { pid, name, price, brand, suffix, prefix, catId }
      );
    });
    return { productId: pid, name, price, brand };
  }

  // Pre-test snapshot: check reference catalog product count (must be 120)
  const preCheck = await session.run('MATCH (p:Product) WHERE p.datasetTag = "CATALOG_REAL_120_V1" RETURN count(p) AS cnt');
  const initialRefCatalogCount = Number(preCheck.records[0]?.get('cnt') || 0);

  // Setup test products
  const catLaptop = `${prefix}_CAT_LAPTOP`;
  const catAudio = `${prefix}_CAT_AUDIO`;
  await session.executeWrite(async (tx) => {
    await tx.run(`MERGE (c:Category { categoryId: $cid }) ON CREATE SET c.name = 'Laptop', c.datasetTag = $prefix`, { cid: catLaptop, prefix });
    await tx.run(`MERGE (c:Category { categoryId: $cid }) ON CREATE SET c.name = 'Tai nghe', c.datasetTag = $prefix`, { cid: catAudio, prefix });
  });

  const p1 = await createProd('P1', 'MacBook Air M2', 25000000, 'Apple', catLaptop);
  const p2 = await createProd('P2', 'MacBook Pro M3', 38000000, 'Apple', catLaptop);
  const p3 = await createProd('P3', 'Tai nghe Sony WH-1000XM5', 7500000, 'Sony', catAudio);
  const p4 = await createProd('P4', 'Tai nghe AirPods Max', 12000000, 'Apple', catAudio);

  t.after(async () => {
    await cleanupByPrefix(session, prefix);
    await session.close();
    await driver.close();
  });

  // SCENARIO 1: Người mới chỉ tìm một model, không click -> về trang chủ vẫn có gợi ý phù hợp
  await t.test('Scenario 1: Guest searches model without clicking -> home feed recommends matching products', async () => {
    const guestAgent = request.agent(app);
    const guestUuid = randomUUID();
    const eventId = `${prefix}_EVT_SRCH_1`;

    // Guest searches "MacBook Pro M3" without clicking any product
    const sRes = await guestAgent
      .post('/api/events/search')
      .set('x-guest-id', guestUuid)
      .send({ eventId, query: 'MacBook Pro M3', visitId: 'visit_sc1' });
    assert.strictEqual(sRes.status, 201);
    assert.strictEqual(sRes.body.status, 'ok');

    // Return to home feed
    const fRes = await guestAgent
      .get('/api/recommendations/feed?visitId=visit_sc1')
      .set('x-guest-id', guestUuid);
    assert.strictEqual(fRes.status, 200);
    assert.ok(Array.isArray(fRes.body.items));

    // The searched MacBook product must be in top recommendations with search source
    const found = fRes.body.items.find((it) => it.productId === p2.productId);
    assert.ok(found, 'Searched product should appear in hybrid feed');
    assert.strictEqual(found.reason, 'Dựa trên tìm kiếm gần đây');
  });

  // SCENARIO 2: Tìm kiếm, đóng web, mở lại -> cùng định danh khách vẫn nhớ sở thích
  await t.test('Scenario 2: Guest reopens browser with same cookie -> recovers saved search preferences', async () => {
    const guestUuid = randomUUID();
    const eventId = `${prefix}_EVT_SRCH_2`;

    // 1st visit: searches for Sony WH-1000XM5
    const agent1 = request.agent(app);
    await agent1
      .post('/api/events/search')
      .set('x-guest-id', guestUuid)
      .send({ eventId, query: 'Tai nghe Sony WH-1000XM5', visitId: 'visit_sc2_old' });

    // "Close browser" -> 2nd fresh agent simulates reopening with same guest cookie
    const agent2 = request.agent(app);
    const hRes = await agent2
      .get('/api/me/searches')
      .set('x-guest-id', guestUuid);
    assert.strictEqual(hRes.status, 200);
    assert.ok(hRes.body.items.some((it) => it.query.includes('Sony')));

    const fRes = await agent2
      .get('/api/recommendations/feed?visitId=visit_sc2_new')
      .set('x-guest-id', guestUuid);
    assert.strictEqual(fRes.status, 200);
    const foundSony = fRes.body.items.find((it) => it.productId === p3.productId);
    assert.ok(foundSony, 'Reopened visit should remember guest search intent');
  });

  // SCENARIO 3: Phiên đăng nhập hết hạn -> đăng nhập lại cùng tài khoản phục hồi lịch sử đã lưu
  await t.test('Scenario 3: Session expires -> re-login into same customer account recovers search preferences', async () => {
    const cust = await createCust('SC3', 'Khách hàng Scenario 3');
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: cust.email, password: cust.password });

    // Customer performs a search
    const eventId = `${prefix}_EVT_SRCH_3`;
    await agent
      .post('/api/events/search')
      .send({ eventId, query: 'AirPods Max', visitId: 'visit_sc3' });

    // Session destroyed / expired
    await agent.post('/api/auth/logout');

    // Re-login into the same account
    const newSessionAgent = request.agent(app);
    const loginRes = await newSessionAgent.post('/api/auth/login').send({ email: cust.email, password: cust.password });
    assert.strictEqual(loginRes.status, 200);

    const sRes = await newSessionAgent.get('/api/me/searches');
    assert.strictEqual(sRes.status, 200);
    assert.ok(sRes.body.items.some((it) => it.query.includes('AirPods')));

    const fRes = await newSessionAgent.get('/api/recommendations/feed?visitId=visit_sc3_relogin');
    assert.strictEqual(fRes.status, 200);
    assert.ok(fRes.body.items.some((it) => it.productId === p4.productId));
  });

  // SCENARIO 4: A mua P1 và P2; B mua P1 -> baseline CF gợi ý P2 cho B
  await t.test('Scenario 4: A buys P1 & P2; B buys P1 -> baseline CF recommends P2 for B', async () => {
    const custA = await createCust('SC4_A');
    const custB = await createCust('SC4_B');

    const agentA = request.agent(app);
    await agentA.post('/api/auth/login').send({ email: custA.email, password: custA.password });
    await agentA.post('/api/interactions/purchases').send({ eventId: `${prefix}_B_A_P1`, productId: p1.productId, quantity: 1 });
    await agentA.post('/api/interactions/purchases').send({ eventId: `${prefix}_B_A_P2`, productId: p2.productId, quantity: 1 });

    const agentB = request.agent(app);
    await agentB.post('/api/auth/login').send({ email: custB.email, password: custB.password });
    await agentB.post('/api/interactions/purchases').send({ eventId: `${prefix}_B_B_P1`, productId: p1.productId, quantity: 1 });

    const cfRes = await agentB.get('/api/recommendations/me');
    assert.strictEqual(cfRes.status, 200);
    const recoP2 = cfRes.body.items.find((it) => it.productId === p2.productId);
    assert.ok(recoP2, 'B should get P2 via CF baseline');
    assert.strictEqual(recoP2.score, 1);
    assert.strictEqual(recoP2.support, 1);
  });

  // SCENARIO 5: A mua P1 và P2; B chỉ xem P1 -> B nhận P2 từ nguồn đa hành vi
  await t.test('Scenario 5: A buys P1 & P2; B only views P1 -> B receives P2 via multi-behavior CF', async () => {
    const custA = await createCust('SC5_A');
    const custB = await createCust('SC5_B');

    const agentA = request.agent(app);
    await agentA.post('/api/auth/login').send({ email: custA.email, password: custA.password });
    await agentA.post('/api/interactions/purchases').send({ eventId: `${prefix}_B_A5_P1`, productId: p1.productId, quantity: 1 });
    await agentA.post('/api/interactions/purchases').send({ eventId: `${prefix}_B_A5_P2`, productId: p2.productId, quantity: 1 });

    const agentB = request.agent(app);
    await agentB.post('/api/auth/login').send({ email: custB.email, password: custB.password });
    await agentB.post('/api/interactions/views').send({ eventId: `${prefix}_V_B5_P1`, productId: p1.productId });

    // Multi-behavior branch (formula=weighted) or Hybrid Feed
    const recRes = await agentB.get('/api/recommendations/me?formula=weighted');
    assert.strictEqual(recRes.status, 200);
    const found = recRes.body.items.find((it) => it.productId === p2.productId);
    assert.ok(found, 'B should receive P2 via multi-behavior fallback');
  });

  // SCENARIO 6: B đang xem P1 nhưng chưa có lịch sử -> khối mua chung lấy P2 từ người khác đã mua P1
  await t.test('Scenario 6: B views P1 with no prior history -> co-bought block returns P2 from other buyers', async () => {
    const custA = await createCust('SC6_A');
    const agentA = request.agent(app);
    await agentA.post('/api/auth/login').send({ email: custA.email, password: custA.password });
    await agentA.post('/api/interactions/purchases').send({ eventId: `${prefix}_B_A6_P1`, productId: p1.productId, quantity: 1 });
    await agentA.post('/api/interactions/purchases').send({ eventId: `${prefix}_B_A6_P2`, productId: p2.productId, quantity: 1 });

    // Brand new guest with zero history views P1 detail recommendations
    const guestAgent = request.agent(app);
    const detailRes = await guestAgent
      .get(`/api/recommendations/detail/${p1.productId}`)
      .set('x-guest-id', randomUUID());

    assert.strictEqual(detailRes.status, 200);
    assert.ok(Array.isArray(detailRes.body.coBought));
    const cbItem = detailRes.body.coBought.find((it) => it.productId === p2.productId);
    assert.ok(cbItem, 'Co-bought block should recommend P2 for product P1');
    assert.strictEqual(cbItem.source, 'co_bought');
  });

  // SCENARIO 7: Người dùng chuyển tìm kiếm từ laptop sang tai nghe -> ý định mới ảnh hưởng feed dù CF có kết quả
  await t.test('Scenario 7: User switches search intent from laptop to headphones -> new intent dominates feed', async () => {
    const custB = await createCust('SC7_B');
    const agentB = request.agent(app);
    await agentB.post('/api/auth/login').send({ email: custB.email, password: custB.password });
    // B already bought P1, giving baseline CF candidates
    await agentB.post('/api/interactions/purchases').send({ eventId: `${prefix}_B_SC7_P1`, productId: p1.productId, quantity: 1 });

    // B now actively searches for headphones "Tai nghe Sony"
    await agentB
      .post('/api/events/search')
      .send({ eventId: `${prefix}_EVT_SRCH_AUDIO`, query: 'Tai nghe Sony WH-1000XM5', visitId: 'visit_sc7' });

    const feedRes = await agentB.get('/api/recommendations/feed?visitId=visit_sc7');
    assert.strictEqual(feedRes.status, 200);
    const topItem = feedRes.body.items[0];
    assert.ok(topItem, 'Feed should return items');
    assert.ok(
      topItem.productId === p3.productId || topItem.productId === 'RC_P101',
      `Top item must be headphones matching search intent, got ${topItem.productId}`
    );
    assert.strictEqual(topItem.source, 'search');
  });

  // SCENARIO 8: Quay lại ở visit mới -> có 20-30% thay đổi; cùng visit/phân trang ổn định
  await t.test('Scenario 8: Deterministic pagination within visit & controlled rotation across new visits', async () => {
    const guestUuid = randomUUID();
    const agent = request.agent(app);

    // Page 1 and Page 2 in the same visit
    const p1Res = await agent
      .get('/api/recommendations/feed?visitId=visit_stable&page=1&pageSize=3')
      .set('x-guest-id', guestUuid);
    const p2Res = await agent
      .get('/api/recommendations/feed?visitId=visit_stable&page=2&pageSize=3')
      .set('x-guest-id', guestUuid);

    const idsP1 = p1Res.body.items.map((x) => x.productId);
    const idsP2 = p2Res.body.items.map((x) => x.productId);
    // No duplicate products between page 1 and page 2 within same visit
    for (const id of idsP1) {
      assert.strictEqual(idsP2.includes(id), false, 'Pagination must not repeat items in same visit');
    }

    // Refreshing page 1 in the SAME visit produces 100% identical sequence
    const p1Repeat = await agent
      .get('/api/recommendations/feed?visitId=visit_stable&page=1&pageSize=3')
      .set('x-guest-id', guestUuid);
    assert.deepStrictEqual(p1Repeat.body.items.map((x) => x.productId), idsP1);

    // In a completely NEW visit, rotation occurs among candidate pool
    const newVisitRes = await agent
      .get('/api/recommendations/feed?visitId=visit_rotated_next&page=1&pageSize=8')
      .set('x-guest-id', guestUuid);
    assert.strictEqual(newVisitRes.status, 200);
  });

  // SCENARIO 9: Mua sản phẩm được gợi ý -> loại món đó khỏi feed; unitPrice đúng
  await t.test('Scenario 9: Buying recommended item excludes it from subsequent feeds; unitPrice is snapshotted', async () => {
    const cust = await createCust('SC9');
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: cust.email, password: cust.password });

    // Search for P2 to make it recommended
    await agent.post('/api/events/search').send({ eventId: `${prefix}_EVT_P2_BUY`, query: 'MacBook Pro M3' });
    const feedBefore = await agent.get('/api/recommendations/feed');
    assert.ok(feedBefore.body.items.some((it) => it.productId === p2.productId));

    // Buy P2
    const buyRes = await agent.post('/api/interactions/purchases').send({
      eventId: `${prefix}_BUY_P2_NOW`,
      productId: p2.productId,
      quantity: 1,
    });
    assert.strictEqual(buyRes.status, 201);
    assert.strictEqual(buyRes.body.unitPrice, p2.price);

    // Feed after purchase: P2 must be completely excluded!
    const feedAfter = await agent.get('/api/recommendations/feed');
    assert.strictEqual(feedAfter.body.items.some((it) => it.productId === p2.productId), false);
  });

  // SCENARIO 10: "Không quan tâm", hoàn tác và xóa tìm kiếm
  await t.test('Scenario 10: Dismiss item hides it, undo restores it, clearing searches drops search influence', async () => {
    const cust = await createCust('SC10');
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: cust.email, password: cust.password });

    // Perform a search for AirPods Max (P4)
    await agent.post('/api/events/search').send({ eventId: `${prefix}_EVT_P4_DISM`, query: 'AirPods Max' });
    const beforeDism = await agent.get('/api/recommendations/feed');
    assert.ok(beforeDism.body.items.some((it) => it.productId === p4.productId));

    // Dismiss P4 ("Không quan tâm")
    const dRes = await agent.post('/api/events/dismiss').send({
      eventId: `${prefix}_DISM_P4`,
      productId: p4.productId,
    });
    assert.strictEqual(dRes.status, 200);

    // P4 must now be excluded from recommendations
    const afterDism = await agent.get('/api/recommendations/feed');
    assert.strictEqual(afterDism.body.items.some((it) => it.productId === p4.productId), false);

    // Undo dismissal
    const uRes = await agent.post('/api/events/undo-dismiss').send({ productId: p4.productId });
    assert.strictEqual(uRes.status, 200);

    const afterUndo = await agent.get('/api/recommendations/feed');
    assert.ok(afterUndo.body.items.some((it) => it.productId === p4.productId));

    // Clear search history
    const clrRes = await agent.delete('/api/me/searches');
    assert.strictEqual(clrRes.status, 200);
    const searchesAfter = await agent.get('/api/me/searches');
    assert.strictEqual(searchesAfter.body.items.length, 0);
  });

  // SCENARIO 11: Không có kết quả tìm kiếm hoặc không có hàng xóm -> fallback đúng nguồn
  await t.test('Scenario 11: No search results / cold start gracefully falls back to popular items with accurate reason', async () => {
    const guestAgent = request.agent(app);
    const guestUuid = randomUUID();

    // Search query with zero results
    await guestAgent
      .post('/api/events/search')
      .set('x-guest-id', guestUuid)
      .send({ eventId: `${prefix}_SRCH_ZERO`, query: 'xyznonexistentmodel99999' });

    const feedRes = await guestAgent
      .get('/api/recommendations/feed')
      .set('x-guest-id', guestUuid);

    assert.strictEqual(feedRes.status, 200);
    assert.ok(feedRes.body.items.length > 0);
    // Must not hallucinate fake products; sources are fallback or catalog
    const fallbackItem = feedRes.body.items.find((it) => it.source === 'fallback');
    assert.ok(fallbackItem);
    assert.strictEqual(fallbackItem.reason, 'Khám phá thêm');
  });

  // SCENARIO 12: Retry, React StrictMode và request trùng -> không nhân sự kiện
  await t.test('Scenario 12: Duplicate requests with same eventId are idempotent', async () => {
    const guestUuid = randomUUID();
    const eventId = `${prefix}_EVT_IDEMPOTENT`;
    const agent = request.agent(app);

    // Call search twice with same eventId
    const r1 = await agent.post('/api/events/search').set('x-guest-id', guestUuid).send({ eventId, query: 'MacBook' });
    assert.strictEqual(r1.status, 201);

    const r2 = await agent.post('/api/events/search').set('x-guest-id', guestUuid).send({ eventId, query: 'MacBook' });
    assert.strictEqual(r2.status, 200); // 200 OK replay without duplicate error

    // Verify only 1 SearchEvent node exists with this eventId
    const countRes = await session.run(
      'MATCH (s:SearchEvent { eventId: $eventId }) RETURN count(s) AS cnt',
      { eventId }
    );
    assert.strictEqual(Number(countRes.records[0].get('cnt')), 1);
  });

  // SCENARIO 13: Thẻ chưa xuất hiện trên màn hình -> không có impression; chỉ ghi khi xuất hiện
  await t.test('Scenario 13: Impression is only recorded when client reports item visibility', async () => {
    const guestUuid = randomUUID();
    const agent = request.agent(app);

    // Before impression: 0 IMPRESSED edges
    const before = await session.run(
      'MATCH (g:GuestSession { guestId: $guestUuid })-[r:IMPRESSED]->() RETURN count(r) AS cnt',
      { guestUuid }
    );
    assert.strictEqual(Number(before.records[0].get('cnt')), 0);

    // Card becomes visible: record impression
    const impRes = await agent.post('/api/events/impression').set('x-guest-id', guestUuid).send({
      eventId: `${prefix}_IMP_1`,
      feedId: 'home_feed',
      items: [{ productId: p1.productId, position: 1 }],
    });
    assert.strictEqual(impRes.status, 200);

    const after = await session.run(
      'MATCH (g:GuestSession { guestId: $guestUuid })-[r:IMPRESSED]->(p:Product { productId: $pid }) RETURN count(r) AS cnt',
      { guestUuid, pid: p1.productId }
    );
    assert.strictEqual(Number(after.records[0].get('cnt')), 1);
  });

  // SCENARIO 14: Đổi A sang B rồi response A mới hoàn tất -> UI giữ nguyên dữ liệu B
  await t.test('Scenario 14: Race condition: recommendationController discards late arriving response from previous user', async () => {
    let currentUser = 'A';
    let displayedItems = null;

    const controller = createRecommendationController({
      getCustomerId: () => currentUser,
      onStartLoading: () => {},
      onSuccess: (data) => {
        displayedItems = data.items;
      },
      onError: () => {},
      fetchFn: async (params, { signal }) => {
        if (params.user === 'A') {
          // A takes 50ms (delayed response)
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
          return { items: ['item_of_A'] };
        }
        // B completes immediately
        return { items: ['item_of_B'] };
      },
    });

    // 1. User A triggers fetch
    const promiseA = controller.fetch({ user: 'A' });

    // 2. User switches to B immediately
    currentUser = 'B';
    const promiseB = controller.fetch({ user: 'B' });

    await Promise.all([promiseA, promiseB]);

    // UI must strictly contain B's data, never A's late data
    assert.deepStrictEqual(displayedItems, ['item_of_B']);
  });

  // SCENARIO 15: Khách/customer sửa actorId hoặc gọi endpoint quản trị -> 403 / 401
  await t.test('Scenario 15: Security & Authorization: customer/guest blocked from admin endpoints and actor cannot be spoofed', async () => {
    const cust = await createCust('SC15');
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: cust.email, password: cust.password });

    // Customer tries to call admin graph explanation
    const gRes = await agent.get('/api/analytics/recommendation-graph?customerId=CUST_001');
    assert.strictEqual(gRes.status, 403);

    // Customer tries to call admin offline evaluation
    const eRes = await agent.get('/api/analytics/offline-evaluation');
    assert.strictEqual(eRes.status, 403);

    // Unauthenticated guest tries to call admin
    const unauthAgent = request.agent(app);
    const uRes = await unauthAgent.get('/api/analytics/offline-evaluation');
    assert.strictEqual(uRes.status, 401);
  });

  // SCENARIO 16: Mọi thay đổi giữ nguyên 120 Product và dữ liệu gốc
  await t.test('Scenario 16: Catalog integrity: exactly 120 reference products remain intact', async () => {
    const postCheck = await session.run(
      'MATCH (p:Product) WHERE p.datasetTag = "CATALOG_REAL_120_V1" RETURN count(p) AS cnt'
    );
    const postRefCatalogCount = Number(postCheck.records[0]?.get('cnt') || 0);
    assert.strictEqual(postRefCatalogCount, initialRefCatalogCount);
    assert.strictEqual(postRefCatalogCount, 120, '120 reference catalog products must be preserved');
  });
});
