-- Defense-in-depth for live-event edits, requested after discovering the
-- *only* thing stopping an organizer from changing price/date/capacity on a
-- published event was a hidden UI form — the existing RLS policy
-- (events_organizer_manage, cmd ALL) already permits an approved organizer
-- to UPDATE any column on their own event regardless of status.
--
-- Scoped to published events only (OLD.status = 'published'); draft events
-- are untouched. service_role is exempt (cancel-event, submit-listing,
-- sync-escp-events all update events as service_role and must keep working
-- unchanged). Separate from, and does not modify,
-- check_organizer_approved_for_event_insert() / its trigger.
--
-- Already-shipped, already-live-editable fields are deliberately NOT
-- blocked, to avoid regressing them: max_tickets_per_buyer (PerBuyerLimitControl,
-- "editable at any status" per its own comment) and og_image_url /
-- seo_description (SocialSharingControl, no disabled gate at all today).
--
-- The one allowed status transition is published -> draft (the existing
-- "Unpublish" button), and only when no other protected field changes in
-- the same statement. Any other status change from 'published' (e.g.
-- straight to 'cancelled') must go through the dedicated cancel-event edge
-- function (service_role, handles refunds) — blocked here so a direct
-- client UPDATE can never silently cancel an event without refunding
-- buyers.
--
-- Admins (user_roles.role = 'admin') are fully exempt, same spirit as the
-- existing "Admins can update events" RLS policy — there's no admin UI that
-- writes to events today, but the ask is to let TicketSafe staff fix any
-- published event's any field if needed, not just description/banner/location.
--
-- Audited (2026-10-04) every UPDATE on public.events in src/ and
-- supabase/functions/: only StudioEventEdit.tsx's publish/unpublish buttons,
-- its draft-only EventDetailsEditor, the new LiveEventDetailsEditor, and
-- submit-listing (service_role) ever write to this table. No is_active
-- "pause sales" toggle exists on events (event_tiers has its own, separate
-- is_active column, untouched by this trigger).

CREATE OR REPLACE FUNCTION public.restrict_published_event_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
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

  -- Protected while published (or while unpublishing in the same statement):
  -- anything that affects already-sold tickets or the event's identity.
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

DROP TRIGGER IF EXISTS trg_restrict_published_event_updates ON public.events;
CREATE TRIGGER trg_restrict_published_event_updates
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_published_event_updates();

REVOKE ALL ON FUNCTION public.restrict_published_event_updates() FROM PUBLIC, anon, authenticated;
