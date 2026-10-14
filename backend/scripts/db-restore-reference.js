#!/usr/bin/env node
// Re-runs the reference loader for the entire catalog so the
// 120 products, 60 customers, 6 categories, 372 BOUGHT, 360 VIEWED are
// restored. Uses a single shared demo password (for the recovery only;
// the official `db:seed:reference` script will pick a fresh random password
// per customer on a real reseed).
import neo4j from 'neo4j-driver';
import { loadReferenceDataset, runReferenceInTransaction, generateReferenceCredentials } from '../src/seed/reference/loader-reference.js';

async function main() {
  const { loadConfig } = await import('../src/config.js');
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) { console.error('NEO4J_NOT_CONFIGURED'); process.exit(2); }
  const driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword), { connectionTimeout: 5000, disableLosslessIntegers: true });
  const session = driver.session({ database: config.neo4jDatabase, defaultAccessMode: neo4j.session.WRITE });
  try {
    const data = loadReferenceDataset();
    console.log(`[restore-ref] dataset: ${data.products.length} products, ${data.customers.length} customers, ${data.bought.length} BOUGHT, ${data.viewed.length} VIEWED`);
    const credentials = await generateReferenceCredentials({ logger: console.log });
    const counts = await runReferenceInTransaction(session, data, credentials);
    console.log(`[restore-ref] inserted: ${JSON.stringify(counts)}`);
    // Persist the plaintext credentials next to the backup dir so the
    // operator can rotate later, but never print them.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const out = process.argv[2];
    if (out) {
      const arr = [];
      for (const [cid] of credentials.entries()) {
        const c = data.customers.find((x) => x.customerId === cid);
        arr.push({ customerId: cid, email: c?.email ?? null, name: c?.name ?? null, role: c?.role ?? 'customer' });
      }
      // Plaintext passwords are kept out of disk intentionally.
      const meta = {
        generatedAt: new Date().toISOString(),
        note: 'plaintext passwords are not stored; rotate via /api/admin/customers (Phase 3) or rerun the official db:seed:reference script.',
        accounts: arr,
      };
      fs.writeFileSync(path.join(out, 'reference-accounts-meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
      console.log(`[restore-ref] wrote metadata to ${path.join(out, 'reference-accounts-meta.json')} (no plaintexts)`);
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
