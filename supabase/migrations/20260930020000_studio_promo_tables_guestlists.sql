-- Studio: ticket-type "tables", promo codes, and guestlists.
--
-- 1. event_tiers gets a `kind` + `capacity_per_unit` so an organizer can
--    flag a tier as a "table" (e.g. "VIP table (6 pers)") without touching
--    reserve_tier/finalize_tier_sale — a table purchase is still just a
--    normal tier reservation, quantity = number of people. capacity_per_unit
--    is informational (drives the buyer-side "Table for N" badge + quantity
--    default) so the existing checkout/reservation RPCs need zero changes.
--
-- 2. event_promo_codes — percent/fixed discounts applied to the ticket price
--    (never to the flat €1.40 buyer service fee) at checkout time. Validated
--    and redeemed server-side in revolut-create-checkout.
--
-- 3. event_guestlists / event_guestlist_entries — free/no-payment name lists
--    (e.g. "Girls before midnight"), optionally restricted to one gender.
--    Checked in by name at the door, separate from QR ticket scanning.

ALTER TABLE public.event_tiers
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'ticket' CHECK (kind IN ('ticket', 'table')),
  ADD COLUMN IF NOT EXISTS capacity_per_unit INTEGER NOT NULL DEFAULT 1 CHECK (capacity_per_unit >= 1);

COMMENT ON COLUMN public.event_tiers.kind IS
  'ticket = normal per-person tier. table = bottle-service/table tier; capacity_per_unit says how many people it seats. Purely organizational — reservation math is unchanged (quantity is still person-count).';
COMMENT ON COLUMN public.event_tiers.capacity_per_unit IS
  'People admitted per unit purchased. 1 for normal tickets; e.g. 6 for a "table for 6". Drives the buyer-side quantity default/step, not enforced by reserve_tier.';

-- ── Promo codes ──────────────────────────────────────────────────────────
CREATE TABLE public.event_promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (char_length(code) BETWEEN 2 AND 40),
  discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
  -- percent: 1-100. fixed: cents, capped server-side at the ticket price so a
  -- code can never make a ticket free or negative.
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, code)
);
CREATE INDEX event_promo_codes_event_idx ON public.event_promo_codes(event_id);

ALTER TABLE public.event_promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizer_manage_own_promo_codes" ON public.event_promo_codes
  FOR ALL TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

COMMENT ON TABLE public.event_promo_codes IS
  'Per-event discount codes, redeemed server-side in revolut-create-checkout against the ticket price only (never the flat buyer service fee). Management is RLS-gated to the owning organizer/admin.';

-- Track which code (if any) an order used, for the Studio dashboard's
-- promo-code stats. ON DELETE SET NULL so deleting a stale code doesn't
-- take historical orders down with it.
ALTER TABLE public.event_orders
  ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES public.event_promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;

-- ── Guestlists ───────────────────────────────────────────────────────────
CREATE TABLE public.event_guestlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  gender_restriction TEXT CHECK (gender_restriction IS NULL OR gender_restriction IN ('female', 'male')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX event_guestlists_event_idx ON public.event_guestlists(event_id);

CREATE TABLE public.event_guestlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guestlist_id UUID NOT NULL REFERENCES public.event_guestlists(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 100),
  last_name TEXT NOT NULL CHECK (char_length(last_name) BETWEEN 1 AND 100),
  email TEXT,
  gender TEXT CHECK (gender IS NULL OR gender IN ('female', 'male', 'other')),
  added_by UUID REFERENCES auth.users(id),
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX event_guestlist_entries_list_idx ON public.event_guestlist_entries(guestlist_id);
-- Fast door-lookup by name.
CREATE INDEX event_guestlist_entries_name_idx ON public.event_guestlist_entries(lower(last_name), lower(first_name));

ALTER TABLE public.event_guestlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_guestlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizer_manage_own_guestlists" ON public.event_guestlists
  FOR ALL TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "organizer_manage_own_guestlist_entries" ON public.event_guestlist_entries
  FOR ALL TO authenticated
  USING (
    guestlist_id IN (
      SELECT gl.id FROM public.event_guestlists gl
      JOIN public.events e ON e.id = gl.event_id
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    guestlist_id IN (
      SELECT gl.id FROM public.event_guestlists gl
      JOIN public.events e ON e.id = gl.event_id
      JOIN public.organizer_profiles op ON op.id = e.organizer_id
      WHERE op.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

COMMENT ON TABLE public.event_guestlists IS
  'Named, no-payment entry lists for an event (e.g. "Girls before midnight"), optionally gender-restricted. Entries are checked in by name at the door, separate from QR ticket scanning.';
