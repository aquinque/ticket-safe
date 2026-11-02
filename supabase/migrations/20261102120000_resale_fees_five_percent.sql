-- Resale fees (Achille, 2026-11-02): buyers pay 5 % on top of the listing
-- price (set in the checkout functions), and sellers receive the listing price
-- minus 5 %, paid to their bank after the event. Was 10 % (min €0.50) here.
CREATE OR REPLACE FUNCTION public.get_resale_commission_cents(p_price_cents integer)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(0, ROUND(p_price_cents * 0.05)::integer);
$$;
COMMENT ON FUNCTION public.get_resale_commission_cents IS
  'Ticket Safe commission taken from the seller on one resale, in cents: 5 % of the listing price. The buyer separately pays 5 % on top at checkout.';
