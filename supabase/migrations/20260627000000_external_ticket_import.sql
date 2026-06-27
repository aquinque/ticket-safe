-- ============================================================================
-- External Ticket Import
-- ----------------------------------------------------------------------------
-- Lets organizers import externally-sourced tickets (nightclub / partner
-- allocations) into an existing event and resell them through the *normal* buy
-- flow, choosing the platform price.
--
-- This migration is fully ADDITIVE. The native first-sale path
-- (event_tiers -> event_orders -> event_tickets via revolut-create-checkout +
-- revolut-webhook) and the resale path (tickets + transactions) are NOT
-- modified.
--
-- Design:
--   * Each external allocation is modelled as a normal `event_tier` flagged
--     `source = 'external'`, so it appears in the storefront and reuses
--     checkout, inventory (reserve_tier / finalize_tier_sale), email, QR,
--     wallet and scanning with zero changes to the payment path.
--   * Per-ticket external data (codes / files / provider) live in the new
--     `external_ticket_inventory` table.
--   * A BEFORE INSERT trigger on `event_tickets` claims one available external
--     allocation per first-sale ticket and copies its code/file/provider onto
--     the ticket. Resale transfers reuse the original `order_id`, so once an
--     order's allocations are claimed the trigger COPIES from them instead of
--     consuming a fresh one.
--   * `event_tiers.total_qty` for external tiers is kept in sync with the
--     count of sellable allocations by a trigger, so the existing
--     `tier_inventory` view (available = total - sold - reserved) stays honest
--     and oversell protection is reused unchanged.
-- ============================================================================

-- 1. Origin flag columns -----------------------------------------------------
alter table public.event_tiers
  add column if not exists source text not null default 'platform';
do $$ begin
  alter table public.event_tiers
    add constraint event_tiers_source_chk check (source in ('platform','external'));
exception when duplicate_object then null; end $$;

-- event_tickets gains an origin flag + a copy of the external artifact so the
-- buyer display / email / scanning can surface it without an extra join.
alter table public.event_tickets
  add column if not exists source text not null default 'platform';
do $$ begin
  alter table public.event_tickets
    add constraint event_tickets_source_chk check (source in ('platform','external'));
exception when duplicate_object then null; end $$;
alter table public.event_tickets add column if not exists external_provider text;
alter table public.event_tickets add column if not exists external_code text;
alter table public.event_tickets add column if not exists external_file_url text;

-- 2. Inventory status enum ---------------------------------------------------
do $$ begin
  create type public.external_ticket_status as enum
    ('draft','available','sold','cancelled','used');
exception when duplicate_object then null; end $$;

-- 3. external_ticket_inventory table ----------------------------------------
create table if not exists public.external_ticket_inventory (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid not null references public.events(id) on delete cascade,
  tier_id              uuid not null references public.event_tiers(id) on delete cascade,
  source               text not null default 'external',
  original_provider    text,                    -- e.g. "Teatro Kapital"
  external_code        text,                    -- club code / QR payload (null for manual qty imports)
  external_reference   text,                    -- partner order ref / batch id
  uploaded_file_url    text,                    -- object PATH in the private 'external-tickets' bucket
  platform_price_cents integer,                 -- audit copy of the price set at import time
  status               public.external_ticket_status not null default 'available',
  order_id             uuid references public.event_orders(id) on delete set null,
  event_ticket_id      uuid references public.event_tickets(id) on delete set null,
  buyer_id             uuid references auth.users(id) on delete set null,
  notes                text,                     -- internal source notes
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Safety: no duplicate external codes within the same event.
create unique index if not exists external_ticket_inventory_event_code_uniq
  on public.external_ticket_inventory(event_id, external_code)
  where external_code is not null;

-- Fast claim lookup (oldest available row per tier) + order/event filters.
create index if not exists external_ticket_inventory_claim_idx
  on public.external_ticket_inventory(tier_id, status, created_at);
create index if not exists external_ticket_inventory_order_idx
  on public.external_ticket_inventory(order_id);
create index if not exists external_ticket_inventory_event_idx
  on public.external_ticket_inventory(event_id);

-- 4. Row Level Security ------------------------------------------------------
alter table public.external_ticket_inventory enable row level security;

-- Organizer who owns the event manages its allocations (mirrors event_tiers).
drop policy if exists external_inventory_organizer_all on public.external_ticket_inventory;
create policy external_inventory_organizer_all
  on public.external_ticket_inventory for all
  using (exists (
    select 1 from public.events e
    join public.organizer_profiles op on op.id = e.organizer_id
    where e.id = external_ticket_inventory.event_id
      and op.user_id = auth.uid()
      and op.status = 'approved'
  ))
  with check (exists (
    select 1 from public.events e
    join public.organizer_profiles op on op.id = e.organizer_id
    where e.id = external_ticket_inventory.event_id
      and op.user_id = auth.uid()
      and op.status = 'approved'
  ));

-- Admins can read all allocations (mirrors event_tickets admin policy).
drop policy if exists external_inventory_admin_select on public.external_ticket_inventory;
create policy external_inventory_admin_select
  on public.external_ticket_inventory for select
  using (exists (
    select 1 from public.user_roles
    where user_roles.user_id = auth.uid() and user_roles.role = 'admin'::app_role
  ));
-- NB: the service_role used by the import function and the webhook-driven
-- claim trigger bypasses RLS, so no buyer/insert policy is required here.

-- 5. Capacity sync for external tiers ---------------------------------------
-- For an external tier, capacity == count of non-draft, non-cancelled rows
-- (available + sold + used). Recomputed on any inventory change so the
-- storefront's available_qty (total - sold - reserved) stays correct.
create or replace function public.sync_external_tier_capacity(p_tier_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.event_tiers t
  set total_qty = (
        select count(*) from public.external_ticket_inventory i
        where i.tier_id = p_tier_id and i.status in ('available','sold','used')
      ),
      updated_at = now()
  where t.id = p_tier_id and t.source = 'external';
end; $$;

create or replace function public.trg_sync_external_tier_capacity()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_external_tier_capacity(old.tier_id);
    return old;
  end if;
  perform public.sync_external_tier_capacity(new.tier_id);
  if tg_op = 'UPDATE' and new.tier_id is distinct from old.tier_id then
    perform public.sync_external_tier_capacity(old.tier_id);
  end if;
  return new;
end; $$;

drop trigger if exists external_inventory_capacity_sync on public.external_ticket_inventory;
create trigger external_inventory_capacity_sync
  after insert or update or delete on public.external_ticket_inventory
  for each row execute function public.trg_sync_external_tier_capacity();

-- 6. Claim trigger on event_tickets -----------------------------------------
-- On a FIRST sale of an external-tier ticket, atomically claim one available
-- allocation and copy its artifact onto the new ticket. Resale transfers reuse
-- the original order_id, so once an order's allocations are claimed we COPY
-- from them rather than consuming a new one. Platform tiers take a one-read
-- fast path and are completely unaffected.
create or replace function public.claim_external_ticket()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_source    text;
  v_claimed   integer;
  v_order_qty integer;
  v_row       public.external_ticket_inventory%rowtype;
begin
  -- Fast path: platform tiers (the overwhelming majority) — single indexed read.
  select source into v_source from public.event_tiers where id = new.tier_id;
  if v_source is distinct from 'external' then
    return new;
  end if;

  new.source := 'external';

  select count(*) into v_claimed
  from public.external_ticket_inventory where order_id = new.order_id;
  select quantity into v_order_qty
  from public.event_orders where id = new.order_id;

  if v_order_qty is null or v_claimed < v_order_qty then
    -- First sale: consume one fresh available allocation for this tier.
    select * into v_row
    from public.external_ticket_inventory
    where tier_id = new.tier_id and status = 'available'
    order by created_at
    for update skip locked
    limit 1;

    if found then
      update public.external_ticket_inventory
      set status = 'sold', order_id = new.order_id, event_ticket_id = new.id,
          buyer_id = new.buyer_id, updated_at = now()
      where id = v_row.id;
      new.external_code     := v_row.external_code;
      new.external_file_url := v_row.uploaded_file_url;
      new.external_provider := v_row.original_provider;
    end if;
    -- If none is available (capacity drift) the ticket still issues with a
    -- platform QR — the buyer already paid; admin reconciles from the manager.
  else
    -- Resale transfer reusing the original order_id: copy the artifact from an
    -- already-claimed allocation; do NOT consume a new one.
    select * into v_row
    from public.external_ticket_inventory
    where order_id = new.order_id
    order by created_at
    limit 1;
    if found then
      new.external_code     := v_row.external_code;
      new.external_file_url := v_row.uploaded_file_url;
      new.external_provider := v_row.original_provider;
      -- Reflect the new holder on the allocation for tracking.
      update public.external_ticket_inventory
      set event_ticket_id = new.id, buyer_id = new.buyer_id, updated_at = now()
      where id = v_row.id;
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists claim_external_ticket_trg on public.event_tickets;
create trigger claim_external_ticket_trg
  before insert on public.event_tickets
  for each row execute function public.claim_external_ticket();

-- 7. Organizer action: cancel unsold allocations ----------------------------
-- Only cancels rows still draft/available (never sold/used). Capacity is
-- auto-resynced by the inventory trigger. Returns the number cancelled.
create or replace function public.external_cancel_rows(p_row_ids uuid[])
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_count integer;
begin
  update public.external_ticket_inventory i
  set status = 'cancelled', updated_at = now()
  where i.id = any(p_row_ids)
    and i.status in ('draft','available')
    and exists (
      select 1 from public.events e
      join public.organizer_profiles op on op.id = e.organizer_id
      where e.id = i.event_id and op.user_id = auth.uid() and op.status = 'approved'
    );
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

grant execute on function public.external_cancel_rows(uuid[]) to authenticated;

-- 8. Private storage bucket for uploaded external ticket files ---------------
insert into storage.buckets (id, name, public)
values ('external-tickets', 'external-tickets', false)
on conflict (id) do nothing;

-- Organizers manage files under their own uid-prefixed folder
-- (path convention: <auth.uid()>/<event_id>/<file>). Buyers never read the
-- bucket directly — the external-ticket-file edge function issues short-lived
-- signed URLs after an ownership check.
drop policy if exists external_tickets_org_insert on storage.objects;
create policy external_tickets_org_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'external-tickets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists external_tickets_org_select on storage.objects;
create policy external_tickets_org_select
  on storage.objects for select to authenticated
  using (bucket_id = 'external-tickets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists external_tickets_org_update on storage.objects;
create policy external_tickets_org_update
  on storage.objects for update to authenticated
  using (bucket_id = 'external-tickets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists external_tickets_org_delete on storage.objects;
create policy external_tickets_org_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'external-tickets' and (storage.foldername(name))[1] = auth.uid()::text);

-- 9. Harden function exposure ------------------------------------------------
-- Trigger + helper functions must never be reachable over the REST RPC API.
-- Triggers fire regardless of EXECUTE grants, so revoking is safe. Only
-- external_cancel_rows is meant for signed-in organizers (it self-checks
-- ownership), so it keeps EXECUTE for `authenticated` only.
revoke execute on function public.claim_external_ticket() from public, anon, authenticated;
revoke execute on function public.trg_sync_external_tier_capacity() from public, anon, authenticated;
revoke execute on function public.sync_external_tier_capacity(uuid) from public, anon, authenticated;
revoke execute on function public.external_cancel_rows(uuid[]) from public, anon;
grant execute on function public.external_cancel_rows(uuid[]) to authenticated;
