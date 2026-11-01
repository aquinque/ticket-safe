import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import EventCard, { EventCardSkeleton } from "@/components/EventCard";
import { HomeCta } from "@/components/home/HomeCta";
import type { HomeCopy } from "@/content/home";
import { MAX_EVENTS_SHOWN, hasEnoughEvents, revealDelay } from "@/lib/homePage";
import { toEventData, type PublishedEvent } from "@/lib/publishedEvents";

interface UpcomingEventsProps {
  copy: HomeCopy["evenements"];
  events: PublishedEvent[];
  loading: boolean;
  eventsHref: string;
  studioHref: string;
}

/**
 * The next published events as poster cards. While fewer than three exist it shows "coming soon" and the
 * organizer call to action instead, so the page never presents an empty shelf. No city filter on purpose.
 */
export function UpcomingEvents({ copy, events, loading, eventsHref, studioHref }: UpcomingEventsProps) {
  const navigate = useNavigate();

  if (!loading && !hasEnoughEvents(events.length)) {
    return (
      <div className="max-w-3xl">
        <p data-reveal className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-200 md:text-sm">
          {copy.kicker}
        </p>
        <h2
          id="evenements-title"
          data-reveal
          style={revealDelay(1)}
          className="home-text-shadow mt-3 text-balance text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl xl:text-7xl"
        >
          {copy.soon.title}
        </h2>
        <p data-reveal style={revealDelay(2)} className="home-text-shadow mt-5 max-w-xl text-pretty text-base text-white/85 sm:text-lg lg:text-xl">
          {copy.soon.body}
        </p>
        <div data-reveal style={revealDelay(3)} className="mt-8">
          <HomeCta cta={copy.soon.cta} href={studioHref} tone="brand" />
        </div>
      </div>
    );
  }

  const slugById = new Map(events.map((e) => [e.id, e.slug]));
  const shown = events.slice(0, MAX_EVENTS_SHOWN);

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p data-reveal className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-200 md:text-sm">
            {copy.kicker}
          </p>
          <h2
            id="evenements-title"
            data-reveal
            style={revealDelay(1)}
            className="home-text-shadow mt-3 text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl"
          >
            {copy.title}
          </h2>
        </div>
        <Link
          to={eventsHref}
          data-reveal
          style={revealDelay(2)}
          className="inline-flex shrink-0 items-center gap-1.5 pb-1.5 text-sm font-semibold text-white underline-offset-4 hover:underline md:text-base"
        >
          {copy.seeAll}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div
        data-reveal
        style={revealDelay(2)}
        className={`mt-8 grid grid-cols-2 gap-3 md:gap-4 ${events.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
      >
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
    </>
  );
}
