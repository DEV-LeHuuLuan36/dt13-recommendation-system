#!/usr/bin/env node
/**
 * `npm run db:seed:reference` — idempotently loads the 120-product reference
 * catalog, 60 customers, 6 categories, and the BOUGHT/VIEWED edges from
 * `backend/src/seed/reference/catalog-reference.json`. Re-running is safe
 * (MERGE on IDs/eventIds). Never touches products, customers, or edges
 * outside the reference scope.
 */
import neo4j from 'neo4j-driver';
import { loadConfig } from '../src/config.js';
import { runReferenceInTransaction, loadReferenceDataset, REFERENCE_MARKER, generateReferenceCredentials } from '../src/seed/reference/loader-reference.js';

function log(msg) { console.log(`[db:seed:reference] ${msg}`); }

async function main() {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) { console.error('NEO4J_NOT_CONFIGURED'); process.exit(1); }
  const driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword), { connectionTimeout: 5000, disableLosslessIntegers: true });
  const session = driver.session({ database: config.neo4jDatabase, defaultAccessMode: neo4j.session.WRITE });
  try {
    const dataset = loadReferenceDataset();
    log(`loaded reference dataset: ${dataset.products.length} products, ${dataset.customers.length} customers, ${dataset.categories.length} categories, ${dataset.bought.length} BOUGHT, ${dataset.viewed.length} VIEWED`);

    log('Hashing customer passwords with unique deterministic salts...');
    const credentials = await generateReferenceCredentials({ logger: log });

    log('Running transaction...');
    const counts = await runReferenceInTransaction(session, dataset, credentials);
    log(`Reference tag ${REFERENCE_MARKER}: ${JSON.stringify(counts)}`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => { console.error(`[db:seed:reference] ${err.stack || err.message || err}`); process.exit(1); });
