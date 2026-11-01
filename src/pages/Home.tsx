import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import HeaderNight from "@/components/HeaderNight";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { HomeCta } from "@/components/home/HomeCta";
import { HomeSection } from "@/components/home/HomeSection";
import { PlatformCards } from "@/components/home/PlatformCards";
import { SectionText } from "@/components/home/SectionText";
import { SideDots } from "@/components/home/SideDots";
import { TrustedBy } from "@/components/home/TrustedBy";
import { UpcomingEvents } from "@/components/home/UpcomingEvents";
import { HOME_CONTENT, HOME_LINKS, HOME_MEDIA, SECTION_IDS, type Cta, type SectionId } from "@/content/home";
import { useActiveSection, useNearViewport, useRevealOnScroll, useSnapScroll } from "@/hooks/useHomeScroll";
import { useHomeLanguage } from "@/hooks/useHomeLanguage";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeMode } from "@/hooks/useThemeMode";
import { revealDelay } from "@/lib/homePage";
import { fetchPublishedEvents, type PublishedEvent } from "@/lib/publishedEvents";

/**
 * The home page: nine full-screen sections, each with a photo or video behind a few words. Every text, call to
 * action and media path lives in src/content/home.ts; the files to drop in are listed in
 * public/media/home/README.md. The header and footer are the site's own.
 */
const Home = () => {
  useThemeMode("night");
  useSnapScroll();

  const lang = useHomeLanguage();
  const copy = HOME_CONTENT[lang];
  const reducedMotion = useReducedMotion();
  const { organizer } = useOrganizer();
  const mainRef = useRef<HTMLElement>(null);
  const active = useActiveSection(SECTION_IDS);
  useRevealOnScroll(mainRef);

  // An approved organizer goes straight into Ticket Studio, like the "Organizers" link of the header.
  const studioHref = organizer?.status === "approved" ? HOME_LINKS.studioOpen : HOME_LINKS.studio;
  const hrefFor = (cta: Cta) => (cta.target === "events" ? HOME_LINKS.events : studioHref);

  const goTo = (id: SectionId) =>
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });

  // The events are fetched when their section is within a screen and a half, not on arrival: the first screen
  // has the whole connection to itself.
  const eventsSentinel = useRef<HTMLDivElement>(null);
  const eventsNear = useNearViewport(eventsSentinel, "150% 0px");
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
        description="Buy tickets directly from your student union, or organization, or resell yours safely."
      />

      <HeaderNight />
      <SideDots ids={SECTION_IDS} labels={copy.dots} active={active} ariaLabel={copy.dotsLabel} onSelect={goTo} />

      <main ref={mainRef} lang={lang} className="flex-1">
        {/* 1 — Hero: the only h1 of the page */}
        <HomeSection id="hero" media={HOME_MEDIA.hero} priority className="pb-28 md:pb-28">
          <div className="max-w-5xl">
            <h1
              id="hero-title"
              className="home-text-shadow text-balance text-[2.75rem] font-bold leading-[1.02] sm:text-6xl lg:text-7xl xl:text-[5.5rem]"
            >
              {copy.hero.title}
            </h1>
            <p className="home-text-shadow mt-5 max-w-2xl text-pretty text-lg text-white/85 sm:text-xl lg:text-2xl">
              {copy.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <HomeCta cta={copy.hero.primary} href={hrefFor(copy.hero.primary)} tone="buy" />
              <HomeCta cta={copy.hero.secondary} href={hrefFor(copy.hero.secondary)} tone="ghost" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => goTo("organisateurs")}
            aria-label={copy.scrollCue}
            className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2.5 px-3 py-1 text-white/80 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">{copy.scrollLabel}</span>
            <span className="home-cue-bar relative block h-11 w-px overflow-hidden bg-white/30" />
          </button>
        </HomeSection>

        {/* 2 — Organizers */}
        <HomeSection id="organisateurs" media={HOME_MEDIA.organisateurs}>
          <SectionText id="organisateurs" kicker={copy.organisateurs.kicker} title={copy.organisateurs.title} body={copy.organisateurs.body}>
            <ul className="mt-7 space-y-3 text-base text-white/90 sm:text-lg">
              {copy.organisateurs.bullets.map((bullet, i) => (
                <li key={bullet} data-reveal style={revealDelay(3 + i)} className="flex items-start gap-3">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-brand-200" aria-hidden="true" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <div data-reveal style={revealDelay(6)} className="mt-9">
              <HomeCta cta={copy.organisateurs.cta} href={hrefFor(copy.organisateurs.cta)} tone="brand" />
            </div>
          </SectionText>
        </HomeSection>

        {/* 3 — Student unions */}
        <HomeSection id="associatif" media={HOME_MEDIA.associatif}>
          <SectionText id="associatif" kicker={copy.associatif.kicker} title={copy.associatif.title} body={copy.associatif.body}>
            <TrustedBy title={copy.associatif.trustedTitle} />
          </SectionText>
        </HomeSection>

        {/* 4 — Parties */}
        <HomeSection id="soirees" media={HOME_MEDIA.soirees}>
          <SectionText id="soirees" kicker={copy.soirees.kicker} title={copy.soirees.title} body={copy.soirees.body} />
        </HomeSection>

        {/* 5 — Resale: kept quiet on purpose, no call to action */}
        <HomeSection id="revente" media={HOME_MEDIA.revente}>
          <SectionText id="revente" kicker={copy.revente.kicker} title={copy.revente.title} body={copy.revente.body} quiet />
        </HomeSection>

        {/* 6 — Meetings and business events */}
        <HomeSection id="reunions" media={HOME_MEDIA.reunions}>
          <SectionText id="reunions" kicker={copy.reunions.kicker} title={copy.reunions.title} body={copy.reunions.body} />
        </HomeSection>

        {/* 7 — One platform, three spaces */}
        <HomeSection id="plateforme" media={HOME_MEDIA.plateforme} shade="even" place="center">
          <SectionText id="plateforme" kicker={copy.plateforme.kicker} title={copy.plateforme.title} />
          <PlatformCards cards={copy.plateforme.cards} />
          <p
            data-reveal
            style={revealDelay(4)}
            className="home-text-shadow mt-8 max-w-3xl border-t border-white/20 pt-5 text-sm text-white/80 md:text-base"
          >
            {copy.plateforme.pricing}
          </p>
        </HomeSection>

        {/* 8 — Upcoming events */}
        <HomeSection id="evenements" media={HOME_MEDIA.evenements} shade="even" place="center">
          <div ref={eventsSentinel} aria-hidden="true" className="absolute inset-x-0 top-0 h-px" />
          <UpcomingEvents
            copy={copy.evenements}
            events={events}
            loading={eventsLoading}
            eventsHref={HOME_LINKS.events}
            studioHref={studioHref}
          />
        </HomeSection>

        {/* 9 — Final call to action */}
        <HomeSection id="rejoindre" media={HOME_MEDIA.rejoindre} shade="even" place="center">
          <div className="mx-auto max-w-4xl text-center">
            <h2
              id="rejoindre-title"
              data-reveal
              className="home-text-shadow text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl xl:text-7xl"
            >
              {copy.final.title}
            </h2>
            <div data-reveal style={revealDelay(1)} className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <HomeCta cta={copy.final.primary} href={hrefFor(copy.final.primary)} tone="buy" />
              <HomeCta cta={copy.final.secondary} href={hrefFor(copy.final.secondary)} tone="ghost" />
            </div>
          </div>
        </HomeSection>
      </main>

      <div className="home-snap-end">
        <Footer />
      </div>
    </div>
  );
};

export default Home;
