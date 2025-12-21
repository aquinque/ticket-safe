import { useEffect, useState, useCallback } from 'react';
import { security } from '@/lib/security';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Custom hook for security features
 */
export function useSecurity() {
  const { user } = useAuth();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>('');
  const [isSuspicious, setIsSuspicious] = useState(false);

  // Initialize security on mount
  useEffect(() => {
    // Generate CSRF token
    const token = security.generateCsrfToken();
    security.storeCsrfToken(token);
    setCsrfToken(token);

    // Generate device fingerprint
    const fingerprint = security.generateDeviceFingerprint();
    setDeviceFingerprint(fingerprint);

    // Check for suspicious activity
    const { isSuspicious: suspicious, reasons } = security.detectSuspiciousActivity();
    setIsSuspicious(suspicious);

    if (suspicious) {
      console.warn('Suspicious activity detected:', reasons);
      logSecurityEvent('SUSPICIOUS_ACTIVITY', { reasons });
    }

    // Prevent clickjacking
    security.preventClickjacking();
  }, []);

  // Log security events
  const logSecurityEvent = useCallback(async (eventType: string, metadata: Record<string, unknown> = {}) => {
    if (!user) return;

    try {
      await supabase.from('data_access_log').insert({
        user_id: user.id,
        access_type: eventType,
        resource_type: 'SECURITY_EVENT',
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          device_fingerprint: deviceFingerprint,
        },
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }, [user, deviceFingerprint]);

  // Sanitize user input
  const sanitizeInput = useCallback((input: string, maxLength = 1000) => {
    return security.sanitizeInput(input, maxLength);
  }, []);

  // Validate email
  const validateEmail = useCallback((email: string) => {
    return security.isValidEmail(email);
  }, []);

  // Check password strength
  const checkPasswordStrength = useCallback((password: string) => {
    return security.checkPasswordStrength(password);
  }, []);

  // Rate limit check
  const checkRateLimit = useCallback((key: string, maxAttempts: number, windowMs: number) => {
    return security.rateLimiter.check(key, { maxAttempts, windowMs });
  }, []);

  // Secure API call with CSRF protection
  const secureApiCall = useCallback(async <T,>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const headers = new Headers(options.headers);

    // Add CSRF token
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }

    // Add device fingerprint
    headers.set('X-Device-Fingerprint', deviceFingerprint);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.statusText}`);
    }

    return response.json();
  }, [csrfToken, deviceFingerprint]);

  // Mask sensitive data
  const maskEmail = useCallback((email: string) => {
    return security.maskEmail(email);
  }, []);

  const maskPhone = useCallback((phone: string) => {
    return security.maskPhone(phone);
  }, []);

  // Request privacy data export
  const requestDataExport = useCallback(async () => {
    if (!user) throw new Error('User not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/privacy-request`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_type: 'EXPORT',
        }),
      }
    );

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to export data');
    }

    // Log the export request
    await logSecurityEvent('DATA_EXPORT_REQUESTED');

    return data.export_data;
  }, [user, logSecurityEvent]);

  // Request data deletion
  const requestDataDeletion = useCallback(async (reason?: string) => {
    if (!user) throw new Error('User not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/privacy-request`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_type: 'DELETE',
          reason,
        }),
      }
    );

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to request deletion');
    }

    // Log the deletion request
    await logSecurityEvent('DATA_DELETION_REQUESTED', { reason });

    return data;
  }, [user, logSecurityEvent]);

  return {
    // State
    csrfToken,
    deviceFingerprint,
    isSuspicious,

    // Functions
    sanitizeInput,
    validateEmail,
    checkPasswordStrength,
    checkRateLimit,
    secureApiCall,
    maskEmail,
    maskPhone,
    logSecurityEvent,

    // Privacy
    requestDataExport,
    requestDataDeletion,

    // Security utilities
    security,
  };
}
