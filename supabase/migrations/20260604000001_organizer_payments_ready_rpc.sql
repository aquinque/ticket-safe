-- Public-safe read: returns just whether the organizer's Connect account
-- is ready to accept charges. No PII, no IBAN, no account ID — only a bool.
--
-- Needed because public.stripe_accounts has an RLS policy
--     (auth.uid() = user_id)
-- meaning a buyer browsing /e/:slug can't see whether the organizer is ready.
-- Without this RPC, EventPublic always thinks payments are unavailable for
-- everyone except the organizer themselves.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

CREATE OR REPLACE FUNCTION public.organizer_payments_ready(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT charges_enabled FROM public.stripe_accounts WHERE user_id = p_user_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.organizer_payments_ready FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_payments_ready TO anon, authenticated, service_role;
