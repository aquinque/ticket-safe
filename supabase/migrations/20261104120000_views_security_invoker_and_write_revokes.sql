-- Views: run as the caller, and never writable from the API (2026-11-04).
--
-- Found on production: public.available_tickets_public ran with its owner's
-- rights (no security_invoker), was auto-updatable, and anon/authenticated
-- held INSERT/UPDATE/DELETE/TRUNCATE on it. Any visitor could change the
-- price of, or delete, any active resale listing through
-- /rest/v1/available_tickets_public. The other views were invoker but still
-- carried the same write grants.
--
-- This migration touches no checkout or webhook path.
--
-- 1. Every view in public: no INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES
--    for PUBLIC, anon or authenticated.
-- 2. Every view in public runs as the caller (security_invoker = on), except
--    conversation_participant_names, which has to read the other person's
--    name in a conversation (profiles is own-row only). It is replaced by
--    get_conversation_participant_names() below and dropped once the site
--    reads names through that function.
-- 3. available_tickets_public is recreated without seller_id and
--    verification_errors, as an invoker view: anon reads it through the
--    existing "available and verified" SELECT policy on tickets.

-- ── 1 + 2. Write grants off, invoker on ─────────────────────────────────────
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM PUBLIC, anon, authenticated', v.relname);
    IF v.relname NOT IN ('conversation_participant_names', 'available_tickets_public') THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v.relname);
    END IF;
  END LOOP;
END $$;

-- ── 3. available_tickets_public, safe columns, as the caller ───────────────
DROP VIEW IF EXISTS public.available_tickets_public;
CREATE VIEW public.available_tickets_public
WITH (security_invoker = on) AS
SELECT id, event_id, status, selling_price, quantity, qr_verified, created_at, updated_at
FROM public.tickets
WHERE status = 'available' AND verification_status = 'verified';
REVOKE ALL ON public.available_tickets_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.available_tickets_public TO anon, authenticated;
COMMENT ON VIEW public.available_tickets_public IS
  'Active, verified resale listings, safe columns only. Runs as the caller (security_invoker), so tickets RLS applies. Read-only: no write grants.';

-- ── Chat names through a function instead of a definer view ───────────────
CREATE OR REPLACE FUNCTION public.get_conversation_participant_names(p_conversation_id uuid DEFAULT NULL)
RETURNS TABLE (conversation_id uuid, buyer_name text, seller_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, pb.full_name, ps.full_name
  FROM public.conversations c
  JOIN public.profiles pb ON pb.id = c.buyer_id
  JOIN public.profiles ps ON ps.id = c.seller_id
  WHERE (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    AND (p_conversation_id IS NULL OR c.id = p_conversation_id);
$$;
REVOKE ALL ON FUNCTION public.get_conversation_participant_names(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_participant_names(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_conversation_participant_names(uuid) IS
  'Names of the two people in the caller''s conversations (only those the caller is part of): conversation id, buyer name, seller name. Replaces the definer view conversation_participant_names.';
