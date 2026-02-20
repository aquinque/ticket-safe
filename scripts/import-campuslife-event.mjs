/**
 * import-campuslife-event.mjs
 *
 * Imports a CampusLife / CampusGroups event into the ticket-safe events table.
 *
 * Usage:
 *   npm run import:campuslife-event -- 378362
 *   node scripts/import-campuslife-event.mjs 378362
 *
 * Environment variables (set in .env or shell):
 *   SUPABASE_URL             — Supabase project URL (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY — Service-role key (never use the anon key here)
 *   CAMPUSLIFE_BASE_URL      — https://campuslife.escp.eu  (optional)
 *   CAMPUSLIFE_SESSION_COOKIE — your_session_cookie_value  (optional)
 *   CAMPUSLIFE_API_TOKEN     — API token if available       (optional)
 *
 * Strategy:
 *   1. Try to fetch live event details from CampusLife API using auth creds.
 *   2. Fall back to a hard-coded known-events map (populated from the
 *      screenshot / public event page).
 *   3. If the event ID is unknown and no auth works → create a minimal
 *      placeholder with needs_review=true.
 *   4. Upsert (idempotent): calling the script twice never duplicates.
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const CAMPUSLIFE_BASE =
  process.env.CAMPUSLIFE_BASE_URL ?? "https://campuslife.escp.eu";
const CAMPUSLIFE_COOKIE = process.env.CAMPUSLIFE_SESSION_COOKIE ?? "";
const CAMPUSLIFE_TOKEN = process.env.CAMPUSLIFE_API_TOKEN ?? "";

const EXTERNAL_SOURCE = "campusgroups/campuslife.escp.eu";

// ---------------------------------------------------------------------------
// Hard-coded known events (verified from screenshot / public page)
// ---------------------------------------------------------------------------

const KNOWN_EVENTS = {
  "378362": {
    title: "ESCP Intercampus Games 2026",
    description:
      "The ESCP Intercampus Games 2026 take place at Madrid Campus " +
      "(March 6–8, 2026). Students from all five campuses (Berlin, " +
      "London, Madrid, Paris, Turin) compete across multiple sports. " +
      "Venue: La Elipa Sports Club, Calle del Alcalde Garrido Juaristi " +
      "17, Madrid 28030, Spain. Organised by ESCP Business School – " +
      "Federal. 525 registered participants.",
    date: "2026-03-06T09:00:00+01:00",
    location: "La Elipa Sports Club - Madrid",
    category: "Sports",
    university: "ESCP Business School",
    campus: null, // multi-campus event
    is_active: true,
    base_price: null,
    image_url: null,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load .env file manually (no dotenv dependency required). */
function loadDotEnv() {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const envPath = path.resolve(process.cwd(), ".env");
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env not found — rely on shell env
  }
}

/**
 * Try to fetch event details from CampusLife using HTTP auth.
 * Returns null if auth is not configured or request fails.
 */
async function fetchFromCampusLife(eventId) {
  if (!CAMPUSLIFE_COOKIE && !CAMPUSLIFE_TOKEN) return null;

  const headers = {
    Accept: "application/json, text/html",
    "User-Agent": "ticket-safe-importer/1.0",
  };

  if (CAMPUSLIFE_TOKEN) {
    headers["Authorization"] = `Bearer ${CAMPUSLIFE_TOKEN}`;
  } else if (CAMPUSLIFE_COOKIE) {
    headers["Cookie"] = CAMPUSLIFE_COOKIE;
  }

  // CampusGroups typically exposes an event detail endpoint
  const url = `${CAMPUSLIFE_BASE}/feeds?type=event&type_id=${eventId}&tab=details&format=json`;

  try {
    const res = await fetch(url, { headers, redirect: "error" });
    if (!res.ok) {
      console.warn(
        `[CampusLife] HTTP ${res.status} for event ${eventId} — falling back to known data.`
      );
      return null;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) {
      // Got HTML (likely a login page redirect)
      console.warn(
        "[CampusLife] Response is not JSON (likely a login redirect) — " +
          "falling back to known data."
      );
      return null;
    }
    const data = await res.json();
    return parseCampusGroupsEvent(data);
  } catch (err) {
    console.warn(`[CampusLife] Fetch failed: ${err.message} — falling back.`);
    return null;
  }
}

/**
 * Parse a CampusGroups JSON event payload into our internal shape.
 * The exact field names vary by installation — adjust if needed.
 */
function parseCampusGroupsEvent(data) {
  const ev = data?.event ?? data?.data ?? data;
  if (!ev) return null;

  return {
    title: ev.name ?? ev.title ?? null,
    description: ev.description ?? ev.about ?? null,
    date: ev.start_date ?? ev.start_time ?? ev.date ?? null,
    location: ev.location ?? ev.venue ?? null,
    category: ev.category ?? ev.type ?? "Event",
    university: ev.organization ?? ev.organizer ?? "ESCP Business School",
    campus: ev.campus ?? null,
    is_active: true,
    base_price: ev.price ? parseFloat(ev.price) : null,
    image_url: ev.image_url ?? ev.photo_url ?? null,
  };
}

/**
 * Core upsert function — idempotent.
 * If a row with (external_source, external_event_id) already exists → update.
 * Otherwise → insert.
 */
async function upsertExternalEvent(supabase, { externalSource, externalEventId, ...details }) {
  // Check for existing row
  const { data: existing, error: fetchErr } = await supabase
    .from("events")
    .select("id")
    .eq("external_source", externalSource)
    .eq("external_event_id", externalEventId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;

  const payload = {
    ...details,
    external_source: externalSource,
    external_event_id: externalEventId,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("events")
      .update(payload)
      .eq("id", existing.id)
      .select("id, title, needs_review")
      .single();
    if (error) throw error;
    return { action: "updated", event: data };
  } else {
    const { data, error } = await supabase
      .from("events")
      .insert({ ...payload, created_at: new Date().toISOString() })
      .select("id, title, needs_review")
      .single();
    if (error) throw error;
    return { action: "inserted", event: data };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await loadDotEnv();

  const eventId = process.argv[2];
  if (!eventId) {
    console.error("Usage: node scripts/import-campuslife-event.mjs <event_id>");
    console.error("Example: node scripts/import-campuslife-event.mjs 378362");
    process.exit(1);
  }

  // Reload env after dotenv
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl) {
    console.error(
      "Missing SUPABASE_URL (or VITE_SUPABASE_URL). Set it in your .env file."
    );
    process.exit(1);
  }
  if (!serviceKey) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Get it from:\n" +
        "  Supabase Dashboard → Settings → API → service_role key\n" +
        "Then add it to your .env file."
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  console.log(`\nImporting CampusLife event ID: ${eventId}`);
  console.log("─".repeat(50));

  // 1. Try live fetch
  let details = await fetchFromCampusLife(eventId);

  // 2. Fall back to known events map
  if (!details && KNOWN_EVENTS[eventId]) {
    console.log(`Using hard-coded known-event data for ID ${eventId}.`);
    details = KNOWN_EVENTS[eventId];
  }

  // 3. Last resort: placeholder
  if (!details) {
    console.warn(
      `No data available for event ${eventId}. Creating placeholder (needs_review=true).`
    );
    details = {
      title: `ESCP CampusLife Event #${eventId}`,
      description:
        `Auto-imported placeholder from CampusLife. ` +
        `Source URL: ${CAMPUSLIFE_BASE}/feeds?type=event&type_id=${eventId}&tab=details\n` +
        `Please fill in the correct title, date, location and description, then set needs_review=false.`,
      date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ahead
      location: "TBC",
      category: "Event",
      university: "ESCP Business School",
      campus: null,
      is_active: true,
      base_price: null,
      image_url: null,
    };
  }

  // needs_review = true if placeholder OR if key fields are missing
  const needsReview =
    !details.title ||
    !details.date ||
    !details.location ||
    details.location === "TBC" ||
    details.title.startsWith("ESCP CampusLife Event #");

  const result = await upsertExternalEvent(supabase, {
    externalSource: EXTERNAL_SOURCE,
    externalEventId: eventId,
    ...details,
    needs_review: needsReview,
  });

  console.log(`✓ Event ${result.action}: "${result.event.title}"`);
  console.log(`  ID:           ${result.event.id}`);
  console.log(`  needs_review: ${result.event.needs_review}`);

  if (result.event.needs_review) {
    console.log(
      "\n⚠  This event is marked for review. Update title/date/location in the\n" +
        "   Supabase Dashboard → Table Editor → events, then set needs_review=false."
    );
  } else {
    console.log(
      "\n✓  Event is live and selectable in the Sell Ticket flow immediately."
    );
  }
  console.log("─".repeat(50));
}

main().catch((err) => {
  console.error("Fatal error:", err.message ?? err);
  process.exit(1);
});
