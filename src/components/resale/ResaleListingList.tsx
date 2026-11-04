import { ResaleListingCard } from "@/components/resale/ResaleListingCard";
import type { ResaleListing } from "@/lib/resaleListings";

export function ResaleListingList({
  listings,
  onBuy,
  onOffer,
  offerBusy,
  now,
}: {
  listings: readonly ResaleListing[];
  onBuy?: (l: ResaleListing) => void;
  onOffer?: (l: ResaleListing) => void;
  offerBusy?: boolean;
  now?: Date;
}) {
  return (
    <ul role="list" className="space-y-2.5">
      {listings.map((l) => (
        <ResaleListingCard key={l.id} listing={l} onBuy={onBuy} onOffer={onOffer} offerBusy={offerBusy} now={now} />
      ))}
    </ul>
  );
}
