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

## Phase 5 — Studio

- **Sidebar nav items with no dedicated screen**: "Ventes" and "Équipe /
  Vendeurs" are shown in `StudioLayout`'s sidebar marked "Bientôt"
  (disabled, not a fake empty page) — no table/query backs either yet.
  "Ventes" could probably reuse the new dashboard sales-by-day query plus
  a per-event breakdown; "Équipe / Vendeurs" would need a real
  organizer-team/roles model that doesn't exist in the schema today.
- **"Paiements" nav item** links to `/studio` (where the existing payout
  banner/modal lives) rather than a dedicated `/studio/payouts` page —
  there wasn't one before this redesign either.
- **Daily sales chart** (`StudioDashboard.tsx`): added a real (not
  invented) query — `event_orders` filtered by `organizer_id`/`status=paid`,
  bucketed client-side into the last 14 days. Simple bars, no library
  chart component; fine for now but could move to the `ui/chart.tsx`
  (recharts) wrapper already used in `StudioEventEdit.tsx` if you want
  axes/tooltips.
- **"Billets revendus" KPI**: real count, added via a new read-only query
  (`tickets` table filtered to this organizer's event ids) — same pattern
  as the "Resale available" banner added to the event page in Phase 4.
- **Not rebuilt**: `StudioEventNew.tsx`'s 5-step wizard (Details → Date &
  place → Tickets → Cover & link → Review) with its sticky live
  `EventPreviewCard` **already existed** before this redesign — Phase 5
  only re-themed it (StudioLayout wrapper, `.theme-studio`), it wasn't
  rebuilt from scratch. Same for `StudioEventEdit.tsx`'s existing sales
  chart (recharts) and `StudioEventAttendees.tsx`'s table (search, sort,
  filters, CSV export) — those already met the "dense table" bar, I only
  added a sticky header and `tabular-nums` on amount columns.
- **Not visually verified**: Studio requires an approved-organizer login I
  don't have test credentials for. Build/type-check/lint are clean and the
  unauthenticated `/studio` redirect renders with zero console errors, but
  I couldn't screenshot the actual dashboard/wizard/tables post-login —
  worth a manual spot-check.

## Phase 6 — i18n + finitions

- **i18n system**: kept the existing custom `I18nContext` (not react-i18next
  — a working lib already existed, brief says use it if so). Default
  flipped from EN to **FR** per spec, with browser-language auto-detect
  (falls back to FR). Added full **Spanish** (`src/locales/es.json`,
  ~250 keys translated) and wired `es` through the type system, the
  fallback chain (missing key → FR, not EN, since FR is now the default),
  `HeaderNight`'s language picker (was a binary EN/FR toggle — now a
  3-option dropdown desktop + 3-button row mobile) and `SettingsPanel`'s
  language `<Select>`.
- **Important gap, tested and confirmed by screenshot**: switching
  language correctly translates everything that already went through
  `t()` before this redesign (nav, footer, settings, auth, about, contact,
  sell, profile, trust copy — the full existing ~250-key set). It does
  **not** translate the new copy written during Phases 3-5 — Home's hero/
  sections, the Tickets page intro, Studio's dashboard labels, the cookie
  bar, HeaderNight's own non-nav strings — those are still hardcoded
  (French on Home/Tickets, English elsewhere) regardless of the selected
  language. Fully extracting and translating (×3) every string introduced
  in this redesign is a real, sizeable task I did not attempt to rush;
  flagging it here rather than claiming it's done.
- **OG images**: `SEOHead` already supported per-page dynamic title/
  description/image before this redesign, and `EventPublic.tsx` already
  passed a real per-event image (`og_image_url ?? banner_url ?? organizer
  logo`) — this was already correct, not new work. `public/og-default.svg`
  (the brand fallback for pages without their own image) was already a
  well-made dark brand-blue image using the exact brand-500/700/200 hex —
  left as-is, no changes needed.
- **Accessibility**: `index.html`'s viewport meta already had no
  `user-scalable=no`/`maximum-scale` — pinch-zoom already worked, nothing
  to fix. Computed the night theme's `--muted-foreground` (`228 29% 69%`)
  against `--background` (`234 58% 6%`) by hand: ~8.6:1 contrast, well
  past the 4.5:1 AA bar for normal text. Not exhaustively audited beyond
  that one pairing (the one I was most worried about, muted text being the
  easiest to get wrong on a dark theme).
- **Performance**: added `loading="lazy"` + `decoding="async"` to the
  shared `EventCard`'s poster `<img>` (appears repeatedly in every grid
  across the site). Did not do a full sweep of every `<img>` in every
  touched file, or touch image *formats* (webp/avif) — most images here
  are either external URLs (Unsplash, user uploads to Supabase storage)
  or SVG, not something a frontend-only pass controls format-wise. No
  real hero video exists yet (still the gradient placeholder), so the
  "video hero > 2MB" constraint doesn't currently apply.

## Known duplication to resolve

- ~~`src/pages/Tickets.tsx` local EventCard~~ — **done in Phase 4**:
  consolidated onto the shared poster `EventCard` via a `toEventData`
  adapter, dead per-campus-gradient/per-category-icon maps removed.
- **`src/pages/Marketplace.tsx`** (`/marketplace`, 528 lines) is a *third*
  parallel "browse events" implementation — uses `useESCPEvents` like
  `EventsSection.tsx`/old Home did, separate again from both the shared
  `EventCard` and from `marketplace/Buy.tsx`'s own grouped-listing bento
  grid. `/catalog` redirects here. Not touched in this redesign — it wasn't
  one of the three surfaces the Phase 4 brief named (`/tickets`, the event
  page, "the resale marketplace" = `marketplace/Buy.tsx` at
  `/marketplace/buy`), and I didn't want to guess-expand scope on a page
  that size without checking first. Worth deciding whether it's still
  needed at all, or should redirect to `/tickets` instead.
