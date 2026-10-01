-- CRITICAL FIX (launch audit): "Users can read conversation counterparty
-- profile" granted SELECT on the *entire* profiles row (including
-- payout_iban, payout_iban_holder, email, university_email,
-- failed_login_attempts, locked_until) to anyone who opened a resale chat
-- with that user — RLS is row-level, not column-level, so the frontend only
-- ever selecting full_name did not stop a direct REST query for the other
-- columns. Any authenticated user could open a conversation with any seller
-- (conversations INSERT policy has no restriction on the target) and then
-- read that seller's IBAN straight from the API.
--
-- Fix: drop the row-level policy entirely (self-access via "Users can read
-- own profile" is untouched) and replace the one legitimate cross-user need
-- (showing the other participant's display name in chat) with a narrow view
-- that exposes only id/full_name, gated by the same "shared conversation"
-- condition evaluated inside the view. The view is intentionally NOT
-- security_invoker, so it bypasses profiles' RLS by design and becomes the
-- sole boundary for this narrow read.

DROP POLICY IF EXISTS "Users can read conversation counterparty profile" ON public.profiles;

CREATE OR REPLACE VIEW public.conversation_participant_names AS
SELECT
  c.id AS conversation_id,
  pb.full_name AS buyer_name,
  ps.full_name AS seller_name
FROM public.conversations c
JOIN public.profiles pb ON pb.id = c.buyer_id
JOIN public.profiles ps ON ps.id = c.seller_id
WHERE c.buyer_id = (select auth.uid()) OR c.seller_id = (select auth.uid());

REVOKE ALL ON public.conversation_participant_names FROM PUBLIC, anon;
GRANT SELECT ON public.conversation_participant_names TO authenticated;
