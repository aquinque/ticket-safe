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
  onlyWithTickets?: boolean; // If true, only show events with available tickets
  category?: string;
}

export function useESCPEvents(options: UseESCPEventsOptions = {}) {
  const [events, setEvents] = useState<ESCPEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchEvents();

    // Set up real-time subscription
    const channel = supabase
      .channel('escp_events_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'escp_events',
        },
        () => {
          fetchEvents();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_listings',
        },
        () => {
          fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [options.onlyWithTickets, options.category]);

  async function fetchEvents() {
    try {
      setLoading(true);
      setError(null);

      if (options.onlyWithTickets) {
        // Use the function that only returns events with available tickets
        const { data, error: err } = await supabase.rpc('get_events_with_tickets');

        if (err) throw err;

        let filteredEvents = data || [];

        // Apply category filter if specified
        if (options.category) {
          filteredEvents = filteredEvents.filter(
            (e: ESCPEvent) => e.category === options.category
          );
        }

        setEvents(filteredEvents);
      } else {
        // Get all active future events
        let query = supabase
          .from('escp_events')
          .select(`
            id,
            ical_uid,
            title,
            description,
            location,
            organizer,
            category,
            url,
            start_date,
            end_date
          `)
          .eq('is_active', true)
          .gt('start_date', new Date().toISOString())
          .order('start_date', { ascending: true });

        if (options.category) {
          query = query.eq('category', options.category);
        }

        const { data, error: err } = await query;

        if (err) throw err;

        setEvents(data || []);
      }
    } catch (err) {
      console.error('Error fetching ESCP events:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  async function syncEvents() {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-escp-events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to sync events');
      }

      const result = await response.json();

      // Refresh events after sync
      await fetchEvents();

      return result;
    } catch (err) {
      console.error('Error syncing events:', err);
      throw err;
    }
  }

  return {
    events,
    loading,
    error,
    refresh: fetchEvents,
    syncEvents,
  };
}
