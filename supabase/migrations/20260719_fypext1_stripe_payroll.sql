-- FYP-EXT-1: Stripe payroll fields + optional Connect destination on staff
-- Pattern: PaymentIntent (default demo) or Transfer when stripe_connect_account_id set.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payroll_stripe_pi
  ON payroll_records (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON COLUMN payroll_records.stripe_payment_intent_id IS
  'Stripe PaymentIntent id when payroll paid via PI demo path';
COMMENT ON COLUMN payroll_records.stripe_transfer_id IS
  'Stripe Transfer id when payroll paid via Connect destination';
COMMENT ON COLUMN staff.stripe_connect_account_id IS
  'Optional Stripe Connect account id (acct_…) for Transfer payroll path';
