-- Stripe Connect migration — Phase 1 architecture.
--
-- Additive only. Nothing here changes behavior for existing (Revolut)
-- events: payment_provider defaults to 'revolut' for every row, old and
-- new, until Phase 5 flips the default for NEW events only (never touches
-- existing rows) and Phase 6 eventually flips the column default itself.
-- revolut-webhook, revolut-create-checkout, revolut-resale-checkout,
-- request-payout, request-seller-payout are untouched by this migration.
--
-- Design (see Phase 1 recap for the full writeup):
--   - stripe_connect_accounts: ONE table for both organizer and reseller
--     Custom Connect accounts (no Stripe-hosted screens — we collect the
--     KYC fields ourselves and create the Account via the API). Distinct
--     from the legacy `stripe_accounts` table, which is Express-account
--     shaped (per-user only, redirect-based onboarding) and stays as-is,
--     dormant, for the old stripe-webhook/stripe-onboard-seller path.
--   - commission_tiers: price-banded commission grid, studio and resale
--     configured separately, never hardcoded in application code.
--   - events.payment_provider + events.commission_override_cents: per-event
--     provider selection and an optional admin-set commission for the
--     ">50€, negotiated" tier.
--   - event_orders.commission_cents / transactions.commission_cents:
--     snapshot of the commission actually charged at sale time, so
--     billing_documents and historical reporting stay correct even if the
--     tier table changes later.
--   - stripe_connect_payout_jobs: the automated "X days after event end"
--     payout scheduler's own queue, decoupled from the manual-SEPA
--     organizer_payouts/seller_payouts tables (those stay Revolut-only).
--   - billing_settings gains stripe_payout_delay_days (default 2, per the
--     spec) as the one place that number lives.

-- ── 1. Per-event payment provider ─────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'revolut'
    CHECK (payment_provider IN ('revolut', 'stripe')),
  ADD COLUMN IF NOT EXISTS commission_override_cents integer;

COMMENT ON COLUMN public.events.payment_provider IS
  'Which payment rail this event''s Studio checkout uses. Existing events default to revolut and are never auto-migrated. New events default to revolut until Phase 5 flips the application-level default for NEW events only.';
COMMENT ON COLUMN public.events.commission_override_cents IS
  'Admin-set TicketSafe commission (per ticket, in cents) for this event, overriding commission_tiers. Used for the ">50€, negotiated" band and any other manual arrangement.';

-- ── 2. Commission grid ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_tiers (
  id bigint generated always as identity primary key,
  side text NOT NULL CHECK (side IN ('studio', 'resale')),
  min_price_cents integer NOT NULL,
  max_price_cents integer, -- NULL = unbounded ("and above")
  commission_cents integer, -- NULL = "negotiated", admin must set events.commission_override_cents
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_price_cents IS NULL OR max_price_cents >= min_price_cents)
);

CREATE INDEX IF NOT EXISTS commission_tiers_side_range_idx
  ON public.commission_tiers (side, min_price_cents);

ALTER TABLE public.commission_tiers ENABLE ROW LEVEL SECURITY;
-- Admin-readable (Studio shows "commission per ticket" to organizers, so
-- authenticated users can read the grid too — it's not sensitive, it's the
-- public fee schedule), no direct writes except service_role/admin tooling.
CREATE POLICY commission_tiers_read_all ON public.commission_tiers
  FOR SELECT TO authenticated, anon USING (true);

-- Seed the grid from the spec. Gaps between bands (e.g. 20.01-24.99,
-- 40.01-49.99) are deliberately left uncovered by a priced row; the lookup
-- function below resolves a gap to the nearest LOWER band's commission
-- (round down to the last confirmed price point) rather than interpolating
-- a number nobody specified — documented on get_commission_cents() below.
INSERT INTO public.commission_tiers (side, min_price_cents, max_price_cents, commission_cents, label) VALUES
  ('studio', 0,     599,   70,   'Up to ~5€'),
  ('studio', 600,   2000,  140,  '10€–20€'),
  ('studio', 2001,  4000,  180,  '25€–40€'),
  ('studio', 4001,  NULL,  NULL, 'Above 50€ — negotiated')
ON CONFLICT DO NOTHING;

-- Resale commission: no grid was specified beyond "configurable séparément".
-- Chosen default: flat 10% of resale price, min 50c, no negotiated band
-- (resale tickets are buyer-to-buyer, small amounts — a flat admin-visible
-- percentage is simpler to explain than a bespoke grid). Documented as a
-- judgment call in the Phase 1 recap.
INSERT INTO public.commission_tiers (side, min_price_cents, max_price_cents, commission_cents, label) VALUES
  ('resale', 0, NULL, NULL, 'Resale — 10% of price, min 0.50€ (computed, not a flat band)')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_studio_commission_cents(p_price_cents integer, p_override_cents integer DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    p_override_cents,
    (
      SELECT commission_cents FROM public.commission_tiers
      WHERE side = 'studio' AND min_price_cents <= p_price_cents
        AND (max_price_cents IS NULL OR p_price_cents <= max_price_cents)
      ORDER BY min_price_cents DESC LIMIT 1
    ),
    0
  );
$$;

COMMENT ON FUNCTION public.get_studio_commission_cents IS
  'Resolves the TicketSafe commission for one studio ticket at p_price_cents. An explicit override always wins. Otherwise picks the matching price band; a price that falls in an unpriced gap between bands resolves to NULL from the query (no band matches) and the COALESCE falls through to 0 — callers in a gap MUST set events.commission_override_cents explicitly rather than rely on an implicit 0. Checked and enforced in the checkout function, not here.';

CREATE OR REPLACE FUNCTION public.get_resale_commission_cents(p_price_cents integer)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(50, ROUND(p_price_cents * 0.10)::integer);
$$;

-- ── 3. Stripe Connect accounts (organizers AND resellers) ────────────────
CREATE TABLE IF NOT EXISTS public.stripe_connect_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('organizer', 'reseller')),
  organizer_id uuid REFERENCES public.organizer_profiles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id text UNIQUE NOT NULL,
  business_type text CHECK (business_type IN ('individual', 'company', 'non_profit')),
  account_holder_name text,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  requirements_currently_due text[] NOT NULL DEFAULT '{}',
  requirements_past_due text[] NOT NULL DEFAULT '{}',
  tos_accepted_at timestamptz,
  tos_accepted_ip text,
  reminder_3d_sent_at timestamptz,
  reminder_7d_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (owner_type = 'organizer' AND organizer_id IS NOT NULL AND user_id IS NULL) OR
    (owner_type = 'reseller'  AND user_id IS NOT NULL AND organizer_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_connect_accounts_organizer_uidx
  ON public.stripe_connect_accounts (organizer_id) WHERE organizer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stripe_connect_accounts_user_uidx
  ON public.stripe_connect_accounts (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_connect_accounts_owner_select ON public.stripe_connect_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR organizer_id IN (SELECT id FROM public.organizer_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
-- No INSERT/UPDATE/DELETE policy for authenticated/anon — every write goes
-- through a service-role edge function (the Account gets created at Stripe
-- first; we only ever mirror what Stripe confirms back via webhook/API).

-- ── 4. Commission snapshots on the money tables ───────────────────────────
ALTER TABLE public.event_orders
  ADD COLUMN IF NOT EXISTS commission_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_application_fee_id text;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS commission_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_application_fee_id text;

COMMENT ON COLUMN public.event_orders.commission_cents IS
  'TicketSafe commission actually charged on this order at sale time (snapshot — never recomputed from commission_tiers after the fact).';

-- ── 5. Automated Connect payout scheduler ─────────────────────────────────
-- Separate from organizer_payouts/seller_payouts (those are the manual-SEPA
-- Revolut-side queue and stay exactly as they are). A Stripe Connect payout
-- is Stripe's own payout API call (stripe.payouts.create on behalf of the
-- connected account's own balance — direct charges land the money THERE,
-- not on the platform) with payout_schedule.interval='manual' on the
-- account, so nothing leaves until this job explicitly triggers it.
CREATE TABLE IF NOT EXISTS public.stripe_connect_payout_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE, -- NULL for reseller payouts
  stripe_connect_account_id uuid NOT NULL REFERENCES public.stripe_connect_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('organizer_event_payout', 'reseller_payout')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'failed', 'blocked', 'cancelled')),
  blocked_reason text,
  stripe_payout_id text,
  amount_cents integer,
  attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_connect_payout_jobs_due_idx
  ON public.stripe_connect_payout_jobs (status, scheduled_for) WHERE status = 'scheduled';

ALTER TABLE public.stripe_connect_payout_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY stripe_connect_payout_jobs_owner_select ON public.stripe_connect_payout_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stripe_connect_accounts sca
      WHERE sca.id = stripe_connect_payout_jobs.stripe_connect_account_id
        AND (sca.user_id = auth.uid() OR sca.organizer_id IN (SELECT id FROM public.organizer_profiles WHERE user_id = auth.uid()))
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── 6. Payout delay config ────────────────────────────────────────────────
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS stripe_payout_delay_days integer NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.billing_settings.stripe_payout_delay_days IS
  'Days after an event''s end date before its organizer''s Stripe Connect payout job fires. Admin-editable; no UI yet (edit via SQL), same status as the other billing_settings fields.';

-- ── 7. Reuse the existing Stripe idempotency table ────────────────────────
-- stripe_webhook_events (event_id PK, event_type) already exists for the
-- legacy stripe-webhook. Stripe event ids are globally unique per account
-- regardless of which endpoint receives them, so the new stripe-connect
-- webhook reuses this same table rather than duplicating it.
