-- Promoter links.
--
-- An organizer gives each promoter (street team, ambassador, student society, an Instagram page...) their own
-- link to the event: the same public page with `?ref=<code>`. The page counts the visit and the checkout stores
-- the code on the order, so the organizer sees, link by link, how many people came, started a checkout and bought.
--
--   event_promoter_links          one named link per row. Archived, never deleted, so the numbers stay.
--   event_promoter_link_visits    one counter per link and day. No visitor identifier, no IP address, no cookie.
--   event_orders.promoter_link_id the link that brought the order, written by the checkout functions.
--   track_promoter_visit()        anonymous and bounded; called by the public event page.
--   promoter_link_stats()         the organizer's numbers for one event, in one call.

-- ── Links ────────────────────────────────────────────────────────────────
CREATE TABLE public.event_promoter_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  -- Lowercase letters, digits and hyphens, 3 to 40 characters: safe in a URL, readable in a chat.
  code TEXT NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE (event_id, code)
);
CREATE INDEX event_promoter_links_event_idx ON public.event_promoter_links(event_id);

ALTER TABLE public.event_promoter_links ENABLE ROW LEVEL SECURITY;

-- The event's organizer (or a global admin) reads, creates and updates links. There is no DELETE policy on
-- purpose: a link is archived, so the orders it brought keep their history.
CREATE POLICY "organizer_select_own_promoter_links" ON public.event_promoter_links
  FOR SELECT TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "organizer_insert_own_promoter_links" ON public.event_promoter_links
  FOR INSERT TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "organizer_update_own_promoter_links" ON public.event_promoter_links
  FOR UPDATE TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- At most 50 active links per event, and a link keeps its event and its code for good (they are in the URL
-- the promoter has already shared).
CREATE OR REPLACE FUNCTION public.event_promoter_links_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_active INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.code IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'A promoter link keeps its event and its code.' USING ERRCODE = '23514';
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

CREATE TRIGGER event_promoter_links_guard
  BEFORE INSERT OR UPDATE ON public.event_promoter_links
  FOR EACH ROW EXECUTE FUNCTION public.event_promoter_links_guard();

COMMENT ON TABLE public.event_promoter_links IS
  'Named tracking links to a Studio event page (?ref=<code>), one per promoter. Managed by the event''s organizer through RLS; archived, never deleted.';

-- ── Visits ───────────────────────────────────────────────────────────────
CREATE TABLE public.event_promoter_link_visits (
  link_id UUID NOT NULL REFERENCES public.event_promoter_links(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
  PRIMARY KEY (link_id, day)
);

ALTER TABLE public.event_promoter_link_visits ENABLE ROW LEVEL SECURITY;
-- Written only by track_promoter_visit(), read only through promoter_link_stats().
REVOKE ALL ON public.event_promoter_link_visits FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.event_promoter_link_visits IS
  'Visits per promoter link and day (Europe/Paris). A bare counter: no visitor identifier, IP address or cookie is stored.';

-- ── Which link brought an order ──────────────────────────────────────────
ALTER TABLE public.event_orders
  ADD COLUMN IF NOT EXISTS promoter_link_id UUID REFERENCES public.event_promoter_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS event_orders_promoter_link_idx
  ON public.event_orders(promoter_link_id) WHERE promoter_link_id IS NOT NULL;

COMMENT ON COLUMN public.event_orders.promoter_link_id IS
  'The promoter link the buyer came from, set server-side by the checkout functions. NULL for the main link and any other source.';

-- ── Counting a visit ─────────────────────────────────────────────────────
-- Called by the public event page when the URL carries ?ref=<code>. Anonymous, so it only ever adds one to a
-- counter: an unknown or archived code does nothing, the organizer's own visits are not counted, and a link
-- cannot be pushed past 300 counted visits a minute whoever calls.
CREATE OR REPLACE FUNCTION public.track_promoter_visit(p_slug TEXT, p_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link UUID;
  v_owner UUID;
BEGIN
  IF p_slug IS NULL OR p_code IS NULL OR length(p_slug) > 200 OR length(p_code) > 40 THEN
    RETURN;
  END IF;

  SELECT l.id, op.user_id INTO v_link, v_owner
  FROM public.event_promoter_links l
  JOIN public.events e ON e.id = l.event_id
  JOIN public.organizer_profiles op ON op.id = e.organizer_id
  WHERE e.slug = p_slug AND e.status = 'published' AND l.code = lower(p_code) AND l.archived_at IS NULL;

  IF v_link IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() = v_owner) THEN
    RETURN;
  END IF;

  IF NOT public.rate_limit_consume('promoter_visit', v_link::text, 300, 60) THEN
    RETURN;
  END IF;

  INSERT INTO public.event_promoter_link_visits AS pv (link_id, day, visits)
  VALUES (v_link, (now() AT TIME ZONE 'Europe/Paris')::date, 1)
  ON CONFLICT (link_id, day) DO UPDATE SET visits = pv.visits + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.track_promoter_visit(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_promoter_visit(TEXT, TEXT) TO anon, authenticated;

-- ── The organizer's numbers ──────────────────────────────────────────────
-- One call for the Studio panel: per link, the visits, the checkouts started, the paid orders, the tickets and
-- what the organizer receives for them (ticket price after any promo code, service fee excluded), plus the
-- last 14 days; and the same totals for everything that did not come from a promoter link.
CREATE OR REPLACE FUNCTION public.promoter_link_stats(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_links JSONB;
  v_other JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE e.id = p_event_id AND op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.tickets DESC, r.visits DESC, r.created_at DESC), '[]'::jsonb)
  INTO v_links
  FROM (
    SELECT
      l.id,
      l.name,
      l.code,
      l.created_at,
      l.archived_at,
      COALESCE(v.visits, 0)::int AS visits,
      v.last_visit_day,
      COALESCE(o.checkouts, 0)::int AS checkouts,
      COALESCE(o.paid_orders, 0)::int AS paid_orders,
      COALESCE(o.tickets, 0)::int AS tickets,
      COALESCE(o.revenue_cents, 0)::bigint AS revenue_cents,
      o.last_sale_at,
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
    LEFT JOIN (
      SELECT link_id, sum(visits) AS visits, max(day) AS last_visit_day
      FROM public.event_promoter_link_visits
      WHERE link_id IN (SELECT id FROM public.event_promoter_links WHERE event_id = p_event_id)
      GROUP BY link_id
    ) v ON v.link_id = l.id
    LEFT JOIN (
      SELECT
        promoter_link_id AS link_id,
        count(*) AS checkouts,
        count(*) FILTER (WHERE status = 'paid') AS paid_orders,
        COALESCE(sum(quantity) FILTER (WHERE status = 'paid'), 0) AS tickets,
        COALESCE(sum(total_cents - fee_cents) FILTER (WHERE status = 'paid'), 0) AS revenue_cents,
        max(COALESCE(paid_at, created_at)) FILTER (WHERE status = 'paid') AS last_sale_at
      FROM public.event_orders
      WHERE event_id = p_event_id AND promoter_link_id IS NOT NULL
      GROUP BY promoter_link_id
    ) o ON o.link_id = l.id
    WHERE l.event_id = p_event_id
  ) r;

  SELECT jsonb_build_object(
    'paid_orders', count(*),
    'tickets', COALESCE(sum(quantity), 0),
    'revenue_cents', COALESCE(sum(total_cents - fee_cents), 0)
  )
  INTO v_other
  FROM public.event_orders
  WHERE event_id = p_event_id AND status = 'paid' AND promoter_link_id IS NULL;

  RETURN jsonb_build_object('links', v_links, 'other', v_other, 'as_of', v_today);
END;
$$;

REVOKE ALL ON FUNCTION public.promoter_link_stats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promoter_link_stats(UUID) TO authenticated;
