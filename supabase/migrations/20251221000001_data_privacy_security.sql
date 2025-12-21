-- =====================================================
-- DATA PRIVACY & SECURITY SYSTEM
-- Comprehensive data protection and GDPR compliance
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. ENCRYPTED USER DATA TABLE
-- Stores sensitive personal information with encryption
-- =====================================================

CREATE TABLE IF NOT EXISTS encrypted_user_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Encrypted fields (using pgcrypto)
  phone_number_encrypted BYTEA,
  address_encrypted BYTEA,
  id_document_encrypted BYTEA,
  payment_info_encrypted BYTEA,

  -- Metadata (non-sensitive)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  encryption_key_version INTEGER DEFAULT 1,

  UNIQUE(user_id)
);

-- Index for fast user lookups
CREATE INDEX idx_encrypted_user_data_user_id ON encrypted_user_data(user_id);

-- =====================================================
-- 2. DATA ACCESS LOG
-- Immutable audit trail of all data access
-- =====================================================

CREATE TABLE IF NOT EXISTS data_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accessed_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Access details
  access_type TEXT NOT NULL, -- READ, WRITE, DELETE, EXPORT
  resource_type TEXT NOT NULL, -- USER_PROFILE, TICKET, PAYMENT, etc.
  resource_id UUID,

  -- Context
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,

  -- Security
  is_suspicious BOOLEAN DEFAULT FALSE,
  risk_score INTEGER DEFAULT 0,

  -- Timestamp
  accessed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Additional data
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for audit queries
CREATE INDEX idx_data_access_log_user_id ON data_access_log(user_id);
CREATE INDEX idx_data_access_log_accessed_user_id ON data_access_log(accessed_user_id);
CREATE INDEX idx_data_access_log_accessed_at ON data_access_log(accessed_at DESC);
CREATE INDEX idx_data_access_log_suspicious ON data_access_log(is_suspicious) WHERE is_suspicious = TRUE;

-- =====================================================
-- 3. SECURITY INCIDENTS TABLE
-- Track security events and potential breaches
-- =====================================================

CREATE TABLE IF NOT EXISTS security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Incident details
  incident_type TEXT NOT NULL, -- BRUTE_FORCE, SQL_INJECTION, XSS, UNAUTHORIZED_ACCESS
  severity TEXT NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, INVESTIGATING, RESOLVED, FALSE_POSITIVE

  -- Target
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address INET,

  -- Details
  description TEXT,
  attack_vector TEXT,
  affected_resources JSONB DEFAULT '[]'::jsonb,

  -- Response
  automated_response TEXT,
  manual_response TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),

  -- Timestamps
  detected_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_security_incidents_severity ON security_incidents(severity);
CREATE INDEX idx_security_incidents_status ON security_incidents(status);
CREATE INDEX idx_security_incidents_detected_at ON security_incidents(detected_at DESC);

-- =====================================================
-- 4. IP BLOCKLIST
-- Block malicious IPs automatically
-- =====================================================

CREATE TABLE IF NOT EXISTS ip_blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL UNIQUE,

  -- Block details
  reason TEXT NOT NULL,
  block_type TEXT NOT NULL, -- PERMANENT, TEMPORARY, AUTO
  blocked_until TIMESTAMPTZ,

  -- Metadata
  blocked_by UUID REFERENCES auth.users(id),
  blocked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  incident_id UUID REFERENCES security_incidents(id),

  -- Stats
  violation_count INTEGER DEFAULT 1,
  last_violation_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ip_blocklist_ip ON ip_blocklist(ip_address);
CREATE INDEX idx_ip_blocklist_active ON ip_blocklist(blocked_until) WHERE blocked_until > NOW();

-- =====================================================
-- 5. SESSION MANAGEMENT
-- Track active sessions for security
-- =====================================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Session details
  session_token TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT,

  -- Device info
  device_id TEXT,
  device_type TEXT, -- MOBILE, DESKTOP, TABLET
  device_fingerprint TEXT,
  user_agent TEXT,

  -- Location
  ip_address INET,
  country_code TEXT,
  city TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_trusted BOOLEAN DEFAULT FALSE,

  -- Security
  login_method TEXT, -- PASSWORD, GOOGLE, MAGIC_LINK
  mfa_verified BOOLEAN DEFAULT FALSE,
  risk_score INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- =====================================================
-- 6. DATA RETENTION POLICIES
-- GDPR compliance for data deletion
-- =====================================================

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Policy details
  resource_type TEXT NOT NULL UNIQUE, -- TICKETS, PAYMENTS, LOGS, etc.
  retention_days INTEGER NOT NULL,
  auto_delete BOOLEAN DEFAULT TRUE,

  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default policies
INSERT INTO data_retention_policies (resource_type, retention_days, auto_delete, description) VALUES
  ('SCAN_LOGS', 365, TRUE, 'Ticket scan logs retained for 1 year'),
  ('DATA_ACCESS_LOG', 730, TRUE, 'Data access logs retained for 2 years'),
  ('SECURITY_INCIDENTS', 1825, FALSE, 'Security incidents retained for 5 years'),
  ('USER_SESSIONS', 90, TRUE, 'Inactive sessions deleted after 90 days'),
  ('RATE_LIMIT_TRACKING', 30, TRUE, 'Rate limit data retained for 30 days')
ON CONFLICT (resource_type) DO NOTHING;

-- =====================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- Enforce data access at database level
-- =====================================================

-- Enable RLS on all sensitive tables
ALTER TABLE encrypted_user_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for encrypted_user_data
-- Users can only read their own data
CREATE POLICY "Users can read own encrypted data"
  ON encrypted_user_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own data
CREATE POLICY "Users can update own encrypted data"
  ON encrypted_user_data
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can insert their own data
CREATE POLICY "Users can insert own encrypted data"
  ON encrypted_user_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for data_access_log
-- Users can read their own access logs
CREATE POLICY "Users can read own access logs"
  ON data_access_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert logs
CREATE POLICY "Service can insert access logs"
  ON data_access_log
  FOR INSERT
  WITH CHECK (true);

-- No updates or deletes (immutable audit trail)

-- RLS Policies for user_sessions
-- Users can read their own sessions
CREATE POLICY "Users can read own sessions"
  ON user_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own sessions (logout)
CREATE POLICY "Users can update own sessions"
  ON user_sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can insert sessions
CREATE POLICY "Service can insert sessions"
  ON user_sessions
  FOR INSERT
  WITH CHECK (true);

-- RLS Policies for security_incidents
-- Only admins can read security incidents
CREATE POLICY "Admins can read security incidents"
  ON security_incidents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'ADMIN'
    )
  );

-- =====================================================
-- 8. ENCRYPTION HELPER FUNCTIONS
-- Functions to encrypt/decrypt sensitive data
-- =====================================================

-- Function to encrypt data
CREATE OR REPLACE FUNCTION encrypt_data(data TEXT, encryption_key TEXT)
RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(data, encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt data
CREATE OR REPLACE FUNCTION decrypt_data(encrypted_data BYTEA, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(encrypted_data, encryption_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 9. AUTOMATIC DATA ACCESS LOGGING
-- Trigger to log all sensitive data access
-- =====================================================

CREATE OR REPLACE FUNCTION log_data_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Log the access
  INSERT INTO data_access_log (
    user_id,
    accessed_user_id,
    access_type,
    resource_type,
    resource_id,
    ip_address,
    metadata
  ) VALUES (
    auth.uid(),
    COALESCE(NEW.user_id, OLD.user_id),
    TG_OP, -- INSERT, UPDATE, DELETE, SELECT
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    inet_client_addr(),
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to encrypted_user_data
CREATE TRIGGER log_encrypted_data_access
  AFTER SELECT OR INSERT OR UPDATE OR DELETE ON encrypted_user_data
  FOR EACH ROW EXECUTE FUNCTION log_data_access();

-- =====================================================
-- 10. SESSION CLEANUP FUNCTION
-- Automatically expire old sessions
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  -- Deactivate expired sessions
  UPDATE user_sessions
  SET is_active = FALSE
  WHERE expires_at < NOW() AND is_active = TRUE;

  -- Delete sessions older than retention policy
  DELETE FROM user_sessions
  WHERE created_at < NOW() - INTERVAL '90 days'
  AND is_active = FALSE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 11. SUSPICIOUS ACTIVITY DETECTOR
-- Automatically detect and block suspicious behavior
-- =====================================================

CREATE OR REPLACE FUNCTION detect_suspicious_activity()
RETURNS TRIGGER AS $$
DECLARE
  recent_failed_logins INTEGER;
  recent_access_count INTEGER;
  current_ip INET;
  is_blocked BOOLEAN;
BEGIN
  current_ip := inet_client_addr();

  -- Check if IP is blocked
  SELECT EXISTS (
    SELECT 1 FROM ip_blocklist
    WHERE ip_address = current_ip
    AND (blocked_until IS NULL OR blocked_until > NOW())
  ) INTO is_blocked;

  IF is_blocked THEN
    RAISE EXCEPTION 'Access denied: IP address is blocked';
  END IF;

  -- Check for brute force attempts (if this is a login table)
  IF TG_TABLE_NAME = 'user_sessions' AND TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO recent_failed_logins
    FROM data_access_log
    WHERE ip_address = current_ip
    AND access_type = 'FAILED_LOGIN'
    AND accessed_at > NOW() - INTERVAL '15 minutes';

    IF recent_failed_logins >= 5 THEN
      -- Create security incident
      INSERT INTO security_incidents (
        incident_type,
        severity,
        ip_address,
        description,
        automated_response
      ) VALUES (
        'BRUTE_FORCE',
        'HIGH',
        current_ip,
        'Multiple failed login attempts detected',
        'IP temporarily blocked'
      );

      -- Block IP for 1 hour
      INSERT INTO ip_blocklist (ip_address, reason, block_type, blocked_until)
      VALUES (current_ip, 'Brute force attack', 'AUTO', NOW() + INTERVAL '1 hour')
      ON CONFLICT (ip_address) DO UPDATE
      SET blocked_until = NOW() + INTERVAL '1 hour',
          violation_count = ip_blocklist.violation_count + 1;

      RAISE EXCEPTION 'Too many failed login attempts. IP blocked for 1 hour.';
    END IF;
  END IF;

  -- Check for excessive data access
  SELECT COUNT(*) INTO recent_access_count
  FROM data_access_log
  WHERE user_id = NEW.user_id
  AND accessed_at > NOW() - INTERVAL '5 minutes';

  IF recent_access_count > 100 THEN
    NEW.risk_score := 80;

    INSERT INTO security_incidents (
      incident_type,
      severity,
      user_id,
      ip_address,
      description
    ) VALUES (
      'EXCESSIVE_ACCESS',
      'MEDIUM',
      NEW.user_id,
      current_ip,
      'Unusually high data access rate detected'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 12. PASSWORD STRENGTH CHECKER
-- Ensure strong passwords
-- =====================================================

CREATE OR REPLACE FUNCTION check_password_strength(password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Minimum 8 characters
  IF LENGTH(password) < 8 THEN
    RETURN FALSE;
  END IF;

  -- Must contain uppercase
  IF password !~ '[A-Z]' THEN
    RETURN FALSE;
  END IF;

  -- Must contain lowercase
  IF password !~ '[a-z]' THEN
    RETURN FALSE;
  END IF;

  -- Must contain number
  IF password !~ '[0-9]' THEN
    RETURN FALSE;
  END IF;

  -- Must contain special character
  IF password !~ '[^a-zA-Z0-9]' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 13. DATA ANONYMIZATION FOR GDPR
-- Anonymize user data on request
-- =====================================================

CREATE OR REPLACE FUNCTION anonymize_user_data(target_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Anonymize user profile
  UPDATE auth.users
  SET
    email = CONCAT('deleted_', target_user_id::TEXT, '@deleted.local'),
    raw_user_meta_data = '{}'::jsonb
  WHERE id = target_user_id;

  -- Delete encrypted data
  DELETE FROM encrypted_user_data WHERE user_id = target_user_id;

  -- Anonymize tickets (keep for audit but remove ownership)
  UPDATE secure_tickets
  SET
    current_owner_id = '00000000-0000-0000-0000-000000000000'::uuid,
    original_owner_id = '00000000-0000-0000-0000-000000000000'::uuid,
    ownership_history = '[]'::jsonb,
    metadata = '{}'::jsonb
  WHERE current_owner_id = target_user_id OR original_owner_id = target_user_id;

  -- Invalidate all sessions
  UPDATE user_sessions
  SET is_active = FALSE
  WHERE user_id = target_user_id;

  -- Log the anonymization
  INSERT INTO data_access_log (
    user_id,
    accessed_user_id,
    access_type,
    resource_type,
    metadata
  ) VALUES (
    target_user_id,
    target_user_id,
    'ANONYMIZE',
    'USER_PROFILE',
    jsonb_build_object('reason', 'GDPR_REQUEST')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 14. AUTOMATED CLEANUP JOB
-- Clean old data based on retention policies
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
DECLARE
  policy RECORD;
BEGIN
  FOR policy IN SELECT * FROM data_retention_policies WHERE auto_delete = TRUE
  LOOP
    -- Clean scan_logs
    IF policy.resource_type = 'SCAN_LOGS' THEN
      DELETE FROM scan_logs
      WHERE validation_timestamp < NOW() - (policy.retention_days || ' days')::INTERVAL;
    END IF;

    -- Clean data_access_log
    IF policy.resource_type = 'DATA_ACCESS_LOG' THEN
      DELETE FROM data_access_log
      WHERE accessed_at < NOW() - (policy.retention_days || ' days')::INTERVAL;
    END IF;

    -- Clean rate_limit_tracking
    IF policy.resource_type = 'RATE_LIMIT_TRACKING' THEN
      DELETE FROM rate_limit_tracking
      WHERE window_start < NOW() - (policy.retention_days || ' days')::INTERVAL;
    END IF;
  END LOOP;

  -- Clean expired sessions
  PERFORM cleanup_expired_sessions();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 15. GRANTS AND PERMISSIONS
-- =====================================================

-- Revoke all default permissions
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Grant specific permissions to authenticated users
GRANT SELECT ON data_retention_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON encrypted_user_data TO authenticated;
GRANT SELECT ON data_access_log TO authenticated;
GRANT SELECT ON user_sessions TO authenticated;

-- Service role has full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE encrypted_user_data IS 'Stores encrypted sensitive user data with PGP encryption';
COMMENT ON TABLE data_access_log IS 'Immutable audit trail of all data access for GDPR compliance';
COMMENT ON TABLE security_incidents IS 'Tracks security events and potential breaches';
COMMENT ON TABLE ip_blocklist IS 'Automatically blocks malicious IP addresses';
COMMENT ON TABLE user_sessions IS 'Tracks active user sessions for security monitoring';
COMMENT ON TABLE data_retention_policies IS 'Defines data retention rules for GDPR compliance';

COMMENT ON FUNCTION encrypt_data IS 'Encrypts sensitive data using PGP symmetric encryption';
COMMENT ON FUNCTION decrypt_data IS 'Decrypts sensitive data encrypted with PGP';
COMMENT ON FUNCTION anonymize_user_data IS 'Anonymizes all user data for GDPR right to be forgotten';
COMMENT ON FUNCTION cleanup_old_data IS 'Automatically deletes old data based on retention policies';
COMMENT ON FUNCTION detect_suspicious_activity IS 'Detects and blocks suspicious activity patterns';
