CREATE OR REPLACE FUNCTION public.search_events(query text, max_results integer DEFAULT 8)
RETURNS SETOF public.events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.events
  WHERE is_active = true
    AND (
      title ILIKE '%' || query || '%'
      OR description ILIKE '%' || query || '%'
      OR location ILIKE '%' || query || '%'
      OR category ILIKE '%' || query || '%'
      OR university ILIKE '%' || query || '%'
      OR campus ILIKE '%' || query || '%'
    )
  ORDER BY date ASC
  LIMIT max_results;
$$;