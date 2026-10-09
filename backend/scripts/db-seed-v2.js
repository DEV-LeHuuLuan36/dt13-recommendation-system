#!/usr/bin/env node
/**
 * `npm run db:seed:v2` (Phase 6)
 * Nap catalog V2 (150 product), accounts V2 (25 customer + 1 admin + 2 inactive),
 * behaviors V2 (BOUGHT + VIEWED) len Neo4j trong 1 transaction.
 * Idempotent: chay 2 lan khong doi counts (dung MERGE).
 * Bao toan V1: KHONG sua product/customer V1, password hash, BOUGHT/VIEWED cua seed A-E.
 */

import neo4j from 'neo4j-driver';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { generateCatalogV2, CATALOG_V2_COUNT } from '../src/seed/catalog-v2.js';
import { generateCustomersV2, generateAdminSecondaryV2, generateInactiveV2, generatePasswordsV2, V2_MARKER } from '../src/seed/accounts-v2.js';
import { generateBehaviorsV2 } from '../src/seed/behaviors-v2.js';
import { runV2InTransaction } from '../src/seed/loader-v2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'local');
const CRED_FILE = path.join(OUT_DIR, 'credentials-v2.local.json');

function log(msg) { console.log(`[db:seed:v2] ${msg}`); }

async function main() {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) { log('NEO4J_NOT_CONFIGURED'); process.exit(1); }
  const driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword), { connectionTimeout: 5000, disableLosslessIntegers: true });
  const session = driver.session({ database: config.neo4jDatabase, defaultAccessMode: neo4j.session.WRITE });

  try {
    log('Sinh passwords + hash (truoc transaction)...');
    const { plainByEmail, hashByEmail, plainAll } = generatePasswordsV2();
    for (const [email, plain] of plainByEmail.entries()) {
      const hash = await hashPassword(plain);
      hashByEmail.set(email, hash);
    }

    log('Sinh catalog V2...');
    const catalog = generateCatalogV2();
    if (catalog.length !== CATALOG_V2_COUNT) throw new Error(`catalog V2: ${catalog.length} != ${CATALOG_V2_COUNT}`);

    log('Sinh accounts V2...');
    const customers = generateCustomersV2({ passwordHashesByEmail: hashByEmail });
    const admins = [generateAdminSecondaryV2({ passwordHash: hashByEmail.get('admin2@dt13.test') })];
    const inactive = generateInactiveV2({ passwordHashesByEmail: hashByEmail });

    log('Sinh behaviors V2...');
    const customersWithBehaviors = [...customers, ...inactive];
    const { bought, viewed } = generateBehaviorsV2({ customersV2: customersWithBehaviors, catalogV2: catalog });
    log(`  ${bought.length} BOUGHT, ${viewed.length} VIEWED`);

    const data = { catalog, customers, admins, inactive, bought, viewed };
    log('Thuc thi transaction...');
    const counts = await runV2InTransaction(session, data, {});
    log(JSON.stringify(counts));

    // Ghi credentials ra local file (ignored)
    mkdirSync(OUT_DIR, { recursive: true });
    const credOut = {
      timestamp: new Date().toISOString(),
      marker: V2_MARKER,
      accounts: plainAll,
    };
    writeFileSync(CRED_FILE, JSON.stringify(credOut, null, 2) + '\n', { encoding: 'utf8' });
    log(`credentials wrote: ${path.relative(REPO_ROOT, CRED_FILE)} (khong in report)`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => { console.error(`[db:seed:v2] ${err.stack || err.message || err}`); process.exit(1); });
