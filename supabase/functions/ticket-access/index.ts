/**
 * ticket-access — shows a ticket to a buyer who has no account.
 *
 * GET  /functions/v1/ticket-access?t=<ticket token>   one ticket (link in the confirmation email)
 * POST /functions/v1/ticket-access  { order_token }    the tickets of one order (success page)
 *
 * No JWT: the token is the credential. Only its SHA-256 hash is stored
 * (guest_access_tokens). An unknown or wrong-type token always gets the same 404.
 * The QR content is the ticket's qr_token, unchanged: the door scanner reads it
 * exactly as before. It is returned only while the ticket is valid.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

type Supabase = ReturnType<typeof createClient>;

async function ticketView(supabase: Supabase, ticketId: string) {
  const { data: t } = await supabase
    .from("event_tickets")
    .select("status, qr_token, holder_first_name, holder_last_name, event_id, tier_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return null;
  const [{ data: ev }, { data: tier }] = await Promise.all([
    supabase.from("events").select("title, date, location").eq("id", t.event_id).maybeSingle(),
    supabase.from("event_tiers").select("name").eq("id", t.tier_id).maybeSingle(),
  ]);
  return {
    status: t.status,
    holder_name: [t.holder_first_name, t.holder_last_name].filter(Boolean).join(" ") || null,
    tier_name: tier?.name ?? null,
    event: { title: ev?.title ?? null, date: ev?.date ?? null, location: ev?.location ?? null },
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

  // Rate limit per client IP, so a token cannot be tried at high speed. Fails open.
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  try {
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
    return ticket ? json({ ticket }) : notFound();
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
