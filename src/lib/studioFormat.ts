/**
 * Formatting helpers shared by the Studio pages: money, counts and, above
 * all, time. Studio pages are organised around *when* (next event, this
 * week, last used), so the same phrases must read the same everywhere.
 */

export const DAY_MS = 86_400_000;

export const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** "€12", "€1,240", or with decimals "€12.50". */
export const eur = (cents: number, decimals = 0) =>
  `€${(cents / 100).toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export type Phase = "today" | "upcoming" | "past";

export function phaseOf(iso: string, now = new Date()): Phase {
  const day = startOfDay(new Date(iso)).getTime();
  const today = startOfDay(now).getTime();
  if (day === today) return "today";
  return day > today ? "upcoming" : "past";
}

/** "Tonight at 19:50", "Tomorrow", "In 27 days", "Yesterday", "12 days ago". */
export function whenLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (days === 0) return `${d.getHours() >= 17 ? "Tonight" : "Today"} at ${fmtTime(iso)}`;
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `In ${days} days`;
  return `${-days} days ago`;
}

/** "just now", "5 min ago", "2 h ago", "yesterday", "3 days ago", then a date. */
export function relativeTime(iso: string, now = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round((startOfDay(now).getTime() - startOfDay(new Date(iso)).getTime()) / DAY_MS);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return fmtDate(iso);
}
