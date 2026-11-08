-- Entry times printed on the ticket: the event's last entry, and an optional per-tier "entry before"
-- (an early-entry ticket valid only before a given time). Both optional; nothing else reads them yet.
alter table public.events add column if not exists last_entry_at timestamptz;
alter table public.event_tiers add column if not exists entry_until timestamptz;
comment on column public.events.last_entry_at is 'Last entry time, shown on the ticket. Null: not shown.';
comment on column public.event_tiers.entry_until is 'Ticket of this tier admits only before this time (e.g. early entry). Shown on the ticket. Null: no limit.';
