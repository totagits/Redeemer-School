-- Secure learner assignment submissions, direct messaging, inbox alerts and push endpoints.
CREATE TABLE IF NOT EXISTS assessment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  student_id uuid NOT NULL,
  response_text text,
  attachment_name text,
  attachment_mime text,
  attachment_bytes bytea,
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','RETURNED','REVIEWED')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  feedback text,
  score numeric(7,2) CHECK (score >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, assessment_id) REFERENCES assessments(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, reviewed_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, assessment_id, student_id),
  UNIQUE (school_id, id),
  CHECK (response_text IS NOT NULL OR attachment_bytes IS NOT NULL),
  CHECK (response_text IS NULL OR length(response_text) <= 20000),
  CHECK ((attachment_name IS NULL) = (attachment_bytes IS NULL)),
  CHECK ((attachment_bytes IS NULL) OR (octet_length(attachment_bytes) <= 5242880 AND attachment_mime IN ('application/pdf','image/jpeg','image/png','text/plain'))),
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS assessment_submissions_due_idx ON assessment_submissions(school_id, assessment_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS portal_message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  teacher_user_id uuid NOT NULL,
  subject text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, teacher_user_id) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id),
  UNIQUE (school_id, student_id, teacher_user_id, subject)
);
CREATE TABLE IF NOT EXISTS portal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  FOREIGN KEY (school_id, thread_id) REFERENCES portal_message_threads(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, sender_user_id) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);
CREATE INDEX IF NOT EXISTS portal_messages_thread_idx ON portal_messages(school_id, thread_id, created_at);

CREATE TABLE IF NOT EXISTS portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('MESSAGE','ASSIGNMENT','ANNOUNCEMENT','ATTENDANCE','SYSTEM')),
  title text NOT NULL,
  body text NOT NULL,
  target_url text,
  announcement_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, announcement_id) REFERENCES announcements(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, id)
);
CREATE INDEX IF NOT EXISTS portal_notifications_user_idx ON portal_notifications(school_id,user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS portal_notifications_announcement_once_idx ON portal_notifications(school_id,user_id,announcement_id) WHERE announcement_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, user_id, endpoint),
  UNIQUE (school_id, id)
);

INSERT INTO permissions(code,description) VALUES
 ('portal.notifications.read','View and manage own portal notifications'),
 ('portal.messages.read','Read direct school portal messages'),
 ('portal.messages.write','Send direct school portal messages'),
 ('assignments.submit','Submit own assigned class work'),
 ('assignments.review','Review submissions for assigned classes'),
 ('push.register','Register push alerts for own account'),
 ('communications.sms.send','Send configured school SMS notifications')
ON CONFLICT(code) DO NOTHING;

INSERT INTO role_permissions(school_id,role_id,permission_code)
SELECT r.school_id,r.id,g.permission_code FROM school_roles r
JOIN (VALUES
 ('SCHOOL_ADMIN','portal.notifications.read'),('SCHOOL_ADMIN','portal.messages.read'),('SCHOOL_ADMIN','portal.messages.write'),('SCHOOL_ADMIN','push.register'),('SCHOOL_ADMIN','communications.sms.send'),
 ('PRINCIPAL','portal.notifications.read'),('PRINCIPAL','portal.messages.read'),('PRINCIPAL','portal.messages.write'),('PRINCIPAL','push.register'),('PRINCIPAL','communications.sms.send'),
 ('CAMPUS_ADMIN','portal.notifications.read'),('CAMPUS_ADMIN','portal.messages.read'),('CAMPUS_ADMIN','portal.messages.write'),('CAMPUS_ADMIN','push.register'),('CAMPUS_ADMIN','communications.sms.send'),
 ('TEACHER','portal.notifications.read'),('TEACHER','portal.messages.read'),('TEACHER','portal.messages.write'),('TEACHER','assignments.review'),('TEACHER','push.register'),
 ('STUDENT','portal.notifications.read'),('STUDENT','portal.messages.read'),('STUDENT','portal.messages.write'),('STUDENT','assignments.submit'),('STUDENT','push.register'),
 ('PARENT','portal.notifications.read'),('PARENT','portal.messages.read'),('PARENT','portal.messages.write'),('PARENT','push.register')
) AS g(role_code,permission_code) ON r.code=g.role_code
ON CONFLICT(school_id,role_id,permission_code) DO NOTHING;

GRANT SELECT,INSERT,UPDATE,DELETE ON assessment_submissions,portal_message_threads,portal_messages,portal_notifications,push_subscriptions TO redeemer_runtime;
ALTER TABLE assessment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_submissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON assessment_submissions USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
ALTER TABLE portal_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_message_threads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON portal_message_threads USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON portal_messages USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
ALTER TABLE portal_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON portal_notifications USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON push_subscriptions USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
