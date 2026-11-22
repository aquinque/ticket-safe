-- Ticket drops (20261122120000_ticket_drops.sql): a tier that opens when another sells out, at a date, or by
-- hand, enforced by reserve_tier() (the call every Studio checkout makes before taking money).
-- Runs on the baseline seed after the migrations. Rolled back.
BEGIN;

INSERT INTO tests.ids (name, id) VALUES
  ('D1', 'dddddddd-0000-0000-0000-0000000000d1'),  -- Drop 1, 2 tickets
  ('D2', 'dddddddd-0000-0000-0000-0000000000d2'),  -- Drop 2, opens when D1 sells out
  ('D3', 'dddddddd-0000-0000-0000-0000000000d3'),  -- Drop 3, opens when D2 sells out
  ('DS', 'dddddddd-0000-0000-0000-0000000000d4'),  -- opens at a date
  ('DM', 'dddddddd-0000-0000-0000-0000000000d5'),  -- opened by hand
  ('DP', 'dddddddd-0000-0000-0000-0000000000d6'),  -- plenty of stock, DM waits for it
  ('DX', 'dddddddd-0000-0000-0000-0000000000d7');  -- a tier of another event

INSERT INTO public.event_tiers (id, event_id, name, price_cents, currency, total_qty, sort_order) VALUES
  (tests.id('D1'), tests.id('E1'), 'Drop 1', 1500, 'EUR', 2, 10),
  (tests.id('D2'), tests.id('E1'), 'Drop 2', 2000, 'EUR', 3, 11),
  (tests.id('D3'), tests.id('E1'), 'Drop 3', 2500, 'EUR', 5, 12),
  (tests.id('DP'), tests.id('E1'), 'Plenty', 1000, 'EUR', 100, 13),
  (tests.id('DX'), tests.id('E4'), 'Other event', 1000, 'EUR', 10, 0);
UPDATE public.event_tiers SET opens_after_tier_id = tests.id('D1') WHERE id = tests.id('D2');
UPDATE public.event_tiers SET opens_after_tier_id = tests.id('D2') WHERE id = tests.id('D3');

-- ── Existing tiers are not affected ─────────────────────────────────────────
SELECT tests.ok(
  (SELECT bool_and(public.tier_is_open(t)) FROM public.event_tiers t
    WHERE t.opens_after_tier_id IS NULL AND t.sales_start_at IS NULL AND t.sales_end_at IS NULL AND t.is_active),
  'a tier with no drop settings is open, as before');
SELECT tests.ok(public.reserve_tier(tests.id('DP'), 1), 'reserve_tier still works on an ordinary tier');

-- ── Drop 2 waits for Drop 1 ─────────────────────────────────────────────────
SELECT tests.ok((SELECT released_at IS NULL FROM public.event_tiers WHERE id = tests.id('D2')),
  'Drop 2 starts closed while Drop 1 has stock');
SELECT tests.ok(NOT public.reserve_tier(tests.id('D2'), 1), 'Drop 2 cannot be reserved before Drop 1 sells out');
SELECT tests.ok((SELECT NOT is_open FROM public.tier_inventory WHERE tier_id = tests.id('D2')),
  'tier_inventory shows Drop 2 as not open');

SELECT tests.ok(public.reserve_tier(tests.id('D1'), 2), 'the last 2 Drop 1 tickets are reserved');
SELECT tests.ok((SELECT released_at IS NOT NULL FROM public.event_tiers WHERE id = tests.id('D2')),
  'Drop 1 sold out (held tickets count) -> Drop 2 released');
SELECT tests.ok((SELECT is_open FROM public.tier_inventory WHERE tier_id = tests.id('D2')),
  'tier_inventory shows Drop 2 as open');
SELECT tests.ok(public.reserve_tier(tests.id('D2'), 1), 'Drop 2 can now be reserved');

SELECT public.release_tier_reservation(tests.id('D1'), 2);
SELECT tests.ok((SELECT released_at IS NOT NULL FROM public.event_tiers WHERE id = tests.id('D2')),
  'an expired Drop 1 reservation does not close Drop 2 again');
SELECT tests.ok(public.reserve_tier(tests.id('D1'), 1), 'Drop 1 tickets put back are on sale again');

-- ── Chains ──────────────────────────────────────────────────────────────────
SELECT tests.ok(NOT public.reserve_tier(tests.id('D3'), 1), 'Drop 3 waits for Drop 2');
SELECT public.finalize_tier_sale(tests.id('D2'), 1);
SELECT tests.ok(public.reserve_tier(tests.id('D2'), 2), 'the rest of Drop 2 is reserved');
SELECT tests.ok((SELECT released_at IS NOT NULL FROM public.event_tiers WHERE id = tests.id('D3')),
  'Drop 2 sold out -> Drop 3 released (chain)');
SELECT tests.ok(public.reserve_tier(tests.id('D3'), 1), 'Drop 3 can be reserved');

-- ── Pointing at a tier that is already sold out opens straight away ─────────
UPDATE public.event_tiers SET opens_after_tier_id = tests.id('D2') WHERE id = tests.id('DP');
SELECT tests.ok((SELECT released_at IS NOT NULL FROM public.event_tiers WHERE id = tests.id('DP')),
  'following an already sold-out tier releases at once');
UPDATE public.event_tiers SET opens_after_tier_id = NULL, released_at = NULL WHERE id = tests.id('DP');

-- ── Guards ──────────────────────────────────────────────────────────────────
SELECT tests.expect_error(
  format('UPDATE public.event_tiers SET opens_after_tier_id = %L WHERE id = %L', tests.id('D1'), tests.id('DX')),
  'A drop can only follow a ticket tier of the same event.%', 'a drop cannot follow a tier of another event');
SELECT tests.expect_error(
  format('UPDATE public.event_tiers SET opens_after_tier_id = %L WHERE id = %L', tests.id('D3'), tests.id('D1')),
  'These ticket tiers would wait for each other forever.%', 'a loop of drops is refused');
SELECT tests.expect_error(
  format('UPDATE public.event_tiers SET opens_after_tier_id = id WHERE id = %L', tests.id('D1')),
  '%wait for each other forever%', 'a tier cannot wait for itself');

-- ── Opened by hand ──────────────────────────────────────────────────────────
INSERT INTO public.event_tiers (id, event_id, name, price_cents, currency, total_qty, sort_order, opens_after_tier_id)
VALUES (tests.id('DM'), tests.id('E1'), 'Manual drop', 1800, 'EUR', 10, 14, tests.id('DP'));
SELECT tests.ok(NOT public.reserve_tier(tests.id('DM'), 1), 'a drop inserted with a dependency starts closed');
UPDATE public.event_tiers SET released_at = now() WHERE id = tests.id('DM');
SELECT tests.ok((SELECT released_at IS NOT NULL FROM public.event_tiers WHERE id = tests.id('DM')),
  '"Open now" (released_at = now()) is kept');
SELECT tests.ok(public.reserve_tier(tests.id('DM'), 1), 'a drop opened by hand can be reserved');

-- ── Opens at a date ─────────────────────────────────────────────────────────
INSERT INTO public.event_tiers (id, event_id, name, price_cents, currency, total_qty, sort_order, sales_start_at)
VALUES (tests.id('DS'), tests.id('E1'), 'Scheduled drop', 1800, 'EUR', 10, 15, now() + interval '1 hour');
SELECT tests.ok(NOT public.reserve_tier(tests.id('DS'), 1), 'a drop with a future start date cannot be reserved');
UPDATE public.event_tiers SET sales_start_at = now() - interval '1 minute' WHERE id = tests.id('DS');
SELECT tests.ok(public.reserve_tier(tests.id('DS'), 1), 'once the start date has passed it can be reserved');
UPDATE public.event_tiers SET sales_start_at = NULL, sales_end_at = now() - interval '1 minute' WHERE id = tests.id('DS');
SELECT tests.ok(NOT public.reserve_tier(tests.id('DS'), 1), 'after the sales end date it cannot be reserved');

-- ── Switched off ────────────────────────────────────────────────────────────
UPDATE public.event_tiers SET is_active = false WHERE id = tests.id('DM');
SELECT tests.ok(NOT public.reserve_tier(tests.id('DM'), 1), 'an inactive tier still cannot be reserved');

-- ── The event page can read the drop state ──────────────────────────────────
SET LOCAL ROLE anon;
SELECT tests.as_user(NULL);
SELECT tests.ok(
  (SELECT count(*) = 1 FROM public.tier_inventory WHERE tier_id = tests.id('D2') AND opens_after_tier_id = tests.id('D1')),
  'anon reads opens_after_tier_id and is_open from tier_inventory');
RESET ROLE;

ROLLBACK;
