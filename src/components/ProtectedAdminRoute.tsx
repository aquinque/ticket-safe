/**
 * Route-level admin guard.
 *
 * Wraps any /admin/* route so the page only mounts once we've confirmed the
 * signed-in user has role = 'admin' in user_roles. While the check runs we
 * show a quiet full-screen spinner instead of flashing the admin UI; a
 * non-admin is bounced to "/" and an anonymous visitor to "/auth".
 *
 * This is defense-in-depth on top of RLS (which already protects the data):
 * it stops non-admins from ever seeing the admin chrome.
 */

import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const FullScreenSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div
      role="status"
      aria-label="Checking access"
      className="w-8 h-8 rounded-full border-2 border-muted border-t-primary animate-spin"
    />
  </div>
);

const ProtectedAdminRoute = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  // null = still checking, true/false = resolved
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    let active = true;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsAdmin(!!data);
      });
    return () => {
      active = false;
    };
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin === false) navigate("/", { replace: true });
  }, [isAdmin, navigate]);

  if (authLoading || isAdmin === null) return <FullScreenSpinner />;
  if (!isAdmin) return null;

  return <>{children}</>;
};

export default ProtectedAdminRoute;
