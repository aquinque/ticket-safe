create extension if not exists pg_net;

-- When a resale ticket becomes live, ping notify-ticket-alerts (fire-and-forget
-- via pg_net) so opted-in users get an email. The edge function is idempotent
-- and only emails users who explicitly asked to watch this event.
create or replace function public.dispatch_ticket_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'available'
     and new.verification_status = 'verified'
     and new.event_id is not null
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.verification_status is distinct from new.verification_status
     )
  then
    perform net.http_post(
      url := 'https://lgmnatfvdzzjzyxlenry.supabase.co/functions/v1/notify-ticket-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbW5hdGZ2ZHp6anp5eGxlbnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjE2ODUsImV4cCI6MjA4ODE5NzY4NX0.u3ZbqKzuO2vXkck3BvyEgE0Cn9SVez89AYB2XPHE3LY',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbW5hdGZ2ZHp6anp5eGxlbnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjE2ODUsImV4cCI6MjA4ODE5NzY4NX0.u3ZbqKzuO2vXkck3BvyEgE0Cn9SVez89AYB2XPHE3LY'
      ),
      body := jsonb_build_object('event_id', new.event_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dispatch_ticket_alerts on public.tickets;
create trigger trg_dispatch_ticket_alerts
  after insert or update on public.tickets
  for each row execute function public.dispatch_ticket_alerts();
