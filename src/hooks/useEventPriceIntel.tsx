/**
 * Hook returning live price intelligence for an event: average sold,
 * lowest available, last sold price, and a 7-day trend direction.
 *
 * All values come from real DB rows:
 *   - avg + last sold: completed transactions on tickets for this event
 *     over the last 30 days
 *   - min available: cheapest currently-active listing
 *   - trend: avg(last 7d) vs avg(prior 7d) — uses a 5% threshold so we
 *     only flag movements that actually mean something
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PriceIntel {
  avgSold: number | null;       // EUR
  lowestAvailable: number | null; // EUR
  lastSold: { price: number; date: string } | null;
  trend: "up" | "down" | "flat" | null;
  trendPct: number | null;        // signed % change vs prior week
  recentSalesCount: number;       // last 30 days
}

const EMPTY: PriceIntel = {
  avgSold: null,
  lowestAvailable: null,
  lastSold: null,
  trend: null,
  trendPct: null,
  recentSalesCount: 0,
};

export function useEventPriceIntel(eventId: string | null | undefined): {
  intel: PriceIntel;
  loading: boolean;
} {
  const [intel, setIntel] = useState<PriceIntel>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setIntel(EMPTY);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const now = Date.now();
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

      // Two queries in parallel — PostgREST inner-join syntax filters
      // transactions to those whose ticket's event_id matches.
      const [salesRes, listingsRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("amount, created_at, ticket:tickets!inner(event_id)")
          .eq("status", "completed")
          .eq("ticket.event_id", eventId)
          .gte("created_at", thirtyDaysAgo)
          .order("created_at", { ascending: false }),
        supabase
          .from("tickets")
          .select("selling_price")
          .eq("event_id", eventId)
          .eq("status", "available")
          .order("selling_price", { ascending: true })
          .limit(1),
      ]);

      if (cancelled) return;

      const sales = (salesRes.data ?? [])
        .map((r) => ({
          amount: Number((r as { amount: number | string }).amount),
          createdAt: (r as { created_at: string }).created_at,
        }))
        .filter((s) => isFinite(s.amount) && s.amount > 0);

      // Stats from sales
      let avgSold: number | null = null;
      let lastSold: PriceIntel["lastSold"] = null;
      let trend: PriceIntel["trend"] = null;
      let trendPct: number | null = null;

      if (sales.length > 0) {
        const total = sales.reduce((s, x) => s + x.amount, 0);
        avgSold = total / sales.length;
        lastSold = { price: sales[0].amount, date: sales[0].createdAt };

        // Trend: avg of last 7d vs avg of 8-14d ago
        const last7 = sales.filter((s) => s.createdAt >= sevenDaysAgo);
        const prior7 = sales.filter(
          (s) => s.createdAt < sevenDaysAgo && s.createdAt >= fourteenDaysAgo,
        );
        if (last7.length > 0 && prior7.length > 0) {
          const avgLast = last7.reduce((s, x) => s + x.amount, 0) / last7.length;
          const avgPrior = prior7.reduce((s, x) => s + x.amount, 0) / prior7.length;
          const pct = ((avgLast - avgPrior) / avgPrior) * 100;
          trendPct = pct;
          // 5 % threshold — anything smaller is noise, mark as flat
          if (pct > 5) trend = "up";
          else if (pct < -5) trend = "down";
          else trend = "flat";
        }
      }

      const lowestAvailable =
        (listingsRes.data?.[0] as { selling_price?: number } | undefined)?.selling_price ?? null;

      setIntel({
        avgSold,
        lowestAvailable: lowestAvailable != null ? Number(lowestAvailable) : null,
        lastSold,
        trend,
        trendPct,
        recentSalesCount: sales.length,
      });
      setLoading(false);
    })().catch((err) => {
      if (cancelled) return;
      console.warn("[useEventPriceIntel] failed:", err);
      setIntel(EMPTY);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return { intel, loading };
}
