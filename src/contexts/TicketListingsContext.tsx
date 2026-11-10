/**
 * TicketListingsContext
 *
 * Legacy adapter over the resale listings query (src/hooks/useResaleListings.ts). Listings come from the
 * `resale_listings` function, never a direct read of `tickets`, and share their cache with the Resale page;
 * this maps them to the older TicketListing shape still used by GalaESCP and BuyTicket. Seller notes and
 * names are not public, so they are not part of the shape.
 */

import React, { createContext, useContext, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EventData } from "@/data/eventsData";
import { callRpc } from "@/lib/supabaseRpc";
import {
  fetchResaleListings,
  RESALE_LISTINGS_QUERY_KEY,
  resaleListingsQueryKey,
  type ResaleListing,
} from "@/lib/resaleListings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TicketListing {
  id: string;
  eventId: string;
  event: EventData;
  sellingPrice: number;
  quantity: number;
  files: { name: string; size: number; type: string }[];
  /** Always "Verified seller": the seller's name and id are no longer public. */
  sellerName: string;
  /** True when the signed-in user listed it. */
  isOwn: boolean;
  timestamp: string;
  verified: boolean;
  ticketId: string;
  /** Studio tier name, or null for a ticket from another platform. */
  tierName: string | null;
  /** university name, e.g. "ESCP Business School" */
  university: string;
  /** campus name, e.g. "Paris", "London" — null for multi-campus events */
  campus: string | null;
  /** Original ticket face value (event base price), if known — for fair-price UI. */
  basePrice: number | null;
  /** ISO timestamp until which the listing is a paid "Featured" boost, or null. */
  boostedUntil: string | null;
  /** Seller-uploaded listing photo/video (listing-media bucket), or null — falls back to the brand-gradient placeholder. */
  photoUrl: string | null;
  videoUrl: string | null;
  /** The event's own official banner/video (event-media bucket), set by the
   *  organizer in Studio — independent of whatever the reseller uploaded.
   *  Consumers should prefer the seller's own photoUrl/videoUrl when
   *  present and fall back to these, so a listing never shows a generic
   *  gradient for an event that actually has a real photo. */
  eventBannerUrl: string | null;
  eventVideoUrl: string | null;
}

interface TicketListingsContextType {
  listings: TicketListing[];
  isLoading: boolean;
  refetchListings: () => void;
  addListing: (listing: TicketListing) => void;
  removeListing: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function toTicketListing(l: ResaleListing): TicketListing {
  const ev = l.event;
  const eventData: EventData = {
    id: ev.id,
    title: ev.title,
    date: ev.date ?? "",
    time: "",
    location: ev.location ?? "",
    organizer: ev.university ?? "",
    description: "",
    category: ev.category ?? "",
    filterCategory: (ev.category ?? "").toLowerCase(),
    image: ev.bannerUrl,
    isPastEvent: ev.date ? new Date(ev.date) < new Date() : false,
  };
  return {
    id: l.id,
    eventId: l.eventId,
    event: eventData,
    sellingPrice: l.priceCents / 100,
    quantity: l.quantity,
    files: [],
    sellerName: "Verified seller",
    isOwn: l.isOwn,
    timestamp: l.listedAt,
    verified: true,
    ticketId: l.id,
    tierName: l.tierName,
    university: ev.university ?? "",
    campus: ev.campus,
    basePrice: ev.basePrice,
    boostedUntil: null,
    photoUrl: l.photoUrl,
    videoUrl: l.videoUrl,
    eventBannerUrl: ev.bannerUrl,
    eventVideoUrl: ev.videoUrl,
  };
}

const toTicketListings = (rows: ResaleListing[]): TicketListing[] => rows.map(toTicketListing);

// ---------------------------------------------------------------------------
// Context + Provider
// ---------------------------------------------------------------------------

const TicketListingsContext = createContext<TicketListingsContextType | undefined>(
  undefined
);

export const TicketListingsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();

  const { data: listings = [], isLoading } = useQuery({
    queryKey: resaleListingsQueryKey(null),
    queryFn: () => fetchResaleListings(callRpc, null),
    select: toTicketListings,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Every resale listings query (all, per event, one listing) after a listing was added or removed.
  const refetchListings = () => {
    queryClient.invalidateQueries({ queryKey: RESALE_LISTINGS_QUERY_KEY });
  };

  const addListing = (_listing: TicketListing) => {
    refetchListings();
  };

  const removeListing = (_id: string) => {
    refetchListings();
  };

  return (
    <TicketListingsContext.Provider
      value={{ listings, isLoading, refetchListings, addListing, removeListing }}
    >
      {children}
    </TicketListingsContext.Provider>
  );
};

export const useTicketListings = (): TicketListingsContextType => {
  const ctx = useContext(TicketListingsContext);
  if (ctx === undefined) {
    throw new Error("useTicketListings must be used within a TicketListingsProvider");
  }
  return ctx;
};
