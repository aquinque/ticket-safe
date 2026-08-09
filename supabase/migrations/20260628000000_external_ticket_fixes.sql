-- ============================================================================
-- External Ticket Import — correctness + performance fixes
-- ----------------------------------------------------------------------------
-- Follow-up to 20260627000000_external_ticket_import.sql. Fully ADDITIVE.
--
--  1. [CRITICAL] Make external_ticket_inventory.event_ticket_id FK DEFERRABLE
--     INITIALLY DEFERRED. The claim trigger runs BEFORE INSERT on event_tickets
--     and back-links the claimed allocation to new.id. With an IMMEDIATE FK that
--     reference is validated before the event_tickets row physically exists, so
--     the insert aborts -> a paid external sale would leave the buyer with NO
--     ticket. Deferring the check to commit lets the parent row land first.
--  2. [PERF] Replace the per-row capacity-sync trigger with STATEMENT-level
--     triggers, so a bulk import recomputes each tier's capacity ONCE instead of
--     once per row (was O(N^2) — a large CSV import could stall / time out).
--  3. [SAFETY] On capacity drift (a paid sale with no allocation left) record a
--     flagged 'sold' row so the organizer sees the anomaly in the manager
--     instead of it passing silently with a non-scanning platform QR.
--  4. [ATOMICITY] external_set_tier_active() flips a tier's on-sale state AND its
--     unsold allocations together in one transaction (was two client writes that
--     could half-apply).
-- ============================================================================

-- 1. Deferrable back-link FK --------------------------------------------------
-- Inline FKs get the deterministic name <table>_<column>_fkey.
alter table public.external_ticket_inventory
  drop constraint if exists external_ticket_inventory_event_ticket_id_fkey;
alter table public.external_ticket_inventory
  add constraint external_ticket_inventory_event_ticket_id_fkey
    foreign key (event_ticket_id) references public.event_tickets(id)
    on delete set null
    deferrable initially deferred;

-- 2. Statement-level capacity sync -------------------------------------------
-- Recompute total_qty for a set of external tiers in one shot.
create or replace function public.sync_external_tiers_capacity(p_tier_ids uuid[])
returns void language sql security definer set search_path to 'public' as $$
  update public.event_tiers t
  set total_qty = (
        select count(*) from public.external_ticket_inventory i
        where i.tier_id = t.id and i.status in ('available','sold','used')
      ),
      updated_at = now()
  where t.source = 'external' and t.id = any(p_tier_ids);
$$;

create or replace function public.trg_ext_cap_ins()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.sync_external_tiers_capacity(array(select distinct tier_id from newtab));
  return null;
end; $$;

create or replace function public.trg_ext_cap_del()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.sync_external_tiers_capacity(array(select distinct tier_id from oldtab));
  return null;
end; $$;

create or replace function public.trg_ext_cap_upd()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.sync_external_tiers_capacity(array(
    select distinct tier_id from (
      select tier_id from newtab
      union all
      select tier_id from oldtab
    ) u));
  return null;
end; $$;

-- Swap the old per-row trigger for three statement-level ones.
drop trigger if exists external_inventory_capacity_sync on public.external_ticket_inventory;
drop trigger if exists ext_cap_ins on public.external_ticket_inventory;
drop trigger if exists ext_cap_del on public.external_ticket_inventory;
drop trigger if exists ext_cap_upd on public.external_ticket_inventory;

create trigger ext_cap_ins after insert on public.external_ticket_inventory
  referencing new table as newtab
  for each statement execute function public.trg_ext_cap_ins();
create trigger ext_cap_del after delete on public.external_ticket_inventory
  referencing old table as oldtab
  for each statement execute function public.trg_ext_cap_del();
create trigger ext_cap_upd after update on public.external_ticket_inventory
  referencing new table as newtab old table as oldtab
  for each statement execute function public.trg_ext_cap_upd();

-- The old per-row helpers are no longer referenced by any trigger.
drop function if exists public.trg_sync_external_tier_capacity();
drop function if exists public.sync_external_tier_capacity(uuid);

-- 3. Claim trigger: same logic, now surfaces capacity drift ------------------
-- (Unchanged fast path + claim/copy behaviour; the only new branch is the
-- flagged synthetic row when a paid sale finds no allocation. Safe to reference
-- new.id in the child insert now that the FK is deferred.)
create or replace function public.claim_external_ticket()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_source    text;
  v_claimed   integer;
  v_order_qty integer;
  v_row       public.external_ticket_inventory%rowtype;
begin
  select source into v_source from public.event_tiers where id = new.tier_id;
  if v_source is distinct from 'external' then
    return new;                       -- platform tiers: one-read fast path
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
    else
      -- Capacity drift: paid sale, but no allocation left. Record a flagged
      -- 'sold' row so the organizer sees it in the manager and can reconcile,
      -- rather than the buyer silently getting a platform QR that won't scan
      -- at the venue. (FK to event_tickets is deferred -> new.id is fine.)
      insert into public.external_ticket_inventory
        (event_id, tier_id, source, status, order_id, event_ticket_id, buyer_id, notes)
      values
        (new.event_id, new.tier_id, 'external', 'sold', new.order_id, new.id, new.buyer_id,
         'AUTO-ISSUED with a platform QR: no partner allocation was available at sale time - reconcile with the provider.');
    end if;
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
      update public.external_ticket_inventory
      set event_ticket_id = new.id, buyer_id = new.buyer_id, updated_at = now()
      where id = v_row.id;
    end if;
  end if;

  return new;
end; $$;

-- 4. Atomic publish/unpublish for an external tier --------------------------
-- Flips the tier's is_active AND its unsold allocations (draft<->available) in a
-- single transaction. Self-checks organizer ownership.
create or replace function public.external_set_tier_active(p_tier_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (
    select 1 from public.event_tiers t
    join public.events e on e.id = t.event_id
    join public.organizer_profiles op on op.id = e.organizer_id
    where t.id = p_tier_id and t.source = 'external'
      and op.user_id = auth.uid() and op.status = 'approved'
  ) then
    raise exception 'Not authorized for this tier';
  end if;

  update public.event_tiers set is_active = p_active, updated_at = now()
  where id = p_tier_id;

  update public.external_ticket_inventory
  set status = case when p_active then 'available' else 'draft' end, updated_at = now()
  where tier_id = p_tier_id
    and status = case when p_active then 'draft' else 'available' end;
end; $$;

-- 5. Lock down function exposure (mirrors the base migration) ----------------
revoke execute on function public.sync_external_tiers_capacity(uuid[]) from public, anon, authenticated;
revoke execute on function public.trg_ext_cap_ins() from public, anon, authenticated;
revoke execute on function public.trg_ext_cap_del() from public, anon, authenticated;
revoke execute on function public.trg_ext_cap_upd() from public, anon, authenticated;
revoke execute on function public.claim_external_ticket() from public, anon, authenticated;
revoke execute on function public.external_set_tier_active(uuid, boolean) from public, anon;
grant  execute on function public.external_set_tier_active(uuid, boolean) to authenticated;
