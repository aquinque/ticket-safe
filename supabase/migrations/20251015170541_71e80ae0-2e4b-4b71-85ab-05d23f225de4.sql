-- Add campus column to events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS campus TEXT;

-- Add campus column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS campus TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_events_campus ON public.events(campus);
CREATE INDEX IF NOT EXISTS idx_profiles_campus ON public.profiles(campus);

-- Update RLS policy for events to filter by user's campus
DROP POLICY IF EXISTS "Anyone can view active events from their university" ON public.events;

CREATE POLICY "Users can view active events from their campus"
ON public.events
FOR SELECT
USING (
  is_active = true 
  AND (
    campus = (SELECT campus FROM public.profiles WHERE id = auth.uid())
    OR university = (SELECT university FROM public.profiles WHERE id = auth.uid())
  )
);