-- Privileges and RLS after migrations A, B, C, exercised with real statements
-- under SET ROLE (anon / authenticated), plus catalog checks, and the seller
-- and admin functions that replace direct tickets access (create_studio_listing,
-- my_listings, update_my_listing_price, cancel_my_listing,
-- admin_pending_listings). Rolled back.
--
-- How each refusal is asserted:
--   * tests.expect_denied: the statement must fail with SQLSTATE 42501.
--     On tickets and on views this is a missing GRANT (privilege layer);
--     for a conversations INSERT it is the RLS WITH CHECK rejection, which
--     PostgreSQL also reports as 42501 (noted on that test).
--   * tests.affected(...): rows written where a privilege exists (only the
--     conversations INSERT now; tickets has no client write privilege).
BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- anon on the base table tickets
-- ════════════════════════════════════════════════════════════════════════════
SET ROLE anon;
SELECT tests.as_user(NULL);

SELECT tests.expect_denied('SELECT qr_hash FROM public.tickets',             'anon: SELECT qr_hash FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT file_url FROM public.tickets',            'anon: SELECT file_url FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT buyer_id FROM public.tickets',            'anon: SELECT buyer_id FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT studio_ticket_id FROM public.tickets',    'anon: SELECT studio_ticket_id FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT verification_errors FROM public.tickets', 'anon: SELECT verification_errors FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT seller_id FROM public.tickets',           'anon: SELECT seller_id FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT notes FROM public.tickets',               'anon: SELECT notes FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT reserved_transaction_id FROM public.tickets', 'anon: SELECT reserved_transaction_id FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT reserved_until FROM public.tickets',      'anon: SELECT reserved_until FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT * FROM public.tickets',                   'anon: SELECT * FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT id FROM public.tickets WHERE qr_hash = ''hash-l2''', 'anon: filtering on qr_hash refused too (42501)');

SELECT tests.ok(
  (SELECT count(*) = 5 AND bool_and(status = 'available' AND verification_status = 'verified')
   FROM public.tickets),
  'anon: SELECT id, status, verification_status works and returns only the 5 available+verified rows: L1, L2, L6, L7, L10 (RLS)');
SELECT tests.ok(
  (SELECT count(*) FROM (SELECT id, event_id, status, verification_status, selling_price, quantity, qr_verified,
                                created_at, updated_at, boosted_until, photo_url, video_url FROM public.tickets) x) = 5,
  'anon: every granted column is readable');

SELECT tests.expect_denied('UPDATE public.tickets SET selling_price = 1',                 'anon: UPDATE tickets refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET selling_price = 1 WHERE id = ''' || tests.id('L1') || '''', 'anon: UPDATE one active listing refused (42501, privilege)');
SELECT tests.expect_denied('DELETE FROM public.tickets',                                  'anon: DELETE FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('DELETE FROM public.tickets WHERE id = ''' || tests.id('L1') || '''', 'anon: DELETE one active listing refused (42501, privilege)');
SELECT tests.expect_denied('INSERT INTO public.tickets (event_id, selling_price) VALUES (''' || tests.id('E4') || ''', 1)', 'anon: INSERT INTO tickets refused (42501, privilege)');
SELECT tests.expect_denied('TRUNCATE public.tickets',                                     'anon: TRUNCATE tickets refused (42501, privilege)');

-- ════════════════════════════════════════════════════════════════════════════
-- anon on available_tickets_public (invoker view, read-only)
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.ok(
  (SELECT count(*) = 5 AND bool_and(status = 'available') FROM public.available_tickets_public),
  'anon: SELECT * FROM available_tickets_public returns the 5 active rows (invoker + RLS + column grants)');
SELECT tests.ok(
  (SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'available_tickets_public')
  = ARRAY['id','event_id','status','selling_price','quantity','qr_verified','created_at','updated_at'],
  'available_tickets_public has only the safe columns (no seller_id, notes, verification_errors)');
SELECT tests.expect_denied('UPDATE public.available_tickets_public SET selling_price = 1',        'anon: UPDATE available_tickets_public refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.available_tickets_public SET selling_price = 1 WHERE id = ''' || tests.id('L1') || '''', 'anon: UPDATE one row of available_tickets_public refused (42501, privilege)');
SELECT tests.expect_denied('DELETE FROM public.available_tickets_public',                         'anon: DELETE FROM available_tickets_public refused (42501, privilege)');
SELECT tests.expect_denied('DELETE FROM public.available_tickets_public WHERE id = ''' || tests.id('L1') || '''', 'anon: DELETE one row of available_tickets_public refused (42501, privilege)');
SELECT tests.expect_denied('INSERT INTO public.available_tickets_public (event_id, selling_price) VALUES (''' || tests.id('E4') || ''', 1)', 'anon: INSERT INTO available_tickets_public refused (42501, privilege)');

-- Every view in public: UPDATE refused. available_tickets_public is
-- auto-updatable so the refusal is the privilege (42501, asserted above); the
-- aggregate views are not updatable at all, so PostgreSQL may refuse them
-- with 55000 before checking privileges. Both are refusals; the catalog check
-- further down proves no write privilege exists on any of them.
DO $$
DECLARE v record; col text;
BEGIN
  FOR v IN SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY 1 LOOP
    SELECT attname INTO col FROM pg_attribute
    WHERE attrelid = ('public.' || quote_ident(v.viewname))::regclass AND attnum = 1;
    BEGIN
      EXECUTE format('UPDATE public.%I SET %I = %I', v.viewname, col, col);
      RAISE EXCEPTION 'not ok - anon: UPDATE on view % succeeded', v.viewname;
    EXCEPTION
      WHEN insufficient_privilege OR object_not_in_prerequisite_state OR feature_not_supported THEN
        RAISE NOTICE 'ok - anon: UPDATE on view % refused (%)', v.viewname, SQLSTATE;
    END;
  END LOOP;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- authenticated on the base table tickets: public columns only, no writes
-- ════════════════════════════════════════════════════════════════════════════
SET ROLE authenticated;
SELECT tests.as_user(tests.id('B1'));

SELECT tests.expect_denied('SELECT qr_hash FROM public.tickets',          'B1: SELECT qr_hash FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT buyer_id FROM public.tickets',         'B1: SELECT buyer_id FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT studio_ticket_id FROM public.tickets', 'B1: SELECT studio_ticket_id FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT file_url FROM public.tickets',         'B1: SELECT file_url FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT verification_errors FROM public.tickets', 'B1: SELECT verification_errors FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT reserved_until FROM public.tickets',   'B1: SELECT reserved_until FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT seller_id FROM public.tickets',        'B1: SELECT seller_id FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT notes FROM public.tickets',            'B1: SELECT notes FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT needs_review FROM public.tickets',     'B1: SELECT needs_review FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT expires_at FROM public.tickets',       'B1: SELECT expires_at FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT * FROM public.tickets',                'B1: SELECT * FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT id FROM public.tickets WHERE seller_id = ''' || tests.id('S') || '''', 'B1: filtering on seller_id refused too (42501)');
SELECT tests.ok(
  (SELECT count(*) FROM (SELECT id, event_id, status, verification_status, selling_price, quantity, qr_verified,
                                created_at, updated_at, boosted_until, photo_url, video_url FROM public.tickets) x) >= 5,
  'B1: the public column set is readable');

SELECT tests.expect_denied('UPDATE public.tickets SET selling_price = 1 WHERE id = ''' || tests.id('L1') || '''', 'B1: UPDATE selling_price on S''s listing refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET status = ''cancelled'' WHERE id = ''' || tests.id('L1') || '''', 'B1: UPDATE status refused (42501, privilege)');
SELECT tests.expect_denied('DELETE FROM public.tickets WHERE id = ''' || tests.id('L1') || '''', 'B1: DELETE of S''s listing refused (42501, privilege)');
SELECT tests.expect_denied('DELETE FROM public.tickets', 'B1: DELETE FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied(
  'INSERT INTO public.tickets (event_id, seller_id, selling_price) VALUES (''' || tests.id('E4') || ''', ''' || tests.id('B1') || ''', 1)',
  'B1: plain INSERT INTO tickets as self refused (42501, privilege)');
-- The exploit the verifier found: a self-verified, already "sold" row
-- assigned to a victim buyer, with a reservation.
SELECT tests.expect_denied(
  'INSERT INTO public.tickets (event_id, seller_id, status, verification_status, qr_verified, selling_price, quantity, buyer_id, reserved_transaction_id, reserved_until) VALUES ('''
    || tests.id('E4') || ''', ''' || tests.id('B1') || ''', ''sold'', ''verified'', true, 1, 1, ''' || tests.id('B2') || ''', ''' || tests.id('TX8') || ''', now() + interval ''1 day'')',
  'B1: exploit INSERT (verified, sold, buyer_id = victim, reserved_*) refused (42501, privilege)');
SELECT tests.expect_denied(
  'INSERT INTO public.tickets (event_id, seller_id, status, verification_status, selling_price) VALUES (''' || tests.id('E4') || ''', ''' || tests.id('B1') || ''', ''available'', ''verified'', 1) RETURNING id',
  'B1: self-verified available INSERT ... RETURNING id refused (42501, privilege)');
SELECT tests.ok(
  (SELECT count(*) FROM public.resale_listings()) = 3,
  'B1: after the refused inserts, resale_listings() still shows only the 3 seeded listings');
SELECT tests.expect_denied('UPDATE public.available_tickets_public SET selling_price = 1', 'B1: UPDATE available_tickets_public refused (42501)');
SELECT tests.expect_denied('DELETE FROM public.available_tickets_public',                  'B1: DELETE FROM available_tickets_public refused (42501)');
SELECT tests.expect_denied('TRUNCATE public.tickets',                                      'B1: TRUNCATE tickets refused (42501)');
DO $$
DECLARE v record; col text;
BEGIN
  FOR v IN SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY 1 LOOP
    SELECT attname INTO col FROM pg_attribute
    WHERE attrelid = ('public.' || quote_ident(v.viewname))::regclass AND attnum = 1;
    BEGIN
      EXECUTE format('DELETE FROM public.%I', v.viewname);
      RAISE EXCEPTION 'not ok - B1: DELETE on view % succeeded', v.viewname;
    EXCEPTION
      WHEN insufficient_privilege OR object_not_in_prerequisite_state OR feature_not_supported THEN
        RAISE NOTICE 'ok - B1: DELETE on view % refused (%)', v.viewname, SQLSTATE;
    END;
  END LOOP;
END $$;

-- The seller on their own rows: no direct writes, no seller_id/notes either.
SELECT tests.as_user(tests.id('S'));
SELECT tests.expect_denied('SELECT notes FROM public.tickets WHERE id = ''' || tests.id('L1') || '''', 'S: SELECT notes of own L1 refused (42501, privilege; use my_listings)');
SELECT tests.expect_denied('SELECT seller_id FROM public.tickets', 'S: SELECT seller_id refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET selling_price = 26 WHERE id = ''' || tests.id('L1') || '''', 'S: UPDATE selling_price on own available L1 refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET notes = ''n'' WHERE id = ''' || tests.id('L1') || '''', 'S: UPDATE notes on own L1 refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET status = ''sold'' WHERE id = ''' || tests.id('L1') || '''', 'S: UPDATE status refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET verification_status = ''verified'' WHERE id = ''' || tests.id('L3') || '''', 'S: UPDATE verification_status refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET reserved_until = NULL WHERE id = ''' || tests.id('L8') || '''', 'S: UPDATE reserved_until refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET buyer_id = NULL WHERE id = ''' || tests.id('L4') || '''', 'S: UPDATE buyer_id refused (42501, privilege)');
SELECT tests.expect_denied('DELETE FROM public.tickets WHERE id = ''' || tests.id('L1') || '''', 'S: DELETE own available L1 refused (42501, privilege)');
SELECT tests.expect_denied(
  'INSERT INTO public.tickets (event_id, seller_id, status, verification_status, selling_price, studio_ticket_id, qr_hash) VALUES ('''
    || tests.id('E1') || ''', ''' || tests.id('S') || ''', ''available'', ''verified'', 1, ''' || tests.id('ET2') || ''', ''studio:x'')',
  'S: direct INSERT of a Studio listing refused (42501, privilege; use create_studio_listing)');

-- The admin: no direct writes or seller columns either (admin-review-ticket
-- edge function and admin_pending_listings instead).
SELECT tests.as_user(tests.id('A'));
SELECT tests.expect_denied('UPDATE public.tickets SET notes = ''admin'' WHERE id = ''' || tests.id('L8') || '''', 'admin: UPDATE tickets refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET verification_status = ''verified'' WHERE id = ''' || tests.id('L3') || '''', 'admin: UPDATE verification_status refused (42501, privilege)');
SELECT tests.expect_denied('SELECT notes FROM public.tickets', 'admin: SELECT notes refused (42501, privilege)');
SELECT tests.expect_denied('SELECT seller_id FROM public.tickets', 'admin: SELECT seller_id refused (42501, privilege)');
SELECT tests.ok((SELECT count(*) FROM (SELECT id FROM public.tickets) x) = 9, 'admin: SELECT id still sees every row (admin SELECT policy kept)');
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- my_listings
-- ════════════════════════════════════════════════════════════════════════════
SET ROLE authenticated;
SELECT tests.as_user(tests.id('S'));
SELECT tests.ok(
  (SELECT count(*) = 9 FROM public.my_listings()),
  'S: my_listings() returns all 9 of S''s listings (every status)');
SELECT tests.ok(
  (SELECT notes = 'call me 0600000000' AND studio_ticket_id = tests.id('ET1') AND status = 'available' AND verification_status = 'verified'
          AND selling_price = 25.00 AND quantity = 1 AND event_id = tests.id('E1')
   FROM public.my_listings() WHERE listing_id = tests.id('L1')),
  'S: my_listings() row for L1 carries notes, studio_ticket_id, status, price');
SELECT tests.ok(
  (SELECT array_agg(listing_id ORDER BY ord) FROM public.my_listings() WITH ORDINALITY m(listing_id, event_id, selling_price, quantity, notes, status, verification_status, created_at, boosted_until, studio_ticket_id, ord))
  = (SELECT array_agg(listing_id ORDER BY created_at DESC, listing_id) FROM public.my_listings()),
  'S: my_listings() is newest first');
SELECT tests.ok(
  (SELECT listing_id = tests.id('L8') FROM public.my_listings() WITH ORDINALITY m(listing_id, event_id, selling_price, quantity, notes, status, verification_status, created_at, boosted_until, studio_ticket_id, ord) ORDER BY ord DESC LIMIT 1),
  'S: my_listings() oldest (L8, created 2 days ago) last');
SELECT tests.as_user(tests.id('B1'));
SELECT tests.ok((SELECT count(*) FROM public.my_listings()) = 0, 'B1: my_listings() empty (no other seller''s rows)');
SELECT tests.as_user(tests.id('B2'));
SELECT tests.ok((SELECT count(*) FROM public.my_listings()) = 0, 'B2 (buyer of L4): my_listings() empty');
SELECT tests.as_user(NULL);
SELECT tests.expect_error('SELECT * FROM public.my_listings()', 'AUTH_REQUIRED%', 'authenticated role without a user: my_listings AUTH_REQUIRED');
RESET ROLE;
SET ROLE anon;
SELECT tests.as_user(NULL);
SELECT tests.expect_denied('SELECT * FROM public.my_listings()', 'anon: my_listings refused (42501)');
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- update_my_listing_price
-- ════════════════════════════════════════════════════════════════════════════
SET ROLE authenticated;
SELECT tests.as_user(tests.id('S'));
SELECT public.update_my_listing_price(tests.id('L1'), 26.00);
SELECT tests.ok((SELECT price_cents = 2600 FROM public.resale_listings(p_listing_id => tests.id('L1'))), 'S: update_my_listing_price(L1, 26) -> listed at 2600 cents');
SELECT public.update_my_listing_price(tests.id('L1'), 36.00);
SELECT tests.ok((SELECT price_cents = 3600 FROM public.resale_listings(p_listing_id => tests.id('L1'))), 'S: update_my_listing_price(L1, 36) = the cap (30 EUR face + 20 %) is allowed');
SELECT tests.expect_error('SELECT public.update_my_listing_price(''' || tests.id('L1') || ''', 36.01)', 'PRICE_ABOVE_CAP%', 'S: L1 at 36.01 > cap 3600: PRICE_ABOVE_CAP');
SELECT tests.expect_error('SELECT public.update_my_listing_price(''' || tests.id('L1') || ''', 0)', 'INVALID_PRICE%', 'S: price 0: INVALID_PRICE');
SELECT tests.expect_error('SELECT public.update_my_listing_price(''' || tests.id('L1') || ''', -5)', 'INVALID_PRICE%', 'S: negative price: INVALID_PRICE');
SELECT tests.expect_error('SELECT public.update_my_listing_price(''' || tests.id('L1') || ''', NULL)', 'INVALID_PRICE%', 'S: NULL price: INVALID_PRICE');
SELECT tests.expect_error('SELECT public.update_my_listing_price(''' || tests.id('L2') || ''', 10000.01)', 'INVALID_PRICE%', 'S: price > 10000: INVALID_PRICE');
SELECT public.update_my_listing_price(tests.id('L2'), 10000);
SELECT tests.ok((SELECT price_cents = 1000000 FROM public.resale_listings(p_listing_id => tests.id('L2'))), 'S: external L2 (no cap) at 10000 allowed');
SELECT public.update_my_listing_price(tests.id('L2'), 12.00);
SELECT tests.expect_error('SELECT public.update_my_listing_price(''' || tests.id('L8') || ''', 1)', 'NOT_EDITABLE%', 'S: own reserved L8: NOT_EDITABLE');
SELECT tests.expect_error('SELECT public.update_my_listing_price(''' || tests.id('L4') || ''', 1)', 'NOT_EDITABLE%', 'S: own sold L4: NOT_EDITABLE');
SELECT tests.expect_error('SELECT public.update_my_listing_price(''' || tests.id('L5') || ''', 1)', 'NOT_EDITABLE%', 'S: own cancelled L5: NOT_EDITABLE');
SELECT tests.ok((SELECT price_cents = 3000 FROM public.resale_listings(p_listing_id => tests.id('L8'))), 'S: reserved L8 price unchanged');
SELECT tests.as_user(tests.id('B1'));
SELECT tests.expect_error('SELECT public.update_my_listing_price(''' || tests.id('L1') || ''', 1)', 'NOT_FOUND%', 'B1 on S''s L1: NOT_FOUND');
SELECT tests.expect_error('SELECT public.update_my_listing_price(gen_random_uuid(), 1)', 'NOT_FOUND%', 'B1 on an unknown listing: NOT_FOUND');
SELECT tests.as_user(NULL);
SELECT tests.expect_error('SELECT public.update_my_listing_price(''' || tests.id('L1') || ''', 1)', 'AUTH_REQUIRED%', 'no user: update_my_listing_price AUTH_REQUIRED');
SELECT tests.ok((SELECT price_cents = 3600 FROM public.resale_listings(p_listing_id => tests.id('L1'))), 'L1 price unchanged by the refused calls');
RESET ROLE;
SET ROLE anon;
SELECT tests.expect_denied('SELECT public.update_my_listing_price(''' || tests.id('L1') || ''', 1)', 'anon: update_my_listing_price refused (42501)');
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- cancel_my_listing
-- ════════════════════════════════════════════════════════════════════════════
-- L6 (available, ended event) gets a cancelled checkout with a payment intent:
-- cancelling it must keep that transaction.
INSERT INTO public.transactions (id, ticket_id, buyer_id, seller_id, amount, quantity, status, payment_intent_id)
VALUES ('abababab-0000-0000-0000-0000000000d6', tests.id('L6'), tests.id('B1'), tests.id('S'), 11.55, 1, 'cancelled', 'pi_d6');
SET ROLE authenticated;
SELECT tests.as_user(tests.id('B1'));
SELECT tests.expect_error('SELECT public.cancel_my_listing(''' || tests.id('L10') || ''')', 'NOT_FOUND%', 'B1 cancels S''s L10: NOT_FOUND');
SELECT tests.as_user(tests.id('S'));
SELECT tests.expect_error('SELECT public.cancel_my_listing(''' || tests.id('L8') || ''')', 'NOT_EDITABLE%', 'S cancels own reserved L8: NOT_EDITABLE');
SELECT tests.expect_error('SELECT public.cancel_my_listing(''' || tests.id('L4') || ''')', 'NOT_EDITABLE%', 'S cancels own sold L4: NOT_EDITABLE');
SELECT tests.expect_error('SELECT public.cancel_my_listing(gen_random_uuid())', 'NOT_FOUND%', 'S cancels an unknown listing: NOT_FOUND');
SELECT public.cancel_my_listing(tests.id('L10'));
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.my_listings() WHERE listing_id = tests.id('L10')), 'S cancels own available L10 (no transactions): row deleted');
SELECT public.cancel_my_listing(tests.id('L6'));
SELECT tests.ok((SELECT status = 'cancelled' FROM public.my_listings() WHERE listing_id = tests.id('L6')), 'S cancels own available L6 with a transaction: status cancelled');
SELECT tests.as_user(NULL);
SELECT tests.expect_error('SELECT public.cancel_my_listing(''' || tests.id('L1') || ''')', 'AUTH_REQUIRED%', 'no user: cancel_my_listing AUTH_REQUIRED');
RESET ROLE;
SELECT tests.ok(
  (SELECT qr_hash IS NULL AND reserved_transaction_id IS NULL FROM public.tickets WHERE id = tests.id('L6'))
  AND EXISTS (SELECT 1 FROM public.transactions WHERE id = 'abababab-0000-0000-0000-0000000000d6' AND payment_intent_id = 'pi_d6'),
  'cancel with history: qr_hash freed, the cancelled transaction (pi_d6) kept');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.tickets WHERE id = tests.id('L8') AND status = 'reserved')
  AND EXISTS (SELECT 1 FROM public.tickets WHERE id = tests.id('L4') AND status = 'sold'),
  'refused cancels left L8 reserved and L4 sold');
SET ROLE anon;
SELECT tests.expect_denied('SELECT public.cancel_my_listing(''' || tests.id('L1') || ''')', 'anon: cancel_my_listing refused (42501)');
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- create_studio_listing
-- ════════════════════════════════════════════════════════════════════════════
-- Extra fixtures: an external tier on E1 with a valid ticket of S's, and a
-- ticket of S's on a second Studio event that is cancelled.
INSERT INTO tests.ids (name, id) VALUES
  ('TXT', 'dddddddd-0000-0000-0000-0000000000e1'),
  ('ETX', 'ffffffff-0000-0000-0000-0000000000e1'),
  ('E5',  'eeeeeeee-0000-0000-0000-000000000005'),
  ('T5',  'dddddddd-0000-0000-0000-000000000005'),
  ('O5',  'bbbbbbbb-0000-0000-0000-000000000005'),
  ('ET9', 'ffffffff-0000-0000-0000-000000000009');
INSERT INTO public.event_tiers (id, event_id, name, price_cents, currency, total_qty, sold_qty, source)
VALUES (tests.id('TXT'), tests.id('E1'), 'Partner ticket', 2000, 'EUR', 10, 1, 'external');
INSERT INTO public.event_tickets (id, order_id, event_id, tier_id, buyer_id, qr_token, source)
VALUES (tests.id('ETX'), tests.id('O1'), tests.id('E1'), tests.id('TXT'), tests.id('S'), 'qr-etx', 'external');
INSERT INTO public.events (id, title, slug, date, location, status, is_active, organizer_id, sold_via_studio, cancelled_at)
VALUES (tests.id('E5'), 'Cancelled Gala', 'cancelled-gala', now() + interval '3 days', 'Paris', 'published', true, tests.id('OP'), true, now());
INSERT INTO public.event_tiers (id, event_id, name, price_cents, currency, total_qty, sold_qty)
VALUES (tests.id('T5'), tests.id('E5'), 'Standard', 2000, 'EUR', 10, 1);
INSERT INTO public.event_orders (id, event_id, tier_id, organizer_id, buyer_id, quantity, unit_price_cents, total_cents, status, buyer_email, paid_at)
VALUES (tests.id('O5'), tests.id('E5'), tests.id('T5'), tests.id('OP'), tests.id('S'), 1, 2000, 2000, 'paid', 's@example.invalid', now());
INSERT INTO public.event_tickets (id, order_id, event_id, tier_id, buyer_id, qr_token)
VALUES (tests.id('ET9'), tests.id('O5'), tests.id('E5'), tests.id('T5'), tests.id('S'), 'qr-et9');
UPDATE public.event_tickets SET status = 'scanned', scanned_at = now() WHERE id = tests.id('ET3');

SET ROLE authenticated;
SELECT tests.as_user(NULL);
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET2') || ''', 20)', 'AUTH_REQUIRED%', 'create_studio_listing without a user: AUTH_REQUIRED');
SELECT tests.as_user(tests.id('B1'));
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET2') || ''', 20)', 'TICKET_NOT_OWNED%', 'B1 lists S''s ET2: TICKET_NOT_OWNED');
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET2') || ''', -1)', 'TICKET_NOT_OWNED%', 'B1 lists S''s ET2 with a bad price: TICKET_NOT_OWNED comes first');
SELECT tests.expect_error('SELECT public.create_studio_listing(gen_random_uuid(), 20)', 'TICKET_NOT_OWNED%', 'unknown event ticket: TICKET_NOT_OWNED');
SELECT tests.as_user(tests.id('S'));
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET3') || ''', 20)', 'TICKET_NOT_VALID%', 'S lists scanned ET3: TICKET_NOT_VALID');
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ETX') || ''', 20)', 'TICKET_NOT_VALID%', 'S lists ETX on an external tier: TICKET_NOT_VALID');
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET9') || ''', 20)', 'EVENT_CLOSED%', 'S lists ET9 on cancelled E5: EVENT_CLOSED');
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET1') || ''', 20)', 'ALREADY_LISTED%', 'S lists ET1 (L1 available): ALREADY_LISTED');
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET4') || ''', NULL)', 'INVALID_PRICE%', 'S lists ET4 at NULL: INVALID_PRICE');
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET4') || ''', 0)', 'INVALID_PRICE%', 'S lists ET4 at 0: INVALID_PRICE');
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET4') || ''', 10001)', 'INVALID_PRICE%', 'S lists ET4 at 10001: INVALID_PRICE');
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET4') || ''', 36.01)', 'PRICE_ABOVE_CAP%', 'S lists ET4 at 36.01 (cap 3600): PRICE_ABOVE_CAP');
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET4') || ''', 20, repeat(''x'', 501))', 'INVALID_NOTES%', 'S lists ET4 with 501-character notes: INVALID_NOTES');
SELECT public.create_studio_listing(tests.id('ET2'), 36.00, '  side entrance  ', 'https://example.invalid/p2.jpg', NULL) AS new_listing \gset
SELECT tests.ok(
  (SELECT notes = 'side entrance' AND status = 'available' AND verification_status = 'verified' AND studio_ticket_id = tests.id('ET2')
          AND event_id = tests.id('E1') AND quantity = 1 AND selling_price = 36.00
   FROM public.my_listings() WHERE listing_id = :'new_listing'::uuid),
  'S: create_studio_listing(ET2, 36) happy path: returned id is in my_listings, notes trimmed');
SELECT tests.ok(
  (SELECT price_cents = 3600 AND tier_name = 'Early Bird' AND photo_url = 'https://example.invalid/p2.jpg' AND is_own
   FROM public.resale_listings(p_listing_id => :'new_listing'::uuid)),
  'S: the new listing is on sale through resale_listings');
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET2') || ''', 20)', 'ALREADY_LISTED%', 'S lists ET2 a second time: ALREADY_LISTED');
SELECT tests.ok(
  (SELECT count(*) FROM public.my_listed_studio_tickets() WHERE studio_ticket_id = tests.id('ET2')) = 1,
  'S: my_listed_studio_tickets() includes ET2');
RESET ROLE;
SELECT tests.ok(
  (SELECT seller_id = tests.id('S') AND qr_hash = 'studio:' || tests.id('ET2') AND qr_verified AND NOT needs_review
          AND buyer_id IS NULL AND reserved_transaction_id IS NULL AND reserved_until IS NULL AND file_url IS NULL AND video_url IS NULL
   FROM public.tickets WHERE id = :'new_listing'::uuid),
  'create_studio_listing: server-set columns (seller = caller, qr_hash studio:<id>, qr_verified, no buyer, no reservation)');
-- A dead row (rejected) still holding ET4's qr_hash: ALREADY_LISTED, not a raw 23505.
INSERT INTO public.tickets (event_id, seller_id, status, verification_status, selling_price, quantity, qr_hash, studio_ticket_id)
VALUES (tests.id('E1'), tests.id('S'), 'cancelled', 'rejected', 20, 1, 'studio:' || tests.id('ET4'), tests.id('ET4'));
SET ROLE authenticated;
SELECT tests.as_user(tests.id('S'));
SELECT tests.expect_error('SELECT public.create_studio_listing(''' || tests.id('ET4') || ''', 20)', 'ALREADY_LISTED%', 'S lists ET4 whose qr_hash an old rejected row holds: ALREADY_LISTED');
RESET ROLE;
SET ROLE anon;
SELECT tests.as_user(NULL);
SELECT tests.expect_denied('SELECT public.create_studio_listing(''' || tests.id('ET4') || ''', 20)', 'anon: create_studio_listing refused (42501)');
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- admin_pending_listings
-- ════════════════════════════════════════════════════════════════════════════
SET ROLE authenticated;
SELECT tests.as_user(tests.id('B1'));
SELECT tests.expect_error('SELECT * FROM public.admin_pending_listings()', 'NOT_ADMIN%', 'B1: admin_pending_listings NOT_ADMIN');
SELECT tests.as_user(tests.id('S'));
SELECT tests.expect_error('SELECT * FROM public.admin_pending_listings()', 'NOT_ADMIN%', 'S: admin_pending_listings NOT_ADMIN');
SELECT tests.as_user(NULL);
SELECT tests.expect_error('SELECT * FROM public.admin_pending_listings()', 'NOT_ADMIN%', 'no user: admin_pending_listings NOT_ADMIN');
SELECT tests.as_user(tests.id('A'));
SELECT tests.ok(
  (SELECT array_agg(id) FROM public.admin_pending_listings()) = ARRAY[tests.id('L3')],
  'admin: admin_pending_listings() = L3 only (pending + available)');
SELECT tests.ok(
  (SELECT status = 'available' AND verification_status = 'pending' AND selling_price = 10.00 AND quantity = 1 AND notes IS NULL AND NOT qr_verified
          AND event_id = tests.id('E4') AND event_title = 'Outside Gig' AND event_location = 'Lille' AND event_campus = 'Lille'
          AND seller_full_name = 'Sam Seller' AND seller_email = 's@example.invalid' AND seller_campus = 'Paris'
   FROM public.admin_pending_listings()),
  'admin: admin_pending_listings row carries listing, event and seller details');
RESET ROLE;
INSERT INTO public.tickets (id, event_id, seller_id, status, verification_status, selling_price, quantity, qr_hash, notes, created_at)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1', tests.id('E4'), tests.id('S'), 'available', 'pending', 14, 1, 'hash-a1', 'older one', now() - interval '3 days');
SET ROLE authenticated;
SELECT tests.as_user(tests.id('A'));
SELECT tests.ok(
  (SELECT array_agg(id ORDER BY ord) FROM public.admin_pending_listings() WITH ORDINALITY a(id, status, verification_status, selling_price, quantity, notes, qr_verified, created_at, event_id, event_title, event_date, event_location, event_campus, seller_full_name, seller_email, seller_campus, ord))
  = ARRAY['aaaaaaaa-0000-0000-0000-0000000000a1'::uuid, tests.id('L3')],
  'admin: admin_pending_listings oldest first, notes included');
RESET ROLE;
SET ROLE anon;
SELECT tests.expect_denied('SELECT * FROM public.admin_pending_listings()', 'anon: admin_pending_listings refused (42501)');
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- Catalog checks
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=on'] OR c.reloptions @> ARRAY['security_invoker=true'], false)
  ),
  'every view in public has security_invoker=on');
SELECT tests.ok(
  (SELECT count(*) FROM pg_views WHERE schemaname = 'public') = 5,
  'five views remain in public');
SELECT tests.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_views v, unnest(ARRAY['anon', 'authenticated']) r
    WHERE v.schemaname = 'public'
      AND (has_table_privilege(r, 'public.' || quote_ident(v.viewname), 'INSERT')
        OR has_table_privilege(r, 'public.' || quote_ident(v.viewname), 'UPDATE')
        OR has_table_privilege(r, 'public.' || quote_ident(v.viewname), 'DELETE')
        OR has_table_privilege(r, 'public.' || quote_ident(v.viewname), 'TRUNCATE')
        OR has_table_privilege(r, 'public.' || quote_ident(v.viewname), 'TRIGGER')
        OR has_table_privilege(r, 'public.' || quote_ident(v.viewname), 'REFERENCES'))
  ),
  'no view grants INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES to anon or authenticated');
SELECT tests.ok(to_regclass('public.conversation_participant_names') IS NULL, 'conversation_participant_names is dropped');
SELECT tests.ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon', 'authenticated']) r,
                  unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']) p
    WHERE has_table_privilege(r, 'public.tickets', p)
  ),
  'tickets table-level privileges: none for anon or authenticated (no INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES; SELECT only per column)');
SELECT tests.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_attribute a, unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['INSERT', 'UPDATE', 'REFERENCES']) p
    WHERE a.attrelid = 'public.tickets'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege(r, 'public.tickets', a.attname, p)
  ),
  'no tickets column is insertable, updatable or referenceable by anon or authenticated');
SELECT tests.ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon', 'authenticated']) r,
                  unnest(ARRAY['qr_hash', 'file_url', 'buyer_id', 'verification_errors', 'studio_ticket_id', 'reserved_transaction_id', 'reserved_until',
                               'seller_id', 'notes', 'needs_review', 'expires_at']) c
    WHERE has_column_privilege(r, 'public.tickets', c, 'SELECT')
  ),
  'qr_hash, file_url, buyer_id, verification_errors, studio_ticket_id, reserved_*, seller_id, notes, needs_review, expires_at never readable by anon or authenticated');
SELECT tests.ok(
  (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute
   WHERE attrelid = 'public.tickets'::regclass AND attnum > 0 AND NOT attisdropped
     AND has_column_privilege('anon', 'public.tickets', attname, 'SELECT'))
  = ARRAY['boosted_until','created_at','event_id','id','photo_url','qr_verified','quantity','selling_price','status','updated_at','verification_status','video_url'],
  'anon SELECT columns on tickets are exactly the contract list (no notes)');
SELECT tests.ok(
  (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute
   WHERE attrelid = 'public.tickets'::regclass AND attnum > 0 AND NOT attisdropped
     AND has_column_privilege('authenticated', 'public.tickets', attname, 'SELECT'))
  = ARRAY['boosted_until','created_at','event_id','id','photo_url','qr_verified','quantity','selling_price','status','updated_at','verification_status','video_url'],
  'authenticated SELECT columns on tickets are exactly the anon list (no seller_id, notes)');
SELECT tests.ok(
  has_table_privilege('service_role', 'public.tickets', 'SELECT') AND has_table_privilege('service_role', 'public.tickets', 'INSERT')
  AND has_table_privilege('service_role', 'public.tickets', 'UPDATE') AND has_table_privilege('service_role', 'public.tickets', 'DELETE'),
  'service_role keeps full access to tickets (edge functions)');
SELECT tests.ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tickets' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL'))
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tickets' AND policyname = 'Tickets visible to involved parties or when available' AND cmd = 'SELECT')
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tickets' AND policyname = 'admins_select_all_tickets' AND cmd = 'SELECT'),
  'tickets policies: the client INSERT/UPDATE/DELETE policies are dropped, the SELECT policies kept');

SELECT tests.ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY[
        'public.reserve_resale_listing(uuid, uuid, numeric, integer, integer, integer, integer, integer)',
        'public.release_resale_reservation(uuid)',
        'public.release_expired_resale_reservations()',
        'public.complete_resale_purchase(uuid, text, uuid, text)',
        'public.record_resale_refund(text)']) f,
      unnest(ARRAY['anon', 'authenticated']) r
    WHERE has_function_privilege(r, f, 'EXECUTE')
  ),
  'service-only functions: no EXECUTE for anon or authenticated');
SELECT tests.ok(
  (SELECT bool_and(has_function_privilege('service_role', f, 'EXECUTE')) FROM unnest(ARRAY[
        'public.reserve_resale_listing(uuid, uuid, numeric, integer, integer, integer, integer, integer)',
        'public.release_resale_reservation(uuid)',
        'public.release_expired_resale_reservations()',
        'public.complete_resale_purchase(uuid, text, uuid, text)',
        'public.record_resale_refund(text)']) f),
  'service-only functions: EXECUTE for service_role');
SELECT tests.ok(
  NOT has_function_privilege('anon', 'public.resale_studio_ticket_ok(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.resale_studio_ticket_ok(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.resale_studio_ticket_ok(uuid)', 'EXECUTE'),
  'resale_studio_ticket_ok: service_role only');
SELECT tests.ok(
  (SELECT bool_and(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                   AND NOT has_function_privilege('service_role', f, 'EXECUTE'))
   FROM unnest(ARRAY[
     'public.create_studio_listing(uuid, numeric, text, text, text)',
     'public.my_listings()',
     'public.update_my_listing_price(uuid, numeric)',
     'public.cancel_my_listing(uuid)',
     'public.admin_pending_listings()']) f),
  'seller/admin functions: EXECUTE for authenticated only (not anon, not PUBLIC)');
SELECT tests.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND p.proname IN ('create_studio_listing', 'my_listings', 'update_my_listing_price', 'cancel_my_listing', 'admin_pending_listings')) = 5,
  'seller/admin functions are SECURITY DEFINER');
SELECT tests.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('reserve_resale_listing', 'release_resale_reservation', 'release_expired_resale_reservations', 'complete_resale_purchase', 'record_resale_refund')
      AND p.prosecdef
  ),
  'service-only functions are SECURITY INVOKER');
SELECT tests.ok(
  has_function_privilege('anon', 'public.resale_listings(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.resale_listings(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('anon', 'public.seller_public_stats_for_listing(uuid)', 'EXECUTE')
  AND has_function_privilege('anon', 'public.resale_event_is_open(text, boolean, timestamptz, timestamptz, timestamptz)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.resale_event_is_open(text, boolean, timestamptz, timestamptz, timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.start_listing_conversation(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.start_listing_conversation(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.my_purchased_listings()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.my_listed_studio_tickets()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.my_purchased_listings()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.my_listed_studio_tickets()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_conversation_participant_names(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_conversation_participant_names(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.listing_has_seller(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.listing_has_seller(uuid, uuid)', 'EXECUTE'),
  'front-facing functions: EXECUTE exactly as in the contract');
SELECT tests.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('resale_event_is_open', 'resale_listings', 'start_listing_conversation', 'seller_public_stats_for_listing',
                        'my_purchased_listings', 'my_listed_studio_tickets', 'get_conversation_participant_names',
                        'reserve_resale_listing', 'release_resale_reservation', 'release_expired_resale_reservations',
                        'complete_resale_purchase', 'record_resale_refund', 'listing_has_seller', 'resale_studio_ticket_ok',
                        'create_studio_listing', 'my_listings', 'update_my_listing_price', 'cancel_my_listing', 'admin_pending_listings')
      AND NOT coalesce(p.proconfig @> ARRAY['search_path=public'], false)
  ),
  'every new function pins search_path = public');
SELECT tests.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND obj_description(p.oid, 'pg_proc') IS NOT NULL
     AND p.proname IN ('resale_event_is_open', 'resale_listings', 'start_listing_conversation', 'seller_public_stats_for_listing',
                       'my_purchased_listings', 'my_listed_studio_tickets', 'reserve_resale_listing', 'release_resale_reservation',
                       'release_expired_resale_reservations', 'complete_resale_purchase', 'record_resale_refund',
                       'resale_studio_ticket_ok', 'create_studio_listing', 'my_listings', 'update_my_listing_price', 'cancel_my_listing',
                       'admin_pending_listings')) = 17,
  'every new function has a COMMENT');
SELECT tests.ok(
  pg_get_function_result('public.record_resale_refund(text)'::regprocedure) = 'TABLE(outcome text, transaction_id uuid, relisted boolean, was_completed boolean)'
  AND pg_get_function_result('public.reserve_resale_listing(uuid, uuid, numeric, integer, integer, integer, integer, integer)'::regprocedure)
      = 'TABLE(outcome text, transaction_id uuid, seller_id uuid, previous_transaction_id uuid, reserved_until timestamp with time zone)'
  AND pg_get_function_result('public.complete_resale_purchase(uuid, text, uuid, text)'::regprocedure)
      = 'TABLE(outcome text, listing_id uuid, buyer_id uuid, new_event_ticket_id uuid)'
  AND pg_get_function_identity_arguments('public.reserve_resale_listing(uuid, uuid, numeric, integer, integer, integer, integer, integer)'::regprocedure)
      = 'p_listing_id uuid, p_buyer_id uuid, p_expected_unit_price numeric, p_quantity integer, p_amount_cents integer, p_fee_cents integer, p_commission_cents integer, p_hold_seconds integer'
  AND pg_get_function_identity_arguments('public.complete_resale_purchase(uuid, text, uuid, text)'::regprocedure)
      = 'p_transaction_id uuid, p_payment_intent_id text, p_new_event_ticket_id uuid, p_new_qr_token text'
  AND pg_get_function_result('public.my_listed_studio_tickets()'::regprocedure) = 'TABLE(studio_ticket_id uuid, status text)'
  AND pg_get_function_result('public.seller_public_stats_for_listing(uuid)'::regprocedure)
      = 'TABLE(first_name text, university text, campus text, member_since timestamp with time zone, completed_sales integer)'
  AND pg_get_function_result('public.my_purchased_listings()'::regprocedure)
      = 'TABLE(listing_id uuid, quantity integer, price_cents integer, purchased_at timestamp with time zone, event_id uuid, is_studio boolean, event_title text, event_date timestamp with time zone, event_location text, event_slug text, event_banner_url text, event_primary_color text)'
  AND pg_get_function_identity_arguments('public.create_studio_listing(uuid, numeric, text, text, text)'::regprocedure)
      = 'p_studio_ticket_id uuid, p_selling_price numeric, p_notes text, p_photo_url text, p_video_url text'
  AND pg_get_function_result('public.create_studio_listing(uuid, numeric, text, text, text)'::regprocedure) = 'uuid'
  AND pg_get_function_result('public.my_listings()'::regprocedure)
      = 'TABLE(listing_id uuid, event_id uuid, selling_price numeric, quantity integer, notes text, status text, verification_status text, created_at timestamp with time zone, boosted_until timestamp with time zone, studio_ticket_id uuid)'
  AND pg_get_function_identity_arguments('public.update_my_listing_price(uuid, numeric)'::regprocedure) = 'p_listing_id uuid, p_selling_price numeric'
  AND pg_get_function_result('public.update_my_listing_price(uuid, numeric)'::regprocedure) = 'void'
  AND pg_get_function_identity_arguments('public.cancel_my_listing(uuid)'::regprocedure) = 'p_listing_id uuid'
  AND pg_get_function_result('public.cancel_my_listing(uuid)'::regprocedure) = 'void'
  AND pg_get_function_result('public.admin_pending_listings()'::regprocedure)
      = 'TABLE(id uuid, status text, verification_status text, selling_price numeric, quantity integer, notes text, qr_verified boolean, created_at timestamp with time zone, event_id uuid, event_title text, event_date timestamp with time zone, event_location text, event_campus text, seller_full_name text, seller_email text, seller_campus text)',
  'service and front function signatures match the contract (incl. record_resale_refund.was_completed)');

-- ════════════════════════════════════════════════════════════════════════════
-- Calling functions without the grant (real refusals)
-- ════════════════════════════════════════════════════════════════════════════
SET ROLE anon;
SELECT tests.as_user(NULL);
SELECT tests.expect_denied('SELECT * FROM public.reserve_resale_listing(''' || tests.id('L1') || ''', ''' || tests.id('B1') || ''', 25, 1, 2625, 125, 125)', 'anon: reserve_resale_listing refused (42501)');
SELECT tests.expect_denied('SELECT * FROM public.complete_resale_purchase(gen_random_uuid(), NULL, NULL, NULL)', 'anon: complete_resale_purchase refused (42501)');
SELECT tests.expect_denied('SELECT public.release_expired_resale_reservations()', 'anon: release_expired_resale_reservations refused (42501)');
SELECT tests.expect_denied('SELECT * FROM public.get_conversation_participant_names()', 'anon: get_conversation_participant_names refused (42501)');
SELECT tests.expect_denied('SELECT public.start_listing_conversation(''' || tests.id('L1') || ''')', 'anon: start_listing_conversation refused (42501)');
SELECT tests.expect_denied('SELECT * FROM public.my_purchased_listings()', 'anon: my_purchased_listings refused (42501)');
RESET ROLE;
SET ROLE authenticated;
SELECT tests.as_user(tests.id('B1'));
SELECT tests.expect_denied('SELECT * FROM public.reserve_resale_listing(''' || tests.id('L1') || ''', ''' || tests.id('B1') || ''', 25, 1, 2625, 125, 125)', 'B1: reserve_resale_listing refused (42501)');
SELECT tests.expect_denied('SELECT * FROM public.record_resale_refund(''pi_l4'')', 'B1: record_resale_refund refused (42501)');
SELECT tests.expect_denied('SELECT public.release_resale_reservation(gen_random_uuid())', 'B1: release_resale_reservation refused (42501)');
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- Chat names
-- ════════════════════════════════════════════════════════════════════════════
SET ROLE authenticated;
SELECT tests.as_user(tests.id('B1'));
SELECT tests.ok(
  (SELECT count(*) = 1 AND bool_and(conversation_id = tests.id('C1') AND buyer_name = '  Alice  Marie Buyer ' AND seller_name = 'Sam Seller')
   FROM public.get_conversation_participant_names()),
  'B1: get_conversation_participant_names() = only C1, both names filled');
SELECT tests.ok(
  (SELECT count(*) FROM public.get_conversation_participant_names(tests.id('C2'))) = 0,
  'B1: get_conversation_participant_names(C2) (not B1''s) -> 0 rows');
SELECT tests.as_user(tests.id('S'));
SELECT tests.ok(
  (SELECT count(*) FROM public.get_conversation_participant_names()) = 2
  AND (SELECT buyer_name = 'Bob' FROM public.get_conversation_participant_names(tests.id('C2'))),
  'S (seller in both): sees C1 and C2; p_conversation_id filters');
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- start_listing_conversation and the conversations INSERT policy
-- ════════════════════════════════════════════════════════════════════════════
SET ROLE authenticated;
SELECT tests.as_user(NULL);
SELECT tests.expect_error('SELECT public.start_listing_conversation(''' || tests.id('L1') || ''')', 'AUTH_REQUIRED%', 'authenticated role without a user: AUTH_REQUIRED');
SELECT tests.as_user(tests.id('S'));
SELECT tests.expect_error('SELECT public.start_listing_conversation(''' || tests.id('L1') || ''')', 'OWN_LISTING%', 'S on own listing: OWN_LISTING');
SELECT tests.as_user(tests.id('B1'));
SELECT tests.expect_error('SELECT public.start_listing_conversation(''' || tests.id('L4') || ''')', 'LISTING_NOT_AVAILABLE%', 'B1 on sold L4: LISTING_NOT_AVAILABLE');
SELECT tests.expect_error('SELECT public.start_listing_conversation(''' || tests.id('L3') || ''')', 'LISTING_NOT_AVAILABLE%', 'B1 on unverified L3: LISTING_NOT_AVAILABLE');
SELECT tests.expect_error('SELECT public.start_listing_conversation(''' || tests.id('L6') || ''')', 'LISTING_NOT_AVAILABLE%', 'B1 on L6 (ended event): LISTING_NOT_AVAILABLE');
SELECT tests.ok(
  (SELECT public.start_listing_conversation(tests.id('L2'))) = tests.id('C1'),
  'B1 on L2: returns the existing conversation C1');
CREATE TEMP TABLE conv_ids ON COMMIT DROP AS
  SELECT public.start_listing_conversation(tests.id('L1')) AS a, public.start_listing_conversation(tests.id('L1')) AS b;
SELECT tests.ok((SELECT a = b AND a IS NOT NULL FROM conv_ids), 'B1 on L1 twice: same new conversation id');
SELECT tests.ok(
  (SELECT seller_id = tests.id('S') AND buyer_id = tests.id('B1') FROM public.conversations WHERE id = (SELECT a FROM conv_ids)),
  'new conversation: seller taken from the listing, buyer = caller');
SELECT tests.ok(
  (SELECT public.start_listing_conversation(tests.id('L8'))) IS NOT NULL,
  'B1 on reserved L8: allowed (reserved listings can still be discussed)');
-- Direct insert with a seller that is not the listing's: rejected by the RLS
-- WITH CHECK (reported as 42501, row layer, not a missing grant).
SELECT tests.expect_denied(
  'INSERT INTO public.conversations (ticket_id, buyer_id, seller_id) VALUES (''' || tests.id('L7') || ''', ''' || tests.id('B1') || ''', ''' || tests.id('B2') || ''')',
  'B1: direct conversations insert with a fake seller_id rejected (42501, RLS WITH CHECK)');
SELECT tests.expect_denied(
  'INSERT INTO public.conversations (ticket_id, buyer_id, seller_id) VALUES (''' || tests.id('L7') || ''', ''' || tests.id('B2') || ''', ''' || tests.id('S') || ''')',
  'B1: direct conversations insert as another buyer rejected (42501, RLS WITH CHECK)');
SELECT tests.ok(
  tests.affected('INSERT INTO public.conversations (ticket_id, buyer_id, seller_id) VALUES (''' || tests.id('L7') || ''', ''' || tests.id('B1') || ''', ''' || tests.id('S') || ''')') = 1,
  'B1: direct conversations insert with the listing''s real seller still works (no policy recursion)');
RESET ROLE;
SET ROLE anon;
SELECT tests.as_user(NULL);
SELECT tests.expect_denied(
  'INSERT INTO public.conversations (ticket_id, buyer_id, seller_id) VALUES (''' || tests.id('L6') || ''', ''' || tests.id('B1') || ''', ''' || tests.id('S') || ''')',
  'anon: conversations insert refused (42501)');
RESET ROLE;

ROLLBACK;
