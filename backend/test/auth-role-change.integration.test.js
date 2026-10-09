/**
 * Integration test for role/active changes against a real Neo4j.
 *
 * Verifies that:
 *  - Login succeeds for a fixture admin and /me returns role=admin.
 *  - Demoting the role in the DB makes subsequent /me reflect the new role,
 *    and the previous session can no longer hit admin-only routes.
 *  - Inactive accounts are rejected at login.
 *  - The /me payload never includes passwordHash/salt or any other private field.
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

test('integration: role change + inactive', async (t) => {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    t.skip('NEO4J not configured; skipping.');
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

  await t.test('demote role: admin -> customer, existing session loses admin privilege', async () => {
    const runId = `DT13_TEST_AUTH_${randomBytes(4).toString('hex')}`;
    const fx = await setupFixtureCustomer(session, runId, 'admin');

    const login = await request(app).post('/api/auth/login').send({ email: fx.email, password: fx.password });
    assert.equal(login.status, 200, `Login failed: ${JSON.stringify(login.body)}`);
    assert.equal(login.body.profile.role, 'admin');
    assert.equal(login.body.profile.customerId, fx.customerId);
    const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
    assert.ok(cookie, 'session cookie must be set');

    const me1 = await request(app).get('/api/auth/me').set('Cookie', cookie);
    assert.equal(me1.status, 200);
    assert.equal(me1.body.profile.role, 'admin');

    const r1 = await request(app).get('/api/analytics/graph-stats').set('Cookie', cookie);
    assert.equal(r1.status, 200, `Admin route must return 200 before demote, got ${r1.status}`);

    await session.executeWrite(async (tx) => {
      await tx.run(`MATCH (c:Customer { customerId: $cid }) SET c.role = 'customer'`, { cid: fx.customerId });
    });

    const me2 = await request(app).get('/api/auth/me').set('Cookie', cookie);
    assert.equal(me2.status, 200);
    assert.equal(me2.body.profile.role, 'customer', 'After demote, /me must report role=customer');
    assert.equal(me2.body.profile.customerId, fx.customerId);
    assert.doesNotMatch(JSON.stringify(me2.body), /passwordHash|salt/);

    const r2 = await request(app).get('/api/analytics/graph-stats').set('Cookie', cookie);
    assert.equal(r2.status, 403, `After demote, admin route must be 403 but was ${r2.status}`);
  });

  await t.test('inactive: login is rejected with 403 ACCOUNT_INACTIVE', async () => {
    const runId = `DT13_TEST_AUTH_${randomBytes(4).toString('hex')}`;
    const fx = await setupFixtureCustomer(session, runId, 'customer');
    await session.executeWrite(async (tx) => {
      await tx.run(`MATCH (c:Customer { customerId: $cid }) SET c.active = false`, { cid: fx.customerId });
    });
    const res = await request(app).post('/api/auth/login').send({ email: fx.email, password: fx.password });
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
    assert.equal(res.body.error?.code, 'ACCOUNT_INACTIVE');
  });

  await t.test('/me profile contains only whitelisted fields (no passwordHash)', async () => {
    const runId = `DT13_TEST_AUTH_${randomBytes(4).toString('hex')}`;
    const fx = await setupFixtureCustomer(session, runId, 'customer');
    const login = await request(app).post('/api/auth/login').send({ email: fx.email, password: fx.password });
    assert.equal(login.status, 200, `Expected 200, got ${login.status}: ${JSON.stringify(login.body)}`);
    const keys = Object.keys(login.body.profile);
    assert.deepEqual(keys.sort(), ['active', 'createdAt', 'customerId', 'email', 'name', 'role']);
    assert.doesNotMatch(JSON.stringify(login.body), /passwordHash|salt/);
  });
});