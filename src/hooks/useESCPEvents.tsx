import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ESCPEvent {
  id: string;
  ical_uid: string;
  title: string;
  description: string;
  location: string;
  organizer: string;
  category: string;
  url?: string;
  start_date: string;
  end_date: string;
  available_tickets?: number;
  min_price?: number;
  max_price?: number;
}

interface UseESCPEventsOptions {
  onlyWithTickets?: boolean;
  category?: string;
}

export function useESCPEvents(options: UseESCPEventsOptions = {}) {
  const [events, setEvents] = useState<ESCPEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchEvents();
  }, [options.onlyWithTickets, options.category]);

  async function fetchEvents() {
    try {
      setLoading(true);
      setError(null);

      // Use the events table (the only one that exists in the DB)
      const { data, error: err } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true });

      if (err) throw err;

      // Map DB events to ESCPEvent shape
      let mapped: ESCPEvent[] = (data ?? []).map((e) => ({
        id: e.id,
        ical_uid: e.id,
        title: e.title,
        description: e.description ?? '',
        location: e.location,
        organizer: e.university,
        category: e.category,
        start_date: e.date,
        end_date: e.date,
        min_price: e.base_price ?? undefined,
      }));

      if (options.category) {
        mapped = mapped.filter((e) => e.category === options.category);
      }

      setEvents(mapped);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  return {
    events,
    loading,
    error,
    refresh: fetchEvents,
    syncEvents: fetchEvents,
  };
}
