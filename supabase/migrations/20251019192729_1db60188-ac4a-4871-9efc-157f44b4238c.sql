-- Create consent types enum
CREATE TYPE public.consent_type AS ENUM (
  'data_monetization',
  'aggregated_analytics',
  'research_participation'
);

-- Create consent status enum
CREATE TYPE public.consent_status AS ENUM (
  'granted',
  'withdrawn',
  'expired'
);

-- Create user consents table
CREATE TABLE public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type consent_type NOT NULL,
  status consent_status NOT NULL DEFAULT 'granted',
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  consent_text TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, consent_type)
);

-- Create data requests table (for GDPR subject access requests)
CREATE TABLE public.data_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'deletion', 'rectification')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_consents
CREATE POLICY "Users can view their own consents"
  ON public.user_consents
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own consents"
  ON public.user_consents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own consents"
  ON public.user_consents
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all consents"
  ON public.user_consents
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for data_requests
CREATE POLICY "Users can view their own data requests"
  ON public.data_requests
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own data requests"
  ON public.data_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all data requests"
  ON public.data_requests
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Create function for anonymized transaction statistics
CREATE OR REPLACE FUNCTION public.get_anonymized_transaction_stats(
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
  university TEXT,
  campus TEXT,
  transaction_count BIGINT,
  avg_amount NUMERIC,
  date_bucket DATE
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.university,
    p.campus,
    COUNT(t.id) as transaction_count,
    ROUND(AVG(t.amount), 2) as avg_amount,
    DATE_TRUNC('day', t.created_at)::DATE as date_bucket
  FROM public.transactions t
  JOIN public.profiles p ON t.buyer_id = p.id
  WHERE t.created_at BETWEEN start_date AND end_date
    AND t.status = 'completed'
    -- Only include data from users who have granted consent
    AND EXISTS (
      SELECT 1 FROM public.user_consents uc
      WHERE uc.user_id = t.buyer_id
        AND uc.consent_type = 'data_monetization'
        AND uc.status = 'granted'
        AND (uc.expires_at IS NULL OR uc.expires_at > NOW())
    )
  GROUP BY p.university, p.campus, DATE_TRUNC('day', t.created_at)
  -- Minimum aggregation threshold for anonymization (k-anonymity)
  HAVING COUNT(t.id) >= 5
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_user_consents_updated_at
  BEFORE UPDATE ON public.user_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_data_requests_updated_at
  BEFORE UPDATE ON public.data_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();