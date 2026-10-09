import neo4j from 'neo4j-driver';

// Return null when config is incomplete so the server can start without Neo4j
// (the health endpoint will report NEO4J_NOT_CONFIGURED).
export function createNeo4jClient(config) {
  if (!config.neo4jFullyConfigured) {
    return null;
  }

  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    {
      // Short connection timeout so a missing server fails fast instead of hanging boot.
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
    async write(query, params = {}) {
      const session = this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.WRITE });
      try {
        return await session.run(query, params);
      } finally {
        await session.close();
      }
    },
    // Run `work` inside a WRITE transaction. Throwing rolls back automatically.
    async withTransaction(work) {
      const session = this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.WRITE });
      try {
        return await session.executeWrite(async (tx) => {
          const ctx = {
            async run(query, params = {}) {
              return tx.run(query, params);
            },
          };
          return work(ctx);
        });
      } finally {
        await session.close();
      }
    },
    async close() {
      await this.driver.close();
    },
  };
}

// Test adapter: not a real Neo4j client, used for dependency injection in tests.
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
    async write() {
      if (shouldFail) throw new Error(message);
      return { records: [] };
    },
    async withTransaction() {
      if (shouldFail) throw new Error(message);
      return null;
    },
    async close() {},
  };
}
