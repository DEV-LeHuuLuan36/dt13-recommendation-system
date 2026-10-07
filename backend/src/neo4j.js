import neo4j from 'neo4j-driver';

/**
 * Tra ve client Neo4j neu cau hinh day du, nguoc lai null.
 * Khong tao driver khi thieu config de khong loi luc khoi dong.
 */
export function createNeo4jClient(config) {
  if (!config.neo4jFullyConfigured) {
    return null;
  }

  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    {
      // Connection timeout giu qua ngan de kiem tra khong treo.
      connectionTimeout: 5000,
      disableLosslessIntegers: true,
    }
  );

  return {
    driver,
    database: config.neo4jDatabase,
    async ping() {
      const session = this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.READ });
      try {
        await session.run('RETURN 1 AS ok');
        return { ok: true };
      } finally {
        await session.close();
      }
    },
    async read(query, params = {}) {
      const session = this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.READ });
      try {
        return await session.run(query, params);
      } finally {
        await session.close();
      }
    },
    async close() {
      await this.driver.close();
    },
  };
}

/** Tao adapter cho test/dependency injection (khong phai Neo4j that). */
export function createFakeNeo4jClient({ shouldFail = false, message = 'simulated failure' } = {}) {
  return {
    database: 'neo4j',
    async ping() {
      if (shouldFail) throw new Error(message);
      return { ok: true };
    },
    async read() {
      if (shouldFail) throw new Error(message);
      return { records: [] };
    },
    async close() {},
  };
}