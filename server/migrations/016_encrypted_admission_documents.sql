-- Store applicant PDFs in the school database encrypted by the application.
-- Admission files remain restricted to staff with sensitive-record access.
CREATE TABLE IF NOT EXISTS admission_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  application_id uuid NOT NULL,
  category_id uuid,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  original_filename text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 255),
  media_type text NOT NULL DEFAULT 'application/pdf' CHECK (media_type = 'application/pdf'),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  file_content bytea NOT NULL,
  content_nonce bytea NOT NULL CHECK (octet_length(content_nonce) = 12),
  content_auth_tag bytea NOT NULL CHECK (octet_length(content_auth_tag) = 16),
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (octet_length(file_content) = size_bytes),
  FOREIGN KEY (school_id, application_id) REFERENCES admission_applications(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, category_id) REFERENCES document_categories(school_id, id),
  FOREIGN KEY (school_id, uploaded_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE INDEX IF NOT EXISTS admission_documents_application_idx
  ON admission_documents(school_id, application_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE admission_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON admission_documents
  USING (school_id = app.current_school_id())
  WITH CHECK (school_id = app.current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON admission_documents TO redeemer_runtime;
