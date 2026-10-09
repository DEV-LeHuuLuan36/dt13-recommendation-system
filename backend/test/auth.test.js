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

test('POST /api/auth/login thanh cong voi email chinh xac (khong phan biet hoa thuong)', async () => {
  const { app } = await buildFixture();
  const agent = request.agent(app);
  const res = await login(agent, '  Cust001@Example.test  ', 'cust-secret-001');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.profile.customerId, 'CUST_001');
  assert.equal(res.body.profile.role, 'customer');
  // Khong chua passwordHash
  assert.ok(!('passwordHash' in res.body.profile));
  // Set-Cookie dt13.sid phai co httpOnly
  const setCookie = res.headers['set-cookie'];
  assert.ok(setCookie && setCookie.some((c) => /^dt13\.sid=/.test(c)));
  assert.ok(setCookie.some((c) => /HttpOnly/i.test(c)));
});

test('POST /api/auth/login that bai voi mat khau sai -> 401', async () => {
  const { app } = await buildFixture();
  const res = await request(app).post('/api/auth/login').send({ email: 'cust001@example.test', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_INVALID');
});

test('POST /api/auth/login that bai voi email khong ton tai -> 401 (thong diep chung)', async () => {
  const { app } = await buildFixture();
  const res = await request(app).post('/api/auth/login').send({ email: 'noone@example.test', password: 'whatever' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_INVALID');
});

test('POST /api/auth/login voi tai khoan inactive -> 403', async () => {
  const { app } = await buildFixture();
  const res = await request(app).post('/api/auth/login').send({ email: 'inactive@example.test', password: 'cust-secret-001' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ACCOUNT_INACTIVE');
});

test('POST /api/auth/login validate email input', async () => {
  const { app } = await buildFixture();
  const r1 = await request(app).post('/api/auth/login').send({ email: 'khong-hop-le', password: 'abc' });
  assert.equal(r1.status, 400);
  const r2 = await request(app).post('/api/auth/login').send({ email: 'ok@example.test', password: '' });
  assert.equal(r2.status, 400);
  const r3 = await request(app).post('/api/auth/login').send({});
  assert.equal(r3.status, 400);
});

test('GET /api/auth/me 401 neu chua dang nhap', async () => {
  const { app } = await buildFixture();
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
});

test('GET /api/auth/me tra profile sau khi login (cookie reuse)', async () => {
  const { app } = await buildFixture();
  const agent = request.agent(app);
  await login(agent, 'admin@example.test', 'admin-secret-001');
  const res = await agent.get('/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.profile.customerId, 'ADMIN_001');
  assert.equal(res.body.profile.role, 'admin');
});

test('POST /api/auth/logout 204 va xoa cookie; GET /me sau do 401', async () => {
  const { app } = await buildFixture();
  const agent = request.agent(app);
  await login(agent, 'admin@example.test', 'admin-secret-001');
  const out = await agent.post('/api/auth/logout');
  assert.equal(out.status, 204);
  const setCookie = out.headers['set-cookie'] || [];
  // Cookie clear phai co Max-Age=0 hoac expires qua khu
  assert.ok(setCookie.some((c) => /Max-Age=0/i.test(c) || /Expires=/i.test(c)));
  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 401);
});

test('GET /api/analytics/graph-stats 401 neu chua dang nhap', async () => {
  const { app } = await buildFixture();
  const res = await request(app).get('/api/analytics/graph-stats');
  assert.equal(res.status, 401);
});

test('GET /api/analytics/graph-stats 403 neu la customer', async () => {
  const { app } = await buildFixture();
  const agent = request.agent(app);
  await login(agent, 'cust001@example.test', 'cust-secret-001');
  const res = await agent.get('/api/analytics/graph-stats');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ADMIN_REQUIRED');
});

test('GET /api/analytics/graph-stats 200 neu la admin', async () => {
  const { app } = await buildFixture();
  const agent = request.agent(app);
  await login(agent, 'admin@example.test', 'admin-secret-001');
  const res = await agent.get('/api/analytics/graph-stats');
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.customerNodes, 'number');
  assert.equal(res.body.adminRoleNodes, 1);
});

test('Phien cu khong con quyen admin neu role bi thay doi (se test integration)', async () => {
  // Tinh nang nay phu thuoc CSDL that; integration test voi Neo4j that se thuc hien sau khi
  // instance san sang. O day chi smoke test rang me/admin-role tra ve dung customerId.
  const { app } = await buildFixture();
  const agent = request.agent(app);
  await login(agent, 'admin@example.test', 'admin-secret-001');
  const me1 = await agent.get('/api/auth/me');
  assert.equal(me1.body.profile.role, 'admin');
  assert.equal(me1.body.profile.customerId, 'ADMIN_001');
});