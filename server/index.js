import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createAuthRouter } from './auth.js';
import { createOperationsRouter } from './operations.js';
import { createPublicAdmissionsRouter } from './publicAdmissions.js';
import { createDigitalStudentIdRouter } from './studentDigitalId.js';
import { createPortalPhotoRouter } from './portalPhotos.js';
import { isStrongSessionSecret } from './authCrypto.js';
import { applyAdmissionsMigrationIfRequested } from './applyAdmissionsMigration.js';

// This runs only when explicitly enabled after a verified staging backup.
await applyAdmissionsMigrationIfRequested();
// Only executes after explicit opt-in and staging backup confirmation.
const { applyStudentPhotoMigrationIfRequested } = await import('./applyStudentPhotoMigration.js');
await applyStudentPhotoMigrationIfRequested();
const { applyDigitalStudentIdMigrationIfRequested } = await import('./applyDigitalStudentIdMigration.js');
await applyDigitalStudentIdMigrationIfRequested();
const { applyPortalPhotoMigrationIfRequested } = await import('./applyPortalPhotoMigration.js');
await applyPortalPhotoMigrationIfRequested();
const { applyEmisHistoricalMigrationIfRequested } = await import('./applyEmisHistoricalMigration.js');
await applyEmisHistoricalMigrationIfRequested();

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '../dist');

// Protected application APIs and readiness checks use only the dedicated,
// non-superuser runtime role. DATABASE_URL is reserved for migrations and
// administrative bootstrap and is not required by the running application.
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
// Coolify routes requests through one trusted reverse proxy. This lets IP-based
// login and public-intake protections see the originating client address.
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
// Assignment submissions may contain one small school document (encoded in
// JSON). The endpoint enforces a strict per-file limit before writing to DB.
app.use(express.json({ limit: '9mb' }));

app.get('/api/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok', release: 'finance-grade-stage-match-v1' });
});

app.get('/api/health/ready', async (_req, res) => {
  if (!runtimePool) {
    return res.status(503).json({ status: 'not_ready', database: 'not_configured' });
  }
  try {
    await runtimePool.query('SELECT 1');
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
app.use('/api/operations', createOperationsRouter({ authenticate: authRouter.requireAuth, pool: runtimePool }));
app.use('/api/student-id', createDigitalStudentIdRouter({ authenticate: authRouter.requireAuth }));
app.use('/api/portal-photos', createPortalPhotoRouter({ authenticate: authRouter.requireAuth }));
app.use('/api/public/admissions', createPublicAdmissionsRouter({ pool: runtimePool }));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Vite fingerprints compiled assets, so those may be cached safely. The app shell
// must always be revalidated after a deployment to avoid a stale client UI.
app.use(express.static(distDir, {
  index: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (/[/\\]assets[/\\].*\.[a-f0-9]{8,}\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.sendFile(path.join(distDir, 'index.html'));
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Redeemer School ERP server listening on port ${port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; closing server and database pool.`);
  server.close(async () => {
    await Promise.all([runtimePool?.end()].filter(Boolean));
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
