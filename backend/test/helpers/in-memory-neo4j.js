/**
 * Adapter in-memory cho test offline (khong phai CSDL that).
 * - Chua Customer voi passwordHash (hash qua hashPassword truoc khi seed).
 * - findCustomerByEmail/findCustomerById hoat dong nhu Cypher query that.
 * - graphStats tra ve so lieu da seed.
 */
export function createInMemoryAdapter({
  customers = [],
} = {}) {
  const byEmail = new Map();
  const byId = new Map();
  for (const c of customers) {
    byEmail.set(c.email.toLowerCase(), c);
    byId.set(c.customerId, c);
  }

  return {
    database: 'neo4j',
    async ping() { return { ok: true }; },
    async close() {},
    async read(query, params = {}) {
      const q = query.trim();
      // findCustomerByEmail
      if (q.includes('MATCH (c:Customer { email: $email })')) {
        const c = byEmail.get(String(params.email || '').toLowerCase());
        return wrap({ records: c ? [{ get: () => ({ properties: c }) }] : [] });
      }
      // findCustomerById (with role/active subselect)
      if (q.includes('MATCH (c:Customer { customerId: $customerId }) RETURN c.role AS role, c.active AS active')) {
        const c = byId.get(params.customerId);
        return wrap({ records: c ? [{ get: (k) => c[k] }] : [] });
      }
      if (q.includes('MATCH (c:Customer { customerId: $customerId })')) {
        const c = byId.get(params.customerId);
        return wrap({ records: c ? [{ get: () => ({ properties: c }) }] : [] });
      }
      // graphStats (chi co query nay chua 'monthly'... do chi co graphStats)
      if (q.includes('graphStats') || (q.includes('customerNodes') && q.includes('boughtEdges'))) {
        return wrapStats(byId);
      }
      return wrap({ records: [] });
    },
    async write() { return wrap({ records: [] }); },
    async withTransaction() { return null; },
  };
}

function wrap(result) {
  // Bo sung prototype result de giong neo4j driver.
  result.records = result.records || [];
  return result;
}

function wrapStats(byId) {
  const stats = {
    customerNodes: byId.size,
    customerRoleNodes: [...byId.values()].filter((c) => c.role === 'customer').length,
    adminRoleNodes: [...byId.values()].filter((c) => c.role === 'admin').length,
    productNodes: 0,
    categoryNodes: 0,
    boughtEdges: 0,
    viewedEdges: 0,
    belongsToEdges: 0,
  };
  return wrap({
    records: [{
      get: (k) => stats[k],
    }],
  });
}