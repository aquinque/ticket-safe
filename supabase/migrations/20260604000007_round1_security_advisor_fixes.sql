-- Round 1 — Supabase Security Advisor fixes
--
-- Closes:
--   * security_definer_view on public.tier_inventory      (level ERROR)
--   * anon_security_definer_function_executable on the
--     three payment-flow RPCs                              (level WARN)
--   * authenticated_security_definer_function_executable
--     on the same three RPCs                               (level WARN)
--   * public_bucket_allows_listing on organizer-assets    (level WARN)
--
-- Does NOT touch (deferred, behaviour change required):
--   * check_account_lockout / increment_failed_login /
--     reset_failed_login   — still called from Auth.tsx
--     client-side; needs the auth flow to move to an edge
--     function first.
--   * create_stub_event   — still called from Studio with
--     an authenticated session; needs an organizer-permission
--     check inside an edge function first.

-- ─────────────────────────────────────────────────────────
-- 1) Recreate tier_inventory as a regular (SECURITY INVOKER) view.
--    The existing event_tiers + events RLS policies already let the
--    public read published, active inventory — we verified the matching
--    'event_tiers_select_public_published' and 'Public can read active
--    events' policies are in place — so behaviour from a buyer's point of
--    view stays identical. Organizers still see their own draft tiers
--    via the 'event_tiers_organizer_all' policy.
-- ─────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.tier_inventory;

CREATE VIEW public.tier_inventory
WITH (security_invoker = true) AS
SELECT
  et.id          AS tier_id,
  et.event_id,
  et.name,
  et.description,
  et.price_cents,
  et.currency,
  et.total_qty,
  et.sold_qty,
  et.reserved_qty,
  GREATEST(((et.total_qty - et.sold_qty) - et.reserved_qty), 0) AS available_qty,
  et.sort_order,
  et.is_active
FROM event_tiers et
JOIN events e ON e.id = et.event_id
WHERE e.status = 'published' AND e.is_active = true;

COMMENT ON VIEW public.tier_inventory IS
  'Public view of remaining seats per tier on published events. SECURITY INVOKER so RLS of the querying user applies.';

GRANT SELECT ON public.tier_inventory TO anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 2) Lock the payment-flow RPCs down to service_role.
-- ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.reserve_tier(uuid, integer)
  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_tier_sale(uuid, integer)
  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_tier_reservation(uuid, integer)
  FROM anon, authenticated;

COMMENT ON FUNCTION public.reserve_tier(uuid, integer) IS
  'Atomically increments reserved_qty for a tier. service_role only — must run inside studio-create-checkout.';
COMMENT ON FUNCTION public.finalize_tier_sale(uuid, integer) IS
  'Atomically moves reserved_qty → sold_qty on payment success. service_role only — must run inside the stripe webhook.';
COMMENT ON FUNCTION public.release_tier_reservation(uuid, integer) IS
  'Atomically decrements reserved_qty when a checkout expires or fails. service_role only.';

-- ─────────────────────────────────────────────────────────
-- 3) Tighten the organizer-assets storage bucket.
--    The bucket is `public = true`, so direct object URLs keep working.
--    The broad SELECT policy we are dropping was only enabling the LIST
--    API. The frontend only uses upload + getPublicUrl, never list().
-- ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "organizer_assets_public_read" ON storage.objects;

CREATE POLICY "organizer_assets_owner_read" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'organizer-assets'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- ─────────────────────────────────────────────────────────
-- 4) Document the three service-role-only tables that intentionally have
--    RLS enabled with no policies.
-- ─────────────────────────────────────────────────────────
COMMENT ON TABLE public.rate_limits IS
  'In-DB rate-limit counters. RLS enabled with no policies = service_role only by design.';
COMMENT ON TABLE public.stripe_webhook_events IS
  'Idempotency log for Stripe webhook events. RLS enabled with no policies = service_role only by design.';
