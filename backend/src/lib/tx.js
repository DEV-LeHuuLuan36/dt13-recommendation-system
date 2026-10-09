/**
 * Async transaction helper. Dam bao session duoc dong trong finally, ke ca khi callback throw.
 * Tra ve gia tri tu callback.
 *
 * Vi du:
 *   const result = await runInTransaction(client, async (tx) => {
 *     await tx.run(...);
 *     return something;
 *   });
 */
export async function runInTransaction(client, work, { mode = 'WRITE' } = {}) {
  if (!client || !client.driver) {
    throw Object.assign(new Error('CSDL chua san sang'), {
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

/**
 * read helper, dam bao session dong. Tra ve Result.
 */
export async function runRead(client, query, params = {}) {
  if (!client) {
    throw Object.assign(new Error('CSDL chua san sang'), {
      status: 503,
      code: 'NEO4J_NOT_CONFIGURED',
    });
  }
  return client.read(query, params);
}
