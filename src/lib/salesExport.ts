/**
 * The CSV export of one past event's sales. The export-event-sales function builds the file
 * (every order of the event, dates in the organizer's time zone, BOM included) for the
 * signed-in organizer, and the browser saves what comes back under the name the function chose.
 */
import { supabase } from "@/integrations/supabase/client";
import { filenameFromDisposition } from "@/lib/salesArchive";

/** Saves a blob through a temporary link, the way the admin payout batches are downloaded. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** `{slug}-sales-YYYY-MM-DD.csv`, for a response that names no file. */
export const fallbackSalesFilename = (slug: string | null | undefined, date: Date = new Date()): string =>
  `${slug || "event"}-sales-${date.toISOString().slice(0, 10)}.csv`;

/**
 * Downloads the sales CSV of an event. Throws with the function's message ('Export failed.'
 * when it gives none) when the export is refused; resolves with the file name once the
 * download has started.
 */
export async function downloadEventSalesCsv(eventId: string, slug: string | null | undefined): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${base}/functions/v1/export-event-sales`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      // The gateway wants the project key next to the user's token (see AdminPayouts).
      ...(apikey ? { apikey } : {}),
    },
    body: JSON.stringify({ event_id: eventId, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof data.error === "string" && data.error ? data.error : "Export failed.");
  }
  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get("Content-Disposition")) ?? fallbackSalesFilename(slug);
  saveBlob(blob, filename);
  return filename;
}
