ALTER TABLE payment_intents ADD COLUMN fee_rate_bps integer CHECK(fee_rate_bps BETWEEN 0 AND 10000);
ALTER TABLE payment_intents ADD COLUMN fee_agreement_ref text;
-- Existing intents deliberately remain unset. Their original contract was not
-- recorded, so successful legacy intents require Finance review rather than an
-- invented fee snapshot from today's configuration.
