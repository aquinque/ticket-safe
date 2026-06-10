-- ── ticket_alerts ─────────────────────────────────────────────────────────
-- "Notify me when a resale ticket is listed for this event."
create table if not exists public.ticket_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (user_id, event_id)
);
create index if not exists idx_ticket_alerts_event on public.ticket_alerts(event_id) where notified_at is null;

alter table public.ticket_alerts enable row level security;

drop policy if exists "ticket_alerts_select_own" on public.ticket_alerts;
create policy "ticket_alerts_select_own" on public.ticket_alerts
  for select using (auth.uid() = user_id);

drop policy if exists "ticket_alerts_insert_own" on public.ticket_alerts;
create policy "ticket_alerts_insert_own" on public.ticket_alerts
  for insert with check (auth.uid() = user_id);

drop policy if exists "ticket_alerts_delete_own" on public.ticket_alerts;
create policy "ticket_alerts_delete_own" on public.ticket_alerts
  for delete using (auth.uid() = user_id);

-- ── organizer_follows ─────────────────────────────────────────────────────
-- "Follow this organizer → email me when they publish a new event."
create table if not exists public.organizer_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, organizer_id)
);
create index if not exists idx_organizer_follows_org on public.organizer_follows(organizer_id);

alter table public.organizer_follows enable row level security;

drop policy if exists "organizer_follows_select_own" on public.organizer_follows;
create policy "organizer_follows_select_own" on public.organizer_follows
  for select using (auth.uid() = user_id);

drop policy if exists "organizer_follows_insert_own" on public.organizer_follows;
create policy "organizer_follows_insert_own" on public.organizer_follows
  for insert with check (auth.uid() = user_id);

drop policy if exists "organizer_follows_delete_own" on public.organizer_follows;
create policy "organizer_follows_delete_own" on public.organizer_follows
  for delete using (auth.uid() = user_id);
