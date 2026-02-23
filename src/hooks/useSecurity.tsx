import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface SecurityEvent {
  id: string;
  access_type: string;
  resource_type: string;
  timestamp: string;
}

export function useSecurity() {
  const { user } = useAuth();
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const logSecurityEvent = useCallback(async (eventType: string, metadata: Record<string, unknown> = {}) => {
    if (!user) return;

    try {
      // Log to access_audit_log which exists in the DB
      await supabase.from('access_audit_log').insert({
        user_id: user.id,
        function_name: eventType,
        access_granted: true,
        resource_id: (metadata.resource_id as string) ?? null,
      } as any);
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }, [user]);

  const fetchSecurityEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('access_audit_log')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      setSecurityEvents((data ?? []).map((d: any) => ({
        id: d.id,
        access_type: d.function_name,
        resource_type: 'security',
        timestamp: d.created_at,
      })));
    } catch (error) {
      console.error('Error fetching security events:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchSecurityEvents();
  }, [user, fetchSecurityEvents]);

  return {
    securityEvents,
    loading,
    logSecurityEvent,
    fetchSecurityEvents,
  };
}
