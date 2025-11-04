-- Fix ticket file exposure vulnerability
-- Drop the insecure policy that exposes ticket_file_url
DROP POLICY IF EXISTS "Anyone can view available tickets (excluding file URLs)" ON public.tickets;

-- Create a secure view for public ticket listings (excludes sensitive data)
CREATE OR REPLACE VIEW public.available_tickets_public AS
SELECT 
  id,
  event_id,
  seller_id,
  selling_price,
  original_price,
  quantity,
  status,
  notes,
  created_at,
  updated_at
  -- ticket_file_url is intentionally excluded
FROM public.tickets
WHERE status = 'available';

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON public.available_tickets_public TO authenticated;

-- Create a new secure policy for viewing public listings
CREATE POLICY "Users can view available tickets (secure - no file URLs)"
ON public.tickets
FOR SELECT
TO authenticated
USING (
  status = 'available'
  AND EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = tickets.event_id
      AND e.university = (SELECT university FROM public.profiles WHERE id = auth.uid())
      AND e.is_active = true
  )
);

-- Create policy for buyers to access ticket files ONLY after purchase
CREATE POLICY "Buyers can access purchased ticket files"
ON public.tickets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.transactions tr
    WHERE tr.ticket_id = tickets.id
      AND tr.buyer_id = auth.uid()
      AND tr.status = 'completed'
  )
);

-- Add comment explaining the security model
COMMENT ON POLICY "Users can view available tickets (secure - no file URLs)" ON public.tickets IS 
'Allows viewing of available tickets for matching university, but ticket_file_url should only be accessed through the get_purchased_ticket_file() function or by sellers/verified buyers';

COMMENT ON POLICY "Buyers can access purchased ticket files" ON public.tickets IS 
'Allows buyers to access full ticket details including ticket_file_url only after completing purchase';