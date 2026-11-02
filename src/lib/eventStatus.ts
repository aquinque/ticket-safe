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
import { isPastEvent } from "@/lib/eventTime";

export type EventStatus = "draft" | "published" | "cancelled" | "sold_out" | null | undefined;

export type EventStatusKind = "live" | "draft" | "soldout" | "ended" | "cancelled";

/**
 * Cancelled first, then sold out (the stored status, or a published event the
 * caller found full), then ended, then live; anything else is a draft.
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
  if (status === "sold_out" || (status === "published" && soldOut)) return "soldout";
  if (status === "published" && isPastEvent({ date, ends_at: endsAt }, now)) return "ended";
  if (status === "published") return "live";
  return "draft";
}
