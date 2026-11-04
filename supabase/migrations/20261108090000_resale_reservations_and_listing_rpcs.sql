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
--
-- Requires 20261103120000_resale_disputes_and_price_cap.sql ('disputed'
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
  'Verified resale listings on open events, cheapest first, safe columns only (never seller identity, qr_hash, file_url, buyer_id, verification_errors, studio_ticket_id or notes). price_cents is per ticket, before the buyer fee. Without p_listing_id: listings that can be bought now (available, or reserved with an expired hold). With p_listing_id: that listing even while reserved, is_reserved telling whether someone holds it now.';

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
    AND public.resale_event_is_open(e.status, e.is_active, e.date, e.ends_at, e.cancelled_at);
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

CREATE OR REPLACE FUNCTION public.seller_public_stats_for_listing(p_listing_id uuid)
RETURNS TABLE (full_name text, university text, campus text, member_since timestamptz, completed_sales integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.full_name, s.university, s.campus, s.member_since, s.completed_sales
  FROM public.tickets t
  CROSS JOIN LATERAL public.seller_public_stats(t.seller_id) s
  WHERE t.id = p_listing_id
    AND t.verification_status = 'verified';
$$;
REVOKE ALL ON FUNCTION public.seller_public_stats_for_listing(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seller_public_stats_for_listing(uuid) TO anon, authenticated;
COMMENT ON FUNCTION public.seller_public_stats_for_listing(uuid) IS
  'seller_public_stats for the seller of a verified listing, looked up by listing id so the seller id never reaches the browser.';

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
  SELECT t.id, t.seller_id, t.status, t.verification_status, t.selling_price,
         t.reserved_transaction_id, t.reserved_until, t.event_id
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
     OR v_open IS NOT TRUE THEN
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
  'Service role only. Locks the listing and, when it can be bought, creates the pending transaction and reserves the listing for it until now() + p_hold_seconds. Outcomes: reserved, not_available, own_listing, price_changed (listing price differs from p_expected_unit_price), reserved_by_other (another buyer holds an unexpired reservation; reserved_until says until when). A takeover of an expired reservation, or of the same buyer''s own, cancels the previous pending transaction and returns it as previous_transaction_id.';

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
  v_tx record;
  v_t record;
  v_et record;
  v_outcome text;
  v_names text[];
  v_email text;
  v_first text;
  v_last text;
BEGIN
  -- 1. The transaction.
  SELECT tx.id, tx.ticket_id, tx.buyer_id, tx.status::text AS status
    INTO v_tx
  FROM public.transactions tx
  WHERE tx.id = p_transaction_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'transaction_missing'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 2. Already done (webhook retry, or a later dispute/refund).
  IF v_tx.status IN ('completed', 'disputed', 'refunded') THEN
    RETURN QUERY SELECT 'already_completed'::text, v_tx.ticket_id, v_tx.buyer_id, NULL::uuid;
    RETURN;
  END IF;

  -- 3. Cancelled (reservation taken over or released) or another state.
  IF v_tx.status <> 'pending' THEN
    v_outcome := 'transaction_not_pending';
  ELSE
    -- 4. The listing.
    SELECT t.id, t.status, t.verification_status, t.reserved_transaction_id, t.studio_ticket_id
      INTO v_t
    FROM public.tickets t
    WHERE t.id = v_tx.ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_outcome := 'listing_missing';
    ELSIF v_t.status = 'sold' THEN
      v_outcome := 'listing_sold';
    ELSIF v_t.status = 'reserved' AND v_t.reserved_transaction_id IS DISTINCT FROM v_tx.id THEN
      v_outcome := 'reserved_by_other';
    ELSIF v_t.verification_status IS DISTINCT FROM 'verified'
          OR v_t.status IS NULL OR v_t.status NOT IN ('available', 'reserved') THEN
      v_outcome := 'listing_unavailable';
    ELSIF v_t.studio_ticket_id IS NOT NULL THEN
      -- 5. The Studio ticket behind the listing.
      SELECT et.id, et.order_id, et.event_id, et.tier_id, et.status::text AS status, et.source
        INTO v_et
      FROM public.event_tickets et
      WHERE et.id = v_t.studio_ticket_id
      FOR UPDATE;
      IF NOT FOUND OR v_et.status <> 'valid' THEN
        v_outcome := 'studio_ticket_unavailable';
        UPDATE public.tickets t
        SET status = 'cancelled', reserved_transaction_id = NULL, reserved_until = NULL, updated_at = now()
        WHERE t.id = v_t.id;
      ELSIF p_new_qr_token IS NULL OR p_new_event_ticket_id IS NULL THEN
        RAISE EXCEPTION 'QR_TOKEN_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- 6. Conflict: the buyer paid but cannot get this listing. The caller refunds.
  IF v_outcome IS NOT NULL THEN
    UPDATE public.transactions tx
    SET status = 'cancelled',
        payment_intent_id = coalesce(p_payment_intent_id, tx.payment_intent_id)
    WHERE tx.id = v_tx.id;
    RETURN QUERY SELECT v_outcome, v_tx.ticket_id, v_tx.buyer_id, NULL::uuid;
    RETURN;
  END IF;

  -- 7. Success.
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
  'Service role only. Completes a paid resale in one transaction: listing sold to the buyer, Studio ticket transferred and a new one issued (id p_new_event_ticket_id, token p_new_qr_token, holder from the buyer profile), transaction completed. Outcomes: completed; already_completed (completed/disputed/refunded: no-op); transaction_missing; and the conflicts that need a refund: transaction_not_pending, listing_missing, listing_sold, reserved_by_other, listing_unavailable, studio_ticket_unavailable (Studio ticket no longer valid; the listing is cancelled). A conflict cancels the transaction and stores the payment intent. Raises QR_TOKEN_REQUIRED for a Studio listing without p_new_qr_token / p_new_event_ticket_id.';

CREATE OR REPLACE FUNCTION public.record_resale_refund(p_payment_intent_id text)
RETURNS TABLE (outcome text, transaction_id uuid, relisted boolean, was_completed boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_tx record;
  v_relisted boolean := false;
  v_n integer;
BEGIN
  SELECT tx.id, tx.ticket_id, tx.buyer_id, tx.status::text AS status
    INTO v_tx
  FROM public.transactions tx
  WHERE p_payment_intent_id IS NOT NULL AND tx.payment_intent_id = p_payment_intent_id
  ORDER BY tx.created_at DESC
  LIMIT 1
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
    WHERE t.reserved_transaction_id = v_tx.id AND t.status = 'reserved';
  END IF;

  RETURN QUERY SELECT 'refunded'::text, v_tx.id, v_relisted, v_tx.status IN ('completed', 'disputed');
END;
$$;
REVOKE ALL ON FUNCTION public.record_resale_refund(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_resale_refund(text) TO service_role;
COMMENT ON FUNCTION public.record_resale_refund(text) IS
  'Service role only. Marks the resale transaction paid with this payment intent as refunded. Outcomes: not_found, already_refunded, refunded. relisted = the listing went back on sale (only a completed sale outside Studio whose listing is still sold to this buyer). was_completed = the refunded transaction had been completed or disputed, i.e. the buyer had received the ticket; with relisted = false the admin should check it (Studio resale).';
