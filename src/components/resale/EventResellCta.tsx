import { Link } from "react-router-dom";
import { ArrowRight, Repeat2 } from "lucide-react";

/**
 * "Can't go any more? Resell your ticket", under the purchase flow of the event page. Someone who wants to resell
 * goes to the event first, so the button is there and opens the resale form on this event: they pick their ticket
 * (or upload it when the event's tickets were not issued by TicketSafe), set a price and publish.
 */
export function EventResellCta({ eventId, className = "" }: { eventId: string; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-card/50 p-4 lg:p-5 ${className}`}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">Resale</h2>
      <p className="text-sm font-semibold text-foreground">Can't go any more?</p>
      <p className="text-sm text-muted-foreground mt-1">Resell your ticket for this event on TicketSafe. The buyer gets a ticket in their own name.</p>
      <Link
        to={`/marketplace/sell?event=${encodeURIComponent(eventId)}`}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 min-h-[44px] px-4 text-sm font-bold border border-border bg-card text-foreground hover:border-primary/50 transition-colors"
      >
        <Repeat2 className="w-4 h-4 text-primary" aria-hidden="true" />
        Resell my ticket
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
