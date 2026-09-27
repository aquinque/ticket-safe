ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS banner_fit TEXT NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.events
  ADD CONSTRAINT events_banner_fit_check CHECK (banner_fit IN ('cover', 'contain'));

COMMENT ON COLUMN public.events.banner_fit IS 'How the banner photo is displayed on the public event page: cover (cropped to fill) or contain (whole photo shown, letterboxed with a blurred backdrop).';
COMMENT ON COLUMN public.events.gallery_urls IS 'Extra photos organizers can add below the main event details on the public event page.';
