import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import EventCard, { EventCardSkeleton } from "@/components/EventCard";
import { HomeCta } from "@/components/home/HomeCta";
import { HOME_COPY } from "@/content/home";
import { MAX_EVENTS_SHOWN, hasEnoughEvents } from "@/lib/homePage";
import { toEventData, type PublishedEvent } from "@/lib/publishedEvents";

interface UpcomingEventsProps {
  events: PublishedEvent[];
  loading: boolean;
  eventsHref: string;
  studioHref: string;
}

/**
 * The next published events as poster cards, under the hero: every one there is, as soon as there is one. Only
 * while none exists does it say "coming soon" and offer the organizer button instead, so the page never presents
 * an empty shelf. No city filter on purpose.
 */
export function UpcomingEvents({ events, loading, eventsHref, studioHref }: UpcomingEventsProps) {
  const navigate = useNavigate();
  const copy = HOME_COPY.events;

  if (!loading && !hasEnoughEvents(events.length)) {
    return (
      <section aria-labelledby="events-title" className="container mx-auto px-4 py-14 md:py-20">
        <div className="max-w-2xl">
          <h2 id="events-title" className="text-3xl font-bold leading-tight text-foreground md:text-4xl">
            {copy.soon.title}
          </h2>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">{copy.soon.body}</p>
          <div className="mt-6">
            <HomeCta cta={copy.soon.cta} href={studioHref} />
          </div>
        </div>
      </section>
    );
  }

  const slugById = new Map(events.map((e) => [e.id, e.slug]));
  const shown = events.slice(0, MAX_EVENTS_SHOWN);
  // One event: a full-width poster on a phone, one of three columns on a desktop. Several: two across on a phone,
  // three or four across on a desktop (four while the skeletons show).
  const count = loading ? MAX_EVENTS_SHOWN : shown.length;
  const columns =
    count === 1 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : count <= 3 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-4";

  return (
    <section aria-labelledby="events-title" className="container mx-auto px-4 py-14 md:py-20">
      <div className="flex items-end justify-between gap-4">
        <h2 id="events-title" className="text-3xl font-bold leading-tight text-foreground md:text-4xl">
          {copy.title}
        </h2>
        <Link
          to={eventsHref}
          className="inline-flex shrink-0 items-center gap-1.5 pb-1 text-sm font-semibold text-foreground underline-offset-4 hover:underline md:text-base"
        >
          {copy.seeAll}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className={`mt-8 grid gap-3 md:gap-4 ${columns}`}>
        {loading
          ? Array.from({ length: MAX_EVENTS_SHOWN }).map((_, i) => <EventCardSkeleton key={i} />)
          : shown.map((event) => (
              <EventCard
                key={event.id}
                event={toEventData(event)}
                onClick={() => navigate(slugById.get(event.id) ? `/e/${slugById.get(event.id)}` : eventsHref)}
              />
            ))}
      </div>
    </section>
  );
}
