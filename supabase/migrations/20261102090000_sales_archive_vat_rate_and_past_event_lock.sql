-- Sales archive in Ticket Studio: the end-of-event rule in SQL, ended events read-only,
-- a VAT rate per event, and the per-event sales figures the archive lists.
--
-- Applied through the Supabase MCP on 2026-11-02.
--
-- 1. public.event_end(date, ends_at): the one end-of-event rule, mirrored from
--    supabase/functions/_shared/eventTime.ts (ends_at, or the start + 8 hours). An event is
--    past once now() >= event_end(). Nothing is ever written to events.status for this: the
--    phase (upcoming / live / past) is computed wherever it is read, from the same two columns.
-- 2. events.vat_rate: nullable, not shown in the UI yet. TicketSafe's own service fees carry
--    no VAT (art. 293 B CGI); the VAT treatment of ticket revenue is the organizer's.
-- 3. Ticket tiers of an ended event are read-only for organizers (BEFORE INSERT OR UPDATE
--    trigger, same shape as restrict_published_event_updates). The service role (edge
--    functions: refunds, releases, inventory) and admins keep working after the event.
-- 4. public.studio_event_sales_summary(organizer): one row per event with tickets sold,
--    capacity, gross, fees, net, refunds, check-ins and a payout status, for the Sales archive
--    and the past-event page. SECURITY INVOKER: the caller's row-level security on events,
--    event_orders, event_tickets, event_tiers, stripe_connect_payout_jobs, event_statements
--    and organizer_payouts applies, so an organizer only ever aggregates their own rows.
-- 5. event_ticket_status gains 'transferred' (written by the resale webhooks since the
--    nominative-ticket migration; the live type already has it, no migration ever added it).

-- ── 1. The end-of-event rule ─────────────────────────────────────────────────
create or replace function public.event_end(p_date timestamptz, p_ends_at timestamptz)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_ends_at is not null and (p_date is null or p_ends_at > p_date) then p_ends_at
    when p_date is not null then p_date + interval '8 hours'
    else null
  end
$$;

comment on function public.event_end(timestamptz, timestamptz) is
  'End of an event: ends_at when set (and after the start), otherwise the start + 8 hours. The same rule as supabase/functions/_shared/eventTime.ts; past = now() >= event_end().';

-- ── 2. VAT rate per event (not exposed yet) ──────────────────────────────────
alter table public.events add column if not exists vat_rate numeric(5, 2);

comment on column public.events.vat_rate is
  'VAT rate (percent) the organizer applies to this event''s ticket revenue; null = not declared. Not shown in the UI yet. TicketSafe''s service fees carry no VAT (art. 293 B CGI).';

-- ── 3. Ticket tiers of an ended event are read-only for organizers ───────────
create or replace function public.restrict_past_event_tier_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end timestamptz;
begin
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  if exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') then
    return new;
  end if;

  select public.event_end(e.date, e.ends_at) into v_end
  from public.events e
  where e.id = new.event_id;

  if v_end is not null and v_end <= now() then
    raise exception 'This event has ended: its ticket tiers are read-only.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace trigger trg_restrict_past_event_tier_changes
  before insert or update on public.event_tiers
  for each row execute function public.restrict_past_event_tier_changes();

-- ── 4. Per-event sales figures for the archive ───────────────────────────────
create or replace function public.studio_event_sales_summary(p_organizer_id uuid)
returns table (
  event_id uuid,
  tickets_sold bigint,
  capacity bigint,
  gross_cents bigint,
  fee_cents bigint,
  net_cents bigint,
  refunded_orders bigint,
  refunded_tickets bigint,
  refunded_cents bigint,
  checked_in bigint,
  payout_status text
)
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    select e.id, e.date, e.ends_at, e.status, e.payment_provider
    from public.events e
    where e.organizer_id = p_organizer_id
  ),
  paid as (
    select o.event_id,
           coalesce(sum(o.quantity), 0)::bigint as tickets_sold,
           coalesce(sum(o.total_cents), 0)::bigint as gross_cents,
           coalesce(sum(o.fee_cents), 0)::bigint as fee_cents
    from public.event_orders o
    join ev on ev.id = o.event_id
    where o.status = 'paid'
    group by o.event_id
  ),
  refunded as (
    select o.event_id,
           count(*)::bigint as refunded_orders,
           coalesce(sum(o.quantity), 0)::bigint as refunded_tickets,
           coalesce(sum(o.total_cents), 0)::bigint as refunded_cents
    from public.event_orders o
    join ev on ev.id = o.event_id
    where o.status = 'refunded'
    group by o.event_id
  ),
  cap as (
    select t.event_id, coalesce(sum(t.total_qty), 0)::bigint as capacity
    from public.event_tiers t
    join ev on ev.id = t.event_id
    group by t.event_id
  ),
  scans as (
    select k.event_id, count(*)::bigint as checked_in
    from public.event_tickets k
    join ev on ev.id = k.event_id
    where k.scanned_at is not null
    group by k.event_id
  ),
  -- Revolut era: bank transfers were pooled per organizer, so an event counts as paid out once the
  -- transfers sent cover the organizer's cumulative net up to that event (same rule as the billing documents).
  legacy as (
    select ev.id,
           sum(coalesce(paid.gross_cents, 0) - coalesce(paid.fee_cents, 0)) over (order by ev.date, ev.id) as cumulative_net_cents
    from ev
    left join paid on paid.event_id = ev.id
    where ev.payment_provider = 'revolut'
  ),
  wired as (
    select coalesce(sum(coalesce(p.gross_cents, p.amount_cents)), 0)::bigint as sent_cents
    from public.organizer_payouts p
    where p.organizer_id = p_organizer_id and p.status = 'sent'
  )
  select
    ev.id as event_id,
    coalesce(paid.tickets_sold, 0) as tickets_sold,
    coalesce(cap.capacity, 0) as capacity,
    coalesce(paid.gross_cents, 0) as gross_cents,
    coalesce(paid.fee_cents, 0) as fee_cents,
    coalesce(paid.gross_cents, 0) - coalesce(paid.fee_cents, 0) as net_cents,
    coalesce(refunded.refunded_orders, 0) as refunded_orders,
    coalesce(refunded.refunded_tickets, 0) as refunded_tickets,
    coalesce(refunded.refunded_cents, 0) as refunded_cents,
    coalesce(scans.checked_in, 0) as checked_in,
    case
      when coalesce(paid.gross_cents, 0) - coalesce(paid.fee_cents, 0) <= 0 then 'none'
      when ev.status = 'cancelled' then 'none'
      when exists (
        select 1 from public.stripe_connect_payout_jobs j
        where j.event_id = ev.id and j.status = 'sent'
      ) then 'paid'
      when exists (
        select 1 from public.event_statements s
        where s.event_id = ev.id
          and coalesce(nullif(s.totals->>'payouts_paid_cents', '')::bigint, 0) > 0
      ) then 'paid'
      -- The job chain found nothing left on the balance: the money already reached the bank (a cash-out or an earlier payout).
      when exists (
        select 1 from public.stripe_connect_payout_jobs j
        where j.event_id = ev.id and j.status = 'cancelled' and j.blocked_reason ilike 'nothing left%'
      ) then 'paid'
      when ev.payment_provider = 'revolut'
        and (select l.cumulative_net_cents from legacy l where l.id = ev.id) <= (select w.sent_cents from wired w)
      then 'paid'
      else 'pending'
    end as payout_status
  from ev
  left join paid on paid.event_id = ev.id
  left join refunded on refunded.event_id = ev.id
  left join cap on cap.event_id = ev.id
  left join scans on scans.event_id = ev.id
$$;

comment on function public.studio_event_sales_summary(uuid) is
  'Per-event sales figures of an organizer for the Ticket Studio Sales archive: paid orders (tickets, gross, fees, net), refunded orders, check-ins and a payout status (paid / pending / none). Runs with the caller''s row-level security.';

revoke all on function public.studio_event_sales_summary(uuid) from public;
grant execute on function public.studio_event_sales_summary(uuid) to authenticated, service_role;

-- ── 5. The 'transferred' ticket status the resale webhooks write ─────────────
alter type public.event_ticket_status add value if not exists 'transferred';
