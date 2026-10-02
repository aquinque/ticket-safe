/**
 * login-guard — service_role wrapper around the account-lockout RPCs
 * (check_account_lockout / increment_failed_login / reset_failed_login).
 *
 * Those RPCs were locked down to service_role-only in
 * 20260613100000_lock_down_lockout_functions.sql (anon/authenticated can no
 * longer call them directly), which is why Auth.tsx calls this edge
 * function instead. 5 failed attempts locks the account for 15 minutes —
 * the RPCs own that policy, this function is just the privileged relay.
 *
 * Fails safe in both directions: a DB error on "check" reports not-locked
 * (never blocks a legitimate login because the guard itself is down), and
 * on "fail"/"success" a DB error is swallowed — these are best-effort
 * bookkeeping, not the login itself.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return json({ locked: false, error: "Server misconfigured." }, 200);
  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: { action?: string; email?: string };
  try { body = await req.json(); } catch { return json({ locked: false }, 200); }

  const action = body.action;
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ locked: false }, 200);
  }

  try {
    if (action === "check") {
      const { data, error } = await supabase.rpc("check_account_lockout", { user_email: email });
      if (error) { console.error("[login-guard] check error:", error); return json({ locked: false }, 200); }
      return json({ locked: !!data }, 200);
    }
    if (action === "fail") {
      const { error } = await supabase.rpc("increment_failed_login", { user_email: email });
      if (error) console.error("[login-guard] increment error:", error);
      return json({ ok: true }, 200);
    }
    if (action === "success") {
      const { error } = await supabase.rpc("reset_failed_login", { user_email: email });
      if (error) console.error("[login-guard] reset error:", error);
      return json({ ok: true }, 200);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[login-guard] unexpected:", err);
    return json({ locked: false }, 200);
  }
});
