-- Remove the public PostgREST RPC surface from internal SECURITY DEFINER
-- functions. Trigger functions keep firing via their triggers (the EXECUTE
-- grant is irrelevant there); server-only functions are re-granted to
-- service_role. The login-flow (check_account_lockout / increment_failed_login
-- / reset_failed_login) and listing (create_stub_event) functions are left
-- untouched because the client legitimately calls them.

-- Trigger functions — never meant to be called directly via /rpc/.
REVOKE EXECUTE ON FUNCTION public.dispatch_ticket_alerts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_event_followers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_escp_signup() FROM PUBLIC, anon, authenticated;

-- Admin bootstrap — run manually as DB owner only.
REVOKE EXECUTE ON FUNCTION public.grant_admin_to_ticketsafe_inbox() FROM PUBLIC, anon, authenticated;

-- Server-only maintenance / reads — keep service_role (edge functions / cron).
REVOKE EXECUTE ON FUNCTION public.cleanup_stuck_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stuck_orders() TO service_role;

REVOKE EXECUTE ON FUNCTION public.organizer_payments_ready(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organizer_payments_ready(uuid) TO service_role;
