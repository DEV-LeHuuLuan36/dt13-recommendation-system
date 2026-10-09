#!/usr/bin/env node
/**
 * `npm run db:schema`
 *
 * Tao cac constraint uniqueness can thiet (Cypher 5.x ho tro).
 * Chay nhieu lan khong loi (IF NOT EXISTS).
 * In ra danh sach constraint sau khi tao.
 */
import neo4j from 'neo4j-driver';
import { loadConfig } from '../src/config.js';
import { CONSTRAINTS, VERIFY } from '../src/cypher/queries.js';

const EXIT_OK = 0;
const EXIT_FAIL = 1;

function log(msg) {
  console.log(`[db-schema] ${msg}`);
}

function logErr(msg) {
  console.error(`[db-schema] ${msg}`);
}

async function main() {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    logErr('NEO4J_NOT_CONFIGURED: thieu NEO4J_URI/USERNAME/PASSWORD/DATABASE trong backend/.env.');
    process.exit(EXIT_FAIL);
  }
  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { connectionTimeout: 4000, disableLosslessIntegers: true }
  );
  const session = driver.session({ database: config.neo4jDatabase });
  let exit = EXIT_OK;
  try {
    for (const q of CONSTRAINTS) {
      try {
        await session.run(q);
        log(`OK: ${q.split(' ')[2]}`);
      } catch (err) {
        // IF NOT EXISTS duoc ho tro tu Cypher 4.4+, neu server cu hon se loi.
        // In canh bao va tiep tuc.
        const m = err.message.split('\n')[0];
        log(`WARN: ${m}`);
      }
    }
    try {
      const res = await session.run(VERIFY.showConstraints);
      const names = res.records.map((r) => r.get('name')).filter(Boolean);
      log(`Constraints hien co (${names.length}): ${names.join(', ')}`);
    } catch (err) {
      const m = err.message.split('\n')[0];
      log(`Khong doc duoc SHOW CONSTRAINTS: ${m}`);
    }
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