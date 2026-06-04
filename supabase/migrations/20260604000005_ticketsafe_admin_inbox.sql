-- Make ticketsafe.friendly@gmail.com (the Ticket Safe ops inbox) auto-admin
-- the moment that account signs up. Used as the only destination for admin
-- notifications going forward; Achille/Adrien stop being copied.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

CREATE OR REPLACE FUNCTION public.grant_admin_to_ticketsafe_inbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = 'ticketsafe.friendly@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_ts_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_ts_admin
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.grant_admin_to_ticketsafe_inbox();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
WHERE lower(email) = 'ticketsafe.friendly@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
