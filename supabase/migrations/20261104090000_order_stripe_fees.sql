-- Stripe's processing fee on each paid Studio order, read from the charge's balance transaction.
-- Filled by the admin-stripe-fees function (service role) for the admin overview's
-- "We keep after Stripe" figure. Admins read it; nobody else does, and no client writes it.
create table if not exists public.order_stripe_fees (
  order_id uuid primary key references public.event_orders(id) on delete cascade,
  fee_cents integer,
  net_cents integer,
  amount_cents integer,
  currency text,
  balance_transaction_id text,
  note text,
  fetched_at timestamptz not null default now()
);

alter table public.order_stripe_fees enable row level security;

drop policy if exists "Admins read Stripe fees" on public.order_stripe_fees;
create policy "Admins read Stripe fees" on public.order_stripe_fees
  for select to authenticated
  using (exists (select 1 from public.user_roles where user_roles.user_id = (select auth.uid()) and user_roles.role = 'admin'::app_role));

revoke all on public.order_stripe_fees from anon;
revoke insert, update, delete on public.order_stripe_fees from authenticated;
grant select on public.order_stripe_fees to authenticated;

comment on table public.order_stripe_fees is
  'Stripe processing fee per paid order (balance transaction fee), for the admin overview. Written by admin-stripe-fees only.';
