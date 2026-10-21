import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '../dist');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Configure PostgreSQL before starting the production server.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'not_ready', database: 'unavailable' });
  }
});

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
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
