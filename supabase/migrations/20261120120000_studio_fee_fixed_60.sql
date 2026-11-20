-- Studio buyer service fee, EUR: the fixed part goes from 0,80 € to 0,60 €
-- (Achille, 2026-11-20: "change the fee to 4% + 0.60").
--
--   EUR: 4 % of the ticket price + 0,60 €, never below 0,70 €, no maximum.
--        (The 0,70 € floor is kept: it only applies to tickets under 2,50 €.)
--   GBP: unchanged, 4 % + £0.70, never below £0.60, no maximum.
--   Free tickets carry no fee; events.commission_override_cents still wins.
--
-- Same signature as 20261101120000_uk_gbp_and_uncapped_fee.sql, so
-- get_studio_commission_for_tier and every checkout pick it up unchanged.

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
    ELSE GREATEST(70, 60 + ROUND(p_price_cents * 0.04)::integer)
  END;
$$;
COMMENT ON FUNCTION public.get_studio_commission_cents IS
  'Buyer-paid service fee for ONE studio ticket, in minor units of p_currency. EUR: 4 % + 60, min 70 (fixed part lowered from 80 on 2026-11-20). GBP: 4 % + 70, min 60. No maximum. 0 for a free ticket. events.commission_override_cents replaces the formula when set. Single source of truth: every checkout and every price display must call this.';

REVOKE ALL ON FUNCTION public.get_studio_commission_cents(integer, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_studio_commission_cents(integer, integer, text) TO anon, authenticated, service_role;
