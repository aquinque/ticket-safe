import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface OrganizerProfile {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  org_type: string;
  contact_name: string;
  contact_email: string;
  website: string | null;
  about: string | null;
  logo_url: string | null;
  primary_color: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  rejection_reason: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Returns the current user's organizer profile (if any). */
export function useOrganizer() {
  const { user, loading: authLoading } = useAuth();
  const [organizer, setOrganizer] = useState<OrganizerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) {
      setOrganizer(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("organizer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[useOrganizer] fetch error:", error);
    }
    setOrganizer((data as unknown as OrganizerProfile) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    fetch();
  }, [authLoading, fetch]);

  return { organizer, loading: loading || authLoading, refresh: fetch };
}
