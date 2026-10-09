import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createInMemoryAdapter } from './helpers/in-memory-neo4j.js';
import { hashPassword } from '../src/password.js';

const VALID_SECRET = 'a-test-secret-for-supertest-auth';

async function buildFixture() {
  const adminHash = await hashPassword('admin-secret-001');
  const customerHash = await hashPassword('cust-secret-001');
  const customers = [
    {
      customerId: 'ADMIN_001',
      name: 'Quan tri',
      email: 'admin@example.test',
      role: 'admin',
      active: true,
      passwordHash: adminHash,
    },
    {
      customerId: 'CUST_001',
      name: 'Khach A',
      email: 'cust001@example.test',
      role: 'customer',
      active: true,
      passwordHash: customerHash,
    },
    {
      customerId: 'CUST_002',
      name: 'Inactive',
      email: 'inactive@example.test',
      role: 'customer',
      active: false,
      passwordHash: customerHash,
    },
  ];
  const adapter = createInMemoryAdapter({ customers });
  const app = createApp({ neo4jClient: adapter, sessionSecret: VALID_SECRET, env: {} });
  return { app, adapter, customers };
}

function login(agent, email, password) {
  return agent.post('/api/auth/login').send({ email, password });
}

test('POST /api/auth/login succeeds with normalized email (case + whitespace)', async () => {
  const { app } = await buildFixture();
  const agent = request.agent(app);
  const res = await login(agent, '  Cust001@Example.test  ', 'cust-secret-001');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.profile.customerId, 'CUST_001');
  assert.equal(res.body.profile.role, 'customer');
  // Response must not include passwordHash.
  assert.ok(!('passwordHash' in res.body.profile));
  // Set-Cookie dt13.sid must be httpOnly.
  const setCookie = res.headers['set-cookie'];
  assert.ok(setCookie && setCookie.some((c) => /^dt13\.sid=/.test(c)));
  assert.ok(setCookie.some((c) => /HttpOnly/i.test(c)));
});

test('POST /api/auth/login fails with wrong password -> 401', async () => {
  const { app } = await buildFixture();
  const res = await request(app).post('/api/auth/login').send({ email: 'cust001@example.test', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_INVALID');
});

test('POST /api/auth/login fails for unknown email -> 401 (generic message)', async () => {
  const { app } = await buildFixture();
  const res = await request(app).post('/api/auth/login').send({ email: 'noone@example.test', password: 'whatever' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_INVALID');
});

test('POST /api/auth/login for inactive account -> 403', async () => {
  const { app } = await buildFixture();
  const res = await request(app).post('/api/auth/login').send({ email: 'inactive@example.test', password: 'cust-secret-001' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ACCOUNT_INACTIVE');
});

test('POST /api/auth/login validates email and password input', async () => {
  const { app } = await buildFixture();
  const r1 = await request(app).post('/api/auth/login').send({ email: 'khong-hop-le', password: 'abc' });
  assert.equal(r1.status, 400);
  const r2 = await request(app).post('/api/auth/login').send({ email: 'ok@example.test', password: '' });
  assert.equal(r2.status, 400);
  const r3 = await request(app).post('/api/auth/login').send({});
  assert.equal(r3.status, 400);
});

test('GET /api/auth/me 401 when not logged in', async () => {
  const { app } = await buildFixture();
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
});

test('GET /api/auth/me returns profile after login (cookie reuse)', async () => {
  const { app } = await buildFixture();
  const agent = request.agent(app);
  await login(agent, 'admin@example.test', 'admin-secret-001');
  const res = await agent.get('/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.profile.customerId, 'ADMIN_001');
  assert.equal(res.body.profile.role, 'admin');
});

test('POST /api/auth/logout returns 204, clears cookie; subsequent /me is 401', async () => {
  const { app } = await buildFixture();
  const agent = request.agent(app);
  await login(agent, 'admin@example.test', 'admin-secret-001');
  const out = await agent.post('/api/auth/logout');
  assert.equal(out.status, 204);
  const setCookie = out.headers['set-cookie'] || [];
  // Clearing cookie must use Max-Age=0 or a past Expires.
  assert.ok(setCookie.some((c) => /Max-Age=0/i.test(c) || /Expires=/i.test(c)));
  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 401);
});

test('GET /api/analytics/graph-stats 401 when not logged in', async () => {
  const { app } = await buildFixture();
  const res = await request(app).get('/api/analytics/graph-stats');
  assert.equal(res.status, 401);
});

test('GET /api/analytics/graph-stats 403 for customers', async () => {
  const { app } = await buildFixture();
  const agent = request.agent(app);
  await login(agent, 'cust001@example.test', 'cust-secret-001');
  const res = await agent.get('/api/analytics/graph-stats');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ADMIN_REQUIRED');
});

test('GET /api/analytics/graph-stats 200 for admins', async () => {
  const { app } = await buildFixture();
  const agent = request.agent(app);
  await login(agent, 'admin@example.test', 'admin-secret-001');
  const res = await agent.get('/api/analytics/graph-stats');
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.customerNodes, 'number');
  assert.equal(res.body.adminRoleNodes, 1);
});

test('Smoke: /me reports the correct role/customerId for an admin session', async () => {
  // Role-change behaviour is covered by an integration test against a real Neo4j.
  // Here we only verify the session payload reflects what was returned at login.
  const { app } = await buildFixture();
  const agent = request.agent(app);
  await login(agent, 'admin@example.test', 'admin-secret-001');
  const me1 = await agent.get('/api/auth/me');
  assert.equal(me1.body.profile.role, 'admin');
  assert.equal(me1.body.profile.customerId, 'ADMIN_001');
});
