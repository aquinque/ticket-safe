/**
 * event-statement — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/event-statement
 * Authorization: Bearer <organizer-or-admin JWT>
 * Body: { event_id, action }
 *   status         → the latest statement (figures for the card), whether one can be regenerated now, admin flag
 *   download       → a signed URL to the latest PDF, valid one hour (the bucket is private; no public URL exists)
 *   regenerate     → a fresh statement from Stripe, at most once every 10 minutes per event
 *   dashboard_link → a single-use login link to the organizer's Stripe Express dashboard, made now, never stored
 *
 * Who: the organizer who owns the event, or an admin (user_roles.role = 'admin'). Stripe is only ever called
 * from here, with the platform key: nothing of it reaches the browser.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createDashboardLink, getStripeClient } from "../_shared/stripeConnect.ts";
import { STATEMENTS_BUCKET, generateEventStatement, latestStatement, type StatementRow } from "../_shared/eventStatement.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SIGNED_URL_TTL_SECONDS = 3600;
const REGENERATE_EVERY_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const ACTIONS = new Set(["status", "download", "regenerate", "dashboard_link"]);

/** What the card gets: the row without the fingerprint; the reconciliation only for an admin. */
function publicStatement(row: StatementRow, isAdmin: boolean) {
  const { data_hash: _hash, discrepancy, totals, ...rest } = row;
  void _hash;
  const { reconciliation, ...publicTotals } = totals;
  return {
    ...rest,
    totals: publicTotals,
    ...(isAdmin ? { discrepancy, reconciliation } : {}),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured." }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing authorization header" }, 401);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: { event_id?: string; action?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const eventId = body.event_id;
  const action = body.action ?? "status";
  if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "Invalid event_id" }, 400);
  if (!ACTIONS.has(action)) return json({ error: "Unknown action" }, 400);

  const { data: event } = await supabase
    .from("events")
    .select("id, title, date, ends_at, status, organizer_id, payment_provider")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return json({ error: "Event not found" }, 404);
  const { data: organizer } = await supabase.from("organizer_profiles").select("id, user_id").eq("id", event.organizer_id).maybeSingle();
  if (!organizer) return json({ error: "Organizer not found" }, 404);

  let isAdmin = false;
  if (organizer.user_id !== user.id) {
    const { data: adminRow } = await supabase.from("user_roles").select("user_id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!adminRow) return json({ error: "Forbidden — not your event" }, 403);
    isAdmin = true;
  } else {
    const { data: adminRow } = await supabase.from("user_roles").select("user_id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    isAdmin = !!adminRow;
  }

  const endsAt = new Date(event.ends_at ?? event.date);
  const availableFrom = new Date(endsAt.getTime() + DAY_MS);
  const now = Date.now();

  const status = async (extra: Record<string, unknown> = {}) => {
    const latest = await latestStatement(supabase, eventId);
    const { data: lastManual } = await supabase
      .from("event_statements")
      .select("generated_at")
      .eq("event_id", eventId)
      .eq("trigger", "manual")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextAllowed = lastManual ? new Date(new Date(lastManual.generated_at).getTime() + REGENERATE_EVERY_MS) : null;
    return json({
      event: { id: event.id, ends_at: endsAt.toISOString(), available_from: availableFrom.toISOString(), ended: endsAt.getTime() <= now, stripe: event.payment_provider === "stripe" },
      is_admin: isAdmin,
      statement: latest ? publicStatement(latest, isAdmin) : null,
      can_regenerate_at: nextAllowed && nextAllowed.getTime() > now ? nextAllowed.toISOString() : null,
      ...extra,
    });
  };

  const signedUrl = async (row: StatementRow) => {
    const { data, error } = await supabase.storage.from(STATEMENTS_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not sign the download URL");
    return data.signedUrl;
  };

  try {
    switch (action) {
      case "status":
        return await status();

      case "download": {
        const latest = await latestStatement(supabase, eventId);
        if (!latest) return json({ error: "No statement yet." }, 404);
        return json({ url: await signedUrl(latest), expires_in: SIGNED_URL_TTL_SECONDS, version: latest.version });
      }

      case "regenerate": {
        if (event.payment_provider !== "stripe") return json({ error: "This event is not paid through Stripe." }, 409);
        if (endsAt.getTime() > now) return json({ error: "The statement is available once the event has ended." }, 409);
        const { data: lastManual } = await supabase
          .from("event_statements")
          .select("generated_at")
          .eq("event_id", eventId)
          .eq("trigger", "manual")
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastManual) {
          const elapsed = now - new Date(lastManual.generated_at).getTime();
          if (elapsed < REGENERATE_EVERY_MS) {
            const retryAfter = Math.ceil((REGENERATE_EVERY_MS - elapsed) / 1000);
            return json({ error: `Please wait ${Math.ceil(retryAfter / 60)} min before regenerating again.`, retry_after_seconds: retryAfter }, 429);
          }
        }
        const stripe = getStripeClient();
        const result = await generateEventStatement(
          { supabase, stripe, resendKey: Deno.env.get("RESEND_API_KEY"), siteUrl: Deno.env.get("SITE_URL") ?? undefined },
          { eventId, trigger: "manual", force: true, allowEmpty: true },
        );
        if (result.outcome === "skipped") {
          const reasons: Record<string, string> = {
            no_connect_account: "Set up Stripe payments in Ticket Studio first.",
            not_stripe: "This event is not paid through Stripe.",
            no_sales: "No Stripe payment yet.",
            event_not_found: "Event not found.",
            organizer_not_found: "Organizer not found.",
          };
          return json({ error: reasons[result.reason] ?? result.reason }, 409);
        }
        return await status({ url: await signedUrl(result.statement) });
      }

      case "dashboard_link": {
        const { data: account } = await supabase.from("stripe_connect_accounts").select("stripe_account_id").eq("organizer_id", organizer.id).maybeSingle();
        if (!account?.stripe_account_id) return json({ error: "No Stripe account yet." }, 404);
        const url = await createDashboardLink(getStripeClient(), account.stripe_account_id);
        return json({ url });
      }
    }
  } catch (err) {
    console.error(`[event-statement] ${action} failed for event ${eventId}:`, err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
  return json({ error: "Unknown action" }, 400);
});
