/**
 * Ticket drops: a tier can open later than the others.
 *   - when another tier of the event sells out   (opens_after_tier_id; the database sets released_at),
 *   - at a date and time                         (sales_start_at),
 *   - by hand                                    (the organiser sets released_at, or switches is_active).
 *
 * The database is the source of truth: public.tier_is_open() decides, and reserve_tier() refuses a tier that is not
 * open (supabase/migrations/20261122120000_ticket_drops.sql). This file only mirrors that rule for display, in
 * Studio and on the event page, so both say the same thing.
 */

export interface DropTier {
  id: string;
  name: string;
  is_active: boolean;
  total_qty: number;
  sold_qty: number;
  reserved_qty: number;
  sales_start_at: string | null;
  sales_end_at: string | null;
  opens_after_tier_id: string | null;
  released_at: string | null;
}

export type TierReleaseState =
  | { kind: "inactive" }
  | { kind: "closed" }
  | { kind: "waiting"; afterId: string; afterName: string }
  | { kind: "scheduled"; opensAt: Date }
  | { kind: "sold_out" }
  | { kind: "open" };

const time = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** Where a tier stands right now. Order matters: a switched-off tier is "inactive" whatever else is set. */
export function tierReleaseState(tier: DropTier, all: readonly Pick<DropTier, "id" | "name">[], now: number = Date.now()): TierReleaseState {
  if (!tier.is_active) return { kind: "inactive" };
  const end = time(tier.sales_end_at);
  if (end !== null && end <= now) return { kind: "closed" };
  if (tier.opens_after_tier_id && !tier.released_at) {
    const after = all.find((t) => t.id === tier.opens_after_tier_id);
    return { kind: "waiting", afterId: tier.opens_after_tier_id, afterName: after?.name ?? "the previous ticket" };
  }
  const start = time(tier.sales_start_at);
  if (start !== null && start > now) return { kind: "scheduled", opensAt: new Date(start) };
  if (tier.total_qty - tier.sold_qty - tier.reserved_qty <= 0) return { kind: "sold_out" };
  return { kind: "open" };
}

/** A drop that has not opened yet (it will, by itself or by hand). */
export const isUpcomingDrop = (s: TierReleaseState): boolean => s.kind === "waiting" || s.kind === "scheduled";

export const formatDropDate = (d: Date): string =>
  d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The line shown under an upcoming drop on the event page. */
export function dropLabel(s: TierReleaseState): string | null {
  if (s.kind === "waiting") return `Opens when ${s.afterName} sells out`;
  if (s.kind === "scheduled") return `Opens ${formatDropDate(s.opensAt)}`;
  if (s.kind === "closed") return "Sales closed";
  return null;
}

/** Short status for Studio. */
export function studioDropStatus(s: TierReleaseState, releasedAt: string | null): string {
  switch (s.kind) {
    case "inactive":
      return "Hidden";
    case "closed":
      return "Sales closed";
    case "waiting":
      return `Waiting for ${s.afterName} to sell out`;
    case "scheduled":
      return `Opens ${formatDropDate(s.opensAt)}`;
    case "sold_out":
      return "Sold out";
    case "open":
      return releasedAt ? `Opened ${formatDropDate(new Date(releasedAt))}` : "On sale";
  }
}

/**
 * The tiers this tier may wait for: the other tiers of the event, minus any that already wait (directly or down a
 * chain) for this one, so a choice can never make two tiers wait for each other. The database refuses loops too.
 */
export function dropParentOptions<T extends Pick<DropTier, "id" | "opens_after_tier_id">>(tierId: string, all: readonly T[]): T[] {
  const byId = new Map(all.map((t) => [t.id, t]));
  const leadsTo = (startId: string): boolean => {
    let cur: string | null = startId;
    for (let i = 0; cur && i < 50; i++) {
      if (cur === tierId) return true;
      cur = byId.get(cur)?.opens_after_tier_id ?? null;
    }
    return false;
  };
  return all.filter((t) => t.id !== tierId && !leadsTo(t.id));
}
