#!/usr/bin/env node
/**
 * `npm run db:rollback:v2` - xoa V2 data khoi graph (giu nguyen V1).
 *  - Customer datasetTag=DT13_SEED_V2 (admin2, 25 customer, 2 inactive)
 *  - BOUGHT/VIEWED eventId prefix BOUGHT_DT13_SEED_V2_ / VIEWED_DT13_SEED_V2_
 *  - Product datasetTag=DT13_SEED_V2 (150 product)
 *  - BELONGS_TO datasetTag=DT13_SEED_V2
 *
 * Khong xoa:
 *  - V1 product (datasetTag=DT13_SEED_V1)
 *  - V1 customer
 *  - V1 BOUGHT/VIEWED
 *  - V1 BELONGS_TO
 *
 * Neu runtime CRUD customer co datasetTag=DT13_SEED_V2 (do cap nhat o trang admin)
 * thi KHONG xoa. Tuy nhien V2 loader khong cap nhat datasetTag V1 thanh V2 (chi set
 * neu chua co - ON MATCH SET datasetTag = COALESCE(...) nen V1 giu nguyen).
 * Dam bao: chi xoa nhung node/edge co datasetTag=DT13_SEED_V2.
 */

import neo4j from 'neo4j-driver';
import { loadConfig } from '../src/config.js';

function log(msg) { console.log(`[db:rollback:v2] ${msg}`); }

async function main() {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) { log('NEO4J_NOT_CONFIGURED'); process.exit(1); }
  const driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword), { connectionTimeout: 5000, disableLosslessIntegers: true });
  const session = driver.session({ database: config.neo4jDatabase, defaultAccessMode: neo4j.session.WRITE });

  try {
    // Dem truoc
    const before = await session.executeRead(async (tx) => {
      const r = await tx.run(`
        MATCH (c:Customer { datasetTag: 'DT13_SEED_V2' }) RETURN count(c) AS v
      `);
      const p = await tx.run(`MATCH (p:Product { datasetTag: 'DT13_SEED_V2' }) RETURN count(p) AS v`);
      const b = await tx.run(`MATCH ()-[r:BOUGHT { datasetTag: 'DT13_SEED_V2' }]->() RETURN count(r) AS v`);
      const v = await tx.run(`MATCH ()-[r:VIEWED { datasetTag: 'DT13_SEED_V2' }]->() RETURN count(r) AS v`);
      const bl = await tx.run(`MATCH ()-[r:BELONGS_TO { datasetTag: 'DT13_SEED_V2' }]->() RETURN count(r) AS v`);
      return {
        customers: Number(r.records[0].get('v')),
        products: Number(p.records[0].get('v')),
        bought: Number(b.records[0].get('v')),
        viewed: Number(v.records[0].get('v')),
        belongsTo: Number(bl.records[0].get('v')),
      };
    });
    log(`trước: ${JSON.stringify(before)}`);

    // Xoa V2
    const counts = await session.executeWrite(async (tx) => {
      const r1 = await tx.run(`MATCH ()-[r:BOUGHT { datasetTag: 'DT13_SEED_V2' }]->() DELETE r RETURN count(r) AS v`);
      const r2 = await tx.run(`MATCH ()-[r:VIEWED { datasetTag: 'DT13_SEED_V2' }]->() DELETE r RETURN count(r) AS v`);
      const r3 = await tx.run(`MATCH ()-[r:BELONGS_TO { datasetTag: 'DT13_SEED_V2' }]->() DELETE r RETURN count(r) AS v`);
      const r4 = await tx.run(`MATCH (c:Customer { datasetTag: 'DT13_SEED_V2' }) DETACH DELETE c RETURN count(c) AS v`);
      const r5 = await tx.run(`MATCH (p:Product { datasetTag: 'DT13_SEED_V2' }) DETACH DELETE p RETURN count(p) AS v`);
      return {
        bought: Number(r1.records[0].get('v')),
        viewed: Number(r2.records[0].get('v')),
        belongsTo: Number(r3.records[0].get('v')),
        customers: Number(r4.records[0].get('v')),
        products: Number(r5.records[0].get('v')),
      };
    });
    log(`xóa: ${JSON.stringify(counts)}`);

    // Dem sau
    const after = await session.executeRead(async (tx) => {
      const r = await tx.run(`MATCH (c:Customer) RETURN count(c) AS v`);
      const p = await tx.run(`MATCH (p:Product) RETURN count(p) AS v`);
      const b = await tx.run(`MATCH ()-[r:BOUGHT]->() RETURN count(r) AS v`);
      const v = await tx.run(`MATCH ()-[r:VIEWED]->() RETURN count(r) AS v`);
      const bl = await tx.run(`MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS v`);
      const cat = await tx.run(`MATCH (c:Category) RETURN count(c) AS v`);
      return {
        customers: Number(r.records[0].get('v')),
        products: Number(p.records[0].get('v')),
        bought: Number(b.records[0].get('v')),
        viewed: Number(v.records[0].get('v')),
        belongsTo: Number(bl.records[0].get('v')),
        category: Number(cat.records[0].get('v')),
      };
    });
    log(`sau: ${JSON.stringify(after)}`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => { console.error(`[db:rollback:v2] ${err.stack || err.message || err}`); process.exit(1); });
