-- Fix Events RLS policy to be campus-specific for multi-campus universities
DROP POLICY IF EXISTS "Users can view active events from their campus" ON public.events;

CREATE POLICY "Users can view active events from their campus"
ON public.events
FOR SELECT
USING (
  is_active = true 
  AND campus = (SELECT campus FROM public.profiles WHERE id = auth.uid())
);

-- Add transaction update policies for buyers and sellers
CREATE POLICY "Buyers can cancel pending transactions"
ON public.transactions
FOR UPDATE
USING (
  auth.uid() = buyer_id 
  AND status = 'pending'
)
WITH CHECK (
  auth.uid() = buyer_id 
  AND status IN ('pending', 'cancelled')
);

CREATE POLICY "Sellers can update completed transactions"
ON public.transactions
FOR UPDATE
USING (
  auth.uid() = seller_id 
  AND status IN ('pending', 'completed')
)
WITH CHECK (
  auth.uid() = seller_id 
  AND status IN ('pending', 'completed', 'cancelled')
);