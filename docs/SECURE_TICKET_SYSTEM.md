# Secure Ticket Validation & Fraud Detection System

## Overview

This system provides enterprise-grade security for ticket validation with cryptographic signing, multi-layered fraud detection, and comprehensive audit logging.

## Architecture

```
┌─────────────────┐
│  Ticket Owner   │
└────────┬────────┘
         │ 1. Request ticket
         ▼
┌─────────────────────────────────┐
│ generate-secure-ticket Function │
│  - Creates JWT token            │
│  - Signs with HS256             │
│  - Stores in secure_tickets     │
└────────┬────────────────────────┘
         │ 2. Returns signed token
         ▼
┌─────────────────┐
│   QR Code       │ (Contains JWT token)
└────────┬────────┘
         │ 3. Scanned at venue
         ▼
┌─────────────────────────────────┐
│ OrganizerScan UI Component      │
└────────┬────────────────────────┘
         │ 4. Sends to validation
         ▼
┌─────────────────────────────────┐
│ validate-scan Function          │
│  - Verifies JWT signature       │
│  - Checks replay attacks        │
│  - Detects fraud patterns       │
│  - Updates ticket status        │
│  - Logs audit trail             │
└────────┬────────────────────────┘
         │ 5. Returns validation result
         ▼
┌─────────────────┐
│ Visual/Audio    │
│   Feedback      │
└─────────────────┘
```

## Database Schema

### `signing_keys`
Manages cryptographic keys for JWT signing with rotation support.

```sql
CREATE TABLE signing_keys (
  id UUID PRIMARY KEY,
  kid TEXT UNIQUE,           -- Key ID for token header
  key_hash TEXT,             -- SHA-256 hash of the key
  algorithm TEXT,            -- HS256, RS256, etc.
  is_active BOOLEAN,         -- Current active key
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  event_id UUID              -- Optional: event-specific keys
);
```

### `secure_tickets`
Enhanced ticket table with cryptographic features and ownership tracking.

```sql
CREATE TABLE secure_tickets (
  id UUID PRIMARY KEY,
  ticket_number TEXT UNIQUE,
  event_id UUID,
  current_owner_id UUID,
  original_owner_id UUID,
  ownership_history JSONB,   -- Array of {owner_id, timestamp}
  status TEXT,               -- ACTIVE, USED, REVOKED, TRANSFERRED
  version INTEGER,           -- For optimistic locking
  nonce TEXT,                -- Unique per ticket, prevents replay
  ticket_token TEXT,         -- The signed JWT
  signing_key_id UUID,
  scan_count INTEGER,
  is_revoked BOOLEAN,
  first_scanned_at TIMESTAMPTZ,
  last_scanned_at TIMESTAMPTZ,
  metadata JSONB,
  checksum TEXT              -- Integrity verification
);
```

### `scan_logs`
Immutable audit trail of all scan attempts.

```sql
CREATE TABLE scan_logs (
  id UUID PRIMARY KEY,
  ticket_id UUID,
  event_id UUID,
  scanner_user_id UUID,
  validation_timestamp TIMESTAMPTZ,
  scan_result TEXT,          -- VALID, INVALID, FRAUD_DETECTED, etc.
  risk_score INTEGER,        -- 0-100
  risk_level TEXT,           -- LOW, MEDIUM, HIGH, CRITICAL
  fraud_signals JSONB,       -- Array of detected fraud patterns
  scanner_device_id TEXT,
  scanner_ip_address TEXT,
  scanner_location JSONB,    -- {lat, lon, accuracy}
  token_payload JSONB,       -- Decoded JWT for forensics
  validation_details JSONB   -- Additional context
);
```

### `fraud_signals`
Tracks detected fraud patterns for analysis.

```sql
CREATE TABLE fraud_signals (
  id UUID PRIMARY KEY,
  ticket_id UUID,
  scan_log_id UUID,
  signal_type TEXT,          -- TOKEN_REUSE, CONCURRENT_SCAN, etc.
  severity TEXT,             -- LOW, MEDIUM, HIGH, CRITICAL
  details JSONB,
  detected_at TIMESTAMPTZ,
  resolved BOOLEAN,
  resolution_notes TEXT
);
```

### `rate_limit_tracking`
Prevents abuse through rate limiting.

```sql
CREATE TABLE rate_limit_tracking (
  id UUID PRIMARY KEY,
  identifier TEXT,           -- IP, device_id, or user_id
  identifier_type TEXT,      -- ip, device, user
  window_start TIMESTAMPTZ,
  attempt_count INTEGER,
  last_attempt_at TIMESTAMPTZ,
  is_blocked BOOLEAN
);
```

## Edge Functions

### 1. `generate-secure-ticket`

Creates a cryptographically signed ticket with JWT token.

**Endpoint**: `POST /functions/v1/generate-secure-ticket`

**Request Body**:
```json
{
  "user_id": "uuid",
  "event_id": "uuid",
  "ticket_metadata": {
    "seat": "A12",
    "section": "VIP"
  }
}
```

**Response**:
```json
{
  "ticket_id": "uuid",
  "ticket_number": "TKT-20251221-ABC123",
  "ticket_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0xIn0...",
  "expires_at": "2025-12-31T23:59:59Z",
  "qr_data": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0xIn0..."
}
```

**JWT Payload Structure**:
```json
{
  "sub": "user_id",
  "ticket_id": "uuid",
  "event_id": "uuid",
  "ticket_number": "TKT-20251221-ABC123",
  "version": 1,
  "nonce": "unique_nonce",
  "iat": 1703174400,
  "exp": 1704067199,
  "iss": "ticket-safe",
  "aud": "ticket-safe-scanner"
}
```

### 2. `validate-scan`

Validates a scanned ticket with comprehensive fraud detection.

**Endpoint**: `POST /functions/v1/validate-scan`

**Request Body**:
```json
{
  "ticket_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0xIn0...",
  "event_id": "uuid",
  "scanner_user_id": "uuid",
  "scanner_device_id": "device123",
  "scanner_ip": "192.168.1.1",
  "scanner_location": {
    "lat": 48.8566,
    "lon": 2.3522,
    "accuracy": 10
  }
}
```

**Response**:
```json
{
  "valid": true,
  "result": "VALID",
  "message": "Ticket validated successfully",
  "risk_score": 0,
  "risk_level": "LOW",
  "fraud_signals": [],
  "ticket_details": {
    "ticket_number": "TKT-20251221-ABC123",
    "event_id": "uuid",
    "owner_name": "John Doe",
    "scan_count": 1
  },
  "scan_log_id": "uuid"
}
```

**Validation Steps**:

1. **Rate Limiting**: Check if scanner is rate-limited (max 10 scans per 5 minutes)
2. **JWT Verification**: Verify signature, issuer, audience, expiration
3. **Event Matching**: Ensure ticket is for the correct event
4. **Token Replay Detection**: Verify version and nonce match current ticket state
5. **Status Check**: Ensure ticket is ACTIVE (not USED, REVOKED, or TRANSFERRED)
6. **Concurrent Scan Detection**: Check for recent scans within 2 minutes
7. **Impossible Travel Detection**: Check if physical travel between scans is feasible
8. **Risk Scoring**: Calculate aggregate risk score (0-100)
9. **Optimistic Locking**: Update ticket status using version matching
10. **Audit Logging**: Record scan attempt with all context

## Fraud Detection Rules

### 1. Token Reuse (Replay Attack)
**Signal**: `TOKEN_REUSE`
**Detection**: Version or nonce mismatch between JWT and database
**Risk**: +70 points

### 2. Concurrent Scans
**Signal**: `CONCURRENT_SCAN`
**Detection**: Multiple scans within 2 minutes
**Risk**: +60 points

### 3. Impossible Travel
**Signal**: `IMPOSSIBLE_TRAVEL`
**Detection**: Physical distance between scans > max possible travel distance
**Formula**: `distance > (time_diff_hours × 100 km/h + 10km buffer)`
**Risk**: +80 points

### 4. Rapid Rescans
**Signal**: `RAPID_RESCAN`
**Detection**: Multiple scans within 30 seconds
**Risk**: +50 points

### 5. Rate Limit Exceeded
**Signal**: `RATE_LIMIT_EXCEEDED`
**Detection**: >10 scans in 5-minute window
**Risk**: +100 points (CRITICAL)

### 6. Revoked Ticket
**Signal**: `TICKET_REVOKED`
**Detection**: `is_revoked = true`
**Risk**: +100 points (CRITICAL)

### 7. Wrong Event
**Signal**: `WRONG_EVENT`
**Detection**: Event ID in token doesn't match scan location
**Risk**: +90 points

## Risk Levels

| Risk Score | Level      | Action                                      |
|-----------|------------|---------------------------------------------|
| 0-20      | LOW        | Allow entry, standard logging               |
| 21-50     | MEDIUM     | Allow entry, flag for review                |
| 51-79     | HIGH       | Block entry, manual review required         |
| 80-100    | CRITICAL   | Block entry, alert security, log IP/device  |

## Operational Security

### Key Management

**Initial Setup**:
```bash
# Generate a secure signing key
openssl rand -base64 32

# Set in Supabase Dashboard -> Edge Functions -> Secrets
# Secret name: TICKET_SIGNING_SECRET
```

**Key Rotation** (Recommended: Every 90 days):

1. Generate new key:
   ```sql
   INSERT INTO signing_keys (kid, key_hash, algorithm, is_active)
   VALUES ('key-2', encode(sha256('new_secret'), 'hex'), 'HS256', false);
   ```

2. Update Edge Function secret in Supabase Dashboard

3. Activate new key:
   ```sql
   UPDATE signing_keys SET is_active = false WHERE kid = 'key-1';
   UPDATE signing_keys SET is_active = true WHERE kid = 'key-2';
   ```

4. Old tokens remain valid until expiration (backward compatibility via `kid`)

### Row Level Security (RLS)

All tables have RLS policies:

```sql
-- Only authenticated users can read their own tickets
CREATE POLICY "Users can view own tickets"
  ON secure_tickets FOR SELECT
  USING (auth.uid() = current_owner_id);

-- Only service role can insert tickets
CREATE POLICY "Service role can create tickets"
  ON secure_tickets FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Scan logs are append-only
CREATE POLICY "Anyone can insert scan logs"
  ON scan_logs FOR INSERT
  WITH CHECK (true);

-- No one can update or delete scan logs (immutable audit trail)
-- (No UPDATE or DELETE policies)
```

### Environment Variables

Required environment variables in `.env`:

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
TICKET_SIGNING_SECRET=your_256_bit_secret_here
```

Required secrets in Supabase Dashboard:

1. `TICKET_SIGNING_SECRET` - Same as above
2. `SUPABASE_SERVICE_ROLE_KEY` - From Supabase Dashboard -> Settings -> API

## QR Code Integration

### Generating QR Codes

Install QR code library:
```bash
npm install qrcode
```

Example usage:
```typescript
import QRCode from 'qrcode';

// After generating ticket
const qrDataUrl = await QRCode.toDataURL(ticketToken);

// Display in <img> tag
<img src={qrDataUrl} alt="Ticket QR Code" />
```

### Scanning QR Codes

Install scanner library:
```bash
npm install react-qr-reader
```

Example integration in `OrganizerScan.tsx`:
```typescript
import { QrReader } from 'react-qr-reader';

<QrReader
  onResult={(result, error) => {
    if (result) {
      handleScan(result.getText());
    }
  }}
  constraints={{ facingMode: 'environment' }}
/>
```

## Testing

### Unit Tests

Test coverage for validation logic:

```typescript
// tests/validate-scan.test.ts
describe('validate-scan', () => {
  it('should accept valid ticket', async () => {
    const result = await validateScan(validTicketToken);
    expect(result.valid).toBe(true);
    expect(result.risk_level).toBe('LOW');
  });

  it('should reject expired token', async () => {
    const result = await validateScan(expiredToken);
    expect(result.valid).toBe(false);
    expect(result.result).toBe('EXPIRED');
  });

  it('should detect token reuse', async () => {
    await validateScan(token); // First scan
    const result = await validateScan(token); // Replay
    expect(result.fraud_signals).toContain('TOKEN_REUSE');
    expect(result.risk_score).toBeGreaterThan(50);
  });

  it('should detect concurrent scans', async () => {
    const scan1 = validateScan(token, { device: 'A', location: loc1 });
    const scan2 = validateScan(token, { device: 'B', location: loc2 });
    await Promise.all([scan1, scan2]);
    // One should succeed, one should detect concurrent scan
  });

  it('should enforce rate limiting', async () => {
    const scans = Array(11).fill(0).map(() =>
      validateScan(token, { ip: '192.168.1.1' })
    );
    const results = await Promise.all(scans);
    expect(results.some(r => r.result === 'RATE_LIMITED')).toBe(true);
  });
});
```

### Integration Tests

End-to-end happy path:

```typescript
describe('Ticket Lifecycle', () => {
  it('should complete full ticket flow', async () => {
    // 1. Generate ticket
    const ticket = await generateSecureTicket({
      user_id: userId,
      event_id: eventId
    });
    expect(ticket.ticket_token).toBeDefined();

    // 2. Validate at venue
    const scan1 = await validateScan(ticket.ticket_token, {
      event_id: eventId,
      scanner_user_id: organizerId
    });
    expect(scan1.valid).toBe(true);
    expect(scan1.result).toBe('VALID');

    // 3. Try to scan again (should be marked as USED)
    const scan2 = await validateScan(ticket.ticket_token, {
      event_id: eventId,
      scanner_user_id: organizerId
    });
    expect(scan2.valid).toBe(false);
    expect(scan2.result).toBe('ALREADY_USED');
  });
});
```

## Monitoring & Analytics

### Fraud Dashboard

Query fraud signals:
```sql
SELECT
  signal_type,
  COUNT(*) as occurrences,
  AVG(risk_score) as avg_risk
FROM fraud_signals
WHERE detected_at > NOW() - INTERVAL '7 days'
GROUP BY signal_type
ORDER BY occurrences DESC;
```

### Scan Statistics

```sql
SELECT
  DATE(validation_timestamp) as scan_date,
  COUNT(*) as total_scans,
  SUM(CASE WHEN scan_result = 'VALID' THEN 1 ELSE 0 END) as valid_scans,
  SUM(CASE WHEN scan_result = 'FRAUD_DETECTED' THEN 1 ELSE 0 END) as fraud_detected
FROM scan_logs
WHERE event_id = $1
GROUP BY DATE(validation_timestamp);
```

### High-Risk Tickets

```sql
SELECT
  t.ticket_number,
  t.current_owner_id,
  COUNT(fs.id) as fraud_signal_count,
  MAX(sl.risk_score) as max_risk_score
FROM secure_tickets t
LEFT JOIN fraud_signals fs ON fs.ticket_id = t.id
LEFT JOIN scan_logs sl ON sl.ticket_id = t.id
WHERE t.event_id = $1
GROUP BY t.id
HAVING COUNT(fs.id) > 0
ORDER BY max_risk_score DESC;
```

## Troubleshooting

### Common Issues

**Issue**: "Invalid signature" error
**Cause**: `TICKET_SIGNING_SECRET` mismatch between generation and validation
**Solution**: Ensure same secret is set in both Edge Function environments

**Issue**: "Token expired" on valid ticket
**Cause**: Clock skew or incorrect expiration time
**Solution**: Check server time, adjust token TTL in generation function

**Issue**: "Rate limited" for legitimate organizer
**Cause**: Scanning many tickets quickly
**Solution**: Increase rate limit threshold or implement organizer whitelist

**Issue**: False positive "Impossible travel"
**Cause**: GPS accuracy issues or incorrect location data
**Solution**: Increase distance buffer or make location optional

## Security Considerations

### Never Expose
- `TICKET_SIGNING_SECRET` (server-side only)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- Private keys from `signing_keys` table

### Always Use
- HTTPS for all API calls
- Secure WebSocket connections for real-time updates
- Short JWT expiration times (24-48 hours)
- Strong random nonce generation
- Prepared statements / parameterized queries (built-in with Supabase)

### Recommended Practices
- Rotate signing keys every 90 days
- Monitor fraud signals dashboard weekly
- Set up alerts for CRITICAL risk scores
- Regularly review scan logs for anomalies
- Implement IP/device blocking for repeated fraud
- Use geofencing to validate scanner location matches venue

## Future Enhancements

1. **Biometric Validation**: Add photo verification at scan time
2. **Machine Learning**: Train model to detect fraud patterns
3. **Real-time Alerts**: WebSocket notifications for fraud detection
4. **Multi-Factor Authentication**: Require PIN or SMS code for high-value tickets
5. **Blockchain Integration**: Store ticket ownership on distributed ledger
6. **Anonymous Scanning**: Privacy-preserving validation without revealing identity
7. **Dynamic QR Codes**: Rotate QR code every 30 seconds (TOTP-style)

## Support

For issues or questions about the secure ticket system:
- Technical documentation: This file
- Database schema: `supabase/migrations/20251221000000_secure_ticket_system.sql`
- Edge Functions: `supabase/functions/generate-secure-ticket/` and `validate-scan/`
- UI Component: `src/pages/OrganizerScan.tsx`
