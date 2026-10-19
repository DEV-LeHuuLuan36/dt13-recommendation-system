import express, { Router } from 'express';
import session from 'express-session';
import { loadConfig } from './config.js';
import { createNeo4jClient } from './neo4j.js';
import { createHealthRouter } from './routes/health.js';
import { publicLogin, publicLogout, guardedMe } from './routes/auth.js';
import { createAdminRouter } from './routes/admin.js';
import { createRecommendationGraphRouter } from './routes/recommendationGraph.js';
import { createProductsRouter } from './routes/products.js';
import { createCategoriesRouter } from './routes/categories.js';
import { createCustomersRouter } from './routes/customers.js';
import { createInteractionsRouter } from './routes/interactions.js';
import { createHistoryRouter } from './routes/history.js';
import { createRecommendationsRouter } from './routes/recommendations.js';
import { createEventsRouter } from './routes/events.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requireAuth, requireAdmin, optionalAuth } from './middleware/auth.js';
import { resolveActor } from './middleware/actor.js';

// Create an Express app. Dependencies are injectable for unit tests.
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
        path: '/',
      },
      // MemoryStore is fine for single-process local development.
    })
  );

  app.use('/api/health', createHealthRouter({ neo4jClient, databaseName: config.neo4jDatabase }));

  // Public auth: login, logout.
  const publicAuth = Router();
  publicAuth.post('/login', publicLogin(neo4jClient));
  publicAuth.post('/logout', publicLogout());
  app.use('/api/auth', publicAuth);

  // /me requires an active session with a valid role/active account.
  const guardedAuth = Router();
  guardedAuth.use('/me', requireAuth(neo4jClient));
  guardedAuth.get('/me', guardedMe(neo4jClient));
  app.use('/api/auth', guardedAuth);

  // Admin endpoints share requireAuth + requireAdmin; analytics sits under the same guard.
  const adminRouter = createAdminRouter({ neo4jClient });
  const recGraphRouter = createRecommendationGraphRouter({ neo4jClient });
  const guardedAdmin = Router();
  guardedAdmin.use(requireAuth(neo4jClient), requireAdmin());
  guardedAdmin.use('/', adminRouter);
  guardedAdmin.use('/', recGraphRouter);
  app.use('/api/analytics', guardedAdmin);

  // Product/Category/Customer/Interactions/History/Recommendations all require an active session;
  // router-level checks further restrict each verb to the right role.
  // Products and Categories allow public GET for guests; mutations are guarded within routers.
  app.use('/api/products', createProductsRouter({ neo4jClient }));
  app.use('/api/categories', createCategoriesRouter({ neo4jClient }));

  const guardedCustomers = Router();
  guardedCustomers.use(requireAuth(neo4jClient));
  guardedCustomers.use('/', createCustomersRouter({ neo4jClient }));
  app.use('/api/customers', guardedCustomers);

  const guardedInteractions = Router();
  guardedInteractions.use(requireAuth(neo4jClient));
  guardedInteractions.use('/', createInteractionsRouter({ neo4jClient }));
  app.use('/api/interactions', guardedInteractions);

  const guardedHistory = Router();
  guardedHistory.use(requireAuth(neo4jClient));
  guardedHistory.use('/', createHistoryRouter({ neo4jClient }));
  app.use('/api/me/history', guardedHistory);

  // Events and search history support both Customers and Guests with cookie identification
  const eventsRouter = createEventsRouter({ neo4jClient });
  app.use('/api/events', optionalAuth(neo4jClient), resolveActor(), eventsRouter);
  app.use('/api/me', optionalAuth(neo4jClient), resolveActor(), eventsRouter);

  // Recommendations: open to Customers and Guests (internal handlers protect /me for customers)
  app.use(
    '/api/recommendations',
    optionalAuth(neo4jClient),
    resolveActor(),
    createRecommendationsRouter({ neo4jClient })
  );

  // Return JSON 404 for any unknown /api route and a unified error envelope.
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

// Build the app and Neo4j client once for the real server entry point.
export function bootstrap(env = process.env) {
  const config = loadConfig(env);
  const neo4jClient = createNeo4jClient(config);
  const sessionSecret = config.sessionSecret || 'dev-only-secret';
  const app = createApp({ neo4jClient, sessionSecret, env });
  return { app, config, neo4jClient };
}
