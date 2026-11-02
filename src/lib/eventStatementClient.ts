/**
 * The browser side of the event-statement function (the financial statement PDF built from
 * Stripe): one call helper and one "open what the function gives us" helper, shared by the
 * statement card on the event page and the export menu of the Sales archive.
 */
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Calls the event-statement function as the signed-in user. Throws with the function's message on an error. */
export async function callStatement<T>(eventId: string, action: string): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-statement`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ event_id: eventId, action }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data as T;
}

/** Opens a URL the function will give us in a tab created inside the click, so the browser does not block it. */
export async function openFromFunction(eventId: string, action: "download" | "dashboard_link") {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const { url } = await callStatement<{ url: string }>(eventId, action);
    if (tab) tab.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  } catch (err) {
    tab?.close();
    toast.error(err instanceof Error ? err.message : "Something went wrong.");
  }
}
