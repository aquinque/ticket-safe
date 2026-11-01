-- Lets the site header show a "Promoter space" entry to accounts that accepted at least one promoter invitation.
CREATE OR REPLACE FUNCTION public.is_promoter()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.event_promoter_links WHERE promoter_user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_promoter() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_promoter() TO authenticated;
