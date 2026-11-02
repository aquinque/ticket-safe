-- "N interested" on the public event page: how many people opened the event, like Shotgun shows.
-- One counter per event and nothing about who opened it (no visitor id, no IP), the same way
-- promoter link visits are counted. The page counts a visitor once per browser session.

CREATE TABLE IF NOT EXISTS public.event_interest (
  event_id   uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  interested integer NOT NULL DEFAULT 0 CHECK (interested >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Read and written only through event_interest() below.
ALTER TABLE public.event_interest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_interest FROM anon, authenticated;

-- Everyone who already bought a ticket opened the page: start each event from its tickets sold.
INSERT INTO public.event_interest (event_id, interested)
SELECT ti.event_id, SUM(GREATEST(ti.sold_qty, 0))::integer
FROM public.tier_inventory ti
GROUP BY ti.event_id
HAVING SUM(GREATEST(ti.sold_qty, 0)) > 0
ON CONFLICT (event_id) DO NOTHING;

-- p_count = true adds this visit (published events only, never the organizer's own visits,
-- at most 600 a minute per event); either way it returns the current number.
CREATE OR REPLACE FUNCTION public.event_interest(p_slug text, p_count boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event uuid;
  v_owner uuid;
  v_n integer;
BEGIN
  IF p_slug IS NULL OR length(p_slug) > 200 THEN
    RETURN 0;
  END IF;

  SELECT e.id, op.user_id INTO v_event, v_owner
  FROM public.events e
  LEFT JOIN public.organizer_profiles op ON op.id = e.organizer_id
  WHERE e.slug = p_slug AND e.status = 'published';

  IF v_event IS NULL THEN
    RETURN 0;
  END IF;

  IF p_count
     AND NOT (auth.uid() IS NOT NULL AND auth.uid() = v_owner)
     AND public.rate_limit_consume('event_interest', v_event::text, 600, 60) THEN
    INSERT INTO public.event_interest AS ei (event_id, interested, updated_at)
    VALUES (v_event, 1, now())
    ON CONFLICT (event_id) DO UPDATE SET interested = ei.interested + 1, updated_at = now()
    RETURNING ei.interested INTO v_n;
    RETURN v_n;
  END IF;

  SELECT interested INTO v_n FROM public.event_interest WHERE event_id = v_event;
  RETURN COALESCE(v_n, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.event_interest(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_interest(text, boolean) TO anon, authenticated;
