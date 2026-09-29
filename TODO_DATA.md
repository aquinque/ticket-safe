# TODO — data & assets needed (redesign/night-studio)

Tracks anything a phase needed but couldn't get from existing Supabase
tables/hooks or existing assets, per the brief's instruction not to invent
new tables/queries without asking. Updated as phases land.

## Visuals

- **Hero background** (Phase 3, `src/pages/Home.tsx`): no real photo/video
  yet. Currently a CSS gradient placeholder over `#07091A`. Expected
  location once supplied: `public/hero/` (e.g. `public/hero/home.jpg` or
  `.mp4`, spec caps video at 2MB with an image fallback on mobile).
- **Studio dashboard screenshot** (Phase 3, organizers section on Home):
  currently a built CSS/SVG mockup (fake bar chart + KPI tiles), not a real
  screenshot. Swap in `public/hero/studio-dashboard.png` (or similar) once
  available.
- **Partner logos** (Phase 3, `src/config/partnerLogos.ts`): array is empty
  on purpose — the social-proof row hides itself until real logo files
  (EBS, BDE ESCP, etc.) are dropped in and listed there.

## Data

- **"Active campuses" counter** (Phase 3, Home social-proof section): no
  live query for this exists yet, so the counter stays hidden (the section
  only shows counters with a real value). Would need a real source —
  either a manual constant you maintain, or a query grouping `events.university`
  distinct values, whichever you'd rather have.
- **Test event "BDE TEST / escp test"**: **left as-is, on purpose** — kept
  live so the new design can be checked against a real(-ish) event instead
  of only empty states. No filter added. Revisit later if you want it gone
  or want a reusable `is_test` flag instead of a manual deactivate.

## Known duplication to resolve

- `src/pages/Tickets.tsx` defines its **own local** `EventCard`/
  `EventCardSkeleton` (different data shape: `bannerUrl`/`logoUrl`/`campus`/
  `capacity`/`slug`), separate from the shared poster `EventCard` built in
  Phase 2. Left alone in Phase 2/3; Phase 4 (rebuilding `/tickets`) is
  where I'll consolidate it onto the shared component.
