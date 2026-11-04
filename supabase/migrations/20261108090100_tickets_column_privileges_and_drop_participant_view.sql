-- Tickets lockdown: column privileges, seller updates only while available,
-- conversations bound to the listing's seller, participant-names view dropped
-- (2026-11-08).
--
-- Apply ONLY after the site and edge functions that read listings through
-- resale_listings() / my_*() and chat names through
-- get_conversation_participant_names() are live (20261108090000 must already
-- be applied). The old site reads columns revoked here.
--
-- Why
--  * anon and authenticated could read every tickets column of every visible
--    listing: qr_hash (for Studio listings 'studio:<event ticket id>'),
--    file_url (the uploaded ticket), studio_ticket_id, buyer_id,
--    verification_errors, the seller's free-text notes.
--  * "Sellers and admins can update tickets" let a seller change any column
--    of their own rows at any time: verification_status, status, the price
--    in the middle of someone's checkout, the reservation.
--  * Conversations could be created with any seller_id.
--  * anon/authenticated held TRUNCATE, TRIGGER and REFERENCES on tickets.
--
-- What
--  1. tickets privileges: anon reads only the public listing columns;
--     authenticated reads those plus seller_id, notes, needs_review,
--     expires_at (own-row filters; RLS still limits which rows) and may
--     update only selling_price, notes, photo_url, video_url. INSERT and
--     DELETE stay with authenticated, gated by RLS (the sell form inserts).
--     Never granted to anon/authenticated: qr_hash, file_url, buyer_id,
--     verification_errors, studio_ticket_id, reserved_transaction_id,
--     reserved_until.
--  2. Seller UPDATE policy limited to the seller's own available listings.
--  3. conversations INSERT requires the seller to be the listing's seller.
--  4. DROP VIEW conversation_participant_names (replaced by
--     get_conversation_participant_names() in 20261104120000).

-- ── 1. tickets privileges ───────────────────────────────────────────────────
REVOKE ALL ON public.tickets FROM PUBLIC;
REVOKE ALL ON public.tickets FROM anon;
GRANT SELECT (id, event_id, status, verification_status, selling_price, quantity, qr_verified,
              created_at, updated_at, boosted_until, photo_url, video_url)
  ON public.tickets TO anon;

REVOKE SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.tickets FROM authenticated;
GRANT SELECT (id, event_id, status, verification_status, selling_price, quantity, qr_verified,
              created_at, updated_at, boosted_until, photo_url, video_url,
              seller_id, notes, needs_review, expires_at)
  ON public.tickets TO authenticated;
GRANT UPDATE (selling_price, notes, photo_url, video_url) ON public.tickets TO authenticated;

-- PostgreSQL 17 adds the MAINTAIN privilege (VACUUM/ANALYZE/REINDEX/LOCK...),
-- which the platform's default grants hand to anon/authenticated. Not on 16.
DO $$
DECLARE v record;
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON public.tickets FROM PUBLIC, anon, authenticated';
    FOR v IN
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname <> 'conversation_participant_names'
    LOOP
      EXECUTE format('REVOKE MAINTAIN ON public.%I FROM PUBLIC, anon, authenticated', v.relname);
    END LOOP;
  END IF;
END $$;

-- ── 2. Seller updates: own available listings only ─────────────────────────
DROP POLICY IF EXISTS "Sellers and admins can update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Sellers update own available listings" ON public.tickets;
CREATE POLICY "Sellers update own available listings" ON public.tickets
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = seller_id) AND status = 'available')
  WITH CHECK (((SELECT auth.uid()) = seller_id) AND status = 'available');
-- admins_update_tickets (admins, any row) and the SELECT / INSERT / DELETE
-- policies are unchanged.

-- ── 3. Conversations: the seller must be the listing's seller ──────────────
-- The check cannot be a plain EXISTS on tickets inside the policy: the
-- tickets SELECT policy itself reads conversations, so PostgreSQL rejects the
-- INSERT with 42P17 "infinite recursion detected in policy". It goes through
-- a definer function that reads tickets without RLS and returns only a
-- boolean.
CREATE OR REPLACE FUNCTION public.listing_has_seller(p_listing_id uuid, p_seller_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = p_listing_id AND t.seller_id = p_seller_id
  );
$$;
REVOKE ALL ON FUNCTION public.listing_has_seller(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listing_has_seller(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.listing_has_seller(uuid, uuid) IS
  'True when p_seller_id is the seller of listing p_listing_id. Used by the conversations INSERT policy (a direct EXISTS on tickets there would recurse through the tickets SELECT policy).';

DROP POLICY IF EXISTS "Buyers can create conversations" ON public.conversations;
CREATE POLICY "Buyers can create conversations" ON public.conversations
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    ((SELECT auth.uid()) = buyer_id)
    AND public.listing_has_seller(ticket_id, seller_id)
  );

-- ── 4. Participant names view ───────────────────────────────────────────────
DROP VIEW IF EXISTS public.conversation_participant_names;
