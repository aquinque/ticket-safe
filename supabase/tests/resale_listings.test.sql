-- resale_listings(), resale_event_is_open(), seller_public_stats_for_listing,
-- start_listing_conversation visibility, and the B backfill.
-- Runs on the baseline seed after migrations A, B, C. Rolled back.
BEGIN;

-- Studio listings that must never show: LS on a scanned ticket, LT on a
-- transferred one, LX on a valid ticket of an external tier. Added before
-- every list assertion below, so "the list is exactly L2, L1, L8" also proves
-- they are hidden.
INSERT INTO tests.ids (name, id) VALUES
  ('TXT', 'dddddddd-0000-0000-0000-0000000000e1'),
  ('ETX', 'ffffffff-0000-0000-0000-0000000000e1'),
  ('LS',  'aaaaaaaa-0000-0000-0000-0000000000e2'),
  ('LT',  'aaaaaaaa-0000-0000-0000-0000000000e3'),
  ('LX',  'aaaaaaaa-0000-0000-0000-0000000000e4');
INSERT INTO public.event_tiers (id, event_id, name, price_cents, currency, total_qty, sold_qty, source)
VALUES (tests.id('TXT'), tests.id('E1'), 'Partner ticket', 2000, 'EUR', 10, 1, 'external');
INSERT INTO public.event_tickets (id, order_id, event_id, tier_id, buyer_id, qr_token, source)
VALUES (tests.id('ETX'), tests.id('O1'), tests.id('E1'), tests.id('TXT'), tests.id('S'), 'qr-etx', 'external');
INSERT INTO public.tickets (id, event_id, seller_id, status, verification_status, selling_price, quantity, qr_hash, studio_ticket_id, qr_verified) VALUES
  (tests.id('LS'), tests.id('E1'), tests.id('S'), 'available', 'verified', 5.00, 1, 'studio:' || tests.id('ET2'), tests.id('ET2'), true),
  (tests.id('LT'), tests.id('E1'), tests.id('S'), 'available', 'verified', 6.00, 1, 'studio:' || tests.id('ET3'), tests.id('ET3'), true),
  (tests.id('LX'), tests.id('E1'), tests.id('S'), 'available', 'verified', 7.00, 1, 'studio:' || tests.id('ETX'), tests.id('ETX'), true);
UPDATE public.event_tickets SET status = 'scanned', scanned_at = now() WHERE id = tests.id('ET2');
UPDATE public.event_tickets SET status = 'transferred' WHERE id = tests.id('ET3');

-- ── Backfill (B) ────────────────────────────────────────────────────────────
SELECT tests.ok(
  (SELECT reserved_transaction_id = tests.id('TX8')
          AND reserved_until = (SELECT created_at + interval '35 minutes' FROM public.transactions WHERE id = tests.id('TX8'))
   FROM public.tickets WHERE id = tests.id('L8')),
  'backfill: reserved L8 owned by its latest pending tx, hold = tx.created_at + 35 min');
SELECT tests.ok(
  (SELECT status = 'available' AND reserved_transaction_id IS NULL FROM public.tickets WHERE id = tests.id('L10')),
  'backfill: reserved L10 without a pending tx goes back to available');
SELECT tests.ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.tickets'::regclass AND tgname = 'tickets_set_updated_at'),
  'tickets_set_updated_at trigger exists');
UPDATE public.tickets SET updated_at = now() - interval '1 day' WHERE id = tests.id('L5');
SELECT tests.ok(
  (SELECT updated_at > now() - interval '1 minute' FROM public.tickets WHERE id = tests.id('L5')),
  'tickets updated_at is bumped on every UPDATE');

-- ── resale_event_is_open ────────────────────────────────────────────────────
SELECT tests.ok(public.resale_event_is_open('published', true, now() + interval '1 day', NULL, NULL), 'event open: published, active, future');
SELECT tests.ok(NOT public.resale_event_is_open('draft', true, now() + interval '1 day', NULL, NULL), 'event closed: draft');
SELECT tests.ok(NOT public.resale_event_is_open('published', false, now() + interval '1 day', NULL, NULL), 'event closed: inactive');
SELECT tests.ok(NOT public.resale_event_is_open('published', true, now() + interval '1 day', NULL, now()), 'event closed: cancelled_at set');
SELECT tests.ok(NOT public.resale_event_is_open('published', true, now() - interval '9 hours', NULL, NULL), 'event closed: started 9 h ago, no ends_at (date + 8 h passed)');
SELECT tests.ok(public.resale_event_is_open('published', true, now() - interval '2 hours', NULL, NULL), 'event open: started 2 h ago, no ends_at (still within date + 8 h)');
SELECT tests.ok(NOT public.resale_event_is_open('published', true, now() - interval '2 hours', now() - interval '1 minute', NULL), 'event closed: ends_at passed');
SELECT tests.ok(NOT public.resale_event_is_open(NULL, NULL, NULL, NULL, NULL), 'event closed: all NULL -> false, not NULL');

-- ── Contract: signature and columns ─────────────────────────────────────────
SELECT tests.ok(
  pg_get_function_result('public.resale_listings(uuid, uuid)'::regprocedure) =
  'TABLE(listing_id uuid, event_id uuid, tier_name text, price_cents integer, quantity integer, listed_at timestamp with time zone, is_boosted boolean, photo_url text, video_url text, is_own boolean, is_reserved boolean, event_title text, event_slug text, event_date timestamp with time zone, event_ends_at timestamp with time zone, event_location text, event_category text, event_university text, event_campus text, event_banner_url text, event_video_url text, event_base_price numeric)',
  'resale_listings returns exactly the contract columns, in order');
SELECT tests.ok(
  pg_get_function_result('public.resale_listings(uuid, uuid)'::regprocedure) !~ '(seller_id|qr_hash|file_url|buyer_id|verification_errors|studio_ticket_id|notes|seller_name|email|phone)',
  'resale_listings returns no seller identity, qr_hash, file_url, buyer_id, verification_errors, studio_ticket_id or notes');
SELECT tests.ok(
  pg_get_function_identity_arguments('public.resale_listings(uuid, uuid)'::regprocedure) = 'p_event_id uuid, p_listing_id uuid',
  'resale_listings(p_event_id uuid, p_listing_id uuid)');

-- ── As anon ─────────────────────────────────────────────────────────────────
SET ROLE anon;
SELECT tests.as_user(NULL);

SELECT tests.ok(
  (SELECT array_agg(r.listing_id ORDER BY r.ordinality) FROM public.resale_listings() WITH ORDINALITY r)
  = ARRAY[tests.id('L2'), tests.id('L1'), tests.id('L8')],
  'anon: resale_listings() = L2, L1, L8 (expired hold), cheapest first; no pending/sold/cancelled/ended/draft, no scanned/transferred/external-tier Studio listing');
SELECT tests.ok(
  (SELECT array_agg(r.price_cents ORDER BY r.ordinality) FROM public.resale_listings() WITH ORDINALITY r) = ARRAY[1200, 2500, 3000],
  'anon: price_cents = round(selling_price * 100) per ticket');
SELECT tests.ok(
  (SELECT bool_and(NOT is_reserved) FROM public.resale_listings()),
  'anon: is_reserved is false in the list (expired hold counts as available)');
SELECT tests.ok(
  (SELECT bool_and(NOT is_own) FROM public.resale_listings()),
  'anon: is_own is false');
SELECT tests.ok(
  (SELECT array_agg(listing_id) FROM public.resale_listings(p_event_id => tests.id('E1'))) = ARRAY[tests.id('L1')],
  'anon: resale_listings(p_event_id => E1) = L1 only');
SELECT tests.ok(
  (SELECT count(*) FROM public.resale_listings(p_event_id => tests.id('E2'))) = 0,
  'anon: ended event E2 lists nothing');
SELECT tests.ok(
  (SELECT count(*) FROM public.resale_listings(p_event_id => tests.id('E3'))) = 0,
  'anon: draft event E3 lists nothing');
SELECT tests.ok(
  (SELECT tier_name = 'Early Bird' FROM public.resale_listings() WHERE listing_id = tests.id('L1')),
  'anon: tier_name set for the Studio listing');
SELECT tests.ok(
  (SELECT tier_name IS NULL FROM public.resale_listings() WHERE listing_id = tests.id('L2')),
  'anon: tier_name NULL outside Studio');
SELECT tests.ok(
  (SELECT is_boosted AND quantity = 2 AND event_title = 'Outside Gig' AND event_slug = 'outside-gig'
          AND event_university = 'EDHEC' AND event_video_url = 'https://example.invalid/v4.mp4' AND event_base_price = 25
   FROM public.resale_listings() WHERE listing_id = tests.id('L2')),
  'anon: L2 is_boosted, quantity and event fields');
SELECT tests.ok(
  (SELECT photo_url = 'https://example.invalid/p1.jpg' AND event_banner_url = 'https://example.invalid/b1.jpg'
   FROM public.resale_listings() WHERE listing_id = tests.id('L1')),
  'anon: photo_url and event_banner_url passed through');
SELECT tests.ok(
  (SELECT count(*) FROM public.resale_listings(p_listing_id => tests.id('L4'))) = 0,
  'anon: p_listing_id on sold L4 -> 0 rows');
SELECT tests.ok(
  (SELECT count(*) FROM public.resale_listings(p_listing_id => tests.id('L5'))) = 0,
  'anon: p_listing_id on cancelled L5 -> 0 rows');
SELECT tests.ok(
  (SELECT count(*) FROM public.resale_listings(p_listing_id => tests.id('L3'))) = 0,
  'anon: p_listing_id on unverified L3 -> 0 rows');
SELECT tests.ok(
  (SELECT count(*) FROM public.resale_listings(p_listing_id => tests.id('L6'))) = 0,
  'anon: p_listing_id on L6 (ended event) -> 0 rows');
SELECT tests.ok(
  (SELECT NOT is_reserved FROM public.resale_listings(p_listing_id => tests.id('L8'))),
  'anon: p_listing_id on expired hold L8 -> is_reserved false');
SELECT tests.ok(
  NOT EXISTS (SELECT 1 FROM public.resale_listings(p_event_id => tests.id('E1')) WHERE listing_id IN (tests.id('LS'), tests.id('LT'), tests.id('LX'))),
  'anon: resale_listings(p_event_id => E1) hides LS (scanned), LT (transferred), LX (external tier)');
SELECT tests.ok((SELECT count(*) FROM public.resale_listings(p_listing_id => tests.id('LS'))) = 0, 'anon: p_listing_id on LS (Studio ticket scanned) -> 0 rows');
SELECT tests.ok((SELECT count(*) FROM public.resale_listings(p_listing_id => tests.id('LT'))) = 0, 'anon: p_listing_id on LT (Studio ticket transferred) -> 0 rows');
SELECT tests.ok((SELECT count(*) FROM public.resale_listings(p_listing_id => tests.id('LX'))) = 0, 'anon: p_listing_id on LX (external tier) -> 0 rows');
SELECT tests.ok(
  (SELECT count(*) FROM public.available_tickets_public WHERE id IN (tests.id('LS'), tests.id('LT'), tests.id('LX'))) = 3,
  'note: available_tickets_public (legacy view, no Studio join) still has them; the site reads resale_listings');
RESET ROLE;

-- A live reservation on L2 (via the service-role function).
SET ROLE service_role;
SELECT tests.ok(
  (SELECT outcome = 'reserved' FROM public.reserve_resale_listing(tests.id('L2'), tests.id('B1'), 12.00, 2, 2520, 120, 120)),
  'setup: B1 reserves L2');
RESET ROLE;

SET ROLE anon;
SELECT tests.as_user(NULL);
SELECT tests.ok(
  (SELECT is_reserved FROM public.resale_listings(p_listing_id => tests.id('L2'))),
  'anon: p_listing_id on a live reservation -> row with is_reserved true');
SELECT tests.ok(
  NOT EXISTS (SELECT 1 FROM public.resale_listings() WHERE listing_id = tests.id('L2')),
  'anon: live reservation is left out of the list');
RESET ROLE;

-- ── As the seller and as a buyer ────────────────────────────────────────────
SET ROLE authenticated;
SELECT tests.as_user(tests.id('S'));
SELECT tests.ok(
  (SELECT bool_and(is_own) AND count(*) = 2 FROM public.resale_listings()),
  'seller S: is_own true on their listings');
SELECT tests.as_user(tests.id('B1'));
SELECT tests.ok(
  (SELECT bool_and(NOT is_own) AND count(*) = 2 FROM public.resale_listings()),
  'buyer B1: is_own false');
RESET ROLE;

-- ── Seller stats by listing ─────────────────────────────────────────────────
SET ROLE anon;
SELECT tests.as_user(NULL);
SELECT tests.ok(
  (SELECT first_name = 'Sam' AND university = 'ESCP' AND campus = 'Paris' AND completed_sales = 1 AND member_since IS NOT NULL
   FROM public.seller_public_stats_for_listing(tests.id('L1'))),
  'anon: seller_public_stats_for_listing(L1) = first name only (Sam, not "Sam Seller") + public stats');
SELECT tests.ok(
  pg_get_function_result('public.seller_public_stats_for_listing(uuid)'::regprocedure) !~ 'full_name',
  'seller_public_stats_for_listing has no full_name column');
SELECT tests.ok(
  (SELECT first_name = 'Sam' FROM public.seller_public_stats_for_listing(tests.id('L2'))),
  'anon: seller stats for L2 while it is reserved (live hold) -> still returned');
SELECT tests.ok((SELECT count(*) FROM public.seller_public_stats_for_listing(tests.id('L3'))) = 0, 'anon: seller stats on unverified L3 -> 0 rows');
SELECT tests.ok((SELECT count(*) FROM public.seller_public_stats_for_listing(tests.id('L4'))) = 0, 'anon: seller stats on sold L4 -> 0 rows');
SELECT tests.ok((SELECT count(*) FROM public.seller_public_stats_for_listing(tests.id('L5'))) = 0, 'anon: seller stats on cancelled L5 -> 0 rows');
SELECT tests.ok((SELECT count(*) FROM public.seller_public_stats_for_listing(tests.id('L6'))) = 0, 'anon: seller stats on L6 (ended event) -> 0 rows');
SELECT tests.ok((SELECT count(*) FROM public.seller_public_stats_for_listing(tests.id('L7'))) = 0, 'anon: seller stats on L7 (draft event) -> 0 rows');
SELECT tests.ok((SELECT count(*) FROM public.seller_public_stats_for_listing(tests.id('LS'))) = 0, 'anon: seller stats on LS (scanned Studio ticket) -> 0 rows');
SELECT tests.ok((SELECT count(*) FROM public.seller_public_stats_for_listing(tests.id('LX'))) = 0, 'anon: seller stats on LX (external tier) -> 0 rows');
RESET ROLE;
UPDATE public.profiles SET full_name = '   ' WHERE id = tests.id('S');
SET ROLE anon;
SELECT tests.ok(
  (SELECT first_name IS NULL AND completed_sales = 1 FROM public.seller_public_stats_for_listing(tests.id('L1'))),
  'anon: blank full name -> first_name NULL');
RESET ROLE;
UPDATE public.profiles SET full_name = 'Sam Seller' WHERE id = tests.id('S');

-- ── start_listing_conversation on hidden Studio listings ───────────────────
SET ROLE authenticated;
SELECT tests.as_user(tests.id('B1'));
SELECT tests.expect_error('SELECT public.start_listing_conversation(''' || tests.id('LS') || ''')', 'LISTING_NOT_AVAILABLE%', 'B1 on LS (scanned Studio ticket): LISTING_NOT_AVAILABLE');
SELECT tests.expect_error('SELECT public.start_listing_conversation(''' || tests.id('LT') || ''')', 'LISTING_NOT_AVAILABLE%', 'B1 on LT (transferred Studio ticket): LISTING_NOT_AVAILABLE');
SELECT tests.expect_error('SELECT public.start_listing_conversation(''' || tests.id('LX') || ''')', 'LISTING_NOT_AVAILABLE%', 'B1 on LX (external tier): LISTING_NOT_AVAILABLE');
RESET ROLE;

-- ── my_purchased_listings / my_listed_studio_tickets ───────────────────────
SET ROLE authenticated;
SELECT tests.as_user(tests.id('B2'));
SELECT tests.ok(
  (SELECT array_agg(listing_id) FROM public.my_purchased_listings()) = ARRAY[tests.id('L4')],
  'B2: my_purchased_listings() = L4 (sold to B2)');
SELECT tests.ok(
  (SELECT price_cents = 1500 AND NOT is_studio AND event_title = 'Outside Gig' AND event_slug = 'outside-gig'
   FROM public.my_purchased_listings()),
  'B2: my_purchased_listings row fields');
SELECT tests.as_user(tests.id('B1'));
SELECT tests.ok((SELECT count(*) FROM public.my_purchased_listings()) = 0, 'B1: my_purchased_listings() empty');
SELECT tests.as_user(tests.id('S'));
SELECT tests.ok(
  (SELECT array_agg(studio_ticket_id || ':' || status ORDER BY studio_ticket_id) FROM public.my_listed_studio_tickets())
  = ARRAY[tests.id('ET1') || ':available', tests.id('ET2') || ':available', tests.id('ET3') || ':available', tests.id('ETX') || ':available'],
  'S: my_listed_studio_tickets() = ET1, ET2, ET3, ETX (all listed, available)');
SELECT tests.as_user(tests.id('B1'));
SELECT tests.ok((SELECT count(*) FROM public.my_listed_studio_tickets()) = 0, 'B1: my_listed_studio_tickets() empty');
RESET ROLE;

ROLLBACK;
