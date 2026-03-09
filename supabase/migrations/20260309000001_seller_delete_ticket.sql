-- Ensure sellers can delete their own tickets (available listings only).
-- This is required so "Delete listing" in My Listings actually removes the row,
-- including the qr_hash, so the same ticket can be relisted.

DROP POLICY IF EXISTS "Sellers can delete their own tickets" ON public.tickets;

CREATE POLICY "Sellers can delete their own tickets"
  ON public.tickets
  FOR DELETE
  USING (
    auth.uid() = seller_id
    AND status = 'available'
  );
