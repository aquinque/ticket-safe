/**
 * revolut-resale-checkout — resale marketplace via Revolut Merchant (Deno).
 * Mirrors stripe-create-checkout but creates a Revolut order. Buyer pays the
 * accepted-offer price (or listing price) + a tiered fee (6%, or 7% when the
 * unit price is >= 50 EUR). Completion (mark sold, transfer ticket) is handled
 * by revolut-webhook.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUYER_FEE_PERCENT = 6;
const BUYER_FEE_PERCENT_HIGH = 7;
const HIGH_VALUE_THRESHOLD_EUR = 50;
const RESERVATION_TTL_MS = 30 * 60 * 1000;
const MAX_UNIT_PRICE_EUR = 5000;
const MAX_QUANTITY = 50;
const MIN_UNIT_PRICE_EUR = 0.5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const revolutSecret = Deno.env.get("REVOLUT_MERCHANT_SECRET_KEY");
  const revolutBase = (Deno.env.get("REVOLUT_MERCHANT_BASE") ?? "https://merchant.revolut.com/api").replace(/\/+$/, "");
  const revolutApiVersion = Deno.env.get("REVOLUT_API_VERSION") ?? "2024-09-01";
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
  if (!supabaseUrl || !supabaseKey) return json({ error: "Server misconfigured." }, 500);
  if (!revolutSecret) return json({ error: "Revolut not configured." }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey);
  let reservedListingId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Session expired. Please log in again." }, 401);

    try {
      const { data: rlOk } = await supabase.rpc("rate_limit_consume", { p_bucket: "resale_checkout", p_key: user.id, p_max_hits: 12, p_window_sec: 60 });
      if (rlOk === false) return json({ error: "Too many checkout attempts. Please wait a minute and try again." }, 429);
    } catch { /* fail open */ }

    let listingId: string;
    try {
      const body = await req.json();
      listingId = body.listingId;
    } catch { return json({ error: "Invalid request." }, 400); }
    if (!listingId || typeof listingId !== "string") return json({ error: "listingId is required." }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)) return json({ error: "Invalid listing identifier." }, 400);

    const cutoff = new Date(Date.now() - RESERVATION_TTL_MS).toISOString();
    await supabase.from("tickets").update({ status: "available" }).eq("status", "reserved").lt("updated_at", cutoff);
    await supabase.from("tickets").update({ status: "available" }).eq("id", listingId).eq("status", "reserved");

    const { data: listing, error: listingError } = await supabase.from("tickets").select("*, events(id, title, description, date, location)").eq("id", listingId).eq("status", "available").maybeSingle();
    if (listingError || !listing) return json({ error: "This ticket is no longer available." }, 404);
    if (listing.seller_id === user.id) return json({ error: "You cannot purchase your own ticket." }, 400);

    const { data: reserved } = await supabase.from("tickets").update({ status: "reserved" }).eq("id", listingId).eq("status", "available").select("id");
    if (!reserved || reserved.length === 0) return json({ error: "This ticket was just purchased by someone else." }, 409);
    reservedListingId = listingId;

    let negotiatedPrice: number | null = null;
    {
      const { data: acceptedOffer } = await supabase
        .from("offers")
        .select("price, conversation:conversations!inner(ticket_id, buyer_id)")
        .eq("status", "accepted")
        .eq("conversations.ticket_id", listingId)
        .eq("conversations.buyer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (acceptedOffer && Number.isFinite(acceptedOffer.price) && acceptedOffer.price > 0) negotiatedPrice = acceptedOffer.price;
    }

    const qty = Math.min(Math.max(1, listing.quantity ?? 1), MAX_QUANTITY);
    const rawUnitPrice = negotiatedPrice ?? listing.selling_price;
    const unitPrice = Math.min(Math.max(MIN_UNIT_PRICE_EUR, Number(rawUnitPrice) || 0), MAX_UNIT_PRICE_EUR);
    const subtotalCents = Math.round(unitPrice * 100) * qty;
    const buyerFeePercent = unitPrice >= HIGH_VALUE_THRESHOLD_EUR ? BUYER_FEE_PERCENT_HIGH : BUYER_FEE_PERCENT;
    const buyerFeeCents = Math.round(subtotalCents * (buyerFeePercent / 100));
    const totalCents = subtotalCents + buyerFeeCents;

    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        buyer_id: user.id, seller_id: listing.seller_id, ticket_id: listingId,
        amount: totalCents / 100, fee_amount: buyerFeeCents / 100, quantity: qty, status: "pending",
      })
      .select("id").single();
    if (txErr || !tx) throw new Error("Failed to create transaction: " + txErr?.message);

    const eventTitle = (listing.events as { title?: string } | null)?.title ?? "Event Ticket";
    const revRes = await fetch(`${revolutBase}/orders`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${revolutSecret}`, "Revolut-Api-Version": revolutApiVersion, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        amount: totalCents,
        currency: "EUR",
        description: `${eventTitle} (resale) — incl. ${buyerFeePercent}% fee`,
        merchant_order_data: { reference: tx.id },
        metadata: { transaction_id: tx.id, source: "resale", listing_id: listingId, buyer_id: user.id, seller_id: listing.seller_id },
        redirect_url: `${siteUrl}/checkout/success?tx=${tx.id}&provider=revolut`,
      }),
    });
    const revText = await revRes.text();
    let revOrder: { id?: string; checkout_url?: string } = {};
    try { revOrder = JSON.parse(revText); } catch { /* empty */ }
    if (!revRes.ok || !revOrder.checkout_url || !revOrder.id) {
      console.error("[revolut-resale-checkout] revolut order failed:", revRes.status, revText);
      if (reservedListingId) await supabase.from("tickets").update({ status: "available" }).eq("id", reservedListingId);
      await supabase.from("transactions").update({ status: "cancelled" }).eq("id", tx.id);
      return json({ error: "Could not start the Revolut checkout. Please try again." }, 502);
    }

    await supabase.from("transactions").update({ stripe_checkout_session_id: `revolut:${revOrder.id}` }).eq("id", tx.id);
    reservedListingId = null;
    return json({ checkout_url: revOrder.checkout_url, session_id: revOrder.id, provider: "revolut" });
  } catch (err) {
    console.error("[revolut-resale-checkout]", err);
    if (reservedListingId) await supabase.from("tickets").update({ status: "available" }).eq("id", reservedListingId);
    return json({ error: "Failed to create checkout session. Please try again." }, 500);
  }
});
