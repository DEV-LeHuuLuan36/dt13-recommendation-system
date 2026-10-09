// Run `work` inside a Neo4j session and always close it. Throwing rolls back the transaction.
// Example:
//   await runInTransaction(client, async (tx) => {
//     await tx.run('CREATE ...', {});
//   });
export async function runInTransaction(client, work, { mode = 'WRITE' } = {}) {
  if (!client || !client.driver) {
    throw Object.assign(new Error('Database is not configured'), {
      status: 503,
      code: 'NEO4J_NOT_CONFIGURED',
    });
  }
  const session = client.driver.session({
    database: client.database,
    defaultAccessMode: mode === 'READ' ? client.driver.READ : client.driver.WRITE,
  });
  try {
    return await session.executeWrite(async (tx) => work({
      async run(query, params = {}) {
        return tx.run(query, params);
      },
    }));
  } finally {
    await session.close();
  }
}

export async function runRead(client, query, params = {}) {
  if (!client) {
    throw Object.assign(new Error('Database is not configured'), {
      status: 503,
      code: 'NEO4J_NOT_CONFIGURED',
    });
  }
  return client.read(query, params);
}
