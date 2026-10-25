-- Allow anonymous public applications to be attributed to the public form
-- rather than incorrectly attributing them to an individual staff account.
ALTER TABLE admission_applications
  ALTER COLUMN created_by DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS application_source text NOT NULL DEFAULT 'STAFF';

ALTER TABLE admission_applications
  ADD CONSTRAINT admission_applications_source_check
    CHECK (application_source IN ('STAFF', 'PUBLIC'));

ALTER TABLE admission_events
  ALTER COLUMN actor_user_id DROP NOT NULL;
