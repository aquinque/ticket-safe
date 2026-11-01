-- Promoter report pages.
--
-- Each promoter link gets a private report address (/p/<report_token>) the organizer sends along with the
-- ticket link. It shows the promoter their own visits, checkouts and tickets sold, and nothing else: no buyer
-- data, no revenue, no other promoter's numbers. The token is long and random, so it works as the password.

ALTER TABLE public.event_promoter_links
  ADD COLUMN IF NOT EXISTS report_token TEXT NOT NULL
  DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS event_promoter_links_report_token_idx
  ON public.event_promoter_links(report_token);

COMMENT ON COLUMN public.event_promoter_links.report_token IS
  'Secret in the promoter''s private report URL (/p/<token>). Read by the event''s organizer through RLS; never changes.';

-- A link also keeps its report token: the promoter already has the address.
CREATE OR REPLACE FUNCTION public.event_promoter_links_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_active INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.report_token IS DISTINCT FROM OLD.report_token THEN
      RAISE EXCEPTION 'A promoter link keeps its event, its code and its report address.' USING ERRCODE = '23514';
    END IF;
    IF NEW.archived_at IS NULL AND OLD.archived_at IS NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.archived_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT count(*) INTO v_active
  FROM public.event_promoter_links
  WHERE event_id = NEW.event_id AND archived_at IS NULL AND id <> NEW.id;
  IF v_active >= 50 THEN
    RAISE EXCEPTION 'An event can have at most 50 active promoter links. Archive one first.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- The promoter's numbers, by token. Anonymous on purpose: the promoter has no account.
CREATE OR REPLACE FUNCTION public.promoter_report(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_link public.event_promoter_links%ROWTYPE;
  v_event RECORD;
  v_visits INTEGER;
  v_last_visit DATE;
  v_orders RECORD;
  v_series JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 OR length(p_token) > 128 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_link FROM public.event_promoter_links WHERE report_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT e.title, e.slug, e.date, e.location, e.banner_url, o.name AS organizer_name
  INTO v_event
  FROM public.events e
  LEFT JOIN public.organizer_profiles o ON o.id = e.organizer_id
  WHERE e.id = v_link.event_id;

  SELECT COALESCE(sum(visits), 0)::int, max(day) INTO v_visits, v_last_visit
  FROM public.event_promoter_link_visits WHERE link_id = v_link.id;

  SELECT
    count(*)::int AS checkouts,
    count(*) FILTER (WHERE status = 'paid')::int AS paid_orders,
    COALESCE(sum(quantity) FILTER (WHERE status = 'paid'), 0)::int AS tickets,
    max(COALESCE(paid_at, created_at)) FILTER (WHERE status = 'paid') AS last_sale_at
  INTO v_orders
  FROM public.event_orders WHERE promoter_link_id = v_link.id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'day', v_today - n,
      'visits', COALESCE((SELECT pv.visits FROM public.event_promoter_link_visits pv WHERE pv.link_id = v_link.id AND pv.day = v_today - n), 0),
      'tickets', COALESCE((
        SELECT sum(eo.quantity)::int FROM public.event_orders eo
        WHERE eo.promoter_link_id = v_link.id AND eo.status = 'paid'
          AND (COALESCE(eo.paid_at, eo.created_at) AT TIME ZONE 'Europe/Paris')::date = v_today - n
      ), 0)
    ) ORDER BY n DESC
  )
  INTO v_series
  FROM generate_series(0, 13) AS n;

  RETURN jsonb_build_object(
    'name', v_link.name,
    'archived', v_link.archived_at IS NOT NULL,
    'event_title', v_event.title,
    'event_slug', v_event.slug,
    'event_date', v_event.date,
    'event_location', v_event.location,
    'banner_url', v_event.banner_url,
    'organizer_name', v_event.organizer_name,
    'visits', v_visits,
    'last_visit_day', v_last_visit,
    'checkouts', v_orders.checkouts,
    'paid_orders', v_orders.paid_orders,
    'tickets', v_orders.tickets,
    'last_sale_at', v_orders.last_sale_at,
    'series', v_series,
    'as_of', v_today
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promoter_report(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promoter_report(TEXT) TO anon, authenticated;
