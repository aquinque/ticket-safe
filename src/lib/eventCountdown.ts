import { eventPhase, eventStart, type EventTimeFields } from "@/lib/eventTime";

/**
 * The event page's countdown, as one line of text:
 *   more than 24 h before the start  "Starts in 3 days"
 *   the last 24 h                    "Starts in 5 h 51 min" (then "Starts in 51 min")
 *   during the event                 "Happening now"
 *   after the end                    "Ended", with over = true (the page shows no countdown then)
 * Minutes are the finest unit, so a clock ticking every 30 s keeps it exact.
 */
export function countdown(ev: EventTimeFields, now: number): { label: string; live: boolean; over: boolean } {
  const phase = eventPhase(ev, new Date(now));
  if (phase === "past") return { label: "Ended", live: false, over: true };
  if (phase === "live") return { label: "Happening now", live: true, over: false };
  const diff = Math.max(0, (eventStart(ev)?.getTime() ?? now) - now);
  if (diff > 86_400_000) {
    const d = Math.floor(diff / 86_400_000);
    return { label: `Starts in ${d} ${d === 1 ? "day" : "days"}`, live: false, over: false };
  }
  const h = Math.floor(diff / 3_600_000);
  const m = Math.max(h >= 1 ? 0 : 1, Math.floor((diff % 3_600_000) / 60_000));
  return { label: h >= 1 ? `Starts in ${h} h ${m} min` : `Starts in ${m} min`, live: false, over: false };
}
