-- Organizer-chosen font for the event description (Ticket Studio).
-- NULL = site default. Values are ids from src/lib/descriptionFonts.ts;
-- validated in the UI, not constrained here, so adding a font never
-- needs a migration. Deliberately NOT in restrict_published_event_updates()'s
-- protected list: changing the description's font on a live event is as
-- harmless as changing the description itself.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description_font text;
