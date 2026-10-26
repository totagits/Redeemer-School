-- Grant the restricted application role access to the year-end reporting tables.
-- Keep the tables tenant-isolated just like the rest of the school data.
ALTER TABLE grade_reporting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_reporting_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_school_scope ON grade_reporting_periods;
CREATE POLICY tenant_school_scope ON grade_reporting_periods
  USING (school_id = app.current_school_id())
  WITH CHECK (school_id = app.current_school_id());

ALTER TABLE year_end_assessment_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_end_assessment_weights FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_school_scope ON year_end_assessment_weights;
CREATE POLICY tenant_school_scope ON year_end_assessment_weights
  USING (school_id = app.current_school_id())
  WITH CHECK (school_id = app.current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON grade_reporting_periods, year_end_assessment_weights
  TO redeemer_runtime;
