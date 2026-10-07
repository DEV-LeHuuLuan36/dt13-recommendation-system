import express from 'express';
import session from 'express-session';
import { loadConfig } from './config.js';
import { createNeo4jClient } from './neo4j.js';
import { createHealthRouter } from './routes/health.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

/**
 * Tao Express app. Có the truyen dependency vao de don vi test:
 *  - neo4jClient: instance thuc hoac null neu thieu cau hinh
 *  - sessionSecret: chuoi dung cho express-session
 */
export function createApp({ neo4jClient = null, sessionSecret = 'change-me', env = process.env } = {}) {
  const config = loadConfig(env);
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use(
    session({
      name: 'dt13.sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
        maxAge: 1000 * 60 * 60 * 8,
      },
      // MemoryStore chi su dung cho demo local; se thay the o giai doan 2 khi co luu tru phien.
    })
  );

  app.use('/api/health', createHealthRouter({ neo4jClient, databaseName: config.neo4jDatabase }));

  // 404 JSON cho cac route khong ton tai trong /api.
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Tao app va client Neo4j mot lan, su dung o `server.js`.
 */
export function bootstrap(env = process.env) {
  const config = loadConfig(env);
  const neo4jClient = createNeo4jClient(config);
  const sessionSecret = config.sessionSecret || 'dev-only-secret';
  const app = createApp({ neo4jClient, sessionSecret, env });
  return { app, config, neo4jClient };
}