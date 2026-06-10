-- Server-side enforcement that new accounts use an ESCP student email.
-- The frontend (validate-signup) already checks this, but it can be bypassed
-- by calling the public auth API directly. This BEFORE INSERT trigger is the
-- backstop: it rejects any new auth user whose email isn't @edu.escp.eu
-- (with a small allow-list for the Ticket Safe ops inbox).

create or replace function public.enforce_escp_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowlist text[] := array['ticketsafe.friendly@gmail.com'];
  em text := lower(coalesce(new.email, ''));
begin
  -- No email (e.g. phone-only signups) → don't block.
  if em = '' then
    return new;
  end if;
  if em like '%@edu.escp.eu' or em = any(allowlist) then
    return new;
  end if;
  raise exception 'Only ESCP student email addresses (@edu.escp.eu) are accepted'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_enforce_escp_signup on auth.users;
create trigger trg_enforce_escp_signup
  before insert on auth.users
  for each row execute function public.enforce_escp_signup();
