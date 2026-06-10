-- Guard column so the "new event" email fires once per event.
alter table public.events
  add column if not exists followers_notified_at timestamptz;

-- When an event becomes published (and hasn't notified followers yet), ping
-- notify-event-followers via pg_net. The edge function claims the guard
-- atomically and emails the organizer's followers.
create or replace function public.dispatch_event_followers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published'
     and new.followers_notified_at is null
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform net.http_post(
      url := 'https://lgmnatfvdzzjzyxlenry.supabase.co/functions/v1/notify-event-followers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbW5hdGZ2ZHp6anp5eGxlbnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjE2ODUsImV4cCI6MjA4ODE5NzY4NX0.u3ZbqKzuO2vXkck3BvyEgE0Cn9SVez89AYB2XPHE3LY',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbW5hdGZ2ZHp6anp5eGxlbnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjE2ODUsImV4cCI6MjA4ODE5NzY4NX0.u3ZbqKzuO2vXkck3BvyEgE0Cn9SVez89AYB2XPHE3LY'
      ),
      body := jsonb_build_object('event_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dispatch_event_followers on public.events;
create trigger trg_dispatch_event_followers
  after insert or update on public.events
  for each row execute function public.dispatch_event_followers();
