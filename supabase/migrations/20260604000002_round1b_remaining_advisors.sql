-- Round 1b — finish off the two cheap advisor warnings.

-- 1) touch_updated_at: trigger function used by *_updated_at triggers.
--    Currently has a mutable search_path → an attacker who controls a schema
--    that shadows pg_catalog could intercept NEW.updated_at = NOW(). Fix is
--    to pin search_path to pg_catalog, public so the trigger always resolves
--    NOW() and assignments through the canonical namespaces.
ALTER FUNCTION public.touch_updated_at()
  SET search_path = pg_catalog, public;

COMMENT ON FUNCTION public.touch_updated_at() IS
  'Trigger helper: stamps NEW.updated_at = NOW(). search_path locked for safety.';

-- 2) organizer_payments_ready: read-only helper that returns whether an
--    organizer's Stripe Connect account has charges_enabled. Nothing in the
--    codebase calls it via RPC (verified by grep on src/ and supabase/),
--    so it's safe to lock down to service_role.
REVOKE EXECUTE ON FUNCTION public.organizer_payments_ready(uuid)
  FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.organizer_payments_ready(uuid) IS
  'Helper: returns stripe_accounts.charges_enabled for a given user. service_role only — not currently called from the client.';
