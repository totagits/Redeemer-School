-- Historical EMIS aggregate archives, imported from school-approved legacy CSV files.
-- Never changes active student records, class enrollments, or digital IDs.
CREATE TABLE emis_historical_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  imported_by uuid NOT NULL,
  source_filename text NOT NULL,
  file_sha256 text NOT NULL,
  row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 5000),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,file_sha256),
  FOREIGN KEY(school_id,imported_by) REFERENCES user_accounts(school_id,id)
);
CREATE TABLE emis_historical_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  academic_year text NOT NULL,
  class_name text NOT NULL,
  learners integer NOT NULL CHECK(learners BETWEEN 0 AND 1000000),
  male integer NOT NULL CHECK(male BETWEEN 0 AND 1000000),
  female integer NOT NULL CHECK(female BETWEEN 0 AND 1000000),
  sex_unrecorded integer NOT NULL CHECK(sex_unrecorded BETWEEN 0 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(school_id,batch_id) REFERENCES emis_historical_import_batches(school_id,id) ON DELETE RESTRICT,
  UNIQUE (school_id,batch_id,academic_year,class_name),
  CHECK(learners=male+female+sex_unrecorded)
);
CREATE INDEX emis_historical_rows_year_idx ON emis_historical_import_rows(school_id,academic_year,class_name);
ALTER TABLE emis_historical_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE emis_historical_import_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON emis_historical_import_batches USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
ALTER TABLE emis_historical_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE emis_historical_import_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON emis_historical_import_rows USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
GRANT SELECT,INSERT ON emis_historical_import_batches,emis_historical_import_rows TO redeemer_runtime;
