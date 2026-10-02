-- Manual test script for billing_documents: immutability + RLS isolation.
--
-- Not wired into any CI — this project has no pgTAP/`supabase test db`
-- harness yet. Run this by hand, in order, against a STAGING project
-- (never production) via the Supabase SQL editor (logged in as the
-- `postgres` role, which can freely `SET ROLE`/set the JWT GUCs below) or
-- `psql "$STAGING_DB_URL" -f supabase/tests/billing_documents_test.sql`.
--
-- Each block RAISEs on failure and prints "OK: ..." on success — read the
-- output top to bottom; the script stops at the first failure.
--
-- Prerequisites: run after migration 20261002120000_billing_documents_core.sql
-- has been applied. Creates and cleans up its own throwaway rows
-- (organizer A, organizer B, one event each) — safe to re-run.

begin;

-- ── Fixtures ──────────────────────────────────────────────────────────
do $$
declare
  v_user_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_user_b uuid := '00000000-0000-0000-0000-0000000000b1';
begin
  -- Minimal auth.users rows (needed for organizer_profiles.user_id FK and
  -- billing_documents.created_by FK). Skipped if they already exist.
  insert into auth.users (id, email) values
    (v_user_a, 'test-org-a@example.invalid'),
    (v_user_b, 'test-org-b@example.invalid')
  on conflict (id) do nothing;

  insert into public.organizer_profiles (id, user_id, name, slug, org_type, contact_name, contact_email, status)
  values
    ('00000000-0000-0000-0000-00000000a001', v_user_a, 'Test Org A', 'test-org-a-billing', 'other', 'A', 'a@example.invalid', 'approved'),
    ('00000000-0000-0000-0000-00000000b001', v_user_b, 'Test Org B', 'test-org-b-billing', 'other', 'B', 'b@example.invalid', 'approved')
  on conflict (id) do nothing;

  insert into public.events (id, organizer_id, title, slug, date, status)
  values
    ('00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-00000000a001', 'Test Event A', 'test-event-a-billing', now() + interval '1 day', 'published'),
    ('00000000-0000-0000-0000-0000000e1002', '00000000-0000-0000-0000-00000000b001', 'Test Event B', 'test-event-b-billing', now() + interval '1 day', 'published')
  on conflict (id) do nothing;

  raise notice 'OK: fixtures created (organizer A/B, event A/B)';
end $$;

-- ── Test 1: reserve + finalize a service_invoice, then verify it's immutable ──
do $$
declare
  v_doc public.billing_documents;
  v_err text;
begin
  v_doc := public.reserve_billing_document(
    'service_invoice', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000e1001',
    null, '{"ticket_count": 10, "total_ht_cents": 1400, "vat_cents": 0, "total_ttc_cents": 1400, "vat_rate_bps": 0}'::jsonb,
    null, null, current_date, null
  );
  if v_doc.status <> 'provisoire' or v_doc.document_number is null then
    raise exception 'FAIL: reserve_billing_document did not return a provisoire row with a number — got status=%, number=%', v_doc.status, v_doc.document_number;
  end if;

  v_doc := public.finalize_billing_document(v_doc.id, 'test/path.pdf', 'deadbeef', 'definitif');
  if v_doc.status <> 'definitif' then
    raise exception 'FAIL: finalize_billing_document did not flip status to definitif';
  end if;

  -- Now try to mutate a guarded field directly — must be rejected by the trigger.
  begin
    update public.billing_documents set totals = '{}'::jsonb where id = v_doc.id;
    raise exception 'FAIL: mutating a definitif document''s totals succeeded — immutability trigger did not fire';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%immutable%' then
      raise exception 'FAIL: update was rejected but not by the immutability trigger (got: %)', v_err;
    end if;
    raise notice 'OK: definitif document totals are immutable (%)', v_err;
  end;

  -- Soft delete (only deleted_at changing) must still be allowed.
  update public.billing_documents set deleted_at = now() where id = v_doc.id;
  update public.billing_documents set deleted_at = null where id = v_doc.id; -- restore for later tests
  raise notice 'OK: soft-delete (deleted_at only) is still allowed on a definitif document';

  -- Hard delete must always be rejected, definitif or not.
  begin
    delete from public.billing_documents where id = v_doc.id;
    raise exception 'FAIL: hard DELETE on billing_documents succeeded — should be blocked unconditionally';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%hard delete is not allowed%' then
      raise exception 'FAIL: delete was rejected but not by block_table_hard_delete (got: %)', v_err;
    end if;
    raise notice 'OK: hard delete on billing_documents is blocked unconditionally (%)', v_err;
  end;
end $$;

-- ── Test 2: RLS — organizer A cannot read organizer B's documents ──────
do $$
declare
  v_count int;
begin
  -- Organizer B's own invoice, for comparison.
  perform public.finalize_billing_document(
    (public.reserve_billing_document(
      'service_invoice', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000e1002',
      null, '{"ticket_count": 1, "total_ht_cents": 140, "vat_cents": 0, "total_ttc_cents": 140, "vat_rate_bps": 0}'::jsonb,
      null, null, current_date, null
    )).id,
    'test/path-b.pdf', 'cafebabe', 'definitif'
  );

  -- Switch to an authenticated session as organizer A's user and read.
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

  select count(*) into v_count from public.billing_documents where organizer_id = '00000000-0000-0000-0000-00000000b001';
  if v_count <> 0 then
    raise exception 'FAIL: organizer A can see % of organizer B''s billing_documents rows via RLS', v_count;
  end if;

  select count(*) into v_count from public.billing_documents where organizer_id = '00000000-0000-0000-0000-00000000a001';
  if v_count = 0 then
    raise exception 'FAIL: organizer A cannot see their OWN billing_documents rows via RLS';
  end if;

  reset role;
  raise notice 'OK: RLS isolates billing_documents by organizer (A sees own, not B''s)';
end $$;

-- ── Test 3: no client role can call the SECURITY DEFINER allocators directly ──
do $$
declare
  v_err text;
begin
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

  begin
    perform public.reserve_billing_document(
      'service_invoice', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000e1001',
      null, '{}'::jsonb, null, null, current_date, null
    );
    raise exception 'FAIL: an authenticated (non-service-role) caller was able to execute reserve_billing_document';
  exception when insufficient_privilege then
    raise notice 'OK: reserve_billing_document is not callable by authenticated users';
  end;

  reset role;
end $$;

-- Clean up fixtures (rollback does this anyway, but explicit for anyone
-- who turns this into a committed run by mistake).
rollback;
