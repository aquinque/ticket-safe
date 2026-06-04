-- Round 1c — restore organizer_payments_ready grants
--
-- Round 1b revoked EXECUTE on organizer_payments_ready from anon and
-- authenticated based on a grep that came back empty. That grep ran against
-- a stale working tree: Lovable had just pushed a change to EventPublic.tsx
-- that calls this RPC directly from the client (line ~137) to figure out
-- whether to enable the Buy button.
--
-- Going through stripe_accounts from the buyer's session can't work because
-- the RLS on that table only lets the owner read their own row. So this RPC
-- is the only way the public event page can tell whether an organizer is
-- ready to take payments. Locking it down breaks Studio sales end-to-end.
--
-- We accept the WARN-level advisor in exchange for a functional Buy button.
-- The exposure is: anyone who already knows an organizer's user_id can read
-- a single boolean (charges_enabled). No PII, no payment details, no list
-- of accounts — just a yes/no on a specific user.

GRANT EXECUTE ON FUNCTION public.organizer_payments_ready(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.organizer_payments_ready(uuid) IS
  'Returns stripe_accounts.charges_enabled for a given user. Intentionally callable by anon + authenticated so the public event page can disable Buy when the organizer is not Stripe-Connected. Trades a tiny info leak (yes/no per known user_id) for the ability to render the page correctly. Advisor warning anon_security_definer_function_executable is accepted as the cost.';
