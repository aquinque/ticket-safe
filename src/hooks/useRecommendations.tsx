/**
 * Hook returning ranked event recommendations for a viewer.
 *
 * Algorithm (intentionally simple — no ML, just signal mixing):
 *
 *   Score(event) =
 *     + 3 if event.category ∈ user's past categories
 *     + 2 if event.organizer_id ∈ user's past organisers
 *     + 1 if event.campus ∈ user's past campuses
 *     + popularityBonus  (capped at +2)
 *
 *   where popularityBonus = clamp(sold_qty / 50, 0, 2)
 *
 * If the viewer has no purchase history (or isn't signed in), the score
 * collapses to popularityBonus and we end up showing "trending now".
 *
 * Past events and events the user has already bought are filtered out
 * before scoring so the carousel always points forward.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MinimalEvent {
  id: string;
  category: string | null;
  campus: string | null;
  date: string;
  organizer?: { id?: string } | { id?: string }[] | null;
  total_sold?: number;
}

export function useRecommendations<T extends MinimalEvent>(
  allEvents: T[],
  userId: string | null | undefined,
  limit = 6,
): { recommended: T[]; loading: boolean; reason: "personalized" | "trending" } {
  const [profile, setProfile] = useState<{
    categories: Set<string>;
    organizers: Set<string>;
    campuses: Set<string>;
    boughtEventIds: Set<string>;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(!!userId);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      // Primary-sale purchases (Studio events the user bought directly)
      // and resale purchases (transactions on tickets). We need both to
      // build a complete picture of taste.
      const [primary, resale] = await Promise.all([
        supabase
          .from("event_orders")
          .select(
            "event:events(id, category, campus, organizer_id)",
          )
          .eq("buyer_id", userId)
          .eq("status", "paid"),
        supabase
          .from("transactions")
          .select(
            "ticket:tickets(event:events(id, category, campus, organizer_id))",
          )
          .eq("buyer_id", userId)
          .eq("status", "completed"),
      ]);

      if (cancelled) return;

      const categories = new Set<string>();
      const organizers = new Set<string>();
      const campuses = new Set<string>();
      const boughtEventIds = new Set<string>();

      const noteEvent = (ev: {
        id?: string;
        category?: string | null;
        campus?: string | null;
        organizer_id?: string | null;
      } | null | undefined) => {
        if (!ev) return;
        if (ev.id) boughtEventIds.add(ev.id);
        if (ev.category) categories.add(ev.category);
        if (ev.campus) campuses.add(ev.campus);
        if (ev.organizer_id) organizers.add(ev.organizer_id);
      };

      for (const row of primary.data ?? []) {
        const ev = (row as { event: unknown }).event as
          | { id?: string; category?: string | null; campus?: string | null; organizer_id?: string | null }
          | { id?: string; category?: string | null; campus?: string | null; organizer_id?: string | null }[]
          | null;
        noteEvent(Array.isArray(ev) ? ev[0] ?? null : ev);
      }
      for (const row of resale.data ?? []) {
        const ticket = (row as { ticket: unknown }).ticket as
          | { event?: unknown }
          | { event?: unknown }[]
          | null;
        const t = Array.isArray(ticket) ? ticket[0] ?? null : ticket;
        if (!t) continue;
        const ev = (t as { event: unknown }).event as
          | { id?: string; category?: string | null; campus?: string | null; organizer_id?: string | null }
          | { id?: string; category?: string | null; campus?: string | null; organizer_id?: string | null }[]
          | null;
        noteEvent(Array.isArray(ev) ? ev[0] ?? null : ev);
      }

      setProfile({ categories, organizers, campuses, boughtEventIds });
      setLoading(false);
    })().catch((err) => {
      if (cancelled) return;
      console.warn("[useRecommendations] profile fetch failed:", err);
      setProfile(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Score and rank
  const now = Date.now();
  const upcoming = allEvents.filter((e) => {
    const t = new Date(e.date).getTime();
    return !isNaN(t) && t > now;
  });

  const personalized = !!profile && profile.categories.size + profile.organizers.size + profile.campuses.size > 0;

  const scored = upcoming
    .filter((e) => !profile?.boughtEventIds.has(e.id))
    .map((e) => {
      let score = 0;
      if (profile) {
        if (e.category && profile.categories.has(e.category)) score += 3;
        if (e.campus && profile.campuses.has(e.campus)) score += 1;
        const orgIdRaw = (e.organizer as { id?: string } | { id?: string }[] | null) ?? null;
        const orgId = Array.isArray(orgIdRaw) ? orgIdRaw[0]?.id : orgIdRaw?.id;
        if (orgId && profile.organizers.has(orgId)) score += 2;
      }
      const sold = e.total_sold ?? 0;
      score += Math.min(2, sold / 50);
      return { event: e, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.event);

  return {
    recommended: scored,
    loading,
    reason: personalized ? "personalized" : "trending",
  };
}
