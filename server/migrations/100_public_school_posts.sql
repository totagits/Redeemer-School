-- Public website content is deliberately separate from private class/guardian announcements.
-- Run through the reviewed db:migrate process after a verified staging backup.
CREATE TABLE public_school_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('NEWS','EVENT')),
 title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
 summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 500),
 body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
 status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','UNPUBLISHED')),
 event_starts_at timestamptz,
 created_by uuid NOT NULL,
 published_by uuid,
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (school_id,created_by) REFERENCES user_accounts(school_id,id),
 FOREIGN KEY (school_id,published_by) REFERENCES user_accounts(school_id,id),
 UNIQUE(school_id,id),
 CHECK (kind='EVENT' OR event_starts_at IS NULL)
);
CREATE INDEX public_school_posts_published_idx ON public_school_posts(school_id,published_at DESC)
 WHERE status='PUBLISHED';
GRANT SELECT,INSERT,UPDATE,DELETE ON public_school_posts TO redeemer_runtime;
ALTER TABLE public_school_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_school_posts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON public_school_posts
 USING (school_id=app.current_school_id())
 WITH CHECK (school_id=app.current_school_id());
