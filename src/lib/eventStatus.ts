/**
 * The status an organizer reads next to an event in the Studio: Live, Draft,
 * Sold out, Ended or Cancelled. Derived at read time from the raw
 * events.status, the event's dates and, when the caller knows it, whether the
 * tiers are sold out. Nothing here is ever written back to the database.
 *
 * "Ended" follows the one end-of-event rule of the product (src/lib/eventTime.ts):
 * ends_at, or the start plus 8 hours. An event that started last night and runs
 * until tomorrow is therefore still live, even though its start has passed.
 *
 * Pure (no JSX): EventStatusBadge re-exports it, and the tests import it directly.
 */
import { isPastEvent, type EventTimeFields } from "@/lib/eventTime";

/**
 * An event that has moved to the Sales archive: it has ended (the shared end rule) and it is not a
 * draft. A draft whose date has passed was never on sale; it stays in Events so it can be re-dated.
 */
export function isArchivedEvent(event: EventTimeFields & { status?: string | null }, now: Date = new Date()): boolean {
  return event.status !== "draft" && isPastEvent(event, now);
}

export type EventStatus = "draft" | "published" | "cancelled" | "sold_out" | null | undefined;

export type EventStatusKind = "live" | "draft" | "soldout" | "ended" | "cancelled";

/**
 * Cancelled first, then ended (an event that is over is no longer selling,
 * whatever its stock), then sold out (the stored status, or a published event
 * the caller found full), then live; anything else is a draft.
 * Without a readable date an event is never "ended".
 */
export function deriveEventStatusKind(
  status: EventStatus,
  date?: string | null,
  soldOut?: boolean,
  endsAt?: string | null,
  now: Date = new Date(),
): EventStatusKind {
  if (status === "cancelled") return "cancelled";
  const onSale = status === "published" || status === "sold_out";
  if (onSale && isPastEvent({ date, ends_at: endsAt }, now)) return "ended";
  if (status === "sold_out" || (status === "published" && soldOut)) return "soldout";
  if (status === "published") return "live";
  return "draft";
}
