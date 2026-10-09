#!/usr/bin/env node
/**
 * Local backend with an in-memory adapter (no real Neo4j needed).
 * Useful for smoke-testing the session/cookie/proxy flow against the real frontend.
 * Do NOT use in production.
 */
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/password.js';
import { createInMemoryAdapter } from '../test/helpers/in-memory-neo4j.js';

const PORT = Number.parseInt(process.env.PORT, 10) || 3101;
const HOST = process.env.HOST || '127.0.0.1';

async function main() {
  const adminHash = await hashPassword('admin-demo-001');
  const customerHash = await hashPassword('cust-demo-001');
  const adapter = createInMemoryAdapter({
    customers: [
      { customerId: 'ADMIN_001', name: 'Quan tri DT13', email: 'admin@example.test', role: 'admin', active: true, passwordHash: adminHash },
      { customerId: 'CUST_001', name: 'Khach A', email: 'cust001@example.test', role: 'customer', active: true, passwordHash: customerHash },
      { customerId: 'CUST_002', name: 'Khach B', email: 'cust002@example.test', role: 'customer', active: true, passwordHash: customerHash },
    ],
  });
  const app = createApp({ neo4jClient: adapter, sessionSecret: 'live-server-secret-for-smoke-test', env: {} });
  app.listen(PORT, HOST, () => {
    console.log(`[live-server] Listening on http://${HOST}:${PORT} (in-memory adapter)`);
    console.log('[live-server] Demo accounts: admin@example.test / admin-demo-001; cust001@example.test / cust-demo-001');
  });
}

main().catch((err) => {
  console.error('[live-server] failed:', err);
  process.exit(1);
});