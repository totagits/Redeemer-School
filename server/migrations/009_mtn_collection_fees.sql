-- Preserve the gross school payment separately from the MTN charge. MTN's
-- collections fee is a school-side settlement cost, not an extra student fee.
ALTER TABLE payments
  ADD COLUMN provider_fee_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (provider_fee_amount >= 0),
  ADD COLUMN provider_fee_rate_bps integer NOT NULL DEFAULT 0 CHECK (provider_fee_rate_bps BETWEEN 0 AND 10000);

COMMENT ON COLUMN payments.provider_fee_amount IS 'Provider fee charged against the collections settlement; does not reduce the student invoice allocation.';
COMMENT ON COLUMN payments.provider_fee_rate_bps IS 'Fee rate in basis points captured when the payment was recorded (MTN Liberia Collections: 250 bps as confirmed by the school).';

ALTER TABLE payment_intents DROP CONSTRAINT payment_intents_status_check;
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_status_check
  CHECK (status IN ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVIEW'));
