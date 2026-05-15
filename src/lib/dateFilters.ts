/**
 * Date-filter helpers shared by EventsSection, EventsCatalog, and Marketplace.
 *
 * All three pages used to inline these — easy for the definitions to drift apart
 * (e.g., "this week" being 7 days vs. ISO week). Centralising avoids that.
 *
 * `now` is injectable for testing — production callers pass nothing and get
 * `new Date()`.
 */

export function isTonight(eventDate: string, now: Date = new Date()): boolean {
  const ev = new Date(eventDate);
  return (
    ev.getFullYear() === now.getFullYear() &&
    ev.getMonth() === now.getMonth() &&
    ev.getDate() === now.getDate()
  );
}

export function isThisWeek(eventDate: string, now: Date = new Date()): boolean {
  const ev = new Date(eventDate);
  const end = new Date(now);
  end.setDate(now.getDate() + 7);
  return ev >= now && ev <= end;
}

export function isThisMonth(eventDate: string, now: Date = new Date()): boolean {
  const ev = new Date(eventDate);
  return (
    ev.getFullYear() === now.getFullYear() &&
    ev.getMonth() === now.getMonth() &&
    ev >= now
  );
}

export type DateFilterId = "all-dates" | "tonight" | "this-week" | "this-month";

export function matchesDateFilter(
  eventDate: string,
  filterId: DateFilterId,
  now: Date = new Date()
): boolean {
  switch (filterId) {
    case "all-dates":
      return true;
    case "tonight":
      return isTonight(eventDate, now);
    case "this-week":
      return isThisWeek(eventDate, now);
    case "this-month":
      return isThisMonth(eventDate, now);
  }
}
