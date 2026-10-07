import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createFakeNeo4jClient } from '../src/neo4j.js';

const VALID_SECRET = 'a-test-secret-for-supertest';

function buildApp(opts = {}) {
  return createApp({
    sessionSecret: VALID_SECRET,
    env: {},
    ...opts,
  });
}

test('GET /api/health tra 200 va khong chua secrets', async () => {
  const app = buildApp({ neo4jClient: null });

  const res = await request(app).get('/api/health');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, 'dt13-api');
  // Dam bao khong tra password, session secret, env ra response
  const json = JSON.stringify(res.body);
  assert.ok(!/NEO4J_PASSWORD/i.test(json));
  assert.ok(!/SESSION_SECRET/i.test(json));
  assert.ok(!/password/i.test(json));
  assert.ok(typeof res.body.timestamp === 'string');
});

test('GET /api/health/neo4j tra 503 NEO4J_NOT_CONFIGURED khi thieu client', async () => {
  const app = buildApp({ neo4jClient: null });

  const res = await request(app).get('/api/health/neo4j');

  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'NEO4J_NOT_CONFIGURED');
  assert.ok(res.body.error.message.includes('Chua cau hinh'));
});

test('GET /api/health/neo4j tra 200 khi Neo4j ping thanh cong (qua fake adapter)', async () => {
  const neo4jClient = createFakeNeo4jClient({ shouldFail: false });
  const app = buildApp({ neo4jClient });

  const res = await request(app).get('/api/health/neo4j');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'connected');
  assert.equal(res.body.database, 'neo4j');
});

test('GET /api/health/neo4j tra 503 NEO4J_UNAVAILABLE khi ping that bai', async () => {
  const neo4jClient = createFakeNeo4jClient({ shouldFail: true, message: 'connection refused' });
  const app = buildApp({ neo4jClient });

  const res = await request(app).get('/api/health/neo4j');

  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'NEO4J_UNAVAILABLE');
  assert.match(res.body.error.message, /connection refused/);
});

test('Route khong ton tai trong /api tra 404 JSON', async () => {
  const app = buildApp();

  const res = await request(app).get('/api/does-not-exist');

  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('Middleware JSON parse loi tra 400 BAD_REQUEST', async () => {
  const app = buildApp();

  const res = await request(app)
    .post('/api/health')
    .set('Content-Type', 'application/json')
    .send('{invalid json');

  assert.equal(res.status, 400);
});