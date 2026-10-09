#!/usr/bin/env node
/**
 * `npm run profile:recommendations` — runs EXPLAIN and PROFILE for the main
 * recommendation queries (user_cf and co_bought) using sample cases pulled
 * from the live database. EXPLAIN only plans; PROFILE executes and reports
 * runtime. Read-only — never writes or modifies the graph.
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
const OUT_FILE = path.join(OUT_DIR, 'phase5-profile.json');

const EXIT_OK = 0;
const EXIT_FAIL = 1;

function log(msg) { console.log(`[profile:recommendations] ${msg}`); }
function logErr(msg) { console.error(`[profile:recommendations] ${msg}`); }

function intParam(n) {
  return neo4j.int(n);
}

/**
 * Trich customer/case de thuc thi EXPLAIN/PROFILE.
 *  - cfDenseCustomer: customer co sharedCount lon (peer count).
 *  - cfSparseCustomer: customer it peer (vi du nhom 6..55 hoac CUST_005).
 *  - coBoughtPopular: product co nhieu buyer (co sum c).
 *  - coBoughtNiche: product it buyer.
 *  - coBoughtCold: customer khong mua source (co_bought khong yeu cau
 *    target mua nguon nhung test de xac nhan van co ky qua tot).
 */
async function pickCases(session) {
  const cfDense = await session.executeRead(async (tx) => tx.run(`
      MATCH (c:Customer { role: 'customer', active: true })-[:BOUGHT]->(p:Product)<-[:BOUGHT]-(peer:Customer)
      WHERE peer <> c AND peer.role = 'customer' AND peer.active = true
      WITH c, count(DISTINCT peer) AS peerCount
      ORDER BY peerCount DESC
      LIMIT 1
      RETURN c.customerId AS id
    `));
  const cfDenseId = cfDense.records[0]?.get('id') || 'CUST_001';

  // cfSparse: uu tien customer trong nhom 6..55 (mot so nho peer co the co sharedCount nho).
  // Neu khong co peer (cold start) thi se skip, lay mot customer trong nhom 6..55 co BOUGHT.
  const cfSparse = await session.executeRead(async (tx) => tx.run(`
      MATCH (c:Customer { customerId: 'CUST_006', role: 'customer', active: true })
      RETURN c.customerId AS id
    `));
  const cfSparseId = cfSparse.records[0]?.get('id') || 'CUST_006';

  // co_bought popular: chon product co max peer-distinct.
  const cbPop = await session.executeRead(async (tx) => tx.run(`
      MATCH (p:Product { active: true })<-[:BOUGHT]-(c:Customer)
      WHERE c.role = 'customer' AND c.active = true
      WITH p, count(DISTINCT c) AS buyers
      ORDER BY buyers DESC
      LIMIT 1
      RETURN p.productId AS id, buyers
    `));
  const cbPopId = cbPop.records[0]?.get('id') || 'PROD_001';
  const cbPopBuyers = cbPop.records[0]?.get('buyers') || 0;

  // co_bought niche: chon product co it buyer (nhung co).
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
  const cbNicheBuyers = cbNiche.records[0]?.get('buyers') || 0;

  return [
    { key: 'user_cf_dense', mode: 'user_cf', customerId: cfDenseId, productId: null, sourceMeta: 'customer co sharedCount peerCount lon nhat' },
    { key: 'user_cf_sparse', mode: 'user_cf', customerId: cfSparseId, productId: null, sourceMeta: 'customer CUST_006 (nhom 6..55)' },
    { key: 'co_bought_popular', mode: 'co_bought', customerId: cfSparseId, productId: cbPopId, sourceMeta: `product co ${cbPopBuyers} buyers` },
    { key: 'co_bought_niche', mode: 'co_bought', customerId: cfSparseId, productId: cbNicheId, sourceMeta: `product co ${cbNicheBuyers} buyers (niche)` },
  ];
}

function pickQuery({ mode }) {
  if (mode === 'user_cf') return { cypher: QUERIES.recommendForMe, params: { customerId: '', limit: intParam(5) } };
  return { cypher: QUERIES.recommendForProduct, params: { customerId: '', productId: '', limit: intParam(5) } };
}

function fingerprint(cypher) {
  return cypher.replace(/\s+/g, ' ').trim();
}

async function runPlan(session, cypher, params, mode) {
  // mode: 'EXPLAIN' hoac 'PROFILE'
  const prefix = mode === 'EXPLAIN' ? 'EXPLAIN' : 'PROFILE';
  const result = await session.run(`${prefix} ${cypher}`, params);
  // Plan o summary.plan, stats o summary.profile
  const summary = result.summary || {};
  const plan = summary.plan || null;
  const profile = summary.profile || null;
  const counters = (summary.counters && summary.counters.updates && summary.counters.updates())
    ? summary.counters.updates()
    : (summary.counters || null);
  const resultAvailableAfter = summary.resultAvailableAfter;
  const resultConsumedAfter = summary.resultConsumedAfter;
  return {
    mode,
    plan,
    profile,
    counters,
    timings: {
      resultAvailableAfter: toNumberOrNull(resultAvailableAfter),
      resultConsumedAfter: toNumberOrNull(resultConsumedAfter),
    },
  };
}

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') {
    try { return v.toNumber(); } catch { return Number(v); }
  }
  return Number(v);
}

function summarizePlan(node) {
  if (!node) return null;
  return {
    operatorType: node.operatorType,
    arguments: node.arguments || {},
    identifiers: node.identifiers || [],
    children: (node.children || []).map(summarizePlan),
    rows: typeof node.rows === 'number' ? node.rows : toNumberOrNull(node.rows),
    dbHits: typeof node.dbHits === 'number' ? node.dbHits : toNumberOrNull(node.dbHits),
    estimatedRows: typeof node.estimatedRows === 'number' ? node.estimatedRows : toNumberOrNull(node.estimatedRows),
  };
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
    driver: `neo4j-driver@${neo4j.driver?.version || 'unknown'}`,
    database: config.neo4jDatabase,
    fingerprintUserCf: fingerprint(QUERIES.recommendForMe),
    fingerprintCoBought: fingerprint(QUERIES.recommendForProduct),
    cases: [],
    indexInfo: null,
    constraintInfo: null,
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

    const cases = await pickCases(session);
    for (const c of cases) {
      const { cypher, params } = pickQuery(c);
      const filledParams = { ...params };
      filledParams.customerId = c.customerId;
      if (c.mode === 'co_bought') filledParams.productId = c.productId;
      const fp = fingerprint(cypher);
      const caseOut = {
        key: c.key,
        mode: c.mode,
        customerId: c.customerId,
        productId: c.productId,
        sourceMeta: c.sourceMeta,
        fingerprint: fp,
        parameters: { ...filledParams, customerId: c.customerId, productId: c.productId },
        explain: null,
        profile: null,
      };
      try {
        const explain = await runPlan(session, cypher, filledParams, 'EXPLAIN');
        caseOut.explain = {
          planTree: summarizePlan(explain.plan),
          resultAvailableAfter: explain.timings.resultAvailableAfter,
        };
      } catch (err) {
        caseOut.explain = { error: err.message.split('\n')[0] };
      }
      try {
        const profile = await runPlan(session, cypher, filledParams, 'PROFILE');
        caseOut.profile = {
          planTree: summarizePlan(profile.plan),
          profileTree: summarizePlan(profile.profile),
          counters: profile.counters,
          timings: profile.timings,
        };
      } catch (err) {
        caseOut.profile = { error: err.message.split('\n')[0] };
      }
      output.cases.push(caseOut);
      log(`case ${c.key}: EXPLAIN=${caseOut.explain?.planTree?.operatorType ? 'OK' : 'NO'} PROFILE=${caseOut.profile?.profileTree?.operatorType ? 'OK' : 'NO'}`);
    }

    // SHOW INDEXES
    try {
      const idxRes = await session.run('SHOW INDEXES');
      output.indexInfo = idxRes.records.map((r) => ({
        name: r.get('name'),
        type: r.get('type'),
        entityType: r.get('entityType'),
        labelsOrTypes: r.get('labelsOrTypes'),
        properties: r.get('properties'),
        state: r.get('state'),
      }));
      log(`indexes: ${output.indexInfo.length}`);
    } catch (err) {
      output.indexInfo = { error: err.message.split('\n')[0] };
    }

    // SHOW CONSTRAINTS
    try {
      const cRes = await session.run('SHOW CONSTRAINTS');
      output.constraintInfo = cRes.records.map((r) => ({
        name: r.get('name'),
        type: r.get('type'),
        entityType: r.get('entityType'),
        labelsOrTypes: r.get('labelsOrTypes'),
        properties: r.get('properties'),
      }));
      log(`constraints: ${output.constraintInfo.length}`);
    } catch (err) {
      output.constraintInfo = { error: err.message.split('\n')[0] };
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