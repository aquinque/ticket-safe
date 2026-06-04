-- Xceed-style payouts: the organizer never creates a Stripe account.
-- They just give us an IBAN; we send a SEPA transfer manually (or via a
-- Stripe Payout to External Account once we wire it). This avoids the
-- KYC/SIREN paperwork that blocks French student associations.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

-- 1. IBAN stored on the organizer profile (defaults for new payout requests).
ALTER TABLE public.organizer_profiles
  ADD COLUMN IF NOT EXISTS payout_iban TEXT
    CHECK (payout_iban IS NULL OR length(payout_iban) BETWEEN 15 AND 34),
  ADD COLUMN IF NOT EXISTS payout_iban_holder TEXT
    CHECK (payout_iban_holder IS NULL OR length(payout_iban_holder) BETWEEN 2 AND 120),
  ADD COLUMN IF NOT EXISTS payout_iban_set_at TIMESTAMPTZ;

-- 2. Per-request payout ledger. One row per "Get paid" click.
CREATE TABLE IF NOT EXISTS public.organizer_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES public.organizer_profiles(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
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

CREATE INDEX IF NOT EXISTS organizer_payouts_org_idx ON public.organizer_payouts(organizer_id);
CREATE INDEX IF NOT EXISTS organizer_payouts_status_idx ON public.organizer_payouts(status);

ALTER TABLE public.organizer_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_payouts_owner_select ON public.organizer_payouts;
CREATE POLICY org_payouts_owner_select ON public.organizer_payouts
  FOR SELECT TO authenticated
  USING (
    organizer_id IN (
      SELECT id FROM public.organizer_profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS org_payouts_owner_insert ON public.organizer_payouts;
CREATE POLICY org_payouts_owner_insert ON public.organizer_payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    organizer_id IN (
      SELECT id FROM public.organizer_profiles WHERE user_id = auth.uid()
    )
    AND status = 'requested'
  );

-- 3. Live earnings view — what's been earned, what's been claimed, what's
-- left to claim. Used by both the dashboard widget and the payout form.
CREATE OR REPLACE VIEW public.organizer_earnings
WITH (security_invoker = true) AS
WITH revenue AS (
  SELECT
    o.id AS organizer_id,
    COALESCE(SUM(eo.total_cents - COALESCE(eo.fee_cents, 0)) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS net_earned_cents,
    COALESCE(SUM(eo.total_cents) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS gross_cents,
    COALESCE(SUM(COALESCE(eo.fee_cents, 0)) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS platform_fee_cents,
    COALESCE(COUNT(eo.id) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS paid_orders
  FROM public.organizer_profiles o
  LEFT JOIN public.events e ON e.organizer_id = o.id
  LEFT JOIN public.event_orders eo ON eo.event_id = e.id
  GROUP BY o.id
),
withdrawn AS (
  SELECT
    organizer_id,
    COALESCE(SUM(amount_cents), 0)::INTEGER AS claimed_cents
  FROM public.organizer_payouts
  WHERE status IN ('requested','processing','sent')
  GROUP BY organizer_id
)
SELECT
  r.organizer_id,
  r.net_earned_cents,
  r.gross_cents,
  r.platform_fee_cents,
  r.paid_orders,
  COALESCE(w.claimed_cents, 0) AS claimed_cents,
  GREATEST(r.net_earned_cents - COALESCE(w.claimed_cents, 0), 0) AS available_cents
FROM revenue r
LEFT JOIN withdrawn w ON w.organizer_id = r.organizer_id;

GRANT SELECT ON public.organizer_earnings TO authenticated, service_role;
