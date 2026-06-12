/**
 * revolut-boost-confirm — activates a paid boost (Deno).
 * Called from the success page on return from Revolut. Re-verifies the Revolut
 * order is "completed" (server-side source of truth), then sets the listing's
 * boosted_until. Idempotent — safe to call multiple times / on refresh.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DAY_MS = 24 * 60 * 60 * 1000;

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
  if (!supabaseUrl || !supabaseKey) return json({ error: "Server misconfigured." }, 500);
  if (!revolutSecret) return json({ error: "Revolut not configured." }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Session expired." }, 401);

    let boostId: string;
    try {
      const body = await req.json();
      boostId = body.boostId;
    } catch { return json({ error: "Invalid request." }, 400); }
    if (!boostId || typeof boostId !== "string") return json({ error: "boostId is required." }, 400);

    const { data: order } = await supabase
      .from("boost_orders")
      .select("id, ticket_id, seller_id, days, status, revolut_order_id")
      .eq("id", boostId)
      .eq("seller_id", user.id)
      .maybeSingle();
    if (!order) return json({ error: "Boost order not found." }, 404);
    if (order.status === "active") return json({ status: "active" });
    if (!order.revolut_order_id) return json({ status: "pending" });

    // Re-verify with Revolut — the order must be completed (paid).
    let revState = "";
    try {
      const r = await fetch(`${revolutBase}/orders/${order.revolut_order_id}`, {
        headers: { "Authorization": `Bearer ${revolutSecret}`, "Revolut-Api-Version": revolutApiVersion, "Accept": "application/json" },
      });
      if (!r.ok) return json({ status: "pending", note: "lookup failed" });
      revState = String((await r.json()).state ?? "");
    } catch (e) {
      console.error("[revolut-boost-confirm] lookup error", e);
      return json({ status: "pending", note: "lookup error" });
    }
    if (revState !== "completed") return json({ status: "pending", state: revState });

    // Idempotent activation: only the first caller flips pending -> active.
    const { data: claimed } = await supabase
      .from("boost_orders")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) return json({ status: "active" });

    // Extend boosted_until from the later of now / current value.
    const { data: ticket } = await supabase
      .from("tickets")
      .select("boosted_until")
      .eq("id", order.ticket_id)
      .maybeSingle();
    const now = Date.now();
    const current = ticket?.boosted_until ? new Date(ticket.boosted_until).getTime() : 0;
    const base = Math.max(now, current);
    const boostedUntil = new Date(base + order.days * DAY_MS).toISOString();
    await supabase.from("tickets").update({ boosted_until: boostedUntil }).eq("id", order.ticket_id);

    return json({ status: "active", boosted_until: boostedUntil });
  } catch (err) {
    console.error("[revolut-boost-confirm]", err);
    return json({ error: "Failed to confirm boost." }, 500);
  }
});
