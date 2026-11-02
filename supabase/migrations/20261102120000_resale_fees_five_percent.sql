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

-- The wallet (IBAN withdrawals, request-seller-payout) only holds sales made
-- before Stripe resale. A Stripe sale (checkout session cs_…) is paid to the
-- seller's bank by stripe-connect-payout-cron after the event, so it must
-- never also be withdrawable from the wallet. Same columns as before.
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
  WHERE t.stripe_checkout_session_id IS NULL OR t.stripe_checkout_session_id NOT LIKE 'cs\_%'
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
