-- Resale: reservations owned by a transaction, listing RPCs, atomic purchase
-- (2026-11-08). Additive only: safe to apply while the current site and edge
-- functions are live. 20261108090100 (C) locks the tickets columns down once
-- the new site and edge functions are deployed.
--
-- Why
--  * A reservation was only tickets.status = 'reserved'. Checkout released
--    every "reserved" row whose updated_at was older than 30 minutes, and
--    nothing bumped updated_at on tickets, so a listing created more than
--    30 minutes ago was released by the next checkout right after it was
--    reserved: two buyers could pay for the same ticket.
--  * The webhook, on payment, set the listing to sold and transferred the
--    Studio ticket in several separate statements, without checking that the
--    paying transaction still held the listing.
--
-- What
--  1. tickets.reserved_transaction_id / reserved_until: a reservation belongs
--     to one pending transaction and ends at a known time.
--  2. Backfill of the current reserved rows (production has none today).
--  3. tickets_set_updated_at trigger (updated_at was never bumped on tickets).
--  4. Front-facing functions (SECURITY DEFINER, only safe columns out):
--     resale_event_is_open, resale_listings, start_listing_conversation,
--     seller_public_stats_for_listing, my_purchased_listings,
--     my_listed_studio_tickets.
--  5. Service-role functions (SECURITY INVOKER, EXECUTE to service_role
--     only): reserve_resale_listing, release_resale_reservation,
--     release_expired_resale_reservations, complete_resale_purchase,
--     record_resale_refund. Each one runs as a single transaction and locks
--     the rows it changes, so concurrent checkouts and webhook retries
--     cannot double-sell a listing.
--  6. Seller and admin functions (SECURITY DEFINER, EXECUTE to authenticated
--     only): create_studio_listing, my_listings, update_my_listing_price,
--     cancel_my_listing, admin_pending_listings. Once C is applied the
--     browser cannot write tickets at all; these are its only write paths.
--
-- Lock order (every function): the listing (tickets row) first, then the
-- transactions row, then the event_tickets row. A function that starts from
-- a transaction id reads its ticket_id without a lock, locks the listing,
-- then locks the transaction and re-checks it. Taking them in any other
-- order deadlocks against a concurrent reserve (40P01).
--
-- A Studio-backed listing is only listable, visible and buyable while its
-- event ticket is 'valid' (not transferred, scanned, cancelled, refunded)
-- and its tier is not an external one (external-tier resale is blocked).
--
-- Requires 20261103130000_resale_disputes_and_price_cap.sql ('disputed'
-- transaction status). Status comparisons cast to text, so the functions
-- also compile on a database where that value is missing.

-- ── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS reserved_transaction_id uuid NULL
    REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz NULL;
CREATE INDEX IF NOT EXISTS tickets_reserved_transaction_idx
  ON public.tickets (reserved_transaction_id);
COMMENT ON COLUMN public.tickets.reserved_transaction_id IS
  'Pending transaction that holds this listing while status = ''reserved''. Set and cleared only by the resale SQL functions. Never readable by anon/authenticated.';
COMMENT ON COLUMN public.tickets.reserved_until IS
  'End of the reservation held by reserved_transaction_id. After it, another buyer may take the listing over. Never readable by anon/authenticated.';

-- ── 2. Backfill ─────────────────────────────────────────────────────────────
UPDATE public.tickets t
SET reserved_transaction_id = x.id,
    reserved_until = x.created_at + interval '35 minutes'
FROM (
  SELECT DISTINCT ON (tx.ticket_id) tx.id, tx.ticket_id, tx.created_at
  FROM public.transactions tx
  WHERE tx.status::text = 'pending'
  ORDER BY tx.ticket_id, tx.created_at DESC
) x
WHERE t.status = 'reserved'
  AND t.reserved_transaction_id IS NULL
  AND x.ticket_id = t.id;

UPDATE public.tickets
SET status = 'available', reserved_until = NULL
WHERE status = 'reserved' AND reserved_transaction_id IS NULL;

-- ── 3. updated_at on tickets ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS tickets_set_updated_at ON public.tickets;
CREATE TRIGGER tickets_set_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 4. Front-facing functions ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resale_event_is_open(
  p_status text,
  p_is_active boolean,
  p_date timestamptz,
  p_ends_at timestamptz,
  p_cancelled_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    p_status = 'published'
    AND p_is_active
    AND p_cancelled_at IS NULL
    AND (public.event_end(p_date, p_ends_at) IS NULL OR public.event_end(p_date, p_ends_at) > now()),
    false
  );
$$;
REVOKE ALL ON FUNCTION public.resale_event_is_open(text, boolean, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resale_event_is_open(text, boolean, timestamptz, timestamptz, timestamptz) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.resale_event_is_open(text, boolean, timestamptz, timestamptz, timestamptz) IS
  'True when resale is open for an event: published, active, not cancelled, and not ended yet (event_end = ends_at, else date + 8 h). Pass the events columns status, is_active, date, ends_at, cancelled_at.';

CREATE OR REPLACE FUNCTION public.resale_studio_ticket_ok(p_studio_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_studio_ticket_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.event_tickets et
    JOIN public.event_tiers tr ON tr.id = et.tier_id
    WHERE et.id = p_studio_ticket_id
      AND et.status::text = 'valid'
      AND tr.source IS DISTINCT FROM 'external'
  );
$$;
REVOKE ALL ON FUNCTION public.resale_studio_ticket_ok(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resale_studio_ticket_ok(uuid) TO service_role;
COMMENT ON FUNCTION public.resale_studio_ticket_ok(uuid) IS
  'True when a listing may be shown or sold as far as its Studio ticket goes: no Studio ticket (p_studio_ticket_id NULL), or the event ticket is valid and its tier is not external (external-tier resale is blocked). Used by the resale functions; service_role only.';

CREATE OR REPLACE FUNCTION public.resale_listings(
  p_event_id uuid DEFAULT NULL,
  p_listing_id uuid DEFAULT NULL
)
RETURNS TABLE (
  listing_id uuid,
  event_id uuid,
  tier_name text,
  price_cents integer,
  quantity integer,
  listed_at timestamptz,
  is_boosted boolean,
  photo_url text,
  video_url text,
  is_own boolean,
  is_reserved boolean,
  event_title text,
  event_slug text,
  event_date timestamptz,
  event_ends_at timestamptz,
  event_location text,
  event_category text,
  event_university text,
  event_campus text,
  event_banner_url text,
  event_video_url text,
  event_base_price numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.event_id,
    tr.name,
    round(t.selling_price * 100)::integer,
    t.quantity,
    t.created_at,
    coalesce(t.boosted_until > now(), false),
    t.photo_url,
    t.video_url,
    coalesce(t.seller_id = auth.uid(), false),
    (p_listing_id IS NOT NULL AND t.status = 'reserved' AND coalesce(t.reserved_until > now(), false)),
    e.title,
    e.slug,
    e.date,
    e.ends_at,
    e.location,
    e.category,
    e.university,
    e.campus,
    e.banner_url,
    e.video_url,
    e.base_price
  FROM public.tickets t
  JOIN public.events e ON e.id = t.event_id
  LEFT JOIN public.event_tickets et ON et.id = t.studio_ticket_id
  LEFT JOIN public.event_tiers tr ON tr.id = et.tier_id
  WHERE t.verification_status = 'verified'
    AND t.selling_price IS NOT NULL
    AND public.resale_event_is_open(e.status, e.is_active, e.date, e.ends_at, e.cancelled_at)
    AND (t.studio_ticket_id IS NULL
         OR (et.status::text = 'valid' AND tr.source IS DISTINCT FROM 'external'))
    AND (p_event_id IS NULL OR t.event_id = p_event_id)
    AND (p_listing_id IS NULL OR t.id = p_listing_id)
    AND (
      t.status = 'available'
      OR (t.status = 'reserved' AND (p_listing_id IS NOT NULL OR t.reserved_until IS NULL OR t.reserved_until <= now()))
    )
  ORDER BY 4 ASC, 6 ASC, 1;
$$;
REVOKE ALL ON FUNCTION public.resale_listings(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resale_listings(uuid, uuid) TO anon, authenticated;
COMMENT ON FUNCTION public.resale_listings(uuid, uuid) IS
  'Verified resale listings on open events, cheapest first, safe columns only (never seller identity, qr_hash, file_url, buyer_id, verification_errors, studio_ticket_id or notes). A Studio listing is left out unless its event ticket is valid and its tier is not external. price_cents is per ticket, before the buyer fee. Without p_listing_id: listings that can be bought now (available, or reserved with an expired hold). With p_listing_id: that listing even while reserved, is_reserved telling whether someone holds it now.';

CREATE OR REPLACE FUNCTION public.start_listing_conversation(p_listing_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_conversation uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT t.seller_id INTO v_seller
  FROM public.tickets t
  JOIN public.events e ON e.id = t.event_id
  WHERE t.id = p_listing_id
    AND t.verification_status = 'verified'
    AND t.status IN ('available', 'reserved')
    AND public.resale_event_is_open(e.status, e.is_active, e.date, e.ends_at, e.cancelled_at)
    AND public.resale_studio_ticket_ok(t.studio_ticket_id);
  IF NOT FOUND OR v_seller IS NULL THEN
    RAISE EXCEPTION 'LISTING_NOT_AVAILABLE' USING ERRCODE = 'P0001';
  END IF;
  IF v_seller = v_uid THEN
    RAISE EXCEPTION 'OWN_LISTING' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_listing_id::text || v_uid::text, 0));

  SELECT c.id INTO v_conversation
  FROM public.conversations c
  WHERE c.ticket_id = p_listing_id AND c.buyer_id = v_uid;
  IF FOUND THEN
    RETURN v_conversation;
  END IF;

  INSERT INTO public.conversations (ticket_id, buyer_id, seller_id)
  VALUES (p_listing_id, v_uid, v_seller)
  RETURNING id INTO v_conversation;
  RETURN v_conversation;
END;
$$;
REVOKE ALL ON FUNCTION public.start_listing_conversation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_listing_conversation(uuid) TO authenticated;
COMMENT ON FUNCTION public.start_listing_conversation(uuid) IS
  'Opens (or returns) the caller''s conversation with the seller of a listing. The seller is taken from the listing, never from the client. Raises AUTH_REQUIRED, LISTING_NOT_AVAILABLE (not verified, not available/reserved, or event not open) or OWN_LISTING.';

-- The result type changed during review (full_name -> first_name): drop any
-- earlier definition so CREATE does not fail with 42P13.
DROP FUNCTION IF EXISTS public.seller_public_stats_for_listing(uuid);
CREATE FUNCTION public.seller_public_stats_for_listing(p_listing_id uuid)
RETURNS TABLE (first_name text, university text, campus text, member_since timestamptz, completed_sales integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif((regexp_split_to_array(btrim(s.full_name), '\s+'))[1], ''),
         s.university, s.campus, s.member_since, s.completed_sales
  FROM public.tickets t
  JOIN public.events e ON e.id = t.event_id
  CROSS JOIN LATERAL public.seller_public_stats(t.seller_id) s
  WHERE t.id = p_listing_id
    AND t.verification_status = 'verified'
    AND t.status IN ('available', 'reserved')
    AND public.resale_event_is_open(e.status, e.is_active, e.date, e.ends_at, e.cancelled_at)
    AND public.resale_studio_ticket_ok(t.studio_ticket_id);
$$;
REVOKE ALL ON FUNCTION public.seller_public_stats_for_listing(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seller_public_stats_for_listing(uuid) TO anon, authenticated;
COMMENT ON FUNCTION public.seller_public_stats_for_listing(uuid) IS
  'Public stats of the seller of a listing that is on sale now (verified, available or reserved, event open, Studio ticket still valid and not external), looked up by listing id so the seller id never reaches the browser. first_name is the first word of the seller''s full name, never the full name. No row for sold, cancelled, unverified or closed listings.';

CREATE OR REPLACE FUNCTION public.my_purchased_listings()
RETURNS TABLE (
  listing_id uuid,
  quantity integer,
  price_cents integer,
  purchased_at timestamptz,
  event_id uuid,
  is_studio boolean,
  event_title text,
  event_date timestamptz,
  event_location text,
  event_slug text,
  event_banner_url text,
  event_primary_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.quantity,
    round(t.selling_price * 100)::integer,
    coalesce(
      (SELECT max(tx.updated_at) FROM public.transactions tx
       WHERE tx.ticket_id = t.id AND tx.buyer_id = t.buyer_id AND tx.status::text IN ('completed', 'disputed')),
      t.updated_at
    ),
    t.event_id,
    t.studio_ticket_id IS NOT NULL,
    e.title,
    e.date,
    e.location,
    e.slug,
    e.banner_url,
    e.primary_color
  FROM public.tickets t
  LEFT JOIN public.events e ON e.id = t.event_id
  WHERE auth.uid() IS NOT NULL
    AND t.buyer_id = auth.uid()
    AND t.status = 'sold'
  ORDER BY 4 DESC, 1;
$$;
REVOKE ALL ON FUNCTION public.my_purchased_listings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_purchased_listings() TO authenticated;
COMMENT ON FUNCTION public.my_purchased_listings() IS
  'Resale listings the caller bought (status sold, buyer = caller), with event details. No file_url, qr_hash or seller data.';

CREATE OR REPLACE FUNCTION public.my_listed_studio_tickets()
RETURNS TABLE (studio_ticket_id uuid, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.studio_ticket_id, t.status
  FROM public.tickets t
  WHERE auth.uid() IS NOT NULL
    AND t.seller_id = auth.uid()
    AND t.status IN ('available', 'reserved', 'sold')
    AND t.studio_ticket_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.my_listed_studio_tickets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_listed_studio_tickets() TO authenticated;
COMMENT ON FUNCTION public.my_listed_studio_tickets() IS
  'Studio tickets the caller has listed for resale (available, reserved or sold), so the sell form can hide them. studio_ticket_id is not readable from tickets directly.';

-- ── 5. Service-role functions ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_resale_listing(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_expected_unit_price numeric,
  p_quantity integer,
  p_amount_cents integer,
  p_fee_cents integer,
  p_commission_cents integer,
  p_hold_seconds integer DEFAULT 2100
)
RETURNS TABLE (outcome text, transaction_id uuid, seller_id uuid, previous_transaction_id uuid, reserved_until timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_t record;
  v_open boolean;
  v_holder uuid;
  v_prev uuid;
  v_tx uuid;
  v_until timestamptz;
BEGIN
  -- Lock order: the listing first, then transactions (see the header).
  SELECT t.id, t.seller_id, t.status, t.verification_status, t.selling_price,
         t.reserved_transaction_id, t.reserved_until, t.event_id, t.studio_ticket_id
    INTO v_t
  FROM public.tickets t
  WHERE t.id = p_listing_id
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_available'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT public.resale_event_is_open(e.status, e.is_active, e.date, e.ends_at, e.cancelled_at)
    INTO v_open
  FROM public.events e WHERE e.id = v_t.event_id;

  IF v_t.verification_status IS DISTINCT FROM 'verified'
     OR v_t.status IS NULL OR v_t.status NOT IN ('available', 'reserved')
     OR v_open IS NOT TRUE
     OR NOT public.resale_studio_ticket_ok(v_t.studio_ticket_id) THEN
    RETURN QUERY SELECT 'not_available'::text, NULL::uuid, v_t.seller_id, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_t.seller_id = p_buyer_id THEN
    RETURN QUERY SELECT 'own_listing'::text, NULL::uuid, v_t.seller_id, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_t.selling_price IS DISTINCT FROM p_expected_unit_price THEN
    RETURN QUERY SELECT 'price_changed'::text, NULL::uuid, v_t.seller_id, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_t.status = 'reserved' AND v_t.reserved_until IS NOT NULL AND v_t.reserved_until > now() THEN
    SELECT tx.buyer_id INTO v_holder FROM public.transactions tx WHERE tx.id = v_t.reserved_transaction_id;
    IF v_holder IS DISTINCT FROM p_buyer_id THEN
      RETURN QUERY SELECT 'reserved_by_other'::text, NULL::uuid, v_t.seller_id, NULL::uuid, v_t.reserved_until;
      RETURN;
    END IF;
  END IF;

  -- Free, expired, or held by this same buyer: take it over.
  IF v_t.status = 'reserved' THEN
    v_prev := v_t.reserved_transaction_id;
    IF v_prev IS NOT NULL THEN
      UPDATE public.transactions tx SET status = 'cancelled'
      WHERE tx.id = v_prev AND tx.status::text = 'pending';
    END IF;
  END IF;

  INSERT INTO public.transactions (buyer_id, seller_id, ticket_id, amount, fee_amount, commission_cents, quantity, status)
  VALUES (p_buyer_id, v_t.seller_id, p_listing_id, p_amount_cents / 100.0, p_fee_cents / 100.0, p_commission_cents, p_quantity, 'pending')
  RETURNING id INTO v_tx;

  v_until := now() + make_interval(secs => p_hold_seconds);
  UPDATE public.tickets t
  SET status = 'reserved',
      reserved_transaction_id = v_tx,
      reserved_until = v_until,
      updated_at = now()
  WHERE t.id = p_listing_id;

  RETURN QUERY SELECT 'reserved'::text, v_tx, v_t.seller_id, v_prev, v_until;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_resale_listing(uuid, uuid, numeric, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_resale_listing(uuid, uuid, numeric, integer, integer, integer, integer, integer) TO service_role;
COMMENT ON FUNCTION public.reserve_resale_listing(uuid, uuid, numeric, integer, integer, integer, integer, integer) IS
  'Service role only. Locks the listing and, when it can be bought, creates the pending transaction and reserves the listing for it until now() + p_hold_seconds. Outcomes: reserved, not_available (also for a Studio listing whose event ticket is no longer valid or whose tier is external), own_listing, price_changed (listing price differs from p_expected_unit_price), reserved_by_other (another buyer holds an unexpired reservation; reserved_until says until when). A takeover of an expired reservation, or of the same buyer''s own, cancels the previous pending transaction and returns it as previous_transaction_id.';

CREATE OR REPLACE FUNCTION public.release_resale_reservation(p_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_listing uuid;
BEGIN
  -- Lock order: the listing (found by its reservation) first, then the transaction.
  SELECT t.id INTO v_listing
  FROM public.tickets t
  WHERE t.reserved_transaction_id = p_transaction_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.tickets t
    SET status = CASE WHEN t.status = 'reserved' THEN 'available' ELSE t.status END,
        reserved_transaction_id = NULL,
        reserved_until = NULL,
        updated_at = now()
    WHERE t.id = v_listing;
  END IF;

  UPDATE public.transactions tx SET status = 'cancelled'
  WHERE tx.id = p_transaction_id AND tx.status::text = 'pending';

  RETURN v_listing IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.release_resale_reservation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_resale_reservation(uuid) TO service_role;
COMMENT ON FUNCTION public.release_resale_reservation(uuid) IS
  'Service role only. Releases the listing reserved by this transaction (and only that one) and cancels the transaction if it is still pending. True when a listing was released.';

CREATE OR REPLACE FUNCTION public.release_expired_resale_reservations()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    SELECT t.id, t.reserved_transaction_id
    FROM public.tickets t
    WHERE t.status = 'reserved'
      AND (t.reserved_until IS NULL OR t.reserved_until <= now())
    FOR UPDATE SKIP LOCKED
  ), released AS (
    UPDATE public.tickets t
    SET status = 'available', reserved_transaction_id = NULL, reserved_until = NULL, updated_at = now()
    FROM expired
    WHERE t.id = expired.id
    RETURNING expired.reserved_transaction_id AS tx_id
  ), cancelled AS (
    UPDATE public.transactions tx SET status = 'cancelled'
    FROM released
    WHERE tx.id = released.tx_id AND tx.status::text = 'pending'
    RETURNING tx.id
  )
  SELECT count(*)::integer INTO v_count FROM released;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.release_expired_resale_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_resale_reservations() TO service_role;
COMMENT ON FUNCTION public.release_expired_resale_reservations() IS
  'Service role only. Puts every reserved listing whose hold has ended back on sale and cancels its pending transaction. Skips rows another session has locked. Returns the number of listings released.';

CREATE OR REPLACE FUNCTION public.complete_resale_purchase(
  p_transaction_id uuid,
  p_payment_intent_id text,
  p_new_event_ticket_id uuid,
  p_new_qr_token text
)
RETURNS TABLE (outcome text, listing_id uuid, buyer_id uuid, new_event_ticket_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_ticket_id uuid;
  v_listing_found boolean;
  v_tx record;
  v_t record;
  v_et record;
  v_outcome text;
  v_names text[];
  v_email text;
  v_first text;
  v_last text;
BEGIN
  -- 1. Which listing the transaction is for: read WITHOUT a lock. Lock order
  --    is listing, then transaction (reserve_resale_listing locks the listing
  --    and then cancels the previous transaction; locking the transaction
  --    first here deadlocked against it).
  SELECT tx.ticket_id INTO v_ticket_id
  FROM public.transactions tx
  WHERE tx.id = p_transaction_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'transaction_missing'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 2. Lock the listing, then the transaction, and re-check that the
  --    transaction still points to that listing.
  SELECT t.id, t.status, t.verification_status, t.reserved_transaction_id, t.studio_ticket_id
    INTO v_t
  FROM public.tickets t
  WHERE t.id = v_ticket_id
  FOR UPDATE;
  v_listing_found := FOUND;

  SELECT tx.id, tx.ticket_id, tx.buyer_id, tx.status::text AS status
    INTO v_tx
  FROM public.transactions tx
  WHERE tx.id = p_transaction_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'transaction_missing'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_tx.ticket_id IS DISTINCT FROM v_ticket_id THEN
    -- transactions.ticket_id is never updated; fail loudly (the webhook retries).
    RAISE EXCEPTION 'TRANSACTION_LISTING_CHANGED' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Already done (webhook retry, or a later dispute/refund).
  IF v_tx.status IN ('completed', 'disputed', 'refunded') THEN
    RETURN QUERY SELECT 'already_completed'::text, v_tx.ticket_id, v_tx.buyer_id, NULL::uuid;
    RETURN;
  END IF;

  -- 4. Cancelled (reservation taken over or released) or another state.
  IF v_tx.status <> 'pending' THEN
    v_outcome := 'transaction_not_pending';
  ELSE
    -- 5. The listing (locked above).
    IF NOT v_listing_found THEN
      v_outcome := 'listing_missing';
    ELSIF v_t.status = 'sold' THEN
      v_outcome := 'listing_sold';
    ELSIF v_t.status = 'reserved' AND v_t.reserved_transaction_id IS DISTINCT FROM v_tx.id THEN
      v_outcome := 'reserved_by_other';
    ELSIF v_t.verification_status IS DISTINCT FROM 'verified'
          OR v_t.status IS NULL OR v_t.status NOT IN ('available', 'reserved') THEN
      v_outcome := 'listing_unavailable';
    ELSIF v_t.studio_ticket_id IS NOT NULL THEN
      -- 6. The Studio ticket behind the listing (locked last).
      SELECT et.id, et.order_id, et.event_id, et.tier_id, et.status::text AS status, et.source,
             tr.source AS tier_source
        INTO v_et
      FROM public.event_tickets et
      LEFT JOIN public.event_tiers tr ON tr.id = et.tier_id
      WHERE et.id = v_t.studio_ticket_id
      FOR UPDATE OF et;
      IF NOT FOUND OR v_et.status <> 'valid' OR v_et.tier_source IS NOT DISTINCT FROM 'external' THEN
        v_outcome := 'studio_ticket_unavailable';
        UPDATE public.tickets t
        SET status = 'cancelled', qr_hash = NULL, reserved_transaction_id = NULL, reserved_until = NULL, updated_at = now()
        WHERE t.id = v_t.id;
      ELSIF p_new_qr_token IS NULL OR p_new_event_ticket_id IS NULL THEN
        RAISE EXCEPTION 'QR_TOKEN_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- 7. Conflict: the buyer paid but cannot get this listing. The caller refunds.
  IF v_outcome IS NOT NULL THEN
    UPDATE public.transactions tx
    SET status = 'cancelled',
        payment_intent_id = coalesce(p_payment_intent_id, tx.payment_intent_id)
    WHERE tx.id = v_tx.id;
    RETURN QUERY SELECT v_outcome, v_tx.ticket_id, v_tx.buyer_id, NULL::uuid;
    RETURN;
  END IF;

  -- 8. Success.
  UPDATE public.tickets t
  SET status = 'sold',
      buyer_id = v_tx.buyer_id,
      reserved_transaction_id = NULL,
      reserved_until = NULL,
      updated_at = now()
  WHERE t.id = v_t.id;

  IF v_t.studio_ticket_id IS NOT NULL THEN
    UPDATE public.event_tickets et SET status = 'transferred' WHERE et.id = v_et.id;

    SELECT regexp_split_to_array(trim(p.full_name), '\s+'), p.email
      INTO v_names, v_email
    FROM public.profiles p WHERE p.id = v_tx.buyer_id;
    v_first := nullif(v_names[1], '');
    v_last := nullif(array_to_string(v_names[2:array_length(v_names, 1)], ' '), '');

    INSERT INTO public.event_tickets (id, order_id, event_id, tier_id, buyer_id, qr_token, status, source,
                                      holder_first_name, holder_last_name, holder_email)
    VALUES (p_new_event_ticket_id, v_et.order_id, v_et.event_id, v_et.tier_id, v_tx.buyer_id, p_new_qr_token, 'valid', v_et.source,
            v_first, v_last, v_email);
  END IF;

  UPDATE public.transactions tx
  SET status = 'completed', payment_intent_id = coalesce(p_payment_intent_id, tx.payment_intent_id)
  WHERE tx.id = v_tx.id;

  RETURN QUERY SELECT 'completed'::text, v_tx.ticket_id, v_tx.buyer_id,
    CASE WHEN v_t.studio_ticket_id IS NOT NULL THEN p_new_event_ticket_id END;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_resale_purchase(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_resale_purchase(uuid, text, uuid, text) TO service_role;
COMMENT ON FUNCTION public.complete_resale_purchase(uuid, text, uuid, text) IS
  'Service role only. Completes a paid resale in one transaction: listing sold to the buyer, Studio ticket transferred and a new one issued (id p_new_event_ticket_id, token p_new_qr_token, holder from the buyer profile), transaction completed. Outcomes: completed; already_completed (completed/disputed/refunded: no-op); transaction_missing; and the conflicts that need a refund: transaction_not_pending, listing_missing, listing_sold, reserved_by_other, listing_unavailable, studio_ticket_unavailable (Studio ticket no longer valid, or its tier is external; the listing is cancelled). A conflict cancels the transaction and stores the payment intent. Locks the listing, then the transaction, then the Studio ticket. Raises QR_TOKEN_REQUIRED for a Studio listing without p_new_qr_token / p_new_event_ticket_id.';

CREATE OR REPLACE FUNCTION public.record_resale_refund(p_payment_intent_id text)
RETURNS TABLE (outcome text, transaction_id uuid, relisted boolean, was_completed boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_pre record;
  v_tx record;
  v_relisted boolean := false;
  v_n integer;
BEGIN
  -- Find the transaction WITHOUT a lock, lock its listing, then the
  -- transaction (lock order: listing, then transaction).
  SELECT tx.id, tx.ticket_id
    INTO v_pre
  FROM public.transactions tx
  WHERE p_payment_intent_id IS NOT NULL AND tx.payment_intent_id = p_payment_intent_id
  ORDER BY tx.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, false, false;
    RETURN;
  END IF;

  PERFORM 1 FROM public.tickets t WHERE t.id = v_pre.ticket_id FOR UPDATE;

  SELECT tx.id, tx.ticket_id, tx.buyer_id, tx.status::text AS status
    INTO v_tx
  FROM public.transactions tx
  WHERE tx.id = v_pre.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, false, false;
    RETURN;
  END IF;

  IF v_tx.status = 'refunded' THEN
    RETURN QUERY SELECT 'already_refunded'::text, v_tx.id, false, false;
    RETURN;
  END IF;

  UPDATE public.transactions tx SET status = 'refunded' WHERE tx.id = v_tx.id;

  IF v_tx.status = 'completed' THEN
    -- Back on sale only if this sale is the one that sold the listing, and
    -- never for a Studio resale (its old ticket is already transferred).
    UPDATE public.tickets t
    SET status = 'available', buyer_id = NULL, updated_at = now()
    WHERE t.id = v_tx.ticket_id
      AND t.status = 'sold'
      AND t.buyer_id = v_tx.buyer_id
      AND t.studio_ticket_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_relisted := v_n > 0;
  ELSIF v_tx.status = 'pending' THEN
    -- Refunded before completion: free the listing if this transaction holds it.
    UPDATE public.tickets t
    SET status = 'available', reserved_transaction_id = NULL, reserved_until = NULL, updated_at = now()
    WHERE t.id = v_tx.ticket_id AND t.reserved_transaction_id = v_tx.id AND t.status = 'reserved';
  END IF;

  RETURN QUERY SELECT 'refunded'::text, v_tx.id, v_relisted, v_tx.status IN ('completed', 'disputed');
END;
$$;
REVOKE ALL ON FUNCTION public.record_resale_refund(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_resale_refund(text) TO service_role;
COMMENT ON FUNCTION public.record_resale_refund(text) IS
  'Service role only. Marks the resale transaction paid with this payment intent as refunded. Outcomes: not_found, already_refunded, refunded. relisted = the listing went back on sale (only a completed sale outside Studio whose listing is still sold to this buyer). was_completed = the refunded transaction had been completed or disputed, i.e. the buyer had received the ticket; with relisted = false the admin should check it (Studio resale).';

-- ── 6. Seller and admin functions ───────────────────────────────────────────
-- Once 20261108090100 (C) is applied, anon/authenticated hold no INSERT,
-- UPDATE or DELETE on tickets and read only the public columns. Sellers list,
-- reprice, cancel and read their own listings through these functions;
-- admins read the review queue through admin_pending_listings. Errors are
-- raised with ERRCODE P0001 and the message set to the code.

CREATE OR REPLACE FUNCTION public.create_studio_listing(
  p_studio_ticket_id uuid,
  p_selling_price numeric,
  p_notes text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_video_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_et record;
  v_cap integer;
  v_notes text := nullif(btrim(p_notes), '');
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Locks the event ticket: two concurrent calls for it run one after the
  -- other, so the ALREADY_LISTED check below cannot be raced.
  SELECT et.id, et.buyer_id, et.event_id, et.tier_id, et.status::text AS status, tr.source AS tier_source,
         e.status AS e_status, e.is_active, e.date, e.ends_at, e.cancelled_at
    INTO v_et
  FROM public.event_tickets et
  LEFT JOIN public.event_tiers tr ON tr.id = et.tier_id
  LEFT JOIN public.events e ON e.id = et.event_id
  WHERE et.id = p_studio_ticket_id
  FOR UPDATE OF et;

  IF NOT FOUND OR v_et.buyer_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'TICKET_NOT_OWNED' USING ERRCODE = 'P0001';
  END IF;
  IF v_et.status <> 'valid' OR v_et.tier_source IS NOT DISTINCT FROM 'external' THEN
    RAISE EXCEPTION 'TICKET_NOT_VALID' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.resale_event_is_open(v_et.e_status, v_et.is_active, v_et.date, v_et.ends_at, v_et.cancelled_at) THEN
    RAISE EXCEPTION 'EVENT_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.studio_ticket_id = p_studio_ticket_id
      AND t.status IN ('available', 'reserved', 'sold')
  ) THEN
    RAISE EXCEPTION 'ALREADY_LISTED' USING ERRCODE = 'P0001';
  END IF;
  IF p_selling_price IS NULL OR p_selling_price < 0.5 OR p_selling_price > 10000 OR p_selling_price <> round(p_selling_price, 2) THEN
    RAISE EXCEPTION 'INVALID_PRICE' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.cap_cents INTO v_cap FROM public.resale_price_cap(v_et.event_id, v_et.tier_id) c;
  IF v_cap IS NOT NULL AND p_selling_price * 100 > v_cap THEN
    RAISE EXCEPTION 'PRICE_ABOVE_CAP' USING ERRCODE = 'P0001';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 500 THEN
    RAISE EXCEPTION 'INVALID_NOTES' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.tickets (seller_id, event_id, selling_price, quantity, notes, status, qr_hash, qr_verified,
                                verification_status, needs_review, studio_ticket_id, photo_url, video_url)
    VALUES (v_uid, v_et.event_id, p_selling_price, 1, v_notes, 'available', 'studio:' || p_studio_ticket_id, true,
            'verified', false, p_studio_ticket_id, p_photo_url, p_video_url)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- qr_hash 'studio:<id>' is unique: an older, dead row for this ticket
    -- (e.g. rejected) still holds it.
    RAISE EXCEPTION 'ALREADY_LISTED' USING ERRCODE = 'P0001';
  END;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_studio_listing(uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_studio_listing(uuid, numeric, text, text, text) TO authenticated;
COMMENT ON FUNCTION public.create_studio_listing(uuid, numeric, text, text, text) IS
  'Lists one of the caller''s Studio tickets for resale and returns the new listing id. The row is written by the server only: seller = caller, event from the ticket, quantity 1, status available, verified, qr_hash studio:<ticket id>. Raises, in this order: AUTH_REQUIRED, TICKET_NOT_OWNED, TICKET_NOT_VALID (not valid, or external tier), EVENT_CLOSED, ALREADY_LISTED (available/reserved/sold listing exists, or its qr_hash is still taken), INVALID_PRICE (null, under 0.50, over 10000, or more than 2 decimals), PRICE_ABOVE_CAP (resale_price_cap), INVALID_NOTES (> 500 characters).';

CREATE OR REPLACE FUNCTION public.my_listings()
RETURNS TABLE (
  listing_id uuid,
  event_id uuid,
  selling_price numeric,
  quantity integer,
  notes text,
  status text,
  verification_status text,
  created_at timestamptz,
  boosted_until timestamptz,
  studio_ticket_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  SELECT t.id, t.event_id, t.selling_price, t.quantity, t.notes, t.status, t.verification_status,
         t.created_at, t.boosted_until, t.studio_ticket_id
  FROM public.tickets t
  WHERE t.seller_id = auth.uid()
  ORDER BY t.created_at DESC NULLS LAST, t.id;
END;
$$;
REVOKE ALL ON FUNCTION public.my_listings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_listings() TO authenticated;
COMMENT ON FUNCTION public.my_listings() IS
  'The caller''s own listings (every status), newest first, with their notes. Raises AUTH_REQUIRED without a signed-in user.';

CREATE OR REPLACE FUNCTION public.update_my_listing_price(p_listing_id uuid, p_selling_price numeric)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t record;
  v_cap integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT t.id, t.status, t.event_id, t.studio_ticket_id INTO v_t
  FROM public.tickets t
  WHERE t.id = p_listing_id AND t.seller_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_t.status IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'NOT_EDITABLE' USING ERRCODE = 'P0001';
  END IF;
  IF p_selling_price IS NULL OR p_selling_price < 0.5 OR p_selling_price > 10000 OR p_selling_price <> round(p_selling_price, 2) THEN
    RAISE EXCEPTION 'INVALID_PRICE' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.cap_cents INTO v_cap
  FROM public.resale_price_cap(
    v_t.event_id,
    (SELECT et.tier_id FROM public.event_tickets et WHERE et.id = v_t.studio_ticket_id)
  ) c;
  IF v_cap IS NOT NULL AND p_selling_price * 100 > v_cap THEN
    RAISE EXCEPTION 'PRICE_ABOVE_CAP' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tickets t SET selling_price = p_selling_price WHERE t.id = v_t.id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_listing_price(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_listing_price(uuid, numeric) TO authenticated;
COMMENT ON FUNCTION public.update_my_listing_price(uuid, numeric) IS
  'Changes the price of one of the caller''s listings while it is available (never during a checkout). Locks the listing. Raises AUTH_REQUIRED, NOT_FOUND (not the caller''s), NOT_EDITABLE (status is not available), INVALID_PRICE (null, under 0.50, over 10000, or more than 2 decimals), PRICE_ABOVE_CAP (resale_price_cap of the event and, for a Studio listing, its tier).';

CREATE OR REPLACE FUNCTION public.cancel_my_listing(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT t.id, t.status INTO v_t
  FROM public.tickets t
  WHERE t.id = p_listing_id AND t.seller_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_t.status IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'NOT_EDITABLE' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.transactions tx WHERE tx.ticket_id = v_t.id) THEN
    -- Deleting would cascade to its transactions (cancelled checkouts, which
    -- may carry a payment intent and a refund): keep them, cancel the
    -- listing instead and free its qr_hash so the ticket can be listed again.
    UPDATE public.tickets t
    SET status = 'cancelled', qr_hash = NULL, reserved_transaction_id = NULL, reserved_until = NULL
    WHERE t.id = v_t.id;
  ELSE
    DELETE FROM public.tickets t WHERE t.id = v_t.id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_my_listing(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_listing(uuid) TO authenticated;
COMMENT ON FUNCTION public.cancel_my_listing(uuid) IS
  'Withdraws one of the caller''s listings while it is available: deletes it, or, when transactions reference it, sets it to cancelled (keeping the transaction history) with its qr_hash cleared. Raises AUTH_REQUIRED, NOT_FOUND (not the caller''s), NOT_EDITABLE (status is not available).';

CREATE OR REPLACE FUNCTION public.admin_pending_listings()
RETURNS TABLE (
  id uuid,
  status text,
  verification_status text,
  selling_price numeric,
  quantity integer,
  notes text,
  qr_verified boolean,
  created_at timestamptz,
  event_id uuid,
  event_title text,
  event_date timestamptz,
  event_location text,
  event_campus text,
  seller_full_name text,
  seller_email text,
  seller_campus text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'NOT_ADMIN' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  SELECT t.id, t.status, t.verification_status, t.selling_price, t.quantity, t.notes, t.qr_verified, t.created_at,
         t.event_id, e.title, e.date, e.location, e.campus,
         p.full_name, p.email, p.campus
  FROM public.tickets t
  LEFT JOIN public.events e ON e.id = t.event_id
  LEFT JOIN public.profiles p ON p.id = t.seller_id
  WHERE t.verification_status = 'pending'
    AND t.status = 'available'
  ORDER BY t.created_at ASC NULLS LAST, t.id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_pending_listings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pending_listings() TO authenticated;
COMMENT ON FUNCTION public.admin_pending_listings() IS
  'Admin review queue: listings with verification_status pending and status available, oldest first, with event and seller details (name, email, campus). Raises NOT_ADMIN unless the caller has the admin role in user_roles.';
