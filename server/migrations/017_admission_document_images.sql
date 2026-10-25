-- Expand encrypted applicant-document uploads to verified JPEG and PNG files
-- for items such as guardian identification photos.
ALTER TABLE admission_documents
  DROP CONSTRAINT IF EXISTS admission_documents_media_type_check,
  ADD CONSTRAINT admission_documents_media_type_check
    CHECK (media_type IN ('application/pdf','image/jpeg','image/png'));
