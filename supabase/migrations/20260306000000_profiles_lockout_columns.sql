-- =====================================================================
-- Add account lockout columns to profiles
-- Required by check_account_lockout / increment_failed_login RPCs
-- Safe to run multiple times (IF NOT EXISTS).
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMPTZ;

-- Index for lockout queries
CREATE INDEX IF NOT EXISTS idx_profiles_lockout
  ON public.profiles (email)
  WHERE locked_until IS NOT NULL;
