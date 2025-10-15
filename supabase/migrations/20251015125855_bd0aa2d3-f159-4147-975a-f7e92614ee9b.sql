-- Fix timing attack vulnerability in get_purchased_ticket_file
-- by ensuring consistent execution time regardless of result
CREATE OR REPLACE FUNCTION public.get_purchased_ticket_file(ticket_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  file_url TEXT;
  is_valid BOOLEAN;
BEGIN
  -- Always query both tables to maintain consistent timing
  SELECT 
    tk.ticket_file_url,
    EXISTS(
      SELECT 1 FROM public.transactions tr
      JOIN public.events e ON e.id = tk.event_id
      WHERE tr.ticket_id = get_purchased_ticket_file.ticket_id
        AND tr.buyer_id = auth.uid()
        AND tr.status = 'completed'
        AND e.is_active = true
    )
  INTO file_url, is_valid
  FROM public.tickets tk
  WHERE tk.id = get_purchased_ticket_file.ticket_id;
  
  IF is_valid THEN
    RETURN file_url;
  END IF;
  
  RETURN NULL;
END;
$function$;