// revolut-test — Revolut Merchant helper.
// POST {} -> creates a test order with the SAME payload shape as the real
//   checkout (redirect_url + metadata) and returns the raw response.
// POST {"action":"register_webhook"} / {"action":"list_webhooks"}.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("REVOLUT_MERCHANT_SECRET_KEY");
  const base = (Deno.env.get("REVOLUT_MERCHANT_BASE") ?? "https://merchant.revolut.com/api").replace(/\/+$/, "");
  const apiVersion = Deno.env.get("REVOLUT_API_VERSION") ?? "2024-09-01";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const ticketSecret = Deno.env.get("TICKET_SIGNING_SECRET") ? "SET" : "MISSING";
  if (!secret) return json({ ok: false, error: "REVOLUT_MERCHANT_SECRET_KEY not set" }, 500);
  const headers = { "Authorization": `Bearer ${secret}`, "Revolut-Api-Version": apiVersion, "Content-Type": "application/json", "Accept": "application/json" };
  const body = await req.json().catch(() => ({})) as { action?: string };
  async function call(method: string, path: string, payload?: unknown) {
    const res = await fetch(`${base}${path}`, { method, headers, body: payload ? JSON.stringify(payload) : undefined });
    const text = await res.text(); let parsed: unknown = text; try { parsed = JSON.parse(text); } catch { /* raw */ }
    return { status: res.status, ok: res.ok, body: parsed };
  }
  try {
    if (body.action === "register_webhook") { const r = await call("POST", "/webhooks", { url: `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/revolut-webhook`, events: ["ORDER_COMPLETED"] }); return json({ ok: r.ok, r }, 200); }
    if (body.action === "list_webhooks") { const r = await call("GET", "/webhooks"); return json({ ok: r.ok, r }, 200); }
    // EXACT payload shape used by revolut-create-checkout:
    const r = await call("POST", "/orders", {
      amount: 100, currency: "EUR", description: "Ticket Safe — payload test",
      merchant_order_data: { reference: "TS-TEST-ORDER" },
      metadata: { order_id: "test", source: "studio_primary_sale" },
      redirect_url: `${(Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu")}/checkout/success?order_id=test&provider=revolut`,
    });
    return json({ ok: r.ok, ticket_signing_secret: ticketSecret, base, api_version: apiVersion, revolut: r }, 200);
  } catch (err) { return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200); }
});
