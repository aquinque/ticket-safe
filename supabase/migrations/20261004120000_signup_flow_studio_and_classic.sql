-- Signup overhaul.
--
-- 1. TicketSafe signup no longer asks for a school or a school email.
--    profiles gets first_name / last_name / gender. university and
--    university_email become nullable (columns are kept so existing rows and
--    older code keep working).
-- 2. The ESCP-only gate on auth.users is removed. Organizer approval stays the
--    control that stops scalpers from selling as organizers: a new organizer
--    row is always created with status 'pending' and an admin must approve it.
-- 3. Studio signups send their organizer details in the auth metadata. The
--    handle_new_user trigger creates the profile and the pending organizer row
--    in the same transaction as the auth user, so signup is all or nothing.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_gender_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check CHECK (gender IS NULL OR gender IN ('female', 'male'));

ALTER TABLE public.profiles
  ALTER COLUMN university DROP NOT NULL,
  ALTER COLUMN university DROP DEFAULT,
  ALTER COLUMN university_email DROP NOT NULL,
  ALTER COLUMN university_email DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_first text := nullif(btrim(meta->>'first_name'), '');
  v_last text := nullif(btrim(meta->>'last_name'), '');
  v_gender text := CASE WHEN meta->>'gender' IN ('female', 'male') THEN meta->>'gender' END;
  v_full text := coalesce(
    nullif(btrim(coalesce(v_first, '') || ' ' || coalesce(v_last, '')), ''),
    btrim(coalesce(meta->>'full_name', ''))
  );
  v_studio jsonb := CASE WHEN meta->>'account_type' = 'studio' THEN meta->'studio' END;
  v_name text;
  v_org_type text;
  v_contact_name text;
  v_contact_email text;
  v_slug_base text;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, gender, university, university_email, campus)
  VALUES (
    NEW.id,
    NEW.email,
    v_full,
    v_first,
    v_last,
    v_gender,
    nullif(btrim(meta->>'university'), ''),
    NULL,
    nullif(btrim(meta->>'campus'), '')
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_studio IS NOT NULL THEN
    v_name := btrim(coalesce(v_studio->>'name', ''));
    IF length(v_name) < 2 OR length(v_name) > 120 THEN
      RAISE EXCEPTION 'Organizer name must be between 2 and 120 characters'
        USING ERRCODE = 'check_violation';
    END IF;

    v_org_type := CASE
      WHEN v_studio->>'org_type' IN ('bde', 'sports', 'alumni', 'conference', 'student-society', 'other')
        THEN v_studio->>'org_type'
      ELSE 'other'
    END;

    v_contact_name := coalesce(nullif(btrim(v_studio->>'contact_name'), ''), nullif(v_full, ''), v_name);
    IF length(v_contact_name) < 2 OR length(v_contact_name) > 120 THEN
      RAISE EXCEPTION 'Contact name must be between 2 and 120 characters'
        USING ERRCODE = 'check_violation';
    END IF;

    v_contact_email := lower(btrim(coalesce(nullif(v_studio->>'contact_email', ''), NEW.email, '')));
    IF length(v_contact_email) < 5 OR length(v_contact_email) > 254 THEN
      RAISE EXCEPTION 'Contact email is invalid'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Slug: readable prefix from the name + a suffix derived from the user id,
    -- so two organizers with the same name never collide.
    v_slug_base := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
    v_slug_base := rtrim(left(v_slug_base, 33), '-');
    IF v_slug_base = '' THEN
      v_slug_base := 'studio';
    END IF;

    INSERT INTO public.organizer_profiles (
      user_id, name, slug, org_type, contact_name, contact_email,
      website, about, primary_color, status
    )
    VALUES (
      NEW.id,
      v_name,
      v_slug_base || '-' || substr(md5(NEW.id::text), 1, 6),
      v_org_type,
      v_contact_name,
      v_contact_email,
      nullif(btrim(v_studio->>'website'), ''),
      nullif(left(btrim(v_studio->>'about'), 2000), ''),
      CASE WHEN v_studio->>'primary_color' ~ '^#[0-9A-Fa-f]{6}$' THEN v_studio->>'primary_color' ELSE '#1E5EFF' END,
      'pending'
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Remove the ESCP-only signup gate. The guest-shadow exemption it had is no
-- longer needed because every signup is open now.
DROP TRIGGER IF EXISTS trg_enforce_escp_signup ON auth.users;
DROP FUNCTION IF EXISTS public.enforce_escp_signup();
