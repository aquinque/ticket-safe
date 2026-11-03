/**
 * The one link to share an event. https://ticket-safe.eu/e/<slug> is a real page built
 * for each published event (scripts/prerender-event-pages.mjs): link-preview crawlers
 * read its title, date, place and picture, and people land on the event page itself,
 * with ?ref=<code> kept for promoter tracking.
 */
export const SHARE_SITE = "https://ticket-safe.eu";

export const eventShareUrl = (slug: string, ref?: string | null): string =>
  `${SHARE_SITE}/e/${encodeURIComponent(slug)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
