ALTER TABLE staff_leave_requests DROP CONSTRAINT staff_leave_requests_status_check;
ALTER TABLE staff_leave_requests ADD CONSTRAINT staff_leave_requests_status_check CHECK(status IN ('REQUESTED','REVIEWED','APPROVED','REJECTED','CANCELLED'));
ALTER TABLE staff_leave_requests ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE staff_leave_requests ADD COLUMN hr_reviewed_by uuid;
ALTER TABLE staff_leave_requests ADD COLUMN hr_review_note text;
ALTER TABLE staff_leave_requests ADD COLUMN hr_reviewed_at timestamptz;
ALTER TABLE staff_leave_requests ADD FOREIGN KEY(school_id,hr_reviewed_by) REFERENCES user_accounts(school_id,id);
ALTER TABLE payroll_runs ADD COLUMN currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','LRD'));
ALTER TABLE payroll_runs ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE payroll_runs ADD COLUMN payment_reference text;
ALTER TABLE payroll_runs ADD COLUMN paid_on date;
ALTER TABLE payroll_runs ADD COLUMN paid_by uuid;
ALTER TABLE payroll_runs ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE payroll_runs ADD FOREIGN KEY(school_id,paid_by) REFERENCES user_accounts(school_id,id);
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_independent_approval CHECK(approved_by IS NULL OR approved_by<>created_by);
CREATE UNIQUE INDEX payroll_payment_reference_unique ON payroll_runs(school_id,payment_reference) WHERE payment_reference IS NOT NULL;
CREATE TABLE staff_workflow_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools(id),
 leave_request_id uuid, payroll_run_id uuid, actor_user_id uuid NOT NULL,
 action text NOT NULL, note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((leave_request_id IS NULL)<>(payroll_run_id IS NULL)),
 FOREIGN KEY(school_id,leave_request_id) REFERENCES staff_leave_requests(school_id,id),
 FOREIGN KEY(school_id,payroll_run_id) REFERENCES payroll_runs(school_id,id),
 FOREIGN KEY(school_id,actor_user_id) REFERENCES user_accounts(school_id,id)
);
ALTER TABLE staff_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_workflow_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON staff_workflow_events USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
GRANT SELECT,INSERT ON staff_workflow_events TO redeemer_runtime;
