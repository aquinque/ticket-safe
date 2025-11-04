-- Fix security definer view warning
-- Drop the view and recreate without security definer
DROP VIEW IF EXISTS public.available_tickets_public;

-- Recreate as a regular view (not security definer)
-- RLS policies on the underlying tickets table will still apply
CREATE VIEW public.available_tickets_public 
WITH (security_invoker=true)
AS
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
  -- ticket_file_url is intentionally excluded for security
FROM public.tickets
WHERE status = 'available';

-- Grant SELECT on the view
GRANT SELECT ON public.available_tickets_public TO authenticated;