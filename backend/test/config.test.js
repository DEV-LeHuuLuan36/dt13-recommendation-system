import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, parseEnvFile } from '../src/config.js';
import { sanitizeError } from '../src/routes/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures-env');
const fixtureEnv = path.join(fixturesDir, '.env');

test('loadConfig tra ve defaults khi env rong', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.port, 3001);
  assert.equal(cfg.nodeEnv, 'development');
  assert.equal(cfg.neo4jFullyConfigured, false);
});

test('loadConfig doc file .env neu ton tai', () => {
  const cfg = loadConfig({}, { cwd: fixturesDir });
  assert.equal(cfg.port, 4002);
  assert.equal(cfg.neo4jUri, 'bolt://127.0.0.1:7687');
  // Password doc tu file .env -> cau hinh day du neu ca user, database co.
  assert.equal(cfg.neo4jFullyConfigured, true);
});

test('parseEnvFile bo qua comment va quote', () => {
  const parsed = parseEnvFile(fixtureEnv);
  assert.equal(parsed.PORT, '4002');
  assert.equal(parsed.NEO4J_URI, 'bolt://127.0.0.1:7687');
  assert.equal(parsed.NEO4J_PASSWORD, 'secret-from-file');
});

test('sanitizeError khong tra password', () => {
  const result = sanitizeError(new Error('ServerCredentialError: leaked password=hunter2'));
  assert.ok(!result.includes('hunter2'));
});