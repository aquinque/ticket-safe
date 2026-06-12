/**
 * revolut-boost-checkout — pay to "feature" a resale listing (Deno).
 * Creates a Revolut order for the boost fee and returns its checkout URL.
 * Activation (set tickets.boosted_until) is done by revolut-boost-confirm when
 * the buyer returns from Revolut. The seller can only boost their OWN listing.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Server-side price list — never trust a client-supplied price.
const BOOST_PRICES_CENTS: Record<number, number> = { 3: 99, 7: 199, 30: 499 };

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

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Session expired. Please log in again." }, 401);

    try {
      const { data: rlOk } = await supabase.rpc("rate_limit_consume", { p_bucket: "boost_checkout", p_key: user.id, p_max_hits: 12, p_window_sec: 60 });
      if (rlOk === false) return json({ error: "Too many attempts. Please wait a minute." }, 429);
    } catch { /* fail open */ }

    let listingId: string;
    let days: number;
    try {
      const body = await req.json();
      listingId = body.listingId;
      days = Number(body.days);
    } catch { return json({ error: "Invalid request." }, 400); }
    if (!listingId || typeof listingId !== "string") return json({ error: "listingId is required." }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)) return json({ error: "Invalid listing identifier." }, 400);
    const amountCents = BOOST_PRICES_CENTS[days];
    if (!amountCents) return json({ error: "Invalid boost duration." }, 400);

    // The listing must exist, belong to the seller, and still be active.
    const { data: listing, error: listingError } = await supabase
      .from("tickets")
      .select("id, seller_id, status, events(title)")
      .eq("id", listingId)
      .maybeSingle();
    if (listingError || !listing) return json({ error: "Listing not found." }, 404);
    if (listing.seller_id !== user.id) return json({ error: "You can only boost your own listing." }, 403);
    if (listing.status !== "available") return json({ error: "Only active listings can be boosted." }, 400);

    const { data: order, error: orderErr } = await supabase
      .from("boost_orders")
      .insert({ ticket_id: listingId, seller_id: user.id, days, amount_cents: amountCents, status: "pending" })
      .select("id").single();
    if (orderErr || !order) throw new Error("Failed to create boost order: " + orderErr?.message);

    const eventTitle = (listing.events as { title?: string } | null)?.title ?? "your listing";
    const revRes = await fetch(`${revolutBase}/orders`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${revolutSecret}`, "Revolut-Api-Version": revolutApiVersion, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        amount: amountCents,
        currency: "EUR",
        description: `Boost (${days} days) — ${eventTitle}`,
        merchant_order_data: { reference: order.id },
        metadata: { boost_order_id: order.id, source: "boost", listing_id: listingId, seller_id: user.id, days: String(days) },
        redirect_url: `${siteUrl}/checkout/success?boost=${order.id}`,
      }),
    });
    const revText = await revRes.text();
    let revOrder: { id?: string; checkout_url?: string } = {};
    try { revOrder = JSON.parse(revText); } catch { /* empty */ }
    if (!revRes.ok || !revOrder.checkout_url || !revOrder.id) {
      console.error("[revolut-boost-checkout] revolut order failed:", revRes.status, revText);
      await supabase.from("boost_orders").update({ status: "failed" }).eq("id", order.id);
      return json({ error: "Could not start the Revolut checkout. Please try again." }, 502);
    }

    await supabase.from("boost_orders").update({ revolut_order_id: revOrder.id }).eq("id", order.id);
    return json({ checkout_url: revOrder.checkout_url, boost_id: order.id, provider: "revolut" });
  } catch (err) {
    console.error("[revolut-boost-checkout]", err);
    return json({ error: "Failed to create checkout session. Please try again." }, 500);
  }
});
