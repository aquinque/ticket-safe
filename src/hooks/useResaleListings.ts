import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/supabaseRpc";
import {
  fetchResaleListing,
  fetchResaleListings,
  resaleListingQueryKey,
  resaleListingsQueryKey,
} from "@/lib/resaleListings";

/**
 * Listings on sale, from the `resale_listings` function: all of them, or one event's.
 * Kept fresh by a 30 s stale time and a refetch when the tab regains focus (no realtime channel: `tickets`
 * isn't published, and the atomic reserve at checkout is what prevents a double sale).
 */
export function useResaleListings({ eventId, enabled = true }: { eventId?: string | null; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: resaleListingsQueryKey(eventId),
    queryFn: () => fetchResaleListings(callRpc, eventId),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** One listing for the checkout; `data` is null when it's no longer on sale. */
export function useResaleListing(listingId: string | null) {
  return useQuery({
    queryKey: resaleListingQueryKey(listingId ?? ""),
    queryFn: () => fetchResaleListing(callRpc, listingId ?? ""),
    enabled: !!listingId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
