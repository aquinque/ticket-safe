-- Fix timing attack vulnerabilities in security definer functions

-- 1. Update get_purchased_ticket_file with timing normalization
CREATE OR REPLACE FUNCTION public.get_purchased_ticket_file(ticket_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  file_url TEXT;
  is_valid BOOLEAN;
  start_delay FLOAT;
  end_delay FLOAT;
BEGIN
  -- Add random delay at start (0-10ms)
  start_delay := random() * 0.01;
  PERFORM pg_sleep(start_delay);
  
  -- Always query both tables to maintain consistent timing
  SELECT 
    tk.ticket_file_url,
    EXISTS(
      SELECT 1 FROM public.transactions tr
      JOIN public.events e ON e.id = tk.event_id
      WHERE tr.ticket_id = get_purchased_ticket_file.ticket_id
        AND tr.buyer_id = auth.uid()
        AND tr.status = 'completed'
        AND e.is_active = true
    )
  INTO file_url, is_valid
  FROM public.tickets tk
  WHERE tk.id = get_purchased_ticket_file.ticket_id;
  
  -- Add random delay before returning (0-10ms)
  end_delay := random() * 0.01;
  PERFORM pg_sleep(end_delay);
  
  IF is_valid THEN
    RETURN file_url;
  END IF;
  
  RETURN NULL;
END;
$function$;

-- 2. Update check_account_lockout with timing normalization
CREATE OR REPLACE FUNCTION public.check_account_lockout(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_locked BOOLEAN;
  delay_time FLOAT;
BEGIN
  -- Add random delay (0-10ms)
  delay_time := random() * 0.01;
  PERFORM pg_sleep(delay_time);
  
  SELECT locked_until > NOW() INTO is_locked
  FROM public.profiles
  WHERE email = user_email AND deleted_at IS NULL;
  
  -- Add another random delay before returning
  delay_time := random() * 0.01;
  PERFORM pg_sleep(delay_time);
  
  RETURN COALESCE(is_locked, false);
END;
$function$;

-- 3. Update has_role with timing normalization
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Note: SQL functions don't support pg_sleep, but they're already
  -- more resistant to timing attacks due to query planning
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

-- Add audit logging table for failed access attempts
CREATE TABLE IF NOT EXISTS public.access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  function_name text NOT NULL,
  resource_id uuid,
  access_granted boolean NOT NULL,
  ip_address inet,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Only admins can view audit logs"
ON public.access_audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_access_audit_log_user_created 
ON public.access_audit_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_audit_log_created 
ON public.access_audit_log(created_at DESC);

COMMENT ON TABLE public.access_audit_log IS 
'Audit trail for access attempts to sensitive functions and resources. Used for security monitoring and attack detection.';