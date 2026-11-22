-- Ticket drops: a ticket tier can open later than the others.
--
-- An organiser sells a first batch ("Drop 1"), and a second batch ("Drop 2") opens either
--   * when Drop 1 sells out          -> event_tiers.opens_after_tier_id = Drop 1, released_at set automatically,
--   * at a set date and time         -> event_tiers.sales_start_at (already stored by Studio, now enforced),
--   * by hand                        -> Studio sets released_at = now() ("Open now"), or toggles is_active.
--
-- The rule "is this tier on sale right now?" lives in one place, public.tier_is_open(), and is enforced in
-- public.reserve_tier(), which every Studio checkout path calls before taking money (Stripe, Revolut and free
-- tickets). No payment function changes. The tier_inventory view exposes the new columns (appended at the end,
-- so readers of the old columns are unaffected) and is_open, for the event page.
--
-- Additive and backward compatible: two nullable columns, no data changed. On 2026-11-22 no production tier had
-- sales_start_at or sales_end_at set, so enforcing the sales window changes nothing for existing events.

-- ── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.event_tiers
  ADD COLUMN IF NOT EXISTS opens_after_tier_id uuid REFERENCES public.event_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

ALTER TABLE public.event_tiers DROP CONSTRAINT IF EXISTS event_tiers_opens_after_not_self;
ALTER TABLE public.event_tiers
  ADD CONSTRAINT event_tiers_opens_after_not_self CHECK (opens_after_tier_id IS NULL OR opens_after_tier_id <> id);

CREATE INDEX IF NOT EXISTS idx_event_tiers_opens_after ON public.event_tiers (opens_after_tier_id)
  WHERE opens_after_tier_id IS NOT NULL;

COMMENT ON COLUMN public.event_tiers.opens_after_tier_id IS
  'Drop: this tier opens when that tier (same event) sells out. NULL = no dependency.';
COMMENT ON COLUMN public.event_tiers.released_at IS
  'Drop: when this tier was opened (its opens_after tier sold out, or the organiser opened it by hand). Never reset by a reservation expiring.';

-- ── 2. Is a tier on sale right now? ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tier_is_open(t public.event_tiers)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT t.is_active
     AND (t.sales_start_at IS NULL OR t.sales_start_at <= now())
     AND (t.sales_end_at IS NULL OR t.sales_end_at > now())
     AND (t.opens_after_tier_id IS NULL OR t.released_at IS NOT NULL)
$$;

GRANT EXECUTE ON FUNCTION public.tier_is_open(public.event_tiers) TO anon, authenticated, service_role;

-- ── 3. Guard: a drop follows a tier of the same event, without loops ────────
-- When the dependency is set or changed, released_at is recomputed: open straight away if the tier it follows is
-- already sold out, otherwise closed until it sells out. Setting released_at by hand ("Open now") without touching
-- the dependency is kept as is.
CREATE OR REPLACE FUNCTION public.event_tiers_drop_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event uuid;
  v_sold_out boolean;
  v_cur uuid;
  v_i integer := 0;
BEGIN
  IF NEW.opens_after_tier_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.opens_after_tier_id IS NOT DISTINCT FROM OLD.opens_after_tier_id THEN
    RETURN NEW;
  END IF;

  SELECT p.event_id, (p.sold_qty + p.reserved_qty >= p.total_qty)
    INTO v_event, v_sold_out
  FROM public.event_tiers p
  WHERE p.id = NEW.opens_after_tier_id;

  IF v_event IS NULL OR v_event <> NEW.event_id THEN
    RAISE EXCEPTION 'A drop can only follow a ticket tier of the same event.' USING ERRCODE = '23514';
  END IF;

  -- No loops (Drop 2 after Drop 3 after Drop 2).
  v_cur := NEW.opens_after_tier_id;
  WHILE v_cur IS NOT NULL AND v_i < 50 LOOP
    IF v_cur = NEW.id THEN
      RAISE EXCEPTION 'These ticket tiers would wait for each other forever.' USING ERRCODE = '23514';
    END IF;
    SELECT p.opens_after_tier_id INTO v_cur FROM public.event_tiers p WHERE p.id = v_cur;
    v_i := v_i + 1;
  END LOOP;

  NEW.released_at := CASE WHEN v_sold_out THEN now() ELSE NULL END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_tiers_drop_guard ON public.event_tiers;
CREATE TRIGGER trg_event_tiers_drop_guard
  BEFORE INSERT OR UPDATE ON public.event_tiers
  FOR EACH ROW EXECUTE FUNCTION public.event_tiers_drop_guard();

-- ── 4. Release the next drop when a tier sells out ──────────────────────────
-- Sold out counts held tickets too (sold + reserved), the same way the event page shows a tier as sold out, so
-- the next drop opens at the moment the last ticket is taken. released_at is never cleared afterwards: a
-- reservation that expires puts tickets back in the first tier, and both stay on sale.
CREATE OR REPLACE FUNCTION public.event_tiers_release_next()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sold_qty + NEW.reserved_qty >= NEW.total_qty THEN
    UPDATE public.event_tiers
       SET released_at = now()
     WHERE opens_after_tier_id = NEW.id
       AND released_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_tiers_release_next ON public.event_tiers;
CREATE TRIGGER trg_event_tiers_release_next
  AFTER UPDATE OF sold_qty, reserved_qty, total_qty ON public.event_tiers
  FOR EACH ROW EXECUTE FUNCTION public.event_tiers_release_next();

-- Fired by triggers only; not callable through the API.
REVOKE EXECUTE ON FUNCTION public.event_tiers_drop_guard() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.event_tiers_release_next() FROM public, anon, authenticated;

-- ── 5. Checkout: only reserve a tier that is on sale ────────────────────────
-- Same body as production (read on 2026-11-22), with tier_is_open() in place of "is_active = TRUE". Called by
-- stripe-connect-create-checkout and revolut-create-checkout (paid and free orders) before any payment; a refusal
-- is already handled there ("Not enough tickets available.", 409). CREATE OR REPLACE keeps the existing grants.
CREATE OR REPLACE FUNCTION public.reserve_tier(p_tier_id uuid, p_qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available INTEGER;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 OR p_qty > 100 THEN RETURN FALSE; END IF;

  SELECT (t.total_qty - t.sold_qty - t.reserved_qty) INTO v_available
  FROM public.event_tiers t
  WHERE t.id = p_tier_id AND public.tier_is_open(t)
  FOR UPDATE;

  IF v_available IS NULL OR v_available < p_qty THEN RETURN FALSE; END IF;

  UPDATE public.event_tiers
  SET reserved_qty = reserved_qty + p_qty
  WHERE id = p_tier_id;

  RETURN TRUE;
END;
$function$;

-- ── 6. Event page: expose the drop state ────────────────────────────────────
-- Existing columns keep their order and types; the new ones are appended.
CREATE OR REPLACE VIEW public.tier_inventory
WITH (security_invoker = true)
AS
SELECT
  et.id            AS tier_id,
  et.event_id,
  et.name,
  et.description,
  et.price_cents,
  et.currency,
  et.total_qty,
  et.sold_qty,
  et.reserved_qty,
  GREATEST(et.total_qty - et.sold_qty - et.reserved_qty, 0) AS available_qty,
  et.sort_order,
  et.is_active,
  et.sales_start_at,
  et.sales_end_at,
  et.opens_after_tier_id,
  et.released_at,
  public.tier_is_open(et) AS is_open
FROM public.event_tiers et
JOIN public.events e ON e.id = et.event_id
WHERE e.status = 'published'
  AND e.is_active = true;

GRANT SELECT ON public.tier_inventory TO anon, authenticated, service_role;
