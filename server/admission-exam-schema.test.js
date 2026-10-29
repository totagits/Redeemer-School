import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('./migrations/104_admission_exam_attempt_foundation.sql', import.meta.url), 'utf8');

test('all exam assessment tables enforce tenant-scoped row security', () => {
  for (const table of ['admission_exam_questions', 'admission_exam_attempts', 'admission_exam_answers']) {
    assert.match(migration, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`));
    assert.match(migration, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`));
    assert.match(migration, new RegExp(`CREATE POLICY tenant_school_scope ON ${table}`));
  }
});

test('one attempt per exam applicant, with time-consistent submission status', () => {
  assert.match(migration, /UNIQUE \(school_id,exam_id,application_id\)/);
  assert.match(migration, /status='SUBMITTED' AND submitted_at IS NOT NULL/);
  assert.match(migration, /submitted_at IS NULL OR submitted_at >= started_at/);
  assert.match(migration, /REFERENCES admission_exam_assignments\(school_id,exam_id,application_id\)/);
});

test('answers and questions remain bound to the same school and exam', () => {
  assert.match(migration, /REFERENCES admission_exam_attempts\(school_id,exam_id,id\)/);
  assert.match(migration, /REFERENCES admission_exam_questions\(school_id,exam_id,id\)/);
  assert.match(migration, /PRIMARY KEY \(school_id,attempt_id,question_id\)/);
});

test('question constraints reject out-of-range choice keys and invalid answer shapes', () => {
  assert.match(migration, /jsonb_array_length\(options\) BETWEEN 2 AND 8/);
  assert.match(migration, /answer_key #>> '\{\}'\)::integer < jsonb_array_length\(options\)/);
  assert.match(migration, /jsonb_typeof\(answer\) IN \('string','number'\)/);
});
