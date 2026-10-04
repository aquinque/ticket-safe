-- Access links for buyers without an account. Additive only: one new table.
--
-- Only the SHA-256 hash of each token is stored, never the token itself.
-- RLS is enabled with no policy: only the service role (edge functions) can read
-- or write. Nothing is granted to anon or authenticated.
--
-- scope 'ticket' : the link opens exactly one ticket (sent in the confirmation email).
-- scope 'order'  : the link opens the tickets of one order (used on the success page
--                  right after payment, then not sent anywhere else).

create table if not exists public.guest_access_tokens (
  token_hash  text primary key,
  scope       text not null check (scope in ('ticket', 'order')),
  ticket_id   uuid references public.event_tickets(id) on delete cascade,
  order_id    uuid references public.event_orders(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (
    (scope = 'ticket' and ticket_id is not null and order_id is null) or
    (scope = 'order'  and order_id is not null and ticket_id is null)
  )
);

create index if not exists guest_access_tokens_ticket_idx on public.guest_access_tokens (ticket_id);
create index if not exists guest_access_tokens_order_idx on public.guest_access_tokens (order_id);

alter table public.guest_access_tokens enable row level security;
