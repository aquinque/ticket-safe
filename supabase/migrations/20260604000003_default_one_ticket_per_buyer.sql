-- Make 1 ticket/buyer the platform default.
--
-- Until now, max_tickets_per_buyer defaulted to NULL ("unlimited"). Most
-- launch events are high-demand and want a hard 1-per-person cap, so flip
-- the default and backfill every existing row.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

ALTER TABLE public.events
  ALTER COLUMN max_tickets_per_buyer SET DEFAULT 1;

UPDATE public.events
SET max_tickets_per_buyer = 1
WHERE max_tickets_per_buyer IS NULL OR max_tickets_per_buyer <> 1;
