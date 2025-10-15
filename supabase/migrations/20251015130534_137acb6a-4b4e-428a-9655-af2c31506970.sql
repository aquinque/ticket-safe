-- Add soft delete and account lockout columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN locked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for active profiles
CREATE INDEX idx_profiles_active ON public.profiles(id) 
WHERE deleted_at IS NULL;

-- Update RLS policy to exclude deleted profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id AND deleted_at IS NULL);

-- Function to check if account is locked
CREATE OR REPLACE FUNCTION public.check_account_lockout(user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  is_locked BOOLEAN;
BEGIN
  SELECT locked_until > NOW() INTO is_locked
  FROM public.profiles
  WHERE email = user_email AND deleted_at IS NULL;
  
  RETURN COALESCE(is_locked, false);
END;
$$;

-- Function to increment failed login attempts
CREATE OR REPLACE FUNCTION public.increment_failed_login(user_email TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE public.profiles
  SET 
    failed_login_attempts = failed_login_attempts + 1,
    locked_until = CASE 
      WHEN failed_login_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
      ELSE locked_until
    END
  WHERE email = user_email AND deleted_at IS NULL
  RETURNING failed_login_attempts INTO new_count;
  
  RETURN COALESCE(new_count, 0);
END;
$$;

-- Function to reset failed login attempts
CREATE OR REPLACE FUNCTION public.reset_failed_login(user_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    failed_login_attempts = 0,
    locked_until = NULL
  WHERE email = user_email AND deleted_at IS NULL;
END;
$$;

-- Function to anonymize user data instead of deleting
CREATE OR REPLACE FUNCTION public.anonymize_user(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Mark profile as deleted and anonymize PII
  UPDATE public.profiles
  SET 
    deleted_at = NOW(),
    email = 'deleted-' || user_id || '@anonymous.local',
    full_name = 'Deleted User',
    university_email = 'deleted-' || user_id || '@anonymous.local'
  WHERE id = user_id AND deleted_at IS NULL;
  
  -- Transactions and tickets remain for audit trail
  -- They will still reference the anonymized profile
END;
$$;