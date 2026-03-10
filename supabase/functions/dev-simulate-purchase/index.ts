/**
 * dev-simulate-purchase — DEV ONLY
 *
 * Simulates a completed Stripe payment without touching Stripe.
 * Use on localhost to test nominative ticket assignment.
 *
 * POST body: { listingId: string }
 * Auth: Bearer <user-jwt>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Auth
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let listingId: string;
  try {
    ({ listingId } = await req.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Fetch listing
  const { data: listing } = await supabase
    .from("tickets")
    .select("id, seller_id, selling_price, quantity, status")
    .eq("id", listingId)
    .in("status", ["available", "reserved"])
    .maybeSingle();

  if (!listing) return json({ error: "Listing not available" }, 404);
  if (listing.seller_id === user.id) return json({ error: "Cannot buy your own ticket" }, 400);

  const qty = listing.quantity ?? 1;
  const total = listing.selling_price * qty;
  const fee = Math.round(total * 5) / 100;

  // Create transaction
  const { data: tx } = await supabase
    .from("transactions")
    .insert({
      buyer_id: user.id,
      seller_id: listing.seller_id,
      ticket_id: listingId,
      amount: total,
      fee_amount: fee,
      quantity: qty,
      status: "completed",
    })
    .select("id")
    .single();

  // Mark ticket sold + nominative
  await supabase
    .from("tickets")
    .update({ status: "sold", buyer_id: user.id })
    .eq("id", listingId);

  console.log("[dev-simulate-purchase] ticket sold", { listingId, buyerId: user.id, txId: tx?.id });

  return json({ success: true, transactionId: tx?.id, buyerId: user.id });
});
