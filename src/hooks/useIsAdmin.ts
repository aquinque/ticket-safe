import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether the signed-in account has the admin role (user_roles). Only decides whether to show
 * the Admin button: the admin pages and their data are protected by ProtectedAdminRoute and RLS.
 * One query per account per page load, shared by every header that asks.
 */
const cache = new Map<string, Promise<boolean>>();

export function useIsAdmin(): boolean {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    let active = true;
    let check = cache.get(user.id);
    if (!check) {
      check = Promise.resolve(
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ).then(({ data }) => !!data, () => false);
      cache.set(user.id, check);
    }
    check.then((v) => { if (active) setIsAdmin(v); });
    return () => { active = false; };
  }, [user]);
  return isAdmin;
}
