/**
 * When an event ends, and whether it is over: the one rule for the whole product.
 *
 *   end      = ends_at, or start + DEFAULT_EVENT_DURATION_MS when the organizer set no end
 *              (8 hours: the value the database backfill of ends_at and the door / resale
 *              checks have always used). An end at or before the start is ignored.
 *   past     = now >= end      -> the event leaves the Studio dashboard for the Sales archive,
 *                                 is read-only there and takes no new sale
 *   live     = start <= now < end
 *   upcoming = now < start, and any event whose start cannot be read (never archived by accident)
 *
 * Nothing is written to events.status for this: the phase is computed wherever it is needed,
 * from the same two columns, so it can never drift.
 *
 * Pure (no Deno API, no import). The edge functions import it directly, the web app through
 * src/lib/eventTime.ts, and public.event_end() mirrors it in SQL (a test pins the two together).
 */
export const DEFAULT_EVENT_DURATION_HOURS = 8;
export const DEFAULT_EVENT_DURATION_MS = DEFAULT_EVENT_DURATION_HOURS * 60 * 60 * 1000;

/** Door tolerance after the end: a ticket can still be scanned this long after the event ended. */
export const DOOR_GRACE_AFTER_END_MS = 4 * 60 * 60 * 1000;

export interface EventTimeFields {
  date?: string | null;
  ends_at?: string | null;
}

export type EventPhase = "upcoming" | "live" | "past";

function parseInstant(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The start of the event, or null when it has none that can be read. */
export function eventStart(event: EventTimeFields): Date | null {
  return parseInstant(event.date);
}

/**
 * The end of the event: ends_at when set (and after the start), otherwise start + 8 h.
 * Null when neither can be read.
 */
export function eventEnd(event: EventTimeFields): Date | null {
  const start = eventStart(event);
  const explicit = parseInstant(event.ends_at);
  if (explicit && (!start || explicit.getTime() > start.getTime())) return explicit;
  return start ? new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS) : null;
}

/** True once the event has ended (at the end instant itself too). Never true without a readable date. */
export function isEventOver(event: EventTimeFields, now: Date = new Date()): boolean {
  const end = eventEnd(event);
  return end !== null && end.getTime() <= now.getTime();
}

/** Same rule, named for what the Studio does with it. */
export const isPastEvent = isEventOver;

/** upcoming | live | past, from instants only (no calendar-day arithmetic). */
export function eventPhase(event: EventTimeFields, now: Date = new Date()): EventPhase {
  if (isEventOver(event, now)) return "past";
  const start = eventStart(event);
  return start && start.getTime() <= now.getTime() ? "live" : "upcoming";
}

/** True while the door may still scan: before the end plus the door tolerance. */
export function doorStillOpen(event: EventTimeFields, now: Date = new Date()): boolean {
  const end = eventEnd(event);
  return end === null || end.getTime() + DOOR_GRACE_AFTER_END_MS > now.getTime();
}
