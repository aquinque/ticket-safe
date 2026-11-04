import { useEffect, useRef } from "react";
import { ResaleListingList } from "@/components/resale/ResaleListingList";
import { useResaleListings } from "@/hooks/useResaleListings";

/**
 * "Tickets on resale" on the event page, under the purchase flow. Renders only when the event has at least
 * one listing on sale: nothing while loading, nothing on error (logged once), nothing when empty, so the
 * page never shows an empty or broken block. Both placements (desktop aside, mobile column) share one query.
 */
export function EventResaleListings({ eventId, headingId, className = "" }: { eventId: string; headingId: string; className?: string }) {
  const { data: listings, isLoading, isError, error } = useResaleListings({ eventId });
  const logged = useRef(false);

  useEffect(() => {
    if (isError && !logged.current) {
      logged.current = true;
      console.error("[resale] listings failed", error);
    }
  }, [isError, error]);

  if (isLoading || isError || !listings || listings.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className={`rounded-2xl border border-border bg-card/50 p-4 lg:p-5 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between lg:mb-4">
        <h2 id={headingId} className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Tickets on resale
        </h2>
        <span className="text-[11px] text-muted-foreground">{listings.length} listed</span>
      </div>
      <ResaleListingList listings={listings} />
      <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
        Every resale ticket is checked before it's listed and reissued in your name, with a new QR code.
      </p>
    </section>
  );
}
