import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createAuthRouter } from './auth.js';
import { createOperationsRouter } from './operations.js';
import { isStrongSessionSecret } from './authCrypto.js';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '../dist');

// The frontend is still a demo and can be served before the staging database
// has been provisioned. Keep the site available, while reporting database
// readiness as unavailable until DATABASE_URL is configured.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  : null;
// Protected application APIs must use the dedicated, non-superuser runtime role.
// DATABASE_URL is reserved for migrations and administrative bootstrap only.
const runtimePool = process.env.RUNTIME_DATABASE_URL
  ? new Pool({
      connectionString: process.env.RUNTIME_DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  : null;
const sessionSecret = process.env.APP_SESSION_SECRET || '';
const authConfigured = Boolean(runtimePool && isStrongSessionSecret(sessionSecret));

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health/ready', async (_req, res) => {
  if (!pool) {
    return res.status(503).json({ status: 'not_ready', database: 'not_configured' });
  }
  try {
    await pool.query('SELECT 1');
  } catch {
    return res.status(503).json({ status: 'not_ready', database: 'unavailable' });
  }

  let authentication = 'not_configured';
  if (authConfigured) {
    try {
      const role = await runtimePool.query(
        `SELECT NOT r.rolsuper AND NOT r.rolbypassrls AS safe
         FROM pg_roles r WHERE r.rolname = current_user`
      );
      if (role.rows[0]?.safe !== true) {
        return res.status(503).json({
          status: 'not_ready',
          database: 'connected',
          authentication: 'unsafe_runtime_role',
        });
      }
      authentication = 'configured';
    } catch {
      return res.status(503).json({
        status: 'not_ready',
        database: 'connected',
        authentication: 'unavailable',
      });
    }
  }

  res.status(200).json({ status: 'ready', database: 'connected', authentication });
});

const authRouter = createAuthRouter({
  pool: runtimePool,
  secret: sessionSecret,
  sessionTtlMs: Number(process.env.AUTH_SESSION_TTL_MS || 8 * 60 * 60 * 1000),
});
app.use('/api/auth', authRouter);
app.use('/api/operations', createOperationsRouter({ authenticate: authRouter.requireAuth }));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.use(express.static(distDir, { index: false, maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Redeemer School ERP server listening on port ${port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; closing server and database pool.`);
  server.close(async () => {
    await Promise.all([pool?.end(), runtimePool?.end()].filter(Boolean));
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
