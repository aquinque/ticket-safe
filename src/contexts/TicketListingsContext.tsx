/**
 * TicketListingsContext
 *
 * Replaces the old in-memory store with a React Query backed fetch from
 * Supabase.  The query returns only status='available' tickets, joined
 * with their event and the seller's full_name.
 *
 * The shape of `TicketListing` is kept backwards-compatible so that
 * BuyTicket.tsx, EventTicketsMarketplace.tsx and other consumers continue
 * to work without changes.
 *
 * New helpers:
 *   - `refetchListings()` — call after a new listing is created to
 *     update the marketplace instantly.
 *   - `isLoading` — true while the first fetch is in flight.
 */

import React, { createContext, useContext, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EventData } from "@/data/eventsData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TicketListing {
  id: string;
  /** event data — mapped from the events table row */
  event: EventData;
  sellingPrice: number;
  quantity: number;
  description: string;
  /** legacy field — always empty; ticket images not part of the new flow */
  files: { name: string; size: number; type: string }[];
  sellerId: string;
  sellerName: string;
  timestamp: string;
  /** true if the QR code was verified by HMAC signature */
  verified: boolean;
  /** the listing id (same as id) */
  ticketId: string;
  /** SHA-256 hash of the QR payload — not exposed in public responses */
  qrHash: string;
}

interface TicketListingsContextType {
  listings: TicketListing[];
  isLoading: boolean;
  /** Immediately re-fetch listings from Supabase */
  refetchListings: () => void;
  /** @deprecated use refetchListings — kept for backwards compat */
  addListing: (listing: TicketListing) => void;
  /** @deprecated kept for backwards compat */
  removeListing: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const LISTINGS_QUERY_KEY = ["marketplace-listings"] as const;

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchAvailableListings(): Promise<TicketListing[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(
      `
      id,
      event_id,
      seller_id,
      selling_price,
      original_price,
      quantity,
      notes,
      status,
      qr_verified,
      created_at,
      event:events (
        id,
        title,
        date,
        location,
        category,
        university,
        campus,
        base_price
      ),
      seller:profiles (
        full_name
      )
    `
    )
    .eq("status", "available")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const ev = row.event as {
      id: string;
      title: string;
      date: string;
      location: string;
      category: string;
      university: string;
      campus: string | null;
      base_price: number | null;
    } | null;

    const seller = row.seller as { full_name: string } | null;

    // Map DB event to EventData interface (backwards-compatible)
    const eventData: EventData = {
      id: ev?.id ?? row.event_id,
      title: ev?.title ?? "Unknown Event",
      date: ev?.date ?? "",
      time: "",
      location: ev?.location ?? "",
      organizer: ev?.university ?? "",
      description: "",
      category: ev?.category ?? "",
      filterCategory: (ev?.category ?? "").toLowerCase(),
      image: "",
      isPastEvent: ev?.date ? new Date(ev.date) < new Date() : false,
    };

    return {
      id: row.id,
      event: eventData,
      sellingPrice: row.selling_price,
      quantity: row.quantity,
      description: row.notes ?? "",
      files: [],
      sellerId: row.seller_id,
      sellerName: seller?.full_name ?? "Anonymous",
      timestamp: row.created_at,
      verified: row.qr_verified ?? false,
      ticketId: row.id,
      qrHash: "", // never expose the real hash to clients
    };
  });
}

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
    queryKey: LISTINGS_QUERY_KEY,
    queryFn: fetchAvailableListings,
    staleTime: 30_000,        // 30 s before background refetch
    refetchOnWindowFocus: true, // refresh when user switches back to tab
  });

  const refetchListings = () => {
    queryClient.invalidateQueries({ queryKey: LISTINGS_QUERY_KEY });
  };

  // Backwards-compat stubs — the context is no longer write-through
  const addListing = (_listing: TicketListing) => {
    // No-op: data comes from DB. Call refetchListings() after a successful
    // submit-listing call instead.
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
