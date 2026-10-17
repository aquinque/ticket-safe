-- Service fee paid by the buyer, per ticket: a percentage of the ticket price.
--
-- It replaces "4 % + 0,80 €" (20261006120000_service_fee_formula.sql). With tickets at
-- 10 € and 20 €, a fixed part on top of a percentage only made the fee harder to explain.
-- The fee is now
--     round(ticket price × percent / 100)
-- never below min_cents (so a very cheap ticket still covers the card processing cost) and
-- never above max_cents (so an expensive ticket isn't charged a fee out of proportion).
--
-- The three numbers live in one row of service_fee_settings. Changing the percentage is a
-- one-line update, not a deploy:
--     update public.service_fee_settings set percent = 15, updated_at = now() where id;
-- Orders already placed keep the fee they were charged (it is stored on the order); only
-- new checkouts use the new numbers, and the site shows the new fee straight away because
-- it reads it from get_studio_commission_cents.
--
-- get_studio_commission_cents stays the only place a fee is computed. An admin-set
-- events.commission_override_cents (a negotiated fee, in cents per ticket) still wins over
-- the percentage, and a free ticket carries no fee.
--
-- The numbers aren't in billing_settings, which has no policy for the browser, because the
-- fee is public by nature (it is shown to every buyer) and the function that computes it is
-- called by anonymous visitors. Their table is readable by everyone and writable by nobody
-- but the service role.

create table if not exists public.service_fee_settings (
  id boolean primary key default true check (id), -- one row only
  percent numeric(5, 2) not null default 13.00,
  min_cents integer not null default 70,
  max_cents integer not null default 350,
  updated_at timestamptz not null default now(),
  -- guard rails against a typo (130 for 13) or a minimum above the maximum
  constraint service_fee_settings_range check (
    percent >= 0 and percent <= 30
    and min_cents >= 0
    and max_cents >= min_cents
  )
);

insert into public.service_fee_settings (id) values (true) on conflict (id) do nothing;

alter table public.service_fee_settings enable row level security;

drop policy if exists service_fee_settings_read on public.service_fee_settings;
create policy service_fee_settings_read on public.service_fee_settings
  for select to anon, authenticated
  using (true);
-- No insert/update/delete policy: only the service role (and the SQL editor) can change the fee.

comment on table public.service_fee_settings is
  'The buyer service fee on Studio tickets: percent of the ticket price, clamped to [min_cents, max_cents]. One row. Read through get_studio_commission_cents; edit with a plain UPDATE.';
comment on column public.service_fee_settings.percent is
  'Service fee as a percentage of the ticket price (13.00 = 13 %). Between 0 and 30.';
comment on column public.service_fee_settings.min_cents is
  'Lowest fee charged on a paid ticket, in cents.';
comment on column public.service_fee_settings.max_cents is
  'Highest fee charged on a ticket, in cents.';

create or replace function public.get_studio_commission_cents(p_price_cents integer, p_override_cents integer default null)
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when p_price_cents is null or p_price_cents <= 0 then 0
    when p_override_cents is not null then greatest(0, p_override_cents)
    else (
      select least(s.max_cents, greatest(s.min_cents, round(p_price_cents * s.percent / 100.0)::integer))
      from public.service_fee_settings s
      where s.id
    )
  end;
$$;

comment on function public.get_studio_commission_cents is
  'Buyer-paid service fee for ONE studio ticket, in cents: service_fee_settings.percent of the price, clamped to [min_cents, max_cents]; 0 for a free ticket. events.commission_override_cents (negotiated fee) replaces the percentage when set. Single source of truth: every checkout and every price display must call this.';
