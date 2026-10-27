-- Track school operating expenses separately from learner fee collections.
CREATE TABLE IF NOT EXISTS finance_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  expense_number text NOT NULL,
  category text NOT NULL CHECK (length(category) BETWEEN 1 AND 80),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  vendor text,
  currency char(3) NOT NULL CHECK (currency IN ('LRD','USD')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  incurred_on date NOT NULL,
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','PAID','VOID')),
  requested_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  decision_note text,
  paid_by uuid,
  paid_at timestamptz,
  payment_channel text CHECK (payment_channel IN ('CASH','BANK','OTHER')),
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, requested_by) REFERENCES user_accounts(school_id,id),
  FOREIGN KEY (school_id, reviewed_by) REFERENCES user_accounts(school_id,id),
  FOREIGN KEY (school_id, paid_by) REFERENCES user_accounts(school_id,id),
  UNIQUE (school_id,expense_number),
  UNIQUE (school_id,id),
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CHECK ((paid_by IS NULL) = (paid_at IS NULL)),
  CHECK ((paid_by IS NULL) = (payment_channel IS NULL))
);
CREATE INDEX IF NOT EXISTS finance_expenses_school_status_idx ON finance_expenses(school_id,status,created_at DESC);
GRANT SELECT,INSERT,UPDATE,DELETE ON finance_expenses TO redeemer_runtime;
ALTER TABLE finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON finance_expenses USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());

INSERT INTO permissions(code,description) VALUES ('finance.expenses.approve','Approve or reject school operating expense requests') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(school_id,role_id,permission_code)
SELECT r.school_id,r.id,'finance.expenses.approve' FROM school_roles r
WHERE r.code IN ('SCHOOL_ADMIN','PRINCIPAL')
ON CONFLICT(school_id,role_id,permission_code) DO NOTHING;
