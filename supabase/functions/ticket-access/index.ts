/**
 * ticket-access — shows a ticket to a buyer who has no account.
 *
 * GET  /functions/v1/ticket-access?t=<ticket token>          one ticket (link in the confirmation email)
 * GET  /functions/v1/ticket-access?t=<ticket token>&qr=png   the ticket's QR as a PNG, for the email's
 *                                                             ticket card; a grey "no longer valid" square
 *                                                             once the ticket is used, refunded or resold
 * POST /functions/v1/ticket-access  { order_token }           the tickets of one order (success page)
 *
 * No JWT: the token is the credential. Only its SHA-256 hash is stored
 * (guest_access_tokens). An unknown or wrong-type token always gets the same 404.
 * The QR content is the ticket's qr_token, unchanged: the door scanner reads it
 * exactly as before. It is returned only while the ticket is valid.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { ACCESS_TOKEN_PATTERN, hashAccessToken } from "../_shared/guestAccess.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

const notFound = () => json({ error: "Ticket not found" }, 404);

/** Grey placeholder (an empty QR frame, crossed) shown in the email once the ticket can no longer be used. */
const NO_LONGER_VALID_PNG = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAARgAAAEYCAIAAAAI7H7bAAAC1ElEQVR42u3dsa3CMBRAUUAeIqWr7MEK9ExHzwoMQE2TKnQegzY0gATGeck5HQ35sv/VixQrbK+3+wb4zs4SgJBASLAUafqhz50VgQ8NYzGRwK0dCAmEBAgJhARCAiEBQgIhgZBASICQQEggJBASICQQEggJhAQICYQEQgKEBEKCuUj1vnr6HspAvG7W/ppI4NYOhARCAoQEQgIhAUICIcF8pFYXbniAIOgj+VjWtr8mEggJhARCAoQEQgIhgZAAIYGQQEggJEBIICQQEggJEBIICYQEQgKEBEICIYGQACGBkEBIgJBASCAkEBIgJBASCAmEBAgJhARCAiEBQoJ/SK0uPIzF6i/Y2vbXRAIhgZBASICQQEggJBASICSopOLJhj531nfB7K+JBEICIYGQACGBkEBIICRASCAkEBIICRASCAmEBEIChARCAiGBkAAhgZBASICQQEggJBASICQQEggJhAQICYQEQgIhAUICIYGQQEiAkEBIICQQEiAkEBKEliL+0afzxc4t2/GwN5HArR0gJBASCAmEBAgJGgv5HCncQwZMJEBIICQQEggJEBIICYQEQgKEBEICIYGQACGBkEBIgJBASCAkEBIgJBASCAmEBAgJhARCAiEBQgIhgZBASICQQEggJBASICQQEggJEBIICYQEQgKEBD+V6n31MJaIK9Lnzr8FJhIICYQEQgKEBEICIQFCAiHBTKRWF254gCDokQtMJBASICQQEggJhAQICYQEQgIhAUICIYGQQEiAkEBIICRASCAkEBIICRASCAmEBEIChARCAiGBkAAhgZBASCAkQEggJBASCAkQEggJhARrl1pdeBiL1cdEAoQEQgIhgZAAIYGQQEggJOC1iicb+txZX0wkQEggJBASCAkQEggJhARCAoQEQgIhAUICIYGQQEiAkEBIICQQEiAkEBIICYQEvPX0gkg/RwkmEggJhAQr9wALeylbtLRyKAAAAABJRU5ErkJggg==",
), (c) => c.charCodeAt(0));

/**
 * The QR the door scans, as a PNG the email's ticket card shows. Read again each time the email is
 * opened, so a ticket that has been used, refunded or resold shows a grey square, never a stale QR.
 */
async function qrPng(qrToken: string | null): Promise<Response> {
  const headers = { ...cors, "Content-Type": "image/png", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex" };
  if (!qrToken) return new Response(NO_LONGER_VALID_PNG, { status: 200, headers });
  const dataUrl: string = await QRCode.toDataURL(qrToken, { errorCorrectionLevel: "M", margin: 2, width: 560, color: { dark: "#000000", light: "#FFFFFF" } });
  const bytes = Uint8Array.from(atob(dataUrl.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
  return new Response(bytes, { status: 200, headers });
}

type Supabase = ReturnType<typeof createClient>;

/** "TS-4F2A-91A0": the reference printed under the QR (same as the email and the PDF). */
const ticketRef = (id: string) => `TS-${id.slice(0, 4).toUpperCase()}-${id.slice(-4).toUpperCase()}`;

async function ticketView(supabase: Supabase, ticketId: string) {
  const { data: t } = await supabase
    .from("event_tickets")
    .select("status, qr_token, holder_first_name, holder_last_name, event_id, tier_id, order_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return null;
  const [{ data: ev }, { data: tier }, { data: order }] = await Promise.all([
    supabase.from("events").select("title, date, location, banner_url, primary_color, ends_at, last_entry_at").eq("id", t.event_id).maybeSingle(),
    supabase.from("event_tiers").select("name, entry_until").eq("id", t.tier_id).maybeSingle(),
    t.order_id
      ? supabase.from("event_orders").select("total_cents, quantity, currency").eq("id", t.order_id).maybeSingle()
      : Promise.resolve({ data: null as { total_cents: number | null; quantity: number | null; currency: string | null } | null }),
  ]);
  const qty = Math.max(1, order?.quantity ?? 1);
  return {
    status: t.status,
    holder_name: [t.holder_first_name, t.holder_last_name].filter(Boolean).join(" ") || null,
    tier_name: tier?.name ?? null,
    // What one ticket cost the buyer, as on My Tickets and the PDF.
    price_cents: order?.total_cents != null ? Math.round(order.total_cents / qty) : null,
    currency: order?.currency ?? "EUR",
    ref: ticketRef(ticketId),
    entry_until: tier?.entry_until ?? null,
    event: {
      title: ev?.title ?? null,
      date: ev?.date ?? null,
      location: ev?.location ?? null,
      banner_url: ev?.banner_url ?? null,
      accent: ev?.primary_color ?? null,
      ends_at: ev?.ends_at ?? null,
      last_entry_at: ev?.last_entry_at ?? null,
    },
    // Same value the door scanner reads. Withheld once the ticket is no longer valid.
    qr_token: t.status === "valid" ? t.qr_token : null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return json({ error: "Server misconfigured." }, 500);
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Rate limit per client IP, so a token cannot be tried at high speed. Fails open. The QR image is left
  // out: mail providers fetch it through a few shared proxy addresses, and it only ever answers for a
  // token that already exists (256 random bits, which cannot be guessed).
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const qrImage = req.method === "GET" && new URL(req.url).searchParams.get("qr") === "png";
  if (!qrImage) try {
    const { data: ok } = await supabase.rpc("rate_limit_consume", {
      p_bucket: "guest_ticket_access",
      p_key: ip,
      p_max_hits: 60,
      p_window_sec: 60,
    });
    if (ok === false) return json({ error: "Too many requests. Please wait a minute." }, 429);
  } catch {
    /* fail open */
  }

  let token: string | null = null;
  let orderMode = false;
  if (req.method === "GET") {
    token = new URL(req.url).searchParams.get("t");
  } else if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { order_token?: string };
    token = body.order_token ?? null;
    orderMode = true;
  } else {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!token || !ACCESS_TOKEN_PATTERN.test(token)) return notFound();

  const { data: row } = await supabase
    .from("guest_access_tokens")
    .select("scope, ticket_id, order_id")
    .eq("token_hash", await hashAccessToken(token))
    .maybeSingle();
  if (!row) return notFound();

  if (!orderMode && row.scope === "ticket" && row.ticket_id) {
    const ticket = await ticketView(supabase, row.ticket_id);
    if (!ticket) return notFound();
    if (new URL(req.url).searchParams.get("qr") === "png") return qrPng(ticket.qr_token);
    return json({ ticket });
  }

  if (orderMode && row.scope === "order" && row.order_id) {
    const { data: order } = await supabase
      .from("event_orders")
      .select("status")
      .eq("id", row.order_id)
      .maybeSingle();
    if (!order) return notFound();
    // Still processing: the page polls until the webhook has issued the tickets.
    if (order.status !== "paid") return json({ status: order.status });

    const { data: tickets } = await supabase
      .from("event_tickets")
      .select("id")
      .eq("order_id", row.order_id)
      .order("created_at", { ascending: true });
    const views = await Promise.all((tickets ?? []).map((t) => ticketView(supabase, t.id)));
    return json({ status: "paid", tickets: views.filter((v) => v !== null) });
  }

  return notFound();
});
