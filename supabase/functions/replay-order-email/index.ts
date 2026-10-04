import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBuyerEmail, renderTicketCard, buildTicketUrls, deriveFirstName } from "./_shared/buyerEmail.ts";

// Reconciled with the deployed function. The only addition is the "Open my ticket"
// link per ticket (guest_access_tokens, scope 'ticket'). Tokens are hashed before storage.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

// Copy of the helpers in _shared/guestAccess.ts. This function is deployed on its own.
function newAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hashAccessToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";

// Returns the link for one ticket, or "" if it could not be saved (the email is still sent).
async function createTicketLink(supabase: ReturnType<typeof createClient>, ticketId: string): Promise<string> {
  try {
    const token = newAccessToken();
    const { error } = await supabase.from("guest_access_tokens").insert({
      token_hash: await hashAccessToken(token),
      scope: "ticket",
      ticket_id: ticketId,
    });
    if (error) {
      console.warn("[replay-order-email] ticket link not saved:", error);
      return "";
    }
    return `${SITE_URL}/t/${token}`;
  } catch (e) {
    console.warn("[replay-order-email] ticket link skipped:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const adminSecret = Deno.env.get("REPLAY_ADMIN_SECRET") ?? "ts-replay-secret-2026";
  if (!supabaseUrl || !supabaseKey || !resendKey) return json({ error: "misconfig" }, 500);

  const body = await req.json().catch(() => ({}));
  const orderId = body.order_id as string;
  if (!orderId || typeof orderId !== "string") return json({ error: "missing order_id" }, 400);

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Authorize: a back-office admin_secret, OR the signed-in buyer of this order
  // (resending their own ticket email), OR a platform admin.
  const viaSecret = !!body.admin_secret && body.admin_secret === adminSecret;
  let callerId: string | null = null;
  if (!viaSecret) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
      callerId = user?.id ?? null;
    }
  }

  const { data: ord } = await supabase.from("event_orders").select("id, buyer_id, buyer_email, event_id, tier_id, quantity, total_cents, fee_cents, status").eq("id", orderId).maybeSingle();
  if (!ord) return json({ error: "order not found" }, 404);

  if (!viaSecret) {
    let allowed = !!callerId && ord.buyer_id === callerId;
    if (!allowed && callerId) {
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
      allowed = !!role;
    }
    if (!allowed) return json({ error: "You can only resend your own ticket email." }, 403);
  }

  // Rate limit so the email endpoint can't be hammered. Fails open.
  try {
    const { data: rlOk } = await supabase.rpc("rate_limit_consume", { p_bucket: "replay_email", p_key: callerId ?? orderId, p_max_hits: 4, p_window_sec: 300 });
    if (rlOk === false) return json({ error: "Too many resend attempts. Please wait a few minutes." }, 429);
  } catch { /* fail open */ }

  if (ord.status !== "paid") return json({ error: `This order isn't payable (status: ${ord.status}).` }, 409);

  const [{ data: evRow }, { data: tierRow }, { data: tickets }, { data: prof }] = await Promise.all([
    supabase.from("events").select("id, title, date, location, slug, organizer_id").eq("id", ord.event_id).maybeSingle(),
    supabase.from("event_tiers").select("name").eq("id", ord.tier_id).maybeSingle(),
    supabase.from("event_tickets").select("id, qr_token, holder_first_name, holder_last_name, holder_email").eq("order_id", orderId),
    supabase.from("profiles").select("full_name").eq("id", ord.buyer_id).maybeSingle(),
  ]);
  const evTitle = evRow?.title ?? "Your event";
  const evDate = evRow?.date ? new Date(evRow.date).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const evLocation = evRow?.location ?? "";
  const tierName = tierRow?.name ?? "Standard";
  const qty = ord.quantity ?? (tickets?.length ?? 1);
  const total = (ord.total_cents ?? 0) / 100;
  const firstName = deriveFirstName(ord.buyer_email, (prof as { full_name?: string } | null)?.full_name ?? null);
  const blocks: string[] = [];
  for (let i = 0; i < (tickets ?? []).length; i++) {
    const t = tickets![i];
    const holder = [t.holder_first_name, t.holder_last_name].filter(Boolean).join(" ").trim();
    const holderEmail = t.holder_email && t.holder_email !== ord.buyer_email ? t.holder_email : "";
    const refShort = `TS-${t.id.slice(0, 4).toUpperCase()}-${t.id.slice(-4).toUpperCase()}`;
    const { qr, apple, google } = buildTicketUrls(supabaseUrl, t.id);
    const ticketUrl = await createTicketLink(supabase, t.id);
    blocks.push(renderTicketCard({ idx: i + 1, total: tickets!.length, holder, holderEmail, tierName, evDate, evLocation, qrUrl: qr, refShort, appleWalletUrl: apple, googleWalletUrl: google, ticketUrl }));
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Ticket Safe <noreply@ticket-safe.eu>",
      to: [ord.buyer_email],
      subject: `🎫 Your ticket${qty > 1 ? "s" : ""} for ${evTitle}`,
      html: renderBuyerEmail({ firstName, evTitle, evDate, evLocation, tierName, totalEUR: total, ticketBlocksHtml: blocks.join(""), qty: tickets?.length ?? 1 }),
    }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[replay-order-email] resend failed:", result);
    return json({ error: "Email service rejected the message. Please try again later." }, 502);
  }
  return json({ ok: true, tickets_count: tickets?.length ?? 0 }, 200);
});
