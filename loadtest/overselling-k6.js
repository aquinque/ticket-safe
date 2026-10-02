/**
 * Overselling / concurrency load test — simulates a ticket-drop spike: many
 * buyers hitting checkout for the SAME tier/listing at the same instant.
 *
 * What it proves:
 *   - Never more successful checkouts started than seats actually available
 *     (reserve_tier / the resale "available -> reserved" conditional UPDATE
 *     must reject every request past the stock limit with a clean 409, not
 *     a 500 or a false "success").
 *   - Response times stay reasonable under the spike (p95 threshold).
 *   - No unhandled errors (5xx) — everything past the stock limit should be
 *     a clean, expected 409, not a crash.
 *
 * What it does NOT do: assert on payment completion. These endpoints only
 * *reserve* the seat and return a hosted Revolut checkout URL — nobody
 * actually pays in this test, so finalize_tier_sale / sold_qty are never
 * touched. The thing being proven atomic here is reserve_tier's conditional
 * UPDATE (and resale's tickets.status conditional UPDATE), which is where
 * a real overselling race would happen.
 *
 * IMPORTANT — do not point this at production inventory you care about:
 *   - Every VU that "wins" a seat creates a real pending `event_orders` /
 *     `transactions` row and calls the real Revolut Merchant API to open a
 *     hosted order. Nothing is charged (no card details are ever entered),
 *     but it is a real API call against your Revolut account and a real
 *     DB write.
 *   - Reserved seats release automatically (reservation TTL + the
 *     cleanup_stuck_orders cron), but for the run itself they ARE held.
 *   - Run this against a dedicated TEST event with a throwaway tier of
 *     known, small capacity (e.g. 5), created specifically for this test —
 *     never against a real on-sale event.
 *
 * Usage:
 *   k6 run -e BASE_URL=https://<project>.supabase.co \
 *          -e ANON_KEY=<anon key> \
 *          -e TIER_ID=<uuid of the disposable test tier> \
 *          -e VUS=50 \
 *          loadtest/overselling-k6.js
 *
 *   # Resale side instead of Studio:
 *   k6 run -e BASE_URL=... -e ANON_KEY=... -e LISTING_ID=<uuid> -e VUS=50 \
 *          -e MODE=resale loadtest/overselling-k6.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://lgmnatfvdzzjzyxlenry.supabase.co";
const ANON_KEY = __ENV.ANON_KEY || "";
const TIER_ID = __ENV.TIER_ID || "";
const LISTING_ID = __ENV.LISTING_ID || "";
const MODE = __ENV.MODE || "studio"; // "studio" | "resale"
const VUS = Number(__ENV.VUS || 50);

const successes = new Counter("checkout_started");
const soldOut409 = new Counter("clean_409_sold_out");
const unexpectedErrors = new Counter("unexpected_errors");
const checkoutDuration = new Trend("checkout_duration_ms");

export const options = {
  scenarios: {
    spike: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,
      maxDuration: "30s",
    },
  },
  thresholds: {
    // Everything that isn't a clean 2xx/409 is a bug — 0% tolerance.
    unexpected_errors: ["count==0"],
    // p95 response time under a stock-limited spike should stay reasonable.
    "checkout_duration_ms": ["p(95)<4000"],
  },
};

function guestBody() {
  const n = `${__VU}-${Date.now()}`;
  return {
    guest: { name: `Load Test ${n}`, email: `loadtest+${n}@example.com` },
  };
}

export default function () {
  const url =
    MODE === "resale"
      ? `${BASE_URL}/functions/v1/revolut-resale-checkout`
      : `${BASE_URL}/functions/v1/revolut-create-checkout`;

  const payload =
    MODE === "resale"
      ? { listingId: LISTING_ID, ...guestBody() }
      : {
          tier_id: TIER_ID,
          quantity: 1,
          attendees: [{ first_name: "Load", last_name: "Test", email: `loadtest+${__VU}@example.com`, gender: "other" }],
          ...guestBody(),
        };

  const res = http.post(url, JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });

  checkoutDuration.add(res.timings.duration);

  const body = (() => {
    try {
      return JSON.parse(res.body);
    } catch {
      return {};
    }
  })();

  if (res.status === 200 && (body.url || body.checkout_url)) {
    successes.add(1);
    check(res, { "got a checkout url": () => true });
  } else if (res.status === 409) {
    // Expected once the tier/listing is exhausted — this is the
    // anti-overselling guard doing its job, not a failure.
    soldOut409.add(1);
  } else {
    unexpectedErrors.add(1);
    console.error(`VU ${__VU}: unexpected ${res.status} — ${res.body?.slice(0, 200)}`);
  }

  sleep(0.1);
}

export function handleSummary(data) {
  const started = data.metrics.checkout_started?.values?.count ?? 0;
  const blocked = data.metrics.clean_409_sold_out?.values?.count ?? 0;
  const errors = data.metrics.unexpected_errors?.values?.count ?? 0;
  const p95 = data.metrics.checkout_duration_ms?.values?.["p(95)"] ?? 0;

  const summary = `
=== Overselling spike test — ${MODE} ===
VUs (simultaneous buyers): ${VUS}
Checkouts started (reserved a real seat): ${started}
Clean 409 (seat already gone — expected once stock runs out): ${blocked}
Unexpected errors (should be 0): ${errors}
p95 response time: ${Math.round(p95)}ms

PASS condition: "Checkouts started" must equal the tier/listing's real
remaining stock (check it manually against event_tiers.total_qty -
sold_qty - reserved_qty, or the listing's quantity, from just before the
run) — if it's higher, reserve_tier (or the resale conditional UPDATE) has
an overselling bug. "Unexpected errors" must be 0.
`;
  console.log(summary);
  return { stdout: summary };
}
