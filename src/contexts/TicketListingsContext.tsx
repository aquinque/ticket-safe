/**
 * TicketListingsContext
 *
 * Replaces the old in-memory store with a React Query backed fetch from
 * Supabase.  The query returns only status='available' tickets, joined
 * with their event and the seller's full_name.
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
  eventId: string;
  event: EventData;
  sellingPrice: number;
  quantity: number;
  description: string;
  files: { name: string; size: number; type: string }[];
  sellerId: string;
  sellerName: string;
  timestamp: string;
  verified: boolean;
  ticketId: string;
  qrHash: string;
  /** university name, e.g. "ESCP Business School" */
  university: string;
  /** campus name, e.g. "Paris", "London" — null for multi-campus events */
  campus: string | null;
  /** Original ticket face value (event base price), if known — for fair-price UI. */
  basePrice: number | null;
  /** ISO timestamp until which the listing is a paid "Featured" boost, or null. */
  boostedUntil: string | null;
}

interface TicketListingsContextType {
  listings: TicketListing[];
  isLoading: boolean;
  refetchListings: () => void;
  addListing: (listing: TicketListing) => void;
  removeListing: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const LISTINGS_QUERY_KEY = ["marketplace-listings"] as const;

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

// Shape of the joined tickets row returned by the select below. Supabase's
// generated types model embedded relations awkwardly, so we describe the row
// explicitly here instead of leaning on `any`.
interface RawListingRow {
  id: string;
  event_id: string;
  seller_id: string;
  selling_price: number;
  quantity: number;
  notes: string | null;
  qr_verified: boolean | null;
  created_at: string;
  boosted_until: string | null;
  event: {
    id: string;
    title: string;
    date: string;
    location: string;
    category: string;
    university: string;
    campus: string | null;
    base_price: number | null;
  } | null;
  seller: { full_name: string } | null;
}

async function fetchAvailableListings(): Promise<TicketListing[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(
      `
      id,
      event_id,
      seller_id,
      selling_price,
      quantity,
      notes,
      status,
      qr_verified,
      created_at,
      boosted_until,
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
    .in("status", ["available", "reserved"])
    .eq("verification_status", "verified")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (((data ?? []) as unknown) as RawListingRow[]).map((row) => {
    const ev = row.event;
    const seller = row.seller;

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
      eventId: row.event_id,
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
      university: ev?.university ?? "",
      campus: ev?.campus ?? null,
      basePrice: ev?.base_price ?? null,
      boostedUntil: row.boosted_until ?? null,
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
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const refetchListings = () => {
    queryClient.invalidateQueries({ queryKey: LISTINGS_QUERY_KEY });
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
