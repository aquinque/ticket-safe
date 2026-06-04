-- Re-create the tier_inventory view consumed by /e/:slug.
--
-- Previous shape was dropped/mismatched on prod, causing EventPublic to
-- receive zero rows and render the "Tickets will be on sale soon" empty
-- state even though the published event had active tiers underneath.
--
-- security_invoker = true makes the view run as the calling role, so it
-- respects the event_tiers RLS policies. The WHERE clause is an additional
-- belt-and-braces filter so the view itself never leaks rows from draft or
-- cancelled events.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

DROP VIEW IF EXISTS public.tier_inventory CASCADE;

CREATE VIEW public.tier_inventory
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
  et.is_active
FROM public.event_tiers et
JOIN public.events e ON e.id = et.event_id
WHERE e.status = 'published'
  AND e.is_active = true;

GRANT SELECT ON public.tier_inventory TO anon, authenticated, service_role;
