/**
 * replay-resale-email — sends (or re-sends) the resale completion emails:
 * seller "your ticket sold" + buyer "your ticket is confirmed", via the
 * provider-agnostic sendResaleCompletionEmails (_shared/sendResaleCompletionEmails.ts).
 *
 * Mirrors replay-order-email's shape exactly, one level down (resale
 * transactions instead of Studio event_orders):
 *   - admin_secret (REPLAY_ADMIN_SECRET) for webhook/internal callers —
 *     this is what a future Stripe resale webhook will use.
 *   - or the signed-in buyer OR seller of that transaction, for a
 *     "resend" button in the UI.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendResaleCompletionEmails } from "../_shared/sendResaleCompletionEmails.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const replaySecret = Deno.env.get("REPLAY_ADMIN_SECRET") ?? "ts-replay-secret-2026";
  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: { transaction_id?: string; admin_secret?: string; provider?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const transactionId = body.transaction_id;
  if (!transactionId || !/^[0-9a-f-]{36}$/i.test(transactionId)) return json({ error: "Invalid transaction_id" }, 400);

  const { data: tx } = await supabase.from("transactions").select("id, buyer_id, seller_id, status").eq("id", transactionId).maybeSingle();
  if (!tx) return json({ error: "Transaction not found" }, 404);
  if (tx.status !== "completed") return json({ error: "This transaction has not completed." }, 400);

  const isAdminCall = !!body.admin_secret && body.admin_secret === replaySecret;
  if (!isAdminCall) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user || (user.id !== tx.buyer_id && user.id !== tx.seller_id)) return json({ error: "Unauthorized" }, 403);
  }

  if (!resendKey) return json({ error: "Email not configured" }, 500);

  const result = await sendResaleCompletionEmails({
    supabase,
    resendApiKey: resendKey,
    transactionId,
    provider: body.provider ?? "revolut",
  });

  if (!result.ok) return json({ error: result.error ?? "Failed to send resale emails" }, 500);
  return json(result);
});
