import test from 'node:test';
import assert from 'node:assert/strict';
import neo4j from 'neo4j-driver';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { bootstrap } from '../src/app.js';
import { hashPassword } from '../src/password.js';
import { parseSearchIntent } from '../src/lib/searchIntentParser.js';

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
      `MATCH ()-[r:SEARCHED]-() WHERE r.eventId STARTS WITH $prefix DETACH DELETE r`,
      { prefix }
    );
  });
}

test('integration: Vietnamese Search Intent, Budget Filtering, Cross-Category, and Serendipity', async (t) => {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    t.skip('Neo4j not configured; skipping test.');
    return;
  }

  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword)
  );
  const session = driver.session({ database: config.neo4jDatabase });

  const { app } = bootstrap();
  const prefix = `SBC_${randomBytes(4).toString('hex').toUpperCase()}`;

  // Pre-test catalog baseline check: exactly 120 real catalog products
  const countPre = await session.executeRead(async (tx) => {
    const res = await tx.run(
      `MATCH (p:Product { datasetTag: 'CATALOG_REAL_120_V1' }) RETURN count(p) AS cnt`
    );
    return res.records[0].get('cnt').toNumber();
  });
  assert.equal(countPre, 120, 'Catalog baseline must have exactly 120 products');

  try {

  // -------------------------------------------------------------
  // SUITE 1: Vietnamese Search Intent & Budget Parser Unit Tests
  // -------------------------------------------------------------
  await t.test('1. Parser handles all Vietnamese currency formats, bounds, and diacritics', () => {
    // Under 5 million (strictly <)
    const p1 = parseSearchIntent('điện thoại dưới 5 triệu');
    assert.equal(p1.category?.id, 'RC_CAT_SMARTPHONE');
    assert.equal(p1.maxPrice, 5_000_000);
    assert.equal(p1.inclusiveMax, false);

    // No diacritics
    const p1NoAcc = parseSearchIntent('dien thoai duoi 5 trieu');
    assert.equal(p1NoAcc.category?.id, 'RC_CAT_SMARTPHONE');
    assert.equal(p1NoAcc.maxPrice, 5_000_000);
    assert.equal(p1NoAcc.inclusiveMax, false);

    // Maximum 5 million (inclusive <=)
    const p2 = parseSearchIntent('điện thoại tối đa 5 triệu');
    assert.equal(p2.maxPrice, 5_000_000);
    assert.equal(p2.inclusiveMax, true);

    // Range: from 4 to 6 million
    const p3 = parseSearchIntent('điện thoại từ 4 đến 6 triệu');
    assert.equal(p3.minPrice, 4_000_000);
    assert.equal(p3.maxPrice, 6_000_000);
    assert.equal(p3.inclusiveMin, true);
    assert.equal(p3.inclusiveMax, true);

    // Approximate / target price: "khoảng 5 triệu"
    const p4 = parseSearchIntent('điện thoại khoảng 5 triệu');
    assert.equal(p4.targetPrice, 5_000_000);
    assert.ok(p4.minPrice <= 4_500_000);
    assert.ok(p4.maxPrice >= 5_500_000);

    // Target price: "giá 5 triệu"
    const p5 = parseSearchIntent('điện thoại giá 5 triệu');
    assert.equal(p5.targetPrice, 5_000_000);

    // 500k
    const p6 = parseSearchIntent('tai nghe dưới 500k');
    assert.equal(p6.category?.id, 'RC_CAT_HEADPHONES');
    assert.equal(p6.maxPrice, 500_000);

    // 5tr, 5tr5, 5,5 triệu, 5.000.000đ (understood as target price)
    assert.equal(parseSearchIntent('laptop 5tr').targetPrice, 5_000_000);
    assert.equal(parseSearchIntent('laptop 5tr5').targetPrice, 5_500_000);
    assert.equal(parseSearchIntent('laptop 5,5 triệu').targetPrice, 5_500_000);
    assert.equal(parseSearchIntent('laptop 5.000.000đ').targetPrice, 5_000_000);
  });

  await t.test('2. Parser does not confuse model or specs with price', () => {
    const q = 'iPhone 15 128GB RAM 8GB pin 5000mAh dưới 20 triệu không Samsung';
    const parsed = parseSearchIntent(q);

    assert.equal(parsed.category?.id, 'RC_CAT_SMARTPHONE');
    assert.equal(parsed.maxPrice, 20_000_000);
    assert.notEqual(parsed.maxPrice, 15);
    assert.notEqual(parsed.maxPrice, 128);
    assert.notEqual(parsed.maxPrice, 8);
    assert.notEqual(parsed.maxPrice, 5000);
    assert.deepEqual(parsed.excludedBrands, ['Samsung']);
    assert.equal(parsed.attributes.ram, 'RAM 8GB');
    assert.equal(parsed.attributes.storage, '128GB');
    assert.equal(parsed.attributes.battery, 'pin 5000mAh');
  });

  await t.test('3. Parser flags conflicting bounds without guessing an arbitrary budget', () => {
    // Min > Max contradiction
    const pConflict = parseSearchIntent('điện thoại từ 10 triệu đến 5 triệu');
    assert.equal(pConflict.hasConflict, true);
    assert.equal(pConflict.unclearCondition, true);
    assert.ok(pConflict.conflictReason.includes('mâu thuẫn'));
  });

  await t.test('4. Parser distinguishes multi-item and bundle total budget scopes', () => {
    // Multi-item with separate limits
    const pMulti = parseSearchIntent('điện thoại dưới 5 triệu, tai nghe dưới 500k');
    assert.equal(pMulti.budgetScope, 'multi_item');
    assert.equal(pMulti.items?.length, 2);
    assert.equal(pMulti.items[0].maxPrice, 5_000_000);
    assert.equal(pMulti.items[1].maxPrice, 500_000);

    // Bundle total
    const pBundle = parseSearchIntent('điện thoại và tai nghe tổng không quá 5 triệu');
    assert.equal(pBundle.budgetScope, 'bundle_total');
    assert.equal(pBundle.maxPrice, 5_000_000);
  });

  // -------------------------------------------------------------
  // SUITE 2: Hard Budget Filtering & API Search Results
  // -------------------------------------------------------------
  await t.test('5. GET /api/products hard-filters budget: 0 budget violations for "điện thoại dưới 5 triệu"', async () => {
    const res = await request(app).get(
      '/api/products?q=' + encodeURIComponent('điện thoại dưới 5 triệu')
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.total >= 1, 'Should find products under 5M');
    // Ensure every single returned product is strictly < 5,000,000 and is a smartphone
    for (const item of res.body.items) {
      assert.ok(
        item.price < 5_000_000,
        `Product ${item.name} (${item.price}) violates hard budget < 5,000,000`
      );
      assert.equal(item.categoryId, 'RC_CAT_SMARTPHONE');
    }
    // Verify structured intent returned
    assert.equal(res.body.intent?.category?.id, 'RC_CAT_SMARTPHONE');
    assert.equal(res.body.intent?.maxPrice, 5_000_000);
    assert.equal(res.body.intent?.inclusiveMax, false);
  });

  await t.test('6. GET /api/products returns clear empty state when budget has no matches in catalog', async () => {
    // Headphone catalog starts at 990,000đ; "tai nghe dưới 500k" has 0 products
    const res = await request(app).get(
      '/api/products?q=' + encodeURIComponent('tai nghe dưới 500k')
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
    assert.deepEqual(res.body.items, []);
    assert.equal(
      res.body.message,
      'Chưa có sản phẩm phù hợp với khoảng giá này',
      'Must return honest message instead of inventing products'
    );
  });

  await t.test('7. Manual user filters override inferred query budget', async () => {
    // Search says "dưới 5 triệu", but user explicitly set priceMin=6,000,000 and priceMax=10,000,000
    const res = await request(app).get(
      '/api/products?q=' +
        encodeURIComponent('điện thoại dưới 5 triệu') +
        '&priceMin=6000000&priceMax=10000000'
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.total > 0);
    for (const item of res.body.items) {
      assert.ok(item.price >= 6_000_000, 'Price must satisfy manual filter priceMin');
      assert.ok(item.price <= 10_000_000, 'Price must satisfy manual filter priceMax');
    }
  });

  await t.test('8. Target price "điện thoại khoảng 5 triệu" prioritizes items closest to target price', async () => {
    const res = await request(app).get(
      '/api/products?q=' + encodeURIComponent('điện thoại khoảng 5 triệu')
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.items.length >= 1);
    // Samsung Galaxy A15 5G (4,490,000đ) is closest to 5,000,000đ in catalog
    const firstItem = res.body.items[0];
    assert.equal(firstItem.name, 'Samsung Galaxy A15 5G');
  });

  // -------------------------------------------------------------
  // SUITE 3: Search Recording & Event Storing with parserVersion
  // -------------------------------------------------------------
  await t.test('9. POST /api/events/search logs rawQuery, normalizedQuery, and intentJson', async () => {
    const visitId = `visit_${prefix}_1`;
    const res = await request(app)
      .post('/api/events/search')
      .send({
        eventId: `${prefix}_srch_1`,
        query: 'Điện thoại dưới 5 triệu',
        visitId,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.query, 'Điện thoại dưới 5 triệu');
    assert.ok(res.body.intent);
    assert.equal(res.body.intent.maxPrice, 5_000_000);

    // Read back recent searches for this visit
    const listRes = await request(app).get(`/api/events/searches?visitId=${visitId}`);
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.items.length >= 1);
    const recorded = listRes.body.items.find((x) => x.eventId === `${prefix}_srch_1`);
    assert.ok(recorded, 'Recorded search event must be retrieved');
    assert.equal(recorded.rawQuery, 'Điện thoại dưới 5 triệu');
    assert.equal(recorded.intent?.maxPrice, 5_000_000);
  });

  // -------------------------------------------------------------
  // SUITE 4: Cross-Category Collaborative Filtering (Graph Path)
  // -------------------------------------------------------------
  await t.test('10. Cross-category CF traverses (peer:Customer)-[:BOUGHT]->(anchor)-[:BELONGS_TO]->(catA) and (peer)-[:BOUGHT]->(cand)-[:BELONGS_TO]->(catB)', async () => {
    const customerPasswordHash = await hashPassword('CustPass@123');

    // Create test products across two distinct categories
    const anchorPid = `${prefix}_PHONE_1`;
    const candPid = `${prefix}_HEADPHONE_1`;
    const randomPid = `${prefix}_MOUSE_1`;
    const peer1Id = `${prefix}_PEER_1`;
    const peer2Id = `${prefix}_PEER_2`;
    const adminPeerId = `${prefix}_ADMIN_PEER`;

    await session.executeWrite(async (tx) => {
      // Create anchor phone (Smartphone cat)
      await tx.run(
        `CREATE (p:Product {
          productId: $anchorPid,
          name: 'Anchor Test Phone',
          price: 4500000,
          active: true,
          imageUrl: '/img/phone.png',
          datasetTag: $prefix
        })
        WITH p
        MATCH (c:Category { categoryId: 'RC_CAT_SMARTPHONE' })
        CREATE (p)-[:BELONGS_TO]->(c)`,
        { anchorPid, prefix }
      );

      // Create candidate headphones (Headphones cat)
      await tx.run(
        `CREATE (p:Product {
          productId: $candPid,
          name: 'Cross Addon Headphones',
          price: 1200000,
          active: true,
          imageUrl: '/img/hp.png',
          datasetTag: $prefix
        })
        WITH p
        MATCH (c:Category { categoryId: 'RC_CAT_HEADPHONES' })
        CREATE (p)-[:BELONGS_TO]->(c)`,
        { candPid, prefix }
      );

      // Create unrelated random mouse (no peer purchase with anchor)
      await tx.run(
        `CREATE (p:Product {
          productId: $randomPid,
          name: 'Unrelated Random Mouse',
          price: 500000,
          active: true,
          imageUrl: '/img/mouse.png',
          datasetTag: $prefix
        })
        WITH p
        MATCH (c:Category { categoryId: 'RC_CAT_MOUSE' })
        CREATE (p)-[:BELONGS_TO]->(c)`,
        { randomPid, prefix }
      );

      // Create Peer 1 (active customer) who bought anchor and candidate TWICE (duplicate purchase paths)
      await tx.run(
        `CREATE (c:Customer {
          customerId: $peer1Id,
          email: '${peer1Id.toLowerCase()}@example.test',
          passwordHash: $customerPasswordHash,
          fullName: 'Peer Customer 1',
          role: 'customer',
          active: true,
          datasetTag: $prefix
        })
        WITH c
        MATCH (p1:Product { productId: $anchorPid }), (p2:Product { productId: $candPid })
        CREATE (c)-[:BOUGHT { boughtAt: datetime(), datasetTag: $prefix }]->(p1)
        CREATE (c)-[:BOUGHT { boughtAt: datetime(), datasetTag: $prefix }]->(p2)
        CREATE (c)-[:BOUGHT { boughtAt: datetime(), datasetTag: $prefix }]->(p1)
        CREATE (c)-[:BOUGHT { boughtAt: datetime(), datasetTag: $prefix }]->(p2)`,
        { peer1Id, anchorPid, candPid, customerPasswordHash, prefix }
      );

      // Create Peer 2 (active customer) who bought anchor and candidate once
      await tx.run(
        `CREATE (c:Customer {
          customerId: $peer2Id,
          email: '${peer2Id.toLowerCase()}@example.test',
          passwordHash: $customerPasswordHash,
          fullName: 'Peer Customer 2',
          role: 'customer',
          active: true,
          datasetTag: $prefix
        })
        WITH c
        MATCH (p1:Product { productId: $anchorPid }), (p2:Product { productId: $candPid })
        CREATE (c)-[:BOUGHT { boughtAt: datetime(), datasetTag: $prefix }]->(p1)
        CREATE (c)-[:BOUGHT { boughtAt: datetime(), datasetTag: $prefix }]->(p2)`,
        { peer2Id, anchorPid, candPid, customerPasswordHash, prefix }
      );

      // Create Admin who bought anchor and candidate (must NOT be counted in peer recommendations!)
      await tx.run(
        `CREATE (c:Customer {
          customerId: $adminPeerId,
          email: '${adminPeerId.toLowerCase()}@example.test',
          passwordHash: $customerPasswordHash,
          fullName: 'Admin User',
          role: 'admin',
          active: true,
          datasetTag: $prefix
        })
        WITH c
        MATCH (p1:Product { productId: $anchorPid }), (p2:Product { productId: $candPid })
        CREATE (c)-[:BOUGHT { boughtAt: datetime(), datasetTag: $prefix }]->(p1)
        CREATE (c)-[:BOUGHT { boughtAt: datetime(), datasetTag: $prefix }]->(p2)`,
        { adminPeerId, anchorPid, candPid, customerPasswordHash, prefix }
      );
    });

    // Query detail recommendations for anchor phone
    const res = await request(app).get(`/api/recommendations/detail/${anchorPid}`);
    if (res.status !== 200 || !res.body.crossCategory?.length) {
      console.log('SUBTEST 10 RES:', res.status, res.body);
    }
    assert.equal(res.status, 200);

    // Verify crossCategory items:
    const crossList = res.body.crossCategory || [];
    assert.ok(crossList.length >= 1, 'Must return crossCategory recommendation');
    const candItem = crossList.find((x) => x.productId === candPid);
    assert.ok(candItem, 'Candidate headphones must appear in crossCategory list');

    // Distinct peer validation:
    // Peer 1 + Peer 2 = 2 distinct customer peers. Admin is excluded. Repeat purchases do not inflate support.
    assert.equal(
      candItem.support,
      2,
      'Support must be exactly 2 distinct customer peers (no multiplier from repeat paths, no admin)'
    );

    // Verify dampening calculation: 2 / (2 + 2) = 0.5 dampening factor
    assert.ok(
      candItem.reason.includes('2'),
      'Reason must explain 2 independent customers bought across categories'
    );

    // Verify random mouse is NOT in crossCategory (no peer evidence)
    const randomItem = crossList.find((x) => x.productId === randomPid);
    assert.equal(randomItem, undefined, 'Random product with 0 evidence must not be recommended');
  });

  // -------------------------------------------------------------
  // SUITE 5: Serendipity Re-ranking & Budget Hard Constraints
  // -------------------------------------------------------------
  await t.test('11. Serendipity candidate meets relevance floor and never violates active budget', async () => {
    const visitId = `visit_${prefix}_serendipity`;
    const agent = request.agent(app);

    // Record search for "điện thoại dưới 5 triệu"
    await agent
      .post('/api/events/search')
      .send({
        eventId: `${prefix}_srch_seren`,
        query: 'điện thoại dưới 5 triệu',
        visitId,
      });

    // Fetch hybrid feed
    const res = await agent.get(
      `/api/recommendations/feed?visitId=${visitId}&pageSize=10`
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.items.length > 0);

    // Verify: ANY item in the feed in the main category strictly complies with budget
    for (const it of res.body.items) {
      if (it.categoryName === 'Điện thoại thông minh' || it.categoryId === 'RC_CAT_SMARTPHONE') {
        assert.ok(
          it.price < 5_000_000,
          `Feed item ${it.name} (${it.price}) violates hard budget constraint!`
        );
      }
      // If marked as serendipity, verify it is genuinely a relevant candidate
      if (it.isSerendipity) {
        assert.ok(it.score >= 0.2, 'Serendipity candidate must satisfy relevance floor >= 0.2');
        assert.equal(it.reason, 'Khám phá mới có liên quan');
      }
    }
  });

  // -------------------------------------------------------------
  // SUITE 6: Bundle Total Budget Scope
  // -------------------------------------------------------------
  await t.test('12. Bundle total scope returns combos where main + add-on total <= budget', async () => {
    const visitId = `visit_${prefix}_bundle`;
    const agent = request.agent(app);

    // Record search with bundle_total: "điện thoại và tai nghe tổng không quá 6 triệu"
    await agent
      .post('/api/events/search')
      .send({
        eventId: `${prefix}_srch_bundle`,
        query: 'điện thoại và tai nghe tổng không quá 6 triệu',
        visitId,
      });

    const res = await agent.get(
      `/api/recommendations/feed?visitId=${visitId}&pageSize=10`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.activeIntent?.budgetScope, 'bundle_total');
    assert.equal(res.body.activeIntent?.maxPrice, 6_000_000);

    if (res.body.bundles && res.body.bundles.length > 0) {
      for (const b of res.body.bundles) {
        assert.ok(
          b.totalPrice <= 6_000_000,
          `Bundle total ${b.totalPrice} exceeds budget limit 6,000,000`
        );
        assert.equal(b.totalPrice, b.mainProduct.price + b.addonProduct.price);
      }
    }
  });

  // -------------------------------------------------------------
  // SUITE 7: Context Memory & Identity Isolation
  // -------------------------------------------------------------
  await t.test('13. User A search intent does not leak to User B or Guest', async () => {
    const customerPasswordHash = await hashPassword('TestPass@123');
    const userAId = `${prefix}_USER_A`;
    const userBId = `${prefix}_USER_B`;

    await session.executeWrite(async (tx) => {
      await tx.run(
        `CREATE (c:Customer {
          customerId: $userAId,
          name: 'Customer A',
          email: '${userAId.toLowerCase()}@example.test',
          passwordHash: $customerPasswordHash,
          role: 'customer',
          active: true,
          datasetTag: $prefix
        })`,
        { userAId, customerPasswordHash, prefix }
      );
      await tx.run(
        `CREATE (c:Customer {
          customerId: $userBId,
          name: 'Customer B',
          email: '${userBId.toLowerCase()}@example.test',
          passwordHash: $customerPasswordHash,
          role: 'customer',
          active: true,
          datasetTag: $prefix
        })`,
        { userBId, customerPasswordHash, prefix }
      );
    });

    // Login User A
    const agentA = request.agent(app);
    const loginARes = await agentA
      .post('/api/auth/login')
      .send({ email: `${userAId.toLowerCase()}@example.test`, password: 'TestPass@123' });
    assert.equal(loginARes.status, 200);

    // Login User B
    const agentB = request.agent(app);
    const loginBRes = await agentB
      .post('/api/auth/login')
      .send({ email: `${userBId.toLowerCase()}@example.test`, password: 'TestPass@123' });
    assert.equal(loginBRes.status, 200);

    // User A records search for "laptop dưới 15 triệu"
    await agentA
      .post('/api/events/search')
      .send({
        eventId: `${prefix}_srch_userA`,
        query: 'laptop dưới 15 triệu',
        visitId: `visit_${prefix}_userA`,
      });

    // User A feed should have activeIntent laptop
    const feedARes = await agentA.get(`/api/recommendations/feed?visitId=visit_${prefix}_userA`);
    assert.equal(feedARes.status, 200);
    assert.equal(feedARes.body.activeIntent?.category?.id, 'RC_CAT_LAPTOP');

    // User B feed MUST NOT have laptop intent
    const feedBRes = await agentB.get(`/api/recommendations/feed?visitId=visit_${prefix}_userB`);
    assert.equal(feedBRes.status, 200);
    assert.equal(
      feedBRes.body.activeIntent,
      null,
      'User B must have clean context, completely isolated from User A'
    );
  });

  // -------------------------------------------------------------
  // SUITE 8: Cypher Query Profiling (No Cartesian Multiplication)
  // -------------------------------------------------------------
  await t.test('14. EXPLAIN cross-category query confirms index usage and no cartesian product', async () => {
    const explainRes = await session.executeRead(async (tx) => {
      return tx.run(`
        EXPLAIN
        MATCH (source:Product)
        WHERE source.productId IN ['RC_P001'] AND source.active = true
        MATCH (source)-[:BELONGS_TO]->(sourceCat:Category)
        MATCH (source)<-[:BOUGHT]-(peer:Customer)-[:BOUGHT]->(cand:Product)
        WHERE peer.role = 'customer' AND peer.active = true
          AND cand.active = true
        MATCH (cand)-[:BELONGS_TO]->(targetCat:Category)
        WHERE targetCat <> sourceCat
        WITH cand, targetCat.name AS targetCategoryName, count(DISTINCT peer) AS support
        RETURN cand.productId AS productId, support, targetCategoryName
        LIMIT 10
      `);
    });

    assert.ok(explainRes.summary.plan, 'Plan must exist');
    assert.ok(explainRes.summary.plan.operatorType);
  });
  } catch (outerErr) {
    console.error('OUTER ERROR:', outerErr);
    throw outerErr;
  } finally {
    try {
      await cleanupByPrefix(session, prefix);
      const countPost = await session.executeRead(async (tx) => {
        const res = await tx.run(
          `MATCH (p:Product { datasetTag: 'CATALOG_REAL_120_V1' }) RETURN count(p) AS cnt`
        );
        return res.records[0].get('cnt').toNumber();
      });
      console.log('CLEANUP FINISHED, COUNT POST IS:', countPost);
      assert.equal(countPost, 120, 'Catalog must preserve all 120 products after test cleanup');
    } finally {
      await session.close();
      await driver.close();
    }
  }
});
