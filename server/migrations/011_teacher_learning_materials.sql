-- Teacher-authored materials are drafted against a current class/subject
-- assignment and become visible to linked learners/guardians only on publish.
ALTER TABLE teaching_materials
  ADD COLUMN IF NOT EXISTS resource_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED')),
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teaching_materials_secure_url_check'
      AND conrelid = 'teaching_materials'::regclass
  ) THEN
    ALTER TABLE teaching_materials ADD CONSTRAINT teaching_materials_secure_url_check
      CHECK (resource_url IS NULL OR resource_url ~ '^https://');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS teaching_materials_assignment_status_idx
  ON teaching_materials (school_id, teacher_assignment_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE teaching_materials TO redeemer_runtime;
