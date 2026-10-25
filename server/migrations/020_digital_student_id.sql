-- Revocable, school-scoped digital learner identity credentials.
-- QR codes carry only a signed opaque credential reference, never a learner's PII.
CREATE TABLE student_id_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  CHECK (expires_at > issued_at),
  FOREIGN KEY (school_id,student_id) REFERENCES students(school_id,id) ON DELETE CASCADE,
  FOREIGN KEY (school_id,issued_by) REFERENCES user_accounts(school_id,id),
  FOREIGN KEY (school_id,revoked_by) REFERENCES user_accounts(school_id,id),
  UNIQUE (school_id,id)
);
CREATE UNIQUE INDEX student_id_credentials_one_active
  ON student_id_credentials (school_id,student_id) WHERE revoked_at IS NULL;
CREATE INDEX student_id_credentials_student ON student_id_credentials (school_id,student_id,issued_at DESC);
ALTER TABLE student_id_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_id_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON student_id_credentials
  USING (school_id = app.current_school_id())
  WITH CHECK (school_id = app.current_school_id());
GRANT SELECT,INSERT,UPDATE ON student_id_credentials TO redeemer_runtime;
