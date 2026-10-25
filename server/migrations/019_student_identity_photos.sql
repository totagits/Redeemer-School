-- Student portraits have a distinct category from guardian documents.
-- Permit JPEG/PNG in the existing AES-GCM encrypted learner-document store.
ALTER TABLE student_documents
  DROP CONSTRAINT IF EXISTS student_documents_media_type_check,
  ADD CONSTRAINT student_documents_media_type_check
  CHECK (media_type IN ('application/pdf','image/jpeg','image/png'));

INSERT INTO document_categories (school_id,code,name,required_for_admission,visibility)
SELECT id,'STUDENT_PHOTO','Student identification photograph',false,'RESTRICTED'
FROM schools
ON CONFLICT (school_id,code) DO NOTHING;
