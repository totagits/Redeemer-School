-- Keep learner files inside the tenant database and encrypted by the application
-- before they reach PostgreSQL. Existing metadata-only rows remain readable but
-- cannot be downloaded until their content has been migrated into encrypted storage.
ALTER TABLE student_documents
  ADD COLUMN file_content bytea,
  ADD COLUMN content_nonce bytea,
  ADD COLUMN content_auth_tag bytea,
  ADD CONSTRAINT student_documents_encrypted_content_shape CHECK (
    (file_content IS NULL AND content_nonce IS NULL AND content_auth_tag IS NULL)
    OR
    (file_content IS NOT NULL AND content_nonce IS NOT NULL AND octet_length(content_nonce) = 12
      AND content_auth_tag IS NOT NULL AND octet_length(content_auth_tag) = 16
      AND octet_length(file_content) = size_bytes)
  );

INSERT INTO document_categories (school_id, code, name, required_for_admission, visibility)
SELECT s.id, categories.code, categories.name, false, 'RESTRICTED'
FROM schools s
CROSS JOIN (VALUES
  ('BIRTH_CERTIFICATE', 'Birth certificate'),
  ('PREVIOUS_SCHOOL_RECORD', 'Previous school record'),
  ('IMMUNIZATION_RECORD', 'Immunization record'),
  ('GUARDIAN_ID', 'Guardian identification'),
  ('OTHER', 'Other learner document')
) AS categories(code, name)
ON CONFLICT (school_id, code) DO NOTHING;

WITH grants(role_code, permission_code) AS (
  VALUES ('CAMPUS_ADMIN', 'students.sensitive.read'),
         ('REGISTRAR', 'students.sensitive.read')
)
INSERT INTO role_permissions (school_id, role_id, permission_code)
SELECT r.school_id, r.id, g.permission_code
FROM school_roles r
JOIN grants g ON g.role_code = r.code
ON CONFLICT (school_id, role_id, permission_code) DO NOTHING;
