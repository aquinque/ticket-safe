-- Drop the existing update policy for profiles
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create new policy that allows users to update their profile but NOT the university field
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id AND 
  university = (SELECT university FROM public.profiles WHERE id = auth.uid())
);

-- Add a comment explaining the security measure
COMMENT ON POLICY "Users can update their own profile" ON public.profiles IS 
'Allows users to update their own profile fields, but prevents changing the university field to prevent cross-university access bypass';