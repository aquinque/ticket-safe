#!/usr/bin/env bash
# Throwaway-Postgres tests for the resale migrations (npm run test:db).
#
# Starts a private PostgreSQL server (unix socket only, temp directory), loads
# supabase/tests/fixtures/prod_resale_baseline.sql (production as it was before
# 20261104120000), applies the resale migrations in deploy order, runs every
# supabase/tests/resale_*.test.sql in its own psql session, then the
# concurrency tests below. Stops at the first failure and exits non-zero.
#
#   PGBIN=/path/to/bin      PostgreSQL binaries (default: newest /usr/lib/postgresql/*/bin)
#   TEST_DB_PORT=5499       port number used for the socket name
#   TEST_DB_REQUIRED=1      fail (instead of skip) when no binaries are found
#   TEST_DB_VERBOSE=1       print every "ok - ..." line
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$ROOT/supabase/migrations"
TESTS="$ROOT/supabase/tests"

if [ -z "${PGBIN:-}" ]; then
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
fi
if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ] || [ ! -x "$PGBIN/psql" ]; then
  if [ "${TEST_DB_REQUIRED:-0}" = "1" ]; then
    echo "test:db FAILED (no postgres binaries; set PGBIN)" >&2
    exit 1
  fi
  echo "test:db SKIPPED (no postgres binaries)"
  exit 0
fi

PORT="${TEST_DB_PORT:-5499}"
DB=resale_test

# The server refuses to run as root: run it as postgres in a directory postgres owns.
if [ "$(id -u)" = "0" ]; then
  if ! id postgres >/dev/null 2>&1; then
    echo "test:db FAILED (running as root and there is no postgres user)" >&2
    exit 1
  fi
  TMP="$(su postgres -s /bin/sh -c 'mktemp -d')"
  as_pg() { su postgres -s /bin/sh -c "$1"; }
else
  TMP="$(mktemp -d)"
  as_pg() { sh -c "$1"; }
fi

cleanup() {
  as_pg "'$PGBIN/pg_ctl' -D '$TMP/data' -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

as_pg "'$PGBIN/initdb' -D '$TMP/data' -A trust -U postgres -E UTF8 --locale=C" >"$TMP/initdb.log" 2>&1 \
  || { cat "$TMP/initdb.log" >&2; exit 1; }
cat >>"$TMP/data/postgresql.conf" <<EOF
listen_addresses = ''
port = $PORT
unix_socket_directories = '$TMP'
fsync = off
synchronous_commit = off
full_page_writes = off
max_connections = 60
EOF
as_pg "'$PGBIN/pg_ctl' -D '$TMP/data' -l '$TMP/server.log' -w start" >/dev/null \
  || { cat "$TMP/server.log" >&2; exit 1; }

export PGHOST="$TMP" PGPORT="$PORT" PGUSER=postgres
PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -d "$DB")
"$PGBIN/createdb" "$DB"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL  $1" >&2; echo "test:db: $PASS passed, $FAIL failed" >&2; exit 1; }

# Runs one SQL file in its own session. Counts and (optionally) prints its
# "ok - ..." notices; on error prints the whole output.
run_file() {
  local label="$1" file="$2" out n
  if out="$("${PSQL[@]}" -f "$file" 2>&1)"; then
    n="$(grep -c 'ok - ' <<<"$out" || true)"
    if [ "${TEST_DB_VERBOSE:-0}" = "1" ]; then grep -o 'ok - .*' <<<"$out" | sed 's/^/      /' || true; fi
    if [ "${n:-0}" -gt 0 ]; then pass "$label ($n checks)"; else pass "$label"; fi
  else
    echo "$out" >&2
    fail "$label"
  fi
}

# ── Schema ─────────────────────────────────────────────────────────────────
run_file "fixture prod_resale_baseline.sql" "$TESTS/fixtures/prod_resale_baseline.sql"
for m in \
  20261103130000_resale_disputes_and_price_cap.sql \
  20261104120000_views_security_invoker_and_write_revokes.sql \
  20261108090000_resale_reservations_and_listing_rpcs.sql \
  20261108090100_tickets_column_privileges_and_drop_participant_view.sql; do
  run_file "migration $m" "$MIG/$m"
done

# ── SQL test files ─────────────────────────────────────────────────────────
shopt -s nullglob
for f in "$TESTS"/resale_*.test.sql; do
  run_file "$(basename "$f")" "$f"
done

# ── Concurrency tests (committed state, parallel sessions) ─────────────────
run_file "resale_race_seed.sql" "$TESTS/resale_race_seed.sql"

q() { "${PSQL[@]}" -At -c "$1"; }
svc() { "${PSQL[@]}" -At -c "set role service_role" -c "$1"; }
L9="$(q "select tests.id('L9')")"
L11="$(q "select tests.id('L11')")"
L12="$(q "select tests.id('L12')")"
L13="$(q "select tests.id('L13')")"
L14="$(q "select tests.id('L14')")"
L15="$(q "select tests.id('L15')")"
reserve_sql() { # listing buyer
  echo "select outcome from public.reserve_resale_listing('$1', '$2', 20.00, 1, 2100, 100, 100, 2100)"
}
expect_eq() { # label actual expected
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi
}

# 1. Reserve race: 20 buyers at once on L9, exactly one wins.
RACE="$TMP/race"; mkdir -p "$RACE"
for i in $(seq -w 1 20); do
  buyer="$(q "select tests.id('R$i')")"
  ( svc "$(reserve_sql "$L9" "$buyer")" >"$RACE/$i.out" 2>"$RACE/$i.err" || echo "error" >"$RACE/$i.out" ) &
done
wait
reserved="$(cat "$RACE"/*.out | grep -cx reserved || true)"
others="$(cat "$RACE"/*.out | grep -cx reserved_by_other || true)"
expect_eq "race: 20 parallel reserves -> exactly 1 reserved" "$reserved" "1"
expect_eq "race: 20 parallel reserves -> 19 reserved_by_other" "$others" "19"
expect_eq "race: exactly 1 pending transaction on L9" \
  "$(q "select count(*) from public.transactions where ticket_id = '$L9' and status = 'pending'")" "1"
expect_eq "race: L9 reserved by that pending transaction" \
  "$(q "select count(*) from public.tickets t join public.transactions x on x.id = t.reserved_transaction_id where t.id = '$L9' and t.status = 'reserved' and x.status = 'pending'")" "1"

# 2. Deterministic lock wait: A holds the row lock, B waits then sees A's hold.
BA="$(q "select tests.id('R01')")"; BB="$(q "select tests.id('R02')")"
( "${PSQL[@]}" -At -c "set role service_role" \
    -c "begin" -c "$(reserve_sql "$L11" "$BA")" -c "select pg_sleep(1)" -c "commit" \
    >"$RACE/lockA.out" 2>&1 ) &
PID_A=$!
sleep 0.2
B_OUT="$(svc "$(reserve_sql "$L11" "$BB")")"
wait "$PID_A"
A_OUT="$(grep -x 'reserved\|reserved_by_other\|not_available' "$RACE/lockA.out" | head -1 || true)"
expect_eq "lock wait: session A (holds the lock) gets reserved" "$A_OUT" "reserved"
expect_eq "lock wait: session B (waited on the lock) gets reserved_by_other" "$B_OUT" "reserved_by_other"

# 3. Completion race: the same paid transaction delivered twice at once.
TX12="$(svc "select transaction_id from public.reserve_resale_listing('$L12', '$BA', 20.00, 1, 2100, 100, 100, 2100)")"
for i in 1 2; do
  ( svc "select outcome from public.complete_resale_purchase('$TX12', 'pi_race_12', gen_random_uuid(), 'qr-race-12-$i')" \
      >"$RACE/c$i.out" 2>"$RACE/c$i.err" || echo "error" >"$RACE/c$i.out" ) &
done
wait
outs="$(cat "$RACE/c1.out" "$RACE/c2.out" | sort | tr '\n' ' ')"
expect_eq "completion race: one completed, one already_completed" "$outs" "already_completed completed "
expect_eq "completion race: exactly one new event ticket issued" \
  "$(q "select count(*) from public.event_tickets where qr_token like 'qr-race-12-%'")" "1"
expect_eq "completion race: old Studio ticket transferred" \
  "$(q "select et.status from public.event_tickets et join public.tickets t on t.studio_ticket_id = et.id where t.id = '$L12'")" "transferred"
expect_eq "completion race: listing sold once" \
  "$(q "select status || ':' || (buyer_id = '$BA') from public.tickets where id = '$L12'")" "sold:true"

# 4. Double-sell: tx1's hold expired and B2's tx2 took over; both payments land at once.
TX1="$(svc "select transaction_id from public.reserve_resale_listing('$L13', '$BA', 20.00, 1, 2100, 100, 100, 2100)")"
q "update public.tickets set reserved_until = now() - interval '1 minute' where id = '$L13'" >/dev/null
TX2="$(svc "select transaction_id from public.reserve_resale_listing('$L13', '$BB', 20.00, 1, 2100, 100, 100, 2100)")"
( svc "select outcome from public.complete_resale_purchase('$TX1', 'pi_race_13_1', NULL, NULL)" >"$RACE/d1.out" 2>&1 || echo error >"$RACE/d1.out" ) &
( svc "select outcome from public.complete_resale_purchase('$TX2', 'pi_race_13_2', NULL, NULL)" >"$RACE/d2.out" 2>&1 || echo error >"$RACE/d2.out" ) &
wait
expect_eq "double-sell: tx2 (current holder) completed" "$(cat "$RACE/d2.out")" "completed"
expect_eq "double-sell: tx1 (taken over) gets a refund conflict" "$(cat "$RACE/d1.out")" "transaction_not_pending"
expect_eq "double-sell: listing sold exactly once, to tx2's buyer" \
  "$(q "select count(*) from public.tickets where id = '$L13' and status = 'sold' and buyer_id = '$BB'")" "1"
expect_eq "double-sell: tx1 cancelled with its payment intent stored" \
  "$(q "select status || ':' || payment_intent_id from public.transactions where id = '$TX1'")" "cancelled:pi_race_13_1"

# 5. Lock order, reserve vs complete (was a 40P01 deadlock). The interleaving
#    that deadlocked: reserve_resale_listing has locked the listing and is
#    about to cancel the previous pending transaction, while
#    complete_resale_purchase for that same transaction runs. Session R takes
#    the listing lock exactly as reserve does first (SELECT ... FOR UPDATE),
#    holds it while session C starts complete_resale_purchase, then runs the
#    reserve (same buyer: takes over and cancels TX14). Before the fix C
#    locked TX14 and then waited on the listing while R waited on TX14:
#    deadlock detected. Now C waits on the listing without holding TX14.
deadlock_case() { # label listing tx second_session_sql expected_second_outcome expected_tx_status
  local label="$1" listing="$2" tx="$3" sql="$4" expected="$5" r_out c_out
  local rf="$RACE/deadlock-$listing.r"
  ( "${PSQL[@]}" -At -c "set role service_role" -c "begin" \
      -c "select 'locked' from public.tickets where id = '$listing' for update" \
      -c "select pg_sleep(1.5)" \
      -c "$(reserve_sql "$listing" "$BA")" -c "commit" >"$rf" 2>&1 || echo "error" >>"$rf" ) &
  local pid=$!
  # Wait until R holds the listing lock, then start C.
  for _ in $(seq 1 50); do
    grep -qx locked "$rf" 2>/dev/null && break
    sleep 0.05
  done
  c_out="$(svc "$sql" 2>&1 || echo error)"
  wait "$pid"
  r_out="$(cat "$rf")"
  if grep -qi 'deadlock' <<<"$r_out$c_out"; then
    fail "$label: deadlock detected (40P01): R=[$r_out] C=[$c_out]"
  fi
  pass "$label: no 40P01 in either session"
  expect_eq "$label: reserve (holding the listing first) gets reserved" "$(grep -x 'reserved\|reserved_by_other\|not_available\|error' "$rf" | head -1)" "reserved"
  expect_eq "$label: second session outcome" "$c_out" "$expected"
  expect_eq "$label: the previous transaction is $6" \
    "$(q "select status from public.transactions where id = '$tx'")" "$6"
  expect_eq "$label: listing held by the new pending transaction" \
    "$(q "select count(*) from public.tickets t join public.transactions x on x.id = t.reserved_transaction_id where t.id = '$listing' and t.status = 'reserved' and x.status = 'pending' and x.id <> '$tx'")" "1"
}
TX14="$(svc "select transaction_id from public.reserve_resale_listing('$L14', '$BA', 20.00, 1, 2100, 100, 100, 2100)")"
deadlock_case "lock order reserve/complete" "$L14" "$TX14" \
  "select outcome from public.complete_resale_purchase('$TX14', 'pi_dl_14', NULL, NULL)" "transaction_not_pending" "cancelled"
expect_eq "lock order reserve/complete: TX14 keeps its payment intent for the refund" \
  "$(q "select payment_intent_id from public.transactions where id = '$TX14'")" "pi_dl_14"

# 6. Same interleaving, reserve vs record_resale_refund (it also locked the
#    transaction before the listing).
TX15="$(svc "select transaction_id from public.reserve_resale_listing('$L15', '$BA', 20.00, 1, 2100, 100, 100, 2100)")"
q "update public.transactions set payment_intent_id = 'pi_dl_15' where id = '$TX15'" >/dev/null
deadlock_case "lock order reserve/refund" "$L15" "$TX15" \
  "select outcome || ':' || relisted from public.record_resale_refund('pi_dl_15')" "refunded:false" "refunded"

echo "test:db: $PASS passed, $FAIL failed"
