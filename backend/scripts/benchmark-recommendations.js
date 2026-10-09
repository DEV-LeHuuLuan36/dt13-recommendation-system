#!/usr/bin/env node
/**
 * `npm run benchmark:recommendations` — read-only, repeatable benchmark for
 * the recommendation queries. Each case: 3 warm-up + 15 measured runs using
 * performance.now(). P95 uses nearest-rank. No PROFILE; no graph writes.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';
import { loadConfig } from '../src/config.js';
import { QUERIES } from '../src/cypher/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'performance');
const OUT_FILE = path.join(OUT_DIR, 'phase5-benchmark.json');

const WARMUP = 3;
const MEASURE = 15;

const EXIT_OK = 0;
const EXIT_FAIL = 1;

function log(msg) { console.log(`[benchmark:recommendations] ${msg}`); }
function logErr(msg) { console.error(`[benchmark:recommendations] ${msg}`); }

function intParam(n) {
  return neo4j.int(n);
}

function fingerprint(cypher) {
  return cypher.replace(/\s+/g, ' ').trim();
}

function toNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') {
    try { return v.toNumber(); } catch { return Number(v); }
  }
  return Number(v);
}

/**
 * Chon ca tu CSDL:
 *  - user_cf_dense: customer CUST_001 (nhom A) co sharedCount cao.
 *  - user_cf_sparse: customer CUST_006 (nhom 6..55) co it peer.
 *  - user_cf_cold: customer CUST_005 khong mua hang nao (cold start).
 *  - co_bought_popular: product co max buyers.
 *  - co_bought_niche: product co min buyers (>=1).
 *  - co_bought_zero: mot product khong co buyer nao (null/empty).
 */
async function pickCases(session) {
  const cbPop = await session.executeRead(async (tx) => tx.run(`
      MATCH (p:Product { active: true })<-[:BOUGHT]-(c:Customer)
      WHERE c.role = 'customer' AND c.active = true
      WITH p, count(DISTINCT c) AS buyers
      ORDER BY buyers DESC
      LIMIT 1
      RETURN p.productId AS id, buyers
    `));
  const cbPopId = cbPop.records[0]?.get('id') || 'PROD_001';

  const cbNiche = await session.executeRead(async (tx) => tx.run(`
      MATCH (p:Product { active: true })<-[:BOUGHT]-(c:Customer)
      WHERE c.role = 'customer' AND c.active = true
      WITH p, count(DISTINCT c) AS buyers
      WHERE buyers >= 1
      ORDER BY buyers ASC
      LIMIT 1
      RETURN p.productId AS id, buyers
    `));
  const cbNicheId = cbNiche.records[0]?.get('id') || cbPopId;

  const cases = [
    { key: 'user_cf_dense', mode: 'user_cf', customerId: 'CUST_001', productId: null, label: 'CUST_001 (Group A, nhieu peer)' },
    { key: 'user_cf_sparse', mode: 'user_cf', customerId: 'CUST_006', productId: null, label: 'CUST_006 (Group 6..55)' },
    { key: 'user_cf_cold', mode: 'user_cf', customerId: 'CUST_005', productId: null, label: 'CUST_005 (cold start, B empty)' },
    { key: 'co_bought_popular', mode: 'co_bought', customerId: 'CUST_006', productId: cbPopId, label: `product ${cbPopId} (popular)` },
    { key: 'co_bought_niche', mode: 'co_bought', customerId: 'CUST_006', productId: cbNicheId, label: `product ${cbNicheId} (niche)` },
  ];

  // co_bought_zero: product active khong co ai mua.
  const cbZero = await session.executeRead(async (tx) => tx.run(`
      MATCH (p:Product { active: true })
      WHERE NOT (p)<-[:BOUGHT]-(:Customer { role: 'customer', active: true })
      WITH p, rand() AS r
      ORDER BY r ASC
      LIMIT 1
      RETURN p.productId AS id
    `));
  const cbZeroId = cbZero.records[0]?.get('id') || null;
  if (cbZeroId) {
    cases.push({
      key: 'co_bought_zero',
      mode: 'co_bought',
      customerId: 'CUST_006',
      productId: cbZeroId,
      label: `product ${cbZeroId} (khong co buyer nao)`,
    });
  }

  return cases;
}

function paramsFor({ mode, customerId, productId }) {
  if (mode === 'user_cf') return { customerId, limit: intParam(5) };
  return { customerId, productId, limit: intParam(5) };
}

function pickQuery({ mode }) {
  return mode === 'user_cf' ? QUERIES.recommendForMe : QUERIES.recommendForProduct;
}

function summaryStats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = sorted[Math.floor(n / 2)];
  // p95 theo nearest-rank: ceil(0.95 * n) - 1, index base 0.
  const p95Idx = Math.min(n - 1, Math.max(0, Math.ceil(0.95 * n) - 1));
  const p95 = sorted[p95Idx];
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  return { n, min, median, p95, max, mean };
}

async function runOneCase(session, c) {
  const cypher = pickQuery(c);
  const params = paramsFor(c);
  const fp = fingerprint(cypher);
  // Warm-up
  for (let i = 0; i < WARMUP; i += 1) {
    await session.executeRead(async (tx) => tx.run(cypher, params));
  }
  // Measure
  const clientMs = [];
  /** @type {{availableAfter: number|null, consumedAfter: number|null}[]} */
  const serverTimings = [];
  let resultCount = 0;
  for (let i = 0; i < MEASURE; i += 1) {
    const t0 = performance.now();
    const res = await session.executeRead(async (tx) => tx.run(cypher, params));
    const t1 = performance.now();
    clientMs.push(t1 - t0);
    const summary = res.summary || {};
    serverTimings.push({
      availableAfter: toNumber(summary.resultAvailableAfter),
      consumedAfter: toNumber(summary.resultConsumedAfter),
    });
    if (i === 0) resultCount = res.records.length;
  }
  const summary = summaryStats(clientMs);
  return {
    key: c.key,
    label: c.label,
    mode: c.mode,
    customerId: c.customerId,
    productId: c.productId,
    fingerprint: fp,
    parameters: { ...params, customerId: c.customerId, productId: c.productId },
    warmup: WARMUP,
    measure: MEASURE,
    resultCount,
    clientMs: summary,
    samplesClientMs: clientMs,
    serverTimings: {
      availableAfter: summaryStats(serverTimings.map((s) => s.availableAfter ?? 0).filter((v) => v != null)),
      consumedAfter: summaryStats(serverTimings.map((s) => s.consumedAfter ?? 0).filter((v) => v != null)),
    },
  };
}

async function fetchSnapshot(session) {
  const res = await session.executeRead(async (tx) => tx.run(`
      MATCH (n) RETURN count(n) AS nodes
    `));
  const nodes = toNumber(res.records[0]?.get('nodes')) || 0;
  const rels = await session.executeRead(async (tx) => tx.run(`
      MATCH ()-[r]->() RETURN count(r) AS rels
    `));
  const relCount = toNumber(rels.records[0]?.get('rels')) || 0;
  const counts = await session.executeRead(async (tx) => tx.run(`
      MATCH (c:Customer) RETURN count(c) AS customers
    `));
  const customers = toNumber(counts.records[0]?.get('customers')) || 0;
  const prods = await session.executeRead(async (tx) => tx.run(`
      MATCH (p:Product) RETURN count(p) AS products
    `));
  const products = toNumber(prods.records[0]?.get('products')) || 0;
  const bought = await session.executeRead(async (tx) => tx.run(`
      MATCH ()-[r:BOUGHT]->() RETURN count(r) AS r
    `));
  const boughtN = toNumber(bought.records[0]?.get('r')) || 0;
  const viewed = await session.executeRead(async (tx) => tx.run(`
      MATCH ()-[r:VIEWED]->() RETURN count(r) AS r
    `));
  const viewedN = toNumber(viewed.records[0]?.get('r')) || 0;
  return { nodes, relationships: relCount, customers, products, bought: boughtN, viewed: viewedN };
}

async function main() {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    logErr('NEO4J_NOT_CONFIGURED.');
    process.exit(EXIT_FAIL);
  }
  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { connectionTimeout: 5000, disableLosslessIntegers: true }
  );
  const session = driver.session({
    database: config.neo4jDatabase,
    defaultAccessMode: neo4j.session.READ,
  });
  /** @type {any} */
  const output = {
    timestamp: new Date().toISOString(),
    database: config.neo4jDatabase,
    driver: `neo4j-driver@${neo4j.driver?.version || 'unknown'}`,
    nodeVersion: process.version,
    warmup: WARMUP,
    measure: MEASURE,
    note: 'P95 dung nearest-rank: index = ceil(0.95 * n) - 1, n = 15 => index 14. clientMs do bang performance.now() truoc va sau session.executeRead.',
    cases: [],
  };
  let driverInfo = null;
  try {
    try {
      const stats = await session.run('CALL dbms.components() YIELD name, versions, edition RETURN name, versions, edition');
      for (const r of stats.records) {
        driverInfo = {
          name: r.get('name'),
          versions: r.get('versions'),
          edition: r.get('edition'),
        };
      }
    } catch (_e) {
      driverInfo = { name: 'unknown', versions: [], edition: 'unknown' };
    }
    output.driverInfo = driverInfo;
    output.snapshot = await fetchSnapshot(session);
    log(`snapshot: ${JSON.stringify(output.snapshot)}`);

    const cases = await pickCases(session);
    for (const c of cases) {
      log(`running ${c.key} (${c.label})`);
      const result = await runOneCase(session, c);
      output.cases.push(result);
      log(`  -> clientMs median=${result.clientMs.median.toFixed(2)} p95=${result.clientMs.p95.toFixed(2)} min=${result.clientMs.min.toFixed(2)} max=${result.clientMs.max.toFixed(2)} (n=${result.measure}, results=${result.resultCount})`);
    }
  } catch (err) {
    logErr(`FAIL: ${err.message.split('\n')[0]}`);
    output.error = err.message.split('\n')[0];
    process.exitCode = EXIT_FAIL;
  } finally {
    await session.close();
    await driver.close();
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  log(`wrote ${path.relative(REPO_ROOT, OUT_FILE)} (${output.cases.length} cases)`);
  if (process.exitCode !== EXIT_FAIL) process.exit(EXIT_OK);
}

main().catch((err) => {
  logErr(`Unexpected: ${err.stack || err.message || err}`);
  process.exit(EXIT_FAIL);
});