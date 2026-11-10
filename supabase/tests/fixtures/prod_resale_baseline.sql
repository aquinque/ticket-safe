-- Production baseline for the resale DB tests (scripts/test-db.sh).
--
-- Hand-written from read-only catalog queries on the production project
-- (information_schema.columns, pg_constraint, pg_indexes, pg_policies,
-- pg_get_viewdef, pg_get_functiondef, pg_get_triggerdef, relacl), taken on
-- 2026-11-04. It reproduces production as it was BEFORE
-- 20261104120000_views_security_invoker_and_write_revokes.sql, so the harness
-- can apply, in order: 20261103130000 (disputes + price cap), 20261104120000
-- (A), 20261108090000 (B) and 20261108090100 (C), and test all of them.
--
-- Scope: only the tables, views, functions, triggers, policies and grants the
-- resale code paths touch. Deliberately left out:
--   * trg_dispatch_ticket_alerts on tickets (needs the pg_net extension),
--   * the events triggers (organizer approval, published-event lock, site
--     rebuild, follower dispatch) and the event_tiers currency / past-event
--     triggers: none of them affects resale, and the seed would trip them,
--   * claim_external_ticket on event_tickets (needs external_ticket_inventory;
--     see the open issue about external tiers in the WS1 report),
--   * FKs to tables not reproduced here (stripe_connect_payout_jobs,
--     event_promo_codes, event_promoter_links, payout_batches).
-- Differences that are inherent to a local cluster: postgres is a superuser
-- here (in production it is NOSUPERUSER BYPASSRLS, which bypasses RLS the
-- same way for SECURITY DEFINER functions it owns); PG16 has no MAINTAIN
-- privilege (production is PG17).

\set ON_ERROR_STOP 1
SET client_min_messages = warning;

-- ── Roles ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Auth stub ────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- ── Types (production values) ────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.event_ticket_status AS ENUM ('valid', 'scanned', 'cancelled', 'refunded', 'transferred');
CREATE TYPE public.offer_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');
CREATE TYPE public.ticket_status AS ENUM ('available', 'reserved', 'sold', 'cancelled');
CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed', 'cancelled', 'refunded', 'escrowed');

-- ── Functions used by tables / triggers ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION public.event_end(p_date timestamp with time zone, p_ends_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_ends_at is not null and (p_date is null or p_ends_at > p_date) then p_ends_at
    when p_date is not null then p_date + interval '8 hours'
    else null
  end
$function$;

-- ── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT ''::text,
  university text,
  university_email text,
  campus text,
  failed_login_attempts integer DEFAULT 0,
  locked_until timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  payout_iban text,
  payout_iban_holder text,
  payout_iban_set_at timestamp with time zone,
  first_name text,
  last_name text,
  gender text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_email_key UNIQUE (email),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['female'::text, 'male'::text])))),
  CONSTRAINT profiles_payout_iban_check CHECK (((payout_iban IS NULL) OR ((length(payout_iban) >= 15) AND (length(payout_iban) <= 34)))),
  CONSTRAINT profiles_payout_iban_holder_check CHECK (((payout_iban_holder IS NULL) OR ((length(payout_iban_holder) >= 2) AND (length(payout_iban_holder) <= 120))))
);
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email) WHERE (deleted_at IS NULL);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL DEFAULT 'user'::app_role,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE public.organizer_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  org_type text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  website text,
  about text,
  logo_url text,
  primary_color text DEFAULT '#003399'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  rejection_reason text,
  approved_at timestamp with time zone,
  approved_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  first_event_name text,
  first_event_date timestamp with time zone,
  expected_attendees integer,
  payout_iban text,
  payout_iban_holder text,
  payout_iban_set_at timestamp with time zone,
  siren text,
  rna_number text,
  billing_address_line1 text,
  billing_postal_code text,
  billing_city text,
  billing_country text DEFAULT 'France'::text,
  CONSTRAINT organizer_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT organizer_profiles_slug_key UNIQUE (slug),
  CONSTRAINT organizer_profiles_user_id_key UNIQUE (user_id),
  CONSTRAINT organizer_profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id),
  CONSTRAINT organizer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT organizer_profiles_about_check CHECK (((about IS NULL) OR (length(about) <= 2000))),
  CONSTRAINT organizer_profiles_contact_email_check CHECK (((length(contact_email) >= 5) AND (length(contact_email) <= 254))),
  CONSTRAINT organizer_profiles_contact_name_check CHECK (((length(contact_name) >= 2) AND (length(contact_name) <= 120))),
  CONSTRAINT organizer_profiles_expected_attendees_check CHECK (((expected_attendees IS NULL) OR ((expected_attendees > 0) AND (expected_attendees <= 100000)))),
  CONSTRAINT organizer_profiles_first_event_name_check CHECK (((first_event_name IS NULL) OR (length(first_event_name) <= 200))),
  CONSTRAINT organizer_profiles_name_check CHECK (((length(name) >= 2) AND (length(name) <= 120))),
  CONSTRAINT organizer_profiles_org_type_check CHECK ((org_type = ANY (ARRAY['bde'::text, 'sports'::text, 'alumni'::text, 'conference'::text, 'student-society'::text, 'other'::text]))),
  CONSTRAINT organizer_profiles_payout_iban_check CHECK (((payout_iban IS NULL) OR ((length(payout_iban) >= 15) AND (length(payout_iban) <= 34)))),
  CONSTRAINT organizer_profiles_payout_iban_holder_check CHECK (((payout_iban_holder IS NULL) OR ((length(payout_iban_holder) >= 2) AND (length(payout_iban_holder) <= 120)))),
  CONSTRAINT organizer_profiles_primary_color_check CHECK ((primary_color ~ '^#[0-9A-Fa-f]{6}$'::text)),
  CONSTRAINT organizer_profiles_siren_check CHECK (((siren IS NULL) OR (siren ~ '^[0-9]{9}$'::text))),
  CONSTRAINT organizer_profiles_slug_check CHECK ((slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'::text)),
  CONSTRAINT organizer_profiles_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'suspended'::text])))
);

CREATE TABLE public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  location text,
  source text DEFAULT 'manual'::text,
  created_at timestamp with time zone DEFAULT now(),
  category text,
  university text,
  description text,
  url text,
  image_url text,
  external_id text,
  date timestamp with time zone,
  campus text,
  base_price numeric,
  is_active boolean NOT NULL DEFAULT true,
  external_source text,
  external_event_id text,
  needs_review boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  search_vector tsvector,
  organizer_id uuid,
  slug text,
  primary_color text,
  logo_url text,
  banner_url text,
  status text DEFAULT 'draft'::text,
  published_at timestamp with time zone,
  sold_via_studio boolean DEFAULT false,
  cancelled_at timestamp with time zone,
  max_tickets_per_buyer integer DEFAULT 1,
  followers_notified_at timestamp with time zone,
  og_image_url text,
  seo_description text,
  banner_fit text NOT NULL DEFAULT 'cover'::text,
  gallery_urls text[] NOT NULL DEFAULT '{}'::text[],
  video_url text,
  payment_provider text NOT NULL DEFAULT 'stripe'::text,
  commission_override_cents integer,
  description_font text,
  currency text NOT NULL DEFAULT 'EUR'::text,
  vat_rate numeric,
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES organizer_profiles(id) ON DELETE SET NULL,
  CONSTRAINT events_banner_fit_check CHECK ((banner_fit = ANY (ARRAY['cover'::text, 'contain'::text]))),
  CONSTRAINT events_currency_check CHECK ((currency = ANY (ARRAY['EUR'::text, 'GBP'::text]))),
  CONSTRAINT events_max_tickets_per_buyer_check CHECK (((max_tickets_per_buyer IS NULL) OR ((max_tickets_per_buyer >= 1) AND (max_tickets_per_buyer <= 50)))),
  CONSTRAINT events_payment_provider_check CHECK ((payment_provider = ANY (ARRAY['revolut'::text, 'stripe'::text]))),
  CONSTRAINT events_slug_format_check CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'::text))),
  CONSTRAINT events_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text, 'sold_out'::text]))))
);
CREATE INDEX idx_events_active_date ON public.events USING btree (date) WHERE (is_active = true);
CREATE UNIQUE INDEX idx_events_slug ON public.events USING btree (slug) WHERE (slug IS NOT NULL);
CREATE INDEX idx_events_organizer_id ON public.events USING btree (organizer_id);
CREATE INDEX idx_events_status ON public.events USING btree (status);

CREATE TABLE public.event_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'EUR'::text,
  total_qty integer NOT NULL,
  sold_qty integer NOT NULL DEFAULT 0,
  reserved_qty integer NOT NULL DEFAULT 0,
  max_per_order integer NOT NULL DEFAULT 10,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sales_start_at timestamp with time zone,
  sales_end_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'platform'::text,
  kind text NOT NULL DEFAULT 'ticket'::text,
  capacity_per_unit integer NOT NULL DEFAULT 1,
  CONSTRAINT event_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT event_tiers_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT event_tiers_capacity_per_unit_check CHECK ((capacity_per_unit >= 1)),
  CONSTRAINT event_tiers_check CHECK (((sold_qty + reserved_qty) <= total_qty)),
  CONSTRAINT event_tiers_check1 CHECK (((sales_end_at IS NULL) OR (sales_start_at IS NULL) OR (sales_end_at > sales_start_at))),
  CONSTRAINT event_tiers_currency_check CHECK ((currency = ANY (ARRAY['EUR'::text, 'GBP'::text]))),
  CONSTRAINT event_tiers_description_check CHECK (((description IS NULL) OR (length(description) <= 500))),
  CONSTRAINT event_tiers_kind_check CHECK ((kind = ANY (ARRAY['ticket'::text, 'table'::text]))),
  CONSTRAINT event_tiers_max_per_order_check CHECK (((max_per_order >= 1) AND (max_per_order <= 100))),
  CONSTRAINT event_tiers_name_check CHECK (((length(name) >= 1) AND (length(name) <= 80))),
  CONSTRAINT event_tiers_price_cents_check CHECK (((price_cents >= 0) AND (price_cents <= 500000))),
  CONSTRAINT event_tiers_reserved_qty_check CHECK ((reserved_qty >= 0)),
  CONSTRAINT event_tiers_sold_qty_check CHECK ((sold_qty >= 0)),
  CONSTRAINT event_tiers_source_chk CHECK ((source = ANY (ARRAY['platform'::text, 'external'::text]))),
  CONSTRAINT event_tiers_total_qty_check CHECK (((total_qty > 0) AND (total_qty <= 20000)))
);
CREATE INDEX idx_event_tiers_event_id ON public.event_tiers USING btree (event_id);
CREATE TRIGGER trg_event_tiers_touch BEFORE UPDATE ON public.event_tiers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Only the columns the views and the resale code use are kept in full;
-- event_orders keeps every production column (it is small).
CREATE TABLE public.event_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  tier_id uuid NOT NULL,
  organizer_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  quantity integer NOT NULL,
  unit_price_cents integer NOT NULL,
  total_cents integer NOT NULL,
  fee_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  buyer_email text NOT NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '00:30:00'::interval),
  paid_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  refunded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  attendees jsonb,
  paid_out_at timestamp with time zone,
  paid_out_transfer_id text,
  promo_code_id uuid,
  discount_cents integer NOT NULL DEFAULT 0,
  commission_cents integer,
  stripe_application_fee_id text,
  promoter_link_id uuid,
  CONSTRAINT event_orders_pkey PRIMARY KEY (id),
  CONSTRAINT event_orders_stripe_checkout_session_id_key UNIQUE (stripe_checkout_session_id),
  CONSTRAINT event_orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT event_orders_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT,
  CONSTRAINT event_orders_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES organizer_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT event_orders_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES event_tiers(id) ON DELETE RESTRICT,
  CONSTRAINT event_orders_attendees_check CHECK (((attendees IS NULL) OR ((jsonb_array_length(attendees) >= 1) AND (jsonb_array_length(attendees) <= 50)))),
  CONSTRAINT event_orders_fee_cents_check CHECK ((fee_cents >= 0)),
  CONSTRAINT event_orders_quantity_check CHECK (((quantity >= 1) AND (quantity <= 100))),
  CONSTRAINT event_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text, 'refunded'::text, 'expired'::text]))),
  CONSTRAINT event_orders_total_cents_check CHECK ((total_cents >= 0)),
  CONSTRAINT event_orders_unit_price_cents_check CHECK ((unit_price_cents >= 0))
);

CREATE TABLE public.event_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  event_id uuid NOT NULL,
  tier_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  qr_token text NOT NULL,
  scanned_at timestamp with time zone,
  scanned_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  used_by uuid,
  holder_first_name text,
  holder_last_name text,
  holder_email text,
  status event_ticket_status NOT NULL DEFAULT 'valid'::event_ticket_status,
  source text NOT NULL DEFAULT 'platform'::text,
  external_provider text,
  external_code text,
  external_file_url text,
  holder_gender text,
  CONSTRAINT event_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT event_tickets_qr_token_key UNIQUE (qr_token),
  CONSTRAINT event_tickets_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT event_tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT,
  CONSTRAINT event_tickets_order_id_fkey FOREIGN KEY (order_id) REFERENCES event_orders(id) ON DELETE CASCADE,
  CONSTRAINT event_tickets_scanned_by_fkey FOREIGN KEY (scanned_by) REFERENCES auth.users(id),
  CONSTRAINT event_tickets_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES event_tiers(id) ON DELETE RESTRICT,
  CONSTRAINT event_tickets_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT event_tickets_holder_email_check CHECK (((holder_email IS NULL) OR ((length(holder_email) >= 3) AND (length(holder_email) <= 254)))),
  CONSTRAINT event_tickets_holder_first_name_check CHECK (((holder_first_name IS NULL) OR ((length(holder_first_name) >= 1) AND (length(holder_first_name) <= 100)))),
  CONSTRAINT event_tickets_holder_gender_check CHECK (((holder_gender IS NULL) OR (holder_gender = ANY (ARRAY['female'::text, 'male'::text, 'other'::text])))),
  CONSTRAINT event_tickets_holder_last_name_check CHECK (((holder_last_name IS NULL) OR ((length(holder_last_name) >= 1) AND (length(holder_last_name) <= 100)))),
  CONSTRAINT event_tickets_source_chk CHECK ((source = ANY (ARRAY['platform'::text, 'external'::text])))
);
CREATE INDEX idx_event_tickets_order_id ON public.event_tickets USING btree (order_id);
CREATE INDEX idx_event_tickets_event_id ON public.event_tickets USING btree (event_id);
CREATE INDEX idx_event_tickets_buyer_id ON public.event_tickets USING btree (buyer_id);
CREATE INDEX event_tickets_status_idx ON public.event_tickets USING btree (status);

CREATE TABLE public.tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid,
  seller_id uuid,
  status text DEFAULT 'available'::text,
  selling_price numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  needs_review boolean NOT NULL DEFAULT false,
  qr_verified boolean NOT NULL DEFAULT false,
  verification_errors jsonb,
  quantity integer NOT NULL DEFAULT 1,
  notes text,
  qr_hash text,
  file_url text,
  expires_at timestamp with time zone,
  verification_status text NOT NULL DEFAULT 'pending'::text,
  buyer_id uuid,
  studio_ticket_id uuid,
  boosted_until timestamp with time zone,
  photo_url text,
  video_url text,
  CONSTRAINT tickets_pkey PRIMARY KEY (id),
  CONSTRAINT tickets_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT tickets_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT tickets_studio_ticket_id_fkey FOREIGN KEY (studio_ticket_id) REFERENCES event_tickets(id),
  CONSTRAINT tickets_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))
);
CREATE INDEX idx_tickets_event ON public.tickets USING btree (event_id);
CREATE INDEX idx_tickets_status ON public.tickets USING btree (status);
CREATE INDEX idx_tickets_event_available ON public.tickets USING btree (event_id) WHERE (status = 'available'::text);
CREATE UNIQUE INDEX idx_tickets_qr_hash ON public.tickets USING btree (qr_hash) WHERE (qr_hash IS NOT NULL);
CREATE INDEX idx_tickets_verification_status ON public.tickets USING btree (verification_status) WHERE (status = 'available'::text);
CREATE UNIQUE INDEX tickets_qr_hash_active_unique ON public.tickets USING btree (qr_hash) WHERE (verification_status = ANY (ARRAY['pending'::text, 'pending_review'::text, 'approved'::text, 'live'::text]));
CREATE INDEX tickets_qr_hash_idx ON public.tickets USING btree (qr_hash);
CREATE INDEX tickets_verification_status_idx ON public.tickets USING btree (verification_status);
CREATE INDEX idx_tickets_buyer_id ON public.tickets USING btree (buyer_id) WHERE (buyer_id IS NOT NULL);
CREATE INDEX idx_tickets_seller_id ON public.tickets USING btree (seller_id);
CREATE INDEX tickets_studio_ticket_idx ON public.tickets USING btree (studio_ticket_id);
CREATE INDEX tickets_boosted_idx ON public.tickets USING btree (boosted_until) WHERE (boosted_until IS NOT NULL);

CREATE OR REPLACE FUNCTION public.enforce_studio_resale_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Studio event + no linked Studio ticket → not allowed (no valid door QR).
  IF NEW.studio_ticket_id IS NULL
     AND EXISTS (SELECT 1 FROM public.event_tiers t WHERE t.event_id = NEW.event_id) THEN
    RAISE EXCEPTION 'STUDIO_TICKET_REQUIRED: this is a Ticket Safe Studio event — you can only resell a Studio ticket you own.';
  END IF;

  -- If a Studio ticket is linked, it must be one the seller owns for this event.
  IF NEW.studio_ticket_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.event_tickets et
       WHERE et.id = NEW.studio_ticket_id
         AND et.buyer_id = NEW.seller_id
         AND et.event_id = NEW.event_id
     ) THEN
    RAISE EXCEPTION 'STUDIO_TICKET_NOT_OWNED: studio_ticket_id must reference a ticket you own for this event.';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_studio_resale_ownership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_studio_resale_ownership() TO service_role;
CREATE TRIGGER trg_enforce_studio_resale_ownership BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION enforce_studio_resale_ownership();

CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  amount numeric NOT NULL,
  fee_amount numeric DEFAULT 0,
  stripe_checkout_session_id text,
  status transaction_status NOT NULL DEFAULT 'pending'::transaction_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  quantity integer NOT NULL DEFAULT 1,
  payment_intent_id text,
  commission_cents integer,
  stripe_application_fee_id text,
  payout_job_id uuid,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT transactions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT transactions_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);
CREATE INDEX transactions_payout_job_idx ON public.transactions USING btree (payout_job_id) WHERE (payout_job_id IS NULL);
CREATE INDEX transactions_payment_intent_idx ON public.transactions USING btree (payment_intent_id);
CREATE INDEX idx_transactions_stripe_session ON public.transactions USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL);
CREATE INDEX idx_transactions_buyer ON public.transactions USING btree (buyer_id);
CREATE INDEX idx_transactions_seller ON public.transactions USING btree (seller_id);
CREATE INDEX idx_transactions_ticket_id ON public.transactions USING btree (ticket_id);
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  last_message_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_ticket_id_buyer_id_key UNIQUE (ticket_id, buyer_id),
  CONSTRAINT conversations_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id),
  CONSTRAINT conversations_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id),
  CONSTRAINT conversations_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);
CREATE INDEX idx_conversations_buyer ON public.conversations USING btree (buyer_id);
CREATE INDEX idx_conversations_seller ON public.conversations USING btree (seller_id);
CREATE INDEX idx_conversations_ticket ON public.conversations USING btree (ticket_id);

CREATE TABLE public.offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  proposer_id uuid NOT NULL,
  price numeric NOT NULL,
  status offer_status DEFAULT 'pending'::offer_status,
  created_at timestamp with time zone DEFAULT now(),
  responded_at timestamp with time zone,
  CONSTRAINT offers_pkey PRIMARY KEY (id),
  CONSTRAINT offers_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT offers_proposer_id_fkey FOREIGN KEY (proposer_id) REFERENCES profiles(id),
  CONSTRAINT offers_price_check CHECK (((price > (0)::numeric) AND (price <= (10000)::numeric)))
);
CREATE INDEX idx_offers_conversation ON public.offers USING btree (conversation_id);
CREATE INDEX idx_offers_proposer_id ON public.offers USING btree (proposer_id);

CREATE TABLE public.billing_settings (
  id boolean NOT NULL DEFAULT true,
  legal_name text NOT NULL DEFAULT 'Ticket Safe'::text,
  legal_form text NOT NULL DEFAULT 'Société par actions simplifiée (SAS)'::text,
  share_capital_cents integer NOT NULL DEFAULT 100000,
  siren text NOT NULL DEFAULT '105533632'::text,
  rcs_city text NOT NULL DEFAULT 'Paris'::text,
  rcs_full_label text NOT NULL DEFAULT '105 533 632 R.C.S. Paris'::text,
  euid text DEFAULT 'FR7501.105533632'::text,
  address_line1 text NOT NULL DEFAULT '2 rue Wilhem'::text,
  postal_code text NOT NULL DEFAULT '75016'::text,
  city text NOT NULL DEFAULT 'Paris'::text,
  country text NOT NULL DEFAULT 'France'::text,
  support_email text NOT NULL DEFAULT 'ticketsafe.friendly@gmail.com'::text,
  vat_exempt boolean NOT NULL DEFAULT true,
  vat_number text,
  vat_exempt_mention text NOT NULL DEFAULT 'TVA non applicable, article 293 B du Code général des impôts.'::text,
  vat_rate_bps integer NOT NULL DEFAULT 2000,
  late_payment_penalty_mention text NOT NULL DEFAULT 'En cas de retard de paiement, des pénalités de retard sont exigibles.'::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  stripe_payout_delay_days integer NOT NULL DEFAULT 0,
  refund_application_fee_on_refund boolean NOT NULL DEFAULT true,
  vat_regime_confirmed_at timestamp with time zone,
  vat_on_debits boolean NOT NULL DEFAULT false,
  CONSTRAINT billing_settings_pkey PRIMARY KEY (id),
  CONSTRAINT billing_settings_id_check CHECK (id)
);

CREATE TABLE public.seller_payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  gross_cents integer,
  fee_cents integer,
  currency text NOT NULL DEFAULT 'EUR'::text,
  status text NOT NULL DEFAULT 'requested'::text,
  iban_used text NOT NULL,
  iban_holder_used text NOT NULL,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  sent_at timestamp with time zone,
  failure_reason text,
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  batch_id text,
  revolut_transfer_id text,
  revolut_counterparty_id text,
  revolut_state text,
  CONSTRAINT seller_payouts_pkey PRIMARY KEY (id),
  CONSTRAINT seller_payouts_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT seller_payouts_amount_cents_check CHECK ((amount_cents > 0)),
  CONSTRAINT seller_payouts_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);

CREATE TABLE public.organizer_payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'EUR'::text,
  status text NOT NULL DEFAULT 'requested'::text,
  iban_used text NOT NULL,
  iban_holder_used text NOT NULL,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  sent_at timestamp with time zone,
  failure_reason text,
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  gross_cents integer,
  fee_cents integer,
  batch_id text,
  revolut_transfer_id text,
  revolut_counterparty_id text,
  revolut_state text,
  CONSTRAINT organizer_payouts_pkey PRIMARY KEY (id),
  CONSTRAINT organizer_payouts_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES organizer_profiles(id) ON DELETE CASCADE,
  CONSTRAINT organizer_payouts_amount_cents_check CHECK ((amount_cents > 0)),
  CONSTRAINT organizer_payouts_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);

CREATE TABLE public.stripe_webhook_events (
  event_id text NOT NULL,
  event_type text NOT NULL,
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (event_id)
);

-- ── Other production functions the resale paths use ─────────────────────────
CREATE OR REPLACE FUNCTION public.seller_public_stats(p_seller_id uuid)
 RETURNS TABLE(full_name text, university text, campus text, member_since timestamp with time zone, completed_sales integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.full_name,
    p.university,
    p.campus,
    p.created_at,
    coalesce((
      select count(*)::int
      from public.transactions t
      where t.seller_id = p_seller_id
        and t.status = 'completed'
    ), 0)
  from public.profiles p
  where p.id = p_seller_id
    and p.deleted_at is null;
$function$;
REVOKE ALL ON FUNCTION public.seller_public_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_public_stats(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_resale_commission_cents(p_price_cents integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT GREATEST(0, ROUND(p_price_cents * 0.05)::integer);
$function$;

-- ── RLS (production: FORCE on profiles, tickets, transactions) ──────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- ── Policies (verbatim from pg_policies) ────────────────────────────────────
-- conversations
CREATE POLICY "Buyers can create conversations" ON public.conversations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((( SELECT auth.uid() AS uid) = buyer_id));
CREATE POLICY "Users see own conversations" ON public.conversations AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.uid() AS uid) = buyer_id) OR (( SELECT auth.uid() AS uid) = seller_id)));

-- event_orders
CREATE POLICY event_orders_admin_select ON public.event_orders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY event_orders_select_buyer ON public.event_orders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((buyer_id = auth.uid()));
CREATE POLICY event_orders_select_organizer ON public.event_orders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM organizer_profiles op WHERE ((op.id = event_orders.organizer_id) AND (op.user_id = auth.uid())))));

-- event_tickets
CREATE POLICY event_tickets_admin_select ON public.event_tickets AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY event_tickets_select_buyer ON public.event_tickets AS PERMISSIVE FOR SELECT TO authenticated
  USING ((buyer_id = auth.uid()));
CREATE POLICY event_tickets_select_organizer ON public.event_tickets AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM (events e JOIN organizer_profiles op ON ((op.id = e.organizer_id)))
    WHERE ((e.id = event_tickets.event_id) AND (op.user_id = auth.uid()) AND (op.status = 'approved'::text)))));

-- event_tiers
CREATE POLICY event_tiers_organizer_all ON public.event_tiers AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1 FROM (events e JOIN organizer_profiles op ON ((op.id = e.organizer_id)))
    WHERE ((e.id = event_tiers.event_id) AND (op.user_id = auth.uid()) AND (op.status = 'approved'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM (events e JOIN organizer_profiles op ON ((op.id = e.organizer_id)))
    WHERE ((e.id = event_tiers.event_id) AND (op.user_id = auth.uid()) AND (op.status = 'approved'::text)))));
CREATE POLICY event_tiers_select_public_published ON public.event_tiers AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING ((EXISTS ( SELECT 1 FROM events WHERE ((events.id = event_tiers.event_id) AND (events.status = 'published'::text) AND (events.is_active = true)))));

-- events
CREATE POLICY "Admins can delete events" ON public.events AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "Admins can insert events" ON public.events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "Admins can read all events" ON public.events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "Admins can update events" ON public.events AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "Public can read active events" ON public.events AS PERMISSIVE FOR SELECT TO public
  USING (((is_active = true) AND (status = 'published'::text)));
CREATE POLICY events_organizer_manage ON public.events AS PERMISSIVE FOR ALL TO authenticated
  USING (((organizer_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM organizer_profiles op
    WHERE ((op.id = events.organizer_id) AND (op.user_id = auth.uid()) AND (op.status = 'approved'::text))))))
  WITH CHECK (((organizer_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM organizer_profiles op
    WHERE ((op.id = events.organizer_id) AND (op.user_id = auth.uid()) AND (op.status = 'approved'::text))))));

-- offers
CREATE POLICY "Participants can update offers" ON public.offers AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1 FROM conversations c WHERE ((c.id = offers.conversation_id) AND ((c.buyer_id = ( SELECT auth.uid() AS uid)) OR (c.seller_id = ( SELECT auth.uid() AS uid)))))))
  WITH CHECK (((( SELECT auth.uid() AS uid) = proposer_id) AND (status = 'expired'::offer_status)) OR ((( SELECT auth.uid() AS uid) <> proposer_id) AND (status = ANY (ARRAY['accepted'::offer_status, 'rejected'::offer_status]))));
CREATE POLICY "Users create offers in own conversations" ON public.offers AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((( SELECT auth.uid() AS uid) = proposer_id) AND (EXISTS ( SELECT 1 FROM conversations c WHERE ((c.id = offers.conversation_id) AND ((c.buyer_id = ( SELECT auth.uid() AS uid)) OR (c.seller_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "Users see offers in own conversations" ON public.offers AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1 FROM conversations c WHERE ((c.id = offers.conversation_id) AND ((c.buyer_id = ( SELECT auth.uid() AS uid)) OR (c.seller_id = ( SELECT auth.uid() AS uid)))))));

-- organizer_payouts
CREATE POLICY org_payouts_admin_select ON public.organizer_payouts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY org_payouts_owner_select ON public.organizer_payouts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((organizer_id IN ( SELECT organizer_profiles.id FROM organizer_profiles WHERE (organizer_profiles.user_id = auth.uid()))));

-- organizer_profiles
CREATE POLICY organizer_profiles_admin_all ON public.organizer_profiles AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY organizer_profiles_select_own ON public.organizer_profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY organizer_profiles_select_public_approved ON public.organizer_profiles AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING ((status = 'approved'::text));

-- profiles (own row only)
CREATE POLICY "Users can read own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));

-- seller_payouts
CREATE POLICY seller_payouts_admin_select ON public.seller_payouts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY seller_payouts_owner_select ON public.seller_payouts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((seller_id = auth.uid()));

-- tickets
CREATE POLICY "Sellers and admins can update tickets" ON public.tickets AS PERMISSIVE FOR UPDATE TO public
  USING (((( SELECT auth.uid() AS uid) = seller_id) OR (EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = 'admin'::app_role))))));
CREATE POLICY "Sellers can delete their own tickets" ON public.tickets AS PERMISSIVE FOR DELETE TO public
  USING (((( SELECT auth.uid() AS uid) = seller_id) AND (status = 'available'::text)));
CREATE POLICY "Sellers can insert own tickets" ON public.tickets AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((( SELECT auth.uid() AS uid) = seller_id));
CREATE POLICY "Tickets visible to involved parties or when available" ON public.tickets AS PERMISSIVE FOR SELECT TO public
  USING ((((status = 'available'::text) AND (verification_status = 'verified'::text)) OR (auth.uid() = seller_id)
    OR (EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role))))
    OR (EXISTS ( SELECT 1 FROM conversations c WHERE ((c.ticket_id = tickets.id) AND (c.buyer_id = auth.uid()))))
    OR (EXISTS ( SELECT 1 FROM transactions t WHERE ((t.ticket_id = tickets.id) AND (t.buyer_id = auth.uid()))))));
CREATE POLICY admins_select_all_tickets ON public.tickets AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY admins_update_tickets ON public.tickets AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));

-- transactions
CREATE POLICY "Participants can read own transactions" ON public.transactions AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.uid() AS uid) = buyer_id) OR (( SELECT auth.uid() AS uid) = seller_id)));
CREATE POLICY transactions_admin_select ON public.transactions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));

-- user_roles
CREATE POLICY "Users can read own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid() AS uid) = user_id));

-- ── Views, as in production before 20261104120000 ────────────────────────────
-- Definer (no reloptions), owner postgres:
CREATE VIEW public.available_tickets_public AS
SELECT id, event_id, seller_id, status, selling_price, quantity, notes,
       qr_verified, needs_review, verification_errors, created_at, updated_at
FROM public.tickets
WHERE status = 'available' AND verification_status = 'verified';

CREATE VIEW public.conversation_participant_names AS
 SELECT c.id AS conversation_id,
    pb.full_name AS buyer_name,
    ps.full_name AS seller_name
   FROM conversations c
     JOIN profiles pb ON pb.id = c.buyer_id
     JOIN profiles ps ON ps.id = c.seller_id
  WHERE c.buyer_id = (( SELECT auth.uid() AS uid)) OR c.seller_id = (( SELECT auth.uid() AS uid));

-- security_invoker = on:
CREATE VIEW public.events_with_active_tickets WITH (security_invoker = on) AS
 SELECT e.id, e.title, e.date, e.location, e.category, e.university, e.campus, e.image_url, e.base_price,
    e.external_source, e.external_event_id, e.needs_review,
    count(t.id)::integer AS ticket_count,
    min(t.selling_price) AS min_price,
    max(t.selling_price) AS max_price
   FROM events e
     JOIN tickets t ON t.event_id = e.id AND t.status = 'available'::text
  WHERE e.is_active = true
  GROUP BY e.id
  ORDER BY e.date;

CREATE VIEW public.organizer_earnings WITH (security_invoker = on) AS
 WITH revenue AS (
         SELECT o.id AS organizer_id,
            COALESCE(sum(eo.total_cents - COALESCE(eo.fee_cents, 0)) FILTER (WHERE eo.status = 'paid'::text), 0::bigint)::integer AS net_earned_cents,
            COALESCE(sum(eo.total_cents) FILTER (WHERE eo.status = 'paid'::text), 0::bigint)::integer AS gross_cents,
            COALESCE(sum(COALESCE(eo.fee_cents, 0)) FILTER (WHERE eo.status = 'paid'::text), 0::bigint)::integer AS platform_fee_cents,
            COALESCE(count(eo.id) FILTER (WHERE eo.status = 'paid'::text), 0::bigint)::integer AS paid_orders
           FROM organizer_profiles o
             LEFT JOIN events e ON e.organizer_id = o.id
             LEFT JOIN event_orders eo ON eo.event_id = e.id
          GROUP BY o.id
        ), withdrawn AS (
         SELECT organizer_payouts.organizer_id,
            COALESCE(sum(COALESCE(organizer_payouts.gross_cents, organizer_payouts.amount_cents)), 0::bigint)::integer AS claimed_cents
           FROM organizer_payouts
          WHERE organizer_payouts.status = ANY (ARRAY['requested'::text, 'processing'::text, 'sent'::text])
          GROUP BY organizer_payouts.organizer_id
        )
 SELECT r.organizer_id, r.net_earned_cents, r.gross_cents, r.platform_fee_cents, r.paid_orders,
    COALESCE(w.claimed_cents, 0) AS claimed_cents,
    GREATEST(r.net_earned_cents - COALESCE(w.claimed_cents, 0), 0) AS available_cents
   FROM revenue r
     LEFT JOIN withdrawn w ON w.organizer_id = r.organizer_id;

CREATE VIEW public.tier_inventory WITH (security_invoker = on) AS
 SELECT et.id AS tier_id, et.event_id, et.name, et.description, et.price_cents, et.currency,
    et.total_qty, et.sold_qty, et.reserved_qty,
    GREATEST(et.total_qty - et.sold_qty - et.reserved_qty, 0) AS available_qty,
    et.sort_order, et.is_active
   FROM event_tiers et
     JOIN events e ON e.id = et.event_id
  WHERE e.status = 'published'::text AND e.is_active = true;

CREATE VIEW public.seller_earnings WITH (security_invoker = on) AS
 WITH revenue AS (
         SELECT t.seller_id,
            COALESCE(sum(t.amount - COALESCE(t.fee_amount, 0::numeric)) FILTER (WHERE t.status = 'completed'::transaction_status), 0::numeric) AS net_earned_eur,
            COALESCE(sum(t.amount) FILTER (WHERE t.status = 'completed'::transaction_status), 0::numeric) AS gross_eur,
            COALESCE(sum(COALESCE(t.fee_amount, 0::numeric)) FILTER (WHERE t.status = 'completed'::transaction_status), 0::numeric) AS platform_fee_eur,
            COALESCE(count(t.id) FILTER (WHERE t.status = 'completed'::transaction_status), 0::bigint)::integer AS completed_sales
           FROM transactions t
          WHERE t.stripe_checkout_session_id IS NULL OR t.stripe_checkout_session_id !~~ 'cs\_%'::text
          GROUP BY t.seller_id
        ), withdrawn AS (
         SELECT seller_payouts.seller_id,
            COALESCE(sum(COALESCE(seller_payouts.gross_cents, seller_payouts.amount_cents)), 0::bigint)::integer AS claimed_cents
           FROM seller_payouts
          WHERE seller_payouts.status = ANY (ARRAY['requested'::text, 'processing'::text, 'sent'::text])
          GROUP BY seller_payouts.seller_id
        )
 SELECT r.seller_id,
    round(r.net_earned_eur * 100::numeric)::integer AS net_earned_cents,
    round(r.gross_eur * 100::numeric)::integer AS gross_cents,
    round(r.platform_fee_eur * 100::numeric)::integer AS platform_fee_cents,
    r.completed_sales,
    COALESCE(w.claimed_cents, 0) AS claimed_cents,
    GREATEST(round(r.net_earned_eur * 100::numeric)::integer - COALESCE(w.claimed_cents, 0), 0) AS available_cents
   FROM revenue r
     LEFT JOIN withdrawn w ON w.seller_id = r.seller_id;

-- ── Grants (production: ALL on every table and view for anon, authenticated,
-- service_role; conversation_participant_names: no anon) ─────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
REVOKE ALL ON public.conversation_participant_names FROM PUBLIC, anon;

-- ── Test helpers (schema tests) ──────────────────────────────────────────────
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;

-- Named ids for the seed, so the test files read L1 / S / E1 instead of uuids.
CREATE TABLE tests.ids (name text PRIMARY KEY, id uuid NOT NULL UNIQUE);
GRANT SELECT ON tests.ids TO anon, authenticated, service_role;
CREATE FUNCTION tests.id(p_name text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM tests.ids WHERE name = p_name
$$;

-- Every check prints "ok - <name>" or raises "not ok - <name>".
CREATE FUNCTION tests.ok(p_cond boolean, p_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS NOT TRUE THEN
    RAISE EXCEPTION 'not ok - %', p_name;
  END IF;
  RAISE NOTICE 'ok - %', p_name;
END $$;
CREATE FUNCTION tests.assert(p_cond boolean, p_name text) RETURNS void LANGUAGE sql AS $$
  SELECT tests.ok(p_cond, p_name)
$$;

-- Runs p_sql as the current role; passes only when it fails with 42501
-- (insufficient_privilege: a missing grant, or a row-level security WITH CHECK
-- rejection, which uses the same code).
CREATE FUNCTION tests.expect_denied(p_sql text, p_name text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'ok - %', coalesce(p_name, 'denied (42501): ' || p_sql);
      RETURN;
    WHEN OTHERS THEN
      RAISE EXCEPTION 'not ok - % (expected 42501, got % %)', coalesce(p_name, p_sql), SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'not ok - % (expected permission denied, statement succeeded)', coalesce(p_name, p_sql);
END $$;

-- Runs p_sql; passes only when it fails and the message matches p_like.
CREATE FUNCTION tests.expect_error(p_sql text, p_like text, p_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN
      RAISE NOTICE 'ok - %', p_name;
      RETURN;
    END IF;
    RAISE EXCEPTION 'not ok - % (expected error like %, got % %)', p_name, p_like, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'not ok - % (expected an error, statement succeeded)', p_name;
END $$;

-- Runs a write and returns the number of rows it affected.
CREATE FUNCTION tests.affected(p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Acts as a signed-in user (NULL = anon), the way PostgREST sets the JWT.
CREATE FUNCTION tests.as_user(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '{"role":"anon"}' ELSE json_build_object('sub', p_uid, 'role', 'authenticated')::text END,
    false);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- ── Seed ─────────────────────────────────────────────────────────────────────
INSERT INTO tests.ids (name, id) VALUES
  ('S',   'cccccccc-0000-0000-0000-000000000001'),  -- seller
  ('B1',  'cccccccc-0000-0000-0000-000000000002'),  -- buyer 1
  ('B2',  'cccccccc-0000-0000-0000-000000000003'),  -- buyer 2
  ('A',   'cccccccc-0000-0000-0000-000000000004'),  -- admin
  ('ORG', 'cccccccc-0000-0000-0000-000000000005'),  -- organizer user
  ('OP',  'cccccccc-0000-0000-0000-0000000000f1'),  -- organizer profile
  ('E1',  'eeeeeeee-0000-0000-0000-000000000001'),  -- published, open, Studio
  ('E2',  'eeeeeeee-0000-0000-0000-000000000002'),  -- published, ended
  ('E3',  'eeeeeeee-0000-0000-0000-000000000003'),  -- draft
  ('E4',  'eeeeeeee-0000-0000-0000-000000000004'),  -- published, open, outside Studio
  ('T1',  'dddddddd-0000-0000-0000-000000000001'),  -- E1 tier
  ('O1',  'bbbbbbbb-0000-0000-0000-000000000001'),  -- S's order on E1
  ('ET1', 'ffffffff-0000-0000-0000-000000000001'),  -- S's Studio tickets on E1
  ('ET2', 'ffffffff-0000-0000-0000-000000000002'),
  ('ET3', 'ffffffff-0000-0000-0000-000000000003'),
  ('ET4', 'ffffffff-0000-0000-0000-000000000004'),
  ('L1',  'aaaaaaaa-0000-0000-0000-000000000001'),  -- available, verified, Studio, qty 1
  ('L2',  'aaaaaaaa-0000-0000-0000-000000000002'),  -- available, verified, qty 2, cheaper
  ('L3',  'aaaaaaaa-0000-0000-0000-000000000003'),  -- pending verification
  ('L4',  'aaaaaaaa-0000-0000-0000-000000000004'),  -- sold
  ('L5',  'aaaaaaaa-0000-0000-0000-000000000005'),  -- cancelled
  ('L6',  'aaaaaaaa-0000-0000-0000-000000000006'),  -- on ended E2
  ('L7',  'aaaaaaaa-0000-0000-0000-000000000007'),  -- on draft E3
  ('L8',  'aaaaaaaa-0000-0000-0000-000000000008'),  -- reserved, expired (old pending tx)
  ('L10', 'aaaaaaaa-0000-0000-0000-000000000010'),  -- reserved, no pending tx (backfill frees it)
  ('TX8', 'abababab-0000-0000-0000-000000000008'),  -- L8's old pending tx
  ('TX4', 'abababab-0000-0000-0000-000000000004'),  -- L4's completed sale
  ('C1',  '0c0c0c0c-0000-0000-0000-000000000001'),  -- B1 <-> S on L2
  ('C2',  '0c0c0c0c-0000-0000-0000-000000000002');  -- B2 <-> S on L2

INSERT INTO auth.users (id, email) SELECT id, lower(name) || '@example.invalid' FROM tests.ids WHERE name IN ('S','B1','B2','A','ORG');
INSERT INTO public.profiles (id, email, full_name, university, campus) VALUES
  (tests.id('S'),   's@example.invalid',   'Sam Seller',        'ESCP', 'Paris'),
  (tests.id('B1'),  'b1@example.invalid',  '  Alice  Marie Buyer ', NULL, NULL),
  (tests.id('B2'),  'b2@example.invalid',  'Bob',               NULL, NULL),
  (tests.id('A'),   'a@example.invalid',   'Ada Admin',         NULL, NULL),
  (tests.id('ORG'), 'org@example.invalid', 'Olga Organizer',    NULL, NULL);
INSERT INTO public.user_roles (user_id, role) VALUES (tests.id('A'), 'admin');
INSERT INTO public.organizer_profiles (id, user_id, name, slug, org_type, contact_name, contact_email, status)
VALUES (tests.id('OP'), tests.id('ORG'), 'Test BDE', 'test-bde', 'bde', 'Olga', 'org@example.invalid', 'approved');
INSERT INTO public.billing_settings (id) VALUES (true);

INSERT INTO public.events (id, title, slug, date, ends_at, location, category, university, campus, status, is_active, organizer_id, sold_via_studio, base_price, banner_url, video_url) VALUES
  (tests.id('E1'), 'Studio Gala',  'studio-gala',  now() + interval '7 days', now() + interval '7 days 6 hours', 'Paris', 'party', 'ESCP', 'Paris', 'published', true, tests.id('OP'), true, 30, 'https://example.invalid/b1.jpg', NULL),
  (tests.id('E2'), 'Past Party',   'past-party',   now() - interval '3 days', NULL,                              'Paris', 'party', 'ESCP', 'Paris', 'published', true, NULL, false, 20, NULL, NULL),
  (tests.id('E3'), 'Draft Event',  'draft-event',  now() + interval '9 days', NULL,                              'Lyon',  'party', NULL,   NULL,    'draft',     true, NULL, false, 15, NULL, NULL),
  (tests.id('E4'), 'Outside Gig',  'outside-gig',  now() + interval '5 days', NULL,                              'Lille', 'concert', 'EDHEC', 'Lille', 'published', true, NULL, false, 25, NULL, 'https://example.invalid/v4.mp4');
INSERT INTO public.event_tiers (id, event_id, name, price_cents, currency, total_qty, sold_qty)
VALUES (tests.id('T1'), tests.id('E1'), 'Early Bird', 3000, 'EUR', 100, 4);
INSERT INTO public.event_orders (id, event_id, tier_id, organizer_id, buyer_id, quantity, unit_price_cents, total_cents, status, buyer_email, paid_at)
VALUES (tests.id('O1'), tests.id('E1'), tests.id('T1'), tests.id('OP'), tests.id('S'), 4, 3000, 12000, 'paid', 's@example.invalid', now());
INSERT INTO public.event_tickets (id, order_id, event_id, tier_id, buyer_id, qr_token, holder_first_name, holder_last_name, holder_email)
SELECT tests.id(n), tests.id('O1'), tests.id('E1'), tests.id('T1'), tests.id('S'), 'qr-' || lower(n), 'Sam', 'Seller', 's@example.invalid'
FROM unnest(ARRAY['ET1','ET2','ET3','ET4']) n;

INSERT INTO public.tickets (id, event_id, seller_id, status, verification_status, selling_price, quantity, notes, qr_hash, file_url, studio_ticket_id, verification_errors, qr_verified, photo_url) VALUES
  (tests.id('L1'),  tests.id('E1'), tests.id('S'), 'available', 'verified', 25.00, 1, 'call me 0600000000', 'studio:' || tests.id('ET1'), NULL, tests.id('ET1'), NULL, true, 'https://example.invalid/p1.jpg'),
  (tests.id('L2'),  tests.id('E4'), tests.id('S'), 'available', 'verified', 12.00, 2, 'two together',       'hash-l2', 'tickets/l2.pdf', NULL, NULL, true, NULL),
  (tests.id('L3'),  tests.id('E4'), tests.id('S'), 'available', 'pending',  10.00, 1, NULL,                 'hash-l3', 'tickets/l3.pdf', NULL, '{"qr":"unreadable"}', false, NULL),
  (tests.id('L4'),  tests.id('E4'), tests.id('S'), 'sold',      'verified', 15.00, 1, NULL,                 'hash-l4', 'tickets/l4.pdf', NULL, NULL, true, NULL),
  (tests.id('L5'),  tests.id('E4'), tests.id('S'), 'cancelled', 'verified', 16.00, 1, NULL,                 'hash-l5', 'tickets/l5.pdf', NULL, NULL, true, NULL),
  (tests.id('L6'),  tests.id('E2'), tests.id('S'), 'available', 'verified', 11.00, 1, NULL,                 'hash-l6', 'tickets/l6.pdf', NULL, NULL, true, NULL),
  (tests.id('L7'),  tests.id('E3'), tests.id('S'), 'available', 'verified', 9.00,  1, NULL,                 'hash-l7', 'tickets/l7.pdf', NULL, NULL, true, NULL),
  (tests.id('L8'),  tests.id('E4'), tests.id('S'), 'reserved',  'verified', 30.00, 1, NULL,                 'hash-l8', 'tickets/l8.pdf', NULL, NULL, true, NULL),
  (tests.id('L10'), tests.id('E2'), tests.id('S'), 'reserved',  'verified', 13.00, 1, NULL,                 'hash-l10','tickets/l10.pdf', NULL, NULL, true, NULL);
UPDATE public.tickets SET buyer_id = tests.id('B2') WHERE id = tests.id('L4');
UPDATE public.tickets SET boosted_until = now() + interval '1 day' WHERE id = tests.id('L2');
UPDATE public.tickets SET created_at = now() - interval '2 days' WHERE id = tests.id('L8');

INSERT INTO public.transactions (id, ticket_id, buyer_id, seller_id, amount, fee_amount, quantity, status, created_at, payment_intent_id) VALUES
  (tests.id('TX8'), tests.id('L8'), tests.id('B2'), tests.id('S'), 31.50, 1.50, 1, 'pending',   now() - interval '2 hours', NULL),
  (tests.id('TX4'), tests.id('L4'), tests.id('B2'), tests.id('S'), 15.75, 0.75, 1, 'completed', now() - interval '1 day',   'pi_l4');

INSERT INTO public.conversations (id, ticket_id, buyer_id, seller_id) VALUES
  (tests.id('C1'), tests.id('L2'), tests.id('B1'), tests.id('S')),
  (tests.id('C2'), tests.id('L2'), tests.id('B2'), tests.id('S'));

RESET client_min_messages;
