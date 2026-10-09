#!/usr/bin/env node
/**
 * `npm run db:seed`
 *
 * Nap dataset seed (DT13_SEED_V1) vao Neo4j.
 * Idempotent: MERGE/ON CREATE; bao ve passwordHash/price/time da co.
 *
 * Cau truc:
 *  1. Doc DEMO_ADMIN_PASSWORD va DEMO_CUSTOMER_PASSWORD tu env.
 *     Neu khong co: sinh bang node:crypto, ghi vao backend/.env (LOCAL ONLY).
 *  2. Tao dataset (generator) va validate offline.
 *  3. Hash mat khau TRUOC khi mo transaction.
 *  4. Mo mot session va mot executeWrite() chua toan bo 6 buoc.
 *     Truyen `tx` xuong cac helper; neu helper nao throw, transaction rollback
 *     va khong ghi gi them.
 *  5. Sau transaction: in count da ghi de cross-check.
 *
 * Khong thuc hien side effect (ghi .env, log mat khau, ...) trong callback.
 */
import neo4j from 'neo4j-driver';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { loadConfig, parseEnvFile } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { generateSeedDataset, validateSeedDataset } from '../src/seed/generator.js';
import { runSeedInTransaction } from '../src/seed/loader.js';

const EXIT_OK = 0;
const EXIT_FAIL = 1;

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, '..');
const envPath = resolve(backendRoot, '.env');

function log(msg) { console.log(`[db-seed] ${msg}`); }
function logErr(msg) { console.error(`[db-seed] ${msg}`); }

/**
 * Dam bao co DEMO_ADMIN_PASSWORD va DEMO_CUSTOMER_PASSWORD trong .env.
 * Neu thieu: sinh bang node:crypto, append vao file (khong ghi de).
 * KHONG in gia tri.
 */
async function ensureDemoPasswords() {
  let env = {};
  if (existsSync(envPath)) env = parseEnvFile(envPath);
  const updates = {};
  if (!env.DEMO_ADMIN_PASSWORD) updates.DEMO_ADMIN_PASSWORD = randomBytes(12).toString('base64url');
  if (!env.DEMO_CUSTOMER_PASSWORD) updates.DEMO_CUSTOMER_PASSWORD = randomBytes(12).toString('base64url');
  if (Object.keys(updates).length === 0) {
    return { adminPassword: env.DEMO_ADMIN_PASSWORD, customerPassword: env.DEMO_CUSTOMER_PASSWORD };
  }
  const appendLines = Object.entries(updates).map(([k, v]) => `${k}=${v}`);
  const existing = readFileSync(envPath, 'utf8');
  const sep = existing.endsWith('\n') ? '' : '\n';
  writeFileSync(envPath, existing + sep + appendLines.join('\n') + '\n', 'utf8');
  log('Da sinh DEMO_* password moi va ghi vao backend/.env (LOCAL ONLY, khong in).');
  return { adminPassword: updates.DEMO_ADMIN_PASSWORD, customerPassword: updates.DEMO_CUSTOMER_PASSWORD };
}

async function main() {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    logErr('NEO4J_NOT_CONFIGURED: thieu NEO4J_URI/USERNAME/PASSWORD/DATABASE trong backend/.env.');
    process.exit(EXIT_FAIL);
  }
  const { adminPassword, customerPassword } = await ensureDemoPasswords();
  if (!adminPassword || !customerPassword) {
    logErr('Khong co DEMO_ADMIN_PASSWORD hoac DEMO_CUSTOMER_PASSWORD.');
    process.exit(EXIT_FAIL);
  }

  // (1) Generate + validate OFFLINE truoc khi mo transaction.
  const dataset = generateSeedDataset();
  const validate = validateSeedDataset(dataset);
  if (!validate.ok) {
    logErr(`Dataset validation that bai: ${validate.errors.join('; ')}`);
    process.exit(EXIT_FAIL);
  }
  log(`Dataset generator: products=${dataset.products.length}, customers=${dataset.customers.length}, categories=${dataset.categories.length}, bought=${dataset.bought.length}, viewed=${dataset.viewed.length}, marker=${dataset.marker}`);

  // (2) Hash password TRUOC khi mo transaction.
  const adminHash = await hashPassword(adminPassword);
  const customerHash = await hashPassword(customerPassword);

  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { connectionTimeout: 5000, disableLosslessIntegers: true }
  );
  const session = driver.session({ database: config.neo4jDatabase, defaultAccessMode: neo4j.session.WRITE });

  let exit = EXIT_OK;
  try {
    // (3) Mot executeWrite duy nhat, callback chi chay tx.run.
    // Neu bat ky buoc nao throw, transaction se rollback toan bo.
    const totals = await runSeedInTransaction(session, dataset, adminHash, customerHash);
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