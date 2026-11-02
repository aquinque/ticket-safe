/**
 * export-event-sales — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/export-event-sales
 * Authorization: Bearer <organizer-or-admin JWT>
 * Body: { event_id, tz? }   tz: the browser's IANA zone for the dates in the file (Europe/Paris when missing or unknown)
 *
 * Answers with the sales of one event as a CSV file: text/csv, UTF-8 with a byte-order mark, one line per ticket
 * sold, built by _shared/eventSalesCsv.ts (pure, unit tested). The file comes as an attachment named
 * {event-slug}-sales-YYYY-MM-DD.csv (Content-Disposition, exposed to the browser) with its number of lines in
 * X-Row-Count; errors are JSON, like the other Studio functions.
 *
 * Who: the organizer who owns the event, or an admin (user_roles.role = 'admin'). The reads run under the service
 * role, so this check is the only guard and runs before any sales row is loaded. Buyer names come from profiles
 * here (the browser can never read another user's profile), then from the ticket holder, then from the order's
 * first attendee.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEventSalesCsv, resolveTimeZone, type SalesOrder, type SalesProfile, type SalesTicket, type SalesTier } from "../_shared/eventSalesCsv.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  // The browser reads the file name and the line count off the response.
  "Access-Control-Expose-Headers": "Content-Disposition, X-Row-Count",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Rows per database read: an event with more orders or tickets than this is read page by page. */
const PAGE_SIZE = 1000;
/** Buyer ids per profiles lookup. */
const PROFILE_BATCH = 200;

const ORDER_COLUMNS = "id, buyer_id, buyer_email, attendees, quantity, unit_price_cents, total_cents, fee_cents, discount_cents, currency, tier_id, status, stripe_payment_intent_id, stripe_checkout_session_id, paid_at, created_at, refunded_at";
const TICKET_COLUMNS = "id, order_id, tier_id, buyer_id, holder_first_name, holder_last_name, holder_email, status, scanned_at, created_at";

interface PageResult {
  data: unknown;
  error: { message: string } | null;
}

/** Every row of a query, read in pages of PAGE_SIZE; the query must carry a stable order for the pages to tile. */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const rows: T[] = [];
  // At most 100 pages: a guard against a runaway loop, far beyond any event.
  for (let from = 0; from < 100 * PAGE_SIZE; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length === 0) break;
  }
  return rows;
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

  let body: { event_id?: string; tz?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const eventId = body.event_id;
  if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "Invalid event_id" }, 400);
  const tz = resolveTimeZone(body.tz);

  const { data: event } = await supabase
    .from("events")
    .select("id, title, slug, date, ends_at, organizer_id, currency")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return json({ error: "Event not found" }, 404);
  const { data: organizer } = await supabase.from("organizer_profiles").select("id, user_id").eq("id", event.organizer_id).maybeSingle();
  if (!organizer) return json({ error: "Organizer not found" }, 404);
  if (organizer.user_id !== user.id) {
    const { data: adminRow } = await supabase.from("user_roles").select("user_id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!adminRow) return json({ error: "This event is not yours." }, 403);
  }

  const startedAt = Date.now();
  try {
    const { data: tierRows, error: tierErr } = await supabase.from("event_tiers").select("id, name").eq("event_id", eventId);
    if (tierErr) throw new Error(tierErr.message);
    const orders = await readAll<SalesOrder>((from, to) =>
      supabase
        .from("event_orders")
        .select(ORDER_COLUMNS)
        .eq("event_id", eventId)
        .in("status", ["paid", "refunded"])
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to));
    const tickets = await readAll<SalesTicket>((from, to) =>
      supabase
        .from("event_tickets")
        .select(TICKET_COLUMNS)
        .eq("event_id", eventId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to));

    const buyerIds = [...new Set(orders.map((o) => o.buyer_id).filter((id): id is string => !!id))];
    const profiles: SalesProfile[] = [];
    for (let i = 0; i < buyerIds.length; i += PROFILE_BATCH) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name")
        .in("id", buyerIds.slice(i, i + PROFILE_BATCH));
      if (error) throw new Error(error.message);
      profiles.push(...((data ?? []) as SalesProfile[]));
    }

    const { csv, rowCount, filename } = buildEventSalesCsv({
      event: { id: event.id, title: event.title, slug: event.slug, currency: event.currency },
      orders,
      tickets,
      tiers: (tierRows ?? []) as SalesTier[],
      profiles,
      tz,
      now: new Date(),
    });
    console.log(`[export-event-sales] event ${eventId}: ${rowCount} lines in ${Date.now() - startedAt} ms`);
    return new Response(csv, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Row-Count": String(rowCount),
      },
    });
  } catch (err) {
    console.error(`[export-event-sales] export failed for event ${eventId}:`, err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
