/**
 * admin-review-ticket — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/admin-review-ticket
 * Body: { ticketId: string; action: "approve" | "reject"; reason?: string }
 *
 * Only callable by users with role = 'admin' in user_roles table.
 *
 * approve → verification_status = 'verified'  (ticket goes live)
 * reject  → verification_status = 'rejected', status = 'cancelled'
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify caller
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Invalid session" }, 401);

    // Check admin role
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleRow?.role !== "admin") {
      return json({ error: "Admin access required" }, 403);
    }

    // Parse body
    let body: { ticketId?: string; action?: string; reason?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { ticketId, action, reason } = body;
    if (!ticketId || (action !== "approve" && action !== "reject")) {
      return json({ error: "ticketId and action (approve|reject) are required" }, 400);
    }

    if (action === "approve") {
      const { error } = await supabase
        .from("tickets")
        .update({ verification_status: "verified" })
        .eq("id", ticketId)
        .eq("verification_status", "pending"); // only approve pending tickets

      if (error) return json({ error: error.message }, 500);

      console.log("[admin-review-ticket] approved", { ticketId, adminId: user.id });
      return json({ success: true, action: "approved", ticketId });
    }

    // reject
    const { error } = await supabase
      .from("tickets")
      .update({
        verification_status: "rejected",
        status: "cancelled",
        notes: reason ? `[REJECTED] ${reason}` : "[REJECTED by admin]",
      })
      .eq("id", ticketId);

    if (error) return json({ error: error.message }, 500);

    console.log("[admin-review-ticket] rejected", { ticketId, adminId: user.id, reason });
    return json({ success: true, action: "rejected", ticketId });

  } catch (err) {
    console.error("[admin-review-ticket] error:", err);
    return json({ error: "Server error" }, 500);
  }
});
