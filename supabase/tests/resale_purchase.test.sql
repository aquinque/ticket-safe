-- reserve / release / complete / refund, as service_role (the edge functions'
-- role). Single session; the parallel cases are in scripts/test-db.sh.
-- Rolled back.
BEGIN;
SET ROLE service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- Reserve outcomes
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.ok((SELECT outcome = 'not_available' FROM public.reserve_resale_listing(gen_random_uuid(), tests.id('B1'), 25, 1, 2625, 125, 125)), 'reserve: unknown listing -> not_available');
SELECT tests.ok((SELECT outcome = 'not_available' FROM public.reserve_resale_listing(tests.id('L3'), tests.id('B1'), 10, 1, 1050, 50, 50)), 'reserve: unverified L3 -> not_available');
SELECT tests.ok((SELECT outcome = 'not_available' FROM public.reserve_resale_listing(tests.id('L4'), tests.id('B1'), 15, 1, 1575, 75, 75)), 'reserve: sold L4 -> not_available');
SELECT tests.ok((SELECT outcome = 'not_available' FROM public.reserve_resale_listing(tests.id('L5'), tests.id('B1'), 16, 1, 1680, 80, 80)), 'reserve: cancelled L5 -> not_available');
SELECT tests.ok((SELECT outcome = 'not_available' FROM public.reserve_resale_listing(tests.id('L6'), tests.id('B1'), 11, 1, 1155, 55, 55)), 'reserve: L6 on ended event -> not_available');
SELECT tests.ok((SELECT outcome = 'not_available' FROM public.reserve_resale_listing(tests.id('L7'), tests.id('B1'), 9, 1, 945, 45, 45)), 'reserve: L7 on draft event -> not_available');
SELECT tests.ok((SELECT outcome = 'own_listing' AND seller_id = tests.id('S') FROM public.reserve_resale_listing(tests.id('L1'), tests.id('S'), 25, 1, 2625, 125, 125)), 'reserve: seller on own L1 -> own_listing');
SELECT tests.ok((SELECT outcome = 'price_changed' FROM public.reserve_resale_listing(tests.id('L1'), tests.id('B1'), 24, 1, 2520, 120, 120)), 'reserve: stale expected price -> price_changed');
SELECT tests.ok(
  (SELECT count(*) FROM public.transactions WHERE ticket_id IN (tests.id('L1'), tests.id('L3'))) = 0
  AND (SELECT status = 'available' FROM public.tickets WHERE id = tests.id('L1')),
  'reserve: refused outcomes write nothing');

-- ════════════════════════════════════════════════════════════════════════════
-- Studio purchase: reserve then complete
-- ════════════════════════════════════════════════════════════════════════════
SELECT outcome AS r_outcome, transaction_id AS tx_a, seller_id AS r_seller, coalesce(previous_transaction_id::text, '') AS r_prev,
       (reserved_until BETWEEN now() + interval '34 minutes' AND now() + interval '36 minutes') AS r_hold_ok
FROM public.reserve_resale_listing(tests.id('L1'), tests.id('B1'), 25.00, 1, 2625, 125, 125) \gset
SELECT tests.ok(:'r_outcome' = 'reserved' AND :'r_seller'::uuid = tests.id('S') AND :'r_prev' = '' AND :'r_hold_ok'::boolean,
  'reserve L1 by B1: reserved, seller returned, no previous tx, held 35 min (default 2100 s)');
SELECT tests.ok(
  (SELECT status = 'reserved' AND reserved_transaction_id = :'tx_a'::uuid AND updated_at >= now() - interval '1 second' FROM public.tickets WHERE id = tests.id('L1')),
  'reserve: listing reserved by the new tx, updated_at bumped');
SELECT tests.ok(
  (SELECT status::text = 'pending' AND buyer_id = tests.id('B1') AND seller_id = tests.id('S') AND amount = 26.25 AND fee_amount = 1.25
          AND commission_cents = 125 AND quantity = 1 FROM public.transactions WHERE id = :'tx_a'::uuid),
  'reserve: pending tx with amount = cents/100, fee, commission, quantity');
SELECT tests.ok(
  (SELECT outcome = 'reserved_by_other' AND reserved_until = (SELECT reserved_until FROM public.tickets WHERE id = tests.id('L1'))
   FROM public.reserve_resale_listing(tests.id('L1'), tests.id('B2'), 25.00, 1, 2625, 125, 125)),
  'reserve: B2 while B1 holds L1 -> reserved_by_other with the hold end');

SELECT gen_random_uuid() AS new_et \gset
SELECT tests.expect_error(
  format('SELECT * FROM public.complete_resale_purchase(%L, %L, NULL, NULL)', :'tx_a', 'pi_a'),
  'QR_TOKEN_REQUIRED%', 'complete Studio without token: raises QR_TOKEN_REQUIRED');
SELECT tests.ok(
  (SELECT status::text = 'pending' AND payment_intent_id IS NULL FROM public.transactions WHERE id = :'tx_a'::uuid)
  AND (SELECT status = 'reserved' AND reserved_transaction_id = :'tx_a'::uuid AND buyer_id IS NULL FROM public.tickets WHERE id = tests.id('L1'))
  AND (SELECT status::text = 'valid' FROM public.event_tickets WHERE id = tests.id('ET1'))
  AND (SELECT count(*) FROM public.event_tickets) = 4,
  'QR_TOKEN_REQUIRED: nothing written (tx pending, listing reserved, old ticket valid, no new ticket)');

SELECT tests.ok(
  (SELECT outcome = 'completed' AND listing_id = tests.id('L1') AND buyer_id = tests.id('B1') AND new_event_ticket_id = :'new_et'::uuid
   FROM public.complete_resale_purchase(:'tx_a'::uuid, 'pi_a', :'new_et'::uuid, 'qr-new-a')),
  'complete Studio L1: completed');
SELECT tests.ok(
  (SELECT status = 'sold' AND buyer_id = tests.id('B1') AND reserved_transaction_id IS NULL AND reserved_until IS NULL FROM public.tickets WHERE id = tests.id('L1')),
  'complete: listing sold to B1, reservation cleared');
SELECT tests.ok((SELECT status::text = 'transferred' FROM public.event_tickets WHERE id = tests.id('ET1')), 'complete: old Studio ticket transferred');
SELECT tests.ok(
  (SELECT status::text = 'valid' AND qr_token = 'qr-new-a' AND buyer_id = tests.id('B1') AND order_id = tests.id('O1')
          AND event_id = tests.id('E1') AND tier_id = tests.id('T1') AND source = 'platform'
          AND holder_first_name = 'Alice' AND holder_last_name = 'Marie Buyer' AND holder_email = 'b1@example.invalid'
   FROM public.event_tickets WHERE id = :'new_et'::uuid),
  'complete: new ticket valid, passed id/token, same order/event/tier, names split from "  Alice  Marie Buyer "');
SELECT tests.ok(
  (SELECT status::text = 'completed' AND payment_intent_id = 'pi_a' FROM public.transactions WHERE id = :'tx_a'::uuid),
  'complete: transaction completed with the payment intent');
SELECT tests.ok(
  (SELECT outcome = 'already_completed' FROM public.complete_resale_purchase(:'tx_a'::uuid, 'pi_a', gen_random_uuid(), 'qr-new-a2')),
  'complete again: already_completed');
SELECT tests.ok((SELECT count(*) FROM public.event_tickets) = 5, 'complete again: no second ticket');
UPDATE public.transactions SET status = 'disputed' WHERE id = :'tx_a'::uuid;
SELECT tests.ok((SELECT outcome = 'already_completed' FROM public.complete_resale_purchase(:'tx_a'::uuid, 'pi_a', gen_random_uuid(), 'x')), 'complete on a disputed tx: already_completed');
SELECT tests.ok((SELECT outcome = 'transaction_missing' FROM public.complete_resale_purchase(gen_random_uuid(), 'pi_x', NULL, NULL)), 'complete unknown tx: transaction_missing');

-- Single-word name: last name NULL.
INSERT INTO public.tickets (id, event_id, seller_id, status, verification_status, selling_price, quantity, qr_hash, studio_ticket_id)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000b2', tests.id('E1'), tests.id('S'), 'available', 'verified', 25.00, 1, 'studio:' || tests.id('ET2'), tests.id('ET2'));
SELECT transaction_id AS tx_b2 FROM public.reserve_resale_listing('aaaaaaaa-0000-0000-0000-0000000000b2', tests.id('B2'), 25.00, 1, 2625, 125, 125) \gset
SELECT gen_random_uuid() AS new_et2 \gset
SELECT tests.ok(
  (SELECT outcome = 'completed' FROM public.complete_resale_purchase(:'tx_b2'::uuid, 'pi_b2', :'new_et2'::uuid, 'qr-new-b2')),
  'complete Studio for B2: completed');
SELECT tests.ok(
  (SELECT holder_first_name = 'Bob' AND holder_last_name IS NULL FROM public.event_tickets WHERE id = :'new_et2'::uuid),
  'complete for "Bob": first name Bob, last name NULL');

-- ════════════════════════════════════════════════════════════════════════════
-- Studio ticket already scanned
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.tickets (id, event_id, seller_id, status, verification_status, selling_price, quantity, qr_hash, studio_ticket_id)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000b3', tests.id('E1'), tests.id('S'), 'available', 'verified', 25.00, 1, 'studio:' || tests.id('ET3'), tests.id('ET3'));
SELECT transaction_id AS tx_s FROM public.reserve_resale_listing('aaaaaaaa-0000-0000-0000-0000000000b3', tests.id('B1'), 25.00, 1, 2625, 125, 125) \gset
UPDATE public.event_tickets SET status = 'scanned', scanned_at = now() WHERE id = tests.id('ET3');
SELECT tests.ok(
  (SELECT outcome = 'studio_ticket_unavailable' AND new_event_ticket_id IS NULL
   FROM public.complete_resale_purchase(:'tx_s'::uuid, 'pi_s', gen_random_uuid(), 'qr-new-s')),
  'complete with the Studio ticket already scanned: studio_ticket_unavailable');
SELECT tests.ok(
  (SELECT status = 'cancelled' AND buyer_id IS NULL AND reserved_transaction_id IS NULL FROM public.tickets WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000b3')
  AND (SELECT status::text = 'cancelled' AND payment_intent_id = 'pi_s' FROM public.transactions WHERE id = :'tx_s'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.event_tickets WHERE qr_token = 'qr-new-s'),
  'studio_ticket_unavailable: listing cancelled, tx cancelled with payment intent, no new ticket');

-- ════════════════════════════════════════════════════════════════════════════
-- Expired reservation taken over by another buyer (external L2, qty 2)
-- ════════════════════════════════════════════════════════════════════════════
SELECT transaction_id AS tx1 FROM public.reserve_resale_listing(tests.id('L2'), tests.id('B1'), 12.00, 2, 2520, 120, 120) \gset
UPDATE public.tickets SET reserved_until = now() - interval '1 second' WHERE id = tests.id('L2');
SELECT outcome AS t_outcome, transaction_id AS tx2, previous_transaction_id AS t_prev
FROM public.reserve_resale_listing(tests.id('L2'), tests.id('B2'), 12.00, 2, 2520, 120, 120) \gset
SELECT tests.ok(:'t_outcome' = 'reserved' AND :'t_prev'::uuid = :'tx1'::uuid, 'takeover of an expired hold by B2: reserved, previous_transaction_id = tx1');
SELECT tests.ok((SELECT status::text = 'cancelled' FROM public.transactions WHERE id = :'tx1'::uuid), 'takeover: tx1 cancelled');
SELECT tests.ok(
  (SELECT outcome = 'transaction_not_pending' AND listing_id = tests.id('L2') FROM public.complete_resale_purchase(:'tx1'::uuid, 'pi_tx1', NULL, NULL)),
  'late payment of tx1: transaction_not_pending (refund)');
SELECT tests.ok(
  (SELECT status::text = 'cancelled' AND payment_intent_id = 'pi_tx1' FROM public.transactions WHERE id = :'tx1'::uuid)
  AND (SELECT status = 'reserved' AND reserved_transaction_id = :'tx2'::uuid FROM public.tickets WHERE id = tests.id('L2')),
  'tx1 conflict: tx1 stays cancelled with its payment intent; L2 still held by tx2');
SELECT tests.ok(
  (SELECT outcome = 'completed' AND new_event_ticket_id IS NULL FROM public.complete_resale_purchase(:'tx2'::uuid, 'pi_tx2', NULL, NULL)),
  'tx2 completes (external listing: no event ticket)');
SELECT tests.ok(
  (SELECT status = 'sold' AND buyer_id = tests.id('B2') FROM public.tickets WHERE id = tests.id('L2'))
  AND (SELECT status::text = 'completed' FROM public.transactions WHERE id = :'tx2'::uuid),
  'tx2: L2 sold to B2, tx2 completed');
SELECT tests.ok(
  (SELECT outcome = 'not_available' FROM public.reserve_resale_listing(tests.id('L2'), tests.id('B1'), 12.00, 2, 2520, 120, 120)),
  'reserve a sold listing: not_available');

-- A pending tx whose listing is held by another tx (inconsistent legacy
-- state): reserved_by_other. A pending tx on a sold listing: listing_sold.
INSERT INTO public.transactions (id, ticket_id, buyer_id, seller_id, amount, quantity, status)
VALUES ('abababab-0000-0000-0000-0000000000c1', tests.id('L8'), tests.id('B1'), tests.id('S'), 31.5, 1, 'pending'),
       ('abababab-0000-0000-0000-0000000000c2', tests.id('L2'), tests.id('B1'), tests.id('S'), 25.2, 2, 'pending');
SELECT tests.ok(
  (SELECT outcome = 'reserved_by_other' FROM public.complete_resale_purchase('abababab-0000-0000-0000-0000000000c1', 'pi_c1', NULL, NULL)),
  'complete a pending tx on a listing held by another tx: reserved_by_other');
SELECT tests.ok(
  (SELECT status::text = 'cancelled' AND payment_intent_id = 'pi_c1' FROM public.transactions WHERE id = 'abababab-0000-0000-0000-0000000000c1')
  AND (SELECT status = 'reserved' AND reserved_transaction_id = tests.id('TX8') FROM public.tickets WHERE id = tests.id('L8')),
  'complete a pending tx on a listing held by another tx: reserved_by_other, tx cancelled, listing untouched');
SELECT tests.ok(
  (SELECT outcome = 'listing_sold' FROM public.complete_resale_purchase('abababab-0000-0000-0000-0000000000c2', 'pi_c2', NULL, NULL)),
  'complete a pending tx on a sold listing: listing_sold');
SELECT tests.ok(
  (SELECT status = 'sold' AND buyer_id = tests.id('B2') FROM public.tickets WHERE id = tests.id('L2')),
  'complete a pending tx on a sold listing: listing_sold, sale untouched');

-- ════════════════════════════════════════════════════════════════════════════
-- Same-buyer takeover, release, sweep, listing_unavailable
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.tickets (id, event_id, seller_id, status, verification_status, selling_price, quantity, qr_hash)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000b4', tests.id('E4'), tests.id('S'), 'available', 'verified', 40.00, 1, 'hash-b4');
SELECT transaction_id AS tx_x FROM public.reserve_resale_listing('aaaaaaaa-0000-0000-0000-0000000000b4', tests.id('B1'), 40.00, 1, 4200, 200, 200) \gset
SELECT outcome AS y_outcome, transaction_id AS tx_y, previous_transaction_id AS y_prev
FROM public.reserve_resale_listing('aaaaaaaa-0000-0000-0000-0000000000b4', tests.id('B1'), 40.00, 1, 4200, 200, 200) \gset
SELECT tests.ok(:'y_outcome' = 'reserved' AND :'y_prev'::uuid = :'tx_x'::uuid AND :'tx_y' <> :'tx_x',
  'same buyer reserves again during a live hold: reserved, previous_transaction_id = first tx');
SELECT tests.ok(
  (SELECT status::text = 'cancelled' FROM public.transactions WHERE id = :'tx_x'::uuid)
  AND (SELECT reserved_transaction_id = :'tx_y'::uuid FROM public.tickets WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000b4'),
  'same-buyer takeover: first tx cancelled, listing held by the second');

SELECT tests.ok(NOT public.release_resale_reservation(:'tx_x'::uuid), 'release with the old (taken over) tx: false');
SELECT tests.ok(NOT public.release_resale_reservation(gen_random_uuid()), 'release with an unknown tx: false');
SELECT tests.ok(
  (SELECT status = 'reserved' AND reserved_transaction_id = :'tx_y'::uuid FROM public.tickets WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000b4')
  AND (SELECT status::text = 'pending' FROM public.transactions WHERE id = :'tx_y'::uuid),
  'release of another tx leaves the current reservation alone');
SELECT tests.ok(public.release_resale_reservation(:'tx_y'::uuid), 'release with the holding tx: true');
SELECT tests.ok(
  (SELECT status = 'available' AND reserved_transaction_id IS NULL AND reserved_until IS NULL FROM public.tickets WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000b4')
  AND (SELECT status::text = 'cancelled' FROM public.transactions WHERE id = :'tx_y'::uuid),
  'release: listing available, reservation cleared, tx cancelled');

SELECT transaction_id AS tx_z FROM public.reserve_resale_listing('aaaaaaaa-0000-0000-0000-0000000000b4', tests.id('B2'), 40.00, 1, 4200, 200, 200) \gset
SELECT tests.ok(public.release_expired_resale_reservations() = 1, 'sweep: releases only expired holds (L8), not the live one');
SELECT tests.ok(
  (SELECT status = 'available' AND reserved_transaction_id IS NULL FROM public.tickets WHERE id = tests.id('L8'))
  AND (SELECT status::text = 'cancelled' FROM public.transactions WHERE id = tests.id('TX8'))
  AND (SELECT status = 'reserved' AND reserved_transaction_id = :'tx_z'::uuid FROM public.tickets WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000b4'),
  'sweep: L8 available and TX8 cancelled; live hold kept');
SELECT tests.ok(public.release_expired_resale_reservations() = 0, 'sweep again: nothing to release');

RESET ROLE;
UPDATE public.tickets SET verification_status = 'rejected' WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000b4';
SET ROLE service_role;
SELECT tests.ok(
  (SELECT outcome = 'listing_unavailable' FROM public.complete_resale_purchase(:'tx_z'::uuid, 'pi_z', NULL, NULL)),
  'complete after the listing was rejected: listing_unavailable');
SELECT tests.ok(
  (SELECT status::text = 'cancelled' AND payment_intent_id = 'pi_z' FROM public.transactions WHERE id = :'tx_z'::uuid),
  'complete after the listing was rejected: listing_unavailable, tx cancelled');

-- Pending tx on an available listing (hold released, nobody took it): completes.
INSERT INTO public.tickets (id, event_id, seller_id, status, verification_status, selling_price, quantity, qr_hash)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000b5', tests.id('E4'), tests.id('S'), 'available', 'verified', 18.00, 1, 'hash-b5');
INSERT INTO public.transactions (id, ticket_id, buyer_id, seller_id, amount, quantity, status)
VALUES ('abababab-0000-0000-0000-0000000000c5', 'aaaaaaaa-0000-0000-0000-0000000000b5', tests.id('B1'), tests.id('S'), 18.9, 1, 'pending');
SELECT tests.ok(
  (SELECT outcome = 'completed' FROM public.complete_resale_purchase('abababab-0000-0000-0000-0000000000c5', 'pi_c5', NULL, NULL)),
  'complete a pending tx whose listing is simply available: completed');
SELECT tests.ok(
  (SELECT status = 'sold' AND buyer_id = tests.id('B1') FROM public.tickets WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000b5'),
  'complete a pending tx whose listing is simply available: completed');

-- ════════════════════════════════════════════════════════════════════════════
-- record_resale_refund
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.ok((SELECT outcome = 'not_found' AND transaction_id IS NULL AND NOT relisted FROM public.record_resale_refund('pi_unknown')), 'refund: unknown payment intent -> not_found');
SELECT tests.ok((SELECT outcome = 'not_found' FROM public.record_resale_refund(NULL)), 'refund: NULL payment intent -> not_found');
SELECT tests.ok(
  (SELECT outcome = 'refunded' AND transaction_id = tests.id('TX4') AND relisted AND was_completed FROM public.record_resale_refund('pi_l4')),
  'refund of a completed external sale (L4): refunded, relisted, was_completed');
SELECT tests.ok(
  (SELECT status = 'available' AND buyer_id IS NULL FROM public.tickets WHERE id = tests.id('L4'))
  AND (SELECT status::text = 'refunded' FROM public.transactions WHERE id = tests.id('TX4')),
  'refund L4: listing back on sale without buyer, tx refunded');
SELECT tests.ok((SELECT outcome = 'already_refunded' AND NOT relisted FROM public.record_resale_refund('pi_l4')), 'refund again: already_refunded');
SELECT tests.ok(
  (SELECT outcome = 'refunded' AND NOT relisted AND NOT was_completed FROM public.record_resale_refund('pi_tx1')),
  'refund of the conflict tx1 (cancelled): refunded, not relisted, was_completed false');
SELECT tests.ok(
  (SELECT status = 'sold' AND buyer_id = tests.id('B2') FROM public.tickets WHERE id = tests.id('L2')),
  'refund of tx1 does not re-list L2 (sold to B2 by tx2)');
SELECT tests.ok(
  (SELECT outcome = 'refunded' AND NOT relisted AND was_completed FROM public.record_resale_refund('pi_b2')),
  'refund of a completed Studio sale: refunded, NOT relisted, was_completed (admin alert)');
SELECT tests.ok(
  (SELECT status = 'sold' FROM public.tickets WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000b2'),
  'Studio listing stays sold after refund');
SELECT tests.ok(
  (SELECT outcome = 'refunded' AND NOT relisted AND was_completed FROM public.record_resale_refund('pi_a')),
  'refund of a disputed Studio sale: refunded, not relisted, was_completed');
-- A refund for a sale whose listing was re-sold since: not relisted.
UPDATE public.transactions SET status = 'completed' WHERE id = :'tx2'::uuid;
RESET ROLE;
UPDATE public.tickets SET buyer_id = tests.id('A') WHERE id = tests.id('L2');
SET ROLE service_role;
SELECT tests.ok(
  (SELECT outcome = 'refunded' AND NOT relisted AND was_completed FROM public.record_resale_refund('pi_tx2')),
  'refund of a completed sale whose listing now belongs to another buyer: refunded, not relisted');
SELECT tests.ok(
  (SELECT status = 'sold' AND buyer_id = tests.id('A') FROM public.tickets WHERE id = tests.id('L2')),
  'refund of a completed sale whose listing now belongs to another buyer: not relisted');
-- A refund that lands while the tx still holds a reservation frees the listing.
SELECT transaction_id AS tx_p FROM public.reserve_resale_listing(tests.id('L8'), tests.id('B1'), 30.00, 1, 3150, 150, 150) \gset
UPDATE public.transactions SET payment_intent_id = 'pi_p' WHERE id = :'tx_p'::uuid;
SELECT tests.ok(
  (SELECT outcome = 'refunded' AND NOT relisted AND NOT was_completed FROM public.record_resale_refund('pi_p')),
  'refund of a pending tx holding L8: refunded');
SELECT tests.ok(
  (SELECT status = 'available' AND reserved_transaction_id IS NULL FROM public.tickets WHERE id = tests.id('L8')),
  'refund of a pending tx holding L8: refunded, reservation released');

RESET ROLE;
ROLLBACK;
