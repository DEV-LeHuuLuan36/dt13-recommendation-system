#!/usr/bin/env node
/**
 * `npm run db:seed` — loads the DT13_SEED_V1 dataset into Neo4j.
 * Idempotent via MERGE/ON CREATE; never overwrites existing passwordHash,
 * price, or timestamps.
 *
 * Flow:
 *  1. Read DEMO_ADMIN_PASSWORD / DEMO_CUSTOMER_PASSWORD from env; if missing,
 *     generate with node:crypto and append to backend/.env (local only).
 *  2. Build + offline-validate the seed dataset.
 *  3. Hash the demo passwords before opening the transaction.
 *  4. Open one session and one executeWrite() wrapping all 6 steps; any
 *     throw rolls back the whole transaction.
 *  5. Log the counts after the commit for cross-checking.
 *
 * No side effects (writing .env, logging passwords) happen inside the callback.
 */
import neo4j from 'neo4j-driver';
import { loadConfig } from '../src/config.js';
import { generateSeedDataset, validateSeedDataset, generateSeedCredentials } from '../src/seed/generator.js';
import { runSeedInTransaction } from '../src/seed/loader.js';

const EXIT_OK = 0;
const EXIT_FAIL = 1;

function log(msg) { console.log(`[db-seed] ${msg}`); }
function logErr(msg) { console.error(`[db-seed] ${msg}`); }

async function main() {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    logErr('NEO4J_NOT_CONFIGURED: missing NEO4J_URI/USERNAME/PASSWORD/DATABASE in backend/.env.');
    process.exit(EXIT_FAIL);
  }

  // (1) Generate + validate OFFLINE truoc khi mo transaction.
  const dataset = generateSeedDataset();
  const validate = validateSeedDataset(dataset);
  if (!validate.ok) {
    logErr(`Dataset validation failed: ${validate.errors.join('; ')}`);
    process.exit(EXIT_FAIL);
  }
  log(`Dataset generator: products=${dataset.products.length}, customers=${dataset.customers.length}, categories=${dataset.categories.length}, bought=${dataset.bought.length}, viewed=${dataset.viewed.length}, marker=${dataset.marker}`);

  // (2) Sinh mat khau rieng + salt rieng + passwordHash (scrypt) rieng biet cho tung Customer/Admin.
  const credentials = await generateSeedCredentials(dataset.customers);
  log(`Generated ${credentials.size} unique customer credentials with deterministic salts and scrypt hashes.`);

  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { connectionTimeout: 5000, disableLosslessIntegers: true }
  );
  const session = driver.session({ database: config.neo4jDatabase, defaultAccessMode: neo4j.session.WRITE });

  let exit = EXIT_OK;
  try {
    // (3) One executeWrite; callback only calls tx.run. Any throw here rolls the whole transaction back.
    const totals = await runSeedInTransaction(session, dataset, null, null, { credentials });
    log(`Transaction OK: ${JSON.stringify(totals)}`);
  } catch (err) {
    logErr(`FAIL: ${err.message.split('\n')[0]}`);
    exit = EXIT_FAIL;
  } finally {
    await session.close();
    await driver.close();
  }
  process.exit(exit);
}

main().catch((err) => {
  logErr(`Unexpected: ${err.stack || err.message || err}`);
  process.exit(EXIT_FAIL);
});