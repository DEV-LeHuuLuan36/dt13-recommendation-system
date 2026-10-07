#!/usr/bin/env node
/**
 * `npm run check:neo4j`
 *
 * Doc config tu backend/.env, kiem tra day du, tao driver va thuc hien truy van doc.
 *  - Thanh cong (RETURN 1): exit 0, in thong tin phien ban/edition neu co quyen.
 *  - Thieu config: exit 2.
 *  - Loi ket noi: exit 3.
 *  - Loi khac: exit 4.
 *
 * KHONG in mat khau hoac secret ra stdout/stderr.
 */
import neo4j from 'neo4j-driver';
import { loadConfig, backendRoot } from '../src/config.js';

const EXIT_OK = 0;
const EXIT_MISCONFIG = 2;
const EXIT_CONNECT_FAIL = 3;
const EXIT_OTHER = 4;

function logInfo(msg) {
  console.log(`[check-neo4j] ${msg}`);
}

function logError(msg) {
  console.error(`[check-neo4j] ${msg}`);
}

async function main() {
  const config = loadConfig();

  if (!config.neo4jFullyConfigured) {
    logError('NEO4J_NOT_CONFIGURED: thieu NEO4J_URI/USERNAME/PASSWORD/DATABASE trong backend/.env.');
    logError('Vui long dien day du va chay lai (hoac chay script nay tu thu muc backend).');
    process.exit(EXIT_MISCONFIG);
  }

  logInfo(`URI: ${redactUri(config.neo4jUri)}`);
  logInfo(`Database: ${config.neo4jDatabase}`);

  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    {
      connectionTimeout: 4000,
      disableLosslessIntegers: true,
    }
  );

  let exitCode = EXIT_OK;
  try {
    const session = driver.session({ database: config.neo4jDatabase, defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run('RETURN 1 AS ok');
      const okValue = result.records[0]?.get('ok');
      if (okValue !== 1) {
        logError(`Khong mong doi ket qua RETURN 1: ${okValue}`);
        exitCode = EXIT_OTHER;
      } else {
        logInfo('Truy van RETURN 1 thanh cong.');
        try {
          const stats = await session.run('CALL dbms.components() YIELD name, versions, edition RETURN name, versions, edition');
          for (const record of stats.records) {
            const name = record.get('name');
            const versions = record.get('versions');
            const edition = record.get('edition');
            logInfo(`Component: ${name} ${versions?.join?.('.') ?? versions} (edition: ${edition ?? 'unknown'})`);
          }
        } catch (statsErr) {
          logInfo(`Khong doc duoc dbms.components(): ${statsErr.message.split('\n')[0]}`);
        }
      }
    } finally {
      await session.close();
    }
  } catch (err) {
    logError(`NEO4J_UNAVAILABLE: ${err.message.split('\n')[0]}`);
    exitCode = EXIT_CONNECT_FAIL;
  } finally {
    try {
      await driver.close();
    } catch (closeErr) {
      logError(`Loi khi dong driver: ${closeErr.message}`);
    }
  }

  process.exit(exitCode);
}

/**
 * An cac thanh phan nhay cam trong URI neu co (password embedded).
 */
function redactUri(uri) {
  if (!uri) return '';
  try {
    const u = new URL(uri);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return uri.replace(/\/\/([^@]+)@/, '//***@');
  }
}

main().catch((err) => {
  logError(`Unexpected: ${err.stack || err.message || err}`);
  process.exit(EXIT_OTHER);
});

// Re-export de tranh warning eslint unused khi import.
// (backendRoot duoc export nham muc dich kiem thu)
export { backendRoot };