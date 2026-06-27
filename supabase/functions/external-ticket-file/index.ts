/**
 * external-ticket-file — Supabase Edge Function (Deno)
 *
 * NEW (external ticket import). Returns a short-lived signed URL for the
 * ORIGINAL partner/club ticket file attached to an imported ticket the caller
 * actually owns. The 'external-tickets' storage bucket is PRIVATE, so buyers
 * can never read it directly — they go through this ownership-checked endpoint.
 *
 * Mirrors the (now-dead) generate-ticket-download-url pattern but for the new
 * private bucket and the event_tickets ownership model.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UUID_RE = /^[0-9a-f-]{36}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured." }, 500);
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    let body: { ticket_id?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const ticketId = body.ticket_id;
    if (!ticketId || !UUID_RE.test(ticketId)) return json({ error: "Invalid ticket_id" }, 400);

    // Ownership + external check.
    const { data: ticket } = await admin
      .from("event_tickets")
      .select("id, buyer_id, source, external_file_url")
      .eq("id", ticketId)
      .maybeSingle();
    if (!ticket || ticket.buyer_id !== user.id) return json({ error: "Ticket not found or not yours." }, 403);
    if (ticket.source !== "external" || !ticket.external_file_url) {
      return json({ error: "This ticket has no original file." }, 404);
    }

    // external_file_url stores the object PATH inside the private bucket.
    const { data: signed, error: signErr } = await admin
      .storage
      .from("external-tickets")
      .createSignedUrl(ticket.external_file_url, 3600);
    if (signErr || !signed) return json({ error: "Could not generate the download link." }, 500);

    return json({ url: signed.signedUrl });
  } catch (err) {
    console.error("[external-ticket-file] unexpected:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
