-- CRITICAL FIX (launch audit): unverified external resale listings
-- (verification_status='pending', awaiting admin review) were publicly
-- visible AND purchasable the instant they were submitted -- neither the
-- "Tickets visible..." RLS policy on `tickets` nor
-- revolut-resale-checkout's listing lookup checked verification_status,
-- only status='available'. A fraudulent/unverifiable listing could be paid
-- for with real money before any human reviewed it, and if later rejected
-- there was no refund path.
--
-- Scope: only narrows the PUBLIC-browsing branch of the SELECT policy.
-- Sellers still see their own pending listing, admins still see everything
-- (required to review it), and a buyer who already has a transaction/
-- conversation on it is unaffected.

DROP POLICY IF EXISTS "Tickets visible to involved parties or when available" ON public.tickets;

CREATE POLICY "Tickets visible to involved parties or when available"
  ON public.tickets FOR SELECT
  USING (
    (status = 'available' AND verification_status = 'verified')
    OR (auth.uid() = seller_id)
    OR (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role))
    OR (EXISTS (SELECT 1 FROM conversations c WHERE c.ticket_id = tickets.id AND c.buyer_id = auth.uid()))
    OR (EXISTS (SELECT 1 FROM transactions t WHERE t.ticket_id = tickets.id AND t.buyer_id = auth.uid()))
  );

-- Keep the (currently unused but exported) public view consistent with the
-- real gate, so nothing starts relying on it later and reopens this hole.
CREATE OR REPLACE VIEW public.available_tickets_public AS
SELECT id, event_id, seller_id, status, selling_price, quantity, notes,
       qr_verified, needs_review, verification_errors, created_at, updated_at
FROM public.tickets
WHERE status = 'available' AND verification_status = 'verified';
