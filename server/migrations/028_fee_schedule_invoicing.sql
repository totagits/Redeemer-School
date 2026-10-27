-- Link invoices created from a fee schedule to their source schedule and installment.
-- A unique key makes repeat issuance requests safe and prevents duplicate billing.
ALTER TABLE fee_invoices
  ADD COLUMN IF NOT EXISTS fee_schedule_id uuid,
  ADD COLUMN IF NOT EXISTS fee_schedule_installment_no integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fee_invoices_schedule_fk'
      AND conrelid = 'fee_invoices'::regclass
  ) THEN
    ALTER TABLE fee_invoices
      ADD CONSTRAINT fee_invoices_schedule_fk
      FOREIGN KEY (school_id, fee_schedule_id)
      REFERENCES fee_schedules(school_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fee_invoices_schedule_installment_pair_check'
      AND conrelid = 'fee_invoices'::regclass
  ) THEN
    ALTER TABLE fee_invoices
      ADD CONSTRAINT fee_invoices_schedule_installment_pair_check
      CHECK ((fee_schedule_id IS NULL) = (fee_schedule_installment_no IS NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fee_invoices_schedule_installment_positive_check'
      AND conrelid = 'fee_invoices'::regclass
  ) THEN
    ALTER TABLE fee_invoices
      ADD CONSTRAINT fee_invoices_schedule_installment_positive_check
      CHECK (fee_schedule_installment_no IS NULL OR fee_schedule_installment_no > 0);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS fee_invoices_schedule_installment_unique
  ON fee_invoices (school_id, student_id, academic_year_id, fee_schedule_id, fee_schedule_installment_no)
  WHERE fee_schedule_id IS NOT NULL;

