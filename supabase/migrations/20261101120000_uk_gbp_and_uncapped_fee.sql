-- UK launch: London events are priced and charged in pounds, and the buyer
-- service fee loses its ceiling (Achille, 2026-11-01: "NO MORE LIMIT").
--
--   EUR: 4 % of the ticket price + 0,80 €, never below 0,70 €, no maximum.
--   GBP: 4 % of the ticket price + £0.70, never below £0.60, no maximum.
--   Free tickets carry no fee; events.commission_override_cents still wins.
--
-- The currency is set per event (events.currency). Every tier of an event is
-- forced to the event's currency by a trigger, so a checkout (which reads
-- event_tiers.currency) can never charge one tier in euros and another in
-- pounds. Existing events stay in euros: their prices were typed in euros.

-- ── 1. events.currency ──────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_currency_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_currency_check CHECK (currency IN ('EUR', 'GBP'));

COMMENT ON COLUMN public.events.currency IS
  'Currency every tier of this event is priced and charged in: GBP for London events, EUR elsewhere. Copied onto event_tiers.currency by trg_event_tiers_currency.';

-- ── 2. Tiers follow their event ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.event_tiers_take_event_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT e.currency INTO NEW.currency FROM public.events e WHERE e.id = NEW.event_id;
  NEW.currency := COALESCE(NEW.currency, 'EUR');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_tiers_currency ON public.event_tiers;
CREATE TRIGGER trg_event_tiers_currency
  BEFORE INSERT OR UPDATE OF currency, event_id ON public.event_tiers
  FOR EACH ROW EXECUTE FUNCTION public.event_tiers_take_event_currency();

-- Changing an event's currency moves its tiers with it, but only while nothing
-- has sold: a paid order's amounts are in the currency it was charged in.
CREATE OR REPLACE FUNCTION public.events_currency_to_tiers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN
    IF EXISTS (
      SELECT 1 FROM public.event_orders o
      WHERE o.event_id = NEW.id AND o.status IN ('paid', 'pending')
    ) THEN
      RAISE EXCEPTION 'This event already has orders; its currency can no longer change.';
    END IF;
    UPDATE public.event_tiers SET currency = NEW.currency WHERE event_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_currency_to_tiers ON public.events;
CREATE TRIGGER trg_events_currency_to_tiers
  AFTER UPDATE OF currency ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_currency_to_tiers();

-- ── 3. Fee formula: per currency, no ceiling ────────────────────────────────
-- The old two-argument function is dropped rather than overloaded: a call with
-- two arguments would otherwise be ambiguous between both versions.
DROP FUNCTION IF EXISTS public.get_studio_commission_cents(integer, integer);

CREATE OR REPLACE FUNCTION public.get_studio_commission_cents(
  p_price_cents integer,
  p_override_cents integer DEFAULT NULL,
  p_currency text DEFAULT 'EUR'
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_price_cents IS NULL OR p_price_cents <= 0 THEN 0
    WHEN p_override_cents IS NOT NULL THEN GREATEST(0, p_override_cents)
    WHEN upper(coalesce(p_currency, 'EUR')) = 'GBP'
      THEN GREATEST(60, 70 + ROUND(p_price_cents * 0.04)::integer)
    ELSE GREATEST(70, 80 + ROUND(p_price_cents * 0.04)::integer)
  END;
$$;
COMMENT ON FUNCTION public.get_studio_commission_cents IS
  'Buyer-paid service fee for ONE studio ticket, in minor units of p_currency. EUR: 4 % + 80, min 70. GBP: 4 % + 70, min 60. No maximum (removed 2026-11-01). 0 for a free ticket. events.commission_override_cents replaces the formula when set. Single source of truth: every checkout and every price display must call this.';

REVOKE ALL ON FUNCTION public.get_studio_commission_cents(integer, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_studio_commission_cents(integer, integer, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_studio_commission_for_tier(p_tier_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_studio_commission_cents(t.price_cents, e.commission_override_cents, t.currency)
  FROM public.event_tiers t
  JOIN public.events e ON e.id = t.event_id
  WHERE t.id = p_tier_id;
$$;
