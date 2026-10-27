-- Secure two-way messaging between linked guardians and authorized school staff.
CREATE TABLE IF NOT EXISTS family_message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  guardian_user_id uuid NOT NULL,
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id,id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, guardian_user_id) REFERENCES user_accounts(school_id,id) ON DELETE CASCADE,
  UNIQUE (school_id,id)
);
CREATE INDEX IF NOT EXISTS family_message_threads_school_updated_idx ON family_message_threads(school_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS family_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  FOREIGN KEY (school_id,thread_id) REFERENCES family_message_threads(school_id,id) ON DELETE CASCADE,
  FOREIGN KEY (school_id,sender_user_id) REFERENCES user_accounts(school_id,id),
  UNIQUE (school_id,id)
);
CREATE INDEX IF NOT EXISTS family_messages_thread_idx ON family_messages(school_id,thread_id,created_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON family_message_threads,family_messages TO redeemer_runtime;
ALTER TABLE family_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_message_threads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON family_message_threads USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
ALTER TABLE family_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON family_messages USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
