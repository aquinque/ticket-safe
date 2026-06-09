/**
 * Hook returning live marketplace stats for the hero strip + per-event ribbon.
 *
 *   - lifetimeSold:    every transaction.status='completed' + every event_order.status='paid'
 *                      (resale + primary, no double counting because they live in different tables)
 *   - activeListings:  resale tickets currently for sale
 *   - soldByEvent24h:  per-event count of resale transactions in the last 24h, keyed by event_id
 *
 * Cached in module state for 60s so navigating between pages doesn't re-hit Supabase
 * on every mount — the hero ribbon is decorative, a one-minute staleness is invisible.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MarketplaceStats {
  lifetimeSold: number;
  activeListings: number;
  soldByEvent24h: Record<string, number>;
}

let cache: { value: MarketplaceStats; expiresAt: number } | null = null;
const TTL_MS = 60_000;

async function fetchStats(): Promise<MarketplaceStats> {
  // Run all four queries in parallel so first paint isn't held back by the
  // slowest one. Each returns just a count or grouped count, so payloads are tiny.
  const [resaleSold, primarySold, activeListings, last24hSales] = await Promise.all([
    supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed"),
    supabase
      .from("event_orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "paid"),
    supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("status", "available"),
    // Sold in the last 24h, by event — used to render the "X sold today" ribbon.
    // We join through tickets to get event_id; PostgREST embed handles that.
    supabase
      .from("transactions")
      .select("ticket:tickets(event_id)")
      .eq("status", "completed")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const soldByEvent24h: Record<string, number> = {};
  for (const row of last24hSales.data ?? []) {
    const t = (row as { ticket: { event_id?: string } | { event_id?: string }[] | null }).ticket;
    const eventId = Array.isArray(t) ? t[0]?.event_id : t?.event_id;
    if (eventId) soldByEvent24h[eventId] = (soldByEvent24h[eventId] ?? 0) + 1;
  }

  return {
    lifetimeSold: (resaleSold.count ?? 0) + (primarySold.count ?? 0),
    activeListings: activeListings.count ?? 0,
    soldByEvent24h,
  };
}

export function useMarketplaceStats(): { stats: MarketplaceStats | null; loading: boolean } {
  const [stats, setStats] = useState<MarketplaceStats | null>(() => {
    if (cache && cache.expiresAt > Date.now()) return cache.value;
    return null;
  });
  const [loading, setLoading] = useState<boolean>(stats === null);

  useEffect(() => {
    let cancelled = false;
    if (cache && cache.expiresAt > Date.now()) {
      // Cache fresh enough; nothing to do.
      return;
    }
    setLoading(true);
    fetchStats()
      .then((value) => {
        if (cancelled) return;
        cache = { value, expiresAt: Date.now() + TTL_MS };
        setStats(value);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[useMarketplaceStats] fetch failed:", err);
        // Soft fail — the strip stays empty rather than blowing up the page.
        setStats({ lifetimeSold: 0, activeListings: 0, soldByEvent24h: {} });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, loading };
}
