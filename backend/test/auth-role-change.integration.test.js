/**
 * Integration test cho role/active change voi Neo4j that.
 *
 * PROMPT_HOAN_TAT_GIAI_DOAN_2 muc 9:
 *  - Tao 1 admin gia (fix role=admin) trong fixture rieng
 *  - Login -> /me role=admin
 *  - Update role trong DB (set role='customer')
 *  - /me phai tra role='customer' (session cu khong con quyen)
 *  - Cleanup fixture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import neo4j from 'neo4j-driver';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { bootstrap } from '../src/app.js';
import { hashPassword } from '../src/password.js';

async function setupFixtureCustomer(session, runId, role) {
  const customerId = `${runId}_C`;
  const email = `${role.toLowerCase()}-${runId.toLowerCase()}@example.test`;
  const password = 'TestPwd-001-FIXTURE';
  const passwordHash = await hashPassword(password);
  await session.executeWrite(async (tx) => {
    await tx.run(
      `MERGE (c:Customer { customerId: $customerId })
       ON CREATE SET c.email = $email, c.name = $name, c.role = $role, c.active = true, c.datasetTag = $marker, c.createdAt = datetime()
       SET c.passwordHash = $passwordHash`,
      { customerId, email, name: `Auth Fixture ${role}`, role, marker: runId, passwordHash }
    );
  });
  return { customerId, email, password, role };
}

test('integration: role change + inactive theo PROMPT_GIAI_DOAN_2', async (t) => {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    t.skip('NEO4J khong cau hinh; bo qua.');
    return;
  }
  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { disableLosslessIntegers: true }
  );
  const session = driver.session({ database: config.neo4jDatabase });
  const { app, neo4jClient } = bootstrap();

  t.after(async () => {
    try {
      await session.executeWrite(async (tx) => {
        await tx.run(`MATCH (n) WHERE n.datasetTag STARTS WITH 'DT13_TEST_AUTH_' DETACH DELETE n`);
      });
    } catch {
      /* ignore */
    }
    await session.close();
    await driver.close();
    if (neo4jClient && typeof neo4jClient.close === 'function') {
      try {
        await neo4jClient.close();
      } catch {
        /* ignore */
      }
    }
  });

  await t.test('demote role: admin -> customer, session cu mat quyen', async () => {
    const runId = `DT13_TEST_AUTH_${randomBytes(4).toString('hex')}`;
    const fx = await setupFixtureCustomer(session, runId, 'admin');

    const login = await request(app).post('/api/auth/login').send({ email: fx.email, password: fx.password });
    assert.equal(login.status, 200, `Login that bai: ${JSON.stringify(login.body)}`);
    assert.equal(login.body.profile.role, 'admin');
    assert.equal(login.body.profile.customerId, fx.customerId);
    const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
    assert.ok(cookie, 'Phai co cookie');

    const me1 = await request(app).get('/api/auth/me').set('Cookie', cookie);
    assert.equal(me1.status, 200);
    assert.equal(me1.body.profile.role, 'admin');

    const r1 = await request(app).get('/api/analytics/graph-stats').set('Cookie', cookie);
    assert.equal(r1.status, 200, `Admin route phai 200 truoc khi demote nhung la ${r1.status}`);

    await session.executeWrite(async (tx) => {
      await tx.run(`MATCH (c:Customer { customerId: $cid }) SET c.role = 'customer'`, { cid: fx.customerId });
    });

    const me2 = await request(app).get('/api/auth/me').set('Cookie', cookie);
    assert.equal(me2.status, 200);
    assert.equal(me2.body.profile.role, 'customer', 'Sau demote, /me phai tra role=customer');
    assert.equal(me2.body.profile.customerId, fx.customerId);
    assert.doesNotMatch(JSON.stringify(me2.body), /passwordHash|salt/);

    const r2 = await request(app).get('/api/analytics/graph-stats').set('Cookie', cookie);
    assert.equal(r2.status, 403, `Sau demote, admin route phai 403 nhung ${r2.status}`);
  });

  await t.test('inactive: login that bai 403 voi ACCOUNT_DISABLED', async () => {
    const runId = `DT13_TEST_AUTH_${randomBytes(4).toString('hex')}`;
    const fx = await setupFixtureCustomer(session, runId, 'customer');
    await session.executeWrite(async (tx) => {
      await tx.run(`MATCH (c:Customer { customerId: $cid }) SET c.active = false`, { cid: fx.customerId });
    });
    const res = await request(app).post('/api/auth/login').send({ email: fx.email, password: fx.password });
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
    assert.equal(res.body.error?.code, 'ACCOUNT_INACTIVE');
  });

  await t.test('profile chi chua whitelist (khong co passwordHash)', async () => {
    const runId = `DT13_TEST_AUTH_${randomBytes(4).toString('hex')}`;
    const fx = await setupFixtureCustomer(session, runId, 'customer');
    const login = await request(app).post('/api/auth/login').send({ email: fx.email, password: fx.password });
    assert.equal(login.status, 200, `Expected 200, got ${login.status}: ${JSON.stringify(login.body)}`);
    const keys = Object.keys(login.body.profile);
    assert.deepEqual(keys.sort(), ['active', 'createdAt', 'customerId', 'email', 'name', 'role']);
    assert.doesNotMatch(JSON.stringify(login.body), /passwordHash|salt/);
  });
});