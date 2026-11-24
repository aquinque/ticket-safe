/**
 * Studio demo mode, development builds only: every Studio page opens with sample data, without an
 * account. While it is on, every request the Supabase client would send (database, functions, auth,
 * storage) is answered here from rows kept in memory, so nothing is read from or written to the real
 * database. Changes made in the demo (a new promo code, an edited event) last until the page reloads.
 *
 * Start: /studio/demo. Stop: "Exit demo" in the Studio banner. See App.tsx and supabase/client.ts.
 */

const FLAG = "ts.studio.demo";
const SESSION_BACKUP = "ts.studio.demo.realSession";
const DEMO_USER_ID = "00000000-0000-4000-8000-00000000d0e0";
const ORG_ID = "00000000-0000-4000-8000-0000000000a1";

const DAY = 86_400_000;
const MIN = 60_000;

export function isStudioDemo(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

function authStorageKey(): string {
  const ref = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");

/** Turns the demo on: a made-up signed-in organizer, kept apart from any real session on this computer. */
export function startStudioDemo(): void {
  if (!import.meta.env.DEV || isStudioDemo()) return;
  const key = authStorageKey();
  const real = localStorage.getItem(key);
  if (real) sessionStorage.setItem(SESSION_BACKUP, real);
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  const user = {
    id: DEMO_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "demo@ticket-safe.eu",
    app_metadata: { provider: "email" },
    user_metadata: { full_name: "Demo Organizer" },
    created_at: new Date(Date.now() - 200 * DAY).toISOString(),
  };
  localStorage.setItem(key, JSON.stringify({
    access_token: `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: DEMO_USER_ID, role: "authenticated", exp })}.demo`,
    token_type: "bearer",
    expires_in: 365 * 24 * 3600,
    expires_at: exp,
    refresh_token: "demo",
    user,
  }));
  sessionStorage.setItem(FLAG, "1");
}

/** Turns the demo off and puts back the real session, if there was one. */
export function stopStudioDemo(): void {
  const key = authStorageKey();
  const real = sessionStorage.getItem(SESSION_BACKUP);
  if (real) localStorage.setItem(key, real);
  else localStorage.removeItem(key);
  sessionStorage.removeItem(SESSION_BACKUP);
  sessionStorage.removeItem(FLAG);
}

// ── Sample data ──────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

const FIRST = ["Emma", "Hugo", "Inès", "Lucas", "Chloé", "Louis", "Sofía", "Mateo", "Léa", "Tom", "Carla", "Jules", "Nora", "Pablo", "Alice", "Oscar", "Lola", "Adam", "Zoé", "Marco"];
const LAST = ["Martin", "Bernard", "García", "Dubois", "Rossi", "Moreau", "López", "Laurent", "Schmidt", "Petit", "Fernández", "Roux", "Costa", "Fontaine", "Navarro", "Girard"];

/** A repeatable pseudo-random number, so the demo shows the same people on every load. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const uid = (prefix: string, n: number) => `${prefix}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function build(): Db {
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const at = (days: number, hour: number) => {
    const d = new Date(now + days * DAY);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };

  const EV_LIVE = uid("e1", 1);
  const EV_DRAFT = uid("e1", 2);
  const EV_PAST = uid("e1", 3);

  const baseEvent = {
    organizer_id: ORG_ID, category: "party", currency: "EUR", payment_provider: "stripe", banner_url: null, video_url: null,
    primary_color: "#3D5FE0", resale_enabled: true, resale_max_price_cents: null, is_private: false, age_restriction: null,
    require_gender: false, require_attendee_names: true, created_at: iso(now - 40 * DAY), updated_at: iso(now - 2 * DAY),
  };
  const events: Row[] = [
    { ...baseEvent, id: EV_LIVE, title: "Winter Kick-off · Ayala 120", slug: "demo-winter-kick-off", status: "published",
      description: "The first big night of the winter term. Doors at 23:00, two rooms, coat check included.",
      date: iso(at(9, 23)), ends_at: iso(at(10, 5)), location: "Ayala 120, Madrid" },
    { ...baseEvent, id: EV_DRAFT, title: "Spring Gala", slug: "demo-spring-gala", status: "draft",
      description: "Black tie dinner and party. Seated dinner for 200, then open doors.",
      date: iso(at(45, 20)), ends_at: iso(at(46, 3)), location: "Palacio de Santoña, Madrid", category: "gala" },
    { ...baseEvent, id: EV_PAST, title: "Halloween Night", slug: "demo-halloween-night", status: "published",
      description: "Costume party. Best costume wins a table.",
      date: iso(at(-21, 23)), ends_at: iso(at(-20, 5)), location: "Teatro Barceló, Madrid" },
  ];

  const tier = (n: number, event_id: string, name: string, price: number, total: number, sold: number, sort: number, extra: Row = {}): Row => ({
    id: uid("71", n), event_id, name, description: null, price_cents: price, currency: "EUR", total_qty: total, sold_qty: sold, reserved_qty: 0,
    sort_order: sort, is_active: true, sales_start_at: null, sales_end_at: null, max_per_order: 6, kind: "ticket", capacity_per_unit: 1,
    source: "studio", opens_after_tier_id: null, resale_max_price_cents: null, created_at: iso(now - 40 * DAY), ...extra,
  });
  const event_tiers: Row[] = [
    tier(1, EV_LIVE, "Early bird", 1000, 40, 40, 0),
    tier(2, EV_LIVE, "Regular", 1300, 150, 60, 1),
    tier(3, EV_LIVE, "VIP table (6 people)", 9000, 8, 2, 2, { kind: "table", capacity_per_unit: 6, max_per_order: 1 }),
    tier(4, EV_DRAFT, "Dinner + party", 6500, 200, 0, 0),
    tier(5, EV_DRAFT, "Party only", 2500, 300, 0, 1),
    tier(6, EV_PAST, "Regular", 1200, 250, 231, 0),
    tier(7, EV_PAST, "Last release", 1500, 60, 48, 1),
  ];

  const event_orders: Row[] = [];
  const event_tickets: Row[] = [];
  const rnd = seeded(42);
  let orderN = 0;
  let ticketN = 0;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

  const sell = (eventId: string, t: Row, tickets: number, fromDaysAgo: number, toDaysAgo: number, scannedShare: number) => {
    let left = tickets;
    while (left > 0) {
      const qty = Math.min(left, t.kind === "table" ? 1 : 1 + Math.floor(rnd() * 3));
      left -= qty;
      const created = now - (toDaysAgo + rnd() * (fromDaysAgo - toDaysAgo)) * DAY;
      const first = pick(FIRST);
      const last = pick(LAST);
      const email = `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@example.com";
      const unit = t.price_cents as number;
      const fee = qty * Math.max(70, 80 + Math.round(unit * 0.04));
      const id = uid("0d", ++orderN);
      const refunded = eventId === EV_PAST && orderN % 37 === 0;
      event_orders.push({
        id, event_id: eventId, organizer_id: ORG_ID, tier_id: t.id, buyer_id: null, buyer_email: email, attendees: null,
        quantity: qty, unit_price_cents: unit, total_cents: qty * unit + fee, fee_cents: fee, discount_cents: 0, currency: "EUR",
        status: refunded ? "refunded" : "paid", paid_at: iso(created), created_at: iso(created), refunded_at: refunded ? iso(created + DAY) : null, promo_code_id: null,
      });
      for (let i = 0; i < qty; i++) {
        const scanned = !refunded && rnd() < scannedShare;
        const f = i === 0 ? first : pick(FIRST);
        const l = i === 0 ? last : pick(LAST);
        event_tickets.push({
          id: uid("7c", ++ticketN), order_id: id, event_id: eventId, tier_id: t.id, buyer_id: null,
          holder_first_name: f, holder_last_name: l, holder_email: i === 0 ? email : null, holder_gender: rnd() < 0.5 ? "female" : "male",
          status: refunded ? "refunded" : scanned ? "used" : "valid",
          scanned_at: scanned ? iso(at(-21, 23) + rnd() * 3 * 3600_000) : null, created_at: iso(created),
        });
      }
    }
  };
  sell(EV_LIVE, event_tiers[0], 40, 30, 14, 0);
  sell(EV_LIVE, event_tiers[1], 60, 14, 0.002, 0);
  sell(EV_LIVE, event_tiers[2], 2, 10, 2, 0);
  sell(EV_PAST, event_tiers[5], 231, 50, 22, 0.86);
  sell(EV_PAST, event_tiers[6], 48, 23, 21.2, 0.9);

  const paid = (ev: string) => event_orders.filter((o) => o.event_id === ev && o.status === "paid");
  const net = (ev: string) => paid(ev).reduce((n, o) => n + (o.total_cents as number) - (o.fee_cents as number), 0);
  const fees = (ev: string) => paid(ev).reduce((n, o) => n + (o.fee_cents as number), 0);
  const pastNet = net(EV_PAST);
  const liveNet = net(EV_LIVE);

  return {
    organizer_profiles: [{
      id: ORG_ID, user_id: DEMO_USER_ID, name: "Demo Society", slug: "demo-society", org_type: "student_association",
      contact_name: "Camille Durand", contact_email: "demo@ticket-safe.eu", website: "https://example.com", about: "The student events society. Four big nights a term.",
      logo_url: null, primary_color: "#3D5FE0", status: "approved", rejection_reason: null, approved_at: iso(now - 180 * DAY),
      created_at: iso(now - 200 * DAY), updated_at: iso(now - 3 * DAY), siren: null, rna_number: "W751234567",
      billing_address_line1: "12 rue de l'Exemple", billing_postal_code: "75011", billing_city: "Paris", billing_country: "FR",
      payout_iban: "FR7630006000011234567890189", payout_iban_holder: "Demo Society",
    }],
    events,
    event_tiers,
    event_orders,
    event_tickets,
    organizer_earnings: [{
      organizer_id: ORG_ID, net_earned_cents: pastNet + liveNet, gross_cents: pastNet + liveNet + fees(EV_PAST) + fees(EV_LIVE),
      platform_fee_cents: fees(EV_PAST) + fees(EV_LIVE), paid_orders: paid(EV_PAST).length + paid(EV_LIVE).length,
      claimed_cents: pastNet, available_cents: liveNet, releasable_cents: 0,
    }],
    organizer_payouts: [{
      id: uid("9a", 1), organizer_id: ORG_ID, amount_cents: pastNet, currency: "EUR", gross_cents: pastNet + fees(EV_PAST), fee_cents: fees(EV_PAST),
      status: "sent", iban_used: "FR7630006000011234567890189", iban_holder_used: "Demo Society", requested_at: iso(at(-19, 10)), sent_at: iso(at(-18, 9)),
    }],
    stripe_connect_accounts: [{
      id: uid("5c", 1), organizer_id: ORG_ID, stripe_account_id: "acct_demo", account_holder_name: "Demo Society", business_type: "non_profit",
      charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements_currently_due: [], requirements_past_due: [],
    }],
    stripe_connect_payout_jobs: [
      { id: uid("9b", 1), organizer_id: ORG_ID, event_id: EV_PAST, kind: "organizer_event_payout", status: "paid", amount_cents: pastNet, scheduled_for: iso(at(-18, 9)) },
      { id: uid("9b", 2), organizer_id: ORG_ID, event_id: EV_LIVE, kind: "organizer_event_payout", status: "scheduled", amount_cents: liveNet, scheduled_for: iso(at(12, 9)) },
    ],
    event_scan_staff: [
      { id: uid("5a", 1), organizer_id: ORG_ID, event_id: EV_LIVE, label: "Main door · Pablo", token: "demo-door-1", created_at: iso(now - 3 * DAY), revoked_at: null, last_used_at: null, scan_count: 0 },
      { id: uid("5a", 2), organizer_id: ORG_ID, event_id: EV_LIVE, label: "VIP entrance · Nora", token: "demo-door-2", created_at: iso(now - 3 * DAY), revoked_at: null, last_used_at: null, scan_count: 0 },
    ],
    event_promo_codes: [
      { id: uid("bc", 1), event_id: EV_LIVE, code: "BDE10", discount_type: "percent", discount_value: 10, max_uses: 50, used_count: 12, is_active: true, created_at: iso(now - 12 * DAY) },
      { id: uid("bc", 2), event_id: EV_LIVE, code: "STAFF", discount_type: "fixed", discount_value: 500, max_uses: 10, used_count: 3, is_active: true, created_at: iso(now - 10 * DAY) },
    ],
    event_guestlists: [{ id: uid("61", 1), event_id: EV_LIVE, name: "DJ guests", gender_restriction: null, created_at: iso(now - 5 * DAY) }],
    event_guestlist_entries: ["Marta Ruiz", "Paul Henry", "Sara Conti", "Yanis Benali"].map((n, i) => ({
      id: uid("62", i + 1), guestlist_id: uid("61", 1), first_name: n.split(" ")[0], last_name: n.split(" ")[1], gender: i % 2 ? "male" : "female", checked_in_at: null,
    })),
    event_statements: [{ id: uid("57", 1), event_id: EV_PAST, version: 1 }],
    billing_documents: [{ id: uid("bd", 1), organizer_id: ORG_ID, event_id: EV_PAST, doc_type: "sales_statement", document_number: "RV-2026-0042", status: "definitif", issued_at: iso(at(-19, 9)) }],
    event_promoter_links: [],
    external_ticket_inventory: [],
    user_roles: [],
    profiles: [{ id: DEMO_USER_ID, user_id: DEMO_USER_ID, full_name: "Demo Organizer", email: "demo@ticket-safe.eu" }],
  };
}

let db: Db | null = null;
const data = () => (db ??= build());

// ── Answering requests ───────────────────────────────────────────────────────

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "or", "and"]);

function matches(row: Row, col: string, expr: string): boolean {
  let negate = false;
  if (expr.startsWith("not.")) { negate = true; expr = expr.slice(4); }
  const dot = expr.indexOf(".");
  const op = dot === -1 ? expr : expr.slice(0, dot);
  const raw = dot === -1 ? "" : expr.slice(dot + 1);
  if (!(col in row)) return true; // a column the sample rows don't carry: don't filter on it
  const v = row[col];
  const same = (a: unknown, b: string) => (b === "null" ? a === null : b === "true" ? a === true : b === "false" ? a === false : String(a) === b);
  let ok: boolean;
  switch (op) {
    case "eq": ok = same(v, raw); break;
    case "neq": ok = !same(v, raw); break;
    case "is": ok = same(v, raw); break;
    case "in": ok = raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).some((s) => same(v, s)); break;
    case "gte": ok = v != null && String(v) >= raw; break;
    case "gt": ok = v != null && String(v) > raw; break;
    case "lte": ok = v != null && String(v) <= raw; break;
    case "lt": ok = v != null && String(v) < raw; break;
    case "ilike": case "like": ok = String(v ?? "").toLowerCase().includes(raw.replace(/[%*]/g, "").toLowerCase()); break;
    default: ok = true;
  }
  return negate ? !ok : ok;
}

function select(table: string, params: URLSearchParams): Row[] {
  let rows = [...(data()[table] ?? [])];
  for (const [col, expr] of params) {
    if (RESERVED.has(col) || col.includes(".")) continue;
    rows = rows.filter((r) => matches(r, col, expr));
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    rows.sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : String(a[col] ?? "") > String(b[col] ?? "") ? 1 : 0) * (dir === "desc" ? -1 : 1));
    // Numbers sort as numbers.
    if (rows.every((r) => typeof r[col] === "number")) rows.sort((a, b) => ((a[col] as number) - (b[col] as number)) * (dir === "desc" ? -1 : 1));
  }
  const limit = params.get("limit");
  return limit ? rows.slice(0, Number(limit)) : rows;
}

function salesSummary(): Row[] {
  const d = data();
  return d.events.map((e) => {
    const orders = d.event_orders.filter((o) => o.event_id === e.id);
    const paid = orders.filter((o) => o.status === "paid");
    const refunded = orders.filter((o) => o.status === "refunded");
    const sum = (rows: Row[], k: string) => rows.reduce((n, o) => n + (o[k] as number), 0);
    const past = new Date(e.ends_at as string).getTime() < Date.now();
    return {
      event_id: e.id,
      tickets_sold: sum(paid, "quantity"),
      capacity: sum(d.event_tiers.filter((t) => t.event_id === e.id), "total_qty"),
      gross_cents: sum(paid, "total_cents"),
      fee_cents: sum(paid, "fee_cents"),
      net_cents: sum(paid, "total_cents") - sum(paid, "fee_cents"),
      refunded_orders: refunded.length,
      refunded_tickets: sum(refunded, "quantity"),
      refunded_cents: sum(refunded, "total_cents"),
      checked_in: d.event_tickets.filter((t) => t.event_id === e.id && t.scanned_at).length,
      payout_status: paid.length === 0 ? "none" : past ? "paid" : "pending",
    };
  });
}

async function answer(url: URL, method: string, headers: Headers, body: unknown): Promise<Response> {
  const path = url.pathname;
  const wantsOne = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
  const one = (rows: Row[]) =>
    rows.length ? json(rows[0]) : json({ code: "PGRST116", details: "The result contains 0 rows", hint: null, message: "JSON object requested, multiple (or no) rows returned" }, 406);

  if (path.startsWith("/rest/v1/rpc/")) {
    const fn = path.slice("/rest/v1/rpc/".length);
    if (fn === "studio_event_sales_summary") return json(salesSummary());
    if (fn === "resale_price_cap") return json([{ cap_cents: null, source: "none", face_value_cents: null }]);
    return json(null, 204);
  }

  if (path.startsWith("/rest/v1/")) {
    const table = path.slice("/rest/v1/".length);
    const d = data();
    d[table] ??= [];
    if (method === "GET" || method === "HEAD") {
      const rows = select(table, url.searchParams);
      const range = { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" };
      if (method === "HEAD") return new Response(null, { status: 200, headers: range });
      return wantsOne ? one(rows) : json(rows, 200, range);
    }
    if (method === "POST") {
      const added = (Array.isArray(body) ? body : [body]).map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...(r as Row) }));
      d[table].push(...added);
      return wantsOne ? one(added) : json(added, 201);
    }
    if (method === "PATCH") {
      const rows = select(table, url.searchParams);
      for (const r of rows) Object.assign(r, body as Row); // rows are the stored objects, so this edits the table
      return wantsOne ? one(rows) : json(rows);
    }
    if (method === "DELETE") {
      const gone = new Set(select(table, url.searchParams));
      d[table] = d[table].filter((r) => !gone.has(r));
      return json([...gone]);
    }
  }

  if (path.startsWith("/functions/v1/")) {
    return json({ error: "This is the demo: nothing is sent, charged or emailed." }, 400);
  }
  if (path.startsWith("/auth/v1/logout")) return json(null, 204);
  if (path.startsWith("/auth/v1/user")) return json(JSON.parse(localStorage.getItem(authStorageKey()) ?? "{}").user ?? {});
  if (path.startsWith("/storage/v1/")) return json({ Key: "demo/file", path: "demo/file" });
  return json({});
}

/** The Supabase client's fetch in development: the demo's answers while it is on, the network otherwise. */
export const studioDemoFetch: typeof fetch = async (input, init) => {
  if (!isStudioDemo()) return fetch(input, init);
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers ?? req?.headers);
  let body: unknown = null;
  if (typeof init?.body === "string") {
    try { body = JSON.parse(init.body); } catch { body = null; }
  }
  return answer(url, method, headers, body);
};
