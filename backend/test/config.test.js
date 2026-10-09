import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig, parseEnvFile } from '../src/config.js';
import { sanitizeError } from '../src/routes/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures-env');
const fixtureEnv = path.join(fixturesDir, '.env');

test('loadConfig returns defaults when env is empty (no .env file present)', () => {
  // Use a temp dir without .env to verify the "missing file" path.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt13-cfg-'));
  try {
    const cfg = loadConfig({}, { cwd: tmpDir });
    assert.equal(cfg.host, '127.0.0.1');
    assert.equal(cfg.port, 3001);
    assert.equal(cfg.nodeEnv, 'development');
    assert.equal(cfg.neo4jFullyConfigured, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadConfig reads .env file when present', () => {
  const cfg = loadConfig({}, { cwd: fixturesDir });
  assert.equal(cfg.port, 4002);
  assert.equal(cfg.neo4jUri, 'bolt://127.0.0.1:7687');
  // Config is fully populated when user and database are also set.
  assert.equal(cfg.neo4jFullyConfigured, true);
});

test('parseEnvFile ignores comments and respects quotes', () => {
  const parsed = parseEnvFile(fixtureEnv);
  assert.equal(parsed.PORT, '4002');
  assert.equal(parsed.NEO4J_URI, 'bolt://127.0.0.1:7687');
  assert.equal(parsed.NEO4J_PASSWORD, 'secret-from-file');
});

test('sanitizeError does not leak passwords', () => {
  const result = sanitizeError(new Error('ServerCredentialError: leaked password=hunter2'));
  assert.ok(!result.includes('hunter2'));
});
