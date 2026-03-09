-- =====================================================================
-- Admin review queue
--
-- 1. Admins can SELECT all tickets (for the review page)
-- 2. Admins can UPDATE verification_status (done via service-role
--    in the edge function, but add policy for direct access too)
-- 3. Make verification_status column visible in marketplace query
-- =====================================================================

-- ── 1. Admin SELECT policy on tickets ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tickets' AND policyname = 'admins_select_all_tickets'
  ) THEN
    CREATE POLICY "admins_select_all_tickets"
      ON public.tickets
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END $$;

-- ── 2. Admin UPDATE policy on tickets ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tickets' AND policyname = 'admins_update_tickets'
  ) THEN
    CREATE POLICY "admins_update_tickets"
      ON public.tickets
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END $$;

-- ── 3. Ensure verification_status column exists with correct default ──
-- (should already exist from earlier migrations, this is a safety guard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tickets'
      AND column_name  = 'verification_status'
  ) THEN
    ALTER TABLE public.tickets
      ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'verified', 'rejected'));
  END IF;
END $$;

-- ── 4. Index for admin review queue (pending tickets) ─────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_verification_status
  ON public.tickets (verification_status)
  WHERE status = 'available';
