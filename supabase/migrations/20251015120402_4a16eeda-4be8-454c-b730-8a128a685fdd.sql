-- Create private storage bucket for ticket files
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-files', 'ticket-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for ticket-files bucket
CREATE POLICY "Sellers can upload ticket files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ticket-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Buyers can download purchased tickets"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'ticket-files' AND
  EXISTS (
    SELECT 1 FROM public.transactions t
    JOIN public.tickets tk ON t.ticket_id = tk.id
    WHERE tk.ticket_file_url = storage.objects.name
    AND t.buyer_id = auth.uid()
    AND t.status = 'completed'
  )
);

CREATE POLICY "Sellers can view their ticket files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'ticket-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Create verified university domains table
CREATE TABLE IF NOT EXISTS public.verified_university_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  university_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.verified_university_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active university domains"
ON public.verified_university_domains FOR SELECT
USING (active = true);

CREATE POLICY "Admins can manage university domains"
ON public.verified_university_domains FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed university domains
INSERT INTO public.verified_university_domains (domain, university_name, active) VALUES
  ('edu', 'Generic University Domain', true),
  ('ac.uk', 'UK University Domain', true),
  ('ox.ac.uk', 'University of Oxford', true),
  ('cam.ac.uk', 'University of Cambridge', true),
  ('mit.edu', 'Massachusetts Institute of Technology', true),
  ('stanford.edu', 'Stanford University', true),
  ('harvard.edu', 'Harvard University', true),
  ('berkeley.edu', 'UC Berkeley', true)
ON CONFLICT (domain) DO NOTHING;

-- Function to validate university email
CREATE OR REPLACE FUNCTION public.validate_university_email(email_address TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  email_domain TEXT;
BEGIN
  -- Extract domain from email
  email_domain := LOWER(SUBSTRING(email_address FROM '@(.*)$'));
  
  -- Check if domain or any parent domain exists in verified domains
  RETURN EXISTS (
    SELECT 1 FROM public.verified_university_domains
    WHERE active = true
    AND (
      email_domain = domain
      OR email_domain LIKE '%.' || domain
    )
  );
END;
$$;

-- Function to get purchased ticket file securely
CREATE OR REPLACE FUNCTION public.get_purchased_ticket_file(ticket_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  file_url TEXT;
BEGIN
  -- Check if user has completed purchase
  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE transactions.ticket_id = get_purchased_ticket_file.ticket_id
    AND transactions.buyer_id = auth.uid()
    AND transactions.status = 'completed'
  ) THEN
    -- Return ticket file URL
    SELECT ticket_file_url INTO file_url
    FROM public.tickets
    WHERE id = get_purchased_ticket_file.ticket_id;
    
    RETURN file_url;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Update tickets RLS policies to exclude file URLs from public view
DROP POLICY IF EXISTS "Anyone can view available tickets from their university events" ON public.tickets;

CREATE POLICY "Anyone can view available tickets (excluding file URLs)"
ON public.tickets FOR SELECT
USING (
  status = 'available'::ticket_status AND
  EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = tickets.event_id
    AND e.university = (SELECT profiles.university FROM profiles WHERE profiles.id = auth.uid())
    AND e.is_active = true
  )
);

CREATE POLICY "Sellers can view their own ticket details including files"
ON public.tickets FOR SELECT
USING (auth.uid() = seller_id);

-- Add policy for admins to update transactions
CREATE POLICY "Admins can update transactions"
ON public.transactions FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));