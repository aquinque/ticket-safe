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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.onlyWithTickets, options.category]);

  async function fetchEvents() {
    try {
      setLoading(true);
      setError(null);

      // Fetch all active future events
      const { data: eventsData, error: eventsErr } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true });

      if (eventsErr) throw eventsErr;

      // Fetch available ticket counts in one query
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('event_id, selling_price')
        .eq('status', 'available');

      // Build per-event aggregates
      const countMap: Record<string, { count: number; minPrice: number; maxPrice: number }> = {};
      for (const t of ticketData ?? []) {
        if (!countMap[t.event_id]) {
          countMap[t.event_id] = { count: 0, minPrice: Infinity, maxPrice: -Infinity };
        }
        countMap[t.event_id].count++;
        if (t.selling_price < countMap[t.event_id].minPrice) {
          countMap[t.event_id].minPrice = t.selling_price;
        }
        if (t.selling_price > countMap[t.event_id].maxPrice) {
          countMap[t.event_id].maxPrice = t.selling_price;
        }
      }

      // Map and merge
      let mapped: ESCPEvent[] = (eventsData ?? []).map((e) => {
        const counts = countMap[e.id];
        return {
          id: e.id,
          ical_uid: e.external_event_id ?? e.id,
          title: e.title,
          description: e.description ?? '',
          location: e.location ?? '',
          organizer: e.university ?? '',
          category: e.category,
          start_date: e.date,
          end_date: e.date,
          available_tickets: counts?.count ?? 0,
          min_price: counts && counts.minPrice !== Infinity ? counts.minPrice : undefined,
          max_price: counts && counts.maxPrice !== -Infinity ? counts.maxPrice : undefined,
        };
      });

      if (options.onlyWithTickets) {
        mapped = mapped.filter((e) => (e.available_tickets ?? 0) > 0);
      }

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
