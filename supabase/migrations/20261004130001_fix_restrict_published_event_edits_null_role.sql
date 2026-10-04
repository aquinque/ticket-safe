-- Follow-up fix for restrict_published_event_updates() (20261004130000).
--
-- Found during testing: a direct Postgres connection with no JWT context at
-- all (e.g. `supabase db query`, a migration, any backend script connecting
-- with the Postgres connection string rather than through PostgREST) has
-- auth.role() = NULL, not 'service_role'. The trigger fired for these
-- too and blocked a routine data fix — BEFORE UPDATE triggers run
-- regardless of RLS/BYPASSRLS, so this was never caught by the earlier
-- audit (which only looked at application code paths, not raw DB access).
--
-- Fix: also exempt a NULL auth.role() (no JWT context = infrastructure-level
-- access, trusted by definition, same as service_role).

CREATE OR REPLACE FUNCTION public.restrict_published_event_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM 'published' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Cannot change a published event''s status directly to %. Use the dedicated cancel flow instead.', NEW.status
      USING ERRCODE = '42501';
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title
    OR NEW.date IS DISTINCT FROM OLD.date
    OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
    OR NEW.base_price IS DISTINCT FROM OLD.base_price
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.organizer_id IS DISTINCT FROM OLD.organizer_id
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.video_url IS DISTINCT FROM OLD.video_url
    OR NEW.logo_url IS DISTINCT FROM OLD.logo_url
    OR NEW.primary_color IS DISTINCT FROM OLD.primary_color
    OR NEW.gallery_urls IS DISTINCT FROM OLD.gallery_urls
  THEN
    RAISE EXCEPTION 'Only description, banner image, and location can be edited on a published event.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
