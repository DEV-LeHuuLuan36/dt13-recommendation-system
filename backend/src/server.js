import 'dotenv/config';

import { bootstrap } from './app.js';

const { app, config, neo4jClient } = bootstrap();

const server = app.listen(config.port, config.host, () => {
  const neo4jState = neo4jClient ? 'configured' : 'not-configured';
  console.log(
    `[dt13-api] Listening on http://${config.host}:${config.port} (Neo4j: ${neo4jState}, db: ${config.neo4jDatabase || 'n/a'})`
  );
});

async function shutdown(signal) {
  console.log(`[dt13-api] Received ${signal}, shutting down...`);
  server.close(() => {
    console.log('[dt13-api] HTTP server closed');
  });
  if (neo4jClient && typeof neo4jClient.close === 'function') {
    try {
      await neo4jClient.close();
      console.log('[dt13-api] Neo4j driver closed');
    } catch (err) {
      console.warn(`[dt13-api] Error while closing Neo4j driver: ${err.message}`);
    }
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));