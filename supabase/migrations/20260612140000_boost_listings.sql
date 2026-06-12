-- Boost / featured resale listings: a paid placement that floats a listing to
-- the top of the marketplace and shows a "Featured" badge until boosted_until.
alter table public.tickets add column if not exists boosted_until timestamptz;
create index if not exists tickets_boosted_idx on public.tickets (boosted_until)
  where boosted_until is not null;

-- Tracks each boost purchase (Revolut order), for idempotent activation.
create table if not exists public.boost_orders (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  days            integer not null check (days > 0 and days <= 60),
  amount_cents    integer not null check (amount_cents >= 0),
  currency        text not null default 'EUR',
  status          text not null default 'pending'
                    check (status in ('pending','active','cancelled','failed')),
  revolut_order_id text,
  created_at      timestamptz not null default now(),
  activated_at    timestamptz
);

alter table public.boost_orders enable row level security;
-- Sellers can read their own boost orders; writes happen only via the
-- service-role edge functions (boost-checkout / boost-confirm).
create policy "Sellers read own boost orders" on public.boost_orders
  for select using (seller_id = auth.uid());

create index if not exists boost_orders_seller_idx on public.boost_orders (seller_id);
create index if not exists boost_orders_revolut_idx on public.boost_orders (revolut_order_id)
  where revolut_order_id is not null;
