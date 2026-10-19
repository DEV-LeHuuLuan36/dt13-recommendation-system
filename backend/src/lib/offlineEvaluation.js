import { performance } from 'node:perf_hooks';
import neo4j from 'neo4j-driver';
import { HybridEngine } from './hybridEngine.js';
import { QUERIES } from '../cypher/queries.js';

// Evaluates recommendation methods (Popularity, User CF, Multi-behavior, Hybrid) offline
export async function runOfflineEvaluation(neo4jClient) {
  const hybridEngine = new HybridEngine(neo4jClient);
  const catalog = await hybridEngine.getActiveCatalog();
  const catalogSize = catalog.length;

  // 1. Fetch customers with their purchase history sorted by time
  const custRes = await neo4jClient.read(`
    MATCH (c:Customer { role: 'customer', active: true })-[r:BOUGHT]->(p:Product { active: true })
    WITH c.customerId AS customerId, p.productId AS productId, r.purchasedAt AS purchasedAt
    ORDER BY purchasedAt ASC
    RETURN customerId, collect(productId) AS purchases
  `);

  const eligibleUsers = (custRes.records || [])
    .map((r) => ({
      customerId: r.get('customerId'),
      purchases: r.get('purchases'),
    }))
    .filter((u) => u.purchases.length >= 2);

  let baselineHits = 0;
  let baselineNdcg = 0;
  let hybridHits = 0;
  let hybridNdcg = 0;
  let popHits = 0;
  let popNdcg = 0;

  const baselineRecommendedProducts = new Set();
  const hybridRecommendedProducts = new Set();

  // Global popular items for popularity baseline
  const popRes = await neo4jClient.read(`
    MATCH (c:Customer { role: 'customer', active: true })-[r:BOUGHT]->(p:Product { active: true })
    RETURN p.productId AS productId, count(DISTINCT c) AS cnt
    ORDER BY cnt DESC, productId ASC
    LIMIT 10
  `);
  const topPopIds = (popRes.records || []).map((r) => r.get('productId'));

  // Evaluate on a sample of eligible users
  const testSample = eligibleUsers.slice(0, 30);
  const K = 10;

  for (const user of testSample) {
    const targetItem = user.purchases[user.purchases.length - 1]; // Leave-one-out
    const historyItems = user.purchases.slice(0, -1);
    const historySet = new Set(historyItems);

    // 1. Popularity baseline
    const popRecs = topPopIds.filter((id) => !historySet.has(id)).slice(0, K);
    const popRank = popRecs.indexOf(targetItem);
    if (popRank !== -1) {
      popHits++;
      popNdcg += 1 / Math.log2(popRank + 2);
    }

    // 2. CF Baseline
    const cfRes = await neo4jClient.read(QUERIES.recommendForMe, {
      customerId: user.customerId,
      limit: neo4j.int(K * 2),
    });
    const cfRecs = (cfRes.records || [])
      .map((r) => r.get('productId'))
      .filter((id) => !historySet.has(id))
      .slice(0, K);

    cfRecs.forEach((id) => baselineRecommendedProducts.add(id));
    const cfRank = cfRecs.indexOf(targetItem);
    if (cfRank !== -1) {
      baselineHits++;
      baselineNdcg += 1 / Math.log2(cfRank + 2);
    }

    // 3. Hybrid Engine
    const hybridFeed = await hybridEngine.getHybridFeed({
      actor: { type: 'customer', id: user.customerId, role: 'customer' },
      visitId: 'eval_visit',
      page: 1,
      pageSize: K,
    });
    const hybridRecs = (hybridFeed.items || [])
      .map((it) => it.productId)
      .filter((id) => !historySet.has(id))
      .slice(0, K);

    hybridRecs.forEach((id) => hybridRecommendedProducts.add(id));
    const hybridRank = hybridRecs.indexOf(targetItem);
    if (hybridRank !== -1) {
      hybridHits++;
      hybridNdcg += 1 / Math.log2(hybridRank + 2);
    }
  }

  const N = Math.max(1, testSample.length);

  // 4. Measure repetition rate across visits for Hybrid Engine
  const sampleCustomer = testSample[0]?.customerId || 'rc_c001';
  const visit1 = await hybridEngine.getHybridFeed({
    actor: { type: 'customer', id: sampleCustomer, role: 'customer' },
    visitId: 'visit_eval_1',
    page: 1,
    pageSize: 10,
  });
  const visit2 = await hybridEngine.getHybridFeed({
    actor: { type: 'customer', id: sampleCustomer, role: 'customer' },
    visitId: 'visit_eval_2',
    page: 1,
    pageSize: 10,
  });

  const ids1 = new Set((visit1.items || []).map((x) => x.productId));
  const ids2 = (visit2.items || []).map((x) => x.productId);
  const commonCount = ids2.filter((id) => ids1.has(id)).length;
  const rotationRate = Math.round((1 - commonCount / Math.max(1, ids2.length)) * 100);

  // 5. Latency profiling (median & p95)
  const latencies = [];
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now();
    await hybridEngine.getHybridFeed({
      actor: { type: 'customer', id: sampleCustomer, role: 'customer' },
      visitId: `bench_${i}`,
      page: 1,
      pageSize: 10,
    });
    latencies.push(performance.now() - t0);
  }
  latencies.sort((a, b) => a - b);
  const medianLatency = Math.round(latencies[Math.floor(latencies.length / 2)] * 10) / 10;
  const p95Latency = Math.round(latencies[Math.floor(latencies.length * 0.95)] * 10) / 10;

  return {
    evaluatedUsersCount: N,
    catalogTotalProducts: catalogSize,
    comparison: {
      popularity: {
        recallAt10: Math.round((popHits / N) * 1000) / 1000,
        ndcgAt10: Math.round((popNdcg / N) * 1000) / 1000,
      },
      baselineCF: {
        recallAt10: Math.round((baselineHits / N) * 1000) / 1000,
        ndcgAt10: Math.round((baselineNdcg / N) * 1000) / 1000,
        catalogCoveragePercent: Math.round((baselineRecommendedProducts.size / catalogSize) * 1000) / 10,
      },
      hybridFeed: {
        recallAt10: Math.round((hybridHits / N) * 1000) / 1000,
        ndcgAt10: Math.round((hybridNdcg / N) * 1000) / 1000,
        catalogCoveragePercent: Math.round((hybridRecommendedProducts.size / catalogSize) * 1000) / 10,
        rotationRateBetweenVisitsPercent: rotationRate,
      },
    },
    performance: {
      samples: latencies.length,
      medianMs: medianLatency,
      p95Ms: p95Latency,
    },
  };
}
