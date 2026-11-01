import { useEffect, useRef, useState } from "react";
import HeaderNight from "@/components/HeaderNight";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { TrustedBy } from "@/components/home/TrustedBy";
import { UpcomingEvents } from "@/components/home/UpcomingEvents";
import { HOME_LINKS, type Cta } from "@/content/home";
import { useNearViewport } from "@/hooks/useNearViewport";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { fetchPublishedEvents, type PublishedEvent } from "@/lib/publishedEvents";

/**
 * The home page: one full-screen hero carousel (three slides, nothing else above the fold), then the upcoming
 * events, then a line of trust, then the site's own footer. Every text, button and media path lives in
 * src/content/home.ts; the files to drop in are listed in public/media/home/README.md.
 */
const Home = () => {
  useThemeMode("night");

  const { organizer } = useOrganizer();

  // An approved organizer goes straight into Ticket Studio, like the "Organizers" link of the header.
  const studioHref = organizer?.status === "approved" ? HOME_LINKS.studioOpen : HOME_LINKS.studio;
  const hrefFor = (cta: Cta) => (cta.target === "events" ? HOME_LINKS.events : studioHref);

  // The events are fetched when their block is within a screen and a half, not on arrival: the first screen has
  // the whole connection to itself.
  const eventsRef = useRef<HTMLDivElement>(null);
  const eventsNear = useNearViewport(eventsRef, "150% 0px");
  const [events, setEvents] = useState<PublishedEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  useEffect(() => {
    if (!eventsNear) return;
    let cancelled = false;
    fetchPublishedEvents()
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch((err) => console.error("[home] events:", err))
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventsNear]);

  return (
    <div className="theme-night min-h-screen flex flex-col bg-background">
      <SEOHead
        title="TicketSafe — Your nights."
        description="Buy tickets directly from your student union, or organization, or resell yours quickly."
      />

      <HeaderNight />

      <main lang="en" className="flex-1">
        <HeroCarousel hrefFor={hrefFor} />
        <div ref={eventsRef}>
          <UpcomingEvents events={events} loading={eventsLoading} eventsHref={HOME_LINKS.events} studioHref={studioHref} />
        </div>
        <TrustedBy />
      </main>

      <Footer />
    </div>
  );
};

export default Home;
