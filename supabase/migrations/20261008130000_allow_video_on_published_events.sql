-- Let organizers add/replace the promo video on a published event, same as
-- the banner image: video_url leaves the protected list of
-- restrict_published_event_updates(). Everything else is unchanged from
-- 20261004130001.
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
    OR NEW.logo_url IS DISTINCT FROM OLD.logo_url
    OR NEW.primary_color IS DISTINCT FROM OLD.primary_color
    OR NEW.gallery_urls IS DISTINCT FROM OLD.gallery_urls
  THEN
    RAISE EXCEPTION 'Only description, banner image, promo video, and location can be edited on a published event.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
