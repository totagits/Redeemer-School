// Owns a disposable loopback-only database. Never reads DATABASE_URL.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const exec = promisify(execFile);
const container = 'redeemer-exam-test-' + randomBytes(8).toString('hex');
const password = randomBytes(32).toString('hex');
let started = false;
let stage = 'checking Docker availability';
try {
  await exec('docker', ['info', '--format', '{{.ServerVersion}}']);
  stage = 'starting the official postgres:18 container';
  await exec('docker', ['run', '--detach', '--rm', '--name', container,
    '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_DB=redeemer_exam_test',
    '--env', 'POSTGRES_PASSWORD=' + password, 'postgres:18'], { timeout: 180_000 });
  started = true;
  const { stdout } = await exec('docker', ['port', container, '5432/tcp']);
  const port = Number(/^127\.0\.0\.1:(\d+)\s*$/.exec(stdout)?.[1]);
  if (!port) throw Error('Disposable database did not bind only to loopback.');
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/redeemer_exam_test`;
  stage = 'waiting for disposable PostgreSQL';
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 500 });
    try { await client.connect(); await client.query('SELECT 1'); ready = true; }
    catch { /* PostgreSQL may still be initializing. */ }
    finally { await client.end(); }
    if (ready) break;
    await delay(500);
  }
  if (!ready) throw Error('Disposable PostgreSQL did not become ready.');
  console.log('Running examination contention checks on disposable PostgreSQL 18.');
  const child = spawn(process.execPath, ['--test', 'server/testing/examPostgresConcurrency.js'], {
    stdio: 'inherit', env: { ...process.env, EXAM_TEST_DATABASE_URL: url }, windowsHide: true,
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
  });
} catch {
  // Do not print subprocess arguments or connection credentials.
  console.error('Local PostgreSQL examination checks failed while ' + stage + '. Ensure Docker Desktop is running and postgres:18 is available.');
  process.exitCode = 1;
} finally {
  if (started) await exec('docker', ['stop', '--time', '3', container]).catch(() => {
    console.error('Could not stop disposable test container: ' + container); process.exitCode = 1;
  });
}
