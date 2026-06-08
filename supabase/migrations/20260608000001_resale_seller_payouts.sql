-- Resale payouts mirror the Studio payouts: 5% buyer fee taken at checkout,
-- 8% Ticket Safe fee taken at withdrawal. Sellers register an IBAN once
-- and we wire the SEPA from the Ticket Safe bank within 2-3 business days.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

CREATE TABLE IF NOT EXISTS public.seller_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  gross_cents INTEGER,
  fee_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','processing','sent','failed','cancelled')),
  iban_used TEXT NOT NULL,
  iban_holder_used TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  failure_reason TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seller_payouts_seller_idx ON public.seller_payouts(seller_id);
CREATE INDEX IF NOT EXISTS seller_payouts_status_idx ON public.seller_payouts(status);

ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_payouts_owner_select ON public.seller_payouts;
CREATE POLICY seller_payouts_owner_select ON public.seller_payouts
  FOR SELECT TO authenticated USING (seller_id = auth.uid());

DROP POLICY IF EXISTS seller_payouts_owner_insert ON public.seller_payouts;
CREATE POLICY seller_payouts_owner_insert ON public.seller_payouts
  FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid() AND status = 'requested');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payout_iban TEXT
    CHECK (payout_iban IS NULL OR length(payout_iban) BETWEEN 15 AND 34),
  ADD COLUMN IF NOT EXISTS payout_iban_holder TEXT
    CHECK (payout_iban_holder IS NULL OR length(payout_iban_holder) BETWEEN 2 AND 120),
  ADD COLUMN IF NOT EXISTS payout_iban_set_at TIMESTAMPTZ;

CREATE OR REPLACE VIEW public.seller_earnings
WITH (security_invoker = true) AS
WITH revenue AS (
  SELECT
    t.seller_id,
    COALESCE(SUM(t.amount - COALESCE(t.fee_amount, 0)) FILTER (WHERE t.status = 'completed'), 0)::NUMERIC AS net_earned_eur,
    COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'completed'), 0)::NUMERIC AS gross_eur,
    COALESCE(SUM(COALESCE(t.fee_amount, 0)) FILTER (WHERE t.status = 'completed'), 0)::NUMERIC AS platform_fee_eur,
    COALESCE(COUNT(t.id) FILTER (WHERE t.status = 'completed'), 0)::INTEGER AS completed_sales
  FROM public.transactions t
  GROUP BY t.seller_id
),
withdrawn AS (
  SELECT seller_id, COALESCE(SUM(COALESCE(gross_cents, amount_cents)), 0)::INTEGER AS claimed_cents
  FROM public.seller_payouts WHERE status IN ('requested','processing','sent')
  GROUP BY seller_id
)
SELECT
  r.seller_id,
  ROUND(r.net_earned_eur * 100)::INTEGER AS net_earned_cents,
  ROUND(r.gross_eur * 100)::INTEGER AS gross_cents,
  ROUND(r.platform_fee_eur * 100)::INTEGER AS platform_fee_cents,
  r.completed_sales,
  COALESCE(w.claimed_cents, 0) AS claimed_cents,
  GREATEST(ROUND(r.net_earned_eur * 100)::INTEGER - COALESCE(w.claimed_cents, 0), 0) AS available_cents
FROM revenue r
LEFT JOIN withdrawn w ON w.seller_id = r.seller_id;

GRANT SELECT ON public.seller_earnings TO authenticated, service_role;
