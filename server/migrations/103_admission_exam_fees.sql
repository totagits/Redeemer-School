-- Migration 103: private entrance examination fee schedules and verified settlements.
-- Requires migration 102. No live MTN collections or automatic payment confirmation.
CREATE TABLE admission_exam_fee_schedules (
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount>=0 AND amount<=1000000),
 currency char(3) NOT NULL CHECK(currency IN ('LRD','USD')),
 configured_by uuid NOT NULL,
 configured_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id,exam_id),
 FOREIGN KEY(school_id,exam_id) REFERENCES admission_entrance_exams(school_id,id) ON DELETE CASCADE,
 FOREIGN KEY(school_id,configured_by) REFERENCES user_accounts(school_id,id)
);
CREATE TABLE admission_exam_fee_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL,
 application_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('PAYMENT','WAIVER')),
 channel text NOT NULL CHECK(channel IN ('CASH','BANK_TRANSFER','MTN_MOMO_VERIFIED','WAIVER')),
 amount numeric(12,2) NOT NULL CHECK(amount>=0),
 currency char(3) NOT NULL CHECK(currency IN ('LRD','USD')),
 reference text NOT NULL CHECK(char_length(reference) BETWEEN 3 AND 120),
 reason text,
 verified_by uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='WAIVER' AND channel='WAIVER' AND amount=0 AND char_length(coalesce(reason,''))>=10)
    OR (kind='PAYMENT' AND channel<>'WAIVER' AND amount>0)),
 UNIQUE(school_id,exam_id,application_id),
 UNIQUE(school_id,reference),
 FOREIGN KEY(school_id,exam_id,application_id) REFERENCES admission_exam_assignments(school_id,exam_id,application_id),
 FOREIGN KEY(school_id,verified_by) REFERENCES user_accounts(school_id,id)
);
-- Payment status is calculated only from finance-verified records.
-- No client-provided status, no "pending means paid", no public result exposure.
CREATE INDEX admission_exam_fee_settlements_verified_idx ON admission_exam_fee_settlements(school_id,verified_at DESC);
GRANT SELECT,INSERT,UPDATE,DELETE ON admission_exam_fee_schedules,admission_exam_fee_settlements TO redeemer_runtime;
ALTER TABLE admission_exam_fee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_fee_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_fee_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_fee_settlements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON admission_exam_fee_schedules USING (school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
CREATE POLICY tenant_school_scope ON admission_exam_fee_settlements USING (school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
