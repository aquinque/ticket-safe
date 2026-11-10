import { Link } from "react-router-dom";
import { ArrowRight, MessageSquare } from "lucide-react";
import { VerifiedResaleBadge } from "@/components/resale/VerifiedResaleBadge";
import { formatEuroCents, resaleCardMeta, resaleCardPricing, type ResaleListing } from "@/lib/resaleListings";

export interface ResaleListingCardProps {
  listing: ResaleListing;
  /** Called when Buy is clicked (analytics only: the button is a link to the checkout, so it works without JS). */
  onBuy?: (l: ResaleListing) => void;
  /** Shows a "Make an offer" link under the card (Resale page only). */
  onOffer?: (l: ResaleListing) => void;
  offerBusy?: boolean;
  /** For the "Listed today" copy; defaults to the current time. */
  now?: Date;
}

/**
 * One resale listing, in two rows:
 *   1. tier name, and the all-in price per ticket (fee included);
 *   2. "Verified resale" and when it was listed (or what the lot costs in all), and Buy.
 * No seller name or seller notes: listings are public, and free text can hold contact details.
 */
export function ResaleListingCard({ listing, onBuy, onOffer, offerBusy = false, now }: ResaleListingCardProps) {
  const tier = listing.tierName ?? "Resale ticket";
  const { eachCents, totalCents } = resaleCardPricing(listing);
  const each = formatEuroCents(eachCents);
  const several = listing.quantity > 1;
  const buyLabel = several
    ? `Buy ${tier} on resale for ${each} each, ${listing.quantity} tickets sold together for ${formatEuroCents(totalCents)}`
    : `Buy ${tier} on resale for ${each}`;

  return (
    <li>
      <article className="rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 text-[15px] font-medium leading-snug text-foreground">{tier}</h3>
          <div className="shrink-0 text-right">
            <span className="font-semibold tabular-nums text-foreground">{each}</span>
            {several && <span className="text-xs text-muted-foreground"> each</span>}
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <VerifiedResaleBadge />
            {listing.isBoosted && (
              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                Featured
              </span>
            )}
            <span className="text-xs text-muted-foreground">{resaleCardMeta(listing, now)}</span>
          </div>
          {listing.isOwn ? (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Your listing</span>
          ) : (
            <Link
              to={`/checkout?listing_id=${listing.id}`}
              onClick={onBuy ? () => onBuy(listing) : undefined}
              aria-label={buyLabel}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Buy <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </article>
      {onOffer && !listing.isOwn && (
        <button
          type="button"
          onClick={() => onOffer(listing)}
          disabled={offerBusy}
          className="mt-1 inline-flex min-h-[36px] items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          Make an offer
        </button>
      )}
    </li>
  );
}
