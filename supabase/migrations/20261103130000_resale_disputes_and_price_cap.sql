-- Resale: payment disputes and a resale price cap (2026-11-03).
--
-- 1. Disputes. A chargeback on a resale charge (charge.dispute.created in
--    stripe-connect-webhook) moves its transaction to 'disputed'.
--    stripe-connect-payout-cron only pays 'completed' sales, so a disputed
--    sale is held out of the seller's payout. If the seller was already paid,
--    the row still goes to 'disputed' (payout_job_id tells the two apart) and
--    the admin is alerted to recover the money. A dispute the platform wins
--    (charge.dispute.closed, status 'won') puts the sale back to 'completed'.
--
-- 2. Price cap. Before this migration there was NO resale price cap: the old
--    validate_ticket_price trigger (50 %–150 % of tickets.original_price) was
--    dropped in 20260307000000, and submit-listing v58 removed its 1.5× face
--    value check. The cap is now, per ticket, the first of:
--      a. event_tiers.resale_max_price_cents  (organizer, per ticket type)
--      b. events.resale_max_price_cents       (organizer, whole event)
--      c. face value × (1 + billing_settings.resale_default_markup_bps / 10000),
--         face value = the tier price of the Studio ticket being resold
--         (only when that tier is priced in euros, since resale is in euros)
--      d. none (a ticket from outside Ticket Studio with no organizer cap)
--    resale_price_cap() below is the single place this is computed;
--    stripe-connect-resale-checkout enforces it on the final price (listing
--    price or the offer accepted in chat), and the sell form shows it.

-- ── 1. Disputes ──────────────────────────────────────────────────────────────
ALTER TYPE public.transaction_status ADD VALUE IF NOT EXISTS 'disputed';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS dispute_id text;
COMMENT ON COLUMN public.transactions.dispute_id IS
  'Stripe dispute id (dp_…) of the chargeback opened on this resale charge, set by stripe-connect-webhook. Status is ''disputed'' while it is open.';

-- ── 2. Price cap ─────────────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS resale_max_price_cents integer
    CHECK (resale_max_price_cents IS NULL OR resale_max_price_cents > 0);
COMMENT ON COLUMN public.events.resale_max_price_cents IS
  'Organizer''s maximum resale price per ticket for this event, in euro cents. NULL = default cap (face value + billing_settings.resale_default_markup_bps).';

ALTER TABLE public.event_tiers
  ADD COLUMN IF NOT EXISTS resale_max_price_cents integer
    CHECK (resale_max_price_cents IS NULL OR resale_max_price_cents > 0);
COMMENT ON COLUMN public.event_tiers.resale_max_price_cents IS
  'Organizer''s maximum resale price per ticket for this ticket type, in euro cents. Wins over events.resale_max_price_cents.';

ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS resale_default_markup_bps integer NOT NULL DEFAULT 2000
    CHECK (resale_default_markup_bps >= 0);
COMMENT ON COLUMN public.billing_settings.resale_default_markup_bps IS
  'Default resale cap when the organizer set none: face value plus this many basis points (2000 = +20 %). Admin-editable via SQL.';

CREATE OR REPLACE FUNCTION public.resale_price_cap(p_event_id uuid, p_tier_id uuid DEFAULT NULL)
RETURNS TABLE (cap_cents integer, source text, face_value_cents integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tier AS (
    SELECT t.resale_max_price_cents, t.price_cents, lower(t.currency) AS currency
    FROM public.event_tiers t
    WHERE p_tier_id IS NOT NULL AND t.id = p_tier_id AND t.event_id = p_event_id
  ),
  ev AS (
    SELECT e.resale_max_price_cents FROM public.events e WHERE e.id = p_event_id
  ),
  markup AS (
    SELECT COALESCE((SELECT b.resale_default_markup_bps FROM public.billing_settings b LIMIT 1), 2000) AS bps
  ),
  face AS (
    SELECT CASE WHEN tier.currency = 'eur' AND tier.price_cents > 0 THEN tier.price_cents END AS cents FROM tier
  )
  SELECT
    COALESCE(
      (SELECT resale_max_price_cents FROM tier),
      (SELECT resale_max_price_cents FROM ev),
      (SELECT ROUND(face.cents * (10000 + markup.bps) / 10000.0)::integer FROM face, markup WHERE face.cents IS NOT NULL)
    ) AS cap_cents,
    CASE
      WHEN (SELECT resale_max_price_cents FROM tier) IS NOT NULL THEN 'organizer_tier'
      WHEN (SELECT resale_max_price_cents FROM ev) IS NOT NULL THEN 'organizer_event'
      WHEN (SELECT cents FROM face) IS NOT NULL THEN 'face_value_markup'
      ELSE 'none'
    END AS source,
    (SELECT cents FROM face) AS face_value_cents;
$$;
COMMENT ON FUNCTION public.resale_price_cap IS
  'Maximum resale price per ticket in euro cents (NULL = no cap) and where it comes from: organizer_tier, organizer_event, face_value_markup or none. Enforced by stripe-connect-resale-checkout.';
GRANT EXECUTE ON FUNCTION public.resale_price_cap(uuid, uuid) TO anon, authenticated, service_role;
