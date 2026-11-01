import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// One answer per signed-in account for the whole session: the header mounts on every page.
const cache = new Map<string, boolean>();

/** True when the signed-in account accepted at least one promoter invitation (see is_promoter()). */
export function useIsPromoter(): boolean {
  const { user } = useAuth();
  const userId = user?.id;
  const [isPromoter, setIsPromoter] = useState<boolean>(userId ? cache.get(userId) === true : false);

  useEffect(() => {
    if (!userId) {
      setIsPromoter(false);
      return;
    }
    if (cache.has(userId)) {
      setIsPromoter(cache.get(userId) === true);
      return;
    }
    let cancelled = false;
    // The generated Supabase types predate this function.
    (supabase as unknown as { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> })
      .rpc("is_promoter")
      .then(({ data, error }) => {
        if (cancelled || error) return;
        cache.set(userId, data === true);
        setIsPromoter(data === true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return isPromoter;
}

/** Call after accepting an invitation so the header shows the entry straight away. */
export const markPromoter = (userId: string): void => {
  cache.set(userId, true);
};
