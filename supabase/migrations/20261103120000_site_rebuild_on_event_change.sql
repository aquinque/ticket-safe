-- Link previews: rebuild the site as soon as a published event changes.
--
-- Event pages with their link-preview tags are written at build time
-- (scripts/prerender-event-pages.mjs). The deploy workflow re-checks the event list
-- every 10 minutes; this trigger asks GitHub for a rebuild right away instead, so a
-- link shared just after publishing already shows the event's name, date and picture.
--
-- It needs a GitHub token in Vault, named github_site_dispatch_token (a fine-grained
-- token on aquinque/ticket-safe with "Contents: Read and write"). Without it the
-- trigger does nothing. It never blocks or fails a change to an event.

CREATE OR REPLACE FUNCTION public.request_site_rebuild()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  token text;
BEGIN
  -- Only what a link preview shows, and only for events that are or were public.
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.slug IS NOT DISTINCT FROM OLD.slug
     AND NEW.title IS NOT DISTINCT FROM OLD.title
     AND NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.location IS NOT DISTINCT FROM OLD.location
     AND NEW.banner_url IS NOT DISTINCT FROM OLD.banner_url
     AND NEW.og_image_url IS NOT DISTINCT FROM OLD.og_image_url
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'published'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name = 'github_site_dispatch_token' LIMIT 1;
    IF token IS NULL OR token = '' THEN
      RETURN NEW;
    END IF;
    PERFORM net.http_post(
      url := 'https://api.github.com/repos/aquinque/ticket-safe/dispatches',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || token,
        'Accept', 'application/vnd.github+json',
        'X-GitHub-Api-Version', '2022-11-28',
        'User-Agent', 'ticket-safe-db',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('event_type', 'events-changed', 'client_payload', jsonb_build_object('slug', NEW.slug))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'request_site_rebuild: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.request_site_rebuild() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_request_site_rebuild ON public.events;
CREATE TRIGGER trg_request_site_rebuild
  AFTER INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.request_site_rebuild();
