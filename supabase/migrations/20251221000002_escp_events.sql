-- =====================================================
-- ESCP EVENTS FROM ICAL
-- Store events synced from ESCP Campus Life iCal feed
-- =====================================================

-- Create escp_events table
CREATE TABLE IF NOT EXISTS escp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ical_uid TEXT UNIQUE NOT NULL, -- UID from iCal file

  -- Event details
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  organizer TEXT,
  category TEXT, -- Parties, Galas, Conferences, Sports, Sustainability, Other
  url TEXT,

  -- Dates
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Sync tracking
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_escp_events_start_date ON escp_events(start_date);
CREATE INDEX idx_escp_events_category ON escp_events(category);
CREATE INDEX idx_escp_events_active ON escp_events(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_escp_events_ical_uid ON escp_events(ical_uid);

-- Create view for events with ticket listings
CREATE OR REPLACE VIEW events_with_tickets AS
SELECT
  e.id,
  e.ical_uid,
  e.title,
  e.description,
  e.location,
  e.organizer,
  e.category,
  e.url,
  e.start_date,
  e.end_date,
  e.is_active,
  COUNT(DISTINCT sl.id) FILTER (WHERE sl.status = 'AVAILABLE') as available_tickets,
  COUNT(DISTINCT sl.id) as total_listings,
  MIN(sl.price) as min_price,
  MAX(sl.price) as max_price
FROM escp_events e
LEFT JOIN ticket_listings sl ON sl.event_id = e.id
WHERE e.is_active = TRUE
  AND e.start_date > NOW()
GROUP BY e.id
ORDER BY e.start_date ASC;

-- Create ticket_listings table if not exists
CREATE TABLE IF NOT EXISTS ticket_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES escp_events(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Ticket details
  ticket_type TEXT DEFAULT 'GENERAL', -- GENERAL, VIP, etc.
  quantity INTEGER DEFAULT 1,
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2),

  -- Listing details
  status TEXT DEFAULT 'AVAILABLE', -- AVAILABLE, SOLD, RESERVED, CANCELLED
  description TEXT,

  -- Verification
  is_verified BOOLEAN DEFAULT FALSE,
  verification_method TEXT, -- QR_CODE, MANUAL, etc.

  -- Files
  ticket_images JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sold_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT positive_price CHECK (price > 0),
  CONSTRAINT positive_quantity CHECK (quantity > 0)
);

-- Indexes for ticket_listings
CREATE INDEX idx_ticket_listings_event ON ticket_listings(event_id);
CREATE INDEX idx_ticket_listings_seller ON ticket_listings(seller_id);
CREATE INDEX idx_ticket_listings_status ON ticket_listings(status);
CREATE INDEX idx_ticket_listings_created ON ticket_listings(created_at DESC);

-- Enable RLS
ALTER TABLE escp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_listings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for escp_events
-- Everyone can read active events
CREATE POLICY "Anyone can read active events"
  ON escp_events
  FOR SELECT
  USING (is_active = TRUE);

-- Only service role can insert/update events
CREATE POLICY "Service can manage events"
  ON escp_events
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for ticket_listings
-- Users can read all available listings
CREATE POLICY "Users can read available listings"
  ON ticket_listings
  FOR SELECT
  USING (status = 'AVAILABLE' OR seller_id = auth.uid());

-- Users can insert their own listings
CREATE POLICY "Users can create own listings"
  ON ticket_listings
  FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

-- Users can update their own listings
CREATE POLICY "Users can update own listings"
  ON ticket_listings
  FOR UPDATE
  USING (auth.uid() = seller_id);

-- Users can delete their own listings
CREATE POLICY "Users can delete own listings"
  ON ticket_listings
  FOR DELETE
  USING (auth.uid() = seller_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_escp_events_updated_at
  BEFORE UPDATE ON escp_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_listings_updated_at
  BEFORE UPDATE ON ticket_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get events with available tickets only
CREATE OR REPLACE FUNCTION get_events_with_tickets()
RETURNS TABLE (
  id UUID,
  ical_uid TEXT,
  title TEXT,
  description TEXT,
  location TEXT,
  organizer TEXT,
  category TEXT,
  url TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  available_tickets BIGINT,
  min_price DECIMAL,
  max_price DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.ical_uid,
    e.title,
    e.description,
    e.location,
    e.organizer,
    e.category,
    e.url,
    e.start_date,
    e.end_date,
    COUNT(DISTINCT tl.id) FILTER (WHERE tl.status = 'AVAILABLE') as available_tickets,
    MIN(tl.price) as min_price,
    MAX(tl.price) as max_price
  FROM escp_events e
  INNER JOIN ticket_listings tl ON tl.event_id = e.id
  WHERE e.is_active = TRUE
    AND e.start_date > NOW()
    AND tl.status = 'AVAILABLE'
  GROUP BY e.id
  HAVING COUNT(DISTINCT tl.id) FILTER (WHERE tl.status = 'AVAILABLE') > 0
  ORDER BY e.start_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE escp_events IS 'Events synced from ESCP Campus Life iCal feed';
COMMENT ON TABLE ticket_listings IS 'Ticket listings for resale on the marketplace';
COMMENT ON VIEW events_with_tickets IS 'View of events with ticket statistics';
COMMENT ON FUNCTION get_events_with_tickets IS 'Returns only events that have available tickets for sale';
