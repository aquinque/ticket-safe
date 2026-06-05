/**
 * event-ticket-qr — generate the QR image for an event ticket the caller owns.
 *
 * GET /functions/v1/event-ticket-qr?ticket_id=<uuid>
 * Authorization: Bearer <user-jwt>
 *
 * Returns an SVG of the ticket's qr_token, only if:
 *   1. The caller is authenticated.
 *   2. event_tickets.buyer_id matches the caller.
 *
 * The qr_token never leaves our infra and is never sent to a third-party
 * QR generator. The buyer renders the result inline in My Tickets.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import QRCode from "https://esm.sh/qrcode@1.5.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) return json({ error: "Server misconfigured." }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Invalid or expired token" }, 401);

    const url = new URL(req.url);
    const ticketId = url.searchParams.get("ticket_id");
    if (!ticketId || !/^[0-9a-f-]{36}$/i.test(ticketId)) {
      return json({ error: "Invalid ticket_id" }, 400);
    }

    const { data: ticket, error: tErr } = await supabase
      .from("event_tickets")
      .select("id, buyer_id, qr_token")
      .eq("id", ticketId)
      .maybeSingle();
    if (tErr || !ticket) return json({ error: "Ticket not found" }, 404);
    if (ticket.buyer_id !== user.id) return json({ error: "Forbidden" }, 403);

    // Low ECC + generous margin: the qr_token is a ~225-char JWT, which at
    // ECC=M needs Version 9 (53x53 modules). At a 192px on-screen render,
    // each module is ~3.5px — borderline for phone-to-phone scanning. Drop
    // to ECC=L (7% redundancy is plenty for a screen-rendered QR — it isn't
    // a printed sticker that has to survive scuffs) so it fits in fewer
    // modules and each one is bigger and easier to scan. Margin=4 (the
    // QR spec "quiet zone" recommendation) also helps camera detection.
    // Width=512 gives the SVG a generous intrinsic size; SVG scales
    // losslessly, but a higher baseline means downstream rasterisations
    // (PDF) are sharper.
    const svg: string = await QRCode.toString(String(ticket.qr_token), {
      type: "svg",
      errorCorrectionLevel: "L",
      margin: 4,
      width: 512,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    return new Response(svg, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "image/svg+xml",
        // Authed user-specific resource — never share via CDN.
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("[event-ticket-qr]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: "Could not generate QR.", details: msg }, 500);
  }
});
