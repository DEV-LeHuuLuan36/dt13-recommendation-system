// Remove the 150 V2 Products and all attached relationships in a single
// transaction. Customer / admin / Reference products and the 337+277 BOUGHT/
// VIEWED pointing at Reference products stay intact. V2-only categories are
// removed when no Product references them and no other relationship needs
// them. Refuses to commit if any pre-condition would be violated afterwards.
import neo4j from 'neo4j-driver';
import { loadConfig } from '../src/config.js';

async function main() {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    console.error('NEO4J_NOT_CONFIGURED');
    process.exit(2);
  }
  const driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword), { disableLosslessIntegers: true });
  const session = driver.session({ database: config.neo4jDatabase });
  try {
    // Snapshot pre-state for the chat summary
    const before = await snapshot(session);
    console.log('--- BEFORE ---');
    print(before);

    const expectedAfter = computeExpected(before);
    console.log('--- EXPECTED AFTER ---');
    print(expectedAfter);
    for (const failure of preCheckFailures(expectedAfter)) {
      console.error(`PRE-CHECK FAIL: ${failure}`);
      process.exit(3);
    }

    // Build a single Cypher that runs every delete inside one transaction.
    // Order:
    //   1) BOUGHT/VIEWED that point at V2 products.
    //   2) BELONGS_TO from V2 products to categories.
    //   3) V2 products themselves (DETACH DELETE handles remaining edges).
    //   4) V2-only categories (no remaining Product, no other edge).
    const cypher = `
      // 1) Drop BOUGHT/VIEWED that touch V2 products.
      MATCH ()-[b:BOUGHT]->(p:Product)
      WHERE p.datasetTag = 'DT13_SEED_V2'
      DELETE b
      WITH count(b) AS delBought
      MATCH ()-[v:VIEWED]->(p:Product)
      WHERE p.datasetTag = 'DT13_SEED_V2'
      DELETE v
      WITH delBought, count(v) AS delViewed
      // 2) Drop BELONGS_TO from V2 products.
      MATCH (p:Product)-[r:BELONGS_TO]->(c:Category)
      WHERE p.datasetTag = 'DT13_SEED_V2'
      DELETE r
      WITH delBought, delViewed, count(r) AS delBelongs
      // 3) Drop V2 products (DETACH DELETE in case of stray edges).
      MATCH (p:Product)
      WHERE p.datasetTag = 'DT13_SEED_V2'
      DETACH DELETE p
      WITH delBought, delViewed, delBelongs, count(p) AS delProducts
      // 4) Drop V2 categories that no Product references and have no other
      //    relationship. Same MERGE safety: keep if any edge remains.
      MATCH (c:Category)
      WHERE c.datasetTag = 'DT13_SEED_V2'
      AND NOT (c)<-[:BELONGS_TO]-(:Product)
      AND NOT (c)-[]-()
      DELETE c
      WITH delBought, delViewed, delBelongs, delProducts, count(c) AS delCategories
      RETURN delBought, delViewed, delBelongs, delProducts, delCategories
    `;

    const writeRes = await session.executeWrite(async (tx) => {
      const r = await tx.run(cypher);
      const rec = r.records[0];
      const stats = {
        delBought: Number(rec.get('delBought')),
        delViewed: Number(rec.get('delViewed')),
        delBelongs: Number(rec.get('delBelongs')),
        delProducts: Number(rec.get('delProducts')),
        delCategories: Number(rec.get('delCategories')),
      };
      // Post-conditions inside the same transaction so a failure rolls back.
      const post = await postSnapshot(tx);
      const failures = preCheckFailures(post, { skipAdminCheck: false });
      if (failures.length > 0) {
        throw new Error(`POST-CONDITION FAILED (transaction will be rolled back): ${failures.join('; ')}`);
      }
      return { stats, post };
    });

    console.log('--- DELETED ---');
    console.log(JSON.stringify(writeRes.stats, null, 2));
    console.log('--- AFTER ---');
    print(writeRes.post);

    // Save a small report alongside the backup so the operator can audit.
    const fs = await import('node:fs');
    const out = {
      timestamp: new Date().toISOString(),
      before,
      expectedAfter,
      after: writeRes.post,
      deleted: writeRes.stats,
    };
    fs.writeFileSync(process.argv[2] ? `${process.argv[2]}/delete-report.json` : 'delete-report.json', JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`delete-report.json written`);
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    if (e.message.includes('POST-CONDITION')) {
      console.error('Transaction was rolled back. Database is unchanged.');
    }
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

async function snapshot(session) {
  const q = `
    CALL {
      MATCH (p:Product) WHERE p.datasetTag = 'CATALOG_REAL_120_V1' RETURN count(p) AS refProduct
    }
    CALL {
      MATCH (c:Customer) WHERE c.role = 'customer' AND c.active = true RETURN count(c) AS activeCustomer
    }
    CALL {
      MATCH (c:Customer) WHERE c.role = 'admin' AND c.active = true RETURN count(c) AS activeAdmin
    }
    CALL {
      MATCH (c:Category) WHERE c.datasetTag = 'CATALOG_REAL_120_V1' RETURN count(c) AS refCategory
    }
    CALL {
      MATCH (c:Category) WHERE c.datasetTag = 'DT13_SEED_V2' RETURN count(c) AS v2Category
    }
    CALL {
      MATCH ()-[r:BOUGHT]->() RETURN count(r) AS totalBought
    }
    CALL {
      MATCH ()-[r:VIEWED]->() RETURN count(r) AS totalViewed
    }
    CALL {
      MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS totalBelongsTo
    }
    CALL {
      MATCH (p:Product)-[r:BELONGS_TO]->(c:Category)
      WITH p, count(r) AS rels
      WHERE rels <> 1
      RETURN count(p) AS badBelongsTo
    }
    CALL {
      MATCH (p:Product)
      WHERE NOT (p)-[:BELONGS_TO]->(:Category)
      RETURN count(p) AS noBelongs
    }
    RETURN *
  `;
  const r = await session.executeRead(async (tx) => tx.run(q));
  const rec = r.records[0];
  return {
    product: {
      reference: Number(rec.get('refProduct')),
    },
    customer: {
      activeRoleCustomer: Number(rec.get('activeCustomer')),
      activeAdmin: Number(rec.get('activeAdmin')),
    },
    category: {
      reference: Number(rec.get('refCategory')),
      v2: Number(rec.get('v2Category')),
    },
    edge: {
      bought: Number(rec.get('totalBought')),
      viewed: Number(rec.get('totalViewed')),
      belongsTo: Number(rec.get('totalBelongsTo')),
    },
    invariant: {
      productsWithoutBelongs: Number(rec.get('noBelongs')),
      productsWithMultipleBelongs: Number(rec.get('badBelongsTo')),
    },
  };
}

async function postSnapshot(tx) {
  const q = `
    CALL {
      MATCH (p:Product) WHERE p.datasetTag = 'CATALOG_REAL_120_V1' RETURN count(p) AS refProduct
    }
    CALL {
      MATCH (c:Customer) WHERE c.role = 'customer' AND c.active = true RETURN count(c) AS activeCustomer
    }
    CALL {
      MATCH (c:Customer) WHERE c.role = 'admin' AND c.active = true RETURN count(c) AS activeAdmin
    }
    CALL {
      MATCH (c:Category) WHERE c.datasetTag = 'CATALOG_REAL_120_V1' RETURN count(c) AS refCategory
    }
    CALL {
      MATCH (c:Category) WHERE c.datasetTag = 'DT13_SEED_V2' RETURN count(c) AS v2Category
    }
    CALL {
      MATCH ()-[r:BOUGHT]->() RETURN count(r) AS totalBought
    }
    CALL {
      MATCH ()-[r:VIEWED]->() RETURN count(r) AS totalViewed
    }
    CALL {
      MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS totalBelongsTo
    }
    CALL {
      MATCH (p:Product)-[r:BELONGS_TO]->(c:Category)
      WITH p, count(r) AS rels
      WHERE rels <> 1
      RETURN count(p) AS badBelongsTo
    }
    CALL {
      MATCH (p:Product)
      WHERE NOT (p)-[:BELONGS_TO]->(:Category)
      RETURN count(p) AS noBelongs
    }
    RETURN *
  `;
  const r = await tx.run(q);
  const rec = r.records[0];
  return {
    product: { reference: Number(rec.get('refProduct')) },
    customer: {
      activeRoleCustomer: Number(rec.get('activeCustomer')),
      activeAdmin: Number(rec.get('activeAdmin')),
    },
    category: {
      reference: Number(rec.get('refCategory')),
      v2: Number(rec.get('v2Category')),
    },
    edge: {
      bought: Number(rec.get('totalBought')),
      viewed: Number(rec.get('totalViewed')),
      belongsTo: Number(rec.get('totalBelongsTo')),
    },
    invariant: {
      productsWithoutBelongs: Number(rec.get('noBelongs')),
      productsWithMultipleBelongs: Number(rec.get('badBelongsTo')),
    },
  };
}

function computeExpected(before) {
  // Predict: 150 V2 products removed; 6 V2 categories removed (when no rels);
  // 154 BOUGHT and 137 VIEWED (those that pointed at V2 products) removed;
  // 150 BELONGS_TO from V2 products removed; all Customer kept.
  const v2Bought = 154; // known from earlier inspection
  const v2Viewed = 137;
  return {
    product: { reference: before.product.reference },
    customer: {
      activeRoleCustomer: before.customer.activeRoleCustomer,
      activeAdmin: before.customer.activeAdmin,
    },
    category: {
      reference: before.category.reference,
      v2: 0,
    },
    edge: {
      bought: before.edge.bought - v2Bought,
      viewed: before.edge.viewed - v2Viewed,
      belongsTo: before.edge.belongsTo - 150,
    },
    invariant: {
      productsWithoutBelongs: 0,
      productsWithMultipleBelongs: 0,
    },
  };
}

function preCheckFailures(snap) {
  const fails = [];
  if (snap.product.reference !== 120) fails.push(`reference product: ${snap.product.reference} != 120`);
  if (snap.customer.activeRoleCustomer < 50) fails.push(`active customer role=customer: ${snap.customer.activeRoleCustomer} < 50`);
  if (snap.customer.activeAdmin < 1) fails.push(`active admin: ${snap.customer.activeAdmin} < 1`);
  if (snap.edge.bought + snap.edge.viewed < 300) fails.push(`BOUGHT+VIEWED: ${snap.edge.bought + snap.edge.viewed} < 300`);
  if (snap.invariant.productsWithoutBelongs !== 0) fails.push(`products without BELONGS_TO: ${snap.invariant.productsWithoutBelongs} != 0`);
  if (snap.invariant.productsWithMultipleBelongs !== 0) fails.push(`products with !=1 BELONGS_TO: ${snap.invariant.productsWithMultipleBelongs} != 0`);
  return fails;
}

function print(s) {
  console.log(JSON.stringify(s, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
