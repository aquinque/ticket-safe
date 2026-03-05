-- =====================================================
-- Core schema setup — run in Supabase Dashboard → SQL Editor
-- Safely idempotent (IF NOT EXISTS everywhere)
-- Creates: profiles, user_roles, transactions, stripe_accounts
-- and all dependent enums, triggers, RLS policies
-- =====================================================

-- ── 1. Enums ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
    CREATE TYPE public.transaction_status AS ENUM (
      'pending', 'completed', 'cancelled', 'refunded', 'escrowed'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE public.ticket_status AS ENUM ('available', 'reserved', 'sold', 'cancelled');
  END IF;
END $$;

-- ── 2. update_updated_at_column helper ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 3. profiles ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL UNIQUE,
  full_name             TEXT NOT NULL DEFAULT '',
  university            TEXT NOT NULL DEFAULT 'ESCP Business School',
  university_email      TEXT NOT NULL DEFAULT '',
  campus                TEXT,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until          TIMESTAMPTZ DEFAULT NULL,
  deleted_at            TIMESTAMPTZ DEFAULT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add missing columns to existing profiles table (idempotent)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS campus                TEXT,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by owner" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles(email) WHERE deleted_at IS NULL;

CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 4. user_roles ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role       app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- ── 5. handle_new_user trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, university, university_email)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'university', 'ESCP Business School'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 6. Account lockout RPCs ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_account_lockout(user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  SELECT
    failed_login_attempts >= 5
    AND locked_until IS NOT NULL
    AND locked_until > NOW()
  INTO v_locked
  FROM public.profiles
  WHERE email = user_email AND deleted_at IS NULL;

  RETURN COALESCE(v_locked, FALSE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_account_lockout(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_failed_login(user_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
    locked_until = CASE
      WHEN COALESCE(failed_login_attempts, 0) + 1 >= 5
      THEN NOW() + INTERVAL '15 minutes'
      ELSE locked_until
    END
  WHERE email = user_email AND deleted_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_failed_login(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reset_failed_login(user_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET failed_login_attempts = 0, locked_until = NULL
  WHERE email = user_email AND deleted_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reset_failed_login(TEXT) TO anon, authenticated;

-- ── 7. transactions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                 UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  buyer_id                  UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  seller_id                 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount                    NUMERIC(10,2) NOT NULL,
  fee_amount                NUMERIC(10,2) DEFAULT 0,
  stripe_checkout_session_id TEXT,
  status                    transaction_status DEFAULT 'pending' NOT NULL,
  created_at                TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at                TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers can read own transactions"  ON public.transactions;
DROP POLICY IF EXISTS "Sellers can read own transactions" ON public.transactions;

CREATE POLICY "Buyers can read own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "Sellers can read own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = seller_id);

CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session
  ON public.transactions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_buyer
  ON public.transactions(buyer_id);

CREATE INDEX IF NOT EXISTS idx_transactions_seller
  ON public.transactions(seller_id);

CREATE OR REPLACE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 8. stripe_accounts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  stripe_account_id   TEXT NOT NULL UNIQUE,
  onboarding_status   TEXT DEFAULT 'pending',
  charges_enabled     BOOLEAN DEFAULT FALSE,
  payouts_enabled     BOOLEAN DEFAULT FALSE,
  details_submitted   BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.stripe_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own stripe account" ON public.stripe_accounts;
CREATE POLICY "Users can read own stripe account"
  ON public.stripe_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER update_stripe_accounts_updated_at
  BEFORE UPDATE ON public.stripe_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 9. tickets: add FK to profiles if not already set ─────────────────────────
-- Add seller_id FK if the column exists but has no constraint yet
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'seller_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu USING (constraint_name, constraint_schema)
    WHERE tc.table_schema = 'public' AND tc.table_name = 'tickets'
      AND ccu.column_name = 'seller_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.tickets
      ADD CONSTRAINT tickets_seller_id_fkey
      FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 10. tickets RLS (ensure it's enabled with basic policies) ─────────────────
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view available tickets" ON public.tickets;
DROP POLICY IF EXISTS "Sellers can insert own tickets"   ON public.tickets;
DROP POLICY IF EXISTS "Sellers can update own tickets"   ON public.tickets;

CREATE POLICY "Anyone can view available tickets"
  ON public.tickets FOR SELECT
  USING (status = 'available' OR auth.uid() = seller_id);

CREATE POLICY "Sellers can insert own tickets"
  ON public.tickets FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update own tickets"
  ON public.tickets FOR UPDATE
  USING (auth.uid() = seller_id);

-- ── 11. Service-role bypass for edge functions ────────────────────────────────
-- Allow edge functions (service role) to bypass RLS on critical tables
ALTER TABLE public.profiles     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tickets      FORCE ROW LEVEL SECURITY;
