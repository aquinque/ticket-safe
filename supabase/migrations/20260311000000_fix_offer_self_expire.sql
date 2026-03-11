-- Fix: Allow users to expire their own pending offers
-- The original policy only let the OTHER participant update offers,
-- but a proposer needs to expire their own offer before making a new one.

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Recipient can respond to offers" ON public.offers;

-- New policy: the OTHER participant can accept/reject,
-- AND the proposer can expire their own pending offers
CREATE POLICY "Participants can update offers"
  ON public.offers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  )
  WITH CHECK (
    -- Proposer can only set status to 'expired' on their own offers
    (auth.uid() = proposer_id AND status = 'expired')
    OR
    -- Recipient can accept or reject
    (auth.uid() != proposer_id AND status IN ('accepted', 'rejected'))
  );
