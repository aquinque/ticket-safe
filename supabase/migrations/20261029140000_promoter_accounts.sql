-- Promoter accounts.
--
-- The organizer sends a promoter an invitation (/p/<report_token>). The promoter signs in or creates a Ticket
-- Safe account and claims the link: from then on it appears in their personal space (/promoter) with their own
-- sales and their own link to the ticket page. The token only ever opens the invitation; the numbers are shown
-- to the signed-in promoter who claimed the link, never to whoever holds the address.

ALTER TABLE public.event_promoter_links
  ADD COLUMN IF NOT EXISTS promoter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS event_promoter_links_promoter_idx
  ON public.event_promoter_links(promoter_user_id) WHERE promoter_user_id IS NOT NULL;

COMMENT ON COLUMN public.event_promoter_links.promoter_user_id IS
  'The Ticket Safe account that accepted the invitation (/p/<report_token>). Set only by claim_promoter_link().';

-- The anonymous report page is replaced by the invitation + personal space.
DROP FUNCTION IF EXISTS public.promoter_report(TEXT);

-- A link keeps its event, code and invitation address; the promoter can only be set by claim_promoter_link().
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
      RAISE EXCEPTION 'A promoter link keeps its event, its code and its invitation address.' USING ERRCODE = '23514';
    END IF;
    IF (NEW.promoter_user_id IS DISTINCT FROM OLD.promoter_user_id OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at)
       AND COALESCE(current_setting('app.promoter_claim', true), '') <> '1' THEN
      RAISE EXCEPTION 'Only the promoter can accept an invitation.' USING ERRCODE = '42501';
    END IF;
    IF NEW.archived_at IS NULL AND OLD.archived_at IS NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.archived_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.promoter_user_id IS NOT NULL OR NEW.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only the promoter can accept an invitation.' USING ERRCODE = '42501';
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

-- What the invitation page shows before sign-in. Anonymous; says nothing about sales.
CREATE OR REPLACE FUNCTION public.promoter_invite_info(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.event_promoter_links%ROWTYPE;
  v_event RECORD;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 OR length(p_token) > 128 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_link FROM public.event_promoter_links WHERE report_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT e.title, e.date, e.location, e.banner_url, o.name AS organizer_name
  INTO v_event
  FROM public.events e
  LEFT JOIN public.organizer_profiles o ON o.id = e.organizer_id
  WHERE e.id = v_link.event_id;

  RETURN jsonb_build_object(
    'name', v_link.name,
    'archived', v_link.archived_at IS NOT NULL,
    'event_title', v_event.title,
    'event_date', v_event.date,
    'event_location', v_event.location,
    'banner_url', v_event.banner_url,
    'organizer_name', v_event.organizer_name,
    'claimed', v_link.promoter_user_id IS NOT NULL,
    'mine', auth.uid() IS NOT NULL AND v_link.promoter_user_id = auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promoter_invite_info(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promoter_invite_info(TEXT) TO anon, authenticated;

-- Accepting the invitation. First account to claim a link owns it; claiming again is a no-op.
-- Returns 'claimed', 'already' (it is yours), 'taken' (someone else's) or 'not_found'.
CREATE OR REPLACE FUNCTION public.claim_promoter_link(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.event_promoter_links%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR length(p_token) < 32 OR length(p_token) > 128 THEN
    RETURN 'not_found';
  END IF;

  SELECT * INTO v_link FROM public.event_promoter_links WHERE report_token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_link.promoter_user_id = auth.uid() THEN
    RETURN 'already';
  END IF;
  IF v_link.promoter_user_id IS NOT NULL THEN
    RETURN 'taken';
  END IF;

  PERFORM set_config('app.promoter_claim', '1', true);
  UPDATE public.event_promoter_links
  SET promoter_user_id = auth.uid(), claimed_at = now()
  WHERE id = v_link.id;
  PERFORM set_config('app.promoter_claim', '', true);
  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_promoter_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_promoter_link(TEXT) TO authenticated;

-- The promoter's personal space: every link they claimed, with its event and its numbers.
-- No buyer data and no revenue.
CREATE OR REPLACE FUNCTION public.my_promoter_links()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.archived, r.tickets DESC, r.claimed_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      l.id,
      l.name,
      l.code,
      l.claimed_at,
      (l.archived_at IS NOT NULL) AS archived,
      e.title AS event_title,
      e.slug AS event_slug,
      e.date AS event_date,
      e.location AS event_location,
      e.banner_url,
      e.status AS event_status,
      op.name AS organizer_name,
      COALESCE((SELECT sum(pv.visits) FROM public.event_promoter_link_visits pv WHERE pv.link_id = l.id), 0)::int AS visits,
      COALESCE((SELECT count(*) FROM public.event_orders eo WHERE eo.promoter_link_id = l.id), 0)::int AS checkouts,
      COALESCE((SELECT count(*) FROM public.event_orders eo WHERE eo.promoter_link_id = l.id AND eo.status = 'paid'), 0)::int AS paid_orders,
      COALESCE((SELECT sum(eo.quantity) FROM public.event_orders eo WHERE eo.promoter_link_id = l.id AND eo.status = 'paid'), 0)::int AS tickets,
      (SELECT max(COALESCE(eo.paid_at, eo.created_at)) FROM public.event_orders eo WHERE eo.promoter_link_id = l.id AND eo.status = 'paid') AS last_sale_at,
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'day', v_today - n,
            'visits', COALESCE((SELECT pv.visits FROM public.event_promoter_link_visits pv WHERE pv.link_id = l.id AND pv.day = v_today - n), 0),
            'tickets', COALESCE((
              SELECT sum(eo.quantity)::int FROM public.event_orders eo
              WHERE eo.promoter_link_id = l.id AND eo.status = 'paid'
                AND (COALESCE(eo.paid_at, eo.created_at) AT TIME ZONE 'Europe/Paris')::date = v_today - n
            ), 0)
          ) ORDER BY n DESC
        )
        FROM generate_series(0, 13) AS n
      ) AS series
    FROM public.event_promoter_links l
    JOIN public.events e ON e.id = l.event_id
    LEFT JOIN public.organizer_profiles op ON op.id = e.organizer_id
    WHERE l.promoter_user_id = auth.uid()
  ) r;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.my_promoter_links() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_promoter_links() TO authenticated;
