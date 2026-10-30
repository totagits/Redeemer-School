import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// The existing Linux CI test step already provides Docker. Local developers can
// opt in with npm run test:exam-postgres instead of requiring Docker for npm test.
test('PostgreSQL 18 examination contention checks', {
  skip: process.env.CI !== 'true' || process.platform !== 'linux', timeout: 240_000,
}, async t => {
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ['server/testing/runExamPostgres.js'], {
      timeout: 230_000, maxBuffer: 2_000_000, windowsHide: true,
    });
    t.diagnostic(stdout);
  } catch (error) {
    t.diagnostic(error.stdout || '');
    t.diagnostic(error.stderr || '');
    throw Error('Disposable PostgreSQL examination contention checks failed; inspect diagnostics.');
  }
});
