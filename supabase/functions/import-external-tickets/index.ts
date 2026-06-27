/**
 * import-external-tickets — Supabase Edge Function (Deno)
 *
 * NEW (external ticket import). Lets an approved organizer import externally
 * sourced tickets (nightclub / partner allocations) into one of THEIR events.
 *
 * It creates (or reuses) an `event_tier` flagged `source = 'external'` — so the
 * allocation shows up in the normal storefront and reuses the existing
 * checkout / inventory / email / QR pipeline untouched — and inserts the
 * per-ticket rows into `external_ticket_inventory`.
 *
 * Supported import methods:
 *   - "manual": N placeholder allocations (no per-ticket code; the platform
 *      issues its own QR on sale).
 *   - "list":   explicit rows from a CSV / file upload, each carrying a
 *      ticket_code / external_reference / provider / notes / uploaded file path.
 *
 * Set `dry_run: true` to validate + dedup and get a preview WITHOUT writing —
 * used by the wizard's "Preview" step.
 *
 * Safety: duplicate external codes (within the batch or already in the event)
 * are detected and skipped; capacity is kept in sync by a DB trigger; the
 * tier is created inactive when `publish=false` (draft) so it can never be
 * reserved/sold until published.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_PRICE_CENTS = 50;
const MAX_PRICE_CENTS = 500_000;
const MAX_BATCH = 5000;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

interface RowIn {
  external_code?: string;
  external_reference?: string;
  original_provider?: string;
  notes?: string;
  uploaded_file_url?: string; // object PATH in the private 'external-tickets' bucket
  ticket_type?: string;
}

interface Body {
  event_id?: string;
  tier_id?: string;            // reuse an existing external tier
  tier_name?: string;          // or create a new category, e.g. "Club Entry" / "VIP"
  price_cents?: number;        // platform resale price (required when creating a tier)
  original_provider?: string;  // batch-level provider, e.g. "Teatro Kapital"
  notes?: string;              // batch-level internal note
  publish?: boolean;           // true => available now; false => draft
  method?: "manual" | "list";
  quantity?: number;           // for "manual"
  rows?: RowIn[];              // for "list"
  dry_run?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured." }, 500);
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // ── Auth: identify the caller from their JWT ──────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    let body: Body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const eventId = body.event_id;
    if (!eventId || !UUID_RE.test(eventId)) return json({ error: "Invalid event_id" }, 400);
    const method = body.method === "list" ? "list" : "manual";
    const publish = body.publish === true;
    const dryRun = body.dry_run === true;

    // ── Ownership: caller must be the approved organizer of this event ────
    const { data: ev } = await admin
      .from("events")
      .select("id, organizer_id, organizer:organizer_profiles!events_organizer_id_fkey(user_id, status)")
      .eq("id", eventId)
      .maybeSingle();
    if (!ev) return json({ error: "Event not found" }, 404);
    const orgRaw = (ev as { organizer?: unknown }).organizer;
    const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
    if (!org || org.user_id !== user.id || org.status !== "approved") {
      return json({ error: "You do not manage this event." }, 403);
    }

    // ── Build the list of rows to import ─────────────────────────────────
    let rows: RowIn[] = [];
    if (method === "manual") {
      const qty = Math.floor(body.quantity ?? 0);
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_BATCH) {
        return json({ error: `Quantity must be between 1 and ${MAX_BATCH}.` }, 400);
      }
      rows = Array.from({ length: qty }).map(() => ({}));
    } else {
      const provided = Array.isArray(body.rows) ? body.rows : [];
      if (provided.length < 1 || provided.length > MAX_BATCH) {
        return json({ error: `Provide between 1 and ${MAX_BATCH} ticket rows.` }, 400);
      }
      rows = provided.map((r) => ({
        external_code: (r.external_code ?? "").trim() || undefined,
        external_reference: (r.external_reference ?? "").trim() || undefined,
        original_provider: (r.original_provider ?? "").trim() || undefined,
        notes: (r.notes ?? "").trim() || undefined,
        uploaded_file_url: (r.uploaded_file_url ?? "").trim() || undefined,
        ticket_type: (r.ticket_type ?? "").trim() || undefined,
      }));
    }

    // ── Dedup: within the batch and against existing rows in this event ──
    const seen = new Set<string>();
    const dupInBatch = new Set<string>();
    for (const r of rows) {
      if (!r.external_code) continue;
      if (seen.has(r.external_code)) dupInBatch.add(r.external_code);
      seen.add(r.external_code);
    }
    const codes = [...seen];
    let dupExisting: string[] = [];
    if (codes.length > 0) {
      const { data: existing } = await admin
        .from("external_ticket_inventory")
        .select("external_code")
        .eq("event_id", eventId)
        .in("external_code", codes);
      dupExisting = (existing ?? []).map((e: { external_code: string }) => e.external_code);
    }
    const duplicates = [...new Set([...dupInBatch, ...dupExisting])];

    // Keep only rows whose code is unique (rows without a code are always kept).
    const dupSet = new Set(duplicates);
    const batchSeen = new Set<string>();
    const toInsert = rows.filter((r) => {
      if (!r.external_code) return true;
      if (dupSet.has(r.external_code)) return false;
      if (batchSeen.has(r.external_code)) return false;
      batchSeen.add(r.external_code);
      return true;
    });

    // ── Preview only ─────────────────────────────────────────────────────
    if (dryRun) {
      return json({
        ok: true,
        preview: {
          total: rows.length,
          to_insert: toInsert.length,
          duplicates,
          with_code: rows.filter((r) => r.external_code).length,
          with_file: rows.filter((r) => r.uploaded_file_url).length,
        },
      });
    }

    if (toInsert.length === 0) {
      return json({ error: "Nothing to import — all rows were duplicates.", duplicates }, 409);
    }

    // ── Resolve / create the external tier (ticket category) ─────────────
    let tierId = body.tier_id;
    if (tierId) {
      if (!UUID_RE.test(tierId)) return json({ error: "Invalid tier_id" }, 400);
      const { data: tier } = await admin
        .from("event_tiers")
        .select("id, event_id, source")
        .eq("id", tierId)
        .maybeSingle();
      if (!tier || tier.event_id !== eventId) return json({ error: "Tier not found for this event." }, 404);
      if (tier.source !== "external") return json({ error: "Target tier is not an external tier." }, 400);
    } else {
      const tierName = (body.tier_name ?? "").trim();
      if (tierName.length < 1 || tierName.length > 100) return json({ error: "A ticket category name is required." }, 400);
      const price = Math.floor(body.price_cents ?? 0);
      if (!Number.isInteger(price) || price < MIN_PRICE_CENTS || price > MAX_PRICE_CENTS) {
        return json({ error: `Price must be between €${(MIN_PRICE_CENTS / 100).toFixed(2)} and €${MAX_PRICE_CENTS / 100}.` }, 400);
      }
      const { count } = await admin
        .from("event_tiers")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId);
      const { data: newTier, error: tierErr } = await admin
        .from("event_tiers")
        .insert({
          event_id: eventId,
          name: tierName,
          price_cents: price,
          currency: "EUR",
          total_qty: 0,              // kept in sync by the capacity trigger
          is_active: publish,        // draft tier (is_active=false) can never be reserved
          sort_order: count ?? 0,
          max_per_order: 10,
          source: "external",        // <-- marks this as an imported allocation
        })
        .select("id")
        .single();
      if (tierErr || !newTier) return json({ error: tierErr?.message ?? "Could not create the ticket category." }, 500);
      tierId = newTier.id;
    }

    // Price recorded on each allocation for audit (falls back to the tier price).
    const { data: tierPriceRow } = await admin.from("event_tiers").select("price_cents").eq("id", tierId).maybeSingle();
    const priceCents = (body.price_cents && body.price_cents > 0) ? Math.floor(body.price_cents) : (tierPriceRow?.price_cents ?? null);

    // ── Insert the allocations ───────────────────────────────────────────
    const rowStatus = publish ? "available" : "draft";
    const records = toInsert.map((r) => ({
      event_id: eventId,
      tier_id: tierId,
      source: "external",
      original_provider: r.original_provider ?? body.original_provider ?? null,
      external_code: r.external_code ?? null,
      external_reference: r.external_reference ?? null,
      uploaded_file_url: r.uploaded_file_url ?? null,
      platform_price_cents: priceCents,
      status: rowStatus,
      notes: r.notes ?? body.notes ?? null,
      created_by: user.id,
    }));

    const { error: insErr, count: insCount } = await admin
      .from("external_ticket_inventory")
      .insert(records, { count: "exact" });
    if (insErr) return json({ error: insErr.message }, 500);

    return json({
      ok: true,
      tier_id: tierId,
      inserted: insCount ?? records.length,
      skipped_duplicates: duplicates,
      published: publish,
    });
  } catch (err) {
    console.error("[import-external-tickets] unexpected:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
