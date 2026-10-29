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
  siren: string | null;
  rna_number: string | null;
  billing_address_line1: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
}

/** Returns the current user's organizer profile (if any). */
export function useOrganizer() {
  const { user, loading: authLoading } = useAuth();
  const [organizer, setOrganizer] = useState<OrganizerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Key on the id, not the object: Supabase hands out a fresh `user` object on
  // every tab refocus / token refresh, which used to refetch and flip `loading`
  // back on. StudioAccessGate then swapped the page for a spinner and wiped
  // whatever the organizer had typed.
  const userId = user?.id;

  const fetch = useCallback(async () => {
    if (!userId) {
      setOrganizer(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("organizer_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      // Keep the organizer we already have rather than wiping it on a network blip.
      console.error("[useOrganizer] fetch error:", error);
    } else {
      setOrganizer((data as unknown as OrganizerProfile) ?? null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    fetch();
  }, [authLoading, fetch]);

  return { organizer, loading: loading || authLoading, refresh: fetch };
}
