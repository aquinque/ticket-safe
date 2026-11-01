-- Financial statements per event, built from the organizer's Stripe Connect account
-- (supabase/functions/_shared/eventStatement.ts).
--
-- One row per generated version; the Studio page shows the latest. The PDF lives in the
-- private "statements" bucket and is only ever reached through a short-lived signed URL made
-- by the event-statement function, never through a public URL or a client-side storage call.

create table if not exists public.event_statements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  stripe_account_id text not null,
  version integer not null,
  storage_path text not null,
  generated_at timestamptz not null default now(),
  trigger text not null check (trigger in ('cron', 'webhook', 'manual')),
  -- The figures the Studio card shows without opening the PDF (StatementTotals in eventStatement.ts).
  totals jsonb not null default '{}'::jsonb,
  -- Stripe's gross differed from our orders when this version was made (admins see a banner).
  discrepancy boolean not null default false,
  -- Fingerprint of the Stripe data this version was made from: same data, no new version.
  data_hash text not null,
  transactions_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, version)
);

comment on table public.event_statements is
  'Financial statement PDFs of events, one row per version, figures sourced from the organizer''s Stripe Connect account.';

create index if not exists event_statements_event_version_idx
  on public.event_statements (event_id, version desc);
create index if not exists event_statements_organizer_generated_idx
  on public.event_statements (organizer_id, generated_at desc);

alter table public.event_statements enable row level security;

-- The organizer reads their own statements' rows (figures); admins read all. Writes come from the
-- service role only (the edge functions).
drop policy if exists event_statements_owner_select on public.event_statements;
create policy event_statements_owner_select on public.event_statements
  for select to authenticated
  using (
    organizer_id in (select id from public.organizer_profiles where user_id = auth.uid())
    or exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

-- ── Private bucket: PDFs are served through signed URLs made server-side ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('statements', 'statements', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No storage policy on purpose: nobody but the service role reads or writes the bucket directly.

-- ── The dedicated Stripe webhook (payout.paid) keeps its own idempotency record: the same Stripe event
-- also reaches stripe-connect-webhook, which records it in stripe_webhook_events, and neither must block the other.
create table if not exists public.event_statement_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);
alter table public.event_statement_webhook_events enable row level security;
-- No policy on purpose: only the service role (the webhook function) writes or reads it.

-- ── Hourly job: the statement of every Stripe event that ended 24 h ago and has none yet ──
-- Same mechanism and the same Vault secret as stripe-connect-payout-cron ('stripe_payout_cron_secret',
-- matching the Edge secret STRIPE_PAYOUT_CRON_SECRET); see 20261013150000_schedule_stripe_connect_payout_cron.sql.
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'event-statements-cron-hourly';

select cron.schedule(
  'event-statements-cron-hourly',
  '35 * * * *',
  $$
  select net.http_post(
    url := 'https://lgmnatfvdzzjzyxlenry.supabase.co/functions/v1/event-statements',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_payout_cron_secret' limit 1),
        ''
      )
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
