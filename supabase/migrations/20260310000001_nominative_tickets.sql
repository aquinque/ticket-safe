-- Nominative tickets: store buyer identity on sold tickets
-- After purchase, buyer_id is set on the ticket so it becomes personal to the buyer.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for quick lookup of tickets owned by a buyer
CREATE INDEX IF NOT EXISTS idx_tickets_buyer_id
  ON public.tickets (buyer_id)
  WHERE buyer_id IS NOT NULL;

-- RLS: buyer can read their own purchased ticket
CREATE POLICY IF NOT EXISTS "Buyers can view their purchased tickets"
  ON public.tickets
  FOR SELECT
  USING (buyer_id = auth.uid());
