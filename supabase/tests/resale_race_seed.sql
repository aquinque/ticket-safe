-- Committed seed for the concurrency tests in scripts/test-db.sh (they need
-- several sessions, so they cannot run inside one rolled-back transaction).
-- Runs after every resale_*.test.sql file.
--   L9   external listing on E4, 20.00: 20 buyers R01..R20 reserve at once
--   L11  external listing on E4, 20.00: deterministic lock wait
--   L12  Studio listing on E1 (ET5), 20.00: same payment delivered twice
--   L13  external listing on E4, 20.00: expired hold taken over, both pay

INSERT INTO tests.ids (name, id)
SELECT 'R' || lpad(i::text, 2, '0'), ('cccccccc-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid
FROM generate_series(1, 20) i;
INSERT INTO tests.ids (name, id) VALUES
  ('ET5', 'ffffffff-0000-0000-0000-000000000005'),
  ('L9',  'aaaaaaaa-0000-0000-0000-000000000009'),
  ('L11', 'aaaaaaaa-0000-0000-0000-000000000011'),
  ('L12', 'aaaaaaaa-0000-0000-0000-000000000012'),
  ('L13', 'aaaaaaaa-0000-0000-0000-000000000013');

INSERT INTO auth.users (id, email)
SELECT id, lower(name) || '@example.invalid' FROM tests.ids WHERE name ~ '^R[0-9]{2}$';
INSERT INTO public.profiles (id, email, full_name)
SELECT id, lower(name) || '@example.invalid', 'Racer ' || name FROM tests.ids WHERE name ~ '^R[0-9]{2}$';

INSERT INTO public.event_tickets (id, order_id, event_id, tier_id, buyer_id, qr_token)
VALUES (tests.id('ET5'), tests.id('O1'), tests.id('E1'), tests.id('T1'), tests.id('S'), 'qr-et5');

INSERT INTO public.tickets (id, event_id, seller_id, status, verification_status, selling_price, quantity, qr_hash, studio_ticket_id) VALUES
  (tests.id('L9'),  tests.id('E4'), tests.id('S'), 'available', 'verified', 20.00, 1, 'hash-l9',  NULL),
  (tests.id('L11'), tests.id('E4'), tests.id('S'), 'available', 'verified', 20.00, 1, 'hash-l11', NULL),
  (tests.id('L12'), tests.id('E1'), tests.id('S'), 'available', 'verified', 20.00, 1, 'studio:' || tests.id('ET5'), tests.id('ET5')),
  (tests.id('L13'), tests.id('E4'), tests.id('S'), 'available', 'verified', 20.00, 1, 'hash-l13', NULL);
