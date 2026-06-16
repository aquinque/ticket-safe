-- Account-lockout RPCs must not be callable directly by anon/authenticated
-- (an attacker could reset another user's brute-force counter or lock them out).
-- They are now reached only via the service-role 'login-guard' edge function.
REVOKE EXECUTE ON FUNCTION public.check_account_lockout(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_failed_login(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_failed_login(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_account_lockout(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_failed_login(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_failed_login(text) TO service_role;

-- Trigger function: never meant to be called via the REST API.
REVOKE EXECUTE ON FUNCTION public.enforce_studio_resale_ownership() FROM PUBLIC, anon, authenticated;
