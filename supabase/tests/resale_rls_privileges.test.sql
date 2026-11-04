-- Privileges and RLS after migrations A, B, C, exercised with real statements
-- under SET ROLE (anon / authenticated), plus catalog checks. Rolled back.
--
-- How each refusal is asserted:
--   * tests.expect_denied: the statement must fail with SQLSTATE 42501.
--     On tickets and on views this is a missing GRANT (privilege layer);
--     for a conversations INSERT it is the RLS WITH CHECK rejection, which
--     PostgreSQL also reports as 42501 (noted on that test).
--   * tests.affected(...) = 0: the statement is allowed by the grants but
--     RLS filters every row (row layer). Used only where a privilege exists.
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
-- authenticated buyer B1
-- ════════════════════════════════════════════════════════════════════════════
SET ROLE authenticated;
SELECT tests.as_user(tests.id('B1'));

SELECT tests.expect_denied('SELECT qr_hash FROM public.tickets',          'B1: SELECT qr_hash FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT buyer_id FROM public.tickets',         'B1: SELECT buyer_id FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT studio_ticket_id FROM public.tickets', 'B1: SELECT studio_ticket_id FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT file_url FROM public.tickets',         'B1: SELECT file_url FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT verification_errors FROM public.tickets', 'B1: SELECT verification_errors FROM tickets refused (42501, privilege)');
SELECT tests.expect_denied('SELECT reserved_until FROM public.tickets',   'B1: SELECT reserved_until FROM tickets refused (42501, privilege)');
SELECT tests.ok(
  (SELECT count(*) FROM (SELECT id, seller_id, notes, needs_review, expires_at FROM public.tickets) x) >= 4,
  'B1: authenticated column set (seller_id, notes, needs_review, expires_at) readable');
SELECT tests.ok(
  tests.affected('UPDATE public.tickets SET selling_price = 1 WHERE id = ''' || tests.id('L1') || '''') = 0,
  'B1: UPDATE selling_price on S''s listing affects 0 rows (RLS, privilege exists)');
SELECT tests.ok(
  tests.affected('DELETE FROM public.tickets WHERE id = ''' || tests.id('L1') || '''') = 0,
  'B1: DELETE of S''s listing affects 0 rows (RLS)');
SELECT tests.expect_denied('UPDATE public.tickets SET status = ''cancelled'' WHERE id = ''' || tests.id('L1') || '''', 'B1: UPDATE status refused (42501, privilege)');
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
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- seller S
-- ════════════════════════════════════════════════════════════════════════════
SET ROLE authenticated;
SELECT tests.as_user(tests.id('S'));
SELECT tests.ok(
  tests.affected('UPDATE public.tickets SET selling_price = 26 WHERE id = ''' || tests.id('L1') || '''') = 1,
  'S: UPDATE selling_price on own available L1 -> 1 row');
SELECT tests.ok(
  tests.affected('UPDATE public.tickets SET notes = ''n'', photo_url = NULL, video_url = NULL WHERE id = ''' || tests.id('L1') || '''') = 1,
  'S: UPDATE notes/photo_url/video_url on own available L1 -> 1 row');
SELECT tests.expect_denied('UPDATE public.tickets SET status = ''sold'' WHERE id = ''' || tests.id('L1') || '''',               'S: UPDATE status refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET verification_status = ''verified'' WHERE id = ''' || tests.id('L3') || '''', 'S: UPDATE verification_status refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET reserved_until = NULL WHERE id = ''' || tests.id('L8') || '''',          'S: UPDATE reserved_until refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET reserved_transaction_id = NULL WHERE id = ''' || tests.id('L8') || '''', 'S: UPDATE reserved_transaction_id refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET buyer_id = NULL WHERE id = ''' || tests.id('L4') || '''',                'S: UPDATE buyer_id refused (42501, privilege)');
SELECT tests.expect_denied('UPDATE public.tickets SET qr_hash = ''x'' WHERE id = ''' || tests.id('L1') || '''',                'S: UPDATE qr_hash refused (42501, privilege)');
SELECT tests.ok(
  tests.affected('UPDATE public.tickets SET selling_price = 1 WHERE id = ''' || tests.id('L8') || '''') = 0,
  'S: UPDATE price of own reserved L8 -> 0 rows (RLS: only available listings)');
SELECT tests.ok(
  tests.affected('UPDATE public.tickets SET selling_price = 1 WHERE id = ''' || tests.id('L4') || '''') = 0,
  'S: UPDATE price of own sold L4 -> 0 rows (RLS)');
SELECT tests.ok(
  (SELECT price_cents = 3000 FROM public.resale_listings(p_listing_id => tests.id('L8'))),
  'S: reserved L8 price unchanged');
RESET ROLE;

-- Admin keeps admins_update_tickets for the granted columns.
SET ROLE authenticated;
SELECT tests.as_user(tests.id('A'));
SELECT tests.ok(
  tests.affected('UPDATE public.tickets SET notes = ''admin'' WHERE id = ''' || tests.id('L8') || '''') = 1,
  'admin: UPDATE notes on a reserved listing -> 1 row (admins_update_tickets kept)');
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
  NOT has_table_privilege('anon', 'public.tickets', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.tickets', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.tickets', 'INSERT') AND NOT has_table_privilege('anon', 'public.tickets', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.tickets', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.tickets', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.tickets', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.tickets', 'TRIGGER')
  AND NOT has_table_privilege('authenticated', 'public.tickets', 'REFERENCES')
  AND has_table_privilege('authenticated', 'public.tickets', 'INSERT')
  AND has_table_privilege('authenticated', 'public.tickets', 'DELETE'),
  'tickets table-level privileges: anon none; authenticated INSERT + DELETE only');
SELECT tests.ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon', 'authenticated']) r,
                  unnest(ARRAY['qr_hash', 'file_url', 'buyer_id', 'verification_errors', 'studio_ticket_id', 'reserved_transaction_id', 'reserved_until']) c
    WHERE has_column_privilege(r, 'public.tickets', c, 'SELECT') OR has_column_privilege(r, 'public.tickets', c, 'UPDATE')
  ),
  'qr_hash, file_url, buyer_id, verification_errors, studio_ticket_id, reserved_* never readable/updatable by anon or authenticated');
SELECT tests.ok(
  (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute
   WHERE attrelid = 'public.tickets'::regclass AND attnum > 0 AND NOT attisdropped
     AND has_column_privilege('anon', 'public.tickets', attname, 'SELECT'))
  = ARRAY['boosted_until','created_at','event_id','id','photo_url','qr_verified','quantity','selling_price','status','updated_at','verification_status','video_url'],
  'anon SELECT columns on tickets are exactly the contract list (no notes)');
SELECT tests.ok(
  (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute
   WHERE attrelid = 'public.tickets'::regclass AND attnum > 0 AND NOT attisdropped
     AND has_column_privilege('authenticated', 'public.tickets', attname, 'UPDATE'))
  = ARRAY['notes','photo_url','selling_price','video_url'],
  'authenticated UPDATE columns on tickets are exactly selling_price, notes, photo_url, video_url');
SELECT tests.ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tickets' AND policyname = 'Sellers and admins can update tickets')
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tickets' AND policyname = 'Sellers update own available listings' AND cmd = 'UPDATE')
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tickets' AND policyname = 'admins_update_tickets'),
  'tickets UPDATE policies: seller (own available) + admin; the old unrestricted one is gone');

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
                        'complete_resale_purchase', 'record_resale_refund', 'listing_has_seller')
      AND NOT coalesce(p.proconfig @> ARRAY['search_path=public'], false)
  ),
  'every new function pins search_path = public');
SELECT tests.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND obj_description(p.oid, 'pg_proc') IS NOT NULL
     AND p.proname IN ('resale_event_is_open', 'resale_listings', 'start_listing_conversation', 'seller_public_stats_for_listing',
                       'my_purchased_listings', 'my_listed_studio_tickets', 'reserve_resale_listing', 'release_resale_reservation',
                       'release_expired_resale_reservations', 'complete_resale_purchase', 'record_resale_refund')) = 11,
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
      = 'TABLE(full_name text, university text, campus text, member_since timestamp with time zone, completed_sales integer)'
  AND pg_get_function_result('public.my_purchased_listings()'::regprocedure)
      = 'TABLE(listing_id uuid, quantity integer, price_cents integer, purchased_at timestamp with time zone, event_id uuid, is_studio boolean, event_title text, event_date timestamp with time zone, event_location text, event_slug text, event_banner_url text, event_primary_color text)',
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
