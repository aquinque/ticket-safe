-- Service fee paid by the buyer, per ticket: 4 % of the ticket price + 0,80 €,
-- never below 0,70 €, never above 3,50 €. Free tickets carry no fee.
--
-- This function is the only place the fee is computed. The Revolut checkout
-- (live today) and the Stripe Connect checkout both call it; the site calls it
-- through get_studio_commission_for_tier to display the same amount before
-- payment. An admin-set events.commission_override_cents still wins (negotiated
-- fee). The commission_tiers table is no longer read; it is kept for history.

CREATE OR REPLACE FUNCTION public.get_studio_commission_cents(p_price_cents integer, p_override_cents integer DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_price_cents IS NULL OR p_price_cents <= 0 THEN 0
    WHEN p_override_cents IS NOT NULL THEN GREATEST(0, p_override_cents)
    ELSE LEAST(350, GREATEST(70, 80 + ROUND(p_price_cents * 0.04)::integer))
  END;
$$;

COMMENT ON FUNCTION public.get_studio_commission_cents IS
  'Buyer-paid service fee for ONE studio ticket, in cents: 4 % of the price + 80, clamped to [70, 350]; 0 for a free ticket. events.commission_override_cents (negotiated fee) replaces the formula when set. Single source of truth: every checkout and every price display must call this.';

-- Fee for one ticket of a tier, read from the database so the site never
-- computes a fee itself. SECURITY DEFINER: it only returns a fee amount.
CREATE OR REPLACE FUNCTION public.get_studio_commission_for_tier(p_tier_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_studio_commission_cents(t.price_cents, e.commission_override_cents)
  FROM public.event_tiers t
  JOIN public.events e ON e.id = t.event_id
  WHERE t.id = p_tier_id;
$$;

REVOKE ALL ON FUNCTION public.get_studio_commission_for_tier(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_studio_commission_for_tier(uuid) TO anon, authenticated, service_role;

COMMENT ON TABLE public.commission_tiers IS
  'Superseded on 2026-10-06 by the formula in get_studio_commission_cents (4 % + 0,80 €, min 0,70 €, max 3,50 €). Kept for history; not read by any checkout.';
