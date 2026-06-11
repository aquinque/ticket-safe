-- Per-buyer limit must only count tickets the buyer actually PAID for.
-- Counting 'pending' orders meant an abandoned checkout (started then left)
-- blocked the buyer from ever purchasing, even though no payment happened.
CREATE OR REPLACE FUNCTION public.buyer_ticket_count_for_event(p_event_id uuid, p_buyer_id uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(quantity), 0)::INTEGER
  FROM public.event_orders
  WHERE event_id = p_event_id
    AND buyer_id = p_buyer_id
    AND status = 'paid';
$function$;
