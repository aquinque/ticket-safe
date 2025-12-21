-- =====================================================
-- SECURE TICKET VALIDATION SYSTEM
-- Migration for robust anti-fraud ticket system
-- =====================================================

-- Table: signing_keys (for JWT key rotation)
CREATE TABLE IF NOT EXISTS signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid TEXT UNIQUE NOT NULL, -- Key ID
  algorithm TEXT NOT NULL DEFAULT 'HS256',
  public_key TEXT, -- For asymmetric algos (RSA/ECDSA)
  private_key_hash TEXT NOT NULL, -- Never store private key in DB, only hash
  event_id UUID REFERENCES events(id), -- Optional: key per event
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT valid_algorithm CHECK (algorithm IN ('HS256', 'HS512', 'RS256', 'ES256'))
);

CREATE INDEX idx_signing_keys_kid ON signing_keys(kid) WHERE is_active = true;
CREATE INDEX idx_signing_keys_event ON signing_keys(event_id) WHERE is_active = true;

-- Table: secure_tickets (enhanced tickets table)
CREATE TABLE IF NOT EXISTS secure_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL, -- Human-readable ticket number
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  -- Ownership tracking
  current_owner_id UUID NOT NULL REFERENCES auth.users(id),
  original_owner_id UUID NOT NULL REFERENCES auth.users(id),
  ownership_history JSONB DEFAULT '[]'::jsonb, -- Array of {user_id, transferred_at}
  transfer_count INTEGER DEFAULT 0,

  -- Ticket details
  seat_section TEXT,
  seat_row TEXT,
  seat_number TEXT,
  ticket_type TEXT, -- 'VIP', 'GENERAL', 'STUDENT', etc.
  original_price DECIMAL(10,2) NOT NULL,

  -- Security & status
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  version INTEGER DEFAULT 1, -- Incremented on each update
  nonce TEXT NOT NULL DEFAULT gen_random_uuid()::text, -- Unique per version
  checksum TEXT, -- SHA256 of critical fields

  -- QR/Token data
  ticket_token TEXT, -- The signed JWT token
  qr_code_url TEXT, -- URL to QR code image
  signing_key_id UUID REFERENCES signing_keys(id),

  -- Validity period
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  valid_from TIMESTAMPTZ DEFAULT NOW(),

  -- Scan tracking
  first_scanned_at TIMESTAMPTZ,
  last_scanned_at TIMESTAMPTZ,
  scan_count INTEGER DEFAULT 0,

  -- Flags
  is_revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  revoke_reason TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN ('ACTIVE', 'USED', 'TRANSFERRED', 'REVOKED', 'EXPIRED', 'SUSPENDED')),
  CONSTRAINT valid_dates CHECK (expires_at > issued_at),
  CONSTRAINT valid_transfer_count CHECK (transfer_count >= 0)
);

CREATE INDEX idx_secure_tickets_event ON secure_tickets(event_id);
CREATE INDEX idx_secure_tickets_owner ON secure_tickets(current_owner_id);
CREATE INDEX idx_secure_tickets_status ON secure_tickets(status) WHERE status = 'ACTIVE';
CREATE INDEX idx_secure_tickets_token ON secure_tickets(ticket_token) WHERE ticket_token IS NOT NULL;
CREATE INDEX idx_secure_tickets_number ON secure_tickets(ticket_number);

-- Table: scan_logs (immutable audit trail)
CREATE TABLE IF NOT EXISTS scan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES secure_tickets(id),
  event_id UUID NOT NULL REFERENCES events(id),

  -- Scanner info
  scanned_by_user_id UUID REFERENCES auth.users(id),
  scanner_device_id TEXT,
  scanner_ip_address INET,
  scanner_user_agent TEXT,

  -- Location (if available)
  scan_latitude DECIMAL(10, 8),
  scan_longitude DECIMAL(11, 8),
  scan_location_name TEXT,

  -- Scan result
  scan_result TEXT NOT NULL, -- 'VALID', 'INVALID', 'ALREADY_USED', 'EXPIRED', etc.
  validation_timestamp TIMESTAMPTZ DEFAULT NOW(),
  response_time_ms INTEGER,

  -- Risk assessment
  risk_score INTEGER DEFAULT 0, -- 0-100
  risk_level TEXT DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  fraud_signals JSONB DEFAULT '[]'::jsonb, -- Array of detected fraud signals

  -- Token validation details
  token_valid BOOLEAN,
  token_expired BOOLEAN,
  signature_valid BOOLEAN,

  -- Additional context
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_risk_score CHECK (risk_score >= 0 AND risk_score <= 100),
  CONSTRAINT valid_risk_level CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT valid_scan_result CHECK (scan_result IN ('VALID', 'INVALID', 'ALREADY_USED', 'WRONG_EVENT', 'EXPIRED', 'REVOKED', 'SUSPECT_FRAUD', 'RATE_LIMITED'))
);

CREATE INDEX idx_scan_logs_ticket ON scan_logs(ticket_id);
CREATE INDEX idx_scan_logs_event ON scan_logs(event_id);
CREATE INDEX idx_scan_logs_timestamp ON scan_logs(validation_timestamp DESC);
CREATE INDEX idx_scan_logs_device ON scan_logs(scanner_device_id);
CREATE INDEX idx_scan_logs_ip ON scan_logs(scanner_ip_address);
CREATE INDEX idx_scan_logs_result ON scan_logs(scan_result);
CREATE INDEX idx_scan_logs_risk ON scan_logs(risk_level) WHERE risk_level IN ('HIGH', 'CRITICAL');

-- Table: fraud_signals (detected fraud patterns)
CREATE TABLE IF NOT EXISTS fraud_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Related entities
  ticket_id UUID REFERENCES secure_tickets(id),
  event_id UUID REFERENCES events(id),
  user_id UUID REFERENCES auth.users(id),
  scan_log_id UUID REFERENCES scan_logs(id),

  -- Signal details
  signal_type TEXT NOT NULL, -- 'CONCURRENT_SCAN', 'RAPID_RESCAN', 'IMPOSSIBLE_TRAVEL', etc.
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  description TEXT,

  -- Context
  device_id TEXT,
  ip_address INET,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Status
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT valid_signal_type CHECK (signal_type IN (
    'CONCURRENT_SCAN', 'RAPID_RESCAN', 'IMPOSSIBLE_TRAVEL', 'INVALID_SIGNATURE',
    'TOKEN_REUSE', 'EXCESSIVE_TRANSFERS', 'RATE_LIMIT_EXCEEDED', 'UNAUTHORIZED_SCANNER',
    'WRONG_EVENT', 'DUPLICATE_QR', 'SUSPICIOUS_DEVICE', 'GEO_ANOMALY'
  ))
);

CREATE INDEX idx_fraud_signals_ticket ON fraud_signals(ticket_id);
CREATE INDEX idx_fraud_signals_type ON fraud_signals(signal_type);
CREATE INDEX idx_fraud_signals_severity ON fraud_signals(severity) WHERE severity IN ('HIGH', 'CRITICAL');
CREATE INDEX idx_fraud_signals_unresolved ON fraud_signals(is_resolved) WHERE is_resolved = false;
CREATE INDEX idx_fraud_signals_device ON fraud_signals(device_id);
CREATE INDEX idx_fraud_signals_created ON fraud_signals(created_at DESC);

-- Table: rate_limit_tracking
CREATE TABLE IF NOT EXISTS rate_limit_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifier (can be IP, device_id, user_id, or combo)
  identifier_type TEXT NOT NULL, -- 'IP', 'DEVICE', 'USER', 'IP_DEVICE'
  identifier_value TEXT NOT NULL,

  -- Limits
  action_type TEXT NOT NULL, -- 'SCAN', 'VALIDATE', 'GENERATE'
  attempt_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  window_end TIMESTAMPTZ,

  -- Blocking
  is_blocked BOOLEAN DEFAULT false,
  blocked_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_identifier_type CHECK (identifier_type IN ('IP', 'DEVICE', 'USER', 'IP_DEVICE', 'USER_DEVICE')),
  CONSTRAINT valid_action_type CHECK (action_type IN ('SCAN', 'VALIDATE', 'GENERATE', 'TRANSFER'))
);

CREATE UNIQUE INDEX idx_rate_limit_unique ON rate_limit_tracking(identifier_type, identifier_value, action_type);
CREATE INDEX idx_rate_limit_blocked ON rate_limit_tracking(is_blocked, blocked_until) WHERE is_blocked = true;

-- Function: Update ticket checksum
CREATE OR REPLACE FUNCTION update_ticket_checksum()
RETURNS TRIGGER AS $$
BEGIN
  NEW.checksum := encode(
    digest(
      NEW.id::text ||
      NEW.event_id::text ||
      NEW.current_owner_id::text ||
      NEW.version::text ||
      NEW.nonce,
      'sha256'
    ),
    'hex'
  );
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ticket_checksum
  BEFORE INSERT OR UPDATE ON secure_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_checksum();

-- Function: Log ticket transfer
CREATE OR REPLACE FUNCTION log_ticket_transfer()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.current_owner_id IS DISTINCT FROM NEW.current_owner_id THEN
    NEW.ownership_history := COALESCE(NEW.ownership_history, '[]'::jsonb) ||
      jsonb_build_object(
        'from_user_id', OLD.current_owner_id,
        'to_user_id', NEW.current_owner_id,
        'transferred_at', NOW(),
        'transfer_number', NEW.transfer_count + 1
      );
    NEW.transfer_count := NEW.transfer_count + 1;
    NEW.version := NEW.version + 1;
    NEW.nonce := gen_random_uuid()::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_ticket_transfer
  BEFORE UPDATE ON secure_tickets
  FOR EACH ROW
  WHEN (OLD.current_owner_id IS DISTINCT FROM NEW.current_owner_id)
  EXECUTE FUNCTION log_ticket_transfer();

-- RLS Policies
ALTER TABLE signing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_tracking ENABLE ROW LEVEL SECURITY;

-- signing_keys: Only admins/organizers can view
CREATE POLICY "signing_keys_select" ON signing_keys
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role IN ('ADMIN', 'ORGANIZER')
    )
  );

-- secure_tickets: Users can see their own tickets
CREATE POLICY "secure_tickets_select_own" ON secure_tickets
  FOR SELECT USING (current_owner_id = auth.uid());

-- secure_tickets: Organizers can see tickets for their events
CREATE POLICY "secure_tickets_select_organizer" ON secure_tickets
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM events WHERE organizer_id = auth.uid()
    )
  );

-- scan_logs: Only organizers and admins can view
CREATE POLICY "scan_logs_select" ON scan_logs
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM events WHERE organizer_id = auth.uid()
    )
    OR auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role IN ('ADMIN', 'ORGANIZER')
    )
  );

-- scan_logs: Service role can insert (from Edge Functions)
CREATE POLICY "scan_logs_insert_service" ON scan_logs
  FOR INSERT WITH CHECK (true);

-- fraud_signals: Only admins and organizers can view
CREATE POLICY "fraud_signals_select" ON fraud_signals
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role IN ('ADMIN', 'ORGANIZER')
    )
  );

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON signing_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE ON secure_tickets TO authenticated;
GRANT SELECT, INSERT ON scan_logs TO authenticated, service_role;
GRANT SELECT ON fraud_signals TO authenticated;
GRANT ALL ON rate_limit_tracking TO service_role;

-- Comments
COMMENT ON TABLE signing_keys IS 'Cryptographic keys for signing ticket tokens (JWT). Supports key rotation.';
COMMENT ON TABLE secure_tickets IS 'Tamper-proof tickets with QR codes signed using JWS/JWT.';
COMMENT ON TABLE scan_logs IS 'Immutable audit trail of all ticket scans and validation attempts.';
COMMENT ON TABLE fraud_signals IS 'Detected fraud patterns and anomalies for investigation.';
COMMENT ON TABLE rate_limit_tracking IS 'Rate limiting to prevent abuse and brute-force attacks.';
