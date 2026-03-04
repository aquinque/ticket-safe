-- ============================================================
-- Stripe Connect integration
-- ============================================================
-- stripe_accounts: one row per seller (Stripe Express account)
-- transactions  : add stripe_checkout_session_id + fee_amount
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. stripe_accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stripe_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_account_id   text        NOT NULL,
  onboarding_status   text        NOT NULL DEFAULT 'pending'
                                  CHECK (onboarding_status IN ('pending', 'restricted', 'complete')),
  charges_enabled     boolean     NOT NULL DEFAULT false,
  payouts_enabled     boolean     NOT NULL DEFAULT false,
  details_submitted   boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (stripe_account_id)
);

-- RLS: users can only read their own record; writes go through Edge Functions (service role)
ALTER TABLE public.stripe_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stripe_accounts_select_own"
  ON public.stripe_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stripe_accounts_user_id
  ON public.stripe_accounts (user_id);

CREATE INDEX IF NOT EXISTS idx_stripe_accounts_account_id
  ON public.stripe_accounts (stripe_account_id);

-- ---------------------------------------------------------------------------
-- 2. Extend transactions with Stripe columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS fee_amount                  numeric(10, 2) DEFAULT 0;

-- Index for webhook lookups (session ID → transaction)
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session
  ON public.transactions (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
