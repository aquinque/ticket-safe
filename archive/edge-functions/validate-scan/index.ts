// =====================================================
// SECURE TICKET SCAN VALIDATION
// Server-authoritative validation with fraud detection
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as jose from 'https://deno.land/x/jose@v5.1.3/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidateScanRequest {
  ticket_token: string;
  event_id: string;
  scanner_device_id?: string;
  scanner_location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
  };
  timestamp?: string;
}

interface ValidationResult {
  valid: boolean;
  result: 'VALID' | 'INVALID' | 'ALREADY_USED' | 'WRONG_EVENT' | 'EXPIRED' | 'REVOKED' | 'SUSPECT_FRAUD' | 'RATE_LIMITED';
  message: string;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  fraud_signals: string[];
  ticket_info?: {
    ticket_number: string;
    owner_initials: string;
    seat_info: string | null;
    scan_count: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get scanner user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized scanner');
    }

    const body: ValidateScanRequest = await req.json();
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const fraudSignals: string[] = [];
    let riskScore = 0;

    // ===== RATE LIMITING =====
    const rateLimitKey = `${clientIP}-${body.scanner_device_id || 'unknown'}`;
    const { data: rateLimit } = await supabase
      .from('rate_limit_tracking')
      .select('*')
      .eq('identifier_type', 'IP_DEVICE')
      .eq('identifier_value', rateLimitKey)
      .eq('action_type', 'SCAN')
      .single();

    if (rateLimit) {
      const windowStart = new Date(rateLimit.window_start);
      const now = new Date();
      const windowDuration = 60 * 1000; // 1 minute

      if (now.getTime() - windowStart.getTime() < windowDuration) {
        if (rateLimit.attempt_count > 10) {
          // Too many scans in short time
          await supabase.from('rate_limit_tracking').update({
            is_blocked: true,
            blocked_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            attempt_count: rateLimit.attempt_count + 1,
          }).eq('id', rateLimit.id);

          return createResponse({
            valid: false,
            result: 'RATE_LIMITED',
            message: 'Too many scan attempts. Please wait 5 minutes.',
            risk_score: 100,
            risk_level: 'CRITICAL',
            fraud_signals: ['RATE_LIMIT_EXCEEDED'],
          });
        }

        // Update count
        await supabase.from('rate_limit_tracking').update({
          attempt_count: rateLimit.attempt_count + 1,
        }).eq('id', rateLimit.id);
      } else {
        // Reset window
        await supabase.from('rate_limit_tracking').update({
          attempt_count: 1,
          window_start: now.toISOString(),
        }).eq('id', rateLimit.id);
      }
    } else {
      // Create new rate limit entry
      await supabase.from('rate_limit_tracking').insert({
        identifier_type: 'IP_DEVICE',
        identifier_value: rateLimitKey,
        action_type: 'SCAN',
        attempt_count: 1,
        window_start: new Date().toISOString(),
      });
    }

    // ===== TOKEN VALIDATION =====
    let tokenPayload: jose.JWTPayload;
    let signatureValid = false;
    let tokenExpired = false;

    try {
      const secret = new TextEncoder().encode(Deno.env.get('TICKET_SIGNING_SECRET')!);

      // Verify JWT
      const { payload, protectedHeader } = await jose.jwtVerify(body.ticket_token, secret, {
        issuer: 'ticket-safe',
        audience: 'ticket-safe-scanner',
      });

      tokenPayload = payload;
      signatureValid = true;

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        tokenExpired = true;
        fraudSignals.push('TOKEN_EXPIRED');
        riskScore += 30;
      }
    } catch (error) {
      console.error('[TOKEN_VALIDATION_FAILED]', error.message);
      fraudSignals.push('INVALID_SIGNATURE');
      riskScore += 50;

      return createResponse({
        valid: false,
        result: 'INVALID',
        message: 'Invalid ticket signature',
        risk_score: 50,
        risk_level: 'HIGH',
        fraud_signals: ['INVALID_SIGNATURE'],
      });
    }

    if (tokenExpired) {
      return createResponse({
        valid: false,
        result: 'EXPIRED',
        message: 'Ticket has expired',
        risk_score: riskScore,
        risk_level: 'MEDIUM',
        fraud_signals,
      });
    }

    // ===== DATABASE VALIDATION =====
    const { data: ticket, error: ticketError } = await supabase
      .from('secure_tickets')
      .select(`
        *,
        events:event_id (
          id,
          title,
          date,
          location
        )
      `)
      .eq('id', tokenPayload.ticket_id)
      .single();

    if (ticketError || !ticket) {
      fraudSignals.push('TICKET_NOT_FOUND');
      return createResponse({
        valid: false,
        result: 'INVALID',
        message: 'Ticket not found in database',
        risk_score: 80,
        risk_level: 'HIGH',
        fraud_signals,
      });
    }

    // ===== FRAUD DETECTION =====

    // Check 1: Event mismatch
    if (ticket.event_id !== body.event_id) {
      fraudSignals.push('WRONG_EVENT');
      riskScore += 40;

      await logFraudSignal(supabase, {
        ticket_id: ticket.id,
        event_id: body.event_id,
        user_id: user.id,
        signal_type: 'WRONG_EVENT',
        severity: 'HIGH',
        description: `Ticket for event ${ticket.event_id} scanned at event ${body.event_id}`,
        device_id: body.scanner_device_id,
        ip_address: clientIP,
      });

      return createResponse({
        valid: false,
        result: 'WRONG_EVENT',
        message: 'This ticket is for a different event',
        risk_score: riskScore,
        risk_level: 'HIGH',
        fraud_signals,
      });
    }

    // Check 2: Ticket status
    if (ticket.status === 'REVOKED' || ticket.is_revoked) {
      fraudSignals.push('TICKET_REVOKED');
      return createResponse({
        valid: false,
        result: 'REVOKED',
        message: `Ticket revoked: ${ticket.revoke_reason || 'No reason provided'}`,
        risk_score: 90,
        risk_level: 'CRITICAL',
        fraud_signals,
      });
    }

    if (ticket.status === 'USED') {
      fraudSignals.push('ALREADY_USED');

      return createResponse({
        valid: false,
        result: 'ALREADY_USED',
        message: 'Ticket has already been scanned and used',
        risk_score: 60,
        risk_level: 'MEDIUM',
        fraud_signals,
        ticket_info: {
          ticket_number: ticket.ticket_number,
          owner_initials: getInitials(ticket.current_owner_id),
          seat_info: getSeatInfo(ticket),
          scan_count: ticket.scan_count,
        },
      });
    }

    // Check 3: Version/nonce mismatch (token replay attack)
    if (tokenPayload.version !== ticket.version || tokenPayload.nonce !== ticket.nonce) {
      fraudSignals.push('TOKEN_REUSE');
      riskScore += 70;

      await logFraudSignal(supabase, {
        ticket_id: ticket.id,
        event_id: ticket.event_id,
        user_id: user.id,
        signal_type: 'TOKEN_REUSE',
        severity: 'CRITICAL',
        description: `Token version/nonce mismatch. Expected v${ticket.version}/${ticket.nonce}, got v${tokenPayload.version}/${tokenPayload.nonce}`,
        device_id: body.scanner_device_id,
        ip_address: clientIP,
      });

      return createResponse({
        valid: false,
        result: 'SUSPECT_FRAUD',
        message: 'Ticket token appears to be reused or manipulated',
        risk_score: riskScore,
        risk_level: 'CRITICAL',
        fraud_signals,
      });
    }

    // Check 4: Concurrent scans (check last 2 minutes)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const { data: recentScans } = await supabase
      .from('scan_logs')
      .select('*')
      .eq('ticket_id', ticket.id)
      .gte('validation_timestamp', twoMinutesAgo.toISOString())
      .neq('scanner_device_id', body.scanner_device_id || '');

    if (recentScans && recentScans.length > 0) {
      fraudSignals.push('CONCURRENT_SCAN');
      riskScore += 60;

      await logFraudSignal(supabase, {
        ticket_id: ticket.id,
        event_id: ticket.event_id,
        signal_type: 'CONCURRENT_SCAN',
        severity: 'CRITICAL',
        description: `Ticket scanned on ${recentScans.length} different device(s) within 2 minutes`,
        device_id: body.scanner_device_id,
        ip_address: clientIP,
        metadata: { recent_scans: recentScans.length },
      });
    }

    // Check 5: Rapid rescan (same device, < 10 seconds)
    if (ticket.last_scanned_at) {
      const lastScan = new Date(ticket.last_scanned_at);
      const timeSinceLastScan = Date.now() - lastScan.getTime();

      if (timeSinceLastScan < 10000) {
        fraudSignals.push('RAPID_RESCAN');
        riskScore += 20; // Not always fraud, could be accidental
      }
    }

    // Check 6: Impossible travel (if location provided)
    if (body.scanner_location && ticket.last_scanned_at && recentScans && recentScans.length > 0) {
      const lastScanWithLocation = recentScans.find(s => s.scan_latitude && s.scan_longitude);

      if (lastScanWithLocation) {
        const distance = calculateDistance(
          lastScanWithLocation.scan_latitude,
          lastScanWithLocation.scan_longitude,
          body.scanner_location.latitude!,
          body.scanner_location.longitude!
        );

        const timeElapsed = Date.now() - new Date(lastScanWithLocation.validation_timestamp).getTime();
        const maxPossibleSpeed = 100; // km/h (generous allowance)
        const maxDistance = (timeElapsed / (1000 * 60 * 60)) * maxPossibleSpeed;

        if (distance > maxDistance) {
          fraudSignals.push('IMPOSSIBLE_TRAVEL');
          riskScore += 80;

          await logFraudSignal(supabase, {
            ticket_id: ticket.id,
            event_id: ticket.event_id,
            signal_type: 'IMPOSSIBLE_TRAVEL',
            severity: 'CRITICAL',
            description: `Travel of ${distance.toFixed(1)}km in ${(timeElapsed / 60000).toFixed(1)} minutes is impossible`,
            metadata: { distance_km: distance, time_minutes: timeElapsed / 60000 },
          });
        }
      }
    }

    // Check 7: Excessive transfers
    if (ticket.transfer_count > 5) {
      fraudSignals.push('EXCESSIVE_TRANSFERS');
      riskScore += 30;
    }

    // ===== DETERMINE RISK LEVEL =====
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (riskScore >= 80) riskLevel = 'CRITICAL';
    else if (riskScore >= 50) riskLevel = 'HIGH';
    else if (riskScore >= 25) riskLevel = 'MEDIUM';

    // If high risk, don't mark as used yet - require manual review
    if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      await logScan(supabase, {
        ticket_id: ticket.id,
        event_id: ticket.event_id,
        scanned_by_user_id: user.id,
        scanner_device_id: body.scanner_device_id,
        scanner_ip_address: clientIP,
        scanner_user_agent: userAgent,
        scan_latitude: body.scanner_location?.latitude,
        scan_longitude: body.scanner_location?.longitude,
        scan_location_name: body.scanner_location?.name,
        scan_result: 'SUSPECT_FRAUD',
        risk_score: riskScore,
        risk_level: riskLevel,
        fraud_signals: fraudSignals,
        token_valid: signatureValid,
        token_expired: tokenExpired,
        signature_valid: signatureValid,
        response_time_ms: Date.now() - startTime,
      });

      return createResponse({
        valid: false,
        result: 'SUSPECT_FRAUD',
        message: 'Ticket flagged for suspicious activity. Manual verification required.',
        risk_score: riskScore,
        risk_level: riskLevel,
        fraud_signals,
        ticket_info: {
          ticket_number: ticket.ticket_number,
          owner_initials: getInitials(ticket.current_owner_id),
          seat_info: getSeatInfo(ticket),
          scan_count: ticket.scan_count,
        },
      });
    }

    // ===== VALID SCAN - MARK AS USED =====
    const { error: updateError } = await supabase
      .from('secure_tickets')
      .update({
        status: 'USED',
        first_scanned_at: ticket.first_scanned_at || new Date().toISOString(),
        last_scanned_at: new Date().toISOString(),
        scan_count: ticket.scan_count + 1,
      })
      .eq('id', ticket.id)
      .eq('version', ticket.version); // Optimistic locking

    if (updateError) {
      // Concurrent update detected
      fraudSignals.push('CONCURRENT_UPDATE');
      riskScore = 90;

      await logFraudSignal(supabase, {
        ticket_id: ticket.id,
        event_id: ticket.event_id,
        signal_type: 'CONCURRENT_SCAN',
        severity: 'CRITICAL',
        description: 'Concurrent ticket update detected during scan validation',
      });

      return createResponse({
        valid: false,
        result: 'SUSPECT_FRAUD',
        message: 'Concurrent scan detected. Ticket may have been scanned elsewhere.',
        risk_score: riskScore,
        risk_level: 'CRITICAL',
        fraud_signals,
      });
    }

    // Log successful scan
    await logScan(supabase, {
      ticket_id: ticket.id,
      event_id: ticket.event_id,
      scanned_by_user_id: user.id,
      scanner_device_id: body.scanner_device_id,
      scanner_ip_address: clientIP,
      scanner_user_agent: userAgent,
      scan_latitude: body.scanner_location?.latitude,
      scan_longitude: body.scanner_location?.longitude,
      scan_location_name: body.scanner_location?.name,
      scan_result: 'VALID',
      risk_score: riskScore,
      risk_level: riskLevel,
      fraud_signals: fraudSignals,
      token_valid: signatureValid,
      token_expired: tokenExpired,
      signature_valid: signatureValid,
      response_time_ms: Date.now() - startTime,
    });

    console.log(`[VALID_SCAN] Ticket ${ticket.ticket_number} scanned successfully`);

    return createResponse({
      valid: true,
      result: 'VALID',
      message: 'Ticket validated successfully. Entry granted.',
      risk_score: riskScore,
      risk_level: riskLevel,
      fraud_signals: fraudSignals,
      ticket_info: {
        ticket_number: ticket.ticket_number,
        owner_initials: getInitials(ticket.current_owner_id),
        seat_info: getSeatInfo(ticket),
        scan_count: ticket.scan_count + 1,
      },
    });
  } catch (error) {
    console.error('[VALIDATION_ERROR]', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

// ===== HELPER FUNCTIONS =====

function createResponse(result: ValidationResult) {
  return new Response(
    JSON.stringify({
      success: result.valid,
      ...result,
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    }
  );
}

async function logScan(supabase: ReturnType<typeof createClient>, data: Record<string, unknown>) {
  await supabase.from('scan_logs').insert(data);
}

async function logFraudSignal(supabase: ReturnType<typeof createClient>, data: Record<string, unknown>) {
  await supabase.from('fraud_signals').insert(data);
}

function getInitials(userId: string): string {
  // In production, fetch from users table
  return 'U.N.';
}

function getSeatInfo(ticket: Record<string, unknown>): string | null {
  if (ticket.seat_section && ticket.seat_row && ticket.seat_number) {
    return `${ticket.seat_section}-${ticket.seat_row}${ticket.seat_number}`;
  }
  return null;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
