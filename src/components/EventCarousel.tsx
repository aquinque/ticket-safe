import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EventCard, { EventCardSkeleton } from "@/components/EventCard";
import type { EventData } from "@/data/eventsData";

interface EventCarouselProps {
  events: EventData[];
  loading?: boolean;
  onEventClick: (event: EventData) => void;
}

/** Horizontal scroll-snap row of EventCards. Native scroll on mobile (no JS
 *  needed for the snap itself), optional prev/next arrows on desktop where
 *  a mouse is more likely than a swipe. */
export const EventCarousel = ({ events, loading, onEventClick }: EventCarouselProps) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-[62vw] sm:w-56 md:w-60 snap-start">
                <EventCardSkeleton />
              </div>
            ))
          : events.map((event) => (
              <div key={event.id} className="shrink-0 w-[62vw] sm:w-56 md:w-60 snap-start">
                <EventCard event={event} onClick={() => onEventClick(event)} />
              </div>
            ))}
      </div>

      {!loading && events.length > 2 && (
        <div className="hidden md:flex items-center gap-2 justify-end mt-3">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
