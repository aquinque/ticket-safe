import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let authSubscription: { unsubscribe: () => void } | null = null;

    const initAuth = async () => {
      try {
        // Get current session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
        }
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Initialize auth state first
    initAuth();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          
          // Only set loading to false if we're not already loaded
          if (loading) {
            setLoading(false);
          }
        }
      }
    );

    authSubscription = subscription;

    return () => {
      mounted = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    try {
      // scope 'global' revokes the refresh token server-side too, so the user
      // is signed out everywhere — not just this tab.
      await supabase.auth.signOut({ scope: 'global' });
    } catch (error) {
      // Even if the network call fails (e.g. session already invalid), we still
      // clear local state below so the UI never gets stuck "logged in".
      console.error('Error signing out:', error);
    } finally {
      setUser(null);
      setSession(null);
      try {
        // Belt-and-braces: nuke any persisted Supabase auth tokens so a stale
        // session can't be rehydrated on the next page load.
        Object.keys(localStorage)
          .filter((k) => k.startsWith('sb-') && k.includes('-auth-token'))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        /* localStorage may be unavailable — ignore */
      }
    }
  };

  return { user, session, loading, signOut };
};