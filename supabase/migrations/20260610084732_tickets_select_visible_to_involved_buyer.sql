-- A buyer must be able to read the ticket they're negotiating (conversation)
-- or purchasing (transaction) even once it leaves 'available' (reserved/sold).
-- The old policy only exposed 'available' tickets to non-sellers, which broke
-- the chat "Buy" button and the checkout page the moment a ticket was reserved.
drop policy if exists "Tickets visible to seller, admins, or when available" on public.tickets;

create policy "Tickets visible to involved parties or when available"
on public.tickets
for select
using (
  status = 'available'
  or auth.uid() = seller_id
  or exists (
    select 1 from public.user_roles
    where user_roles.user_id = (select auth.uid()) and user_roles.role = 'admin'
  )
  or exists (
    select 1 from public.conversations c
    where c.ticket_id = tickets.id and c.buyer_id = (select auth.uid())
  )
  or exists (
    select 1 from public.transactions t
    where t.ticket_id = tickets.id and t.buyer_id = (select auth.uid())
  )
);
